/**
 * Sentry integration for the MCP Worker (BL-032 Phase 5; resolves Q6).
 *
 * Uses `@sentry/cloudflare`'s `withSentry` wrapper around the fetch handler.
 * The wrapper does three things automatically:
 *
 *   1. Inits Sentry once per isolate using the options callback (which
 *      receives `env` and returns CloudflareOptions or undefined for
 *      graceful skip when SENTRY_DSN isn't bound)
 *   2. Creates a per-request isolated scope so tags like `keyOwner` set
 *      with `Sentry.setTag(...)` inside the handler are scoped to that
 *      request only
 *   3. Captures any unhandled exception thrown from the handler (and
 *     forwards it to Sentry with the request-scoped tags applied)
 *
 * Per Q6 — this is wired against a NEW Sentry project (separate from the
 * website's), with `service: 'mcp-server'` as a baseline tag so dashboard
 * filters cleanly distinguish website vs MCP. The SENTRY_DSN secret is
 * issued in Phase 6 deploy; until then, the Worker runs without Sentry
 * (graceful skip via the undefined options callback return).
 *
 * **Tracing**: enabled at a low sample rate (0.1) so production volume
 * doesn't overwhelm the Sentry quota. BL-032.75 (observability maturity)
 * will tune this against measured baselines.
 *
 * **Privacy**: the request-scoped tags include `keyOwner` (the
 * `MCP_KEY_<INITIALS>` suffix per [`AUTH.md`](../docs/operations/AUTH.md)),
 * NOT the bearer token value. The safe-logger discipline carries forward
 * — Sentry breadcrumbs MUST NOT contain Authorization headers or bearer
 * tokens. The auto-instrumentation that comes with `withSentry` already
 * scrubs Authorization headers from request data; we add `keyOwner` as a
 * tag instead.
 */

import * as Sentry from '@sentry/cloudflare';
import type { CloudflareOptions } from '@sentry/cloudflare';
import type { Env } from '../worker';

/**
 * Sentry options callback used by `withSentry`. Returns undefined when
 * SENTRY_DSN isn't bound — the wrapper then passes through to the
 * underlying handler without initializing Sentry. This is the graceful-
 * skip path for local `wrangler dev` runs and pre-Phase-6 staging
 * deploys.
 */
export function sentryOptions(env: Env): CloudflareOptions | undefined {
  if (!env.SENTRY_DSN) return undefined;

  return {
    dsn: env.SENTRY_DSN,
    // Release identifier (git short SHA) used by Sentry to match events to
    // uploaded source maps. Injected by scripts/deploy.mjs via `wrangler
    // deploy --var SENTRY_RELEASE:<sha>`; when missing (e.g. `wrangler
    // dev`), omit the field rather than send a placeholder — Sentry treats
    // an undefined release differently from a wrong one.
    ...(env.SENTRY_RELEASE ? { release: env.SENTRY_RELEASE } : {}),
    // Phase 5 baseline. BL-032.75 tunes against measured production rates.
    tracesSampleRate: 0.1,
    // Apply tags to every event; per-request tags get layered on top via
    // tagRequest() inside the handler.
    initialScope: {
      tags: {
        service: 'mcp-server',
        // Worker isolates can be reused across requests — this tag identifies
        // the deploy, not the request. keyOwner / path land via tagRequest.
      },
    },
  };
}

/**
 * Apply per-request tags to the active Sentry scope. Called from
 * worker.ts immediately after bearer auth resolves the keyOwner. The
 * tags then attach to any exception captured for the rest of this
 * request — including exceptions thrown from MCP tool handlers.
 *
 * No-op when Sentry isn't initialized (`@sentry/cloudflare`'s setTag is
 * a safe no-op when `getClient()` returns undefined; we don't need our
 * own guard).
 */
export function tagRequest(keyOwner: string | undefined, path: string): void {
  Sentry.setTag('keyOwner', keyOwner ?? 'unauthenticated');
  Sentry.setTag('path', path);
}

/**
 * Manual exception capture — for cases where the handler catches an
 * exception and reports it through a structured error envelope (so the
 * caller never sees the raw throw) but we still want the diagnostic in
 * Sentry. The radar-live tools use this pattern: catch Inoreader errors,
 * return MCP-shaped error to the client, capture-but-don't-rethrow to
 * Sentry.
 */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

