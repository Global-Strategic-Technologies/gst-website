/**
 * Per-key rate limiter (BL-032 Phase 3 + BL-038).
 *
 * Sliding-window limiter backed by Upstash Redis (Q7). Every authenticated
 * request consumes one token from the **general** buckets (60/min, 1000/day);
 * radar tools (`search_radar`, `get_latest_insights`) additionally consume
 * from a stricter **radar** pair (5/min, 50/day) — see BL-038. The radar
 * tier protects the shared Inoreader 200 req/day budget against cache-miss-
 * aligned abuse patterns where one key with a valid bearer could otherwise
 * exhaust upstream budget through cold radar calls in a few minutes.
 *
 * Per-key tiers (active in this phase):
 *   - 60 requests / minute (general, sliding window)
 *   - 1000 requests / day (general, sliding window)
 *   - 5 requests / minute (radar tools only, sliding window)
 *   - 50 requests / day (radar tools only, sliding window)
 *
 * Each tier is a separate `Ratelimit` instance with its own algorithm.
 * General requests check 2 buckets in parallel; radar requests check all
 * 4. Whichever bucket exhausts first (or — if all pass — has the fewest
 * remaining tokens) dictates the 429 envelope's `RateLimit-*` values.
 *
 * **Graceful skip**: when Upstash credentials aren't bound on `env`, the
 * limiter returns null instead of a result. The worker treats null as
 * "fail open" — request proceeds without enforcement, with a warning
 * logged via safeLog. Local `wrangler dev` runs work without Upstash
 * setup; production deploys must have the credentials wired (Phase 6).
 *
 * Reference: BACKLOG.md § BL-032 "Rate limiting"; BL-038; this doc § Q7.
 */

import { Ratelimit } from '@upstash/ratelimit';
import { createMcpClient } from '../lib/upstash-clients';
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
   * Which bucket dictated this result. `'minute'` / `'day'` are the general
   * tiers; `'radar-minute'` / `'radar-day'` are the stricter BL-038 tiers
   * applied only to radar tool dispatch. Used by the 429 envelope to
   * communicate the right Retry-After duration AND to drive the `reason`
   * field so agents can distinguish "slow my radar polling" from "slow
   * everything."
   */
  readonly tier: 'minute' | 'day' | 'radar-minute' | 'radar-day';
}

/** Limiter handle — `null` when Upstash isn't reachable (graceful skip). */
export interface Limiter {
  /**
   * Consume one token from the relevant per-minute + per-day buckets for the
   * given keyOwner. `toolClass: 'general'` runs the 2 general buckets; `'radar'`
   * runs all 4 (radar tools count against general AND radar — the additivity
   * contract documented in `RATE_LIMITS.md`). Returns the binding tier — if
   * any bucket is exhausted, `allowed: false`.
   */
  check: (keyOwner: string, toolClass: 'general' | 'radar') => Promise<CheckResult>;
}

const PERMINUTE_LIMIT = 60;
const PERDAY_LIMIT = 1000;
const PERRADARMINUTE_LIMIT = 5;
const PERRADARDAY_LIMIT = 50;
const KEY_PREFIX = 'mcp:ratelimit';

/**
 * Build a limiter from the Worker's env bindings, or return `null` if
 * Upstash credentials aren't present. Callers should treat `null` as
 * "fail open" with a safeLog warning.
 */
export function createLimiter(env: Env): Limiter | null {
  const redis = createMcpClient(env);
  if (!redis) return null;

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

  const perRadarMinute = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(PERRADARMINUTE_LIMIT, '60 s'),
    prefix: `${KEY_PREFIX}:radar:min`,
    analytics: false,
  });

  const perRadarDay = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(PERRADARDAY_LIMIT, '1 d'),
    prefix: `${KEY_PREFIX}:radar:day`,
    analytics: false,
  });

  return {
    async check(keyOwner: string, toolClass: 'general' | 'radar'): Promise<CheckResult> {
      if (toolClass === 'general') {
        const [minRes, dayRes] = await Promise.all([
          perMinute.limit(keyOwner),
          perDay.limit(keyOwner),
        ]);
        return chooseBindingTier(minRes, dayRes);
      }
      const [minRes, dayRes, radarMinRes, radarDayRes] = await Promise.all([
        perMinute.limit(keyOwner),
        perDay.limit(keyOwner),
        perRadarMinute.limit(keyOwner),
        perRadarDay.limit(keyOwner),
      ]);
      return chooseBindingTier4(minRes, dayRes, radarMinRes, radarDayRes);
    },
  };
}

