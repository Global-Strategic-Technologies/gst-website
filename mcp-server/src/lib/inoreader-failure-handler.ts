/**
 * Centralized Inoreader-failure handler (T.Z.2 — BL-032.7).
 *
 * Before this module existed, the circuit breaker was opened only by
 * the live-tool failure path in `radar-live.ts`. The cron's partial-
 * outcome path called `captureMessage` but never invoked `openCircuit`,
 * which meant:
 *
 *   - Cron could 429-loop hourly for an entire day without ever
 *     surfacing the upstream degradation as a 503 to live consumers
 *   - The first live tool call after Inoreader recovered THEN tripped
 *     the breaker — closing the barn door after the horse had bolted
 *     and blanking the radar surface for 6 more hours on top of the
 *     incident window
 *
 * The 2026-05-15 BL-032.6 demo-day RCA proved this in production —
 * see BL-032_5_TESTING_FINDINGS.md § T.Z.2 for the trace.
 *
 * **Contract**: every Inoreader call site (cron OR live tool) routes
 * its failures through this helper. On `inoreader-rate-limit`, the
 * helper opens the breaker AND emits a Sentry message tagged with the
 * Zone-1/Zone-2 diagnostic headers (T.Z.3) so RCA is self-explaining.
 * Other failure reasons (token-stale, network-timeout, etc.) are
 * pass-through — the caller's structured log carries them; the breaker
 * is reserved for "upstream is intentionally rejecting us" signals.
 *
 * The helper is best-effort. Upstash unreachable returns silently —
 * the live-tool side's `failureResponse` will return the same MCP
 * error envelope to the user either way.
 */

import { openCircuit } from '../ratelimit/circuit-breaker';
import { captureMessage } from '../observability/sentry';
import type { Env } from '../worker';
import type { InoreaderFailure, RateLimitInfo } from './inoreader-worker';

/**
 * Source labels for the `source:` Sentry tag, so dashboard filters can
 * distinguish "live tool tripped the breaker" from "cron tripped it"
 * without having to read the message body. Free-form strings are
 * accepted — these are conventions, not constraints — but using the
 * documented values keeps Sentry's tag value cardinality sane.
 */
export type InoreaderFailureSource =
  | 'cron-wire'
  | 'cron-fyi'
  | 'live-search-radar'
  | 'live-get-latest-insights';

/**
 * Build the structured Sentry tag set from a RateLimitInfo block. Same
 * shape across cron + live paths so Sentry queries are uniform. Skips
 * undefined values to keep the Sentry UI clean (the literal string
 * "undefined" showing up as a tag value is the failure mode we are
 * avoiding here).
 */
function rateLimitTags(
  info: RateLimitInfo | undefined,
  source: InoreaderFailureSource
): Record<string, string | number | undefined> {
  if (!info) return { 'inoreader.source': source };
  return {
    'inoreader.source': source,
    'inoreader.zone1.usage': info.zone1Usage,
    'inoreader.zone1.limit': info.zone1Limit,
    'inoreader.zone2.usage': info.zone2Usage,
    'inoreader.zone2.limit': info.zone2Limit,
    'inoreader.reset_after_seconds': info.resetAfterSeconds,
  };
}

/**
 * Centralized failure side-effect handler. Both the cron's per-tier
 * partial path AND the live-tool failureResponse path call this so the
 * breaker decision is identical regardless of which surface detected
 * the upstream 429.
 *
 * Returns nothing — all side effects are observability + breaker. The
 * caller is responsible for constructing the response envelope (MCP
 * error for live tools, partial RefreshOutcome for cron).
 */
export async function handleInoreaderFailure(
  env: Env,
  failure: InoreaderFailure,
  source: InoreaderFailureSource
): Promise<void> {
  if (failure.reason !== 'inoreader-rate-limit') {
    // Non-429 upstream errors don't trip the breaker. The caller's
    // structured log + failure envelope are the user-facing signal;
    // adding a Sentry breadcrumb here would just create noise for
    // transient network blips.
    return;
  }

  // Open the breaker BEFORE the Sentry capture so a slow Sentry call
  // doesn't delay the protective side effect.
  await openCircuit(env, `inoreader-429-${source}`);

  captureMessage(
    'inoreader-rate-limit',
    'error',
    {
      status: failure.status,
      message: failure.message,
      source,
      ...(failure.rateLimitInfo ? { rateLimitInfo: failure.rateLimitInfo } : {}),
    },
    'inoreader-rate-limit',
    rateLimitTags(failure.rateLimitInfo, source)
  );
}
