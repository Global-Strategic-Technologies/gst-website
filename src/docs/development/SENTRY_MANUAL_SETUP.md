# Sentry Manual Setup Guide

Two Platform Hardening V1 items require manual configuration in external dashboards. The code is fully wired — these steps activate it.

---

## 1. Enable Source Map Upload (Phase 9 Item #15)

Source maps give Sentry readable stack traces instead of minified code. The upload is wired in `astro.config.mjs` but disabled until environment variables are set.

### Steps

1. **Create an Organization Auth Token** (recommended by Sentry for source map uploads)
   - Go to [sentry.io](https://sentry.io) → **Settings → Developer Settings → Organization Tokens**
   - Click **Create New Token**
   - Give it a name like `GST Website Source Maps`
   - Organization tokens have preset permissions — no manual scope selection needed
   - Copy the token immediately (it is only shown once and cannot be retrieved later)

   > **Why Organization Token, not Personal Token?** Organization tokens are scoped to the org (not your personal account), have the right permissions for source map upload out of the box, and are the Sentry-recommended approach. If you must use a Personal Token instead (Settings → Auth Tokens → Personal Tokens), set **Project: Read & Write** and **Release: Admin**.

2. **Find your org and project slugs**
   - Org slug: visible in the URL when logged in — `https://sentry.io/organizations/{ORG_SLUG}/`
   - Project slug: Settings → Projects → click your project — the slug is in the URL

3. **Add environment variables to Vercel**
   - Go to [vercel.com](https://vercel.com) → your project → Settings → Environment Variables
   - Add these three variables for **Production** environment only:

   | Variable            | Value                                          |
   | ------------------- | ---------------------------------------------- |
   | `SENTRY_AUTH_TOKEN` | The token from step 1                          |
   | `SENTRY_ORG`        | Your Sentry organization slug                  |
   | `SENTRY_PROJECT`    | Your Sentry project slug (e.g., `gst-website`) |

4. **Trigger a production deploy** to verify
   - Push to `master` or trigger a manual deploy
   - Check the Vercel build logs for: `Uploading source maps...`
   - If it says `Source maps upload is disabled` the env vars aren't being read

5. **Verify in Sentry**
   - Go to Sentry → Releases → click the latest release
   - Under "Artifacts" you should see `.js.map` files
   - Trigger a test error — the stack trace should show original TypeScript, not minified JS

### Troubleshooting

- **"Didn't find any matching sources for debug ID upload"**: This is almost always a symptom of an auth failure (401), not a missing config. The Sentry Vite plugin injects debug IDs during the build and writes source maps to a temp directory — if auth fails, the upload step can't run, and the plugin reports "no matching sources" as a secondary warning. Fix the auth token and this warning resolves.
- **"Authentication required" or 401 error in build**: The auth token is invalid, expired, or missing. Generate a new Organization Token at sentry.io → Settings → Developer Settings → Organization Tokens.
- **"Organization not found"**: Check the `SENTRY_ORG` slug matches exactly (case-sensitive, visible in your Sentry URL).
- **"Sending telemetry data" warning**: Should not appear — `telemetry: false` is set in `astro.config.mjs`. If it appears, verify the config wasn't reverted.
- **"no sourcemap found" warnings for inline scripts**: Expected and harmless. Astro's `is:inline` scripts don't go through Vite's bundler, so no `.map` files exist for them. The `silent: true` option in `astro.config.mjs` suppresses these warnings. Bundled application code still uploads source maps correctly.
- **CSP blocking Sentry**: The Sentry ingestion endpoint must be in `connect-src`. US-region projects use `*.ingest.us.sentry.io` (not just `*.ingest.sentry.io`). The replay integration also needs `worker-src 'self' blob:`. See [SECURITY_HEADERS.md](../security/SECURITY_HEADERS.md).
- **Source maps uploaded but traces still minified**: Verify the release version in Sentry matches what the client reports. Check that `sentry.client.config.ts` and the build output use the same release identifier.
- **Don't add Sentry env vars to `.env` locally**: The upload should only run on Vercel production builds. Locally it slows builds and fails since there's no deployment context.

---

## 2. Configure Sentry Alert Rules (Phase 9 Item #14)

Alert rules notify you when errors occur. The error tags (`area:inoreader-api`, `area:redis-connection`, etc.) are already set in the codebase — these rules trigger notifications based on them.

### Steps

1. **Navigate to alert rules**
   - Go to [sentry.io](https://sentry.io) → your project (`gst-website`) → Alerts → Create Alert Rule

2. **Create the following 4 rules**:

   #### Rule 1: New Issue Alert
   - **When**: A new issue is created
   - **Filter**: None (all issues)
   - **Then**: Send notification to your email
   - **Action interval**: 1 hour (prevents spam)
   - **Name**: `New issue — all`

   #### Rule 2: High-Volume Error Spike
   - **When**: Number of events in an issue exceeds **10** in **1 hour**
   - **Filter**: None
   - **Then**: Send notification to your email
   - **Action interval**: 1 hour
   - **Name**: `High-volume error spike`

   #### Rule 3: Inoreader API Failures
   - **When**: A new issue is created
   - **Filter**: Issue tag `area` matches `inoreader-api`
   - **Then**: Send notification to your email
   - **Action interval**: 30 minutes
   - **Name**: `Inoreader API failure`
   - **🪦 RETIRED 2026-07-14**: rule deleted in the Sentry audit — the emitting code
     (the website's Inoreader client, `area:inoreader-api`) was removed in BL-032.8
     Phase B (2026-05-27); Inoreader observability now lives on the MCP Worker
     (see `mcp-server/src/docs/operations/SENTRY_ALERT_RULES.md`)

   #### Rule 4: Redis Connection Failures
   - **When**: A new issue is created
   - **Filter**: Issue tag `area` matches `redis-connection`
   - **Then**: Send notification to your email
   - **Action interval**: 30 minutes
   - **Name**: `Redis connection failure`
   - **🪦 RETIRED 2026-07-14**: rule deleted in the Sentry audit — the website's
     Redis/KV usage (and the `area:redis-connection` emit site) was retired in
     BL-032.8 Phase B; Upstash health for the MCP Worker is covered by the
     `health-check-failing` SLO alert

3. **Test the alerts**
   - After creating the rules, you can verify by triggering a test error:
     - Open the deployed site
     - Open browser DevTools console
     - Run: `Sentry.captureException(new Error('Test alert rule'))`
     - Check your email within a few minutes for the alert

4. **Optional: Add Slack/PagerDuty integration**
   - Go to Settings → Integrations
   - Connect Slack or PagerDuty
   - Update the alert rules to send to a Slack channel instead of (or in addition to) email

### Tag Reference

These are the `area` tags already instrumented in the codebase:

| Tag                        | Source                           | Fires When                                           |
| -------------------------- | -------------------------------- | ---------------------------------------------------- |
| `area:inoreader-api`       | `src/lib/inoreader/client.ts`    | Inoreader API calls fail (auth, fetch, refresh)      |
| `area:redis-connection`    | `src/lib/inoreader/client.ts`    | Redis/KV connection or read/write fails              |
| `area:file-cache`          | `src/lib/inoreader/cache.ts`     | Local file cache read/write fails                    |
| `area:techpar-calculation` | `src/utils/techpar/chart.ts`     | TechPar chart rendering or calculation errors        |
| `area:palette-manager`     | `src/scripts/palette-manager.ts` | Palette operations fail (breadcrumb only, not alert) |

---

## GitHub Integration

### Stack Trace Linking

Configured in Sentry → Settings → Integrations → GitHub → Code Mappings:

| Field            | Value                                     |
| ---------------- | ----------------------------------------- |
| Project          | gst-website                               |
| Repo             | Global-Strategic-Technologies/gst-website |
| Branch           | master                                    |
| Stack Trace Root | src/                                      |
| Source Code Root | src/                                      |

This makes file paths in Sentry stack traces clickable — clicking a path like `src/utils/filterLogic.ts:199` opens that file at that line in GitHub, at the commit that was running when the error occurred.

### Auto-Issue Creation (Optional)

Sentry can automatically create GitHub issues from alerts. Configure via Sentry → Alerts → Create Alert Rule → THEN → "Create a new GitHub issue". See BL-003 in the backlog for alert rule configuration.

---

## Verification Checklist

**Website project (`gst-website`)**:

- [x] Sentry auth token generated and stored in Vercel
- [x] `SENTRY_ORG` and `SENTRY_PROJECT` set in Vercel
- [x] `PUBLIC_SENTRY_DSN` set in Vercel
- [x] CSP allows `*.ingest.us.sentry.io` (connect-src) and `blob:` (worker-src)
- [x] Source maps uploading (silent mode suppresses inline script warnings)
- [x] GitHub code mapping configured for stack trace linking
- [ ] "New issue" alert rule created
- [ ] "High-volume error spike" alert rule created
- [x] ~~"Inoreader API failure" alert rule created~~ — retired 2026-07-14 (emit site deleted in BL-032.8 Phase B; rule removed in the Sentry audit)
- [x] ~~"Redis connection failure" alert rule created~~ — retired 2026-07-14 (same audit)
- [ ] Test error triggers email notification

**MCP Worker project (`gst-mcp-server`)** — completed 2026-05-12:

- [x] Sentry project created — platform `Cloudflare Workers`, same team as gst-website
- [x] `SENTRY_DSN` bound via `wrangler secret put SENTRY_DSN --env production` (and staging)
- [x] Alert #1 — MCP unhandled exception (new-issue trigger, no filter)
- [x] Alert #2 — Bearer auth failure burst (50 events / 10 min, filtered on message `auth.failed bearer-rejected`)
- [x] Alert #3 — Inoreader budget breach (new-issue trigger, filtered on message `inoreader-rate-limit`)
- [x] Email notification preferences verified (issue alerts on, primary email verified)
- [x] Sentry Org Token generated (`GST MCP Source Maps`)
- [x] `SENTRY_AUTH_TOKEN` bound in deployer's shell — `npm run deploy:*` now uploads source maps automatically
- [x] Source-map upload verified end-to-end against staging + production deploys
- [ ] Alert #4 (5xx rate) — deferred. Cloudflare offers no native error-rate alert; BL-032.75's status-page work owns this

---

## 3. Consent Gating Evaluation (Phase 9 Item #16)

### Decision: Keep Sentry under Legitimate Interest

Sentry's current configuration runs under **legitimate interest** basis (GDPR Article 6(1)(f)) and does **not** require explicit consent gating. Rationale:

| Config Property            | Value  | Privacy Impact                             |
| -------------------------- | ------ | ------------------------------------------ |
| `sendDefaultPii`           | false  | No IP addresses, usernames, or emails      |
| `tracesSampleRate`         | 0      | No performance/transaction tracking        |
| `replaysSessionSampleRate` | 0      | No session replay of normal browsing       |
| `replaysOnErrorSampleRate` | 1.0    | Replay captured ONLY when an error occurs  |
| `beforeSend` filter        | active | Drops browser noise (ResizeObserver, etc.) |

Error monitoring is a recognized legitimate interest for website operators. The data collected is:

- Stack traces (minified code, no user data)
- Browser/OS metadata (for debugging, not profiling)
- Error-triggered session replay (only the moments around the error)

### When to Re-evaluate

If the cookie consent banner (BUSINESS_ENABLEMENT_V1 Initiative 1) introduces a **"functional cookies"** or **"analytics"** consent tier, consider whether error-triggered replay crosses into the "analytics" category in your jurisdiction. Pure error capture (without replay) is unambiguously legitimate interest.

A code comment in `sentry.client.config.ts` marks the integration point for future consent gating if needed.

### If You Decide to Gate Sentry on Consent

Add this check before `Sentry.init()` in `sentry.client.config.ts`:

```typescript
const consent = localStorage.getItem('cookie-consent');
if (consent !== 'accepted') {
  // Don't initialize Sentry — user hasn't consented
  // Sentry.init() is never called, so no data is sent
}
```

Note: this means errors occurring before or without consent will be invisible. Weigh this tradeoff against the privacy benefit.

---

_Created: April 13, 2026 — Platform Hardening V1 Phase 9_
_Updated: April 17, 2026 — Added consent gating evaluation (Phase 9 item #16)_
_Updated: April 19, 2026 — CSP fixes, source map silent mode, GitHub stack trace linking, checklist refresh_
_Updated: May 4, 2026 — Added MCP Worker section (BL-032 Phase 5)_
_Updated: May 12, 2026 — MCP project fully wired post-production-deploy: corrected misleading Cloudflare Workers error-rate claim, switched Alerts #2/#3 to message-based filters (matches shipped captureMessage calls), added source-map upload setup section, verification checklist split into website + MCP halves, MCP half all green except Alert #4 (deferred to BL-032.75)_

---

## MCP Worker (BL-032 Phase 5)

The MCP server runs as a separate Cloudflare Worker at `mcp.globalstrategic.tech` ([architecture doc](./MCP_SERVER_REMOTE_BL-032.md)). It uses `@sentry/cloudflare` (not `@sentry/node`) — different SDK, different runtime, different project.

### Sentry project

Per [BL-032 Q6 (resolved 2026-05-03)](./MCP_SERVER_REMOTE_BL-032.md#q6-sentry-on-cloudflare-workers--sentrycloudflare-or-sentrynode), the MCP Worker uses a **separate Sentry project** from the website's. Rationale:

- **Separation of concerns**: website events and Worker events have different threat models (HTML rendering vs. JSON-RPC API), different alert thresholds, and different SLO targets
- **Quota isolation**: a runaway agent burning through Worker errors shouldn't drown out website signal in dashboards
- **Cleaner team filtering**: each project gets its own member access list

### One-time setup

1. **Create the project in the Sentry dashboard**:
   - Platform: **Cloudflare Workers**
   - Name: `gst-mcp-server` (or similar)
   - Team: same team as the website project
2. **Copy the DSN** from the project's _Client Keys_ page
3. **Add as a Wrangler secret** for both staging and production:

```bash
cd mcp-server
npx wrangler secret put SENTRY_DSN --env staging
# Paste the DSN at the prompt.
npx wrangler secret put SENTRY_DSN --env production
```

> `wrangler` is a `mcp-server/` devDependency, not globally installed — invoke via `npx wrangler` (matching DEPLOY.md's convention). Same DSN value goes to both envs; staging-vs-production separation is configured via Sentry environment tags inside the Worker, not separate DSNs.

### How it's wired

The Worker entrypoint wraps its handler with `withSentry(optionsCallback, handler)` from `@sentry/cloudflare`. The options callback reads `env.SENTRY_DSN`; when absent, it returns `undefined` and `withSentry` passes through to the underlying handler unchanged (graceful skip — `wrangler dev` works without Sentry creds).

Key files:

- [`mcp-server/src/observability/sentry.ts`](../../../mcp-server/src/observability/sentry.ts) — `sentryOptions(env)`, `tagRequest(keyOwner, path)`, `captureException(error)`, re-export of `withSentry`
- [`mcp-server/src/worker.ts`](../../../mcp-server/src/worker.ts) — wraps the default export with `withSentry(sentryOptions, handler)`; calls `tagRequest(auth.keyOwner, url.pathname)` after bearer auth resolves so per-request Sentry events carry attribution

### Tags applied automatically

| Tag        | Value                                     | Source                                                                        |
| ---------- | ----------------------------------------- | ----------------------------------------------------------------------------- |
| `service`  | `mcp-server`                              | `initialScope` in `sentryOptions`                                             |
| `keyOwner` | `RP` / `AB` / etc. (or `unauthenticated`) | `tagRequest()` after bearer auth                                              |
| `path`     | `/health` / `/mcp` / etc.                 | `tagRequest()` from the request URL                                           |
| `release`  | (Wrangler-injected if configured)         | Optional — surface deploy SHA if `wrangler deploy --var GIT_SHA=...` is wired |

### Privacy / what NOT to log

The same discipline as the website's `@sentry/node` setup applies, with two MCP-specific reinforcements:

1. **Bearer tokens never reach Sentry.** The safe-logger's auto-redaction belt (Authorization / Cookie / X-API-Key) is plumbed through. `withSentry`'s built-in request-data scrubbing catches any header values it sees; we never `console.log(request.headers)` (ESLint blocks raw `console.*` in `mcp-server/src/worker.ts` + `src/auth/**` — see [DEVELOPER_TOOLING.md](./DEVELOPER_TOOLING.md))
2. **Tool inputs / outputs are not auto-captured.** The MCP request body (which contains the tool's user input — names, financial numbers, regulatory jurisdictions) is NOT included in Sentry events by default. If a future `BL-033` audit-logging surface needs full request retention, that's a separate decision with its own privacy review

### Sample rate

The `tracesSampleRate: 0.1` baseline (10% of requests get traced) keeps Sentry quota cost bounded under expected volume. [BL-032.75 (Production Observability Maturity)](./MCP_SERVER_OBSERVABILITY_BL-032_75.md) tunes this against measured baselines from the BL-032 soak week.

### Alert rules

The MCP project's alert rules are simpler than the website's — fewer error types, different thresholds. Initial set (configure manually in the Sentry dashboard):

| Rule                          | Trigger                                                                               | Plan tier needed                                                                                                                                                                                                                                                                                             | Channel |
| ----------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| MCP unhandled exception (any) | Any `error.unhandled` event (`A new issue is created`)                                | **Free (Developer)** — Issue Alert                                                                                                                                                                                                                                                                           | Email   |
| Bearer auth failure burst     | More than 50 events grouped under message `auth.failed bearer-rejected` in 10 minutes | **Free (Developer)** — Issue Alert                                                                                                                                                                                                                                                                           | Email   |
| Inoreader budget breach       | Any new issue with message `inoreader-rate-limit`                                     | **Free (Developer)** — Issue Alert                                                                                                                                                                                                                                                                           | Email   |
| 5xx rate                      | More than 1% of requests return 5xx in a 15-minute window                             | **Team or higher** — Performance / Failure Rate is paywalled on Developer plan. **No native Cloudflare equivalent exists** (verified 2026-05-12 — Cloudflare's Workers notifications cover usage anomalies, not error-rate alerts). Defer to BL-032.75's external uptime probe + status page when that ships | Email   |

> **Channel choice (Email vs Slack)**: Sentry's "Send a notification to Member" / "Send a notification to Issue Owners" actions route through each user's notification preferences — which default to email. There is no literal "send via Email" action in current Sentry UI; pick a Member/Owner action instead.

> **Filter syntax mismatch (resolved 2026-05-12)**: the original walkthrough below specified `event` and `errorCode` tag-based filters for Alerts #2 and #3. The shipped `captureMessage` calls in [worker.ts](../../../mcp-server/src/worker.ts) and [radar-live.ts](../../../mcp-server/src/tools/radar-live.ts) put that information in the message **string** (`auth.failed bearer-rejected` / `inoreader-rate-limit`), not in event tags. Filter on `The event's message contains/equals "..."` instead. A code-polish follow-up to add the matching tags is tracked separately.

> **5xx-rate has no native Cloudflare substitute**: an earlier version of this doc claimed Cloudflare Notifications offered a "Workers → Error Rate" alert. **That alert type does not exist** (verified 2026-05-12). Cloudflare's actual Workers notifications are: `Weekly Summary` (digest, weekly) and `Usage Report` (CPU-time anomaly, not error rate). Neither alerts on errors. The right home for an error-rate signal on free-plan accounts is BL-032.75's external probe + status page work; until that lands, the three Sentry alerts above are the operational coverage.

Refine these once BL-032.75 ships SLO targets. The substrate (Sentry init, structured logs, `keyOwner` tagging) is in place from BL-032 Phase 5.

### Source-map upload (added 2026-05-12)

Without source maps, Sentry stack traces for Worker errors show minified output (`dist/index.js:1:482718`) — basically useless for debugging. With them, traces resolve back to original TypeScript file:line.

The upload is wired into [`mcp-server/scripts/deploy.mjs`](../../../mcp-server/scripts/deploy.mjs) — after a successful `wrangler deploy --upload-source-maps`, the script runs `sentry-cli` to register a release tagged with the git short SHA and upload the source maps from `dist/`. The release ID matches the `SENTRY_RELEASE` env var the Worker reads via [`sentryOptions()`](../../../mcp-server/src/observability/sentry.ts), so Sentry events automatically match the right source-map bundle.

**One-time operator setup**:

1. Create a Sentry Organization Token:
   - Sentry → Settings → Developer Settings → Organization Tokens → Create New Token
   - Name: `GST MCP Source Maps` (mirrors the website's `GST Website Source Maps` token convention)
   - Copy the token (`sntrys_...`) immediately — shown once only
2. Store the token in your password manager (treat like any other secret — don't check in)
3. Before running `npm run deploy:staging` or `:production`, set in your shell:
   ```powershell
   $env:SENTRY_AUTH_TOKEN = "sntrys_..."     # PowerShell
   export SENTRY_AUTH_TOKEN="sntrys_..."     # bash / zsh
   ```
   Or persist via `[Environment]::SetEnvironmentVariable("SENTRY_AUTH_TOKEN", "...", "User")` on Windows.

`SENTRY_ORG` (`gst-7o`) and `SENTRY_PROJECT` (`gst-mcp-server`) are hardcoded defaults in `deploy.mjs`; override via env vars only if those values change.

**If `SENTRY_AUTH_TOKEN` is not set**, the deploy.mjs script prints a warning and continues — the Worker still deploys successfully, only source-map upload is skipped. Source maps are a debug-experience nicety, not a runtime correctness gate.

**Verification after a deploy**: the deploy script's tail output reads `> source maps uploaded for release <sha>; Sentry stack traces will resolve to original TypeScript.` Sentry → gst-mcp-server → Releases → click the new release → "Artifacts" tab should list `.map` files.

#### Step-by-step UI walkthrough (current Sentry, 2026)

Sentry's alert UI shifted in 2025-2026 — alerts are organized by category (Errors / Performance / Logs / Application Metrics / Uptime / Cron Monitoring) and use a conditional WHEN / IF / THEN flow. To create each MCP alert:

**Common starting point** — for every alert:

1. Sentry dashboard → select the `gst-mcp-server` project
2. Left nav → **Alerts** → **Create Alert**
3. Choose alert type from the **Errors** category (for issue-based alerts) or **Performance** (for rate-based; paywalled on Developer plan)

##### Alert 1 — MCP unhandled exception (Errors → Issues)

- **Section 1 — Environment + project**: All Environments, gst-mcp-server
- **Section 2 — Set conditions**:
  - **WHEN** an event is captured by Sentry and **any** of the following happens → leave default `A new issue is created`
  - **IF** all/any filters match → can leave empty (every issue Sentry sees from `withSentry` is already an unhandled error). If you want to be explicit, add `The event's level equals error or fatal` with the **any** combinator (NOT **all** — `level=fatal AND level=error` is unsatisfiable since level is single-valued)
  - **THEN** perform these actions → **Send a notification to** **Member** → pick yourself (routes to your registered email by default)
- **Section 3 — Action interval**: 24 hours (prevents repeat-alert spam on the same issue)
- **Section 5 — Name and owner**: Name = `MCP unhandled exception`. Save.

##### Alert 2 — Bearer auth failure burst (Errors → Issues)

- **Section 2 WHEN**: trash the default `A new issue is created` row → click `Add optional trigger…` → choose **The issue is seen more than {N} times in {M} minutes**. Set N=`50`, M=`10`
- **Section 2 IF**: `Add optional filter…` → **The event's message** → match `contains` (or `equals`), value=`auth.failed bearer-rejected`
- **Section 2 THEN**: Member → yourself
- **Section 3**: 24 hours
- **Section 5**: Name = `Bearer auth failure burst`. Save.

The Worker captures `auth.failed` events to Sentry via `captureMessage('auth.failed bearer-rejected', 'warning', ...)` — wired in commit `62d155a`. Filter on **message** rather than tag because the captureMessage call puts the event-id information in the message string. The 50/10min threshold is intentionally high: 5-6 auth failures is one user fat-fingering a token; 50 in 10 min is probing or runaway-agent territory.

##### Alert 3 — Inoreader budget breach (Errors → Issues)

- **Section 2 WHEN**: keep default `A new issue is created`
- **Section 2 IF**: `Add optional filter…` → **The event's message** → match `equals`, value=`inoreader-rate-limit`
- **Section 2 THEN**: Member → yourself
- **Section 5**: Name = `Inoreader budget breach`. Save.

The Worker captures `inoreader-rate-limit` events via `captureMessage('inoreader-rate-limit', 'error', ...)` in [radar-live.ts:failureResponse](../../../mcp-server/src/tools/radar-live.ts) alongside the circuit-breaker `openCircuit()` call. Fires at most once per 6h breaker-open window, so no volume threshold needed — single events are operationally important.

##### Alert 4 — 5xx rate (Performance → Failure Rate; paywalled)

If you have Sentry Team plan or higher:

- Select **Performance → Failure Rate** in the alert-type chooser → click **Set Conditions**
- Filter (optional): scope to specific transaction names or HTTP status families
- **Critical Status threshold**: `Above 1%` (1% failure rate over the time window)
- **Time window**: 15 minutes
- **Action**: Member → yourself
- Name: `5xx rate`. Save.

If you're on Developer plan, **Set Conditions** is greyed out with "Upgrade your plan to create this type of alert." Skip this alert and use Cloudflare Notifications instead (per the table above) — same operational signal, different surface.

> **Action format**: Sentry's actions are strings like `Send a notification to Member <username>` (routes to that member's notification preferences — email by default) or `Send a notification to Team <team-name>` (routes via the team's per-user preferences). For solo-operator soaks, **Member → yourself** is simplest. Once you onboard team-members and want shared alerting, switch to **Team** actions.
