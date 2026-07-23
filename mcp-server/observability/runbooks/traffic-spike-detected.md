# Runbook — `traffic-spike-detected`

lastReviewedAt: 2026-07-23

**Trigger**: any bearer key's `tool_invocation` count in the last hour exceeds 10× its trailing-7-day hourly mean AND the absolute floor of 30 calls/hour. Threshold provenance: design-doc traffic rule + the min-count floor added because the 2026-07-14 baseline measured ZERO client traffic (`observability/slo-baselines.md` § Window findings — without the floor, the first genuine user would page as a 0→N spike). Severity: ticket.

**Exemption**: keyOwners in `SYNTHETIC_KEY_OWNERS` (`src/observability/alert-rules.ts`) are skipped — currently only `PROBE`, the BL-033 scheduled latency probe (`scripts/probe-latency.mjs`, ~32 tool calls per run, deliberately above the 30/h floor). Synthetic traffic is volume-bounded by design and guarded by the per-key rate limiter; it must never page. If a spike report names `PROBE` anyway, the exclusion has regressed — fix `alert-rules.ts`, don't tune thresholds. Widen the set only for future synthetic keys, never for real team/client keys.

**Data source**: two AE SQL queries (per-`index1` counts, 1h vs 7d) via the Worker's `CF_AE_TOKEN`/`CF_ACCOUNT_ID` secrets, compared in code (AE SQL has no joins). Fails open when secrets are unbound.

## First 5 minutes

1. The Sentry issue's `extra` names the spiking `keyOwner` (the stripped `MCP_KEY_*` suffix; `__none__` = unauthenticated surfaces).
2. Characterize the traffic: `.\mcp-server\scripts\Verify-AeEmission.ps1 -Env production -WindowHours 1` shows which tools are being called.
3. Legitimate burst (team member's heavy IRL session, a pilot demo)? Then this is informational — the per-key rate limiter (5/min, 50/day radar tier; broader tiers per limiter config) is the actual guard.

## Recovery

- Abusive/compromised key: rotate it (`wrangler secret put MCP_KEY_<INITIALS> --env production` with a fresh value; distribute per `src/docs/operations/AUTH.md`). The old bearer dies at the next isolate rotation.
- Rate limiter not engaging: check `rate_limit_decision` events in AE (`blob4` allow/throttle/deny distribution) — if everything is `allow` under hammering, investigate the limiter config before blaming the client.
- Recurring false positives as real client traffic grows: recalibrate — re-run `npm run ae:baseline`, amend slo-baselines.md, and raise the floor/multiplier in `alert-rules.ts` in the same PR.

## Escalation

Operator (RP).