/**
 * Manual message capture — for handled-error paths that don't have an
 * Error instance to capture but still need to surface a breadcrumb to
 * Sentry so configured alert rules fire (per
 * [SENTRY_MANUAL_SETUP.md](../../../src/docs/development/SENTRY_MANUAL_SETUP.md)).
 *
 * Two known callers (BL-032 T.E.11 / T.E.12 closure):
 *   - worker.ts auth-fail path — every 401 emits one breadcrumb. Sentry's
 *     group-by-fingerprint handles dedup so a probing burst doesn't
 *     flood quota; the message is intentionally stable ("auth.failed
 *     bearer-rejected") so events group cleanly across paths.
 *   - radar-live.ts failureResponse path — Inoreader 429 / circuit-open
 *     events emit one breadcrumb. Low-volume by construction (once per
 *     6h breaker-open) so no rate-limit concern.
 *
 * `eventTag` parameter (added 2026-05-12): callers should pass a short
 * stable identifier ('auth.failed', 'inoreader-rate-limit', etc.) that
 * gets set as an `event:` tag on the Sentry event. This matches the
 * structured-log `event` field used by safeLog and lets Sentry alert
 * rules filter via `The event's tag {event} equals {value}` instead of
 * (or in addition to) the message-content filter. Falls back to no tag
 * if omitted, preserving the prior behavior.
 *
 * `extraTags` parameter (added 2026-05-16, BL-032.7 T.Z.3): structured
 * tags surfaced as searchable Sentry facets — e.g. for
 * `inoreader-rate-limit` events, the caller attaches
 * `inoreader.zone1.usage`, `inoreader.zone1.limit`,
 * `inoreader.reset_after_seconds` so RCA is a 30-second tag read in the
 * Sentry UI rather than a multi-hour Inoreader-dashboard hunt. Tag
 * values are coerced to strings by Sentry; pass numbers or booleans as
 * the underlying type and let the SDK serialize. Merges with the
 * `event:` tag from `eventTag` (caller can't accidentally override the
 * `event` key).
 *
 * No-op when Sentry isn't initialized — `@sentry/cloudflare`'s
 * captureMessage returns early if `getClient()` is undefined.
 */
export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'warning',
  context?: Record<string, unknown>,
  eventTag?: string,
  extraTags?: Record<string, string | number | boolean | undefined>
): void {
  // Merge tags: start with extraTags (caller-supplied), then layer the
  // event tag on top so it can't be overwritten. Skip undefined values
  // so they don't show up as the literal string "undefined" in Sentry.
  const tags: Record<string, string | number | boolean> = {};
  if (extraTags) {
    for (const [k, v] of Object.entries(extraTags)) {
      if (v !== undefined) tags[k] = v;
    }
  }
  if (eventTag) tags.event = eventTag;

  Sentry.captureMessage(message, {
    level,
    ...(context ? { extra: context } : {}),
    ...(Object.keys(tags).length > 0 ? { tags } : {}),
  });
}

/**
 * Drain the Sentry SDK's in-memory event queue. Returns `true` if the
 * queue was flushed within `timeoutMs`, `false` if the timeout fired
 * first.
 *
 * Why this exists: the fetch handler is wrapped in `withSentry`, which
 * holds the isolate open until any pending Sentry HTTP POSTs complete
 * before letting the Response return. The scheduled handler has no
 * Response to anchor that wait against — so `captureMessage` events
 * emitted from cron paths race against Cloudflare reclaiming the
 * isolate and can be dropped silently.
 *
 * Observed at BL-032.8 Phase B soak Day 3 (2026-05-19): Cloudflare's
 * cron event log showed all 4/4 daily firings succeeding, but Sentry
 * was only capturing ~1 of 4 `cron.radar-refresh.success` events. The
 * fix is to `await flushSentry()` inside `ctx.waitUntil` so the
 * isolate stays alive until the SDK has drained.
 *
 * No-op when Sentry isn't initialized (graceful: `Sentry.flush()`
 * returns true immediately if there's no active client).
 */
export async function flushSentry(timeoutMs = 2000): Promise<boolean> {
  return Sentry.flush(timeoutMs);
}

// Re-export `withSentry` so worker.ts has a single import surface for
// observability rather than reaching into @sentry/cloudflare directly.
export { withSentry } from '@sentry/cloudflare';
