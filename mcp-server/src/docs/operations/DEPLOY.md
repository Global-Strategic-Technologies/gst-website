# MCP Server Deploy Runbook

> **Audience**: operator running the live Worker (staging `gst-mcp-staging`, production `gst-mcp`) + future maintainer.
>
> **How to use this doc**: it is an ongoing-operations runbook. Code reaches the Worker through CI only ([§ How code reaches the Worker](#how-code-reaches-the-worker)); what an operator does by hand is bind secrets, rotate credentials, smoke-test, roll back and triage.
>
> - **Infrastructure reference** (Upstash token rotation and ACL users, Inoreader credentials, Analytics Engine datasets, the website's radar key) → **Part A**
> - **Smoke-testing a deploy** → **§ B.3**
> - **An op task** (add/rotate/revoke a key, roll back, Inoreader recovery, migrate client records, AE queries) → **Part C**
> - **Investigating an incident?** Jump straight to **§ C.4 — Tail and investigate** or **§ C.6 — Incident triage tree**
>
> The one-time first-rollout playbook (Cloudflare account and DNS setup, database provisioning, the 2026 staging → soak → production rollout, the BL-041 ACL migration and the legacy-DB decommission) is archived at [`_archive/DEPLOY_INITIAL_ROLLOUT_BL-032.md`](./_archive/DEPLOY_INITIAL_ROLLOUT_BL-032.md). Section numbers here keep their original values, so gaps (A.1, A.2, B.1, …) are sections that moved there.
>
> **Companion docs** (this doc cross-references them at the right moments — you don't need to read them ahead of time, just follow the links when they appear):
>
> - [`AUTH.md`](./AUTH.md) — bearer-token model, key issuance/rotation/revocation commands
> - [`REMOTE_CLIENT_SETUP.md`](./REMOTE_CLIENT_SETUP.md) — what team-members do to connect their Claude / Cursor / etc. clients
> - [`RATE_LIMITS.md`](./RATE_LIMITS.md) — per-key budgets, RateLimit response headers, circuit-breaker semantics
> - [`SENTRY_MANUAL_SETUP.md` § MCP Worker](../../../../src/docs/development/SENTRY_MANUAL_SETUP.md) — Sentry project setup specifics
> - [`ARCHITECTURE.md`](../ARCHITECTURE.md) — the maintained architecture reference (Q1–Q13 initiative history archived at `src/docs/development/_archive/MCP_SERVER_REMOTE_BL-032.md`)

---

## Two things called "environment" — read this once

This doc, `wrangler.toml` and the GitHub Actions workflows all use the word "environment" for **two unrelated systems**. Confusing them costs an hour, so:

|             | **Cloudflare Worker environment**                                         | **GitHub Actions Environment**                                        |
| ----------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Declared in | `mcp-server/wrangler.toml` — `[env.staging]`, `[env.production]`          | GitHub → Settings → Environments                                      |
| Answers     | _"deploy to WHICH Worker?"_ — script name, KV, R2, Queues, vars, triggers | _"WHICH JOBS may read WHICH secrets?"_ — plus optional approval gates |
| Selected by | `wrangler deploy --env staging`                                           | `environment:` on a workflow **job**                                  |
| staging     | `[env.staging]` → `gst-mcp-staging`                                       | `mcp-staging` — no protection rules                                   |
| production  | `[env.production]` → `gst-mcp`                                            | `mcp-production` — required reviewer                                  |

**They are independent.** A job can deploy to the Cloudflare staging Worker while binding no GitHub Environment at all — which is exactly what staging did until BL-111, and why its deploy token sat at repository level readable by every job in the repo.

Rule of thumb: **`wrangler.toml` decides where code goes; the `environment:` key decides who holds the keys.**

(`Preview` and `Production` in the GitHub Environments list are **Vercel's**, for the website. A third use of the word, unrelated to the Worker.)

---

## How code reaches the Worker

Every code deploy goes through CI. Never deploy Worker code by hand.

| Target     | Workflow                                                                               | Trigger                                                                                                                                              |
| ---------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staging    | [`deploy-mcp-staging.yml`](../../../../.github/workflows/deploy-mcp-staging.yml)       | `workflow_run` after a green **MCP Server Test Suite** from a same-repo `push` (fork `pull_request` runs are refused — BL-111)                       |
| Production | [`deploy-mcp-production.yml`](../../../../.github/workflows/deploy-mcp-production.yml) | Push to `master` touching Worker paths; waits for the `mcp-production` GitHub Environment approval; latest-wins concurrency                          |
| Rollback   | [`rollback-mcp.yml`](../../../../.github/workflows/rollback-mcp.yml)                   | Manual `workflow_dispatch` (env, Cloudflare version ID, target SHA, reason); production binds `mcp-production-rollback` — see [§ C.3](#c3--rollback) |

Each deploy workflow runs `scripts/deploy.mjs` (injects `GIT_SHA`, so `/health` reports the deployed commit) and then a smoke probe. The `npm run deploy:staging` / `deploy:production` scripts are **break-glass only** — for when CI itself is down — and a production break-glass deploy skips the approval gate and the test verification the workflow enforces.

**Secrets are the one thing an operator binds by hand**, and they need no deploy: `wrangler secret put` and `wrangler secret delete` each create a new Worker version and deploy it immediately ([Cloudflare docs](https://developers.cloudflare.com/workers/configuration/secrets/)). After a `secret put` / `delete`, verify `/health`; there is no "redeploy to refresh the binding" step. The exception is while a rollback is live: see [§ C.3 While rolled back](#while-rolled-back--secrets-are-locked). The authoritative secret list is [`SECRETS_INVENTORY.md`](../../../../src/docs/operations/SECRETS_INVENTORY.md).

---

# Part A — Infrastructure reference

## A.3 Reference — rotating the MCP-DB token

The MCP DB (`gst-mcp` on Upstash) was provisioned once during the initial rollout ([archived § A.3](./_archive/DEPLOY_INITIAL_ROLLOUT_BL-032.md#a3--upstash--provision-the-mcp-database)). Its URL and tokens are the Worker secrets `UPSTASH_MCP_REST_URL` / `UPSTASH_MCP_REST_TOKEN` (see [`SECRETS_INVENTORY.md`](../../../../src/docs/operations/SECRETS_INVENTORY.md)); the Worker binds the scoped `mcp-worker-rw` token from § A.3.5, and the default admin token is break-glass only.

If the admin (Standard) token is ever compromised, regenerate it from the Upstash console:

1. Upstash console → MCP DB → **Details** → **REST API** → click **Regenerate** next to the Standard token
2. Confirm the prompt; the old token dies immediately
3. If the admin token is what the Worker currently binds (it should not be — see § A.3.5), update the Wrangler secret with the new value. Each `secret put` deploys a new Worker version immediately; verify `/health` afterwards:
   ```bash
   cd mcp-server
   npx wrangler secret put UPSTASH_MCP_REST_TOKEN --env staging
   npx wrangler secret put UPSTASH_MCP_REST_TOKEN --env production
   ```
4. Update your password manager with the new value + rotation date

---

## A.3.5 — Upstash ACL hardening (BL-041)

> **Audience**: operator maintaining the Upstash MCP DB's per-purpose ACL users + scoped REST tokens. The one-time migration that moved the Worker off the default admin token (Phases 1–4) is archived at [`_archive/DEPLOY_INITIAL_ROLLOUT_BL-032.md` § A.3.5](./_archive/DEPLOY_INITIAL_ROLLOUT_BL-032.md#a35--upstash-acl-hardening-bl-041--migration-steps); what stays here is the reference and the recurring procedures.

### Why

The default `UPSTASH_MCP_REST_TOKEN` (minted when the database was provisioned) is bound to Upstash's `default` user with **full admin permissions on the entire keyspace**. A leak gives an attacker `FLUSHDB`, `CONFIG SET`, `SCRIPT FLUSH`, `KEYS *`, and access to every key — not just our `mcp:*` namespace. The Worker only needs read+write on `mcp:*`. Closing this gap before [BL-033](../../../../src/docs/development/BACKLOG.md#bl-033-mcp-server--external-pilot-phase-3) broadens the operator pool means access-control is settled before stakes rise.

### The ACL strings

Two scoped users matching Upstash's documented ACL pattern (broad categories + targeted exclusions). Verified empirically 2026-05-30 against the live `gst-mcp` console — `ACL CAT` confirms `scripting` IS a supported category name; earlier `'unknown command or category name'` errors traced to **trailing whitespace** in the modifier token (Upstash's parser is whitespace-sensitive at modifier boundaries).

> **Upstash deviation from standard Redis**: do NOT include a `>password` clause in `ACL SETUSER`. Upstash auto-generates a password and displays it after user creation. Passing `>somepassword` either silently ignores the clause OR puts the user in an inconsistent state — operator observed both behaviours against the live `gst-mcp` console 2026-05-30.

```
ACL SETUSER mcp-worker-rw on ~mcp:* ~"" +@read +@write +@scripting -@dangerous
ACL SETUSER mcp-readonly-ops on ~mcp:* +@read -@dangerous
```

**Why `~""` on `mcp-worker-rw`** (verified empirically 2026-05-30): `@upstash/ratelimit` v2.x `slidingWindow` (used by `mcp-server/src/ratelimit/limiter.ts:84`) passes THREE keys to its EVAL script — `[currentKey, previousKey, dynamicLimitKey]`. When `dynamicLimits` is disabled (our setup; default), `dynamicLimitKey` is the **empty string** `""` — a sentinel the script body checks for `if dynamicLimitKey ~= "" then ... end`. Redis ACL validates EVERY key in `KEYS[]` against the user's keyspace patterns BEFORE the script runs. The empty string doesn't match `~mcp:*` → `NOPERM this user has no permissions to access one of the keys used as arguments`. Adding `~""` explicitly permits the empty-key sentinel; the only real key the SDK accesses is still `<prefix>:<window>` which matches `~mcp:*`. `mcp-readonly-ops` doesn't need `~""` because operator-side reads don't go through ratelimit's EVAL surface.

**Category rationale** — keep the grant surface as narrow as the Worker actually needs. Do **NOT** add `+@admin`, `+@keyspace`, or `+@all`; each would reopen the very gap this section closes.

| Clause        | Why we need it                                                                                                                                                                                                                                                                                                                 | What it grants (mcp-worker-rw)                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `~mcp:* ~""`  | Restricts keyspace to `mcp:*` (the only namespace the Worker writes — verified across `mcp-server/src/**`) PLUS the empty-string sentinel `""` (required by `@upstash/ratelimit` v2 `slidingWindow` — see "Why `~""`" callout below). A leaked token cannot touch any future non-MCP key.                                      | Keys matching `mcp:*` plus the empty-string sentinel                 |
| `+@read`      | Cron day-counter GET; `/health` cached-status reads; circuit-breaker `GET`+`TTL`; ratelimit window reads (`ZCARD`)                                                                                                                                                                                                             | `GET`, `MGET`, `TTL`, `EXISTS`, `ZCARD`, `ZRANGE`, `STRLEN`          |
| `+@write`     | Every Worker write — counters, locks, status, cache, token-store. Implicitly covers `@string` and `@sortedset` for writes (commands carry both type-tags AND read/write-tags; granting `+@write` permits every write command regardless of type — no need to add `+@string` or `+@sortedset`).                                 | `SET`, `DEL`, `INCR`, `INCRBY`, `EXPIRE`, `ZADD`, `ZREMRANGEBYSCORE` |
| `+@scripting` | `@upstash/ratelimit` `slidingWindow` round-trips through `EVALSHA` (steady state) with NOSCRIPT fallback to `SCRIPT LOAD` + `EVAL`. Without `+@scripting`, the rate limiter silently fail-opens (its catch returns `null` on Upstash errors). `-@dangerous` (next row) strips `SCRIPT FLUSH`.                                  | `EVAL`, `EVALSHA`, `SCRIPT LOAD`, `SCRIPT EXISTS`                    |
| `-@dangerous` | Strips the substrate-dangerous commands an admin token would grant: `FLUSHDB`, `FLUSHALL`, `CONFIG SET`, `KEYS`, `SCRIPT FLUSH`. **Must come last** to override prior `+@<cat>` grants. (Upstash also strips `DEBUG`/`CLUSTER`/`SHUTDOWN` at the platform level — those return "Command is not available" rather than NOPERM.) | Removes the dangerous subset from any category above                 |

> **Upstash ACL parser limits** (verified 2026-05-30 against `gst-mcp` via `ACL CAT` + experiments):
>
> - Subcommand grants like `+script|load` → not recognized (`'|' is not supported`)
> - **Trailing whitespace on the last modifier breaks parsing** — `'+@scripting '` with a trailing space is rejected as "unknown command or category name". Always verify cursor position is at the immediate end of the string (no trailing space, newline, or invisible char) before clicking Create.
> - Categories supported (full list from `ACL CAT`): `read, list, pubsub, hyperloglog, search, connection, all, string, bitmap, json, stream, write, dangerous, set, sortedset, hash, scripting, admin, keyspace, blocking, geo, transaction`
> - The `~<keypattern>` clause is REQUIRED — omit it and the user is created with NO keyspace access (every key-touching command returns NOPERM "no permissions to access one of the keys").

### Scoped-token rotation (annual or after suspected leak)

Distinct from the admin-token rotation in [§ A.3 Reference](#a3-reference--rotating-the-mcp-db-token):

1. Upstash console → CLI tab → `ACL RESTTOKEN mcp-worker-rw <PWD_A>` (yes, the same password — the command re-mints a fresh REST token; the old one is invalidated server-side). `PWD_A` is in 1Password under "Upstash gst-mcp ACL — mcp-worker-rw"
2. Update 1Password with the new token + rotation date
3. **Verify the token locally before binding it** (positive surface + negative surface + `@upstash/ratelimit` round-trip):
   ```powershell
   cd c:\Code\gst-website\mcp-server
   $env:UPSTASH_TEST_URL   = 'https://<db>.upstash.io'          # the UPSTASH_MCP_REST_URL value
   $env:UPSTASH_TEST_TOKEN = '<paste mcp-worker-rw REST token>'
   .\scripts\Test-UpstashAcl.ps1
   ```
   Exit code 0 means every Worker command path passed AND `FLUSHDB`/`CONFIG GET`/`KEYS *`/etc. returned NOPERM. **If anything fails, do not bind the token** — compare the ACL string to the Category rationale table above.
4. **Rotate staging first**. `secret put` deploys a new Worker version immediately — no redeploy:
   ```powershell
   npx wrangler secret put UPSTASH_MCP_REST_TOKEN --env staging
   # paste the mcp-worker-rw REST token; never inline it on the CLI
   curl.exe -s https://mcp-staging.globalstrategic.tech/health | ConvertFrom-Json |
     Select-Object upstashMcp, aclSelfCheck
   ```
   Expect `upstashMcp: 'ok'` AND `aclSelfCheck.status: 'ok'` (`aclSelfCheck` is set in the background by the first request after the new version goes live — give it a few seconds, then re-probe). Then run the integration suite against staging: `$env:MCP_URL = 'https://mcp-staging.globalstrategic.tech'; .\scripts\Test-Bl0325.ps1`.
5. **Production**: repeat step 4 with `--env production` and `https://mcp.globalstrategic.tech`.

### Rollback

If a newly bound token breaks the Worker (`upstashMcp: 'degraded'` or `aclSelfCheck` not `ok`), re-put a known-good token — it takes effect immediately, because `secret put` deploys a new version — and verify `/health`. Re-minting invalidates the previous scoped token, so the known-good fallback is the default admin token (kept in 1Password as break-glass):

```powershell
npx wrangler secret put UPSTASH_MCP_REST_TOKEN --env staging   # or production; paste the admin token from 1Password
curl.exe -s https://mcp-staging.globalstrategic.tech/health | ConvertFrom-Json |
  Select-Object upstashMcp, aclSelfCheck
```

The default admin token never gets revoked in Upstash — it stays as the break-glass credential. Once the scoped token is fixed and verified (step 3 above), re-bind it.

### Using `mcp-readonly-ops`

The readonly user is operator-only — no Worker binding. Use it from `redis-cli` (TLS) or the Upstash console CLI tab for incident triage:

- Inspect `mcp:inoreader:*` to debug OAuth state without risking a mutation
- Inspect `mcp:radar:cache:*` to confirm a Cron firing landed
- Inspect `mcp:ratelimit:*` / `mcp:circuit:*` to debug a rate-limit incident

Connection string + credentials live in 1Password under "Upstash gst-mcp — mcp-readonly-ops".

### Account-level MFA (defense in depth)

Even with scoped tokens on the data plane, an attacker who phishes the operator's Upstash account login can mint a new admin token. Two layers:

1. **Upstream SSO MFA** — log into the upstream auth provider (GitHub / Google) and confirm MFA is enforced organization-wide.
2. **Upstash account TOTP** — Upstash supports a 2FA setting in account preferences independent of SSO. **Enable this too** — covers the case where someone bypasses SSO via Upstash's email/password fallback.

Record both checks in [`SECRETS_INVENTORY.md`](../../../../src/docs/operations/SECRETS_INVENTORY.md) → Upstash ACL users subsection.

### Current state

✅ Worker binds a scoped REST token minted from `mcp-worker-rw`; the default admin token remains in 1Password as break-glass only. `mcp-readonly-ops` available for operator triage. Account-level MFA enforced on every member. `/health.aclSelfCheck` surfaces NOPERM regressions as a deploy-level signal — see [`acl-selfcheck.ts`](../../observability/acl-selfcheck.ts) for the probe surface.

---

## A.4 — Inoreader credentials

> **Existing environment with a dead token chain?** Use [§ C.5 — in-browser re-auth](#recovery--primary-path-in-browser-re-auth-bl-047-t2); it writes fresh tokens straight to Upstash. This section is for provisioning Inoreader credentials on a **new** Worker environment.

### What you need

The Worker's Inoreader secrets, listed with their per-environment presence in [`SECRETS_INVENTORY.md`](../../../../src/docs/operations/SECRETS_INVENTORY.md):

- `INOREADER_APP_ID` / `INOREADER_APP_KEY` — the registered Inoreader app's credentials. Source: the Inoreader developer console, or the password-manager entry. (The website no longer holds any `INOREADER_*` variables; they were deleted from Vercel on 2026-05-27.)
- `INOREADER_ACCESS_TOKEN` / `INOREADER_REFRESH_TOKEN` — the seed token pair. The Worker reads OAuth tokens from Upstash first ([`ARCHITECTURE.md` § Token storage and OAuth refresh](../ARCHITECTURE.md#token-storage-and-oauth-refresh)); these env-var values only bootstrap it, and go stale by design once the first refresh persists new tokens to `mcp:inoreader:*`.
- `INOREADER_REDIRECT_URI` — **production only** (the Inoreader app accepts one redirect URI); the value is in SECRETS_INVENTORY.

### Steps

1. **Put the app credentials where the auth script reads them.** [`scripts/inoreader-auth.mjs`](../../../../scripts/inoreader-auth.mjs) reads `INOREADER_APP_ID` / `INOREADER_APP_KEY` from the repo-root `.env` or from the environment, so the values are never inlined on a command line.
2. **Mint a token pair** from the repo root:
   ```bash
   node scripts/inoreader-auth.mjs setup          # prints the consent URL — open it and authorize
   node scripts/inoreader-auth.mjs exchange CODE  # trades the code for an access + refresh token pair
   ```
   The script's redirect is `http://localhost:3000/callback`, and the exchange only succeeds while that is the app's registered redirect URI. The app normally has production's URI registered, so for the mint, temporarily register the localhost redirect in the Inoreader developer console, then **restore the production URI immediately afterwards**; production's in-browser re-auth fails until you do. This is the same swap as the § C.5 fallback path. Don't mint through production's in-browser re-auth instead: it writes the tokens to production's Upstash, not to the new environment's.
3. **Bind the secrets on the new environment** (`wrangler secret put` is interactive — paste each value at the prompt). Each `secret put` deploys a new Worker version immediately:
   ```bash
   cd mcp-server
   npx wrangler secret put INOREADER_APP_ID --env <env>
   npx wrangler secret put INOREADER_APP_KEY --env <env>
   npx wrangler secret put INOREADER_ACCESS_TOKEN --env <env>
   npx wrangler secret put INOREADER_REFRESH_TOKEN --env <env>
   npx wrangler secret put INOREADER_REDIRECT_URI --env production   # production only
   ```
4. **Verify**: `npx wrangler secret list --env <env>` shows the names; after the next radar call or cron tick, `/health` reports `inoreader: 'ok'`.

The Worker is the **sole** Inoreader caller and token-refresh writer (BL-032.8 — see [`ARCHITECTURE.md` § Radar pipeline](../ARCHITECTURE.md#radar-pipeline-single-caller-unification)). The original Vercel-copy procedure is archived with the rollout playbook.

## A.4.5 — Cloudflare Analytics Engine — typed-metric instrumentation (BL-032.75 Phase 1)

### What you need

- The Cloudflare account that owns `gst-mcp` / `gst-mcp-staging` (set up during the initial rollout — [archived § A.1](./_archive/DEPLOY_INITIAL_ROLLOUT_BL-032.md#a1--cloudflare-account--wrangler-cli)).
- Workers Free plan (verified sufficient per [Cloudflare AE pricing](https://developers.cloudflare.com/analytics/analytics-engine/pricing/) on 2026-05-27: 100k writes/day + 10k reads/day + 3-month retention).
- Analytics Engine enabled at account level — a one-time dashboard step already done in 2026-05 ([archived § A.4.5](./_archive/DEPLOY_INITIAL_ROLLOUT_BL-032.md#a45--cloudflare-analytics-engine--account-level-enable-bl-03275-phase-1)). A new account needs it again before the first deploy.

### Per-env dataset map (already pinned in `wrangler.toml`)

| Env                         | Dataset              | Binding   | Created via                                      |
| --------------------------- | -------------------- | --------- | ------------------------------------------------ |
| `wrangler dev` (no `--env`) | `mcp_events_dev`     | `METRICS` | Auto on first write                              |
| `--env staging`             | `mcp_events_staging` | `METRICS` | **Manual dashboard step (account-level enable)** |
| `--env production`          | `mcp_events`         | `METRICS` | Auto on first write (after staging step above)   |

### Verification (after a CI deploy that changes the bindings)

1. Open the deploy workflow run's `wrangler deploy` step output and read its bindings table — it confirms `env.METRICS (mcp_events_staging)` for staging and `env.METRICS (mcp_events)` for production. Different dataset names = different AE datasets = no staging/prod contamination.
2. After the next cron firing (or any authenticated MCP request that exercises a tool/resource/prompt), `npx wrangler tail --env <env>` should show no `metrics.sink.write_failed` lines. If one appears, the binding-vs-dataset shape is wrong — re-check `wrangler.toml`.
3. Within ~5-10 min of first writes, the Cloudflare dashboard → Workers & Pages → Analytics Engine should show both datasets populated.
4. (Optional, requires the AE read token — see [C.X below](#cx--analytics-engine-sql-query-bl-03275-phase-3)): query AE via the SQL API and confirm rows.

### Current state

✅ AE is enabled at account level. Both per-env datasets exist (or will auto-materialize on first write). Instrumented Tool / Resource / Prompt invocations write events to the per-env dataset.

---

## A.6.1 — BL-032.8 Phase 3 — Narrow-scope key for the website's `/radar/snapshot` consumer

Reference for the website's bearer key for the `GET /radar/snapshot` HTTP convenience endpoint (BL-032.8 Phase 3; live on both environments). Use it to re-issue or rotate that key.

### What you need

- One bearer token for the website's SSR consumer, named `MCP_KEY_WEBSITE_RADAR`.
- The companion `MCP_KEY_WEBSITE_RADAR_SCOPES` env var that narrows the grant to the single scope this consumer needs.

### Why narrow

A full `DEFAULT_SCOPES` grant would let the website's bearer call any MCP Tool or Prompt. The `/radar/snapshot` endpoint only needs `resource:radar:read`. Issuing the narrow scope:

- Limits blast radius if the website's env leaks
- Keeps audit logs clean (`keyOwner=WEBSITE_RADAR` won't show up in tool-call telemetry)
- Forward-compatible with BL-033 pilot-client onboarding (same per-key scope-subset mechanism)

See [bearer.ts](../../auth/bearer.ts) line 100–160 for the resolution code and [`ARCHITECTURE.md` § Bearer scope resolution](../ARCHITECTURE.md#bearer-scope-resolution-per-key-subsets) for the design.

### Steps

1. **Generate a token** using any of the random-bytes snippets in [§ C.1 step 1](#c1--add-a-new-team-member-key). Save in your password manager labeled "GST MCP — WEBSITE_RADAR — staging+production".
2. **Set as Wrangler secrets on staging** — TWO secrets, the second is JSON-encoded:
   ```bash
   cd mcp-server
   npx wrangler secret put MCP_KEY_WEBSITE_RADAR --env staging
   # Paste the token value at the prompt
   npx wrangler secret put MCP_KEY_WEBSITE_RADAR_SCOPES --env staging
   # Paste: ["resource:radar:read"]
   # (Yes, including the brackets and quotes — it's a JSON array literal.)
   ```
3. **Repeat for production** (each `secret put` deploys a new Worker version immediately):
   ```bash
   npx wrangler secret put MCP_KEY_WEBSITE_RADAR --env production
   npx wrangler secret put MCP_KEY_WEBSITE_RADAR_SCOPES --env production
   ```
4. **Add the same value to Vercel** (the website's SSR consumer reads it):
   ```bash
   # From the website repo (not mcp-server):
   vercel env add MCP_KEY_WEBSITE_RADAR
   # Paste the same token used on the Worker side. Apply to production +
   # preview targets.
   ```

### Verification

Smoke-test the endpoint with the new bearer (staging shown; substitute prod when deployed):

```bash
# Token read from the environment, never pasted inline (CLAUDE.md Directive 15)
curl -s -H "Authorization: Bearer $MCP_KEY_WEBSITE_RADAR" \
  https://mcp-staging.globalstrategic.tech/radar/snapshot \
  | head -c 500
```

Expected: HTTP 200 with JSON body `{ wire: {...}, fyi: {...}, fetchedAt: "..." }`.

Without the bearer, expect HTTP 401. With a token that's missing the `resource:radar:read` scope (e.g., a key configured with `MCP_KEY_<OWNER>_SCOPES=["tool:*"]`), expect HTTP 403 with `{ "error": "forbidden", "missingScope": "resource:radar:read", "ownedScopes": [...] }`.

### What you've completed

✅ Narrow-scope bearer key issued for the website's `/radar/snapshot` consumer, on staging (and production when ready). The endpoint is now usable by any consumer that knows the bearer; the narrow scope keeps the audit trail clean.

---

# Part B — Smoke validation

## B.3 — Smoke validation

A 7-step curl sequence to verify each layer of the request flow. Run it against the staging URL after a CI deploy (the deploy workflows already run the shorter `scripts/smoke-probe.sh`; this is the full manual pass), and against production after a rollback or any change you want to prove end to end.

> **Shell adaptation note**: snippets below are bash-flavored. Translate as needed:
>
> | Concern           | bash / Git Bash      | Windows PowerShell                                                                                                                                     |
> | ----------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
> | Set env var       | `export MCP_URL=...` | `$env:MCP_URL = "..."`                                                                                                                                 |
> | Reference env var | `$MCP_URL`           | `$env:MCP_URL`                                                                                                                                         |
> | Real curl         | `curl`               | `curl.exe` (PowerShell's `curl` is an alias for `Invoke-WebRequest` — different syntax)                                                                |
> | Pretty-print JSON | `\| jq`              | If no jq: drop the pipe and view raw, OR `\| ConvertFrom-Json \| ConvertTo-Json -Depth 4`. Install jq via `winget install jqlang.jq` for parity        |
> | Line continuation | `\` at end of line   | backtick `` ` `` at end of line                                                                                                                        |
> | JSON body in `-d` | works directly       | PowerShell mangles inner quotes — put body in a `$body = '...'` variable first, or use `Invoke-RestMethod` instead of curl.exe (handles JSON natively) |
>
> **PowerShell-native helpers — checked in at [`mcp-server/scripts/Invoke-McpRequest.ps1`](../../../scripts/Invoke-McpRequest.ps1).** Dot-source it once per terminal:
>
> ```powershell
> cd c:\Code\gst-website\mcp-server
> . .\scripts\Invoke-McpRequest.ps1
> # MCP_URL defaults to https://mcp.globalstrategic.tech (production); MCP_KEY is prompted if unset.
> # Both env vars can be re-set explicitly per session, e.g.:
> #   $env:MCP_URL = "https://mcp-staging.globalstrategic.tech"  # override for staging probes
> #   $env:MCP_KEY = (Read-Host -AsSecureString "MCP_KEY" | ConvertFrom-SecureString -AsPlainText)  # prompt without echoing into scrollback
> ```
>
> Two helpers land in the session:
>
> - **`Invoke-McpRequest -Method <m> [-Params <hash>] [-Id <n>]`** — raw JSON-RPC call; returns the full envelope. Use for `tools/list`, `prompts/list`, etc., or when you need to see the protocol envelope.
> - **`Invoke-McpTool -Name <toolName> [-Arguments <hash>] [-Id <n>]`** — convenience wrapper around `tools/call`. Issues the call and returns `result.structuredContent` — the tool's payload — directly. (`result.content[0].text` is a one-line human caption; since 0.45.0 / BL-108 `result.content[1].text` carries the same payload serialized, so `content`-reading clients are not starved of data. `structuredContent` remains the channel to read programmatically.)
>
> With these, B.3.3 becomes `(Invoke-McpRequest -Method "tools/list").result.tools.name`, B.3.4 becomes `Invoke-McpTool -Name "list_portfolio_facets"`, T.B.2.a becomes `Invoke-McpTool -Name "search_portfolio" -Arguments @{ search = "kubernetes" }`. PowerShell-flavored examples are inlined per-step below.

> bash one-time setup (production is the default; override `MCP_URL` to staging if needed). The `read -rsp` prompts for the key without echoing — paste the real value at the prompt:
>
> ```bash
> export MCP_URL=https://mcp.globalstrategic.tech    # or https://mcp-staging.globalstrategic.tech for staging probes
> read -rsp "MCP_KEY (input hidden): " MCP_KEY && export MCP_KEY && echo
> ```
>
> **Avoid** literally pasting `export MCP_KEY=<your-MCP_KEY_RP-token-value>` — bash treats `<...>` as input redirection and you'll either get "no such file" or a literal-string value depending on shell. The `read -rsp` pattern sidesteps the placeholder-paste hazard entirely.

### B.3.1 — Health endpoint responds

```bash
curl $MCP_URL/health | jq
```

Expected shape (abridged sample from a fresh deploy, before any radar traffic):

```json
{
  "ok": true,
  "version": "0.63.0",
  "gitSha": "abc1234",
  "phase": "BL-032 Phase 5 (observability)",
  "upstashMcp": "ok",
  "inoreader": "unknown",
  "inoreaderObservedAt": null,
  "radarSnapshotAgeSeconds": null
}
```

`gitSha` shows the 7-character short SHA of the deployed commit — the CI deploy workflows inject it through `scripts/deploy.mjs`, so it should match the workflow run's head commit. If it shows `"unknown"`, someone deployed with a bare `npx wrangler deploy`, which skips the GIT_SHA injection — find out who and why, then let CI redeploy.

`ok: true` here even though `inoreader: 'unknown'`, because **`unknown` is not a degraded signal** — it means "no recent traffic", not "broken". `ok` is derived as `upstashMcp === 'ok' && inoreader !== 'degraded'`, and `health.test.ts` asserts exactly this case. (This sample previously showed `ok: false` with the unknown named as its cause, which contradicted that behaviour; corrected under BL-122.) `inoreader` flips to `'ok'` after the first successful radar-tool call (B.3.6 below). Note the payload is abridged — the live response also carries `circuitOpen`/`circuitRead`, `inoreaderSpend`, `aclSelfCheck` and refresh-token health.

`upstashMcp: 'ok'` confirms the MCP DB is reachable (rate-limiter, circuit-breaker, and OAuth-token writes all land here). If it's `'degraded'`, check that `UPSTASH_MCP_REST_URL` + `UPSTASH_MCP_REST_TOKEN` are bound (`npx wrangler secret list --env <env>`; expected set in [`SECRETS_INVENTORY.md`](../../../../src/docs/operations/SECRETS_INVENTORY.md)) and that the bound token is the scoped one from § A.3.5.

> **Legacy field**: pre-BL-032.8-Phase-B deploys also returned `upstashInoreader: 'ok' | 'degraded'`. That field was removed in Phase B alongside the legacy Inoreader DB. If you see it in a response, the Worker hasn't been re-deployed since Phase B — check `gitSha` against the latest commit on `master`.

### B.3.2 — Bearer auth blocks unauthenticated calls

```bash
curl -i $MCP_URL/mcp -X POST -d '{}'
```

Expected: `HTTP/2 401`, `WWW-Authenticate: Bearer realm="gst-mcp"`, JSON body `{"error":"unauthorized","message":"Missing Authorization header"}`.

### B.3.3 — Bearer auth accepts the valid key

Use a proper MCP `tools/list` JSON-RPC request:

```bash
curl -s $MCP_URL/mcp \
  -H "Authorization: Bearer $MCP_KEY" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | jq '.result.tools[] | .name'
```

Expected output: every tool `createServer()` registers — the transport-portable surface. The expected count is `EXPECTED_REMOTE_TOOL_COUNT` in [`tests/integration/helpers/mcp-registry.ts`](../../../../tests/integration/helpers/mcp-registry.ts); compare it with the live count:

```bash
curl -s $MCP_URL/mcp \
  -H "Authorization: Bearer $MCP_KEY" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | jq '.result.tools | length'
```

The list never includes `search_radar_offline` or the `search_radar_cache` alias: per [`ARCHITECTURE.md` § Transport binding per tool](../ARCHITECTURE.md#transport-binding-per-tool-q12), both are stdio-only and registered exclusively by `_local-only.ts`.

If you see `search_radar_offline` or `search_radar_cache` in this list, that's a real bug — they should not register on the Worker. Stdio-only entries appearing on the Worker would indicate `_local-only.ts` got pulled into the Worker bundle (regression).

### B.3.4 — Invoke a non-radar tool

```bash
curl -s $MCP_URL/mcp \
  -H "Authorization: Bearer $MCP_KEY" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_portfolio_facets","arguments":{}}}' | jq
```

Expected: a JSON response with `result.structuredContent` containing the deduplicated themes / engagement categories / etc. for the M&A portfolio. (`result.content[0].text` carries a one-line caption; `result.content[1].text` carries the same payload serialized — see ADR-0011 and its 2026-08-04 amendment.)

### B.3.5 — Verify rate-limit headers

The response from B.3.4 should include:

```
RateLimit-Limit: 60
RateLimit-Remaining: 59
RateLimit-Reset: <seconds-until-window-resets>
```

If `RateLimit-*` headers are absent, the limiter took the graceful-skip path → the **MCP DB** isn't reachable (rate-limit state lives in `mcp:*` and writes to the MCP-DB). Re-check that `UPSTASH_MCP_REST_URL` + `UPSTASH_MCP_REST_TOKEN` are bound (`npx wrangler secret list --env <env>`; see § A.3 Reference and [`SECRETS_INVENTORY.md`](../../../../src/docs/operations/SECRETS_INVENTORY.md)).

### B.3.6 — Invoke a radar tool (live Inoreader call)

```bash
curl -s $MCP_URL/mcp \
  -H "Authorization: Bearer $MCP_KEY" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_radar","arguments":{"category":"pe-ma"}}}' | jq '.result.structuredContent.matches | length'
```

Expected: a non-zero integer. The first call fetches from Inoreader (~6 API calls); subsequent calls within 6h hit the Upstash cache.

Re-run § B.3.1 health check — `inoreader` should now be `"ok"` and `inoreaderObservedAt` populated:

```bash
curl $MCP_URL/health | jq
```

### B.3.7 — Hammer the rate limiter

100 requests in fast succession should return 429s after the 60th:

```bash
for i in $(seq 1 70); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -H "Authorization: Bearer $MCP_KEY" \
    -H "Content-Type: application/json" \
    -X POST \
    -d '{"jsonrpc":"2.0","id":'$i',"method":"tools/list","params":{}}' \
    $MCP_URL/mcp
done | sort | uniq -c
```

Expected output (approximate):

```
  60 200
  10 429
```

The 429 responses include `RateLimit-*` headers and `Retry-After: <seconds>`. Wait the `RateLimit-Reset` window before continuing.

---

If any of B.3.1 – B.3.7 fail unexpectedly, jump to **Part C § C.6 — Incident triage tree** for diagnosis.

---

# Part C — Ongoing Operations

The day-to-day reference. No need to read sequentially — jump to whichever section applies.

## C.1 — Add a new team-member key

> See [`AUTH.md` § Issue a new key](./AUTH.md#issue-a-new-key) for the canonical command reference. This section adds the operational onboarding sequence.

### When to do this

A team-member (e.g., "AB") needs MCP access. Confirm with them:

- They're using a Claude/Cursor client that supports remote MCP (see [`REMOTE_CLIENT_SETUP.md`](./REMOTE_CLIENT_SETUP.md))
- They have a password-manager vault you can share into (1Password, Bitwarden, etc. all work)

### Steps

1. **Generate a cryptographically-random token** (~43 chars, base64url-encoded — pick the snippet for your shell; all three produce the same shape of output):
   ```bash
   # bash / zsh / Git Bash / macOS / Linux:
   openssl rand -base64 32 | tr -d '=' | tr '/+' '_-'
   ```
   ```bash
   # Node.js (cross-platform — works wherever you have Node):
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
   ```powershell
   # PowerShell (Windows-native — no openssl required):
   $b=[byte[]]::new(32); [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b).TrimEnd('=').Replace('+','-').Replace('/','_')
   ```
2. **Store in your password manager** with a note "GST MCP — AB — production". Share the entry to AB's vault
3. **Set the secret on production** (skip staging unless they specifically need staging access for testing):
   ```bash
   cd mcp-server
   npx wrangler secret put MCP_KEY_AB --env production
   # Paste the token value
   ```
   `secret put` deploys a new Worker version immediately, so the key is live as soon as the command returns — no redeploy. Confirm `/health` still reports `ok: true`.
4. **Notify AB**: send them a link to [`REMOTE_CLIENT_SETUP.md`](./REMOTE_CLIENT_SETUP.md) and tell them their token is in your password manager
5. **Verify with AB**: ask them to run a smoke prompt in their client. If they see tool results, you're done. If they see 401, walk them through the troubleshooting tree in REMOTE_CLIENT_SETUP.md
6. **Update your team-member-roster** (kept in your password manager / shared spreadsheet) with AB's `keyOwner` suffix and the date issued

---

## C.2 — Rotate / revoke a key

> See [`AUTH.md` § Rotate a key](./AUTH.md#rotate-a-key) and [`AUTH.md` § Revoke a key (permanent)](./AUTH.md#revoke-a-key-permanent) for command reference.

### Rotation triggers

| Trigger                                                                                | Urgency       | Action                                                                                                                                    |
| -------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Suspected token compromise (pasted into wrong channel, etc.)                           | **Immediate** | Rotate now; investigate after                                                                                                             |
| Team-member offboarding                                                                | **Immediate** | Revoke (delete, no re-issue)                                                                                                              |
| Suspicious traffic from one keyOwner (origins not matching their normal usage pattern) | **Immediate** | Rotate; investigate via `wrangler tail`                                                                                                   |
| Periodic prophylactic rotation                                                         | **Eventual**  | No schedule is enforced for static keys; pilot and trial clients use OAuth (see [`AUTH.md`](./AUTH.md)), whose tokens expire on their own |

### Rotate (compromise)

1. **Generate the new token** (per [§ C.1 step 1](#c1--add-a-new-team-member-key) — `openssl rand -base64 32 | tr -d '=' | tr '/+' '_-'`, or the Node/PowerShell equivalents there)
2. **Delete and re-set the secret** for both envs:

   ```bash
   cd mcp-server
   npx wrangler secret delete MCP_KEY_AB --env staging
   npx wrangler secret put MCP_KEY_AB --env staging
   # Paste the NEW token

   npx wrangler secret delete MCP_KEY_AB --env production
   npx wrangler secret put MCP_KEY_AB --env production
   ```

   Each `secret delete` / `secret put` deploys a new Worker version immediately, so the old token stops working the moment the delete lands — no redeploy. Verify `/health` afterwards.

3. **Update your password manager** with the new value (share the entry to the team-member's vault)
4. **Notify the team-member**: their old token is dead; update their client config with the new one
5. **Investigate the compromise**: check `wrangler tail` for the rotation window's traffic on the old `keyOwner`; check Sentry for unusual events

### Revoke (offboarding)

```bash
cd mcp-server
npx wrangler secret delete MCP_KEY_AB --env staging
npx wrangler secret delete MCP_KEY_AB --env production
```

Each `secret delete` deploys a new Worker version immediately — no redeploy. The team-member's client now returns 401 on all calls. No re-issue. Update your team-member-roster.

---

## C.3 — Rollback

### When to roll back

| Symptom                                                                                           | Roll back?                                                          |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Unhandled exception storm in Sentry post-deploy                                                   | **Yes**, immediately                                                |
| Sustained 5xx rate (>1% over 15 min) post-deploy                                                  | **Yes**                                                             |
| `/health` reports `upstashMcp: 'degraded'` for >5 min post-deploy and Upstash status page is fine | **Probably yes** — config regression on the MCP DB's secrets        |
| One specific tool returns wrong results                                                           | **Maybe** — depends on user impact; sometimes fix-forward is faster |
| Performance regression but no errors                                                              | **Investigate first**; rollback if fix takes >1 hour                |

### Rollback steps

1. **Find the rollback target**: its Cloudflare version ID and its git SHA. `npx wrangler deployments list --env production` (or the Cloudflare dashboard → Workers & Pages → `gst-mcp` → Deployments) lists recent versions; the SHA is the one `/health` reported as `gitSha` while that version was live, or the deploy workflow run that produced it.
2. **Run the [`rollback-mcp.yml`](../../../../.github/workflows/rollback-mcp.yml) workflow** (GitHub → Actions → **Rollback MCP Worker** → Run workflow) with the environment, version ID, target SHA and a reason. Production rollbacks wait for the `mcp-production-rollback` GitHub Environment approval; staging runs unattended. The workflow runs `wrangler rollback`, then the same smoke probe as the deploy workflows against the target SHA, and opens an incident issue if either fails.
3. **Fallback — only if the workflow itself can't run** (GitHub Actions down, credentials broken): from a machine with wrangler credentials,
   ```bash
   cd mcp-server
   npx wrangler rollback --env production <version-id>
   ```

The rollback takes effect within seconds. Verify:

```bash
curl https://mcp.globalstrategic.tech/health | jq
```

`gitSha` should show the rollback target's SHA. Run § B.3 smoke again to confirm subsystems are healthy.

### While rolled back — secrets are locked

After a rollback the deployed version is no longer the **latest** version, and `wrangler secret put` / `secret delete` refuse to run ("Secret edit failed … the latest version of your Worker isn't currently deployed"). This guard exists so that a secret edit can't silently redeploy the broken latest version. Wrangler's error suggests `wrangler versions secret put`, which only _uploads_ a new version built on the latest (broken) one. Never deploy a version it creates. In order of preference:

1. **Land the fix through CI first** (below). Once the fixed version is deployed it is the latest again, and secret edits work normally.
2. **If a secret must change before the fix lands** (for example, revoking a leaked key), edit it on the deployed version in the Cloudflare dashboard (Workers & Pages → `gst-mcp` → Settings → Variables and Secrets), then verify `/health` still reports the rollback target's `gitSha`.

### After rollback — investigate

1. **Capture the broken state in a Sentry issue** if you haven't already (any unhandled exceptions captured by withSentry are already there)
2. **Check the deploy diff** — `git log <previous>..<broken>` to see what shipped
3. **Reproduce locally** with `wrangler dev` against the broken commit; identify the regression
4. **Fix on a branch**, run the full local validation sequence (CLAUDE.md Directive 14 — the four website checks plus `npm -w @gst/mcp-server run typecheck && npm run test:mcp && npm run test:docs` for Worker changes), and merge; CI deploys the fix

---

## C.4 — Tail and investigate

`wrangler tail --env production` (or `--env staging`) attaches to the Worker's structured-log stream in real time. Every authenticated request emits one JSON line via `safeLog`; failures emit additional context. Common patterns:

```bash
# Live tail — every event, formatted JSON one-per-line.
wrangler tail --env production

# Filter to a specific keyOwner:
wrangler tail --env production --search '"keyOwner":"RP"'

# Filter to failed auth bursts:
wrangler tail --env production --search '"event":"auth.failed"'

# Filter to rate-limit hits:
wrangler tail --env production --search '"event":"ratelimit.exceeded"'
```

Common fingerprints and what they mean:

| Log signature                                                  | Means                                                                                              | First action                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"event":"auth.failed","reason":"bearer-rejected"`             | Wrong/missing/stale token. Could be one user with a stale config OR a probe-and-bail attempt.      | `wrangler tail` is the surface for this reason — `bearer-rejected` is deliberately NOT Sentry-captured (PR #141 gates capture to `invalid-token` / `malformed-scopes`; those DO feed the "Bearer auth failure burst" rule, filter fixed in the 2026-07-14 audit). If sustained from one keyOwner, ping that team-member to confirm config |
| `"event":"ratelimit.exceeded","reason":"tier=minute"`          | One key burst-called too fast. Per-minute (60) cap hit                                             | Usually self-recovers in 60s; check if the keyOwner has a runaway agent loop                                                                                                                                                                                                                                                              |
| `"event":"ratelimit.exceeded","reason":"tier=day"`             | One key consumed the full daily budget                                                             | Inspect what the user did; if legitimate, consider raising their cap (see RATE_LIMITS.md)                                                                                                                                                                                                                                                 |
| `"event":"ratelimit.skipped","reason":"upstash-mcp-not-bound"` | MCP DB creds missing or unreachable at request time                                                | Check `UPSTASH_MCP_*` secrets via `wrangler secret list`; check Upstash status page for the MCP DB                                                                                                                                                                                                                                        |
| `"event":"mcp.request","success":false`                        | Tool invocation completed with a 4xx status. Most often: invalid input or tool-side error envelope | Check the structured `errorCode` field                                                                                                                                                                                                                                                                                                    |
| Sentry: any `error.unhandled` from a Worker isolate            | Unexpected throw in handler code path                                                              | Check the stacktrace; usually indicates a bug. Capture, fix, ship                                                                                                                                                                                                                                                                         |
| `errorCode:"inoreader-rate-limit"`                             | Inoreader returned 429 — circuit breaker just opened                                               | See § C.5 below                                                                                                                                                                                                                                                                                                                           |

`/health` reports the cached subsystem status (Q8 — never burns Inoreader budget). Useful as a pre-investigation sanity check:

```bash
curl https://mcp.globalstrategic.tech/health | jq
```

Surfaces the MCP DB's reachability (`upstashMcp`, `'ok' | 'degraded'`), last observed Inoreader API status (`inoreader: 'ok' | 'degraded' | 'unknown'`), `inoreaderObservedAt` timestamp, `radarSnapshotAgeSeconds`, and the aggregate `ok` flag (true iff MCP DB is OK and `inoreader !== 'degraded'`).

---

## C.5 — Inoreader budget recovery

The radar tools share a 6-hour global circuit breaker (Phase 3 substrate, Phase 4c trigger — see [RATE_LIMITS.md](./RATE_LIMITS.md) § Circuit breaker for the full design). When Inoreader returns 429:

1. The first radar-tool call to see it sets `mcp:radar:circuit-open` in the **MCP DB** with a 6h TTL
2. All subsequent radar reads (tools, `gst://radar/*` Resources, `/radar/snapshot`) read the flag and serve the **cached snapshot** instead of calling Inoreader, flagged `liveInfo.degraded: true`. A `503` returns only when nothing is cached (BL-091)
3. Non-radar tools are unaffected
4. The breaker auto-closes via TTL expiry — no manual intervention required for normal recovery

### When NOT to manually reset

If the breaker just opened, **don't reset it**. Inoreader's budget hasn't recovered; you'll trigger another 429 within seconds, burning more of the next day's budget. Wait for the TTL to expire.

### When manual reset is OK

Inoreader's status page reports the platform recovered within minutes (rare). The breaker would auto-close in 6h, but you want radar tools back ASAP.

```bash
# Use the MCP DB's REST credentials. Pull the values from your secrets store
# (your password manager); they are the UPSTASH_MCP_REST_* Worker secrets —
# see § A.3 Reference (rotating the MCP-DB token) and SECRETS_INVENTORY.md.
curl -X POST "$UPSTASH_MCP_REST_URL/del/mcp:radar:circuit-open" \
  -H "Authorization: Bearer $UPSTASH_MCP_REST_TOKEN"
```

The next radar-tool call will hit Inoreader; if it succeeds, the breaker stays closed; if Inoreader still 429s, it re-opens with a fresh 6h TTL.

### When the budget itself is the problem

If radar tools 429 repeatedly across the team — and Inoreader's status page is fine — the issue is GST's daily budget exhaustion. Check the budget envelope in [`src/docs/hub/RADAR.md` § Budget envelope](../../../../src/docs/hub/RADAR.md):

- Website `/hub/radar`: one `/radar/snapshot` call **per pageview** (the feed is a `server:defer` island, and `/_server-islands/*` bypasses ISR). Almost all are Upstash cache hits costing zero Inoreader spend; only a cache-cold miss falls through. Bounded by the key's `INTERNAL_TIER` (60/min, 1000/day). Was ~28/day while the feed was briefly inlined into the ISR entry (2026-07-31 → 2026-08-02); see [ADR-0012](../../../../src/docs/adr/0012-rotating-feeds-are-noindex.md)
- MCP per-key: capped at 50/day per key by the rate-limiter
- Radar-refresh cron (`0 */6 * * *`, production only): ~24 calls/day

At typical usage, total is well under 200/day. If the per-key cap isn't sufficient (regularly hitting 50 mid-day for legitimate work), escalate to Inoreader's paid tier — the per-day ceiling raises cleanly without affecting any other operational decision.

### Recovery — Inoreader OAuth refresh-token expired

**Post-BL-032.8 Phase B (2026-05-17)**: the Worker self-heals on Inoreader 401 by calling Inoreader's `/oauth2/token` directly via `inoreader-oauth.ts` and retrying the original request once. Concurrent refresh attempts (cron + live-tool) are coalesced to a single POST via an Upstash SET-NX-EX lock on `mcp:inoreader:refresh-lock`. Manual recovery is only needed when the **refresh-token itself** is dead (expired, revoked at Inoreader) — at that point neither cron nor live-tool retry can recover, and an operator must mint new tokens.

**Post-BL-047 grace-window hedge (PR #196, 2026-05-31)**: the Worker additionally caches the previously-rotated refresh_token in-isolate for 60s (Inoreader's empirically-verified grace window — see [`INOREADER_OAUTH_CONTRACT.md`](./INOREADER_OAUTH_CONTRACT.md) § 5). On `invalid_grant` from the primary token, one retry with the cached previous token is attempted; within the grace window it succeeds and the failure never surfaces. The `oauth-refresh-invalid-refresh-token` Sentry event fires ONLY when BOTH the primary AND the hedge have failed — meaning the chain is genuinely dead and operator action is required (not a transient).

**Pre-recovery triage** — before running the steps below, confirm the hedge ALSO failed. In Sentry, the alert that fired should be `oauth-refresh-invalid-refresh-token` with NO accompanying `inoreader.oauth.grace-window-recovery` event from the same minute. If a `grace-window-recovery` event IS present, the hedge already self-healed and no manual action is needed.

**Telemetry to distinguish the two cases**:

- `inoreader: 'degraded'` in `/health` followed by `inoreader: 'ok'` within 1-2 Cron ticks → Worker self-heal succeeded. No action needed
- `inoreader: 'degraded'` persists across multiple Cron ticks AND Sentry shows `oauth-refresh-invalid-refresh-token` from the Worker → refresh-token is dead; operator action required (steps below)
- `inoreader: 'degraded'` persists AND Sentry shows `oauth-refresh-token-missing` → neither the MCP-DB `mcp:inoreader:refresh_token` key nor the `INOREADER_REFRESH_TOKEN` Worker env var holds a value. Manual re-link required

#### Recovery — primary path: in-browser re-auth (BL-047 T2)

**Production-only by Inoreader-tier constraint.** The registered Inoreader app accepts ONE redirect URI; the production callback URL is the only one registered. Operators recover via the production Worker even when an incident is observed on staging.

1. From any browser (mobile included) navigate to **https://mcp.globalstrategic.tech/admin/inoreader/reauth/start**
2. Paste `MCP_ADMIN_KEY` from your password manager into the admin-key field; tap Continue
3. You'll be 302'd to Inoreader's consent screen — tap Authorize
4. Inoreader redirects back to `/callback`; the Worker exchanges the code, writes new tokens to Upstash, evicts the grace-window cache, and shows a "Re-auth complete" page
5. Verify in Sentry: the `admin-reauth-callback-success` info-level event should appear within ~1 minute

**T2 failure modes** (each fires a distinct Sentry event tag):

- **`admin-reauth-persist-failed`** (paging) — Inoreader returned tokens but the Worker could not write them to Upstash. The new chain is valid on Inoreader's side but not on ours. **Action**: re-run `/start` within ~5 minutes to mint another fresh chain before the unpersisted one rotates further. The stranded chain self-invalidates once a fresh exchange overwrites it.
- **`admin-reauth-token-exchange-failed`** (paging) — Inoreader rejected the code (expired, redirect_uri mismatch). Re-run `/start` and try again. If recurrent, verify `INOREADER_REDIRECT_URI` matches the URI registered in the Inoreader app dashboard byte-for-byte.
- **`admin-reauth-state-rejected`** (capture-only) — stale link, replay attempt, or operator opened the consent flow in a different browser than `/start`. Restart from `/start` in the same browser.

#### Recovery — fallback path: local Node script (bootstrap-only)

The legacy `scripts/inoreader-auth.mjs` flow remains valid for two narrow cases:

1. **First-time bootstrap** — before the production redirect URI is registered with the Inoreader app
2. **`MCP_ADMIN_KEY` lost or rotated** — set a fresh one via `wrangler secret put MCP_ADMIN_KEY --env production`, then the in-browser path is back

Recovery via the Inoreader OAuth setup flow:

```bash
node scripts/inoreader-auth.mjs setup        # 1. Prints auth URL — open in browser, authorize
node scripts/inoreader-auth.mjs exchange CODE # 2. Trade the auth code for a fresh access + refresh token pair
```

Then bind the new tokens as Wrangler secrets so the Worker can bootstrap from them on next refresh:

```bash
cd mcp-server
npx wrangler secret put INOREADER_ACCESS_TOKEN --env production
npx wrangler secret put INOREADER_REFRESH_TOKEN --env production
```

Each `secret put` deploys a new Worker version immediately — no redeploy; verify `/health`. On the next cron tick, `refreshAccessToken('cron')` reads `INOREADER_REFRESH_TOKEN` from env (since Upstash MCP DB key is empty/stale), refreshes successfully, and persists the new `mcp:inoreader:access_token` + `mcp:inoreader:refresh_token` to the MCP DB. The env-var values become stale at that point — that's expected; the Upstash key takes over.

---

## C.6 — Incident triage tree

A bounded decision tree for "the MCP is broken" reports. Walk through these in order:

1. **Is the Worker reachable at all?**
   - `curl https://mcp.globalstrategic.tech/health` — does it respond at all?
   - **5xx or timeout** → Worker isolate is crashing or Cloudflare's edge is having issues. Check Cloudflare's status page; check Sentry for unhandled exceptions; if needed, roll back to the previous deploy per [§ C.3](#c3--rollback)
   - **200 with `ok: false`** → Worker is up but a subsystem is degraded. Continue to step 2

2. **Which subsystem is degraded?** Read the `/health` JSON:
   - `upstashMcp: 'degraded'` → MCP DB unreachable or misconfigured (rate-limit, circuit-breaker, health probe, inoreader-status cache, and Inoreader OAuth tokens all live here). Check Upstash status for the MCP DB; check `UPSTASH_MCP_REST_URL` + `UPSTASH_MCP_REST_TOKEN` are set via `wrangler secret list --env production`. Worker still serves auth + non-radar tools (rate-limit falls open with a warning); radar tools degrade when cache + OAuth token writes fail
   - `inoreader: 'degraded'` → Last Inoreader **API** call failed (429, 5xx, or timeout) — this is the upstream Inoreader service, not the Upstash DB. See § C.5 — usually circuit-breaker handling is correct; investigate if alerts surface this for >1 hour
   - `inoreader: 'unknown'` with no recent radar traffic → Not a problem. If radar traffic is expected and `inoreaderObservedAt` is null after 30+ min, something's wrong with the radar tools' status reporting (check Sentry)

3. **Are users seeing 401s but the operator confirms keys are configured?**
   - Possibly a key was deleted/rotated. Run `wrangler secret list --env production`; cross-reference your team-member-roster
   - If keys are present and correct, check `wrangler tail` for the specific 401 reason — `Missing Authorization header`, `Bearer scheme`, `Empty Bearer token`, or `Invalid Bearer token` each have different fixes

4. **Are users seeing 429s on legitimate work?**
   - One user → check their tool-call pattern; if they're authoring an agent loop, raise the budget temporarily. Radar reads while the breaker is open or Inoreader is unavailable come from the degraded cache that `search_radar` itself serves (`liveInfo.degraded: true`), so they need no separate tool
   - All users → see § C.5 ("When the budget itself is the problem")

5. **Worker is up, subsystems are healthy, users still complain something doesn't work.**
   - Look at the actual MCP error envelopes the user is seeing — they carry structured `error` codes that map directly to causes in [REMOTE_CLIENT_SETUP.md § Troubleshoot](./REMOTE_CLIENT_SETUP.md#troubleshoot)
   - If the symptom is "wrong tool result" or "schema validation error," it's an MCP protocol or tool-handler bug. Reproduce locally with `wrangler dev`; check Sentry for relevant traces

### When to escalate

- **Sustained 5xx rate** (>1% over 15 min) → page oncall, consider a rollback per [§ C.3](#c3--rollback)
- **Inoreader budget exhausted >24h** → escalate to paid Inoreader tier
- **Suspected key compromise** (one keyOwner shows traffic from unexpected origins) → rotate the key immediately per [AUTH.md § Rotate a key](./AUTH.md#rotate-a-key)
- **Cloudflare platform issues** → can't fix; communicate to users; Cloudflare's SLA covers it

An outage is user-visible but not contractual. The Worker serves the team, OAuth clients (including self-serve trial clients) and the website's `/hub/radar` feed, but no SLA has been ratified — capability ceilings are non-contractual per [`RATE_LIMITS.md`](./RATE_LIMITS.md), and SLA ratification stays deferred under [BL-033](../../../../src/docs/development/BACKLOG.md#bl-033-mcp-server--external-pilot-phase-3).

---

## C.7 — Migrate client records

> **When**: once per environment, for the 0.67.0 release that made radar an explicit scope ([ADR-0041](../../../../src/docs/adr/0041-radar-is-an-explicit-scope.md)). From 0.67.0, `tool:*` no longer covers the radar tools. Existing M2M clients keep radar because this script adds `tool:radar:*` to their KV records. OAuth consent grants need no migration: an unmarked grant keeps radar at read time (`effectiveScopes`, [AUTH.md](./AUTH.md)).

### What it does

`npm run radar:migrate-scope` (from `mcp-server/`) lists every M2M record through `GET /admin/oauth/m2m-clients` and sorts it into groups. It is a **dry run by default**: it prints the plan and writes nothing. `-- --apply` sends one `PATCH` per record to patch. Running it twice is safe, because a patched record already holds `tool:radar:*` and is skipped.

| Group                                    | Which records                                                                   | Action                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------ |
| Patch                                    | Non-trial, holds `tool:*`, lacks `tool:radar:*`                                 | Patched with `--apply`                     |
| Patch, converted trial                   | The same, on a record named `trial` (a trial converted to `paid` in place)      | Patched with `--apply`; listed apart       |
| Review, not patched                      | Non-trial with no `tool:*`                                                      | Nothing, unless you decide otherwise       |
| Unpatchable                              | Needs the patch but holds a scope outside the catalog (an `--unsafe-scope` one) | Re-provision, or accept that radar is lost |
| Already hold `tool:radar:*` / trial-tier | Already migrated, or a trial (never had radar)                                  | Counted and left alone                     |

- **Review.** These records were narrowed below `tool:*` on paper, but before 0.67.0 no `tools/call` checked a tool scope, so in practice their clients could call radar and every other tool. From 0.67.0 they lose whatever they don't name, by design. That is the enforcement this release adds, so don't dismiss the group. Read each one's scopes. If a client was meant to have radar, PATCH its `allowedScopes` to add `tool:radar:*` ([AUTH.md § Change an M2M client's tier, scopes or expiry](./AUTH.md#change-an-m2m-clients-tier-scopes-or-expiry-in-place)). Since 0.67.0 a narrowed record is also held to exactly the tools it names, so check that its `tool:<name>` scopes cover what the client actually calls.
- **Unpatchable.** `PATCH` validates the whole `allowedScopes` array against the catalog, so a record with an off-catalog scope is refused. Either re-provision the client with `npm run provision:client -- --allow-radar` plus its extra scopes (via `--unsafe-scope`), which issues a new credential you must hand over, or accept that it loses radar at deploy.

### Steps

1. **Check static-key scope overrides first.** The legacy rule does not cover static keys, and a key with an `MCP_KEY_<OWNER>_SCOPES` override gets exactly its override. List the secret names only:
   ```bash
   cd mcp-server
   npx wrangler secret list --env staging
   npx wrangler secret list --env production
   ```
   For every `MCP_KEY_*_SCOPES` other than `MCP_KEY_WEBSITE_RADAR_SCOPES` (which holds only `resource:radar:read` and needs no tools): add `tool:radar:*` to the override if that key should keep radar (`wrangler secret put … --env <env>`, value on stdin). Flag any override with neither `tool:*` nor a `tool:<name>` for the tools it uses, because from 0.67.0 it loses every tool, not just radar.
2. **Put the admin key in the environment**, never on the command line (Directive 15):
   Read it from a masked prompt, pasting from the password manager, so it never lands in shell history or scrollback:
   ```powershell
   $env:MCP_ADMIN_KEY = Read-Host -MaskInput 'MCP admin key'   # PowerShell 7
   ```
   ```bash
   read -rs MCP_ADMIN_KEY && export MCP_ADMIN_KEY              # bash / zsh
   ```
3. **Staging, before the branch is pushed.** Staging auto-deploys the pushed branch as soon as its MCP tests pass, so the migration has to be done by then. Running it before the push is harmless: under the old code `tool:*` already covers `tool:radar:*`.
   ```bash
   npm run radar:migrate-scope -- --env staging            # dry run: read the groups
   npm run radar:migrate-scope -- --env staging --apply
   ```
4. **Production, at least 1 hour before approving the `mcp-production` deploy.** An M2M token carries the scopes of its `/token` mint and lives ≤1h, so after an hour every live token of a client that sends no `scope` already carries `tool:radar:*`. Running early is harmless: under the old code `tool:*` already covered `tool:radar:*`, so the patch changes nothing until the deploy.
   ```bash
   npm run radar:migrate-scope                   # dry run (production is the default env)
   npm run radar:migrate-scope -- --apply
   ```
5. **Right before approving the deploy, re-run the production dry run.** It should show nothing to patch. A record created in between shows up here; apply again if so.
6. **After the deploy:** the latency probe's `search_radar` succeeds; `GET /admin/oauth/m2m-clients` shows `tool:radar:*` on the non-trial records that had `tool:*`; and 24 hours of `tool.scope-denied` and `mcp.batch-rejected` log lines ([§ C.4](#c4--tail-and-investigate)) show no unexpected client.

**The one residual it cannot fix:** an M2M client that sends an **explicit** `scope` on `/token` without `tool:radar:*` (e.g. `scope=tool:*`) loses radar at deploy, whatever its record holds, until it adds `tool:radar:*` to its request. Nothing logs the requested scope, so these clients cannot be found in advance; the `tool.scope-denied` line is where they show up. `BREAKING_CHANGES.md` carries the client-impact line.

**Rollback stays safe.** Old code ignores the `scopeModel` grant marker, and under the old prefix rule a migrated record's extra `tool:radar:*` changes nothing.

---

## C.X — Analytics Engine SQL query (BL-032.75 Phase 3)

> **Audience**: operator minting AE read tokens. Three consumers exist: (1) the operator baselining pull (`npm run ae:baseline`, env vars in-session), (2) the **Worker's alert-evaluator cron** (Worker secrets — see the variant below), (3) future Grafana Cloud dashboards (deferred until that account exists).

### What you need

- A Cloudflare API token with `Account | Account Analytics | Read` permission (manual mint — see Steps below).
- Your account ID (`npx wrangler whoami` or Cloudflare dashboard URL).

### Steps

1. **Cloudflare dashboard → My Profile → API Tokens → Create Token → "Custom token"**.
2. **Permissions**: `Account` → `Account Analytics` → `Read`. Scope to the account that owns `gst-mcp` / `gst-mcp-staging`.
3. **TTL**: 1 year (rotate annually; track via [SECRETS_INVENTORY.md](../../../../src/docs/operations/SECRETS_INVENTORY.md)).
4. Save the token (Cloudflare shows it ONCE — store in your password manager + the Grafana datasource config).
5. Verify with a `curl` probe:

   ```powershell
   $env:CF_AE_TOKEN = '<the token>'
   $accountId = '<your account id>'
   curl -X POST `
     -H "Authorization: Bearer $env:CF_AE_TOKEN" `
     -H "Content-Type: application/json" `
     "https://api.cloudflare.com/client/v4/accounts/$accountId/analytics_engine/sql" `
     --data 'SELECT count() AS total FROM mcp_events_staging WHERE timestamp > NOW() - INTERVAL ''1'' DAY'
   ```

   Expect `{"data":[{"total":<n>}],...}` with `n` ≥ 0.

### Worker-secret variant — alert-evaluator cron (BL-032.75 Phase 3)

The `*/15` alert-evaluator cron runs AE SQL queries at runtime and consumes the
token as **Worker secrets** (not env vars):

```powershell
npx wrangler secret put CF_AE_TOKEN --env production      # paste at the prompt
npx wrangler secret put CF_ACCOUNT_ID --env production    # account id (treated as secret — kept out of the repo)
```

- **Mint a SEPARATE token for the Worker** (same `Account | Account Analytics | Read`
  scope; track as `gst-mcp-ae-read-worker` in the password manager +
  [SECRETS_INVENTORY.md](../../../../src/docs/operations/SECRETS_INVENTORY.md)) so the
  operator's pull token and the Worker's runtime token rotate independently.
- Both secrets are OPTIONAL by design: when unbound, the AE-backed alert rules
  (traffic-spike, scope-403, oauth-failure-rate) fail open with the gap recorded in
  the evaluation summary; the Upstash/health-backed rules still run.
- Set BEFORE approving the production deploy of a PR that registers the
  evaluator cron — the new cron runs as soon as the `mcp-production`
  approval releases the deploy.

### Per-env dataset names (from `wrangler.toml`)

| Env                | Dataset              |
| ------------------ | -------------------- |
| `wrangler dev`     | `mcp_events_dev`     |
| `--env staging`    | `mcp_events_staging` |
| `--env production` | `mcp_events`         |

### Column map reference

See [`mcp-server/src/metrics/_schema.ts`](../../metrics/_schema.ts) — the snapshot-tested source of truth. Summary:

| Column    | Field                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `blob1`   | `event_type` — every type declared in `metrics/_schema.ts`: `tool_invocation` / `resource_read` / `prompt_invocation` / `rate_limit_decision` / `inoreader_call` / `cron_outcome` / `audit_batch` / `wrong_irl_detected` / `gate_elided` / `trial_signup` / `tier_denial` / `scope_denial` / `oauth_consent`. Every one is emitted in production: BL-157 deleted the never-emitted `prompt_span` and `health_check`, and wired `wrong_irl_detected` / `gate_elided` from `compose_dossier_envelope`, once per run (ADR-0034). `rate_limit_decision` emits on **refusal only**, never `allow` (ADR-0032). `scope_denial` (BL-159) carries the scope-403 attack signal that `scope-mismatch-403-rate` reads — that rule previously queried `blob6='403'` on `tool_invocation`, which nothing writes, so it could never fire |
| `blob2`   | `name` (tool / resource URI / prompt name / cron slug / Inoreader category)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `blob3`   | `keyOwner` (or `__none__` placeholder when not authenticated)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `blob4`   | `outcome` (`success` / `error` / category-specific)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `blob5`   | `correlation_id` (reserved — no writer since BL-157)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `blob6`   | `status_code` (string, e.g. `'200'`; `'0'` = no response received / network error)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `blob7`   | `zone1` (`'1'` / `'0'`; `inoreader_call` only — Zone-1 quota classification; absent for other event types)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `blob8`   | `client_ref` (`OAUTH:<clientId>` — per-client identity, BL-155; absent for static keys and the OAuth human path, which have no per-client subject)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `double1` | `duration_ms`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `double2` | `seq` (`audit_batch` entry count)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `index1`  | `keyOwner` (mirror of blob3 for AE sampling)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

**Phase 1 Step 6 dashboard SQL hints** (BL-032.75 Phase 1 closure):

- Zone-1 daily spend: `SELECT sum(_sample_interval) FROM mcp_events WHERE blob1='inoreader_call' AND blob7='1' AND timestamp > NOW() - INTERVAL '1' DAY` — **not** `count()`, which under-reports once AE samples (corrected 2026-09-09; the dashboard guard enforces this rule on panels, but nothing reads cookbook SQL)
- Per-category breakdown: `... GROUP BY blob2` (excludes `oauth-refresh` automatically via `blob7='1'` filter)
- Inoreader error rate: `... WHERE blob1='inoreader_call' AND blob4='error' GROUP BY blob6` (status code distribution; `'0'` rows isolate network-side failures from Inoreader-side ones)
- Per-keyOwner attribution: `... GROUP BY index1` (authenticated traffic only — cron/oauth-refresh land in `'__none__'`)
- Per-CLIENT attribution (BL-155): `... GROUP BY blob8` with `sum(_sample_interval)`. Use this, not `count(DISTINCT blob8)`, whenever you need a volume — it is sample-correct where a distinct count is not.

### Token rotation

Annual or after any suspected leak:

1. Mint a new token (same permissions).
2. Update the Grafana datasource config + any external dashboards.
3. Revoke the old token in the Cloudflare dashboard.
4. Update [`SECRETS_INVENTORY.md`](../../../../src/docs/operations/SECRETS_INVENTORY.md) with the rotation date.
