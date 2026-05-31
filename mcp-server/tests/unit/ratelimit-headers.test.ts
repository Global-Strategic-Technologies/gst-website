/**
 * Unit tests for the RFC 9331 RateLimit-* header builder + 429 envelope.
 *
 * Pure-function tests — no Worker boot, no Upstash, no env. Covers the
 * shape contract that production code relies on; the actual sliding-
 * window enforcement is tested in Phase 6 against a real Upstash project.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  rateLimitHeaders,
  reasonForTier,
  tooManyRequestsResponse,
  withRateLimitHeaders,
} from '../../src/ratelimit/headers';
import { chooseBindingTier, type CheckResult } from '../../src/ratelimit/limiter';

const FIXED_NOW = 1_715_000_000_000; // arbitrary stable timestamp

describe('rateLimitHeaders', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits the three RFC 9331 fields with integer values', () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);

    const result: CheckResult = {
      allowed: true,
      limit: 60,
      remaining: 42,
      resetAt: FIXED_NOW + 30_000, // 30s from now
      tier: 'minute',
    };

    const headers = rateLimitHeaders(result);
    expect(headers['RateLimit-Limit']).toBe('60');
    expect(headers['RateLimit-Remaining']).toBe('42');
    expect(headers['RateLimit-Reset']).toBe('30');
  });

  it('rounds reset UP to whole seconds (never tells client to retry early)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);

    const result: CheckResult = {
      allowed: true,
      limit: 60,
      remaining: 42,
      resetAt: FIXED_NOW + 100, // 100ms — should round up to 1s, not down to 0
      tier: 'minute',
    };

    expect(rateLimitHeaders(result)['RateLimit-Reset']).toBe('1');
  });

  it('clamps RateLimit-Reset to 0 when the window already expired', () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);

    const result: CheckResult = {
      allowed: true,
      limit: 60,
      remaining: 42,
      resetAt: FIXED_NOW - 5_000, // 5s in the past
      tier: 'minute',
    };

    expect(rateLimitHeaders(result)['RateLimit-Reset']).toBe('0');
  });
});

describe('tooManyRequestsResponse', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds a 429 with RFC 9331 + Retry-After + JSON body', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);

    const result: CheckResult = {
      allowed: false,
      limit: 60,
      remaining: 0,
      resetAt: FIXED_NOW + 45_000,
      tier: 'minute',
    };

    const res = tooManyRequestsResponse(result);
    expect(res.status).toBe(429);
    expect(res.headers.get('ratelimit-limit')).toBe('60');
    expect(res.headers.get('ratelimit-remaining')).toBe('0');
    expect(res.headers.get('ratelimit-reset')).toBe('45');
    expect(res.headers.get('retry-after')).toBe('45');
    expect(res.headers.get('content-type')).toContain('application/json');

    const body = (await res.json()) as {
      error: string;
      message: string;
      tier: string;
      limit: number;
      retryAfterSeconds: number;
    };
    expect(body.error).toBe('rate_limit_exceeded');
    expect(body.tier).toBe('minute');
    expect(body.limit).toBe(60);
    expect(body.retryAfterSeconds).toBe(45);
    expect(body.message).toMatch(/per-minute/i);
    // BL-038: stable `reason` field for agent classification
    expect((body as unknown as { reason: string }).reason).toBe('rate-limit-per-minute');
  });

  it('emits reason=rate-limit-per-day for tier=day', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);

    const result: CheckResult = {
      allowed: false,
      limit: 1000,
      remaining: 0,
      resetAt: FIXED_NOW + 3600_000,
      tier: 'day',
    };

    const res = tooManyRequestsResponse(result);
    const body = (await res.json()) as { tier: string; reason: string };
    expect(body.tier).toBe('day');
    expect(body.reason).toBe('rate-limit-per-day');
  });

  it('emits reason=radar-rate-limit-per-minute for tier=radar-minute (BL-038)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);

    const result: CheckResult = {
      allowed: false,
      limit: 5,
      remaining: 0,
      resetAt: FIXED_NOW + 30_000,
      tier: 'radar-minute',
    };

    const res = tooManyRequestsResponse(result);
    const body = (await res.json()) as { tier: string; reason: string; limit: number };
    expect(body.tier).toBe('radar-minute');
    expect(body.reason).toBe('radar-rate-limit-per-minute');
    expect(body.limit).toBe(5);
  });

  it('emits reason=radar-rate-limit-per-day for tier=radar-day (BL-038)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);

    const result: CheckResult = {
      allowed: false,
      limit: 50,
      remaining: 0,
      resetAt: FIXED_NOW + 3600_000,
      tier: 'radar-day',
    };

    const res = tooManyRequestsResponse(result);
    const body = (await res.json()) as { tier: string; reason: string; limit: number };
    expect(body.tier).toBe('radar-day');
    expect(body.reason).toBe('radar-rate-limit-per-day');
    expect(body.limit).toBe(50);
  });

  it('throws if called with allowed=true (programmer error guard)', () => {
    const result: CheckResult = {
      allowed: true,
      limit: 60,
      remaining: 1,
      resetAt: Date.now() + 1000,
      tier: 'minute',
    };
    expect(() => tooManyRequestsResponse(result)).toThrow(/programmer error/i);
  });
});

describe('withRateLimitHeaders', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds RateLimit-* headers to a passing response without altering body or status', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);

    const upstream = new Response('ok', { status: 200, headers: { 'X-Custom': 'kept' } });
    const result: CheckResult = {
      allowed: true,
      limit: 60,
      remaining: 50,
      resetAt: FIXED_NOW + 30_000,
      tier: 'minute',
    };

    const wrapped = withRateLimitHeaders(upstream, result);
    expect(wrapped.status).toBe(200);
    expect(await wrapped.text()).toBe('ok');
    expect(wrapped.headers.get('ratelimit-limit')).toBe('60');
    expect(wrapped.headers.get('ratelimit-remaining')).toBe('50');
    expect(wrapped.headers.get('ratelimit-reset')).toBe('30');
    expect(wrapped.headers.get('x-custom')).toBe('kept');
  });
});

describe('chooseBindingTier', () => {
  // Helper to build minimal Ratelimit-shape responses.
  const r = (success: boolean, remaining: number, reset: number, limit: number) => ({
    success,
    remaining,
    reset,
    limit,
    pending: Promise.resolve(),
  });

  it('returns per-day tier when both buckets exhausted', () => {
    const minute = r(false, 0, 30_000, 60);
    const day = r(false, 0, 86_400_000, 1000);
    const result = chooseBindingTier(minute, day);
    expect(result.allowed).toBe(false);
    expect(result.tier).toBe('day');
    expect(result.limit).toBe(1000);
  });

  it('returns per-minute tier when only minute bucket exhausted', () => {
    const minute = r(false, 0, 30_000, 60);
    const day = r(true, 700, 86_400_000, 1000);
    const result = chooseBindingTier(minute, day);
    expect(result.allowed).toBe(false);
    expect(result.tier).toBe('minute');
    expect(result.limit).toBe(60);
  });

  it('returns per-day tier when only day bucket exhausted', () => {
    const minute = r(true, 50, 30_000, 60);
    const day = r(false, 0, 86_400_000, 1000);
    const result = chooseBindingTier(minute, day);
    expect(result.allowed).toBe(false);
    expect(result.tier).toBe('day');
    expect(result.limit).toBe(1000);
  });

  it('when both pass, surfaces the bucket with FEWER remaining tokens (worst-case headers)', () => {
    const minute = r(true, 5, 30_000, 60);
    const day = r(true, 700, 86_400_000, 1000);
    const result = chooseBindingTier(minute, day);
    expect(result.allowed).toBe(true);
    // Per-minute has 5 remaining vs per-day's 700; minute is closer to the cliff.
    expect(result.tier).toBe('minute');
    expect(result.remaining).toBe(5);
  });

  it('ties go to the per-minute tier (closer reset window)', () => {
    const minute = r(true, 50, 30_000, 60);
    const day = r(true, 50, 86_400_000, 1000);
    const result = chooseBindingTier(minute, day);
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('minute');
  });
});

describe('reasonForTier (BL-038)', () => {
  it('maps each tier to its stable reason string', () => {
    expect(reasonForTier('minute')).toBe('rate-limit-per-minute');
    expect(reasonForTier('day')).toBe('rate-limit-per-day');
    expect(reasonForTier('radar-minute')).toBe('radar-rate-limit-per-minute');
    expect(reasonForTier('radar-day')).toBe('radar-rate-limit-per-day');
  });
});
