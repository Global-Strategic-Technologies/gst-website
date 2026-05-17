/**
 * Unit tests for handleInoreaderFailure (T.Z.2 — BL-032.7).
 *
 * Verifies the centralized failure handler:
 *   - Opens the breaker on inoreader-rate-limit (and only that reason)
 *   - Tags the Sentry event with the parsed X-Reader-* diagnostic fields
 *   - Tags the event with a source label so dashboard filters can
 *     distinguish cron path vs live tool path origin
 *   - Is a no-op for non-429 failures (token-stale, network-timeout, etc.)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockOpenCircuit, mockCaptureMessage } = vi.hoisted(() => ({
  mockOpenCircuit: vi.fn(),
  mockCaptureMessage: vi.fn(),
}));

vi.mock('../../../src/ratelimit/circuit-breaker', () => ({
  openCircuit: mockOpenCircuit,
}));

vi.mock('../../../src/observability/sentry', () => ({
  captureMessage: mockCaptureMessage,
}));

import { handleInoreaderFailure } from '../../../src/lib/inoreader-failure-handler';
import type { InoreaderFailure } from '../../../src/lib/inoreader-client';
import type { Env } from '../../../src/worker';

const env: Env = {
  UPSTASH_MCP_REST_URL: 'https://mcp.upstash.io',
  UPSTASH_MCP_REST_TOKEN: 'token',
};

beforeEach(() => {
  mockOpenCircuit.mockReset();
  mockCaptureMessage.mockReset();
});

describe('handleInoreaderFailure — inoreader-rate-limit', () => {
  it('opens the breaker with a source-scoped reason', async () => {
    const failure: InoreaderFailure = {
      ok: false,
      status: 429,
      reason: 'inoreader-rate-limit',
      message: 'rate limited',
    };

    await handleInoreaderFailure(env, failure, 'cron-wire');

    expect(mockOpenCircuit).toHaveBeenCalledTimes(1);
    expect(mockOpenCircuit).toHaveBeenCalledWith(env, 'inoreader-429-cron-wire');
  });

  it('opens the breaker BEFORE emitting the Sentry capture', async () => {
    // Load-bearing order: the protective side effect must run first so a
    // slow Sentry round-trip can't delay the breaker. The source
    // documents this at inoreader-failure-handler.ts:95-97 — this test
    // pins the invariant so a refactor that reverses the calls (or
    // parallelizes them in a way that loses ordering) fails CI.
    const failure: InoreaderFailure = {
      ok: false,
      status: 429,
      reason: 'inoreader-rate-limit',
      message: 'rate limited',
    };

    await handleInoreaderFailure(env, failure, 'cron-wire');

    const openOrder = mockOpenCircuit.mock.invocationCallOrder[0]!;
    const captureOrder = mockCaptureMessage.mock.invocationCallOrder[0]!;
    expect(openOrder).toBeLessThan(captureOrder);
  });

  it('emits a Sentry capture with the rate-limit info as structured tags', async () => {
    const failure: InoreaderFailure = {
      ok: false,
      status: 429,
      reason: 'inoreader-rate-limit',
      message: 'rate limited',
      rateLimitInfo: {
        zone1Limit: 100,
        zone1Usage: 100,
        zone2Limit: 100,
        zone2Usage: 17,
        resetAfterSeconds: 14823,
      },
    };

    await handleInoreaderFailure(env, failure, 'live-search-radar');

    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'inoreader-rate-limit',
      'error',
      expect.objectContaining({
        status: 429,
        message: 'rate limited',
        source: 'live-search-radar',
        rateLimitInfo: expect.objectContaining({ zone1Usage: 100 }),
      }),
      'inoreader-rate-limit',
      expect.objectContaining({
        'inoreader.source': 'live-search-radar',
        'inoreader.zone1.usage': 100,
        'inoreader.zone1.limit': 100,
        'inoreader.reset_after_seconds': 14823,
      })
    );
  });

  it('still emits a capture (with source-only tag) when rateLimitInfo is absent', async () => {
    // Proxy strips X-Reader-* headers → mapHttpStatus returns the
    // failure WITHOUT rateLimitInfo. Handler must not crash; it should
    // still surface the failure to Sentry with the source label.
    const failure: InoreaderFailure = {
      ok: false,
      status: 429,
      reason: 'inoreader-rate-limit',
      message: 'rate limited',
    };

    await handleInoreaderFailure(env, failure, 'cron-fyi');

    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    const tags = mockCaptureMessage.mock.calls[0]?.[4] as Record<string, unknown>;
    expect(tags).toEqual({ 'inoreader.source': 'cron-fyi' });
  });

  // T.Z.3 (BL-032.7) — body excerpt forwarded into Sentry `extra`. Body
  // text is free-form and would explode tag-value cardinality, so it
  // lives in `extra` rather than as a tag.
  it('forwards bodyExcerpt into the Sentry extra field when present', async () => {
    const failure: InoreaderFailure = {
      ok: false,
      status: 429,
      reason: 'inoreader-rate-limit',
      message: 'rate limited',
      bodyExcerpt: 'App over daily limit. Please retry later.',
    };

    await handleInoreaderFailure(env, failure, 'live-search-radar');

    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    const extra = mockCaptureMessage.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(extra).toMatchObject({
      bodyExcerpt: 'App over daily limit. Please retry later.',
    });
    // Body text is free-form and would explode Sentry tag-value
    // cardinality. Pin the boundary: bodyExcerpt belongs in `extra`,
    // never on `extraTags`. A regression that moves it would silently
    // blow up Sentry tag indexes — this assertion blocks that.
    const tags = mockCaptureMessage.mock.calls[0]?.[4] as Record<string, unknown>;
    expect(tags).not.toHaveProperty('bodyExcerpt');
  });

  it('omits bodyExcerpt from extra when the failure has no body excerpt', async () => {
    const failure: InoreaderFailure = {
      ok: false,
      status: 429,
      reason: 'inoreader-rate-limit',
      message: 'rate limited',
    };

    await handleInoreaderFailure(env, failure, 'cron-wire');

    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    const extra = mockCaptureMessage.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(extra).not.toHaveProperty('bodyExcerpt');
  });
});

describe('handleInoreaderFailure — non-429 failures', () => {
  it.each([
    ['token-stale', 401],
    ['network-timeout', 0],
    ['upstream-error', 503],
    ['config-missing', 500],
    ['token-missing', 500],
  ] as const)('is a no-op for %s', async (reason, status) => {
    const failure: InoreaderFailure = {
      ok: false,
      status,
      reason,
      message: 'some failure',
    };

    await handleInoreaderFailure(env, failure, 'cron-wire');

    expect(mockOpenCircuit).not.toHaveBeenCalled();
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });
});