interface TaggedBucket {
  readonly res: RatelimitResponse;
  readonly tier: CheckResult['tier'];
  /** All-pass tie-break: lower wins. Order = closest-cliff window first. */
  readonly allPassPriority: number;
  /** Deny tie-break: higher (day-class=1) preferred over (minute-class=0). */
  readonly denyClass: 0 | 1;
}

/**
 * Generalized binding-tier picker. Internal helper shared by the 2-bucket
 * and 4-bucket public entrypoints to keep the deny-precedence + all-pass
 * tie-break rules in one place.
 *
 * Rules (see BL-038 design doc § Implementation design step 3):
 *   - If ≥1 bucket denied: return the denied envelope whose `reset` is
 *     LATEST (longest Retry-After). Tie-break: day-class > minute-class.
 *   - If all passed: return the envelope with FEWEST remaining tokens.
 *     Tie-break: lower `allPassPriority` wins (closest-cliff first).
 */
function pickBindingTier(buckets: readonly TaggedBucket[]): CheckResult {
  const denied = buckets.filter((b) => !b.res.success);
  if (denied.length > 0) {
    const sorted = [...denied].sort((a, b) => {
      if (a.res.reset !== b.res.reset) return b.res.reset - a.res.reset;
      return b.denyClass - a.denyClass;
    });
    const chosen = sorted[0]!;
    return {
      allowed: false,
      limit: chosen.res.limit,
      remaining: chosen.res.remaining,
      resetAt: chosen.res.reset,
      tier: chosen.tier,
    };
  }
  const sorted = [...buckets].sort((a, b) => {
    if (a.res.remaining !== b.res.remaining) return a.res.remaining - b.res.remaining;
    return a.allPassPriority - b.allPassPriority;
  });
  const chosen = sorted[0]!;
  return {
    allowed: true,
    limit: chosen.res.limit,
    remaining: chosen.res.remaining,
    resetAt: chosen.res.reset,
    tier: chosen.tier,
  };
}

/**
 * 2-bucket binding tier (general traffic). Pure function exposed for unit
 * testing. Behavior preserved bit-for-bit from the pre-BL-038 implementation:
 * all-pass tie-break prefers `'minute'` (closer reset window).
 */
export function chooseBindingTier(minute: RatelimitResponse, day: RatelimitResponse): CheckResult {
  return pickBindingTier([
    { res: minute, tier: 'minute', allPassPriority: 0, denyClass: 0 },
    { res: day, tier: 'day', allPassPriority: 1, denyClass: 1 },
  ]);
}

/**
 * 4-bucket binding tier (radar traffic). Radar requests check both the
 * general buckets AND the BL-038 radar-specific buckets. Pure function
 * exposed for unit testing.
 *
 * All-pass tie-break ordering: `minute > radar-minute > day > radar-day`
 * (closest-cliff first; consumers see the most urgent backoff signal).
 */
export function chooseBindingTier4(
  minute: RatelimitResponse,
  day: RatelimitResponse,
  radarMinute: RatelimitResponse,
  radarDay: RatelimitResponse
): CheckResult {
  return pickBindingTier([
    { res: minute, tier: 'minute', allPassPriority: 0, denyClass: 0 },
    { res: radarMinute, tier: 'radar-minute', allPassPriority: 1, denyClass: 0 },
    { res: day, tier: 'day', allPassPriority: 2, denyClass: 1 },
    { res: radarDay, tier: 'radar-day', allPassPriority: 3, denyClass: 1 },
  ]);
}
