/**
 * Per-client rate-limit tiers (BL-033 Slice 5).
 *
 * Maps a client's `tier` (stored on the M2M client record, carried in the
 * self-contained M2M token claim — see ADR-0008/ADR-0010) to the four
 * sliding-window ceilings the limiter enforces. Making the ceilings
 * tier-aware is the whole point of this slice: before it, `limiter.ts`
 * used flat hardcoded constants and the stored `tier` field was inert.
 *
 * **These numbers are tunable, non-contractual capability config — NOT
 * ratified SLA quotas.** They are abuse/capacity ceilings (Directive: build
 * capability, don't ratify SLA numbers). `free-pilot` is deliberately
 * tighter than `internal` — abuse containment for an unvetted external
 * pilot, not a promised allowance.
 *
 * **Radar caps** (`radarPerMinute`/`radarPerDay`) are per-client FAIRNESS +
 * thin cache-cold defense-in-depth, NOT the Inoreader-budget control. Radar
 * tool calls are ~99% Upstash cache hits (zero Inoreader spend); only a
 * cold/expired-cache miss falls through to a live fetch, and the global
 * circuit breaker (`circuit-breaker.ts`) is the real upstream-budget guard.
 * See `RATE_LIMITS.md` § Per-client tiers + ADR-0006.
 */

import { safeLog } from '../auth/safe-logger';

/** The four sliding-window ceilings a tier grants. All per-`keyOwner`. */
export interface TierLimits {
  readonly perMinute: number;
  readonly perDay: number;
  readonly radarPerMinute: number;
  readonly radarPerDay: number;
}

/**
 * The pre-Slice-5 hardcoded limits, verbatim. This is the **no-regression
 * anchor**: static `MCP_KEY_*` keys and the OAuth human-consent path carry
 * no tier (`AuthSuccess.tier === undefined`) and resolve here, so they keep
 * the exact 60/1000/5/50 budgets they had before this slice.
 */
export const INTERNAL_TIER: TierLimits = {
  perMinute: 60,
  perDay: 1000,
  radarPerMinute: 5,
  radarPerDay: 50,
};

/** Known tier → ceilings. Keys match the M2M record's `tier` taxonomy. */
export const TIER_LIMITS: Record<string, TierLimits> = {
  // BL-155 self-serve trial: minted for a STRANGER with no operator and no
  // payment in the loop, and alive for only 72h. Deliberately the tightest
  // tier — every ceiling at or below `free-pilot`, which is itself framed as
  // abuse containment for an unvetted external pilot.
  //
  // The radar ceilings are defense-in-depth, NOT the control. Radar is denied
  // to this tier at the pipeline seam (BL-155 Slice 2) before the limiter is
  // consulted, because radar is the Inoreader-funded product a self-serve path
  // must not become a bypass for. These numbers exist only so that accidentally
  // removing that deny does not silently hand a stranger free-pilot-level radar
  // access. They are 1/1 rather than 0/0 because a zero sliding window is not
  // verified to be representable in `@upstash/ratelimit`.
  trial: { perMinute: 15, perDay: 100, radarPerMinute: 1, radarPerDay: 1 },
  'free-pilot': { perMinute: 30, perDay: 300, radarPerMinute: 3, radarPerDay: 20 },
  paid: { perMinute: 60, perDay: 2000, radarPerMinute: 5, radarPerDay: 50 },
  enterprise: { perMinute: 120, perDay: 10000, radarPerMinute: 10, radarPerDay: 150 },
  internal: INTERNAL_TIER,
};

/** The tier applied when a request carries no (or an unrecognized) tier. */
export const DEFAULT_TIER = 'internal';

/**
 * The tiers an operator may assign at provisioning. Excludes `internal` —
 * that is the implicit default for callers WITHOUT a tier (static keys,
 * OAuth human-consent), not something you hand to an external pilot. Used by
 * the admin endpoint to reject a mistyped `tier` up front rather than let it
 * fail generous to `internal` (60/1000, looser than `free-pilot`).
 */
export const ASSIGNABLE_TIERS = ['trial', 'free-pilot', 'paid', 'enterprise'] as const;

/** Whether `tier` is an operator-assignable tier (see `ASSIGNABLE_TIERS`). */
export function isAssignableTier(tier: string): boolean {
  return (ASSIGNABLE_TIERS as readonly string[]).includes(tier);
}

// Log an unknown non-empty tier at most once per distinct value, so a
// misconfigured client record surfaces in `wrangler tail` without spamming
// the log on every request.
const warnedTiers = new Set<string>();

/**
 * Resolve a client's tier string to its ceilings. `undefined` (static /
 * OAuth-human / legacy pre-Slice-5 M2M token) and any unrecognized string
 * both fall back to `INTERNAL_TIER` — fail-generous, since an unknown tier
 * is an operator misconfiguration, not a hostile signal, and the flat
 * internal ceilings are already the safe default the server ran on before.
 */
export function resolveTierLimits(tier: string | undefined): TierLimits {
  if (tier && tier in TIER_LIMITS) return TIER_LIMITS[tier]!;
  if (tier && !warnedTiers.has(tier)) {
    warnedTiers.add(tier);
    safeLog({
      event: 'ratelimit.tier-unknown',
      reason: `unknown-tier=${tier}; falling back to ${DEFAULT_TIER}`,
    });
  }
  return INTERNAL_TIER;
}
