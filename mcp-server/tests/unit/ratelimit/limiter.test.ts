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

import { chooseBindingTier4 } from '../../../src/ratelimit/limiter';

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
