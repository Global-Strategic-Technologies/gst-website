# Runbook — `radar-snapshot-stale`

lastReviewedAt: 2026-07-14

**Trigger**: FYI radar snapshot age > 43,200 s (12h = 2 × the 6h refresh cron). Threshold provenance: `observability/slo-baselines.md` freshness rule (signed off 2026-07-14). Severity: page — this is the customer-visible staleness signal.

**Data source**: Upstash `mcp:radar:cache:fyi` age via `probeRadarSnapshotAge` (`src/observability/health.ts`), evaluated by the 15-min alert-evaluator cron. A `null` age (cold cache / Upstash down) deliberately does NOT fire this rule — `health-check-failing` owns that signal.

## First 5 minutes

1. `https://mcp.globalstrategic.tech/status` — freshness row shows the age; `/health` shows `radarSnapshotAgeSeconds` + `inoreaderObservedAt/Source`.
2. Cloudflare dashboard → Workers → gst-mcp → Cron Events: did the last two `0 */6 * * *` firings run, and with what status?
3. Sentry: any `cron.radar-refresh.error` events or radar-refresh Crons monitor misses in the same window?
4. `wrangler tail --env production` across the next :00/:06 firing if the cause isn't obvious.

## Recovery

- Cron firing but erroring: the error event's stack points at the failing leg (Inoreader fetch, Upstash write). Inoreader-side auth failures → see `oauth-refresh-failure-rate` runbook + `src/docs/operations/AUTH.md` re-link flow.
- Cron not firing at all: check wrangler.toml triggers survived the last deploy (`git log -p mcp-server/wrangler.toml`); redeploy or rollback (`rollback-mcp.yml`).
- Circuit breaker open / budget skip (`cron_outcome` = `skipped-circuit` / `skipped-budget` in AE): resolves itself when the window resets; verify spend via the budget runbook.
- Manual refresh stopgap: hit the radar surface via an authenticated MCP call (`search_radar`) — live-tool calls also repopulate the snapshot.

## Escalation

Operator (RP). If the 6h cadence itself changes, update `FRESHNESS_MAX_AGE_SECONDS`, slo-baselines.md, health.ts comments, and this runbook in one pass.
