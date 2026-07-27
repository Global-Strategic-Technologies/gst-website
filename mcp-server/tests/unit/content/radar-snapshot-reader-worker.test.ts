/**
 * Unit tests for the BL-032.5 Phase 3 worker SnapshotReader. Mocks
 * `radar-live-store` (the underlying Upstash reader) so we exercise
 * the LiveTierResult → SnapshotTier mapping + the Wire-by-category
 * filter without needing a live Upstash binding.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SnapshotItem } from '../../../src/content/radar-transform';

const { mockReadFyi, mockReadWire, mockIsCircuitOpen, mockHandleInoreaderFailure } = vi.hoisted(
  () => ({
    mockReadFyi: vi.fn(),
    mockReadWire: vi.fn(),
    mockIsCircuitOpen: vi.fn(),
    mockHandleInoreaderFailure: vi.fn(),
  })
);

vi.mock('../../../src/content/radar-live-store', () => ({
  readFyiLive: mockReadFyi,
  readWireLive: mockReadWire,
  // BL-091 — the reader switches to these while the breaker is open. Unused in
  // this file's scenarios (breaker mocked closed) but must exist on the mock.
  readFyiCached: vi.fn(),
  readWireCached: vi.fn(),
}));
// BL-091 — the reader now consults the breaker and routes Inoreader failures
// so a resource-read 429 can open it. Both are mocked here: this file covers
// the LiveTierResult → SnapshotTier mapping, not breaker behavior (that lives
// in radar-snapshot-reader-worker-breaker.test.ts).
vi.mock('../../../src/ratelimit/circuit-breaker', () => ({
  isCircuitOpen: mockIsCircuitOpen,
}));
vi.mock('../../../src/lib/inoreader-failure-handler', () => ({
  handleInoreaderFailure: mockHandleInoreaderFailure,
}));

import { createWorkerSnapshotReader } from '../../../src/content/radar-snapshot-reader-worker';
import type { Env } from '../../../src/worker';

const env: Env = {
  UPSTASH_MCP_REST_URL: 'https://mcp.upstash.io',
  UPSTASH_MCP_REST_TOKEN: 'token',
};

function makeItem(id: string, category: SnapshotItem['category']): SnapshotItem {
  return {
    id,
    title: `Item ${id}`,
    url: `https://example.test/${id}`,
    source: 'Test source',
    category,
    publishedAt: '2026-05-13T00:00:00.000Z',
  };
}

beforeEach(() => {
  mockReadFyi.mockReset();
  mockReadWire.mockReset();
  mockIsCircuitOpen.mockReset();
  mockHandleInoreaderFailure.mockReset();
  // Breaker closed → the live readers are used, as these tests assume.
  mockIsCircuitOpen.mockResolvedValue({ open: false });
});

describe('createWorkerSnapshotReader — readFyi', () => {
  it('maps LiveTierResult.ok to SnapshotTier (fyi tier)', async () => {
    const items = [makeItem('fyi-1', 'pe-ma'), makeItem('fyi-2', 'security')];
    mockReadFyi.mockResolvedValueOnce({
      ok: true,
      tier: 'fyi',
      items,
      fetchedAt: '2026-05-13T10:00:00.000Z',
      cacheHit: false,
    });

    const reader = createWorkerSnapshotReader(env);
    const tier = await reader.readFyi();

    expect(tier).toEqual({
      tier: 'fyi',
      items,
      lastSeededAt: '2026-05-13T10:00:00.000Z',
    });
  });

  it('returns null when the underlying live-store reports an error', async () => {
    mockReadFyi.mockResolvedValueOnce({
      ok: false,
      status: 429,
      reason: 'inoreader-rate-limit',
      message: 'quota exhausted',
    });

    const tier = await createWorkerSnapshotReader(env).readFyi();
    expect(tier).toBeNull();
  });
});

describe('createWorkerSnapshotReader — readWire', () => {
  it('maps LiveTierResult.ok to SnapshotTier (wire tier)', async () => {
    const items = [makeItem('wire-1', 'enterprise-tech')];
    mockReadWire.mockResolvedValueOnce({
      ok: true,
      tier: 'wire',
      items,
      fetchedAt: '2026-05-13T11:00:00.000Z',
      cacheHit: true,
    });

    const tier = await createWorkerSnapshotReader(env).readWire();
    expect(tier).toEqual({
      tier: 'wire',
      items,
      lastSeededAt: '2026-05-13T11:00:00.000Z',
    });
  });

  it('returns null on live-store failure', async () => {
    mockReadWire.mockResolvedValueOnce({
      ok: false,
      status: 502,
      reason: 'upstream-error',
      message: 'inoreader-down',
    });
    const tier = await createWorkerSnapshotReader(env).readWire();
    expect(tier).toBeNull();
  });
});

describe('createWorkerSnapshotReader — readWireByCategory', () => {
  it('filters Wire items to the requested category, preserving order', async () => {
    const items: SnapshotItem[] = [
      makeItem('a', 'pe-ma'),
      makeItem('b', 'enterprise-tech'),
      makeItem('c', 'pe-ma'),
      makeItem('d', 'security'),
      makeItem('e', 'pe-ma'),
    ];
    mockReadWire.mockResolvedValueOnce({
      ok: true,
      tier: 'wire',
      items,
      fetchedAt: '2026-05-13T12:00:00.000Z',
      cacheHit: false,
    });

    const tier = await createWorkerSnapshotReader(env).readWireByCategory('pe-ma');
    expect(tier).not.toBeNull();
    expect(tier?.tier).toBe('wire');
    expect(tier?.items.map((i) => i.id)).toEqual(['a', 'c', 'e']);
    expect(tier?.lastSeededAt).toBe('2026-05-13T12:00:00.000Z');
  });

  it('returns an empty-items SnapshotTier when no item matches the category', async () => {
    mockReadWire.mockResolvedValueOnce({
      ok: true,
      tier: 'wire',
      items: [makeItem('a', 'pe-ma')],
      fetchedAt: '2026-05-13T13:00:00.000Z',
      cacheHit: false,
    });
    const tier = await createWorkerSnapshotReader(env).readWireByCategory('ai-automation');
    expect(tier?.items).toEqual([]);
  });

  it('returns null when the live-store wire fetch fails', async () => {
    mockReadWire.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'token-stale',
      message: 'refresh required',
    });
    const tier = await createWorkerSnapshotReader(env).readWireByCategory('pe-ma');
    expect(tier).toBeNull();
  });
});
