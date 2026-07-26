/**
 * RateLimit-* header builder + 429 response envelope (BL-032 Phase 3).
 *
 * Implements the IETF "RateLimit header fields for HTTP" spec
 * (draft-ietf-httpapi-ratelimit-headers), which standardizes:
 *   - RateLimit-Limit:     max requests in the active window
 *   - RateLimit-Remaining: requests left
 *   - RateLimit-Reset:     seconds until the active window resets
 *   - RateLimit-Policy:    the quota policy in force (BL-033 Slice 5)
 *
 * (Earlier revisions of this file cited "RFC 9331" for these fields — that
 * is wrong: RFC 9331 is L4S ECN. The RateLimit fields are the httpapi draft
 * above; corrected 2026-07-26.)
 *
 * On 429 responses we additionally emit `Retry-After` (RFC 7231) — older
 * clients that don't read the RateLimit fields can still honor it. Both
 * headers carry the same value (seconds until reset).
 *
 * These are pure functions over a `CheckResult` from `./limiter.ts`. No
 * Upstash, no env. Unit-testable in isolation.
 */

import type { CheckResult } from './limiter';
import type { TierLimits } from './tiers';

/**
 * Map the binding tier to a stable `reason` string for the 429 JSON body
 * and the safeLog `ratelimit.exceeded` event. Lets agents distinguish
 * "I'm hitting the radar-specific limit, slow my radar polling" from
 * "I'm hitting the general limit, slow everything." (BL-038)
 */
export function reasonForTier(tier: CheckResult['tier']): string {
  switch (tier) {
    case 'minute':
      return 'rate-limit-per-minute';
    case 'day':
      return 'rate-limit-per-day';
    case 'radar-minute':
      return 'radar-rate-limit-per-minute';
    case 'radar-day':
      return 'radar-rate-limit-per-day';
  }
}

/**
 * Build the `RateLimit-Policy` header value describing the client's
 * tier ceilings (BL-033 Slice 5). Unlike the `RateLimit-*` counters, this is
 * a static description of the *policy* — the windows that apply to this
 * request — so client engineers can self-diagnose which budget they're
 * pacing against without hitting a 429 first.
 *
 * Syntax (draft-ietf-httpapi-ratelimit-headers quoted-policy form): one
 * comma-separated member per bucket, each `"<name>";q=<quota>;w=<window-s>`.
 * A `general` call advertises the two general buckets; a `radar` call
 * additionally advertises the stricter radar pair it also consumes.
 */
export function rateLimitPolicyHeader(limits: TierLimits, toolClass: 'general' | 'radar'): string {
  const members = [
    `"general-min";q=${limits.perMinute};w=60`,
    `"general-day";q=${limits.perDay};w=86400`,
  ];
  if (toolClass === 'radar') {
    members.push(
      `"radar-min";q=${limits.radarPerMinute};w=60`,
      `"radar-day";q=${limits.radarPerDay};w=86400`
    );
  }
  return members.join(', ');
}

/**
 * Build the RateLimit-* headers from a check result. Round-up to whole seconds —
 * the spec requires an integer; floor would tell clients to retry slightly
 * before the window actually resets.
 */
export function rateLimitHeaders(result: CheckResult): Record<string, string> {
  const nowMs = Date.now();
  const resetSec = Math.max(0, Math.ceil((result.resetAt - nowMs) / 1000));
  return {
    'RateLimit-Limit': String(result.limit),
    'RateLimit-Remaining': String(result.remaining),
    'RateLimit-Reset': String(resetSec),
  };
}

/**
 * Build a 429 Response from a denied check result. Carries the RateLimit-*
 * headers above plus `Retry-After` (RFC 7231) and a structured JSON body
 * naming the binding tier so clients can format a useful error message.
 */
export function tooManyRequestsResponse(result: CheckResult, policy?: string): Response {
  if (result.allowed) {
    throw new Error('tooManyRequestsResponse called with allowed=true; programmer error');
  }
  const headers = rateLimitHeaders(result);
  const retryAfter = headers['RateLimit-Reset'];
  const body = JSON.stringify({
    error: 'rate_limit_exceeded',
    message: `Per-${result.tier} rate limit exceeded; retry after ${retryAfter} seconds.`,
    tier: result.tier,
    reason: reasonForTier(result.tier),
    limit: result.limit,
    retryAfterSeconds: Number(retryAfter),
  });
  return new Response(body, {
    status: 429,
    headers: {
      ...headers,
      ...(policy ? { 'RateLimit-Policy': policy } : {}),
      'Retry-After': retryAfter,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Add the RateLimit-* headers to an already-constructed allowed response. Always
 * returns a new Response (Workers' Response.headers can be immutable). When
 * `policy` is supplied (BL-033 Slice 5), also emit `RateLimit-Policy` so the
 * tier ceilings ride on every authenticated 200, not just 429s.
 */
export function withRateLimitHeaders(
  response: Response,
  result: CheckResult,
  policy?: string
): Response {
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(rateLimitHeaders(result))) {
    newHeaders.set(key, value);
  }
  if (policy) newHeaders.set('RateLimit-Policy', policy);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
