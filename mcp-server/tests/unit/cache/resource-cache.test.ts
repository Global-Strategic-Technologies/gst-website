/**
 * Unit tests for `readThroughCache` — the BL-032.5 Phase 1 server-side
 * Resource cache. Mocks `createCacheStore` so we exercise the cache
 * branches (hit / miss / skip / malformed-value / write-failure) without
 * needing a live Upstash binding.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockGet, mockSet, createCacheStoreMock } = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockSet = vi.fn();
  const createCacheStoreMock = vi.fn();
  return { mockGet, mockSet, createCacheStoreMock };
});

vi.mock('../../../src/lib/upstash-cache-store', () => ({
  createCacheStore: createCacheStoreMock,
}));

// Suppress the structured-log lines the cache emits — they're tested
// implicitly by counting safeLog mock calls below.
const { mockSafeLog } = vi.hoisted(() => ({ mockSafeLog: vi.fn() }));
vi.mock('../../../src/auth/safe-logger', () => ({
  safeLog: mockSafeLog,
}));

import { readThroughCache, RESOURCE_TTL_SECONDS } from '../../../src/cache/resource-cache';
import type { Env } from '../../../src/worker';

const env: Env = {
  UPSTASH_MCP_REST_URL: 'https://mcp.upstash.io',
  UPSTASH_MCP_REST_TOKEN: 'token',
};

beforeEach(() => {
  mockGet.mockReset();
  mockSet.mockReset();
  createCacheStoreMock.mockReset();
  mockSafeLog.mockReset();
});

function bindStore(): void {
  createCacheStoreMock.mockReturnValue({
    get: mockGet,
    set: mockSet,
    del: vi.fn(),
  });
}

describe('readThroughCache — cache hit path', () => {
  it('returns cached body without invoking compute()', async () => {
    bindStore();
    mockGet.mockResolvedValueOnce({
      body: 'cached-text',
      mimeType: 'text/markdown',
      populatedAt: 1000,
    });
    const compute = vi.fn(async () => ({ body: 'fresh', mimeType: 'text/markdown' }));

    const result = await readThroughCache(env, 'gst://library/vdr-structure', 60, compute);

    expect(result).toEqual({ body: 'cached-text', mimeType: 'text/markdown', cacheHit: true });
    expect(compute).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('emits a resource_cache_hit safeLog event with the URI', async () => {
    bindStore();
    mockGet.mockResolvedValueOnce({
      body: 'cached',
      mimeType: 'text/plain',
      populatedAt: 1000,
    });
    await readThroughCache(env, 'gst://library/business-architectures', 60, async () => ({
      body: 'fresh',
      mimeType: 'text/plain',
    }));

    expect(mockSafeLog).toHaveBeenCalledTimes(1);
    expect(mockSafeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'resource_cache_hit',
        uri: 'gst://library/business-architectures',
      })
    );
  });

  it('uses a stable cache key keyed by sha256(uri)', async () => {
    bindStore();
    mockGet.mockResolvedValueOnce(null);

    await readThroughCache(env, 'gst://library/vdr-structure', 60, async () => ({
      body: 'x',
      mimeType: 'text/plain',
    }));
    const firstKey = mockGet.mock.calls[0]?.[0];

    mockGet.mockResolvedValueOnce(null);
    mockSet.mockResolvedValueOnce(true);
    await readThroughCache(env, 'gst://library/vdr-structure', 60, async () => ({
      body: 'y',
      mimeType: 'text/plain',
    }));
    const secondKey = mockGet.mock.calls[1]?.[0];

    expect(firstKey).toBe(secondKey);
    expect(firstKey).toMatch(/^mcp:resource:[0-9a-f]{64}$/);
  });

  it('produces DIFFERENT cache keys for different URIs', async () => {
    bindStore();
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue(true);

    await readThroughCache(env, 'gst://library/a', 60, async () => ({
      body: '',
      mimeType: 'text/plain',
    }));
    await readThroughCache(env, 'gst://library/b', 60, async () => ({
      body: '',
      mimeType: 'text/plain',
    }));

    const keyA = mockGet.mock.calls[0]?.[0];
    const keyB = mockGet.mock.calls[1]?.[0];
    expect(keyA).not.toBe(keyB);
  });
});

describe('readThroughCache — cache miss path', () => {
  it('runs compute() and writes the result with the supplied TTL', async () => {
    bindStore();
    mockGet.mockResolvedValueOnce(null);
    mockSet.mockResolvedValueOnce(true);
    const compute = vi.fn(async () => ({ body: 'fresh', mimeType: 'text/plain' }));

    const result = await readThroughCache(env, 'gst://library/x', 300, compute);

    expect(result).toEqual({ body: 'fresh', mimeType: 'text/plain', cacheHit: false });
    expect(compute).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledTimes(1);
    const [, value, ttl] = mockSet.mock.calls[0] ?? [];
    expect(ttl).toBe(300);
    expect(value).toMatchObject({ body: 'fresh', mimeType: 'text/plain' });
    expect((value as { populatedAt: number }).populatedAt).toBeTypeOf('number');
  });

  it('emits a resource_cache_miss safeLog event with the URI', async () => {
    bindStore();
    mockGet.mockResolvedValueOnce(null);
    mockSet.mockResolvedValueOnce(true);
    await readThroughCache(env, 'gst://library/y', 60, async () => ({
      body: 'fresh',
      mimeType: 'text/plain',
    }));

    expect(mockSafeLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'resource_cache_miss', uri: 'gst://library/y' })
    );
  });

  it('treats a malformed cached value as a miss (recovers without throwing)', async () => {
    bindStore();
    // Missing the `body` and `mimeType` fields entirely — must not be served as a hit
    mockGet.mockResolvedValueOnce({ populatedAt: 1000 });
    mockSet.mockResolvedValueOnce(true);
    const compute = vi.fn(async () => ({ body: 'recovered', mimeType: 'text/plain' }));

    const result = await readThroughCache(env, 'gst://library/z', 60, compute);

    expect(result.cacheHit).toBe(false);
    expect(result.body).toBe('recovered');
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('still returns the computed body when the cache write fails', async () => {
    bindStore();
    mockGet.mockResolvedValueOnce(null);
    mockSet.mockResolvedValueOnce(false); // upstash-cache-store best-effort skip
    const compute = vi.fn(async () => ({ body: 'fresh', mimeType: 'text/plain' }));

    const result = await readThroughCache(env, 'gst://library/q', 60, compute);

    expect(result).toEqual({ body: 'fresh', mimeType: 'text/plain', cacheHit: false });
  });
});

describe('readThroughCache — noStore (BL-091)', () => {
  it('does NOT write a result the producer flagged noStore', async () => {
    bindStore();
    mockGet.mockResolvedValueOnce(null);
    const compute = vi.fn(async () => ({
      body: 'transient placeholder',
      mimeType: 'application/json',
      noStore: true,
    }));

    const result = await readThroughCache(env, 'gst://radar/wire', 900, compute);

    // Body still flows to the caller — only persistence is skipped.
    expect(result).toEqual({
      body: 'transient placeholder',
      mimeType: 'application/json',
      cacheHit: false,
    });
    expect(compute).toHaveBeenCalledTimes(1);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('emits resource_cache_skip with reason=no-store', async () => {
    bindStore();
    mockGet.mockResolvedValueOnce(null);

    await readThroughCache(env, 'gst://radar/fyi', 900, async () => ({
      body: 'transient',
      mimeType: 'application/json',
      noStore: true,
    }));

    expect(mockSafeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'resource_cache_skip',
        uri: 'gst://radar/fyi',
        reason: 'no-store',
      })
    );
  });

  it('still writes when noStore is absent or false (no behavior change for normal bodies)', async () => {
    bindStore();
    mockGet.mockResolvedValueOnce(null);
    mockSet.mockResolvedValueOnce(true);

    await readThroughCache(env, 'gst://library/z', 300, async () => ({
      body: 'real',
      mimeType: 'text/plain',
      noStore: false,
    }));

    expect(mockSet).toHaveBeenCalledTimes(1);
  });
});

describe('readThroughCache — fail-open path (no Upstash binding)', () => {
  it('skips the cache entirely when Upstash isn’t bound', async () => {
    createCacheStoreMock.mockReturnValue(null);
    const compute = vi.fn(async () => ({ body: 'fresh', mimeType: 'text/plain' }));

    const result = await readThroughCache({} as Env, 'gst://library/x', 60, compute);

    expect(result).toEqual({ body: 'fresh', mimeType: 'text/plain', cacheHit: false });
    expect(compute).toHaveBeenCalledTimes(1);
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('emits a resource_cache_skip event with reason=upstash-not-bound', async () => {
    createCacheStoreMock.mockReturnValue(null);
    await readThroughCache({} as Env, 'gst://library/x', 60, async () => ({
      body: '',
      mimeType: 'text/plain',
    }));
    expect(mockSafeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'resource_cache_skip',
        reason: 'upstash-not-bound',
        uri: 'gst://library/x',
      })
    );
  });
});

describe('RESOURCE_TTL_SECONDS — policy constants', () => {
  it('exposes 24h Library + Regulation TTLs and 15m radar TTL', () => {
    expect(RESOURCE_TTL_SECONDS.LIBRARY).toBe(86_400);
    expect(RESOURCE_TTL_SECONDS.REGULATION).toBe(86_400);
    expect(RESOURCE_TTL_SECONDS.RADAR).toBe(900);
  });
});
