/**
 * BL-091 — the cache-only radar readers.
 *
 * `readWireCached` / `readFyiCached` are the readers used while the Inoreader
 * circuit breaker is OPEN. Their defining property is structural: they must be
 * **incapable of calling Inoreader**, so a breaker-open window can never leak
 * upstream budget no matter which surface is reading. These tests pin that
 * property plus the `cache-empty` contract.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { redisGet, redisSet, MockRedis } = vi.hoisted(() => {
  const redisGet = vi.fn();
  const redisSet = vi.fn();
  class MockRedis {
    get = redisGet;
    set = redisSet;
  }
  return { redisGet, redisSet, MockRedis };
});

vi.mock('@upstash/redis', () => ({ Redis: MockRedis }));

import { readWireCached, readFyiCached } from '../../../src/content/radar-live-store';
import type { Env } from '../../../src/worker';

const env: Env = {
  UPSTASH_MCP_REST_URL: 'https://mcp-db.upstash.io',
  UPSTASH_MCP_REST_TOKEN: 'test-token',
} as Env;

const fetchSpy = vi.fn();
const recentIso = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();

const item = (id: string, whenIso: string) => ({
  id,
  title: `T ${id}`,
  url: `https://example.com/${id}`,
  source: 'Src',
  category: 'pe-ma',
  publishedAt: whenIso,
  annotatedAt: whenIso,
  annotation: { highlightedText: 'h', gstTake: 't' },
});

beforeEach(() => {
  redisGet.mockReset();
  redisSet.mockReset();
  fetchSpy.mockReset();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => vi.unstubAllGlobals());

describe('readWireCached', () => {
  it('returns the cached tier on a hit, without touching Inoreader', async () => {
    const fetchedAt = recentIso();
    redisGet.mockImplementation(async (key: string) =>
      key === 'mcp:radar:cache:wire'
        ? {
            storedAt: Date.now(),
            data: { tier: 'wire', items: [item('w1', fetchedAt)], fetchedAt },
          }
        : null
    );

    const result = await readWireCached(env);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.items.map((i) => i.id)).toEqual(['w1']);
    expect(result.cacheHit).toBe(true);
    expect(result.fetchedAt).toBe(fetchedAt);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns cache-empty (503) on a miss and NEVER fetches', async () => {
    redisGet.mockResolvedValue(null);

    const result = await readWireCached(env);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reason).toBe('cache-empty');
    expect(result.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns cache-empty when Upstash is unbound (no client), still no fetch', async () => {
    const result = await readWireCached({} as Env);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reason).toBe('cache-empty');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('readFyiCached', () => {
  it('applies the read-time freshness gate to the RAW cached items', async () => {
    const fresh = recentIso();
    const ancient = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    redisGet.mockImplementation(async (key: string) =>
      key === 'mcp:radar:cache:fyi'
        ? {
            storedAt: Date.now(),
            data: {
              tier: 'fyi',
              items: [item('keep', fresh), item('drop', ancient)],
              fetchedAt: fresh,
            },
          }
        : null
    );

    const result = await readFyiCached(env);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.items.map((i) => i.id)).toEqual(['keep']);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns an empty-but-successful result when every cached item aged out', async () => {
    // This is the distinction that matters: "cached, but nothing is fresh" is
    // a legitimate empty answer — NOT a cache-empty failure.
    const ancient = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    redisGet.mockImplementation(async (key: string) =>
      key === 'mcp:radar:cache:fyi'
        ? {
            storedAt: Date.now(),
            data: { tier: 'fyi', items: [item('drop', ancient)], fetchedAt: recentIso() },
          }
        : null
    );

    const result = await readFyiCached(env);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.items).toEqual([]);
  });

  it('honors the caller count bound', async () => {
    const fresh = recentIso();
    redisGet.mockImplementation(async (key: string) =>
      key === 'mcp:radar:cache:fyi'
        ? {
            storedAt: Date.now(),
            data: {
              tier: 'fyi',
              items: [item('a', fresh), item('b', fresh), item('c', fresh)],
              fetchedAt: fresh,
            },
          }
        : null
    );

    const result = await readFyiCached(env, 2);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.items).toHaveLength(2);
  });

  it('returns cache-empty (503) on a miss and NEVER fetches', async () => {
    redisGet.mockResolvedValue(null);

    const result = await readFyiCached(env);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reason).toBe('cache-empty');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
