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
> - [`RATE_LIMITS.md`](./RATE_LIMITS.md) — per-key budgets, RFC 9331 headers, circuit-breaker semantics
> - [`SENTRY_MANUAL_SETUP.md` § MCP Worker](../../../../src/docs/development/SENTRY_MANUAL_SETUP.md) — Sentry project setup specifics
> - [`MCP_SERVER_REMOTE_BL-032.md`](../../../../src/docs/development/MCP_SERVER_REMOTE_BL-032.md) — architecture decisions and the Q1–Q13 design rationale

---

# Part A — Initial Setup (one-time)

These steps stand up the infrastructure the Worker needs. Done once per operator. Each subsection is self-contained — work through them top-to-bottom.

## A.1 — Cloudflare account + Wrangler CLI

### What you need

A Cloudflare account with **Workers** enabled. Free tier is sufficient for BL-032 (100k req/day on free tier covers any plausible team usage). Paid tier becomes necessary later for [BL-032.5's](../../../../src/docs/development/MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md) Cron Triggers; ignore for now.

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

The `globalstrategic.tech` zone managed by Cloudflare DNS (already confirmed during BL-032 planning per [Q10](../../../../src/docs/development/MCP_SERVER_REMOTE_BL-032.md#q10-dns-provisioning--mcpglobalstrategictech--out-of-band)). The website's Vercel deployment is fronted by this same zone, so this is a check-and-confirm step rather than a setup step — **as long as the zone is on Cloudflare DNS, Wrangler creates the necessary subdomain records itself when you add a `routes` block to `wrangler.toml`**.

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

## A.3 — Upstash — provision two databases (Inoreader read + MCP state)

### What you need

Two Upstash Redis databases, both on free tier:

| DB                                              | Owner                    | Worker uses                                                                                                  | Token type                                                                     | Holds                                                   |
| ----------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------- |
| **Website DB** (existing — already provisioned) | Website's Vercel project | Read-only access to `inoreader:*` (OAuth tokens written by the website's token-refresh job)                  | **Read-Only** token (free, ships alongside Standard)                           | OAuth tokens, ISR cache, anything else the website owns |
| **MCP DB** (new — provision in this section)    | MCP Worker exclusively   | Full read+write on `mcp:*` (rate-limit counters, circuit-breaker flag, health probe, inoreader-status cache) | **Standard** token (the only one needed; rotates independently of the website) | All Worker-managed state                                |

This satisfies [Q13's](../../../../src/docs/development/MCP_SERVER_REMOTE_BL-032.md#q13-upstash-project-sharing-new) rotation-isolation goal AND [Q4's](../../../../src/docs/development/MCP_SERVER_REMOTE_BL-032.md#q4-inoreader-client-refactor--fork-or-generalize) read-only-on-`inoreader:*` invariant — the latter at the storage layer rather than as a code-only contract. A leaked MCP-DB token cannot corrupt website data; a leaked Inoreader-DB Read-Only token cannot mutate anything.

### Steps

1. **Reach the Upstash console**, by either path:
   - **From Vercel**: <https://vercel.com/> → your project → **Storage** tab → click the linked Upstash database → "Open in Upstash" button
   - **Direct**: <https://console.upstash.com/> → Redis → select the project linked to the GST website

2. **Copy the website DB's Read-Only credentials** (this is the database the website already uses — you're not creating anything new yet):
   - On the website-DB's **Details** page, scroll to the **REST API** section
   - Toggle to **Read Only** (the toggle sits at the top of the Tokens block; default is "Standard")
   - Click the copy icon next to `UPSTASH_REDIS_REST_URL` → save it as your **Inoreader-DB URL**
   - Click the copy icon next to `UPSTASH_REDIS_REST_TOKEN` → save it as your **Inoreader-DB Read-Only token**. Confirm the toggle is on **Read Only** before copying — copying the Standard token here defeats the purpose of Path 2

3. **Create the new MCP database**:
   - In the Upstash console: **Create Database** (or "+" / "New Database" depending on UI)
   - Name: `gst-mcp` (or `gst-mcp-staging` if you want a per-env DB; Path 2 uses one DB shared across staging + production for simplicity — both envs hit the same `mcp:*` namespace, but namespace prefixes within `mcp:*` keep envs isolated, e.g., `mcp:staging:ratelimit:*` vs `mcp:prod:ratelimit:*`. The Worker code refactor will document the prefix scheme)
   - Region: same as the website DB (lowest latency from Vercel + Cloudflare's edge)
   - Type: **Regional** (Global has different pricing; Regional is fine for this scale)
   - Eviction policy: **noeviction** (rate-limit counters and the circuit-breaker MUST NOT be silently evicted; we manage TTLs explicitly)
   - Click **Create**

4. **Copy the MCP DB's Standard credentials** (just-created DB):
   - On the new DB's **Details** page → **REST API** section
   - Confirm the toggle is set to **Standard** (NOT Read Only — Worker writes to this DB)
   - Click the copy icon next to `UPSTASH_REDIS_REST_URL` → save it as your **MCP-DB URL**
   - Click the copy icon next to `UPSTASH_REDIS_REST_TOKEN` → save it as your **MCP-DB Standard token**

5. **Save all four values in 1Password** with notes:
   - "GST MCP — Inoreader-DB URL (read-only Worker access; same physical DB as website's Standard token)"
   - "GST MCP — Inoreader-DB Read-Only token"
   - "GST MCP — MCP-DB URL (Worker-owned; rotation-isolated from website)"
   - "GST MCP — MCP-DB Standard token (issued: YYYY-MM-DD)"

6. **Set the four secrets for staging**:

   ```bash
   cd mcp-server
   npx wrangler secret put UPSTASH_INOREADER_REST_URL --env staging
   # Paste the Inoreader-DB URL from step 2
   npx wrangler secret put UPSTASH_INOREADER_REST_TOKEN --env staging
   # Paste the Inoreader-DB Read-Only token from step 2
   npx wrangler secret put UPSTASH_MCP_REST_URL --env staging
   # Paste the MCP-DB URL from step 4
   npx wrangler secret put UPSTASH_MCP_REST_TOKEN --env staging
   # Paste the MCP-DB Standard token from step 4
   ```

7. **Set the same four secrets for production** (you can do this now even though we don't deploy production until Part B § B.6):

   ```bash
   npx wrangler secret put UPSTASH_INOREADER_REST_URL --env production
   npx wrangler secret put UPSTASH_INOREADER_REST_TOKEN --env production
   npx wrangler secret put UPSTASH_MCP_REST_URL --env production
   npx wrangler secret put UPSTASH_MCP_REST_TOKEN --env production
   ```

8. **Verify the secrets are set** (lists names only — values are never retrievable):
   ```bash
   npx wrangler secret list --env staging
   npx wrangler secret list --env production
   ```
   Both should include all four:
   - `UPSTASH_INOREADER_REST_URL`
   - `UPSTASH_INOREADER_REST_TOKEN`
   - `UPSTASH_MCP_REST_URL`
   - `UPSTASH_MCP_REST_TOKEN`

### What you've completed

✅ Worker has scoped, isolated access to two Upstash databases:

- **Inoreader DB**: read-only access via the Read-Only token. Q4's read-only-on-`inoreader:*` invariant is enforced **at the storage layer** — even if Worker code regresses and tries to write, Upstash returns an error
- **MCP DB**: full read+write via Standard token. Rotation isolation is real — rotating this token doesn't affect the website; rotating the website's Standard token doesn't affect the Worker

The MCP DB's Standard token is the only token the Worker holds with write capability. Compromise of the bearer key + Wrangler secret extraction would give an attacker write access ONLY to `mcp:*` keys (rate-limit counters, the circuit-breaker, etc.) — the website's data is untouched.

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
4. Update 1Password with the new value + rotation date

The Inoreader-DB Read-Only token is the website's responsibility (same DB the website uses); rotation is a website-side concern that the Worker just inherits.

---

## A.4 — Inoreader credentials — copy from Vercel

### What you need

The four Inoreader OAuth secrets the website uses, copied from Vercel's environment to Wrangler secrets. These are the **same values** stored in **separate stores** — both Vercel and Cloudflare end up holding the same data.

The Worker reads OAuth tokens from Upstash first ([Q4](../../../../src/docs/development/MCP_SERVER_REMOTE_BL-032.md#q4-inoreader-client-refactor--fork-or-generalize)); these env-var copies are the seed/fallback values.

### Steps

1. **Pull the Inoreader env vars from Vercel** to a local file:
   ```bash
   # From the gst-website repo root (NOT mcp-server/):
   npx vercel env pull .env.vercel.local
   ```
   This dumps the project's environment variables into `.env.vercel.local`. The file is gitignored (`.env*` already covered) but treat it as sensitive — delete it once you're done copying.
2. **Extract the four Inoreader values**:
   ```bash
   grep -E '^INOREADER_' .env.vercel.local
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

✅ Worker has the Inoreader app + OAuth credentials. The radar-live tools will use them to make API calls (read-only — the website remains the sole token-refresh writer per [Q4](../../../../src/docs/development/MCP_SERVER_REMOTE_BL-032.md#q4-inoreader-client-refactor--fork-or-generalize)).

---

## A.5 — Sentry — create new project + DSN secret

### What you need

A **new** Sentry project (separate from the website's per [Q6](../../../../src/docs/development/MCP_SERVER_REMOTE_BL-032.md#q6-sentry-on-cloudflare-workers--sentrycloudflare-or-sentrynode)). Full step-by-step lives in [`SENTRY_MANUAL_SETUP.md` § MCP Worker](../../../../src/docs/development/SENTRY_MANUAL_SETUP.md#mcp-worker-bl-032-phase-5).

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

1. **Generate a cryptographically-random token**:
   ```bash
   openssl rand -base64 32 | tr -d '=' | tr '/+' '_-'
   ```
   Output is ~43 chars, base64url-encoded. Copy it.
2. **Save the token in 1Password / your password manager** with a note like "GST MCP — RP — staging+production". You'll use this value to configure your own client (Part B § B.4) AND when production is wired up.
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

Equivalent to `wrangler deploy --env staging`. Wrangler:

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

> Set this in your shell so you don't repeat the URL:
>
> ```bash
> export MCP_URL=https://mcp-staging.globalstrategic.tech
> export MCP_KEY=<your-MCP_KEY_RP-token-value>
> ```

### B.3.1 — Health endpoint responds

```bash
curl $MCP_URL/health | jq
```

Expected (right after first deploy, before any radar traffic):

```json
{
  "ok": false,
  "version": "0.1.0",
  "gitSha": "unknown",
  "phase": "BL-032 Phase 5 (observability)",
  "upstashMcp": "ok",
  "upstashInoreader": "ok",
  "inoreader": "unknown",
  "inoreaderObservedAt": null
}
```

`ok: false` is **expected** initially because `inoreader: 'unknown'` — but `inoreader: 'unknown'` is NOT a degraded signal, just "no recent traffic." It flips to `'ok'` after the first successful radar-tool call (B.3.6 below).

The two Upstash subsystems report independently per the Path 2 architecture:

- `upstashMcp: 'ok'` confirms the MCP DB is reachable (rate-limiter and circuit-breaker can write)
- `upstashInoreader: 'ok'` confirms the Inoreader DB is reachable (Worker can read OAuth tokens — read-only by design)

If either is `'degraded'`, see [§ A.3](#a3--upstash--provision-two-databases-inoreader-read--mcp-state) for which secrets to verify.

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

Expected output: 11 tool names (10 transport-portable + the deprecated alias):

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
"search_radar_cache"
"search_radar_offline"
"search_regulations"
```

(The `search_radar_cache` and `search_radar_offline` together count as one in the BACKLOG-shipped surface; the alias is one-release deprecation per [BREAKING_CHANGES.md](../../../BREAKING_CHANGES.md).)

### B.3.4 — Invoke a non-radar tool

```bash
curl -s $MCP_URL/mcp \
  -H "Authorization: Bearer $MCP_KEY" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_portfolio_facets","arguments":{}}}' | jq
```

Expected: a JSON response with `result.content[0].text` containing the deduplicated themes / engagement categories / etc. for the M&A portfolio.

### B.3.5 — Verify rate-limit headers

The response from B.3.4 should include:

```
RateLimit-Limit: 60
RateLimit-Remaining: 59
RateLimit-Reset: <seconds-until-window-resets>
```

If `RateLimit-*` headers are absent, the limiter took the graceful-skip path → the **MCP DB** isn't reachable (rate-limit state lives in `mcp:*` and writes to the MCP-DB). Re-check that `UPSTASH_MCP_REST_URL` + `UPSTASH_MCP_REST_TOKEN` are set per § A.3 step 6. The Inoreader DB being unreachable would NOT cause this symptom — it'd surface in B.3.6 instead.

### B.3.6 — Invoke a radar tool (live Inoreader call)

```bash
curl -s $MCP_URL/mcp \
  -H "Authorization: Bearer $MCP_KEY" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_radar","arguments":{"category":"pe-ma"}}}' | jq '.result.content[0].text' | jq -r . | jq '.matches | length'
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

- **Sustained `ratelimit.skipped` log lines** → MCP DB unreachable; check `UPSTASH_MCP_*` secrets and Upstash status (the Inoreader DB being unreachable would surface as `upstashInoreader: "degraded"` on `/health` instead, with radar tools failing rather than rate-limit skipping)
- **Inoreader 429s** → circuit breaker should engage cleanly; verify with `/health` showing `inoreader: "degraded"` and the radar tools returning structured 503s
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
   Equivalent to `wrangler deploy --env production`. Same flow as B.2 but against `mcp.globalstrategic.tech`.
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
- They have a 1Password / password-manager vault you can share into

### Steps

1. **Generate a fresh token**:
   ```bash
   openssl rand -base64 32 | tr -d '=' | tr '/+' '_-'
   ```
2. **Store in 1Password** with a note "GST MCP — AB — production". Share the entry to AB's vault
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
4. **Notify AB**: send them a link to [`REMOTE_CLIENT_SETUP.md`](./REMOTE_CLIENT_SETUP.md) and tell them their token is in 1Password
5. **Verify with AB**: ask them to run a smoke prompt in their client. If they see tool results, you're done. If they see 401, walk them through the troubleshooting tree in REMOTE_CLIENT_SETUP.md
6. **Update your team-member-roster** (kept in 1Password / shared spreadsheet) with AB's `keyOwner` suffix and the date issued

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

1. **Generate the new token** (`openssl rand -base64 32 | tr -d '=' | tr '/+' '_-'`)
2. **Delete and re-set the secret** for both envs:

   ```bash
   cd mcp-server
   npx wrangler secret delete MCP_KEY_AB --env staging
   npx wrangler secret put MCP_KEY_AB --env staging
   # Paste the NEW token

   npx wrangler secret delete MCP_KEY_AB --env production
   npx wrangler secret put MCP_KEY_AB --env production
   ```

3. **Update 1Password** with the new value (share to the team-member's vault)
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

| Symptom                                                                                                                             | Roll back?                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Unhandled exception storm in Sentry post-deploy                                                                                     | **Yes**, immediately                                                |
| Sustained 5xx rate (>1% over 15 min) post-deploy                                                                                    | **Yes**                                                             |
| `/health` reports `upstashMcp: 'degraded'` OR `upstashInoreader: 'degraded'` for >5 min post-deploy and Upstash status page is fine | **Probably yes** — config regression on the affected DB's secrets   |
| One specific tool returns wrong results                                                                                             | **Maybe** — depends on user impact; sometimes fix-forward is faster |
| Performance regression but no errors                                                                                                | **Investigate first**; rollback if fix takes >1 hour                |

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

| Log signature                                                            | Means                                                                                              | First action                                                                                                                         |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `"event":"auth.failed","reason":"bearer-rejected"`                       | Wrong/missing/stale token. Could be one user with a stale config OR a probe-and-bail attempt.      | Check Sentry for the alert rule "Bearer auth failure burst." If sustained from one keyOwner, ping that team-member to confirm config |
| `"event":"ratelimit.exceeded","reason":"tier=minute"`                    | One key burst-called too fast. Per-minute (60) cap hit                                             | Usually self-recovers in 60s; check if the keyOwner has a runaway agent loop                                                         |
| `"event":"ratelimit.exceeded","reason":"tier=day"`                       | One key consumed the full daily budget                                                             | Inspect what the user did; if legitimate, consider raising their cap (see RATE_LIMITS.md)                                            |
| `"event":"ratelimit.skipped","reason":"upstash-mcp-not-bound"`           | MCP DB creds missing or unreachable at request time                                                | Check `UPSTASH_MCP_*` secrets via `wrangler secret list`; check Upstash status page for the MCP DB                                   |
| `"event":"inoreader.read.failed","reason":"upstash-inoreader-not-bound"` | Inoreader DB creds missing or unreachable when reading OAuth tokens                                | Check `UPSTASH_INOREADER_*` secrets; check Upstash status page for the website's DB                                                  |
| `"event":"mcp.request","success":false`                                  | Tool invocation completed with a 4xx status. Most often: invalid input or tool-side error envelope | Check the structured `errorCode` field                                                                                               |
| Sentry: any `error.unhandled` from a Worker isolate                      | Unexpected throw in handler code path                                                              | Check the stacktrace; usually indicates a bug. Capture, fix, ship                                                                    |
| `errorCode:"inoreader-rate-limit"`                                       | Inoreader returned 429 — circuit breaker just opened                                               | See § C.5 below                                                                                                                      |

`/health` reports the cached subsystem status (Q8 — never burns Inoreader budget). Useful as a pre-investigation sanity check:

```bash
curl https://mcp.globalstrategic.tech/health | jq
```

Surfaces both Upstash subsystems' reachability (`upstashMcp` and `upstashInoreader`, each `'ok' | 'degraded'`), last observed Inoreader API status (`inoreader: 'ok' | 'degraded' | 'unknown'`), `inoreaderObservedAt` timestamp, and the aggregate `ok` flag (true only when MCP DB is OK, Inoreader DB is OK, and `inoreader !== 'degraded'`).

---

## C.5 — Inoreader budget recovery

The radar tools share a 6-hour global circuit breaker (Phase 3 substrate, Phase 4c trigger — see [RATE_LIMITS.md](./RATE_LIMITS.md) § Circuit breaker for the full design). When Inoreader returns 429:

1. The first radar-tool call to see it sets `mcp:radar:circuit-open` in the **MCP DB** (Worker writes to `mcp:*` per Path 2) with a 6h TTL
2. All subsequent radar-tool calls (any key) read the flag and return `503 Service Unavailable` with `Retry-After`
3. Non-radar tools are unaffected
4. The breaker auto-closes via TTL expiry — no manual intervention required for normal recovery

### When NOT to manually reset

If the breaker just opened, **don't reset it**. Inoreader's budget hasn't recovered; you'll trigger another 429 within seconds, burning more of the next day's budget. Wait for the TTL to expire.

### When manual reset is OK

Inoreader's status page reports the platform recovered within minutes (rare). The breaker would auto-close in 6h, but you want radar tools back ASAP.

```bash
# Use the MCP DB's REST credentials (NOT the Inoreader DB — the circuit-breaker
# flag lives in the MCP DB per Path 2). Pull the values from your secrets store
# (1Password); they were set in § A.3 step 6 as UPSTASH_MCP_REST_*.
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

---

## C.6 — Incident triage tree

A bounded decision tree for "the MCP is broken" reports. Walk through these in order:

1. **Is the Worker reachable at all?**
   - `curl https://mcp.globalstrategic.tech/health` — does it respond at all?
   - **5xx or timeout** → Worker isolate is crashing or Cloudflare's edge is having issues. Check Cloudflare's status page; check Sentry for unhandled exceptions; if needed, `wrangler rollback --env production` to the previous deploy
   - **200 with `ok: false`** → Worker is up but a subsystem is degraded. Continue to step 2

2. **Which subsystem is degraded?** Read the `/health` JSON:
   - `upstashMcp: 'degraded'` → MCP DB unreachable or misconfigured (rate-limit, circuit-breaker, health probe, inoreader-status cache all live here). Check Upstash status for the MCP DB; check `UPSTASH_MCP_REST_URL` + `UPSTASH_MCP_REST_TOKEN` are set via `wrangler secret list --env production`. Worker still serves auth + non-radar tools (rate-limit falls open with a warning); radar tools degrade when cache writes fail
   - `upstashInoreader: 'degraded'` → Inoreader DB unreachable (the website's DB the Worker reads OAuth tokens from). Check Upstash status for the website DB; check `UPSTASH_INOREADER_REST_URL` + `UPSTASH_INOREADER_REST_TOKEN` are set. Auth + non-radar tools work; radar tools fail at OAuth-load time
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

_Last updated: 2026-05-05 — Path 2 Worker refactor shipped (3-commit sequence: refactor → tests → docs). § A.3 status callout removed; the two-DB architecture is now the actual code path. /health JSON returns `upstashMcp` + `upstashInoreader` separately. Doc is fully executable as the operator runbook. Earlier today: § A.3 rewritten for **Path 2 architecture** after Upstash ACL was discovered Prod-Pack-gated. Path 2 uses two free Upstash DBs: Worker reads `inoreader:*` from the website's DB via Read-Only token (storage-layer Q4 enforcement), reads/writes `mcp:*` from a new dedicated MCP DB via Standard token (rotation isolation). Phase 6 deploy runbook, end-to-end walkthrough authored. Part A (initial setup), Part B (first deploy), Part C (ongoing operations) all complete._
