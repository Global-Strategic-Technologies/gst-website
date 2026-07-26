/**
 * BL-038 — `chooseBindingTier4` priority logic.
 *
 * Pure-function tests over synthetic `RatelimitResponse` shapes. No
 * Upstash, no env. The deny-precedence + all-pass tie-break rules are
 * the architectural contract the 429 envelope depends on; pinning them
 * here so future maintenance can't silently regress the binding-tier
 * selection.
 *
 * The 2-bucket `chooseBindingTier` back-compat path is already covered
 * in `ratelimit-headers.test.ts` (5 cases preserved from BL-032 Phase 3
 * shipping). This file covers the 4-bucket radar dispatch.
 */
import { describe, expect, it } from 'vitest';

import {
  chooseBindingTier,
  chooseBindingTier4,
  createLimiter,
} from '../../../src/ratelimit/limiter';
import { TIER_LIMITS } from '../../../src/ratelimit/tiers';
import type { Env } from '../../../src/worker';

// Helper to build minimal Ratelimit-shape responses.
const r = (success: boolean, remaining: number, reset: number, limit: number) => ({
  success,
  remaining,
  reset,
  limit,
  pending: Promise.resolve(),
});

describe('chooseBindingTier4 — all-pass (allowed)', () => {
  it('returns radar-minute when it has fewest remaining tokens', () => {
    const minute = r(true, 50, 30_000, 60);
    const day = r(true, 700, 86_400_000, 1000);
    const radarMin = r(true, 1, 30_000, 5); // closest to cliff
    const radarDay = r(true, 30, 86_400_000, 50);
    const result = chooseBindingTier4(minute, day, radarMin, radarDay);
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('radar-minute');
    expect(result.remaining).toBe(1);
  });

  it('returns day when day has fewest remaining tokens', () => {
    const minute = r(true, 50, 30_000, 60);
    const day = r(true, 2, 86_400_000, 1000); // closest to cliff
    const radarMin = r(true, 4, 30_000, 5);
    const radarDay = r(true, 40, 86_400_000, 50);
    const result = chooseBindingTier4(minute, day, radarMin, radarDay);
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('day');
    expect(result.remaining).toBe(2);
  });

  it('ties on remaining → tie-break order minute > radar-minute > day > radar-day', () => {
    // All four pass with EXACTLY 10 remaining. Expect 'minute' (priority 0).
    const minute = r(true, 10, 30_000, 60);
    const day = r(true, 10, 86_400_000, 1000);
    const radarMin = r(true, 10, 30_000, 5);
    const radarDay = r(true, 10, 86_400_000, 50);
    expect(chooseBindingTier4(minute, day, radarMin, radarDay).tier).toBe('minute');

    // Remove minute by giving it more; expect radar-minute (priority 1) next.
    const minuteHigh = r(true, 50, 30_000, 60);
    expect(chooseBindingTier4(minuteHigh, day, radarMin, radarDay).tier).toBe('radar-minute');

    // Bump radar-minute too; expect day (priority 2).
    const radarMinHigh = r(true, 50, 30_000, 5);
    expect(chooseBindingTier4(minuteHigh, day, radarMinHigh, radarDay).tier).toBe('day');
  });
});

