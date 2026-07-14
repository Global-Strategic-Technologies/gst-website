# Runbook — `sentry-envelope-post-failure-rate`

lastReviewedAt: 2026-07-14

**Trigger**: Sentry envelope delivery failure rate > 10% over the current UTC day with ≥ 10 attempts. Threshold provenance: design-doc rule, `observability/slo-baselines.md` (signed off 2026-07-14). Severity: ticket — this is loss of VISIBILITY, not loss of service.

**Data source**: Upstash day-counters `mcp:sentry-envelope:{ok,fail}:<date>` (TTL 48h), incremented best-effort inside `postEnvelope` (`src/observability/sentry-envelope.ts`).

> **Self-referential caveat (load-bearing)**: this alert is DELIVERED through the same envelope path it monitors. If envelope delivery is fully broken, the breach event for this rule may itself never reach Sentry. The fallback surfaces are:
>
> 1. `https://mcp.globalstrategic.tech/status` — the evaluator writes its summary to Upstash regardless of Sentry health; a breach shows there even when the email never arrives.
> 2. Workers Logs (`wrangler tail` / Cloudflare dashboard) — `sentry.envelope.post.non-2xx` / `.aborted` / `.network-error` lines attribute each drop.
> 3. Secondary symptom: the radar-refresh Crons monitor starts showing missed check-ins (its check-ins ride the same POST path).

## First 5 minutes

1. Check `/status` for the observed ok/fail counts.
2. `wrangler tail --env production` and filter the three failure-mode events — the dominant one is diagnostic:
   - `non-2xx` with 429 → Sentry project rate limit (free tier 5k events/mo exhausted? Check Sentry → Settings → Usage).
   - `non-2xx` with 4xx → DSN/auth problem (was `SENTRY_DSN` rotated?).
   - `aborted` → Sentry ingest slow; transient unless sustained.
   - `network-error` → egress/DNS problem, likely broader than Sentry.

## Recovery

- Quota exhaustion: identify the event flood source (an alert storm from another rule? check cooldowns), resolve it; quota resets at the billing period. Consider raising cooldowns before considering a paid tier.
- DSN rotation: `wrangler secret put SENTRY_DSN --env production` with the current DSN from Sentry project settings; redeploy not required (secrets bind live).
- Sustained Sentry-side outage: nothing local to fix; the Worker's own operation is unaffected (envelope posting is best-effort by contract).

## Escalation

Operator (RP).
