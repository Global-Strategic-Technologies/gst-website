# MCP Server Deploy Runbook

> **Audience**: operator (engineer running `wrangler deploy` against staging or production) + future maintainer.
>
> **How to use this doc**:
>
> - **First time deploying?** Read top-to-bottom. Part A (Initial Setup) is one-time-per-operator infrastructure work; Part B (First Deploy) walks you through the staging → soak → production flow; Part C (Ongoing Operations) is what you come back for after the first deploy
> - **Already deployed once and need to do an op task?** Jump to the relevant section in **Part C**
> - **Investigating an incident?** Jump straight to **Part C § C.4 — Tail and investigate** or **Part C § C.6 — Incident triage tree**
>
> **Companion docs** (this doc cross-references them at the right moments — you don't need to read them ahead of time, just follow the links when they appear):
>
> - [`AUTH.md`](./AUTH.md) — bearer-token model, key issuance/rotation/revocation commands
> - [`REMOTE_CLIENT_SETUP.md`](./REMOTE_CLIENT_SETUP.md) — what team-members do to connect their Claude / Cursor / etc. clients
> - [`RATE_LIMITS.md`](./RATE_LIMITS.md) — per-key budgets, RateLimit response headers, circuit-breaker semantics
> - [`SENTRY_MANUAL_SETUP.md` § MCP Worker](../../../../src/docs/development/SENTRY_MANUAL_SETUP.md) — Sentry project setup specifics
> - [`ARCHITECTURE.md`](../ARCHITECTURE.md) — the maintained architecture reference (Q1–Q13 initiative history archived at `src/docs/development/_archive/MCP_SERVER_REMOTE_BL-032.md`)

---

# Part A — Initial Setup (one-time)

These steps stand up the infrastructure the Worker needs. Done once per operator. Each subsection is self-contained — work through them top-to-bottom.

## A.1 — Cloudflare account + Wrangler CLI

### What you need

A Cloudflare account with **Workers** enabled. Free tier is sufficient for BL-032 (100k req/day on free tier covers any plausible team usage). Paid tier becomes necessary later for the [cron substrate's](../ARCHITECTURE.md#cron-substrate) Cron Triggers; ignore for now.

### Steps

1. **Confirm or create a Cloudflare account**:
   - Go to <https://dash.cloudflare.com/> → sign in or sign up
   - The account needs **Edit Cloudflare Workers** permission. If you're using your team's existing account that owns `globalstrategic.tech`, confirm via **Account Members → your email → Permissions**. If you're solo on a new account, this is automatic
2. **Authenticate Wrangler locally** (`wrangler` is already installed as a `mcp-server/` devDependency — no global install needed):
   ```bash
   cd mcp-server
   npx wrangler login
   ```
   This opens a browser tab for OAuth approval. After confirming, return to the terminal.
3. **Verify**:
   ```bash
   npx wrangler whoami
   ```
   Should print your Cloudflare email. If it errors with "Not logged in," repeat step 2.

### What you've completed

✅ Wrangler can deploy to your Cloudflare account.

---

## A.2 — DNS — Worker custom-domain bindings

### What you need

The `globalstrategic.tech` zone managed by Cloudflare DNS (already confirmed during BL-032 planning per [`ARCHITECTURE.md` § Deploy topology](../ARCHITECTURE.md#deploy-topology-q10)). The website's Vercel deployment is fronted by this same zone, so this is a check-and-confirm step rather than a setup step — **as long as the zone is on Cloudflare DNS, Wrangler creates the necessary subdomain records itself when you add a `routes` block to `wrangler.toml`**.

### Steps

1. **Verify zone is on Cloudflare**:
   - <https://dash.cloudflare.com/> → your account → click `globalstrategic.tech`
   - The zone overview page should show "Active" — if it says "Pending nameserver update," DNS isn't pointed at Cloudflare yet (pause and resolve before continuing)
2. **Add the staging custom-domain binding to `wrangler.toml`**. Open [`mcp-server/wrangler.toml`](../../../wrangler.toml) and update the `[env.staging]` block:
   ```toml
   [env.staging]
   name = "gst-mcp-staging"
   routes = [
     { pattern = "mcp-staging.globalstrategic.tech", custom_domain = true }
   ]
   ```
   `custom_domain = true` tells Wrangler to create the DNS record automatically on first deploy — no manual zone edit required.
3. **Add the production custom-domain binding** to the `[env.production]` block:
   ```toml
   [env.production]
   name = "gst-mcp"
   routes = [
     { pattern = "mcp.globalstrategic.tech", custom_domain = true }
   ]
   ```
4. **Commit the `wrangler.toml` change** alongside the deploy commit (Part B will reference this).

### What you've completed

✅ `wrangler.toml` declares the staging + production routes. The DNS records will be created automatically on first deploy of each env.

---

## A.3 — Upstash — provision the MCP database

> **History**: BL-032 Phase 4 originally provisioned **two** Upstash databases here — a
> website-shared Inoreader DB (Read-Only token, `inoreader:*` keys) plus a Worker-owned
> MCP DB. BL-032.8 Phase B (2026-05-17) retired the Inoreader DB alongside the website's
> direct Inoreader client; all Inoreader-related state now lives in the MCP DB under
> `mcp:inoreader:*`. If you're operating an existing deploy that still has
> `UPSTASH_INOREADER_REST_*` bindings, see § C.13 — Decommission legacy Inoreader DB.

### What you need

One Upstash Redis database, free tier:

| DB         | Owner                  | Worker uses                                                                                                                          | Token type                      | Holds                                                                                                          |
| ---------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **MCP DB** | MCP Worker exclusively | Full read+write on `mcp:*` (rate-limit counters, circuit-breaker flag, health probe, Inoreader OAuth tokens, Inoreader-status cache) | **Standard** token (read+write) | All Worker-managed state, including the OAuth `access_token` / `refresh_token` written by `inoreader-oauth.ts` |

The Worker is the sole writer of OAuth-token state under the `mcp:inoreader:*` namespace; the legacy `inoreader:*` namespace is retired.

### Steps

1. **Reach the Upstash console**:
   - **From Vercel**: <https://vercel.com/> → your project → **Storage** tab → click the linked Upstash database → "Open in Upstash" button
   - **Direct**: <https://console.upstash.com/> → Redis

2. **Create the MCP database**:
   - In the Upstash console: **Create Database** (or "+" / "New Database" depending on UI)
   - Name: `gst-mcp` (one DB shared across staging + production for simplicity; both envs hit the same `mcp:*` namespace and isolation is via key prefixes — e.g., `mcp:staging:ratelimit:*` vs `mcp:prod:ratelimit:*`)
   - Region: closest to your Cloudflare + Vercel regions (lowest edge latency)
   - Type: **Regional** (Global has different pricing; Regional is fine for this scale)
   - Eviction policy: **noeviction** (rate-limit counters, the circuit-breaker, and OAuth tokens MUST NOT be silently evicted; we manage TTLs explicitly)
   - Click **Create**

3. **Copy the MCP DB's Standard credentials**:
   - On the new DB's **Details** page → **REST API** section
   - Confirm the toggle is set to **Standard** (NOT Read Only — Worker writes to this DB)
   - Click the copy icon next to `UPSTASH_REDIS_REST_URL` → save it as your **MCP-DB URL**
   - Click the copy icon next to `UPSTASH_REDIS_REST_TOKEN` → save it as your **MCP-DB Standard token**

4. **Save both values in your password manager** with notes:
   - "GST MCP — MCP-DB URL (Worker-owned; sole Upstash binding)"
   - "GST MCP — MCP-DB Standard token (issued: YYYY-MM-DD)"

5. **Set the two secrets for staging**:

   ```bash
   cd mcp-server
   npx wrangler secret put UPSTASH_MCP_REST_URL --env staging
   # Paste the MCP-DB URL
   npx wrangler secret put UPSTASH_MCP_REST_TOKEN --env staging
   # Paste the MCP-DB Standard token
   ```

   > **First-time prompt**: on the **first** secret you put against an env, Wrangler prompts to create the placeholder Worker (`gst-mcp-staging`). Answer **Y**. The actual Worker bundle uploads into that placeholder when you `npm run deploy:staging`.

6. **Set the same two secrets for production** (first production secret prompts to create the `gst-mcp` Worker — answer Y):

   ```bash
   npx wrangler secret put UPSTASH_MCP_REST_URL --env production
   npx wrangler secret put UPSTASH_MCP_REST_TOKEN --env production
   ```

7. **Verify the secrets are set** (lists names only — values are never retrievable):
   ```bash
   npx wrangler secret list --env staging
   npx wrangler secret list --env production
   ```
   Both should include:
   - `UPSTASH_MCP_REST_URL`
   - `UPSTASH_MCP_REST_TOKEN`

### What you've completed

✅ Worker has read+write access to the MCP DB. All Worker-managed state lives under the `mcp:*` namespace; OAuth token state lives under `mcp:inoreader:*` (Worker is sole writer via the single-flight lock in `inoreader-oauth.ts`).

### Reference — rotating the MCP-DB token

If the MCP-DB Standard token is ever compromised, regenerate it from the Upstash console:

1. Upstash console → MCP DB → **Details** → **REST API** → click **Regenerate** next to the Standard token
2. Confirm the prompt; the old token dies immediately
3. Update the Wrangler secret with the new value:
   ```bash
   cd mcp-server
   npx wrangler secret put UPSTASH_MCP_REST_TOKEN --env staging
   npx wrangler secret put UPSTASH_MCP_REST_TOKEN --env production
   npm run deploy:staging && npm run deploy:production    # force isolate refresh
   ```
4. Update your password manager with the new value + rotation date

---

## A.3.5 — Upstash ACL hardening (BL-041)

> **Audience**: operator hardening the Upstash MCP DB to per-purpose ACL users + scoped REST tokens, retiring the default admin token from the Worker binding. Run after § A.3 has provisioned the database. Independent of every other section — safe to run on a live deploy.

### Why

The default `UPSTASH_MCP_REST_TOKEN` (minted in § A.3) is bound to Upstash's `default` user with **full admin permissions on the entire keyspace**. A leak gives an attacker `FLUSHDB`, `CONFIG SET`, `SCRIPT FLUSH`, `KEYS *`, and access to every key — not just our `mcp:*` namespace. The Worker only needs read+write on `mcp:*`. Closing this gap before [BL-033](../../../../src/docs/development/BACKLOG.md#bl-033-mcp-server--external-pilot-phase-3) broadens the operator pool means access-control is settled before stakes rise.

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

### Steps

**Phase 1 — Mint users + REST tokens** (Upstash console)

> **If a prior attempt left stale users**: from the CLI tab, run `ACL DELUSER mcp-worker-rw` and `ACL DELUSER mcp-readonly-ops`, then verify with `ACL LIST` that only `default` remains. ACL SETUSER on an existing user is CUMULATIVE (adds clauses to existing state); a clean restart guarantees no stale keyspace/category leaks from a prior broken state.

1. Upstash console → MCP DB → **CLI** tab. (We use CLI not the ACL-tab Advanced editor because the CLI's response semantics are unambiguous — the auto-generated password is printed inline.)

2. Create `mcp-worker-rw` (NO `>password` clause — Upstash auto-generates and displays it):

   ```
   ACL SETUSER mcp-worker-rw on ~mcp:* ~"" +@read +@write +@scripting -@dangerous
   ```

   **CRITICAL** — Upstash's ACL parser is whitespace-sensitive: a trailing space after `-@dangerous` is interpreted as part of the modifier (`'-@dangerous '` is rejected as unknown). Type or paste the command, then End / Right-arrow to confirm the cursor lands at the immediate end with no trailing space, newline, or invisible character.

   Upstash responds with the auto-generated password. Save it to 1Password under "Upstash gst-mcp ACL — mcp-worker-rw" as `PWD_A`.

3. Create `mcp-readonly-ops` the same way:

   ```
   ACL SETUSER mcp-readonly-ops on ~mcp:* +@read -@dangerous
   ```

   Save the auto-generated password as `PWD_B` in 1Password under "Upstash gst-mcp ACL — mcp-readonly-ops".

4. **Verify each user before minting** — fixes the order-dependency where a token minted before the user has its final ACL state carries stale permissions:

   ```
   ACL GETUSER mcp-worker-rw
   ```

   Confirm the output contains `keys, ~mcp:*` and the commands list shows `+@scripting` and the expanded `+@read`/`+@write` equivalents (`+@string +@set +@hash +@sortedset +@list +@geo +@stream +@hyperloglog +@bitmap +@json +@search +@keyspace` and `-flushdb -flushall -keys` from `-@dangerous`). Same check for `mcp-readonly-ops`.

5. Mint REST tokens (after Step 4 confirms ACL state is correct):

   ```
   ACL RESTTOKEN mcp-worker-rw {PWD_A}
   ```

   Returns a 123-character base64-shaped string starting with `gwAAAA...` — that IS the REST token. Save it into 1Password under "Upstash gst-mcp REST — mcp-worker-rw". (The token visually resembles the password because both are Upstash-internal token formats; compare character-by-character to confirm they differ.)

   Repeat for `mcp-readonly-ops`:

   ```
   ACL RESTTOKEN mcp-readonly-ops {PWD_B}
   ```

   Save into 1Password under "Upstash gst-mcp REST — mcp-readonly-ops".

**Phase 2 — Verify the scoped token before binding** (local)

5. Smoke-probe the new token end-to-end (positive surface + negative surface + Ratelimit SDK round-trip):
   ```powershell
   cd c:\Code\gst-website\mcp-server
   $env:UPSTASH_TEST_URL   = 'https://<db>.upstash.io'          # from § A.3
   $env:UPSTASH_TEST_TOKEN = '<paste mcp-worker-rw REST token>'
   .\scripts\Test-UpstashAcl.ps1
   ```
   Exit code 0 means: every Worker command path passed AND `FLUSHDB`/`CONFIG GET`/`KEYS *`/etc. returned NOPERM AND the `@upstash/ratelimit` SDK round-trip completed cleanly. **If anything fails, do not bind the token** — investigate the ACL string (compare to the Category Rationale table above).

**Phase 3 — Rotate the Worker binding** (one env at a time)

6. **Staging first**:
   ```powershell
   npx wrangler secret put UPSTASH_MCP_REST_TOKEN --env staging
   # paste the mcp-worker-rw REST token; never inline it on the CLI
   npm run deploy:staging
   ```
7. Verify staging:
   ```powershell
   curl https://mcp-staging.globalstrategic.tech/health | ConvertFrom-Json |
     Select-Object upstashMcp, aclSelfCheck
   ```
   Expect `upstashMcp: 'ok'` AND `aclSelfCheck.status: 'ok'`. (`aclSelfCheck` is set in the background by the first request after deploy — give it a few seconds, then re-probe.)
8. Dry-run the cron handler so the 6h cron-window doesn't sit on uncertainty:
   ```powershell
   npx wrangler dev --env staging --test-scheduled
   # in another terminal, with the dev server running:
   curl 'http://localhost:8787/__scheduled?cron=0+*/6+*+*+*'
   ```
   Confirm logs show `cron.scheduled.started` → `cron.radar-refresh.success` (no NOPERM).
9. Run the integration suite against staging:

   ```powershell
   $env:MCP_URL = 'https://mcp-staging.globalstrategic.tech'
   .\scripts\Test-Bl0325.ps1
   ```

   All checks pass = scoped token covers the live tool/resource/prompt surface.

10. **Production**: repeat steps 6–9 with `--env production` and `https://mcp.globalstrategic.tech`.

**Phase 4 — Rollback semantics** (only if something breaks)

`wrangler secret put` and `wrangler deploy` are NOT atomic. If `secret put` succeeds but `deploy` fails (lint gate, build error, network blip), Cloudflare has the new token but the running Worker is still on the OLD secret. To recover:

```powershell
# 1. Re-put the original admin token (kept in 1Password from § A.3)
npx wrangler secret put UPSTASH_MCP_REST_TOKEN --env staging   # or production
# 2. Redeploy to refresh the binding
npm run deploy:staging                                          # or :production
# 3. Verify
curl https://mcp-staging.globalstrategic.tech/health | ConvertFrom-Json |
  Select-Object upstashMcp, aclSelfCheck
```

Worker should return to baseline within ~30 s of the redeploy. The default admin token never gets revoked in Upstash — it stays as the break-glass credential.

### Scoped-token rotation (annual or after suspected leak)

Distinct from the admin-token rotation in [§ A.3 — Reference](#reference--rotating-the-mcp-db-token):

1. Upstash console → CLI tab → `ACL RESTTOKEN mcp-worker-rw <PWD_A>` (yes, the same password — the command re-mints a fresh REST token; the old one is invalidated server-side)
2. Update 1Password with the new token + rotation date
3. Follow Phase 3 above (verify locally → rotate staging → rotate production)

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

### What you've completed

✅ Worker binds a scoped REST token minted from `mcp-worker-rw`; the default admin token remains in 1Password as break-glass only. `mcp-readonly-ops` available for operator triage. Account-level MFA enforced on every member. `/health.aclSelfCheck` surfaces NOPERM regressions as a deploy-level signal — see [`acl-selfcheck.ts`](../../observability/acl-selfcheck.ts) for the probe surface.

---

## A.4 — Inoreader credentials — copy from Vercel

### What you need

The four Inoreader OAuth secrets the website uses, copied from Vercel's environment to Wrangler secrets. These are the **same values** stored in **separate stores** — both Vercel and Cloudflare end up holding the same data.

The Worker reads OAuth tokens from Upstash first ([`ARCHITECTURE.md` § Token storage and OAuth refresh](../ARCHITECTURE.md#token-storage-and-oauth-refresh)); these env-var copies are the seed/fallback values.

### Steps

1. **Pull the Inoreader env vars from Vercel** to a local file:

   ```bash
   # From the gst-website repo root (NOT mcp-server/):
   npx vercel env pull .env.vercel.local
   ```

   This dumps the project's environment variables into `.env.vercel.local`. **Treat as sensitive — delete after step 4.**

   > **Prerequisite — `vercel link` (first-time only)**: if Vercel CLI errors with `Your codebase isn't linked to a project on Vercel. Run 'vercel link' to begin.`, run this first:
   >
   > ```bash
   > npx vercel link
   > ```
   >
   > Interactive — answer **Y** to "set up and develop", pick your scope, and choose **Existing project** → `gst-website`. Creates a `.vercel/` directory that subsequent `vercel env pull` commands depend on.

2. **Extract the four Inoreader values** — pick the snippet for your shell:
   ```bash
   # bash / zsh / Git Bash:
   grep -E '^INOREADER_' .env.vercel.local
   ```
   ```powershell
   # PowerShell (Windows-native — `grep` isn't on PATH):
   Select-String -Path .env.vercel.local -Pattern '^INOREADER_'
   ```
   You should see `INOREADER_APP_ID`, `INOREADER_APP_KEY`, `INOREADER_ACCESS_TOKEN`, `INOREADER_REFRESH_TOKEN` — four lines. If any are missing, check the Vercel dashboard's **Settings → Environment Variables** to ensure they exist on the Vercel side first.
3. **Set each as a Wrangler secret for both envs**:
   ```bash
   cd mcp-server
   for ENV in staging production; do
     npx wrangler secret put INOREADER_APP_ID --env $ENV         # paste the value
     npx wrangler secret put INOREADER_APP_KEY --env $ENV
     npx wrangler secret put INOREADER_ACCESS_TOKEN --env $ENV
     npx wrangler secret put INOREADER_REFRESH_TOKEN --env $ENV
   done
   ```
   (The bash loop is for clarity — in practice you'll paste each value individually since `wrangler secret put` is interactive. Eight `wrangler secret put` invocations total, four per env.)
4. **Delete the local file** once you're done — it has the secrets in plaintext:
   ```bash
   rm .env.vercel.local
   ```

### What you've completed

✅ Worker has the Inoreader app + OAuth credentials. The radar-live tools use them to make API calls. (The Worker is the **sole** Inoreader caller and token-refresh writer per BL-032.8 — see [`ARCHITECTURE.md` § Radar pipeline](../ARCHITECTURE.md#radar-pipeline-single-caller-unification); the original Q4 fork decision it superseded is in the archived BL-032 doc.)

---

## A.4.5 — Cloudflare Analytics Engine — typed-metric instrumentation (BL-032.75 Phase 1)

### What you need

- Cloudflare account (already set up in [A.1](#a1--cloudflare-account--wrangler-cli)).
- Workers Free plan (verified sufficient per [Cloudflare AE pricing](https://developers.cloudflare.com/analytics/analytics-engine/pricing/) on 2026-05-27: 100k writes/day + 10k reads/day + 3-month retention).

### Steps

**One-time account-level enable.** Cloudflare's [get-started page](https://developers.cloudflare.com/analytics/analytics-engine/get-started/) claims datasets auto-materialize on first `writeDataPoint` after the binding is declared, but **first-deploy reality (2026-05-28)** is that Analytics Engine has to be enabled on the account first. The "enable" surface is the **Create Blank Dataset** dialog in the dashboard — creating ANY dataset there flips the account-level switch.

The fastest way to do this:

1. **Cloudflare dashboard** → Workers & Pages → **Analytics Engine** in the left nav (or direct link from the deploy error message)
2. Click **Create Blank Dataset**
3. **Dataset Name**: `mcp_events_staging` (match the staging dataset name pinned in `wrangler.toml`)
4. **Dataset Binding**: `METRICS` (match the binding name)
5. Click **Create Dataset**
6. Close the "binding info" modal that follows — our `wrangler.toml` already declares the binding it shows

After this one-time enable, the deploy succeeds AND every subsequent dataset (`mcp_events`, `mcp_events_dev`) auto-materializes on first write. The dashboard text confirms this — "the dataset will not appear until after you bind it to a worker and write data to it."

### Per-env dataset map (already pinned in `wrangler.toml`)

| Env                         | Dataset              | Binding   | Created via                                      |
| --------------------------- | -------------------- | --------- | ------------------------------------------------ |
| `wrangler dev` (no `--env`) | `mcp_events_dev`     | `METRICS` | Auto on first write                              |
| `--env staging`             | `mcp_events_staging` | `METRICS` | **Manual dashboard step (account-level enable)** |
| `--env production`          | `mcp_events`         | `METRICS` | Auto on first write (after staging step above)   |

### Verification (after first deploy)

1. `npx wrangler deploy --env staging` — should succeed cleanly post-enable
2. `npx wrangler deploy --env production` — auto-binds without dashboard prompts (the account-level enable carries over)
3. Look at the deploy output's bindings table — confirms `env.METRICS (mcp_events_staging)` for staging and `env.METRICS (mcp_events)` for production. Different dataset names = different AE datasets = no staging/prod contamination.
4. After the next cron firing (or any authenticated MCP request that exercises a tool/resource/prompt), `npx wrangler tail --env <env>` should show no `metrics.sink.write_failed` lines. If one appears, the binding-vs-dataset shape is wrong — re-check `wrangler.toml`.
5. Within ~5-10 min of first writes, the Cloudflare dashboard → Workers & Pages → Analytics Engine should show both datasets populated.
6. (Optional, requires Phase 3 token — see [C.X below](#cx--analytics-engine-sql-query-bl-03275-phase-3)): query AE via the SQL API and confirm rows.

### What you've completed

✅ AE is enabled at account level. Both per-env datasets exist (or will auto-materialize on first write). Instrumented Tool / Resource / Prompt invocations write events to the per-env dataset.

---

## A.5 — Sentry — create new project + DSN secret

### What you need

A **new** Sentry project (separate from the website's per [`ARCHITECTURE.md` § Sentry split](../ARCHITECTURE.md#sentry-split-q6)). Full step-by-step lives in [`SENTRY_MANUAL_SETUP.md` § MCP Worker](../../../../src/docs/development/SENTRY_MANUAL_SETUP.md#mcp-worker-bl-032-phase-5).

### Steps

1. **Follow `SENTRY_MANUAL_SETUP.md` § MCP Worker → "One-time setup"** to:
   - Create the project in the Sentry dashboard (platform: Cloudflare Workers, name: `gst-mcp-server`)
   - Copy the DSN from the project's Client Keys page
2. **Set the DSN as a Wrangler secret** for both envs (this step is in that doc, repeated here for the linear flow):
   ```bash
   cd mcp-server
   npx wrangler secret put SENTRY_DSN --env staging
   # Paste the DSN at the prompt
   npx wrangler secret put SENTRY_DSN --env production
   ```
3. **Optional — alert rules** can be configured per `SENTRY_MANUAL_SETUP.md` § MCP Worker → "Alert rules" later. They aren't blocking for the first deploy.

### What you've completed

✅ Worker exceptions and traces flow to a dedicated MCP Sentry project. Until the first deploy actually serves traffic, no events will appear there.

---

## A.6 — Initial bearer key (just yourself for the soak)

### What you need

One bearer token for yourself, named `MCP_KEY_<INITIALS>` per the [`AUTH.md`](./AUTH.md#key-naming-convention) convention. BL-032's baseline is **only the operator** during the one-week soak; full team rollout happens in Part C § C.1 after production stabilizes.

### Steps

1. **Generate a cryptographically-random token** (~43 chars, base64url-encoded — pick the snippet for your shell):
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
   All three produce the same shape of output. Copy the value.
2. **Save the token in your password manager** (1Password, Bitwarden, KeePass, browser-built-in — any secrets store you trust) with a note like "GST MCP — RP — staging+production". You'll use this value to configure your own client (Part B § B.4) AND when production is wired up. The doc references "your password manager" generically throughout the rest of A.6 / C.1 / C.2.
3. **Set as a Wrangler secret for staging**:
   ```bash
   cd mcp-server
   npx wrangler secret put MCP_KEY_RP --env staging
   # Paste the token value at the prompt
   ```
   Replace `RP` with your own initials. The **suffix becomes your `keyOwner`** in logs (per [`AUTH.md` § Attribution in logs](./AUTH.md#attribution-in-logs)).
4. **Skip production for now**. The production key is set in Part B § B.6 just before the production deploy — keeping it unset until the staging soak proves the surface stable.

### What you've completed

✅ One bearer key for yourself, on staging. The full [`AUTH.md`](./AUTH.md) reference covers token-value generation + the rotation/revocation runbooks for later.

---

## A.6.1 — BL-032.8 Phase 3 — Narrow-scope key for the website's `/radar/snapshot` consumer

This step issues the website's bearer key for the `GET /radar/snapshot` HTTP convenience endpoint (BL-032.8 Phase 3). Skip this section if you haven't reached the Phase 3 deploy yet.

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

1. **Generate a token** using any of the random-bytes snippets from A.6 step 1. Save in your password manager labeled "GST MCP — WEBSITE_RADAR — staging+production".
2. **Set as Wrangler secrets on staging** — TWO secrets, the second is JSON-encoded:
   ```bash
   cd mcp-server
   npx wrangler secret put MCP_KEY_WEBSITE_RADAR --env staging
   # Paste the token value at the prompt
   npx wrangler secret put MCP_KEY_WEBSITE_RADAR_SCOPES --env staging
   # Paste: ["resource:radar:read"]
   # (Yes, including the brackets and quotes — it's a JSON array literal.)
   ```
3. **Repeat for production** when you're ready to deploy Phase 4 (website cutover):
   ```bash
   npx wrangler secret put MCP_KEY_WEBSITE_RADAR --env production
   npx wrangler secret put MCP_KEY_WEBSITE_RADAR_SCOPES --env production
   ```
4. **Add the same value to Vercel** when wiring the website cutover (Phase 4):
   ```bash
   # From the website repo (not mcp-server):
   vercel env add MCP_KEY_WEBSITE_RADAR
   # Paste the same token used on the Worker side. Apply to production +
   # preview targets.
   ```

### Verification

Smoke-test the endpoint with the new bearer (staging shown; substitute prod when deployed):

```bash
curl -s -H "Authorization: Bearer <token>" \
  https://mcp-staging.globalstrategic.tech/radar/snapshot \
  | head -c 500
```

Expected: HTTP 200 with JSON body `{ wire: {...}, fyi: {...}, fetchedAt: "..." }`.

Without the bearer, expect HTTP 401. With a token that's missing the `resource:radar:read` scope (e.g., a key configured with `MCP_KEY_<OWNER>_SCOPES=["tool:*"]`), expect HTTP 403 with `{ "error": "forbidden", "missingScope": "resource:radar:read", "ownedScopes": [...] }`.

### What you've completed

✅ Narrow-scope bearer key issued for the website's `/radar/snapshot` consumer, on staging (and production when ready). The endpoint is now usable by any consumer that knows the bearer; the narrow scope keeps the audit trail clean.

---

## A.7 — Local validation gate

Before any `wrangler deploy`, verify the local build works. This catches the most common deploy-time blocker (a broken bundle) before it reaches Cloudflare's edge.

### Steps

```bash
cd mcp-server
npm test                                                # all tests green (380+ vitest)
npm run typecheck                                       # tsc --noEmit clean
npx wrangler deploy --dry-run --env staging            # bundle builds successfully
```

If any of these fail, **do not deploy** — fix locally first.

### What you've completed

✅ Local toolchain is green. Ready to deploy.

---

# Part B — First Deploy (one-time, sequential)

Work through these in order. Don't skip B.5 (the soak window) — production deploy is gated on staging being stable for one week.

## B.1 — Local pre-flight

Run the validation gate from § A.7 one more time as the literal pre-deploy check. Skip if you just ran it.

```bash
cd mcp-server
npm test
npm run typecheck
npx wrangler deploy --dry-run --env staging
```

All three green → proceed.

---

## B.2 — Deploy to staging

```bash
cd mcp-server
npm run deploy:staging
```

Wraps `wrangler deploy --env staging --var GIT_SHA:$(git rev-parse --short HEAD)` via [`scripts/deploy.mjs`](../../../scripts/deploy.mjs) so the deployed Worker can surface its commit SHA on `/health` (read by [`health.ts`](../../observability/health.ts) line 122). The wrapper script is cross-platform (Windows/macOS/Linux); a bare `wrangler deploy` works too but leaves `gitSha: "unknown"` on `/health`.

Pass extra wrangler flags through `--`, e.g. `npm run deploy:staging -- --dry-run`.

Wrangler:

1. Bundles the Worker (`src/worker.ts` + dependencies, ~2.5MB / 494KB gzip)
2. Uploads to Cloudflare
3. **Creates the `mcp-staging.globalstrategic.tech` DNS record** because of the `custom_domain = true` declaration in `wrangler.toml` (added in § A.2). Wrangler may prompt to confirm the route binding the first time — answer yes
4. Issues an SSL cert for the subdomain (Cloudflare handles this automatically on a Cloudflare-managed zone)

Expected output ends with something like:

```
Deployed gst-mcp-staging triggers (Xs)
  https://mcp-staging.globalstrategic.tech
Current Version ID: <uuid>
```

If the deploy fails with a **route conflict**, the subdomain may already exist from a prior attempt — go to Cloudflare dashboard → zone → DNS, delete any existing `mcp-staging` record, retry.

---

## B.3 — Smoke validation

A 7-step curl sequence to verify each layer of the request flow. Run these against the staging URL immediately after § B.2 completes.

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
> **PowerShell-native helpers — checked in at [`mcp-server/scripts/Invoke-McpRequest.ps1`](../../../scripts/Invoke-McpRequest.ps1).** Dot-source it once per soak terminal:
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
> - **`Invoke-McpTool -Name <toolName> [-Arguments <hash>] [-Id <n>]`** — convenience wrapper around `tools/call`. Issues the call and returns `result.structuredContent` — the tool's payload — directly. (Since 0.43.0 / BL-090 the payload travels only in the structured channel; `result.content[0].text` is a one-line human caption.)
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

Expected (right after first deploy, before any radar traffic):

```json
{
  "ok": false,
  "version": "0.1.0",
  "gitSha": "abc1234",
  "phase": "BL-032 Phase 5 (observability)",
  "upstashMcp": "ok",
  "inoreader": "unknown",
  "inoreaderObservedAt": null,
  "radarSnapshotAgeSeconds": null
}
```

`gitSha` shows the 7-character short SHA of the commit you deployed (matches `git rev-parse --short HEAD` at deploy time). If it shows `"unknown"`, the deploy bypassed the `npm run deploy:staging` wrapper script — `npx wrangler deploy --env staging` directly skips the GIT_SHA injection.

`ok: false` is **expected** initially because `inoreader: 'unknown'` — but `inoreader: 'unknown'` is NOT a degraded signal, just "no recent traffic." It flips to `'ok'` after the first successful radar-tool call (B.3.6 below).

`upstashMcp: 'ok'` confirms the MCP DB is reachable (rate-limiter, circuit-breaker, and OAuth-token writes all land here). If it's `'degraded'`, see [§ A.3](#a3--upstash--provision-the-mcp-database) for which secrets to verify.

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

Expected output: **10 tool names** — the transport-portable surface (no `search_radar_offline` and no `search_radar_cache` alias on the Worker; per [`ARCHITECTURE.md` § Transport binding per tool](../ARCHITECTURE.md#transport-binding-per-tool-q12), both are stdio-only and registered exclusively by `_local-only.ts`):

```
"assess_infrastructure_cost_governance"
"compute_techpar"
"estimate_tech_debt_cost"
"generate_diligence_agenda"
"get_latest_insights"
"list_portfolio_facets"
"list_regulation_facets"
"search_portfolio"
"search_radar"
"search_regulations"
```

If you see `search_radar_offline` or `search_radar_cache` in this list, that's a real bug — they should not register on the Worker. Stdio-only entries appearing on the Worker would indicate `_local-only.ts` got pulled into the Worker bundle (regression).

### B.3.4 — Invoke a non-radar tool

```bash
curl -s $MCP_URL/mcp \
  -H "Authorization: Bearer $MCP_KEY" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_portfolio_facets","arguments":{}}}' | jq
```

Expected: a JSON response with `result.structuredContent` containing the deduplicated themes / engagement categories / etc. for the M&A portfolio. (`result.content[0].text` carries a one-line caption, not the data — see ADR-0011.)

### B.3.5 — Verify rate-limit headers

The response from B.3.4 should include:

```
RateLimit-Limit: 60
RateLimit-Remaining: 59
RateLimit-Reset: <seconds-until-window-resets>
```

If `RateLimit-*` headers are absent, the limiter took the graceful-skip path → the **MCP DB** isn't reachable (rate-limit state lives in `mcp:*` and writes to the MCP-DB). Re-check that `UPSTASH_MCP_REST_URL` + `UPSTASH_MCP_REST_TOKEN` are set per § A.3 step 5/6.

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

## B.4 — Configure your own client against staging

Use [`REMOTE_CLIENT_SETUP.md`](./REMOTE_CLIENT_SETUP.md) to point Claude Desktop / Claude Code / Cursor at the staging URL. The walkthrough has per-client snippets.

For a quick smoke from inside Claude Desktop after configuring:

> _"List the GST portfolio facets."_

The response should reference the deduplicated themes / engagement categories from your dataset. If Claude says "I don't have access to that tool," the client config didn't pick up the new server — restart the client.

---

## B.5 — Soak for one week

Use the staging deploy as your daily MCP. Watch for:

- **Sustained `ratelimit.skipped` log lines** → MCP DB unreachable; check `UPSTASH_MCP_*` secrets and Upstash status
- **Inoreader 429s** → circuit breaker should engage cleanly; verify with `/health` showing `inoreader: "degraded"` **and `circuitOpen: true`**, and the radar tools returning cached results flagged `liveInfo.degraded: true` (structured 503s only when nothing is cached)
- **Claude Desktop / Claude Code reconnects after restart** without re-prompting → connection persistence is working
- **Sentry events** → if you set up the alert rules in § A.5, you should see baseline traffic but no error noise

After ~7 days of routine use without surfacing real issues, proceed to § B.6.

---

## B.6 — Deploy to production

Production secrets were already provisioned in § A.3, A.4, A.5. The remaining step is the production bearer key + the deploy.

### Steps

1. **Set your production bearer key** (re-using the SAME token value as staging — operator convenience for the soak; rotate later):
   ```bash
   cd mcp-server
   npx wrangler secret put MCP_KEY_RP --env production
   # Paste the SAME value from § A.6
   ```
2. **Deploy**:
   ```bash
   npm run deploy:production
   ```
   Wraps `wrangler deploy --env production --var GIT_SHA:$(git rev-parse --short HEAD)` via [`scripts/deploy.mjs`](../../../scripts/deploy.mjs). Same flow as B.2 but against `mcp.globalstrategic.tech`.
3. **Smoke against production**: re-run § B.3.1 through B.3.7 with `MCP_URL=https://mcp.globalstrategic.tech`. Same expectations.
4. **End-to-end verify from Claude Desktop**: re-do § B.4 with the production URL, run the same smoke prompt.

If any production smoke fails:

- **Auth or rate-limit issue** → check `wrangler secret list --env production`; ensure all secrets are present
- **DNS not resolving** → wait 1-2 minutes for the new DNS record to propagate; if persistent, check Cloudflare dashboard → DNS for `mcp.globalstrategic.tech`
- **5xx errors** → roll back per Part C § C.3 and investigate

---

## B.7 — Post-deploy doc cleanup

The consumer-facing setup doc has placeholder URLs that need updating once production is live.

### Steps

1. **Open** [`REMOTE_CLIENT_SETUP.md`](./REMOTE_CLIENT_SETUP.md)
2. **Replace** all instances of `<PROD_URL_PLACEHOLDER>` (or whatever the staging URL was used in the file) with the actual production URL `https://mcp.globalstrategic.tech/mcp`
3. **Update the status banner** at the top of the doc to reflect "production live as of YYYY-MM-DD"
4. **Commit** the doc-only change and merge

This unblocks team-member onboarding (Part C § C.1).

---

# Part C — Ongoing Operations

After Part B, this is the day-to-day reference. No need to read sequentially — jump to whichever section applies.

## C.1 — Add a new team-member key

> See [`AUTH.md` § Issue a new key](./AUTH.md#issue-a-new-key) for the canonical command reference. This section adds the operational onboarding sequence.

### When to do this

A team-member (e.g., "AB") needs MCP access. Confirm with them:

- They're using a Claude/Cursor client that supports remote MCP (see [`REMOTE_CLIENT_SETUP.md`](./REMOTE_CLIENT_SETUP.md))
- They have a password-manager vault you can share into (1Password, Bitwarden, etc. all work)

### Steps

1. **Generate a fresh token** (use any of the snippets from § A.6 step 1 — `openssl`, Node, or PowerShell — they all produce equivalent output):
   ```bash
   openssl rand -base64 32 | tr -d '=' | tr '/+' '_-'
   ```
2. **Store in your password manager** with a note "GST MCP — AB — production". Share the entry to AB's vault
3. **Set the secret on production** (skip staging unless they specifically need staging access for testing):
   ```bash
   cd mcp-server
   npx wrangler secret put MCP_KEY_AB --env production
   # Paste the token value
   ```
   The Worker picks up new secrets within ~30 seconds (next isolate cold-start). For an immediate effect, force a redeploy:
   ```bash
   npm run deploy:production
   ```
4. **Notify AB**: send them a link to [`REMOTE_CLIENT_SETUP.md`](./REMOTE_CLIENT_SETUP.md) and tell them their token is in your password manager
5. **Verify with AB**: ask them to run a smoke prompt in their client. If they see tool results, you're done. If they see 401, walk them through the troubleshooting tree in REMOTE_CLIENT_SETUP.md
6. **Update your team-member-roster** (kept in your password manager / shared spreadsheet) with AB's `keyOwner` suffix and the date issued

---

## C.2 — Rotate / revoke a key

> See [`AUTH.md` § Rotate a key](./AUTH.md#rotate-a-key) and [`AUTH.md` § Revoke a key (permanent)](./AUTH.md#revoke-a-key-permanent) for command reference.

### Rotation triggers

| Trigger                                                                                | Urgency       | Action                                                                                                                                                                 |
| -------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Suspected token compromise (pasted into wrong channel, etc.)                           | **Immediate** | Rotate now; investigate after                                                                                                                                          |
| Team-member offboarding                                                                | **Immediate** | Revoke (delete, no re-issue)                                                                                                                                           |
| Suspicious traffic from one keyOwner (origins not matching their normal usage pattern) | **Immediate** | Rotate; investigate via `wrangler tail`                                                                                                                                |
| Periodic prophylactic rotation                                                         | **Eventual**  | TBD; BL-032 doesn't enforce. Automated quarterly rotation is a [BL-033](../../../../src/docs/development/BACKLOG.md#bl-033-mcp-server--external-pilot-phase-3) concern |

### Rotate (compromise)

1. **Generate the new token** (per § A.6 step 1 — `openssl rand -base64 32 | tr -d '=' | tr '/+' '_-'`, or Node/PowerShell equivalents on Windows)
2. **Delete and re-set the secret** for both envs:

   ```bash
   cd mcp-server
   npx wrangler secret delete MCP_KEY_AB --env staging
   npx wrangler secret put MCP_KEY_AB --env staging
   # Paste the NEW token

   npx wrangler secret delete MCP_KEY_AB --env production
   npx wrangler secret put MCP_KEY_AB --env production
   ```

3. **Update your password manager** with the new value (share the entry to the team-member's vault)
4. **Notify the team-member**: their old token is dead; update their client config with the new one
5. **Force redeploy** for an immediate effect:
   ```bash
   npm run deploy:staging && npm run deploy:production
   ```
6. **Investigate the compromise**: check `wrangler tail` for the rotation window's traffic on the old `keyOwner`; check Sentry for unusual events

### Revoke (offboarding)

```bash
cd mcp-server
npx wrangler secret delete MCP_KEY_AB --env staging
npx wrangler secret delete MCP_KEY_AB --env production
npm run deploy:production    # force pickup
```

The team-member's client now returns 401 on all calls. No re-issue. Update your team-member-roster.

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

```bash
cd mcp-server
npx wrangler rollback --env production
# Wrangler shows a list of recent versions; pick the previous version
```

The rollback takes effect within seconds. Verify:

```bash
curl https://mcp.globalstrategic.tech/health | jq
```

`version` field should reflect the previous deploy's version number (or git SHA, if injected). Run § B.3 smoke again to confirm subsystems are healthy.

### After rollback — investigate

1. **Capture the broken state in a Sentry issue** if you haven't already (any unhandled exceptions captured by withSentry are already there)
2. **Check the deploy diff** — `git log <previous>..<broken>` to see what shipped
3. **Reproduce locally** with `wrangler dev` against the broken commit; identify the regression
4. **Fix on a branch**, run the full local validation gate (§ A.7), redeploy

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
# (your password manager); they were set in § A.3 step 5/6 as UPSTASH_MCP_REST_*.
curl -X POST "$UPSTASH_MCP_REST_URL/del/mcp:radar:circuit-open" \
  -H "Authorization: Bearer $UPSTASH_MCP_REST_TOKEN"
```

The next radar-tool call will hit Inoreader; if it succeeds, the breaker stays closed; if Inoreader still 429s, it re-opens with a fresh 6h TTL.

### When the budget itself is the problem

If radar tools 429 repeatedly across the team — and Inoreader's status page is fine — the issue is GST's daily budget exhaustion. Check the budget envelope in [`src/docs/hub/RADAR.md` § Budget envelope](../../../../src/docs/hub/RADAR.md):

- Website ISR: ~28 calls/day (Vercel-hosted, fixed at 6h ISR)
- MCP per-key: capped at 50/day per key by the rate-limiter
- BL-032.5 Cron snapshot (when shipped): ~24 calls/day

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
npm run deploy:production
```

On first cron tick after re-deploy, `refreshAccessToken('cron')` reads `INOREADER_REFRESH_TOKEN` from env (since Upstash MCP DB key is empty/stale), refreshes successfully, and persists the new `mcp:inoreader:access_token` + `mcp:inoreader:refresh_token` to the MCP DB. The env-var values become stale at that point — that's expected; the Upstash key takes over.

---

## C.6 — Incident triage tree

A bounded decision tree for "the MCP is broken" reports. Walk through these in order:

1. **Is the Worker reachable at all?**
   - `curl https://mcp.globalstrategic.tech/health` — does it respond at all?
   - **5xx or timeout** → Worker isolate is crashing or Cloudflare's edge is having issues. Check Cloudflare's status page; check Sentry for unhandled exceptions; if needed, `wrangler rollback --env production` to the previous deploy
   - **200 with `ok: false`** → Worker is up but a subsystem is degraded. Continue to step 2

2. **Which subsystem is degraded?** Read the `/health` JSON:
   - `upstashMcp: 'degraded'` → MCP DB unreachable or misconfigured (rate-limit, circuit-breaker, health probe, inoreader-status cache, and Inoreader OAuth tokens all live here). Check Upstash status for the MCP DB; check `UPSTASH_MCP_REST_URL` + `UPSTASH_MCP_REST_TOKEN` are set via `wrangler secret list --env production`. Worker still serves auth + non-radar tools (rate-limit falls open with a warning); radar tools degrade when cache + OAuth token writes fail
   - `inoreader: 'degraded'` → Last Inoreader **API** call failed (429, 5xx, or timeout) — this is the upstream Inoreader service, not the Upstash DB. See § C.5 — usually circuit-breaker handling is correct; investigate if alerts surface this for >1 hour
   - `inoreader: 'unknown'` with no recent radar traffic → Not a problem. If radar traffic is expected and `inoreaderObservedAt` is null after 30+ min, something's wrong with the radar tools' status reporting (check Sentry)

3. **Are users seeing 401s but the operator confirms keys are configured?**
   - Possibly a key was deleted/rotated. Run `wrangler secret list --env production`; cross-reference your team-member-roster
   - If keys are present and correct, check `wrangler tail` for the specific 401 reason — `Missing Authorization header`, `Bearer scheme`, `Empty Bearer token`, or `Invalid Bearer token` each have different fixes

4. **Are users seeing 429s on legitimate work?**
   - One user → check their tool-call pattern; if they're authoring an agent loop, raise the budget temporarily or have them switch to `search_radar_offline` (stdio-only, doesn't count against the budget)
   - All users → see § C.5 ("When the budget itself is the problem")

5. **Worker is up, subsystems are healthy, users still complain something doesn't work.**
   - Look at the actual MCP error envelopes the user is seeing — they carry structured `error` codes that map directly to causes in [USAGE_REMOTE.md](./REMOTE_CLIENT_SETUP.md#troubleshoot)
   - If the symptom is "wrong tool result" or "schema validation error," it's an MCP protocol or tool-handler bug. Reproduce locally with `wrangler dev`; check Sentry for relevant traces

### When to escalate

- **Sustained 5xx rate** (>1% over 15 min) → page oncall, consider `wrangler rollback`
- **Inoreader budget exhausted >24h** → escalate to paid Inoreader tier
- **Suspected key compromise** (one keyOwner shows traffic from unexpected origins) → rotate the key immediately per [AUTH.md § Rotate a key](./AUTH.md#rotate-a-key)
- **Cloudflare platform issues** → can't fix; communicate to users; Cloudflare's SLA covers it

The MCP server's blast radius is bounded — it's an internal tool, BL-033 hasn't shipped external clients yet, and nothing about the website depends on it. An outage is inconvenient, not contractual. That calculus changes when [BL-033](../../../../src/docs/development/BACKLOG.md#bl-033-mcp-server--external-pilot-phase-3) ships.

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
- Set BEFORE merging a PR that registers the evaluator cron — production
  auto-deploys on merge.

### Per-env dataset names (from `wrangler.toml`)

| Env                | Dataset              |
| ------------------ | -------------------- |
| `wrangler dev`     | `mcp_events_dev`     |
| `--env staging`    | `mcp_events_staging` |
| `--env production` | `mcp_events`         |

### Column map reference

See [`mcp-server/src/metrics/_schema.ts`](../../metrics/_schema.ts) — the snapshot-tested source of truth. Summary:

| Column    | Field                                                                                                                                                                 |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `blob1`   | `event_type` (`tool_invocation` / `resource_read` / `prompt_invocation` / `prompt_span` / `rate_limit_decision` / `inoreader_call` / `health_check` / `cron_outcome`) |
| `blob2`   | `name` (tool / resource URI / prompt name / cron slug / Inoreader category)                                                                                           |
| `blob3`   | `keyOwner` (or `__none__` placeholder when not authenticated)                                                                                                         |
| `blob4`   | `outcome` (`success` / `error` / category-specific)                                                                                                                   |
| `blob5`   | `correlation_id` (prompt_span only)                                                                                                                                   |
| `blob6`   | `status_code` (string, e.g. `'200'`; `'0'` = no response received / network error)                                                                                    |
| `blob7`   | `zone1` (`'1'` / `'0'`; `inoreader_call` only — Zone-1 quota classification; absent for other event types)                                                            |
| `double1` | `duration_ms`                                                                                                                                                         |
| `double2` | `seq` (prompt_span step index)                                                                                                                                        |
| `index1`  | `keyOwner` (mirror of blob3 for AE sampling)                                                                                                                          |

**Phase 1 Step 6 dashboard SQL hints** (BL-032.75 Phase 1 closure):

- Zone-1 daily spend: `SELECT count() FROM mcp_events WHERE blob1='inoreader_call' AND blob7='1' AND timestamp > NOW() - INTERVAL '1' DAY`
- Per-category breakdown: `... GROUP BY blob2` (excludes `oauth-refresh` automatically via `blob7='1'` filter)
- Inoreader error rate: `... WHERE blob1='inoreader_call' AND blob4='error' GROUP BY blob6` (status code distribution; `'0'` rows isolate network-side failures from Inoreader-side ones)
- Per-keyOwner attribution: `... GROUP BY index1` (authenticated traffic only — cron/oauth-refresh land in `'__none__'`)

### Token rotation

Annual or after any suspected leak:

1. Mint a new token (same permissions).
2. Update the Grafana datasource config + any external dashboards.
3. Revoke the old token in the Cloudflare dashboard.
4. Update [`SECRETS_INVENTORY.md`](../../../../src/docs/operations/SECRETS_INVENTORY.md) with the rotation date.

---

## C.13 — Decommission legacy Inoreader DB (BL-032.8 Phase B one-time)

> ## ✅ Completed 2026-05-27
>
> The one-time decommission ran during the BL-032.8 Phase B closure session. This section is retained for two reasons: (a) the same pattern applies to any future "retire a parallel DB" operation, and (b) the prerequisite/step/rollback structure documents the safety reasoning. Future readers: this is historical reference, not a pending task.

> **Audience** (historical): operator running the BL-032.8 Phase B retirement (PR #140). Skip this section if your Worker was deployed fresh post-2026-05-17 — there's nothing legacy to decommission.
>
> **Vercel-side cleanup**: § C.13 below covers the Worker side. The Vercel `INOREADER_*` env var sweep + Vercel↔Upstash integration disconnect lived in [`_archive/BL-032_8_SOAK_GATE.md`](./_archive/BL-032_8_SOAK_GATE.md) — see that doc for the Vercel walkthrough. Both halves ran the same day; both are now `✅ Completed 2026-05-27`.

BL-032.8 Phase B retired the website-shared **Inoreader DB** (the `gst-radar-tokens` Upstash database that held the `inoreader:*` OAuth-token namespace). After Phase A landed and stabilized through the 7-day soak, the database had no remaining writer (the website's `inoreader/client.ts` was deleted) and no remaining reader (the Worker's dual-read fallback was removed in Phase B). This section walks through the operator-side cleanup.

### Prerequisites

- [ ] PR #140 (or its successor) has been merged to `master`
- [ ] Production Worker has been re-deployed past the Phase B commit (verify via `curl https://mcp.globalstrategic.tech/health | jq .gitSha`)
- [ ] `/health` no longer reports `upstashInoreader` (confirms the new code path is live)

### Steps

1. **Delete the Worker secrets** (4 total — staging + production):

   ```bash
   cd mcp-server
   npx wrangler secret delete UPSTASH_INOREADER_REST_URL --env staging
   npx wrangler secret delete UPSTASH_INOREADER_REST_TOKEN --env staging
   npx wrangler secret delete UPSTASH_INOREADER_REST_URL --env production
   npx wrangler secret delete UPSTASH_INOREADER_REST_TOKEN --env production
   ```

   Each invocation prompts for confirmation; review the env each time.

2. **Verify they're gone**:

   ```bash
   npx wrangler secret list --env staging | grep -i inoreader_rest || echo "clean"
   npx wrangler secret list --env production | grep -i inoreader_rest || echo "clean"
   ```

   Both should print `clean`. `INOREADER_APP_ID` / `INOREADER_APP_KEY` / `INOREADER_ACCESS_TOKEN` / `INOREADER_REFRESH_TOKEN` should still be present — those are the OAuth credentials the Worker uses to talk to Inoreader's API directly. Only the `UPSTASH_INOREADER_REST_*` bindings (which pointed at the legacy DB) get removed.

3. **Confirm the Worker still works post-secret-removal**: re-run § B.3.1 through B.3.7 against production. `/health` should return `upstashMcp: 'ok'` (no `upstashInoreader` field); a `search_radar` smoke call should succeed.

4. **Delete the legacy Upstash database** (`gst-radar-tokens`):
   - Open <https://console.upstash.com/> → Redis → select the legacy `gst-radar-tokens` database
   - **Confirm it has no readers**: in **Details**, scroll to **Connections** — should show zero recent connections from the Worker. (The website was already disconnected in Phase A; the Worker disconnected when PR #140 merged.)
   - Under **Danger Zone** → click **Delete Database**
   - Confirm the prompt by typing the database name

   The legacy `inoreader:*` keyspace dies with the database; no further cleanup needed.

### Rollback (if the deploy regressed)

If decomission step 3 reveals a regression and you need to revert PR #140:

- The Wrangler secrets can be re-added trivially (you saved them in your password manager during § A.3 originally)
- The Upstash database is the only irreversible step — only complete step 4 once production has been stable on the new code for ≥48 hours after secret removal

### What you've completed

✅ Worker no longer holds bindings to the retired Inoreader DB.
✅ Upstash project shows only the MCP DB; legacy database is gone.
✅ Single-DB architecture is the actual state on disk, in code, and in your secret store.

---

_Last updated: 2026-05-17 — BL-032.8 Phase B retired the legacy Inoreader DB. § A.3 rewritten to provision a single MCP DB. /health response shape simplified (`upstashInoreader` field removed). § C.13 added with the operator-side decommissioning walkthrough. Earlier history: 2026-05-05 Path 2 (two-DB architecture) shipped; today's edits supersede that with the single-DB target state._
