/**
 * BL-091 — the Worker SnapshotReader (backing the `gst://radar/*` Resources)
 * must respect the Inoreader circuit breaker.
 *
 * Before BL-091 this surface had NO breaker check: a `resources/read` on a
 * cold cache during an open window would fetch Inoreader live, spending the
 * exact budget the breaker exists to protect. These tests pin the fix — and,
 * critically, that the breaker state is resolved ONCE per reader instance
 * (the factory is called synchronously per request and cannot be async).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockReadWire, mockReadFyi, mockReadWireCached, mockReadFyiCached, mockIsCircuitOpen } =
  vi.hoisted(() => ({
    mockReadWire: vi.fn(),
    mockReadFyi: vi.fn(),
    mockReadWireCached: vi.fn(),
    mockReadFyiCached: vi.fn(),
    mockIsCircuitOpen: vi.fn(),
  }));

vi.mock('../../../src/content/radar-live-store', () => ({
  readWireLive: mockReadWire,
  readFyiLive: mockReadFyi,
  readWireCached: mockReadWireCached,
  readFyiCached: mockReadFyiCached,
}));
vi.mock('../../../src/ratelimit/circuit-breaker', () => ({
  isCircuitOpen: mockIsCircuitOpen,
}));

import { createWorkerSnapshotReader } from '../../../src/content/radar-snapshot-reader-worker';
import type { Env } from '../../../src/worker';

const env = {} as Env;
const okTier = (tier: 'wire' | 'fyi') => ({
  ok: true,
  tier,
  items: [{ id: `${tier}-1`, category: 'pe-ma' }],
  fetchedAt: '2026-05-17T10:00:00Z',
  cacheHit: true,
});

beforeEach(() => {
  mockReadWire.mockReset();
  mockReadFyi.mockReset();
  mockReadWireCached.mockReset();
  mockReadFyiCached.mockReset();
  mockIsCircuitOpen.mockReset();
});

describe('createWorkerSnapshotReader — breaker OPEN', () => {
  beforeEach(() => {
    mockIsCircuitOpen.mockResolvedValue({ open: true, retryAfterSeconds: 3600 });
    mockReadWireCached.mockResolvedValue(okTier('wire'));
    mockReadFyiCached.mockResolvedValue(okTier('fyi'));
  });

  it('readFyi uses the cache-only reader — the fetch-capable one is never called', async () => {
    const tier = await createWorkerSnapshotReader(env).readFyi();

    expect(tier).toMatchObject({ tier: 'fyi', lastSeededAt: '2026-05-17T10:00:00Z' });
    expect(mockReadFyiCached).toHaveBeenCalled();
    expect(mockReadFyi).not.toHaveBeenCalled();
  });

  it('readWire uses the cache-only reader', async () => {
    const tier = await createWorkerSnapshotReader(env).readWire();

    expect(tier).toMatchObject({ tier: 'wire' });
    expect(mockReadWireCached).toHaveBeenCalled();
    expect(mockReadWire).not.toHaveBeenCalled();
  });

  it('readWireByCategory uses the cache-only reader and still filters', async () => {
    mockReadWireCached.mockResolvedValue({
      ...okTier('wire'),
      items: [
        { id: 'a', category: 'pe-ma' },
        { id: 'b', category: 'security' },
      ],
    });

    const tier = await createWorkerSnapshotReader(env).readWireByCategory('security');

    expect(tier?.items.map((i) => i.id)).toEqual(['b']);
    expect(mockReadWire).not.toHaveBeenCalled();
  });

  it('returns null (→ snapshot-missing body) when the cache is empty, without fetching', async () => {
    mockReadFyiCached.mockResolvedValue({ ok: false, reason: 'cache-empty', status: 503 });

    const tier = await createWorkerSnapshotReader(env).readFyi();

    expect(tier).toBeNull();
    expect(mockReadFyi).not.toHaveBeenCalled();
  });

  it('resolves the breaker state once per reader instance (memoized)', async () => {
    const reader = createWorkerSnapshotReader(env);
    await Promise.all([reader.readFyi(), reader.readWire(), reader.readWireByCategory('pe-ma')]);

    expect(mockIsCircuitOpen).toHaveBeenCalledTimes(1);
  });
});

describe('createWorkerSnapshotReader — breaker CLOSED or unknown', () => {
  it('uses the live readers when the breaker is closed', async () => {
    mockIsCircuitOpen.mockResolvedValue({ open: false });
    mockReadFyi.mockResolvedValue(okTier('fyi'));

    await createWorkerSnapshotReader(env).readFyi();

    expect(mockReadFyi).toHaveBeenCalled();
    expect(mockReadFyiCached).not.toHaveBeenCalled();
  });

  it('fails open to the live readers when Upstash gives no signal (null)', async () => {
    mockIsCircuitOpen.mockResolvedValue(null);
    mockReadWire.mockResolvedValue(okTier('wire'));

    await createWorkerSnapshotReader(env).readWire();

    expect(mockReadWire).toHaveBeenCalled();
    expect(mockReadWireCached).not.toHaveBeenCalled();
  });
});
