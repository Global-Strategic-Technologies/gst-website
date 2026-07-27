# Sentry Alert Rules — `gst-mcp-server` project

**Purpose**: ship the BL-047 T1 operator-paging surface for Inoreader OAuth failures, plus the weekly synthetic that proves the path is live. This doc is the configure-then-verify runbook for the Sentry-side rules; the Worker-side code that feeds them is already wired (see § 5 Provenance).

**Status**: BL-047 T1 deliverable. Sentry alert rules are configured via the Sentry UI (no in-repo source of truth); the synthetic + the structured events the rules subscribe to are owned by Worker code.

---

## 1. OAuth event tags emitted by the Worker

Nine `event` tags fire on the Inoreader OAuth path — **five paging-class** (operator action required), **three info-class** (observability only; alert rules MUST NOT subscribe to these), and **one warning-class** (capture-only, no paging). The five paging-class events drive the Sentry rules in § 3 plus the two new T2 paging events (`admin-reauth-token-exchange-failed`, `admin-reauth-persist-failed`) that ship with PR <TBD>.

| Sentry event tag                        | Worker source                                                                                                                                | When it fires                                                                                                                                                                                                                                                    | Recovery                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `oauth-refresh-invalid-refresh-token`   | [`inoreader-oauth.ts:343`](../../lib/inoreader-oauth.ts)                                                                                     | Inoreader returned 401 or `invalid_grant` on `POST /oauth2/token` AND the BL-047 grace-window hedge also failed (or no cached previous token was available). True chain death — refresh token is dead                                                            | Re-authorize via DEPLOY.md § C.5 sub-section **"Recovery — Inoreader OAuth refresh-token expired"** (until BL-047 T2 lands the in-browser flow). Note: post-BL-047 hedge ship (PR #196), seeing this event means BOTH the primary AND the cached previous token were rejected — recovery is genuinely required, not a transient |
| `oauth-refresh-token-missing`           | [`inoreader-oauth.ts:216`](../../lib/inoreader-oauth.ts)                                                                                     | Worker tried to refresh but found no refresh token in Upstash or env-var fallback                                                                                                                                                                                | Same procedure as above — DEPLOY.md § C.5 sub-section "Recovery — Inoreader OAuth refresh-token expired" re-mints both env-var and Upstash key                                                                                                                                                                                  |
| `oauth-refresh-upstash-write-failed`    | [`inoreader-oauth.ts:402,413`](../../lib/inoreader-oauth.ts)                                                                                 | Refresh succeeded against Inoreader but writing the rotated refresh_token to Upstash failed (after one in-band retry — BL-047 PR #196) — credential is now in an inconsistent state                                                                              | First check DEPLOY.md § C.6 step 2 (Is `upstashMcp: 'degraded'` in `/health`?). If Upstash is down, recovery is "wait or Upstash status page." If Upstash is reachable, re-mint via § C.5 "Recovery — Inoreader OAuth refresh-token expired"                                                                                    |
| `inoreader.oauth.refresh-token.rotated` | [`inoreader-refresh-health.ts`](../../lib/inoreader-refresh-health.ts) recorder via [`inoreader-oauth.ts:387`](../../lib/inoreader-oauth.ts) | BL-047 T3 — every successful refresh that produced a new refresh_token. Info-level; **NEVER pages**. Dense rotation (confirmed 2026-05-31) means this fires on every cron tick                                                                                   | No operator action. Surfaces in Sentry timeline + `mcp:inoreader:rotations:<YYYY-MM-DD>` counter. Used to size the 30-day rotation-cadence answer                                                                                                                                                                               |
| `inoreader.oauth.grace-window-recovery` | [`inoreader-refresh-health.ts`](../../lib/inoreader-refresh-health.ts) recorder via [`inoreader-oauth.ts:259`](../../lib/inoreader-oauth.ts) | BL-047 — primary refresh failed with `invalid_grant` but the cached previous token (in-isolate, 60s TTL) succeeded on retry. Self-healed. Info-level; **NEVER pages**                                                                                            | No operator action. Surfaces in Sentry timeline + `mcp:inoreader:grace-recovery:<YYYY-MM-DD>` counter. Sustained zero count would suggest the hedge could be retired; non-zero count quantifies its value                                                                                                                       |
| `admin-reauth-callback-success`         | [`admin/inoreader-reauth.ts`](../../admin/inoreader-reauth.ts)                                                                               | BL-047 T2 — operator completed in-browser OAuth re-auth via `/admin/inoreader/reauth/callback`. Info-level; **NEVER pages**. Expected to appear ~1 minute after the operator taps "Authorize" on Inoreader's consent screen                                      | No operator action. Confirms recovery succeeded                                                                                                                                                                                                                                                                                 |
| `admin-reauth-state-rejected`           | [`admin/inoreader-reauth.ts`](../../admin/inoreader-reauth.ts)                                                                               | BL-047 T2 — `/callback` rejected the request: missing/expired Upstash state, replay attempt, cookie-state mismatch (operator opened consent flow in a different browser than `/start`), or Upstash unreachable. **Warning-level**; capture-only (no paging rule) | No paging needed. Restart from `/start` in the same browser. If recurrent, investigate cookie / browser environment                                                                                                                                                                                                             |
| `admin-reauth-token-exchange-failed`    | [`admin/inoreader-reauth.ts`](../../admin/inoreader-reauth.ts)                                                                               | BL-047 T2 — Inoreader rejected the authorization code at `/oauth2/token` (expired, redirect_uri mismatch, fraudulent retry). **Paging-class**                                                                                                                    | Verify `INOREADER_REDIRECT_URI` matches the URI registered in the Inoreader app dashboard byte-for-byte. Re-run `/start` and try again                                                                                                                                                                                          |
| `admin-reauth-persist-failed`           | [`admin/inoreader-reauth.ts`](../../admin/inoreader-reauth.ts)                                                                               | BL-047 T2 — Inoreader returned tokens but the Worker could not write them to Upstash. The new chain is valid on Inoreader's side but not on ours. **Paging-class** (the critical one — the operator must act within ~5 minutes)                                  | Re-run `/admin/inoreader/reauth/start` within ~5 minutes to mint another fresh chain before the unpersisted one rotates further. The stranded chain self-invalidates once a fresh exchange overwrites it                                                                                                                        |

Each of these gets ITS OWN Sentry alert rule. They are not collapsed into a single rule — each carries a different recovery procedure and the page needs to point at the right one.

## 2. Sentry's grouping model and the dual-trigger pattern

**Read this before clicking anything in the Sentry UI** — Sentry's Issue Alert builder only supports issue-lifecycle triggers, NOT per-event triggers, and Sentry's grouping model means a naive single-trigger rule will page you ONCE and never again.

### The grouping gotcha

Sentry groups events by message + culprit fingerprint. Three `oauth-refresh-invalid-refresh-token` events fired on three different days all group into ONE Sentry Issue. The `A new issue is created` trigger fires only on the **first-ever** event of a fingerprint — every subsequent event silently joins the existing issue and triggers nothing.

### The fix — dual triggers, OR'd

Sentry's "WHEN an issue event is captured and **any** of the following occur" semantic permits multiple triggers on one rule. Pair these two:

- **`A new issue is created`** — pages on first-ever occurrence
- **`A resolved issue becomes unresolved`** — pages on every re-occurrence AFTER the operator marks the prior incident Resolved

This adds a workflow step on the operator side: **after completing recovery, the operator MUST mark the Sentry issue Resolved.** The next failure then re-opens the issue and fires the second trigger.

The synthetic uses a different approach (per-week message variation; see § 3) so it does NOT require manual resolve-after-observation.

### Pre-flight (one-time setup before writing any rule)

1. **Paging channel decision — email or Slack**. GST currently uses **Sentry's built-in email delivery** as the operator paging channel (Slack workspace is not configured 2026-05-30). Email "just works" with no setup beyond Sentry's per-user notification settings; no integration install required. Use Slack only if/when a `globalstrategic` workspace is set up. The per-rule skeleton below works with either action type; the THEN row notes both.
2. **Default Issue-feed level filter** — Sentry's Issues view hides `info`-level events by default. The synthetic is `info`, so when verifying it in § 4 you'll need to set the level filter to "All" or query `event:alert-rule-synthetic` directly. The alert rule fires regardless; this only matters for human eyeballs on the Issues page.
3. **(Slack only — future)** If/when Slack is set up: Sentry → Settings → Integrations → Slack → click `Add Workspace` for `globalstrategic` → click `Configure` → add `#mcp-alerts` to the channel allowlist → in Slack, ensure `@Sentry` is in the channel (`/invite @Sentry`) → pin the channel topic with the DEPLOY.md § C.5 deep-link so operators have the recovery procedure one click away. Without these steps the Slack action's channel dropdown will be empty.

## 3. Per-rule configuration

The four rules share the same skeleton and differ only in name + tag filter (and Rule 4 has one extra trigger consideration). Configure each at Sentry → Alerts → Create Alert → **Issues** under "Errors".

### Skeleton (all four rules)

| Field                                                      | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Project**                                                | `gst-mcp-server`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Team**                                                   | (the team that owns mcp-server — typically `#mcp`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Environment**                                            | `production` (staging deliberately runs no cron per BL-032.7, so these signals are production-only)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **WHEN — Alert Builder → Select a trigger**                | Click `+ Add Trigger` twice and pick **`A new issue is created`** AND **`A resolved issue becomes unresolved`** (the screenshot's "any of the following" semantic OR's them — either fires the alert). Rule 4 only needs the first trigger; see Rule 4 note below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **IF — Filters narrow down which events trigger**          | Leave the `any` / `all` dropdown at the top of the IF block on `all` (single filter — match semantic is unchanged either way for one filter). Click the filter search field (placeholder "Any event") → scroll to the section **"FILTER BY EVENT ATTRIBUTES"** and pick **`Tagged event`** → in the **tag-key dropdown TYPE the literal string `event`** (don't pick from the autocomplete list — the dropdown only suggests tags the project's indexer has already seen, and our custom `event` tag may not appear there until first emit; the field accepts arbitrary text) → match `equals` → value `<rule-specific tag from § 1>`. (Sentry's own docs still write this filter as "The event's tags match" — the UI was renamed to `Tagged event`; verified against the live UI 2026-05-30.) |
| **THEN — Actions to perform**                              | Pick the action that matches the paging channel from § 2 pre-flight step 1. **Email (default 2026-05-30)**: `+ Add Action` → `Send a notification to Suggested Assignees, Team, or Member` → pick the operator user (your Sentry account). **OR Slack (future)**: `+ Add Action` → `Send a notification to a Slack workspace` → workspace `globalstrategic` → channel `#mcp-alerts` → tags `event, environment, level, year-week` (Slack-only field; email has no tag selector). The `year-week` tag is only relevant for Rule 4; harmless on the others.                                                                                                                                                                                                                                       |
| **Action frequency — Perform actions at most once every…** | `60 minutes` for Rules 1-3 (per-issue debounce; issue-lifecycle triggers fire infrequently by design so 60 min is sufficient). `1 day` for Rule 4 (defense against an accidental Cloudflare double-firing of the synthetic cron).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

### Rule-specific values

| Rule | Alert name                                                                                 | Tag filter value (`event` equals)     | Triggers                                                                       | Action frequency |
| ---- | ------------------------------------------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------ | ---------------- |
| 1    | `MCP — Inoreader refresh-token invalid (re-link required)`                                 | `oauth-refresh-invalid-refresh-token` | `A new issue is created` + `A resolved issue becomes unresolved`               | 60 minutes       |
| 2    | `MCP — Inoreader refresh-token missing (Worker secret + Upstash both empty)`               | `oauth-refresh-token-missing`         | `A new issue is created` + `A resolved issue becomes unresolved`               | 60 minutes       |
| 3    | `MCP — Inoreader refresh wrote to Inoreader but Upstash write failed (inconsistent state)` | `oauth-refresh-upstash-write-failed`  | `A new issue is created` + `A resolved issue becomes unresolved`               | 60 minutes       |
| 4    | `MCP — BL-047 T1 weekly synthetic heartbeat`                                               | `alert-rule-synthetic`                | `A new issue is created` **only** — see "Synthetic — why single-trigger" below | 1 day            |

### Synthetic — why single-trigger

The synthetic dispatcher ([`alert-rule-synthetic.ts`](../../observability/alert-rule-synthetic.ts)) appends the ISO year-week (e.g. `2026-W22`) to the Sentry message text. Sentry groups by message, so each week is a fresh fingerprint → a fresh Issue → `A new issue is created` fires every week.

This was a deliberate design choice. The alternative — pair `A new issue is created` with `A resolved issue becomes unresolved` (same as Rules 1-3) — would require the operator to manually mark the synthetic issue Resolved every Monday. That re-introduces the human-in-the-loop the synthetic was designed to remove. The per-week-message approach keeps the synthetic fully automatic: the operator only acts if the page DOESN'T arrive.

### Required workflow for Rules 1-3 — mark Resolved after every recovery

After completing the recovery procedure for any of the three OAuth failure rules, the operator MUST:

1. Open the Sentry Issue → click `Resolve` (top-right)
2. The next occurrence of the same failure mode will then re-open the issue, fire `A resolved issue becomes unresolved`, and page

If the issue is left Unresolved after recovery, **future occurrences will NOT page** (they join the existing Unresolved issue silently). This is the canonical Sentry "every occurrence is paging-worthy" pattern and is non-negotiable for OAuth failures.

### Notification format

**Email (default)**: Sentry sends a standard issue-notification email with subject `[gst-7o] {project} {issue title}` containing the event tags, level, environment, and a link back to the Sentry issue. The recovery procedure lives in the issue body via the link — no extra setup needed.

**Slack (future)**: Sentry's Slack action doesn't accept a freeform template — it always sends its standard event card (title from the event message, project, environment, tags, link to the Sentry issue). The pinned channel topic from pre-flight step 3 covers the recovery-link surface. The card's tag list (configured in the THEN action) carries the rule-specific failure mode via the `event` tag.

## 4. Acceptance test — first-firing verification

Operator runs once after PR ship + Sentry rules created, before relying on the rules.

```powershell
# Force-fire the synthetic from a wrangler dev session (skip waiting until Monday)
cd c:\Code\gst-website\mcp-server
npx wrangler dev --env production --remote --test-scheduled
# In a second terminal:
curl "http://localhost:8787/__scheduled?cron=0+14+*+*+1"
# Expected:
#   - Worker Logs: { event: 'alert-rule-synthetic.dispatch', success: true }
#   - Sentry: new issue with title "alert-rule-synthetic: weekly heartbeat YYYY-Www", tagged event=alert-rule-synthetic + year-week=YYYY-Www
#   - Email (default paging channel): standard Sentry issue-notification email
#     to the assigned operator within ~1-5 min (subject contains the event message)
#   - Slack (future, only when integration installed): standard Sentry card
#     in #mcp-alerts within ~1 min, with event:alert-rule-synthetic tag visible
```

Document the first verified firing date in this section once complete:

> **First verified synthetic firing**: **2026-05-30** — force-fire via `wrangler dev --remote` + `curl /__scheduled?cron=...` (per the procedure above) verified the full path end-to-end: Worker dispatch log (`{event:'alert-rule-synthetic.dispatch', success:true}`) → Sentry Issue (`event:alert-rule-synthetic` in `gst-mcp-server`) → Sentry email notification at the operator's address. Total latency ~1 min from force-fire to email arrival.

For Rules 1-3, the cheapest production-safe verification is: open `mcp-server/scripts/inoreader-auth.mjs`, intentionally bind an invalid `INOREADER_REFRESH_TOKEN` on **staging only**, observe `oauth-refresh-invalid-refresh-token` event in Sentry → Slack page in `#mcp-alerts`. Then restore the real token. (Staging has no cron so this requires manually invoking the refresh path — `npx wrangler dev --env staging --remote` + the equivalent of a radar tool call. Out of scope for this PR; treat as the BL-047 T2 endpoint-arrival validation moment.)

## 5. SLO alert rules (BL-032.75 Phase 3)

The `*/15 * * * *` alert-evaluator cron ([`alert-evaluator.ts`](../../observability/alert-evaluator.ts)) posts fingerprinted issue events (tag `event: slo-alert`) for breaches of the 7 canonical rules in [`alert-rules.ts`](../../observability/alert-rules.ts). Thresholds derive from the signed-off [`slo-baselines.md`](../../../observability/slo-baselines.md) targets. Runbooks live at [`observability/runbooks/`](../../../observability/runbooks/).

**The two email rules** (✅ created 2026-07-14 — **via the REST API, not the UI**; see the as-built note below):

| #   | Name                                | Rule ID | IF (filters)                                                      | Trigger                                                                                                                                                                     | Action frequency |
| --- | ----------------------------------- | ------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 5   | `MCP — SLO alert (page severity)`   | 3706338 | tag `event` equals `slo-alert` AND tag `severity` equals `page`   | "A new issue is created" (single trigger — per-day fingerprints make each day's first breach a NEW issue, per the synthetic's precedent; no manual-resolve workflow needed) | 60 min           |
| 6   | `MCP — SLO alert (ticket severity)` | 3706339 | tag `event` equals `slo-alert` AND tag `severity` equals `ticket` | "A new issue is created"                                                                                                                                                    | 60 min           |

> **As-built note (2026-07-14) — the UI cannot create these rules; use the script.** The
> UI's `Tagged event` tag-key field is now a strict combobox constrained to tag keys the
> project's indexer has already seen (§ 3 skeleton's "the field accepts arbitrary text"
> no longer holds — it snaps to `message` on blur). Since `severity` is only emitted by
> slo-alert breaches, the key can't be selected before the first breach ever fires — a
> bootstrap deadlock. The REST API has no such constraint, so the rules were created via
> [`scripts/create-slo-alert-rules.mjs`](../../../scripts/create-slo-alert-rules.mjs)
> (payload shapes mirrored from Rule 4's stored config) and verified by reading them back
> through the Sentry MCP integration. To recreate or modify them, prefer re-running the
> script with a freshly-minted **personal token** (Permissions: Alerts = Admin,
> Project = Read, Organization = Read; **revoke after use**) — this also gives Rules 5-6
> an in-repo source of truth that the § "Status" header disclaims for Rules 1-4.

**Issue-churn expectation**: a multi-day incident opens one issue per rule per UTC day (fingerprint includes the date). That's intended — each day's email is a re-page. Cooldowns (page 2h / ticket 6h, Upstash `SET NX EX`) bound intra-day volume; worst case across all 7 rules is ≈840 events/month against the 5k free-tier budget.

**Free-tier constraints honored** (verified 2026-07-10): the evaluator posts issue EVENTS only — never Crons check-ins (the single free-tier monitor belongs to radar-refresh); notifications are email-only until a Team-plan Slack integration exists.

### Acceptance test — force-fire the evaluator

```powershell
cd c:\Code\gst-website\mcp-server
npx wrangler dev --env production --remote --test-scheduled
# In a second terminal:
curl "http://localhost:8787/__scheduled?cron=*/15+*+*+*+*"
# Expected:
#   - Worker Logs: { event: 'alert-evaluator.completed', success: true, reason: 'breached=... suppressed=... errors=...' }
#   - https://localhost:8787/status (or production /status after deploy) shows the evaluation summary table
#   - If any rule is genuinely breached: Sentry issue titled "slo-alert.<rule-id>: ..." with tags event=slo-alert, rule, severity + email within ~1-5 min
#   - AE (a minute later): Verify-AeEmission.ps1 -Env production -WindowHours 1 shows a cron_outcome / alert-evaluator row
```

Document the first verified firing date here once complete:

> **First verified evaluator firing**: **2026-07-14T13:45:19Z** — the first natural `*/15` tick after the 0.39.0 production deploy (no force-fire needed). Verified via `/status`: all 7 rules evaluated healthy, and the AE-backed rules returned REAL query results ("0 scope-mismatch 403s in 15 min", "no per-key traffic spike") rather than the fail-open "AE unavailable" marker — proving the `CF_AE_TOKEN`/`CF_ACCOUNT_ID` Worker secrets and the Worker's first `api.cloudflare.com` egress work end-to-end. The email leg was NOT exercised (nothing was breached — correctly); it rides the identical tag-filtered new-issue → email mechanics the synthetic proved on 2026-05-30, and Rules 5-6's stored configs were read back and verified via the Sentry MCP after API creation. First genuine breach will complete the empirical chain.

## 6. Audit record — 2026-07-14 full-org rule audit

Every alert rule + cron monitor in `gst-7o` was audited against live emit sites at master `8add54d5` (via the Sentry MCP integration for reads; legacy REST API for fixes — resolve rules **by name** on `/projects/{org}/{project}/rules/`, since the MCP reports new-alerts-surface IDs that don't resolve on the legacy endpoint).

**Verified correct, no changes**: Rules 1–6 of this doc, the weekly synthetic, the `radar-refresh` cron monitor (schedule matches wrangler.toml), and gst-website's `New issue — all` / `High-volume error spike` / `Github Issue Created`. Note: Rules 1–3's live display names are the tag values themselves (`oauth-refresh-invalid-refresh-token` etc.), not the § 3 table's prescribed display names — accepted as-is; the tag filters are what matter.

**Fixed (gst-mcp-server)**:

| Rule                                                                                 | Defect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Fix                                                                                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `Bearer auth failure burst`                                                          | Filter required tag `event` to _contain_ `auth.failed bearer-rejected` — but the emission sets tag `event=auth.failed` (the long string is the MESSAGE). **The rule had never been able to fire.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Filter → tag `event` equals `auth.failed`                                                    |
| `Inoreader budget breach` → renamed **`MCP — Inoreader 429 / circuit breaker open`** | First-seen-only trigger + stable-grouped message (`inoreader-rate-limit`) = fired once (2026-05-15), silent forever after — the § 3 dual-trigger trap. Name also misleading: it fires on 429/circuit-open; daily budget is owned by the SLO evaluator's `inoreader-budget-exhausted`. **BL-091 note**: this rule still fires on the 429 that OPENS the breaker (`handleInoreaderFailure` is unchanged, and now also fires from the `/radar/snapshot` SSR path). It does not fire per breaker-open read — those now serve cached data rather than erroring — so it remains a once-per-window signal; `circuitOpen` on `/health` / `/status` is the live-state view. | Regression trigger added; renamed. Same resolve-after-recovery workflow as Rules 1–3 applies |
| `MCP unhandled exception`                                                            | `level=error OR fatal` (any-match) also matched every `slo-alert` page event → duplicate email on top of Rule 5                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Filters → all-match: `level >= error` AND tag `event` != `slo-alert`                         |

**Deleted (gst-website — emit sites no longer exist in the codebase)**: `BL-039 Inoreader auto-refresh FAILED` + `Inoreader auto-refresh fired (success)` (the `/api/inoreader/refresh` endpoint they matched was deleted 2026-05-27, BL-032.8 Phase B) and `Inoreader API failure` + `Redis connection failure` (the `area:inoreader-api` / `area:redis-connection` captureException sites were removed with the website's Inoreader client + Redis usage in the same phase). Retirement recorded in `src/docs/development/SENTRY_MANUAL_SETUP.md`; the website's live `area` tags are now `portfolio-data` / `regulatory-map` / `techpar-calculation` (see DEVELOPER_TOOLING.md).

All changes applied via the REST API with a short-lived personal token and re-verified by reading the rules back through the Sentry MCP integration.

## 7. Provenance

- Worker emit sites verified 2026-05-30 against [`inoreader-oauth.ts`](../../lib/inoreader-oauth.ts) HEAD on `feature/bl-047-backlog-cleanup`
- Sentry UI semantics verified 2026-05-30 against `/getsentry/sentry-docs` via Context7 — trigger menu is issue-lifecycle-only; "tag match" lives under IF/filters; "any of the following" OR's multiple triggers
- Inoreader OAuth contract (the failure shapes the rules subscribe to): [`INOREADER_OAUTH_CONTRACT.md`](./INOREADER_OAUTH_CONTRACT.md)
- BL-047 stanza (the parent ticket): [`BACKLOG.md` § BL-047](../../../../src/docs/development/BACKLOG.md)
- Sentry envelope path (how the events get to Sentry): [`sentry-envelope.ts`](../../observability/sentry-envelope.ts)
- Synthetic dispatcher + ISO-week algorithm: [`alert-rule-synthetic.ts`](../../observability/alert-rule-synthetic.ts) (+ unit tests at [`tests/unit/observability/alert-rule-synthetic.test.ts`](../../../tests/unit/observability/alert-rule-synthetic.test.ts))