describe('chooseBindingTier4 — denied', () => {
  it('returns radar-minute when only the radar-minute bucket denied', () => {
    const minute = r(true, 50, 30_000, 60);
    const day = r(true, 700, 86_400_000, 1000);
    const radarMin = r(false, 0, 30_000, 5);
    const radarDay = r(true, 40, 86_400_000, 50);
    const result = chooseBindingTier4(minute, day, radarMin, radarDay);
    expect(result.allowed).toBe(false);
    expect(result.tier).toBe('radar-minute');
    expect(result.limit).toBe(5);
  });

  it('returns radar-day when only the radar-day bucket denied', () => {
    const minute = r(true, 50, 30_000, 60);
    const day = r(true, 700, 86_400_000, 1000);
    const radarMin = r(true, 4, 30_000, 5);
    const radarDay = r(false, 0, 86_400_000, 50);
    const result = chooseBindingTier4(minute, day, radarMin, radarDay);
    expect(result.allowed).toBe(false);
    expect(result.tier).toBe('radar-day');
    expect(result.limit).toBe(50);
  });

  it('multiple denied → returns the latest-reset bucket', () => {
    // Both minute AND radar-day denied. radar-day has LATER reset → wins.
    const minute = r(false, 0, 30_000, 60);
    const day = r(true, 700, 86_400_000, 1000);
    const radarMin = r(true, 4, 30_000, 5);
    const radarDay = r(false, 0, 86_400_000, 50);
    const result = chooseBindingTier4(minute, day, radarMin, radarDay);
    expect(result.allowed).toBe(false);
    expect(result.tier).toBe('radar-day');
  });

  it('all 4 denied → day-class preferred when day + radar-day tied on latest reset', () => {
    // minute + radar-min denied at reset=30_000; day + radar-day denied at reset=86_400_000.
    // Latest reset tie between day-class buckets. Day-class denyClass=1 wins tie-break;
    // among day and radar-day (both denyClass=1), stable sort keeps the FIRST entry from
    // the input array, which is `day`.
    const minute = r(false, 0, 30_000, 60);
    const day = r(false, 0, 86_400_000, 1000);
    const radarMin = r(false, 0, 30_000, 5);
    const radarDay = r(false, 0, 86_400_000, 50);
    const result = chooseBindingTier4(minute, day, radarMin, radarDay);
    expect(result.allowed).toBe(false);
    expect(result.tier).toBe('day');
    expect(result.limit).toBe(1000);
  });

  it('minute-class buckets denied → returns the later-reset of the two', () => {
    // Only minute + radar-min denied. Both have reset=30_000 (tied). denyClass=0 for both;
    // stable sort keeps `minute` (input order).
    const minute = r(false, 0, 30_000, 60);
    const day = r(true, 500, 86_400_000, 1000);
    const radarMin = r(false, 0, 30_000, 5);
    const radarDay = r(true, 30, 86_400_000, 50);
    const result = chooseBindingTier4(minute, day, radarMin, radarDay);
    expect(result.allowed).toBe(false);
    expect(result.tier).toBe('minute');
  });
});

describe('createLimiter tier param (BL-033 Slice 5)', () => {
  // Full enforcement of the tier ceilings requires a live Upstash project
  // and is verified against staging Upstash (the same Phase-6 deferral the
  // integration suite documents). What we CAN pin without a network hop is
  // that the new `limits` param never disturbs the graceful-skip contract:
  // no Upstash creds → null, regardless of tier.
  it('returns null (graceful skip) when Upstash is unbound, with an explicit tier', () => {
    expect(createLimiter({} as Env, TIER_LIMITS['free-pilot'])).toBeNull();
  });

  it('returns null (graceful skip) when Upstash is unbound, with the default (internal) tier', () => {
    expect(createLimiter({} as Env)).toBeNull();
  });
});

describe('minRemainingRatio (BL-033 Slice 5 — soft-limit signal)', () => {
  it('is the SMALLEST remaining/limit ratio across all checked buckets, not the binding one', () => {
    // Binding tier (fewest ABSOLUTE remaining) is radar-minute (1 token), but the
    // smallest PROPORTIONAL headroom is the day bucket: 100/1000 = 0.10 vs 1/5 = 0.20.
    const minute = r(true, 50, 30_000, 60);
    const day = r(true, 100, 86_400_000, 1000);
    const radarMin = r(true, 1, 30_000, 5);
    const radarDay = r(true, 40, 86_400_000, 50);
    const result = chooseBindingTier4(minute, day, radarMin, radarDay);
    expect(result.tier).toBe('radar-minute'); // binding = absolute-fewest
    expect(result.minRemainingRatio).toBeCloseTo(0.1); // soft-limit = proportional-fewest
  });

  it('crosses the 0.20 soft-limit threshold when any bucket is ≥80% consumed', () => {
    // radar-minute at 1/5 = 0.20 (exactly the threshold); everything else has headroom.
    const minute = r(true, 60, 30_000, 60);
    const day = r(true, 1000, 86_400_000, 1000);
    const radarMin = r(true, 1, 30_000, 5);
    const radarDay = r(true, 50, 86_400_000, 50);
    const result = chooseBindingTier4(minute, day, radarMin, radarDay);
    expect(result.minRemainingRatio).toBeCloseTo(0.2);
    expect(result.minRemainingRatio! <= 0.2).toBe(true);
  });

  it('is populated on the 2-bucket general path too', () => {
    const minute = r(true, 6, 30_000, 60); // 0.10
    const day = r(true, 900, 86_400_000, 1000); // 0.90
    const result = chooseBindingTier(minute, day);
    expect(result.minRemainingRatio).toBeCloseTo(0.1);
  });

  it('is populated on a denied result', () => {
    const minute = r(false, 0, 30_000, 60); // 0.0
    const day = r(true, 700, 86_400_000, 1000);
    const result = chooseBindingTier(minute, day);
    expect(result.allowed).toBe(false);
    expect(result.minRemainingRatio).toBe(0);
  });
});
