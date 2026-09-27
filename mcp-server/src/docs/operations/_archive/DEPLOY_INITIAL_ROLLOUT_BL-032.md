# MCP Worker — initial rollout playbook (BL-032, archived)

> **Historical; the runbook is [`DEPLOY.md`](../DEPLOY.md).** These are the one-time sections of the original deploy runbook — account and DNS setup, database provisioning, the first staging → soak → production rollout, the BL-041 ACL migration steps and the BL-032.8 legacy-DB decommission — moved here verbatim when DEPLOY.md became an ongoing-operations runbook. Manual `npm run deploy:*` steps below describe how the first rollout was done; today every deploy goes through CI (see [`DEPLOY.md` § How code reaches the Worker](../DEPLOY.md#how-code-reaches-the-worker)). Section numbers are the original ones, so cross-references like "§ B.6" still resolve within this file; references to § A.3.5 (ACL strings), § B.3 (smoke), § C.x and the "A.3 Reference" rotation live in DEPLOY.md.

---

# Part A — Initial Setup (one-time)

These steps stand up the infrastructure the Worker needs. Done once per operator. Each subsection is self-contained — work through them top-to-bottom.

## A.1 — Cloudflare account + Wrangler CLI

### What you need

A Cloudflare account with **Workers** enabled. Free tier is sufficient for BL-032 (100k req/day on free tier covers any plausible team usage). Paid tier becomes necessary later for the [cron substrate's](../../ARCHITECTURE.md#cron-substrate) Cron Triggers; ignore for now.

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

The `globalstrategic.tech` zone managed by Cloudflare DNS (already confirmed during BL-032 planning per [`ARCHITECTURE.md` § Deploy topology](../../ARCHITECTURE.md#deploy-topology-q10)). The website's Vercel deployment is fronted by this same zone, so this is a check-and-confirm step rather than a setup step — **as long as the zone is on Cloudflare DNS, Wrangler creates the necessary subdomain records itself when you add a `routes` block to `wrangler.toml`**.

### Steps

1. **Verify zone is on Cloudflare**:
   - <https://dash.cloudflare.com/> → your account → click `globalstrategic.tech`
   - The zone overview page should show "Active" — if it says "Pending nameserver update," DNS isn't pointed at Cloudflare yet (pause and resolve before continuing)
2. **Add the staging custom-domain binding to `wrangler.toml`**. Open [`mcp-server/wrangler.toml`](../../../../wrangler.toml) and update the `[env.staging]` block:
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

---

## A.3.5 — Upstash ACL hardening (BL-041) — migration steps

> The ACL strings, category rationale, scoped-token rotation and rollback stay canonical in [`DEPLOY.md` § A.3.5](../DEPLOY.md#a35--upstash-acl-hardening-bl-041). These are the one-time Phases 1–4 that moved the Worker off the admin token.

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

---

## A.4 — Inoreader credentials — copy from Vercel

### What you need

The four Inoreader OAuth secrets the website uses, copied from Vercel's environment to Wrangler secrets. These are the **same values** stored in **separate stores** — both Vercel and Cloudflare end up holding the same data.

The Worker reads OAuth tokens from Upstash first ([`ARCHITECTURE.md` § Token storage and OAuth refresh](../../ARCHITECTURE.md#token-storage-and-oauth-refresh)); these env-var copies are the seed/fallback values.

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

✅ Worker has the Inoreader app + OAuth credentials. The radar-live tools use them to make API calls. (The Worker is the **sole** Inoreader caller and token-refresh writer per BL-032.8 — see [`ARCHITECTURE.md` § Radar pipeline](../../ARCHITECTURE.md#radar-pipeline-single-caller-unification); the original Q4 fork decision it superseded is in the archived BL-032 doc.)

---

## A.4.5 — Cloudflare Analytics Engine — account-level enable (BL-032.75 Phase 1)

> The per-env dataset map and verification stay canonical in [`DEPLOY.md` § A.4.5](../DEPLOY.md).

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

---

## A.5 — Sentry — create new project + DSN secret

### What you need

A **new** Sentry project (separate from the website's per [`ARCHITECTURE.md` § Sentry split](../../ARCHITECTURE.md#sentry-split-q6)). Full step-by-step lives in [`SENTRY_MANUAL_SETUP.md` § MCP Worker](../../../../../src/docs/development/SENTRY_MANUAL_SETUP.md#mcp-worker-bl-032-phase-5).

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

One bearer token for yourself, named `MCP_KEY_<INITIALS>` per the [`AUTH.md`](../AUTH.md#key-naming-convention) convention. BL-032's baseline is **only the operator** during the one-week soak; full team rollout happens in Part C § C.1 after production stabilizes.

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
   Replace `RP` with your own initials. The **suffix becomes your `keyOwner`** in logs (per [`AUTH.md` § Attribution in logs](../AUTH.md#attribution-in-logs)).
4. **Skip production for now**. The production key is set in Part B § B.6 just before the production deploy — keeping it unset until the staging soak proves the surface stable.

### What you've completed

✅ One bearer key for yourself, on staging. The full [`AUTH.md`](../AUTH.md) reference covers token-value generation + the rotation/revocation runbooks for later.

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

Wraps `wrangler deploy --env staging --var GIT_SHA:$(git rev-parse --short HEAD)` via [`scripts/deploy.mjs`](../../../../scripts/deploy.mjs) so the deployed Worker can surface its commit SHA on `/health` (read by [`health.ts`](../../../observability/health.ts) line 122). The wrapper script is cross-platform (Windows/macOS/Linux); a bare `wrangler deploy` works too but leaves `gitSha: "unknown"` on `/health`.

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

## B.4 — Configure your own client against staging

Use [`REMOTE_CLIENT_SETUP.md`](../REMOTE_CLIENT_SETUP.md) to point Claude Desktop / Claude Code / Cursor at the staging URL. The walkthrough has per-client snippets.

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
   Wraps `wrangler deploy --env production --var GIT_SHA:$(git rev-parse --short HEAD)` via [`scripts/deploy.mjs`](../../../../scripts/deploy.mjs). Same flow as B.2 but against `mcp.globalstrategic.tech`.
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

1. **Open** [`REMOTE_CLIENT_SETUP.md`](../REMOTE_CLIENT_SETUP.md)
2. **Replace** all instances of `<PROD_URL_PLACEHOLDER>` (or whatever the staging URL was used in the file) with the actual production URL `https://mcp.globalstrategic.tech/mcp`
3. **Update the status banner** at the top of the doc to reflect "production live as of YYYY-MM-DD"
4. **Commit** the doc-only change and merge

This unblocks team-member onboarding (Part C § C.1).

---

# Part C — one-time operation

## C.13 — Decommission legacy Inoreader DB (BL-032.8 Phase B one-time)

> ## ✅ Completed 2026-05-27
>
> The one-time decommission ran during the BL-032.8 Phase B closure session. This section is retained for two reasons: (a) the same pattern applies to any future "retire a parallel DB" operation, and (b) the prerequisite/step/rollback structure documents the safety reasoning. Future readers: this is historical reference, not a pending task.

> **Audience** (historical): operator running the BL-032.8 Phase B retirement (PR #140). Skip this section if your Worker was deployed fresh post-2026-05-17 — there's nothing legacy to decommission.
>
> **Vercel-side cleanup**: § C.13 below covers the Worker side. The Vercel `INOREADER_*` env var sweep + Vercel↔Upstash integration disconnect lived in [`_archive/BL-032_8_SOAK_GATE.md`](./BL-032_8_SOAK_GATE.md) — see that doc for the Vercel walkthrough. Both halves ran the same day; both are now `✅ Completed 2026-05-27`.

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
