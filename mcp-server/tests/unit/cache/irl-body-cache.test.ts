/**
 * BL-076 — IRL body cache unit tests.
 *
 * Covers:
 *   - `InMemoryIrlBodyCache` set/get round-trip
 *   - LRU eviction at capacity
 *   - LRU reordering on get-hit (recently-used entries survive)
 *   - Per-entry size cap enforcement (throws `IrlBodyCacheSizeExceededError`)
 *   - `UpstashIrlBodyCache` set/get round-trip via a `CacheStore` fake
 *   - Worker path: TTL is forwarded; size cap enforced before write
 */

import { describe, expect, it } from 'vitest';
import {
  InMemoryIrlBodyCache,
  IrlBodyCacheSizeExceededError,
  IRL_BODY_CACHE_MAX_BYTES,
  IRL_BODY_CACHE_TTL_SECONDS,
  IN_MEMORY_LRU_CAPACITY,
  UPSTASH_KEY_PREFIX,
  UpstashIrlBodyCache,
} from '../../../src/cache/irl-body-cache';
import type { CacheStore } from '../../../src/lib/upstash-cache-store';

const HASH_A = 'a'.repeat(16);
const HASH_B = 'b'.repeat(16);
const HASH_C = 'c'.repeat(16);

describe('InMemoryIrlBodyCache', () => {
  it('round-trips a body keyed by its hash', async () => {
    const cache = new InMemoryIrlBodyCache();
    await cache.set(HASH_A, 'body-a');
    expect(await cache.get(HASH_A)).toBe('body-a');
  });

  it('returns null on cache miss', async () => {
    const cache = new InMemoryIrlBodyCache();
    expect(await cache.get(HASH_A)).toBeNull();
  });

  it('overwrite of the same hash is idempotent (no growth)', async () => {
    const cache = new InMemoryIrlBodyCache();
    await cache.set(HASH_A, 'body-a');
    await cache.set(HASH_A, 'body-a');
    expect(cache.size()).toBe(1);
    expect(await cache.get(HASH_A)).toBe('body-a');
  });

  it('evicts the oldest entry when capacity is exceeded', async () => {
    const cache = new InMemoryIrlBodyCache(2);
    await cache.set(HASH_A, 'body-a');
    await cache.set(HASH_B, 'body-b');
    await cache.set(HASH_C, 'body-c'); // evicts HASH_A
    expect(await cache.get(HASH_A)).toBeNull();
    expect(await cache.get(HASH_B)).toBe('body-b');
    expect(await cache.get(HASH_C)).toBe('body-c');
    expect(cache.size()).toBe(2);
  });

  it('LRU reordering: get-hit refreshes recency', async () => {
    const cache = new InMemoryIrlBodyCache(2);
    await cache.set(HASH_A, 'body-a');
    await cache.set(HASH_B, 'body-b');
    // Touch A — moves it to MRU; B is now LRU.
    await cache.get(HASH_A);
    // Insert C — evicts B, not A.
    await cache.set(HASH_C, 'body-c');
    expect(await cache.get(HASH_A)).toBe('body-a');
    expect(await cache.get(HASH_B)).toBeNull();
    expect(await cache.get(HASH_C)).toBe('body-c');
  });

  it('default capacity is IN_MEMORY_LRU_CAPACITY', async () => {
    const cache = new InMemoryIrlBodyCache();
    for (let i = 0; i < IN_MEMORY_LRU_CAPACITY; i++) {
      await cache.set(`${i}`.padStart(16, '0'), `body-${i}`);
    }
    expect(cache.size()).toBe(IN_MEMORY_LRU_CAPACITY);
  });

  it('throws IrlBodyCacheSizeExceededError when body exceeds per-entry cap', async () => {
    const cache = new InMemoryIrlBodyCache();
    const oversized = 'x'.repeat(IRL_BODY_CACHE_MAX_BYTES + 1);
    await expect(cache.set(HASH_A, oversized)).rejects.toThrow(IrlBodyCacheSizeExceededError);
  });

  it('accepts a body exactly at the per-entry cap', async () => {
    const cache = new InMemoryIrlBodyCache();
    const atLimit = 'x'.repeat(IRL_BODY_CACHE_MAX_BYTES);
    await expect(cache.set(HASH_A, atLimit)).resolves.toBeUndefined();
  });

  it('SizeExceededError carries actionable diagnostic + numeric fields', async () => {
    const cache = new InMemoryIrlBodyCache();
    const oversized = 'x'.repeat(IRL_BODY_CACHE_MAX_BYTES + 100);
    try {
      await cache.set(HASH_A, oversized);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(IrlBodyCacheSizeExceededError);
      const err = e as IrlBodyCacheSizeExceededError;
      expect(err.byteLength).toBe(IRL_BODY_CACHE_MAX_BYTES + 100);
      expect(err.limit).toBe(IRL_BODY_CACHE_MAX_BYTES);
      expect(err.message).toContain('IRL_BODY_CACHE_MAX_BYTES');
      expect(err.message).toContain('BL-076');
    }
  });
});

describe('UpstashIrlBodyCache', () => {
  function makeFakeStore(): {
    store: CacheStore;
    writes: Array<{ key: string; value: string; ttl: number }>;
    seed: (key: string, value: string) => void;
  } {
    const data = new Map<string, string>();
    const writes: Array<{ key: string; value: string; ttl: number }> = [];
    const store: CacheStore = {
      async get<T>(key: string): Promise<T | null> {
        const v = data.get(key);
        return (v ?? null) as T | null;
      },
      async set<T>(key: string, value: T, ttlSeconds: number): Promise<boolean> {
        data.set(key, value as unknown as string);
        writes.push({ key, value: value as unknown as string, ttl: ttlSeconds });
        return true;
      },
      async del(key: string): Promise<boolean> {
        return data.delete(key);
      },
    };
    return {
      store,
      writes,
      seed: (k, v) => data.set(k, v),
    };
  }

  it('round-trips a body via the Upstash store with the BL-076 key prefix', async () => {
    const { store, writes } = makeFakeStore();
    const cache = new UpstashIrlBodyCache(store);
    await cache.set(HASH_A, 'body-a');
    expect(writes).toHaveLength(1);
    expect(writes[0].key).toBe(`${UPSTASH_KEY_PREFIX}${HASH_A}`);
    expect(writes[0].value).toBe('body-a');
    expect(writes[0].ttl).toBe(IRL_BODY_CACHE_TTL_SECONDS);
    expect(await cache.get(HASH_A)).toBe('body-a');
  });

  it('returns null on miss', async () => {
    const { store } = makeFakeStore();
    const cache = new UpstashIrlBodyCache(store);
    expect(await cache.get(HASH_A)).toBeNull();
  });

  it('accepts a custom TTL override', async () => {
    const { store, writes } = makeFakeStore();
    const cache = new UpstashIrlBodyCache(store, 60);
    await cache.set(HASH_A, 'body-a');
    expect(writes[0].ttl).toBe(60);
  });

  it('rejects oversized bodies BEFORE the upstash write (size cap enforced first)', async () => {
    const { store, writes } = makeFakeStore();
    const cache = new UpstashIrlBodyCache(store);
    const oversized = 'x'.repeat(IRL_BODY_CACHE_MAX_BYTES + 1);
    await expect(cache.set(HASH_A, oversized)).rejects.toThrow(IrlBodyCacheSizeExceededError);
    expect(writes).toHaveLength(0); // no write attempted
  });
});
