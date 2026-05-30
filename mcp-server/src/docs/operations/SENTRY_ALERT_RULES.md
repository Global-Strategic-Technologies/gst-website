# Sentry Alert Rules — `gst-mcp-server` project

**Purpose**: ship the BL-047 T1 operator-paging surface for Inoreader OAuth failures, plus the weekly synthetic that proves the path is live. This doc is the configure-then-verify runbook for the Sentry-side rules; the Worker-side code that feeds them is already wired (see § 5 Provenance).

**Status**: BL-047 T1 deliverable. Sentry alert rules are configured via the Sentry UI (no in-repo source of truth); the synthetic + the structured events the rules subscribe to are owned by Worker code.

---

## 1. The three OAuth failure signals

The Worker emits structured Sentry events at three failure points on the Inoreader OAuth refresh path. Each is paging-worthy.

| Sentry event tag                      | Worker source                                                | When it fires                                                                                                                            | Recovery                                                                                                                                                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `oauth-refresh-invalid-refresh-token` | [`inoreader-oauth.ts:290-303`](../../lib/inoreader-oauth.ts) | Inoreader returned 401 or `invalid_grant` on `POST /oauth2/token` — refresh token is dead                                                | Re-authorize via DEPLOY.md § C.5 sub-section **"Recovery — Inoreader OAuth refresh-token expired"** (until BL-047 T2 lands the in-browser flow)                                                                                              |
| `oauth-refresh-token-missing`         | [`inoreader-oauth.ts:198-202`](../../lib/inoreader-oauth.ts) | Worker tried to refresh but found no refresh token in Upstash or env-var fallback                                                        | Same procedure as above — DEPLOY.md § C.5 sub-section "Recovery — Inoreader OAuth refresh-token expired" re-mints both env-var and Upstash key                                                                                               |
| `oauth-refresh-upstash-write-failed`  | [`inoreader-oauth.ts:336-343`](../../lib/inoreader-oauth.ts) | Refresh succeeded against Inoreader but writing the rotated refresh_token to Upstash failed — credential is now in an inconsistent state | First check DEPLOY.md § C.6 step 2 (Is `upstashMcp: 'degraded'` in `/health`?). If Upstash is down, recovery is "wait or Upstash status page." If Upstash is reachable, re-mint via § C.5 "Recovery — Inoreader OAuth refresh-token expired" |

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

1. **Slack integration installed**. Sentry → Settings (gear, top-right) → Integrations → Slack → click `Add Workspace` if `globalstrategic` isn't already linked. Then click `Configure` on the workspace and add `#mcp-alerts` to the channel allowlist. Without this, the Slack action dropdown will be empty when you write a rule.
2. **`#mcp-alerts` channel exists in Slack** and the Sentry app is a member (`/invite @Sentry` in the channel).
3. **Pin the recovery deep-link in the channel topic** — Sentry's Slack action always sends its standard event card, no freeform body. The cheapest way to get the recovery procedure to operators is to pin a topic that reads:
   > 🚨 Inoreader OAuth pages → see [DEPLOY.md § C.5 "Recovery — Inoreader OAuth refresh-token expired"](https://github.com/Global-Strategic-Technologies/gst-website/blob/master/mcp-server/src/docs/operations/DEPLOY.md#recovery--inoreader-oauth-refresh-token-expired)
4. **Default Issue-feed level filter** — Sentry's Issues view hides `info`-level events by default. The synthetic is `info`, so when verifying it in § 4 you'll need to set the level filter to "All" or query `event:alert-rule-synthetic` directly. The alert rule fires regardless; this only matters for human eyeballs on the Issues page.

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
| **THEN — Actions to perform**                              | Click `+ Add Action` → pick **`Send a notification to a Slack workspace`** → workspace `globalstrategic` → channel `#mcp-alerts` → tags (the field labeled "Tags to show in notification") `event, environment, level, year-week` (the `year-week` tag is only relevant for the synthetic; harmless on the others — Sentry just omits unset tags from the card)                                                                                                                                                                                                                                                                                                                                                                                                                                 |
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

### Slack message format

Sentry's Slack action doesn't accept a freeform template — it always sends its standard event card (title from the event message, project, environment, tags, link to the Sentry issue). The pinned channel topic from pre-flight step 3 covers the recovery-link surface. The card's tag list (configured in the THEN action) carries the rule-specific failure mode via the `event` tag.

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
#   - Slack: standard Sentry card in #mcp-alerts within ~1 min, with event:alert-rule-synthetic tag visible
```

Document the first verified firing date in this section once complete:

> **First verified synthetic firing**: _pending — fill on first deploy + scheduled trigger_

For Rules 1-3, the cheapest production-safe verification is: open `mcp-server/scripts/inoreader-auth.mjs`, intentionally bind an invalid `INOREADER_REFRESH_TOKEN` on **staging only**, observe `oauth-refresh-invalid-refresh-token` event in Sentry → Slack page in `#mcp-alerts`. Then restore the real token. (Staging has no cron so this requires manually invoking the refresh path — `npx wrangler dev --env staging --remote` + the equivalent of a radar tool call. Out of scope for this PR; treat as the BL-047 T2 endpoint-arrival validation moment.)

## 5. Provenance

- Worker emit sites verified 2026-05-30 against [`inoreader-oauth.ts`](../../lib/inoreader-oauth.ts) HEAD on `feature/bl-047-backlog-cleanup`
- Sentry UI semantics verified 2026-05-30 against `/getsentry/sentry-docs` via Context7 — trigger menu is issue-lifecycle-only; "tag match" lives under IF/filters; "any of the following" OR's multiple triggers
- Inoreader OAuth contract (the failure shapes the rules subscribe to): [`INOREADER_OAUTH_CONTRACT.md`](./INOREADER_OAUTH_CONTRACT.md)
- BL-047 stanza (the parent ticket): [`BACKLOG.md` § BL-047](../../../../src/docs/development/BACKLOG.md)
- Sentry envelope path (how the events get to Sentry): [`sentry-envelope.ts`](../../observability/sentry-envelope.ts)
- Synthetic dispatcher + ISO-week algorithm: [`alert-rule-synthetic.ts`](../../observability/alert-rule-synthetic.ts) (+ unit tests at [`tests/unit/observability/alert-rule-synthetic.test.ts`](../../../tests/unit/observability/alert-rule-synthetic.test.ts))
