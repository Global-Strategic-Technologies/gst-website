# BL-032.76 — Production verification runbook (cron Sentry bypass)

## Context

BL-032.76 (PR #175, merged 2026-05-27) replaces the `@sentry/cloudflare` SDK on the scheduled-handler path with direct envelope POSTs. The SDK's `wrapScheduledHandler` queued its own `ctx.waitUntil(flushAndDispose(client))` outside any try/catch we controlled; under Workers runtime conditions that queued promise rejected, producing Cloudflare `Exception Thrown` on every cron firing while the underlying radar work succeeded. Three in-tree fix attempts (flush, withMonitor layering, outer try/catch around our IIFE) did not resolve the symptom; upstream check ([getsentry/sentry-javascript](https://github.com/getsentry/sentry-javascript)) found no documented workaround. The structural fix was to stop wrapping `scheduled` with `withSentry` entirely.

This runbook documents the verification drill for the first natural cron firing post-deploy. It exists because future SDK-related cron incidents (or future bypass attempts) will follow the same observational discipline — Cloudflare offers no API or CLI to fire a scheduled event on a deployed Worker, so the verification is strictly against the natural cron cadence.

## Pre-deploy state

- **Deployed gitSha**: `c7dcd1d` (Phase B branch HEAD; includes BL-032.76 + Phase B retirement)
- **PR**: <https://github.com/Global-Strategic-Technologies/gst-website/pull/175>
- **Production cron schedule**: `0 */6 * * *` (every 6h at the top of the UTC hour)
- **First firing post-deploy**: 2026-05-27 18:00 UTC

## Manual triggering — not available

Cloudflare does not expose an API or CLI to fire a scheduled event on a deployed Worker. `wrangler dev --test-scheduled` exposes a local `/__scheduled` endpoint **but that endpoint does not exist on deployed Workers** — per the [Cloudflare Workers Scheduled handler docs](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/). Verification is **strictly observational against the next natural cron firing**.

If a verification must run faster than the 6h cadence, the only documented option is to temporarily set a tighter schedule in `wrangler.toml`:

```toml
[env.production.triggers]
crons = ["*/15 * * * *"]   # was "0 */6 * * *"
```

…then `npm run deploy:production` to apply, observe the next firing, immediately revert + redeploy. Cost: ~6 Inoreader Zone-1 calls per accelerated firing. The soft-cap guard in `mcp-server/src/cron/radar-refresh.ts:187` auto-skips firings once the day-counter approaches 94 — so the accelerated cron won't blow the daily budget cap even if left running too long.

> **Note**: the Cloudflare AI assistant has historically claimed a "Trigger Event" button exists on the cron-events dashboard. Repeated user verification (2026-05-27 session) did not find it. Cloudflare's own public docs document only the local-dev `--test-scheduled` flow. Treat any future "manual trigger" workflow as requiring fresh verification before relying on it.

## What to verify at each surface

### 1. Cloudflare cron-events dashboard

URL: <https://dash.cloudflare.com/4956af092a3878a18fa35e1b1240785b/workers/services/cron-events/gst-mcp/production>

**Expected**: most-recent firing reports `Success` (green dot), not `Error` (red dot).

This is the headline BL-032.76 verification signal. The dashboard records `outcome: exception` whenever any `ctx.waitUntil` promise rejects — pre-fix, the SDK's queued flush promise was the rejection source. Post-fix, the only `ctx.waitUntil` is our own (wrapped in an inner + outer try/catch), so a rejection here means we have a different issue.

### 2. Sentry mcp-server → Crons

Filter to monitor slug `radar-refresh`. **Expected**: an `in_progress` check-in followed by an `ok` check-in (paired by `check_in_id`), with non-zero duration between them.

The envelope-based check-in lifecycle is the BL-032.76 architecture's Sentry-side signal. If both check-ins are absent, the envelope POST is broken — different failure than the pre-fix SDK issue. Escalate.

### 3. Sentry mcp-server → Issues

Filter to `cron.radar-refresh.*`. **Expected**: a `cron.radar-refresh.success` event arrives within ~1 minute of the firing (or `.skipped` if circuit-open / day-cap was tripped).

### 4. `/health` curl

```bash
curl https://mcp.globalstrategic.tech/health
```

**Expected**: `inoreaderObservedAt` updates to within seconds of the firing's UTC timestamp; `radarSnapshotAgeSeconds` resets to ~0. This is the prod-truth signal that the cron actually executed the radar refresh (independent of how Cloudflare's dashboard reports the firing).

### 5. `wrangler tail --env production`

Tail during the firing window. **Expected**: two clean structured-log lines from the handler:

```
{"timestamp":"...","event":"cron.proactive-refresh.skipped","reason":"ttl-fresh"}
{"timestamp":"...","event":"cron.radar-refresh.success","success":true}
```

No `Exception Thrown` header on the firing line, no swallowed errors logged.

## Decision matrix

| Observation                                                 | Action                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **All four surfaces clean**                                 | Proceed with Phase B merge + redeploy master to prod                                                                                                                                                                                                      |
| **Cloudflare `Error` but Sentry shows clean `ok` check-in** | Unexpected — the rejection is coming from somewhere other than the SDK we bypassed. Open an investigation issue. **Do NOT merge Phase B yet** — stacking changes during an unresolved incident makes diagnosis harder.                                    |
| **Sentry shows no `radar-refresh` check-in**                | The envelope POST is broken. Check `wrangler tail` for swallowed errors. Verify the `SENTRY_DSN` env binding via `npx wrangler secret list --env production`. Check network egress to `o4511195716386816.ingest.us.sentry.io`.                            |
| **`/health` shows stale `inoreaderObservedAt`**             | The cron is not actually executing the radar refresh. Independent of BL-032.76 — likely an Inoreader auth or Upstash issue. Check `mcp:inoreader:access_token` TTL via Upstash console; check Inoreader Developer Console for Zone-1 / Zone-2 exhaustion. |

## Phase B retirement secondary verification

> **✅ Completed 2026-05-27** — Phase B (PR #140) merged 2026-05-27; operator-side decommissioning of the legacy Inoreader Upstash DB + Vercel/Worker secret cleanup completed the same day. Substrate verified clean post-cleanup via `/health` returning `upstashMcp: "ok"` with no `upstashInoreader` field. Historical procedure retained below.

Phase B (PR #140, merged 2026-05-27) deleted the BL-039 `triggerWebsiteRefresh` fallback that the Worker-direct OAuth refresh path supersedes. Verification: grep Sentry over the 24h post-deploy for any `triggerWebsiteRefresh` invocations — **expected: zero**. Their absence confirms the Worker-direct refresh is the sole code path in flight (no fallback was needed during normal operation).

## Related

- BL-032.76 backlog entry: [`src/docs/development/BACKLOG.md` § BL-032.76](../../../../../src/docs/development/BACKLOG.md)
- BL-032.76 PR: <https://github.com/Global-Strategic-Technologies/gst-website/pull/175>
- Envelope helper source: [`mcp-server/src/observability/sentry-envelope.ts`](../../../observability/sentry-envelope.ts)
- Scheduled handler post-fix: [`mcp-server/src/worker.ts` `async scheduled()`](../../../worker.ts)
- Upstream issue (related, not the same symptom): <https://github.com/getsentry/sentry-javascript/issues/17476> (waitUntil events lost — open)
