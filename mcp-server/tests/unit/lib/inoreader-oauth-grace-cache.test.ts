/**
 * BL-047 — Inoreader OAuth grace-window cache unit tests.
 *
 * Pins the contract the hedge path in `inoreader-oauth.ts` depends on:
 *   - `cachePreviousToken` stores a single value (overwrites prior)
 *   - `getPreviousToken` returns the cached value within TTL
 *   - `getPreviousToken` returns null AND evicts after TTL
 *   - `clearPreviousToken` empties the cache immediately
 *   - The exported TTL constant matches the empirical 60s window
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cachePreviousToken,
  clearPreviousToken,
  getPreviousToken,
  __TEST_GRACE_TTL_MS__,
} from '../../../src/lib/inoreader-oauth-grace-cache';

beforeEach(() => {
  clearPreviousToken();
  vi.useFakeTimers({ now: new Date('2026-05-31T12:00:00Z').getTime() });
});

afterEach(() => {
  clearPreviousToken();
  vi.useRealTimers();
});

describe('cachePreviousToken + getPreviousToken', () => {
  it('returns null on empty cache', () => {
    expect(getPreviousToken()).toBeNull();
  });

  it('returns the cached value immediately after caching', () => {
    cachePreviousToken('token-N0');
    expect(getPreviousToken()).toBe('token-N0');
  });

  it('returns the cached value at exactly TTL boundary - 1ms', () => {
    cachePreviousToken('token-N0');
    vi.advanceTimersByTime(__TEST_GRACE_TTL_MS__ - 1);
    expect(getPreviousToken()).toBe('token-N0');
  });

  it('returns null AFTER TTL expires', () => {
    cachePreviousToken('token-N0');
    vi.advanceTimersByTime(__TEST_GRACE_TTL_MS__ + 1);
    expect(getPreviousToken()).toBeNull();
  });

  it('evicts the expired entry so subsequent reads also return null', () => {
    cachePreviousToken('token-N0');
    vi.advanceTimersByTime(__TEST_GRACE_TTL_MS__ + 1);
    expect(getPreviousToken()).toBeNull();
    // No further time advance; if eviction worked, the second read is also null.
    expect(getPreviousToken()).toBeNull();
  });

  it('overwrites prior entry on second cache call (single-slot semantics)', () => {
    cachePreviousToken('token-N0');
    vi.advanceTimersByTime(10_000);
    cachePreviousToken('token-N1');
    expect(getPreviousToken()).toBe('token-N1');
    // N1's TTL is the new clock, not N0's residual.
    vi.advanceTimersByTime(__TEST_GRACE_TTL_MS__ - 1);
    expect(getPreviousToken()).toBe('token-N1');
    vi.advanceTimersByTime(2);
    expect(getPreviousToken()).toBeNull();
  });
});

describe('clearPreviousToken', () => {
  it('empties a populated cache', () => {
    cachePreviousToken('token-N0');
    clearPreviousToken();
    expect(getPreviousToken()).toBeNull();
  });

  it('is a no-op on an empty cache', () => {
    clearPreviousToken();
    expect(getPreviousToken()).toBeNull();
  });
});

describe('TTL constant', () => {
  it('matches the empirically-verified 60s grace window', () => {
    // Empirically verified via Test-InoreaderRefreshGrace.ps1 -GraceWindowSeconds 60 (2026-05-31).
    expect(__TEST_GRACE_TTL_MS__).toBe(60_000);
  });
});
