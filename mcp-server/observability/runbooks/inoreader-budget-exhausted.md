# Runbook — `inoreader-budget-exhausted`

lastReviewedAt: 2026-07-25

**Trigger**: today's Zone-1 Inoreader spend ≥ 70% (ticket) / ≥ 90% (page) of the 100/day hard cap (`ZONE1_DAILY_HARD_CAP`, `src/lib/inoreader-egress.ts`). Threshold provenance: `observability/slo-baselines.md` § Proposed SLO targets (signed off 2026-07-14 — baseline utilization is ~14%, so any firing is a real anomaly, not noise).

**Data source**: Upstash spend counters (`mcp:inoreader:zone1-spend:<date>[:<cat>]`) via `readInoreaderSpend`, evaluated by the 15-min alert-evaluator cron.

## First 5 minutes

1. Open `https://mcp.globalstrategic.tech/status` — the budget row shows spend/cap and the per-category picture is on `/health` (`inoreaderSpend.byCategory`).
2. Identify the burning category:
   - `cron-radar` high → cron runaway (should be ~4 calls per 6h firing; check for repeated firings in `wrangler tail` / Cloudflare cron dashboard).
   - `live-radar` / `http-radar-snapshot` high → a client (or the website SSR) is hammering the radar surface — check per-key AE traffic (`Verify-AeEmission.ps1 -Env production -WindowHours 6`; add `-Detailed` for the per-status-code / Zone-1 breakdown of the `inoreader_call` egress — which calls are burning budget and with what outcomes).
   - `401-retry` high → auth churn; see `oauth-refresh-failure-rate` runbook.
3. Check the Sentry issue's `extra` for the observed totals at evaluation time.

## Recovery

- Cron runaway: the circuit breaker + `DAILY_SOFT_CAP` in `cron/radar-refresh.ts` should self-limit; if not, disable the radar cron by removing its expression from `wrangler.toml` production triggers and deploying (rollback via `rollback-mcp.yml` if needed).
- Client hammering: identify the key via AE `index1`, rotate/limit per `src/docs/operations/AUTH.md`; the per-key rate limiter should already be throttling — investigate why it isn't.
- At 100/day Inoreader starts rejecting: radar goes stale (the `radar-snapshot-stale` alert will follow); no data loss — snapshots resume next window.

## Escalation

Operator (RP). If Inoreader-side quota semantics changed (cap lowered), update `ZONE1_DAILY_HARD_CAP` + this runbook + slo-baselines.md amendment row together.
