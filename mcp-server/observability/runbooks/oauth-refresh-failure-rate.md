# Runbook — `oauth-refresh-failure-rate`

lastReviewedAt: 2026-07-14

**Trigger**: Inoreader OAuth refresh failure rate > 20% over the last hour with ≥ 5 attempts (min-sample guard — refreshes are low-volume, ~6/week at baseline). Threshold provenance: design-doc rule, `observability/slo-baselines.md` (signed off 2026-07-14). Severity: page — silent auth decay ends in a dead refresh token and a stale radar.

**Data source**: AE SQL (`blob1='inoreader_call' AND blob2='oauth-refresh'` grouped by outcome, 1h) via the Worker's AE secrets. Complements (does not replace) the BL-047 T1 Sentry rules on specific OAuth failure classes — this rule catches the RATE trend; those catch first occurrences of `invalid-refresh-token` / `token-missing` / `upstash-write-failed`.

## First 5 minutes

1. `/health` → `inoreaderRefreshTokenHealth`: `lastSuccessfulRefreshAt`, `rotationsLast24h`, and the `recentRefreshFailureCounts` breakdown tell you WHICH failure class is driving the rate.
2. Cross-check the BL-047 T1 Sentry issues — a specific-class alert has likely fired alongside this rate alert.
3. `invalid-refresh-token` dominant → the token is dead or was rotated away underneath us (grace-window overrun).

## Recovery

- Dead refresh token: run the 1-click re-link — `https://mcp.globalstrategic.tech/admin/inoreader/reauth/start` (admin key required), per `src/docs/operations/AUTH.md` (BL-047 T2 flow).
- `upstash-write-failed`: token refreshed but persistence failed — see `health-check-failing` runbook (Upstash) first; the grace-window hedge usually rides it out.
- `inoreader-error` (5xx from Inoreader): provider-side; verify via Inoreader status/next cron firing; nothing to fix locally.

## Escalation

Operator (RP) — the re-link flow requires the operator's Inoreader browser session.
