/**
 * BL-047 T3 + T4 — Inoreader refresh-health module unit tests.
 *
 * Verifies the recorder + reader contract:
 *
 *   - `recordRefreshSuccess` increments the success day-counter + sets
 *     the last-success pointer
 *   - `recordRefreshFailure` increments the per-reason day-counter
 *   - `recordRotation` increments the rotations day-counter, sets the
 *     last-rotation pointer, fires safeLog + a `captureMessageEnvelope`
 *     with the rotation tag
 *   - All three recorders are FAIL-OPEN — a thrown Upstash error from
 *     `incr`/`set` MUST NOT propagate (the OAuth refresh path must not
 *     be blocked by observability failures)
 *   - `readRefreshHealth` single-trip MGETs the right keys, computes
 *     `ageSinceLastSuccessfulRefreshSeconds` from the pointer, parses
 *     string and numeric counter values from Upstash, and returns
 *     ZERO_HEALTH on Upstash failure
 *   - `recordRotation` ALWAYS fires the Sentry envelope event even when
 *     Upstash is unreachable (regime telemetry must survive Upstash
 *     outages — the Sentry timeline is the secondary source of truth)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const {
  MockRedis,
  mockIncr,
  mockExpire,
  mockSet,
  mockMget,
  mockCaptureMessageEnvelope,
  mockSafeLog,
} = vi.hoisted(() => {
  const mockIncr = vi.fn();
  const mockExpire = vi.fn();
  const mockSet = vi.fn();
  const mockMget = vi.fn();
  const mockCaptureMessageEnvelope = vi.fn();
  const mockSafeLog = vi.fn();
  class MockRedis {
    incr = mockIncr;
    expire = mockExpire;
    set = mockSet;
    mget = mockMget;
  }
  return {
    MockRedis,
    mockIncr,
    mockExpire,
    mockSet,
    mockMget,
    mockCaptureMessageEnvelope,
    mockSafeLog,
  };
});

vi.mock('@upstash/redis', () => ({ Redis: MockRedis }));
vi.mock('../../../src/observability/sentry-envelope', () => ({
  captureMessageEnvelope: mockCaptureMessageEnvelope,
}));
vi.mock('../../../src/auth/safe-logger', () => ({ safeLog: mockSafeLog }));

import {
  recordRefreshSuccess,
  recordRefreshFailure,
  recordRotation,
  readRefreshHealth,
} from '../../../src/lib/inoreader-refresh-health';
import type { Env } from '../../../src/worker';

const env: Env = {
  UPSTASH_MCP_REST_URL: 'https://x.upstash.io',
  UPSTASH_MCP_REST_TOKEN: 'rw',
};

beforeEach(() => {
  mockIncr.mockReset().mockResolvedValue(1);
  mockExpire.mockReset().mockResolvedValue(1);
  mockSet.mockReset().mockResolvedValue('OK');
  mockMget.mockReset();
  mockCaptureMessageEnvelope.mockReset().mockResolvedValue(undefined);
  mockSafeLog.mockReset();
});

describe('recordRefreshSuccess', () => {
  it('INCRs the success day counter + sets the last-success pointer', async () => {
    await recordRefreshSuccess(env);
    expect(mockIncr).toHaveBeenCalledTimes(1);
    expect(mockIncr.mock.calls[0]![0]).toMatch(/^mcp:inoreader:refresh-success:\d{4}-\d{2}-\d{2}$/);
    expect(mockExpire).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet.mock.calls[0]![0]).toBe('mcp:inoreader:last-refresh-success-at');
    expect(mockSet.mock.calls[0]![1]).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO
  });

  it('fail-open: Upstash incr rejection does not throw', async () => {
    mockIncr.mockRejectedValueOnce(new Error('network'));
    await expect(recordRefreshSuccess(env)).resolves.toBeUndefined();
  });

  it('no-op when Upstash bindings are missing', async () => {
    const unbound: Env = {};
    await recordRefreshSuccess(unbound);
    expect(mockIncr).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
  });
});

describe('recordRefreshFailure', () => {
  it.each([
    'invalid-refresh-token',
    'token-missing',
    'upstash-write-failed',
    'inoreader-error',
  ] as const)('INCRs the per-reason day counter for %s', async (reason) => {
    await recordRefreshFailure(env, reason);
    expect(mockIncr).toHaveBeenCalledTimes(1);
    expect(mockIncr.mock.calls[0]![0]).toMatch(
      new RegExp(`^mcp:inoreader:refresh-failure:${reason}:\\d{4}-\\d{2}-\\d{2}$`)
    );
  });

  it('fail-open: Upstash rejection does not throw', async () => {
    mockIncr.mockRejectedValueOnce(new Error('network'));
    await expect(recordRefreshFailure(env, 'inoreader-error')).resolves.toBeUndefined();
  });
});

describe('recordRotation', () => {
  it('fires safeLog + Sentry envelope BEFORE the Upstash counter — telemetry survives Upstash outage', async () => {
    mockIncr.mockRejectedValueOnce(new Error('upstash down'));

    await recordRotation(env);

    // Both observability paths fired even though Upstash threw.
    expect(mockSafeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'inoreader.oauth.rotation',
        success: true,
      })
    );
    expect(mockCaptureMessageEnvelope).toHaveBeenCalledWith(
      env,
      'Inoreader refresh-token rotated',
      'info',
      expect.objectContaining({ occurredAt: expect.any(String) }),
      'inoreader.oauth.refresh-token.rotated'
    );
  });

  it('happy path: increments rotations counter + sets last-rotation pointer', async () => {
    await recordRotation(env);
    expect(mockIncr).toHaveBeenCalledTimes(1);
    expect(mockIncr.mock.calls[0]![0]).toMatch(/^mcp:inoreader:rotations:\d{4}-\d{2}-\d{2}$/);
    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet.mock.calls[0]![0]).toBe('mcp:inoreader:last-rotation-at');
  });

  it('still fires Sentry event when Upstash bindings missing', async () => {
    const unbound: Env = {};
    await recordRotation(unbound);
    expect(mockCaptureMessageEnvelope).toHaveBeenCalledTimes(1);
    expect(mockIncr).not.toHaveBeenCalled();
  });
});

describe('readRefreshHealth', () => {
  it('returns ZERO_HEALTH when Upstash bindings are missing', async () => {
    const unbound: Env = {};
    const result = await readRefreshHealth(unbound);
    expect(result.lastSuccessfulRefreshAt).toBeNull();
    expect(result.ageSinceLastSuccessfulRefreshSeconds).toBeNull();
    expect(result.refreshSuccessLast24h).toBe(0);
    expect(result.rotationsLast24h).toBe(0);
    expect(result.recentRefreshFailureCounts).toEqual({
      'invalid-refresh-token': 0,
      'token-missing': 0,
      'upstash-write-failed': 0,
      'inoreader-error': 0,
    });
  });

  it('returns ZERO_HEALTH when mget throws', async () => {
    mockMget.mockRejectedValueOnce(new Error('network'));
    const result = await readRefreshHealth(env);
    expect(result.lastSuccessfulRefreshAt).toBeNull();
    expect(result.rotationsLast24h).toBe(0);
  });

  it('parses pointer + counter values and computes age', async () => {
    const recent = new Date(Date.now() - 60_000).toISOString(); // 60s ago
    mockMget.mockResolvedValueOnce([
      recent, // last-success
      '2026-05-15T10:00:00Z', // last-rotation
      5, // success counter
      2, // rotations counter
      0, // invalid-refresh-token failures
      1, // token-missing failures
      0, // upstash-write-failed failures
      3, // inoreader-error failures
    ]);
    const result = await readRefreshHealth(env);
    expect(result.lastSuccessfulRefreshAt).toBe(recent);
    expect(result.ageSinceLastSuccessfulRefreshSeconds).toBeGreaterThanOrEqual(60);
    expect(result.ageSinceLastSuccessfulRefreshSeconds).toBeLessThan(120);
    expect(result.lastRotationAt).toBe('2026-05-15T10:00:00Z');
    expect(result.refreshSuccessLast24h).toBe(5);
    expect(result.rotationsLast24h).toBe(2);
    expect(result.recentRefreshFailureCounts).toEqual({
      'invalid-refresh-token': 0,
      'token-missing': 1,
      'upstash-write-failed': 0,
      'inoreader-error': 3,
    });
  });

  it('parses string counter values (Upstash REST sometimes stringifies INCR results)', async () => {
    mockMget.mockResolvedValueOnce([null, null, '7', '0', '2', '0', '0', '0']);
    const result = await readRefreshHealth(env);
    expect(result.refreshSuccessLast24h).toBe(7);
    expect(result.recentRefreshFailureCounts['invalid-refresh-token']).toBe(2);
  });

  it('null pointer → null age (cold-start; never refreshed)', async () => {
    mockMget.mockResolvedValueOnce([null, null, 0, 0, 0, 0, 0, 0]);
    const result = await readRefreshHealth(env);
    expect(result.lastSuccessfulRefreshAt).toBeNull();
    expect(result.ageSinceLastSuccessfulRefreshSeconds).toBeNull();
  });

  it('MGETs all keys in a single round-trip (one Upstash call)', async () => {
    mockMget.mockResolvedValueOnce([null, null, 0, 0, 0, 0, 0, 0]);
    await readRefreshHealth(env);
    expect(mockMget).toHaveBeenCalledTimes(1);
    // Pointer keys first, then per-day counters in the documented order.
    const args = mockMget.mock.calls[0]!;
    expect(args[0]).toBe('mcp:inoreader:last-refresh-success-at');
    expect(args[1]).toBe('mcp:inoreader:last-rotation-at');
    expect(args[2]).toMatch(/^mcp:inoreader:refresh-success:/);
    expect(args[3]).toMatch(/^mcp:inoreader:rotations:/);
    expect(args.slice(4)).toEqual([
      expect.stringMatching(/^mcp:inoreader:refresh-failure:invalid-refresh-token:/),
      expect.stringMatching(/^mcp:inoreader:refresh-failure:token-missing:/),
      expect.stringMatching(/^mcp:inoreader:refresh-failure:upstash-write-failed:/),
      expect.stringMatching(/^mcp:inoreader:refresh-failure:inoreader-error:/),
    ]);
  });
});
