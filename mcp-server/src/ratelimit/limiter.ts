/**
 * Per-key rate limiter (BL-032 Phase 3).
 *
 * Sliding-window limiter backed by Upstash Redis (Q7). Each authenticated
 * request consumes one token from the **general** bucket; Phase 4 adds a
 * stricter parallel bucket for radar tools (5/min, 50/day) protecting the
 * shared Inoreader 200 req/day budget.
 *
 * Per-key tiers (active in this phase — general bucket):
 *   - 60 requests / minute (sliding window)
 *   - 1000 requests / day (sliding window)
 *
 * The PER-DAY check is deliberately a separate `Ratelimit` instance with
 * its own algorithm. A single sliding-window doesn't enforce both tiers
 * simultaneously — sequential checks let us return whichever bucket
 * exhausted first as the 429 envelope's RateLimit-* values.
 *
 * **Graceful skip**: when Upstash credentials aren't bound on `env`, the
 * limiter returns null instead of a result. The worker treats null as
 * "fail open" — request proceeds without enforcement, with a warning
 * logged via safeLog. Local `wrangler dev` runs work without Upstash
 * setup; production deploys must have the credentials wired (Phase 6).
 *
 * Reference: BACKLOG.md § BL-032 "Rate limiting"; this doc § Q7.
 */

import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import type { Env } from '../worker';

/**
 * Minimal `Ratelimit.limit()` response shape we consume. The library
 * doesn't export the type by name (`RatelimitResponse` is declared
 * privately in v2.x), so we mirror only the fields used here.
 */
interface RatelimitResponse {
  readonly success: boolean;
  readonly limit: number;
  readonly remaining: number;
  readonly reset: number;
}

/** Result of a rate-limit check, plus a flag indicating which tier triggered. */
export interface CheckResult {
  /** Whether the request is allowed through. */
  readonly allowed: boolean;
  /** RFC 9331-compatible window limit (max requests in the active window). */
  readonly limit: number;
  /** Requests remaining in the active window. */
  readonly remaining: number;
  /** Unix-ms timestamp when the active window resets. */
  readonly resetAt: number;
  /**
   * Which bucket dictated this result — `'minute'` if the per-minute tier
   * was the binding constraint, `'day'` if per-day. Used by the 429
   * envelope to communicate the right Retry-After duration.
   */
  readonly tier: 'minute' | 'day';
}

/** Limiter handle — `null` when Upstash isn't reachable (graceful skip). */
export interface Limiter {
  /**
   * Consume one token from the per-minute and per-day general buckets for
   * the given keyOwner. Returns the worse of the two — if either bucket
   * is exhausted, `allowed: false`.
   */
  check: (keyOwner: string) => Promise<CheckResult>;
}

const PERMINUTE_LIMIT = 60;
const PERDAY_LIMIT = 1000;
const KEY_PREFIX = 'mcp:ratelimit';

/**
 * Build a limiter from the Worker's env bindings, or return `null` if
 * Upstash credentials aren't present. Callers should treat `null` as
 * "fail open" with a safeLog warning.
 */
export function createLimiter(env: Env): Limiter | null {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const redis = new Redis({ url, token });

  const perMinute = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(PERMINUTE_LIMIT, '60 s'),
    prefix: `${KEY_PREFIX}:gen:min`,
    analytics: false,
  });

  const perDay = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(PERDAY_LIMIT, '1 d'),
    prefix: `${KEY_PREFIX}:gen:day`,
    analytics: false,
  });

  return {
    async check(keyOwner: string): Promise<CheckResult> {
      const [minRes, dayRes] = await Promise.all([
        perMinute.limit(keyOwner),
        perDay.limit(keyOwner),
      ]);

      // The binding tier is whichever bucket exhausted first (denied first),
      // or — if both passed — whichever has fewer remaining tokens. The
      // remaining/resetAt fields communicate the user's WORST-CASE budget,
      // which is what informs whether to back off.
      return chooseBindingTier(minRes, dayRes);
    },
  };
}

/**
 * Choose the binding tier — see CheckResult.tier docstring for the contract.
 * Pure function exposed for unit testing.
 */
export function chooseBindingTier(minute: RatelimitResponse, day: RatelimitResponse): CheckResult {
  // If either tier denied, return the denied tier's envelope. If both
  // denied, return the per-day envelope (it's the longer-window fail and
  // dictates the longer Retry-After).
  if (!minute.success && !day.success) {
    return {
      allowed: false,
      limit: day.limit,
      remaining: day.remaining,
      resetAt: day.reset,
      tier: 'day',
    };
  }
  if (!minute.success) {
    return {
      allowed: false,
      limit: minute.limit,
      remaining: minute.remaining,
      resetAt: minute.reset,
      tier: 'minute',
    };
  }
  if (!day.success) {
    return {
      allowed: false,
      limit: day.limit,
      remaining: day.remaining,
      resetAt: day.reset,
      tier: 'day',
    };
  }

  // Both passed — surface whichever has fewer remaining (worst-case headers).
  // Tie-break on the per-minute tier so RateLimit-Reset shows the closer
  // window expiry.
  const minuteCloser = minute.remaining <= day.remaining;
  return minuteCloser
    ? {
        allowed: true,
        limit: minute.limit,
        remaining: minute.remaining,
        resetAt: minute.reset,
        tier: 'minute',
      }
    : {
        allowed: true,
        limit: day.limit,
        remaining: day.remaining,
        resetAt: day.reset,
        tier: 'day',
      };
}
