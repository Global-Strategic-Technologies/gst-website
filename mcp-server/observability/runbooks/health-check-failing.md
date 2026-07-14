# Runbook — `health-check-failing`

lastReviewedAt: 2026-07-14

**Trigger**: `buildHealthPayload(env)` reports `upstashMcp: 'degraded'` (page) or `ok: false` for any other reason (ticket — in practice: last observed Inoreader call degraded). Threshold provenance: availability floor row in `observability/slo-baselines.md` (signed off 2026-07-14).

**Data source**: direct in-process `buildHealthPayload` call from the 15-min alert-evaluator cron — NOT an HTTP self-probe (a Worker cannot fetch its own hostname; Cloudflare recursion protection). External-observer 5xx coverage is deferred with the Grafana/uptime-monitor item.

## First 5 minutes

1. `curl https://mcp.globalstrategic.tech/health` from outside — confirm what an external observer sees (the page fired on in-process state; corroborate).
2. `upstashMcp: degraded` → Upstash console: is the MCP DB up? Regional incident? Check the write-probe error in `wrangler tail`.
3. `inoreader: degraded` → check `inoreaderObservedAt` (is the observation fresh?) and the refresh-token health block on `/health`; likely companion: `oauth-refresh-failure-rate`.
4. Sentry: correlate with any `cron.radar-refresh.error` / OAuth alert issues in the same window.

## Recovery

- Upstash outage: nothing to fix Worker-side — rate limiting, caches, and locks all fail open by design. Confirm recovery when the write-probe flips back to `ok`. If Upstash credentials were rotated without updating Worker secrets: `wrangler secret put UPSTASH_MCP_REST_URL/TOKEN --env production` per `src/docs/operations/DEPLOY.md`.
- Inoreader degraded: follow `src/docs/operations/AUTH.md` (re-auth flow at `/admin/inoreader/reauth/start` if the refresh token is dead).
- If `/health` itself 5xxes externally (not covered by this rule): likely a Worker exception — Cloudflare dashboard → Workers → errors + `wrangler tail`; rollback via `rollback-mcp.yml` if a recent deploy caused it.

## Escalation

Operator (RP).
