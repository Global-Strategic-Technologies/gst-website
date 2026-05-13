/**
 * Unit tests for the BL-032.5 Phase 4 hourly radar Cron handler.
 * Mocks `radar-live-store` (force-refresh callers), `circuit-breaker`
 * (skip-gate trigger), and `lib/upstash-clients` (day-counter read/
 * write). The aim is to exercise every branch of the budget guards
 * and the four observable outcomes (success / partial / skipped /
 * error).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockReadWireLive, mockReadFyiLive } = vi.hoisted(() => ({
  mockReadWireLive: vi.fn(),
  mockReadFyiLive: vi.fn(),
}));

vi.mock('../../../src/content/radar-live-store', () => ({
  readWireLive: mockReadWireLive,
  readFyiLive: mockReadFyiLive,
}));

const { mockIsCircuitOpen } = vi.hoisted(() => ({ mockIsCircuitOpen: vi.fn() }));
vi.mock('../../../src/ratelimit/circuit-breaker', () => ({
  isCircuitOpen: mockIsCircuitOpen,
}));

const { mockCounterGet, mockCounterIncrby, mockCounterExpire, mockCreateMcpClient } = vi.hoisted(
  () => ({
    mockCounterGet: vi.fn(),
    mockCounterIncrby: vi.fn(),
    mockCounterExpire: vi.fn(),
    mockCreateMcpClient: vi.fn(),
  })
);
vi.mock('../../../src/lib/upstash-clients', () => ({
  createMcpClient: mockCreateMcpClient,
  createInoreaderClient: vi.fn(),
}));

const { mockCaptureMessage } = vi.hoisted(() => ({ mockCaptureMessage: vi.fn() }));
vi.mock('../../../src/observability/sentry', () => ({
  captureMessage: mockCaptureMessage,
}));

const { mockSafeLog } = vi.hoisted(() => ({ mockSafeLog: vi.fn() }));
vi.mock('../../../src/auth/safe-logger', () => ({ safeLog: mockSafeLog }));

import { refreshRadarSnapshot } from '../../../src/cron/radar-refresh';
import type { Env } from '../../../src/worker';

const env: Env = {
  UPSTASH_MCP_REST_URL: 'https://mcp.upstash.io',
  UPSTASH_MCP_REST_TOKEN: 'token',
};

function bindMcpClient(): void {
  mockCreateMcpClient.mockReturnValue({
    get: mockCounterGet,
    incrby: mockCounterIncrby,
    expire: mockCounterExpire,
  });
}

beforeEach(() => {
  mockReadWireLive.mockReset();
  mockReadFyiLive.mockReset();
  mockIsCircuitOpen.mockReset();
  mockCounterGet.mockReset();
  mockCounterIncrby.mockReset();
  mockCounterExpire.mockReset();
  mockCreateMcpClient.mockReset();
  mockCaptureMessage.mockReset();
  mockSafeLog.mockReset();
});

describe('refreshRadarSnapshot — circuit breaker guard', () => {
  it('skips when the circuit is open', async () => {
    mockIsCircuitOpen.mockResolvedValueOnce({ open: true, retryAfterSeconds: 3600 });

    const outcome = await refreshRadarSnapshot(env);

    expect(outcome).toEqual({ kind: 'skipped', reason: 'circuit-open' });
    expect(mockReadWireLive).not.toHaveBeenCalled();
    expect(mockReadFyiLive).not.toHaveBeenCalled();
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'cron.radar-refresh.skipped',
      'info',
      expect.objectContaining({ reason: 'circuit-open', retryAfterSeconds: 3600 }),
      'cron.radar-refresh'
    );
  });

  it('proceeds when isCircuitOpen returns null (Upstash unreachable — fail open)', async () => {
    mockIsCircuitOpen.mockResolvedValueOnce(null);
    bindMcpClient();
    mockCounterGet.mockResolvedValueOnce(0);
    mockCounterIncrby.mockResolvedValueOnce(6);
    mockCounterExpire.mockResolvedValueOnce(1);
    mockReadWireLive.mockResolvedValueOnce({
      ok: true,
      tier: 'wire',
      items: [],
      fetchedAt: 't',
      cacheHit: false,
    });
    mockReadFyiLive.mockResolvedValueOnce({
      ok: true,
      tier: 'fyi',
      items: [],
      fetchedAt: 't',
      cacheHit: false,
    });

    const outcome = await refreshRadarSnapshot(env);

    expect(outcome.kind).toBe('success');
    expect(mockReadWireLive).toHaveBeenCalledTimes(1);
    expect(mockReadFyiLive).toHaveBeenCalledTimes(1);
  });
});

describe('refreshRadarSnapshot — daily soft cap guard', () => {
  it('skips when the counter + CALLS_PER_REFRESH would exceed 180', async () => {
    mockIsCircuitOpen.mockResolvedValueOnce({ open: false });
    bindMcpClient();
    mockCounterGet.mockResolvedValueOnce(175); // 175 + 6 = 181 > 180

    const outcome = await refreshRadarSnapshot(env);

    expect(outcome).toEqual({ kind: 'skipped', reason: 'day-cap-reached', counter: 175 });
    expect(mockReadWireLive).not.toHaveBeenCalled();
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'cron.radar-refresh.skipped',
      'info',
      expect.objectContaining({ reason: 'day-cap-reached', counter: 175, cap: 180 }),
      'cron.radar-refresh'
    );
  });

  it('proceeds when counter + CALLS_PER_REFRESH equals 180 exactly', async () => {
    mockIsCircuitOpen.mockResolvedValueOnce({ open: false });
    bindMcpClient();
    mockCounterGet.mockResolvedValueOnce(174); // 174 + 6 = 180; not > 180
    mockCounterIncrby.mockResolvedValueOnce(180);
    mockCounterExpire.mockResolvedValueOnce(1);
    mockReadWireLive.mockResolvedValueOnce({
      ok: true,
      tier: 'wire',
      items: [],
      fetchedAt: 't',
      cacheHit: false,
    });
    mockReadFyiLive.mockResolvedValueOnce({
      ok: true,
      tier: 'fyi',
      items: [],
      fetchedAt: 't',
      cacheHit: false,
    });

    const outcome = await refreshRadarSnapshot(env);
    expect(outcome.kind).toBe('success');
  });

  it('proceeds when counter is fresh (0) — typical case', async () => {
    mockIsCircuitOpen.mockResolvedValueOnce({ open: false });
    bindMcpClient();
    mockCounterGet.mockResolvedValueOnce(0);
    mockCounterIncrby.mockResolvedValueOnce(6);
    mockCounterExpire.mockResolvedValueOnce(1);
    mockReadWireLive.mockResolvedValueOnce({
      ok: true,
      tier: 'wire',
      items: [],
      fetchedAt: 't',
      cacheHit: false,
    });
    mockReadFyiLive.mockResolvedValueOnce({
      ok: true,
      tier: 'fyi',
      items: [],
      fetchedAt: 't',
      cacheHit: false,
    });

    const outcome = await refreshRadarSnapshot(env);
    expect(outcome.kind).toBe('success');
  });

  it('treats Upstash counter errors as 0 (fail-open)', async () => {
    mockIsCircuitOpen.mockResolvedValueOnce({ open: false });
    bindMcpClient();
    mockCounterGet.mockRejectedValueOnce(new Error('upstash error'));
    mockCounterIncrby.mockResolvedValueOnce(6);
    mockCounterExpire.mockResolvedValueOnce(1);
    mockReadWireLive.mockResolvedValueOnce({
      ok: true,
      tier: 'wire',
      items: [],
      fetchedAt: 't',
      cacheHit: false,
    });
    mockReadFyiLive.mockResolvedValueOnce({
      ok: true,
      tier: 'fyi',
      items: [],
      fetchedAt: 't',
      cacheHit: false,
    });

    const outcome = await refreshRadarSnapshot(env);
    expect(outcome.kind).toBe('success');
  });
});

describe('refreshRadarSnapshot — success path', () => {
  beforeEach(() => {
    mockIsCircuitOpen.mockResolvedValueOnce({ open: false });
    bindMcpClient();
    mockCounterGet.mockResolvedValueOnce(0);
    mockCounterIncrby.mockResolvedValueOnce(6);
    mockCounterExpire.mockResolvedValueOnce(1);
  });

  it('returns success with item counts when both readers succeed', async () => {
    mockReadWireLive.mockResolvedValueOnce({
      ok: true,
      tier: 'wire',
      items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      fetchedAt: 't',
      cacheHit: false,
    });
    mockReadFyiLive.mockResolvedValueOnce({
      ok: true,
      tier: 'fyi',
      items: [{ id: 'x' }],
      fetchedAt: 't',
      cacheHit: false,
    });

    const outcome = await refreshRadarSnapshot(env);

    expect(outcome).toEqual({ kind: 'success', wireItems: 3, fyiItems: 1 });
    expect(mockReadWireLive).toHaveBeenCalledWith(env, { forceRefresh: true });
    expect(mockReadFyiLive).toHaveBeenCalledWith(env, 30, { forceRefresh: true });
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'cron.radar-refresh.success',
      'info',
      expect.objectContaining({ wireItems: 3, fyiItems: 1 }),
      'cron.radar-refresh'
    );
  });

  it('increments the day counter by 6 after a successful run', async () => {
    mockReadWireLive.mockResolvedValueOnce({
      ok: true,
      tier: 'wire',
      items: [],
      fetchedAt: 't',
      cacheHit: false,
    });
    mockReadFyiLive.mockResolvedValueOnce({
      ok: true,
      tier: 'fyi',
      items: [],
      fetchedAt: 't',
      cacheHit: false,
    });

    await refreshRadarSnapshot(env);

    expect(mockCounterIncrby).toHaveBeenCalledTimes(1);
    expect(mockCounterIncrby.mock.calls[0]?.[1]).toBe(6);
  });

  it('sets TTL on the day-counter only on the first increment of the day (when next === 6)', async () => {
    mockReadWireLive.mockResolvedValueOnce({
      ok: true,
      tier: 'wire',
      items: [],
      fetchedAt: 't',
      cacheHit: false,
    });
    mockReadFyiLive.mockResolvedValueOnce({
      ok: true,
      tier: 'fyi',
      items: [],
      fetchedAt: 't',
      cacheHit: false,
    });

    await refreshRadarSnapshot(env);

    expect(mockCounterExpire).toHaveBeenCalledTimes(1);
  });
});

describe('refreshRadarSnapshot — partial-failure path', () => {
  beforeEach(() => {
    mockIsCircuitOpen.mockResolvedValueOnce({ open: false });
    bindMcpClient();
    mockCounterGet.mockResolvedValueOnce(0);
    mockCounterIncrby.mockResolvedValueOnce(6);
    mockCounterExpire.mockResolvedValueOnce(1);
  });

  it('returns partial when wire succeeds and fyi fails', async () => {
    mockReadWireLive.mockResolvedValueOnce({
      ok: true,
      tier: 'wire',
      items: [],
      fetchedAt: 't',
      cacheHit: false,
    });
    mockReadFyiLive.mockResolvedValueOnce({
      ok: false,
      status: 429,
      reason: 'inoreader-rate-limit',
      message: 'rate limited',
    });

    const outcome = await refreshRadarSnapshot(env);

    expect(outcome).toEqual({ kind: 'partial', wireOk: true, fyiOk: false });
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'cron.radar-refresh.partial',
      'warning',
      expect.objectContaining({ wireOk: true, fyiOk: false, fyiReason: 'inoreader-rate-limit' }),
      'cron.radar-refresh'
    );
  });

  it('still increments the counter on partial failure (the Inoreader calls were made)', async () => {
    mockReadWireLive.mockResolvedValueOnce({
      ok: false,
      status: 502,
      reason: 'upstream-error',
      message: 'down',
    });
    mockReadFyiLive.mockResolvedValueOnce({
      ok: true,
      tier: 'fyi',
      items: [],
      fetchedAt: 't',
      cacheHit: false,
    });

    await refreshRadarSnapshot(env);

    expect(mockCounterIncrby).toHaveBeenCalledTimes(1);
  });
});

describe('refreshRadarSnapshot — error path', () => {
  it('returns error and captures the exception when a reader throws', async () => {
    mockIsCircuitOpen.mockResolvedValueOnce({ open: false });
    bindMcpClient();
    mockCounterGet.mockResolvedValueOnce(0);
    mockReadWireLive.mockRejectedValueOnce(new Error('boom'));
    mockReadFyiLive.mockResolvedValueOnce({
      ok: true,
      tier: 'fyi',
      items: [],
      fetchedAt: 't',
      cacheHit: false,
    });

    const outcome = await refreshRadarSnapshot(env);

    expect(outcome.kind).toBe('error');
    if (outcome.kind === 'error') {
      expect(outcome.message).toBe('boom');
    }
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'cron.radar-refresh.error',
      'error',
      expect.objectContaining({ message: 'boom' }),
      'cron.radar-refresh'
    );
  });
});
