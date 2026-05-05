/**
 * RFC 9331 RateLimit-* header builder + 429 response envelope (BL-032 Phase 3).
 *
 * RFC 9331 (the "RateLimit Header Fields for HTTP" RFC) standardizes:
 *   - RateLimit-Limit:     max requests in the active window
 *   - RateLimit-Remaining: requests left
 *   - RateLimit-Reset:     seconds until the active window resets
 *
 * On 429 responses we additionally emit `Retry-After` (RFC 7231) — older
 * clients that don't read the RFC 9331 fields can still honor it. Both
 * headers carry the same value (seconds until reset).
 *
 * These are pure functions over a `CheckResult` from `./limiter.ts`. No
 * Upstash, no env. Unit-testable in isolation.
 */

import type { CheckResult } from './limiter';

/**
 * Build RFC 9331 headers from a check result. Round-up to whole seconds —
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
 * Build a 429 Response from a denied check result. Carries the RFC 9331
 * headers above plus `Retry-After` (RFC 7231) and a structured JSON body
 * naming the binding tier so clients can format a useful error message.
 */
export function tooManyRequestsResponse(result: CheckResult): Response {
  if (result.allowed) {
    throw new Error('tooManyRequestsResponse called with allowed=true; programmer error');
  }
  const headers = rateLimitHeaders(result);
  const retryAfter = headers['RateLimit-Reset'];
  const body = JSON.stringify({
    error: 'rate_limit_exceeded',
    message: `Per-${result.tier} rate limit exceeded; retry after ${retryAfter} seconds.`,
    tier: result.tier,
    limit: result.limit,
    retryAfterSeconds: Number(retryAfter),
  });
  return new Response(body, {
    status: 429,
    headers: {
      ...headers,
      'Retry-After': retryAfter,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Add RFC 9331 headers to an already-constructed allowed response. Always
 * returns a new Response (Workers' Response.headers can be immutable).
 */
export function withRateLimitHeaders(response: Response, result: CheckResult): Response {
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(rateLimitHeaders(result))) {
    newHeaders.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
