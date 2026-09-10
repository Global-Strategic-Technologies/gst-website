/**
 * Unit tests for the per-client rate-limit tier config (BL-033 Slice 5).
 *
 * The load-bearing assertion is the **no-regression pin**: `INTERNAL_TIER`
 * (the tier resolved for static `MCP_KEY_*` keys and the OAuth human-consent
 * path, both of which carry no `tier`) must exactly equal the pre-Slice-5
 * hardcoded limiter constants (60/1000/5/50). Any drift there silently
 * changes the budgets internal team keys have run on since BL-032/BL-038.
 */
import { describe, it, expect } from 'vitest';
import {
  INTERNAL_TIER,
  TIER_LIMITS,
  DEFAULT_TIER,
  resolveTierLimits,
} from '../../../src/ratelimit/tiers';

describe('INTERNAL_TIER (no-regression anchor)', () => {
  it('equals the pre-Slice-5 hardcoded limiter constants exactly', () => {
    expect(INTERNAL_TIER).toEqual({
      perMinute: 60,
      perDay: 1000,
      radarPerMinute: 5,
      radarPerDay: 50,
    });
  });

  it('is the value keyed under the "internal" tier', () => {
    expect(TIER_LIMITS.internal).toBe(INTERNAL_TIER);
    expect(DEFAULT_TIER).toBe('internal');
  });
});

describe('resolveTierLimits', () => {
  it('resolves each known tier to its own ceilings', () => {
    expect(resolveTierLimits('trial')).toEqual({
      perMinute: 15,
      perDay: 100,
      radarPerMinute: 1,
      radarPerDay: 1,
    });
    expect(resolveTierLimits('free-pilot')).toEqual({
      perMinute: 30,
      perDay: 300,
      radarPerMinute: 3,
      radarPerDay: 20,
    });
    expect(resolveTierLimits('paid')).toEqual({
      perMinute: 60,
      perDay: 2000,
      radarPerMinute: 5,
      radarPerDay: 50,
    });
    expect(resolveTierLimits('enterprise')).toEqual({
      perMinute: 120,
      perDay: 10000,
      radarPerMinute: 10,
      radarPerDay: 150,
    });
    expect(resolveTierLimits('internal')).toBe(INTERNAL_TIER);
  });

  it('falls back to INTERNAL_TIER for undefined tier (static / OAuth-human / legacy token)', () => {
    expect(resolveTierLimits(undefined)).toBe(INTERNAL_TIER);
  });

  it('falls back to INTERNAL_TIER for an unrecognized tier string (misconfig fails generous)', () => {
    expect(resolveTierLimits('platinum')).toBe(INTERNAL_TIER);
    expect(resolveTierLimits('')).toBe(INTERNAL_TIER);
  });

  it('free-pilot is strictly tighter than internal (abuse containment default)', () => {
    const fp = resolveTierLimits('free-pilot');
    expect(fp.perMinute).toBeLessThan(INTERNAL_TIER.perMinute);
    expect(fp.perDay).toBeLessThan(INTERNAL_TIER.perDay);
  });

  // BL-155: `trial` is minted for a stranger with no operator and no payment in
  // the loop, so it must never be loosened past the tier for a vetted pilot.
  // This is the invariant, not the specific numbers — it holds if either is
  // retuned, and fails the moment someone raises trial above free-pilot.
  it('trial is no looser than free-pilot on every ceiling (stranger-minted containment)', () => {
    const trial = resolveTierLimits('trial');
    const fp = resolveTierLimits('free-pilot');
    expect(trial.perMinute).toBeLessThanOrEqual(fp.perMinute);
    expect(trial.perDay).toBeLessThanOrEqual(fp.perDay);
    expect(trial.radarPerMinute).toBeLessThanOrEqual(fp.radarPerMinute);
    expect(trial.radarPerDay).toBeLessThanOrEqual(fp.radarPerDay);
  });

  // The radar ceilings above are defense-in-depth only — radar is denied to
  // this tier at the pipeline seam. Nonzero because a zero sliding window is
  // not verified to be representable in `@upstash/ratelimit`; pinning that
  // here stops someone "simplifying" them to 0 on the assumption it works.
  it('trial radar ceilings are minimal but nonzero', () => {
    const trial = resolveTierLimits('trial');
    expect(trial.radarPerMinute).toBeGreaterThan(0);
    expect(trial.radarPerDay).toBeGreaterThan(0);
  });
});
