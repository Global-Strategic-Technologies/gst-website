# Sentry Alert Rules — `gst-mcp-server` project

**Purpose**: ship the BL-047 T1 operator-paging surface for Inoreader OAuth failures, plus the weekly synthetic that proves the path is live. This doc is the configure-then-verify runbook for the Sentry-side rules; the Worker-side code that feeds them is already wired (see § Provenance).

**Status**: BL-047 T1 deliverable. Sentry alert rules are configured via the Sentry UI/API (no in-repo source of truth); the synthetic + the structured events the rules subscribe to are owned by Worker code.

---

## 1. The three OAuth failure signals

The Worker emits structured Sentry events at three failure points on the Inoreader OAuth refresh path. Each is paging-worthy.

| Sentry event tag                      | Worker source                                                | When it fires                                                                                                                            | Recovery                                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `oauth-refresh-invalid-refresh-token` | [`inoreader-oauth.ts:290-303`](../../lib/inoreader-oauth.ts) | Inoreader returned 401 or `invalid_grant` on `POST /oauth2/token` — refresh token is dead                                                | Re-authorize via DEPLOY.md § C.5 (until BL-047 T2 lands the in-browser flow)                                             |
| `oauth-refresh-token-missing`         | [`inoreader-oauth.ts:198-202`](../../lib/inoreader-oauth.ts) | Worker tried to refresh but found no refresh token in Upstash or env-var fallback                                                        | Restore `INOREADER_REFRESH_TOKEN` Worker secret OR repopulate `mcp:inoreader:refresh_token` in Upstash from 1Password    |
| `oauth-refresh-upstash-write-failed`  | [`inoreader-oauth.ts:336-343`](../../lib/inoreader-oauth.ts) | Refresh succeeded against Inoreader but writing the rotated refresh_token to Upstash failed — credential is now in an inconsistent state | Inspect Upstash status; if reachable, re-run a manual refresh to overwrite. If the failure persists, see DEPLOY.md § C.5 |

Each of these gets ITS OWN Sentry alert rule. They are not collapsed into a single rule — each carries a different recovery procedure and the page needs to point at the right one.

## 2. Alert rule configuration (Sentry UI)

Operator-only — no in-repo source of truth.

### Per-event rule (×3 — one for each tag above)

1. Sentry → `gst-mcp-server` project → Alerts → Create Alert → Issues
2. **When** — `A new issue is created` OR `The issue matches a tag` with `event` equals `<tag from § 1>`
3. **If** — leave the issue-state filters empty (alert on first event regardless of priority/seen-state)
4. **Then** — `Send a notification to Slack` → workspace `globalstrategic` → channel `#mcp-alerts`
5. **Rate limit** — debounce to 1 per UTC day per rule (Sentry: "Issue alerts have built-in rate limiting"; set frequency to `1 per 1440 minutes`)
6. **Action data**: include `event_id`, `tag.event`, `extra.source`, and a Slack message body that links to the relevant DEPLOY.md sub-procedure (URL hardcoded into the rule's Slack action template):
   - `invalid-refresh-token` → DEPLOY.md § C.5 step 2 ("Recovery — Inoreader OAuth refresh-token expired")
   - `token-missing` → DEPLOY.md § C.5 step 1
   - `upstash-write-failed` → DEPLOY.md § C.13 ("Upstash recovery")
7. Save

### Synthetic rule (×1)

The weekly synthetic emits `tag.event === 'alert-rule-synthetic'`. Operator sees this in Slack every Monday afternoon — its presence is the proof that the integration is live.

1. Same flow as above
2. **When** — `The issue matches a tag` with `event` equals `alert-rule-synthetic`
3. **Then** — `Send a notification to Slack` → `#mcp-alerts` with subject `[SYNTHETIC] BL-047 T1 weekly heartbeat` so it's visually distinguishable from a real page
4. **Rate limit** — `1 per 10080 minutes` (weekly; matches the synthetic cron cadence)
5. Save

## 3. Synthetic — emitter, cadence, what to do when it fails

**Cadence**: every Monday at 14:00 UTC. Defined in [`wrangler.toml`](../../../wrangler.toml) `[env.production.triggers].crons` as the second entry.

**Emitter**: [`src/observability/alert-rule-synthetic.ts`](../../observability/alert-rule-synthetic.ts). Single `postSentryEvent` call with `level: 'info'`, tagged `event: 'alert-rule-synthetic'`. Never throws.

**Routing**: the synthetic event goes through the same envelope path as the real OAuth failure events; if the Sentry transport itself is broken, the synthetic surfaces that fact AND the synthetic Slack page never arrives.

**Operator weekly checklist** (add to existing operator runbook):

- [ ] Monday 14:05 UTC — confirm `[SYNTHETIC] BL-047 T1 weekly heartbeat` arrived in Slack `#mcp-alerts`
- [ ] If NOT arrived by 14:30 UTC: check (in order)
  1. Cloudflare → Workers → gst-mcp → Logs → filter `event:alert-rule-synthetic.dispatch` for the 14:00 firing. Present = Worker fired correctly; absent = cron didn't fire OR `SENTRY_DSN` unbound
  2. Sentry → `gst-mcp-server` → Issues → filter `event:alert-rule-synthetic`. Present = transport ok; absent = Worker fired but envelope POST failed
  3. Sentry → Alerts → the synthetic rule's history. If Sentry received the event but Slack didn't fire = Slack integration broken (revoked webhook, deleted channel, expired token)
- [ ] Whichever surface is broken IS the on-call work for the week

**Why this matters**: a silently broken alert path is the worst-case operator surface. The synthetic is the cheapest possible defence — one POST per week, ~zero substrate cost.

## 4. Acceptance test — first-firing verification

Operator runs once after PR ship, before relying on the rules:

```powershell
# Force-fire the synthetic from a wrangler dev session (skip waiting until Monday)
cd c:\Code\gst-website\mcp-server
npx wrangler dev --env production --remote --test-scheduled
# In a second terminal:
curl "http://localhost:8787/__scheduled?cron=0+14+*+*+1"
# Expected:
#   - Worker Logs: { event: 'alert-rule-synthetic.dispatch', success: true, env: 'production' }
#   - Sentry: new issue tagged event=alert-rule-synthetic
#   - Slack: [SYNTHETIC] BL-047 T1 weekly heartbeat message in #mcp-alerts within ~1 min
```

Document the first verified firing date in this section once complete:

> **First verified synthetic firing**: _pending — fill on first deploy + scheduled trigger_

## 5. Provenance

- Worker emit sites verified 2026-05-30 against [`inoreader-oauth.ts`](../../lib/inoreader-oauth.ts) HEAD on `feature/bl-047-backlog-cleanup`
- Inoreader OAuth contract (the failure shapes the rules subscribe to): [`INOREADER_OAUTH_CONTRACT.md`](./INOREADER_OAUTH_CONTRACT.md)
- BL-047 stanza (the parent ticket): [`BACKLOG.md` § BL-047](../../../../src/docs/development/BACKLOG.md)
- Sentry envelope path (how the events get to Sentry): [`sentry-envelope.ts`](../../observability/sentry-envelope.ts)
