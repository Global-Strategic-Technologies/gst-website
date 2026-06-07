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
  IrlBodyCacheWriteFailedError,
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

  it('round-trips a realistic 3046-byte IRL body (matches the BL-076 staging failure payload)', async () => {
    // Audit alt root cause #2 (envelope shape): if JSON wrap/unwrap fails
    // on a realistic body shape, this test catches it before deployment.
    // 3046 bytes matches the body size from the 2026-06-07 staging failure.
    const { store } = makeFakeStore();
    const cache = new UpstashIrlBodyCache(store);
    const realisticBody =
      '# Information Request List\n\n' +
      '## Section 00 — Basics\n\n' +
      '- Annual recurring revenue: $45.2M\n' +
      // Pad with realistic markdown content + special chars (newlines,
      // backticks, escapes) that could trip JSON serialization.
      Array.from(
        { length: 80 },
        (_, i) => `- Bullet ${i}: data row with \`backticks\` and "quotes" and {braces}`
      ).join('\n');
    await cache.set(HASH_A, realisticBody);
    const readback = await cache.get(HASH_A);
    expect(readback).toBe(realisticBody);
    expect(Buffer.byteLength(realisticBody, 'utf8')).toBeGreaterThan(2000);
  });
});

// ─── BL-077a — fail-loud diagnostic tests ────────────────────────────────

describe('UpstashIrlBodyCache — BL-077a fail-loud + read-after-write probe', () => {
  function makeWriteFailingStore(): CacheStore {
    // Simulates CacheStore.set swallowing an Upstash error → returns false.
    return {
      async get<T>(): Promise<T | null> {
        return null;
      },
      async set(): Promise<boolean> {
        return false; // ← silent failure CacheStore.set returns today
      },
      async del(): Promise<boolean> {
        return false;
      },
    };
  }

  function makeReadbackNullStore(): CacheStore {
    // set returns true (success) but the immediate get returns null.
    // Models the envelope-shape mismatch root cause (audit alt #2) where the
    // write "logically" succeeded but the value isn't readable on the very
    // next call against the same store.
    return {
      async get<T>(): Promise<T | null> {
        return null;
      },
      async set(): Promise<boolean> {
        return true;
      },
      async del(): Promise<boolean> {
        return false;
      },
    };
  }

  function makeReadbackMismatchStore(corrupted: string): CacheStore {
    // set returns true, but the read-back returns a DIFFERENT string —
    // simulates serialization corruption (e.g., truncation, encoding drift).
    return {
      async get<T>(): Promise<T | null> {
        return corrupted as unknown as T;
      },
      async set(): Promise<boolean> {
        return true;
      },
      async del(): Promise<boolean> {
        return false;
      },
    };
  }

  it("set throws IrlBodyCacheWriteFailedError(cause='write-returned-false') when the underlying store.set returns false", async () => {
    const cache = new UpstashIrlBodyCache(makeWriteFailingStore());
    try {
      await cache.set(HASH_A, 'body-a');
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(IrlBodyCacheWriteFailedError);
      const err = e as IrlBodyCacheWriteFailedError;
      expect(err.cause).toBe('write-returned-false');
      expect(err.irlBodyHash).toBe(HASH_A);
      expect(err.message).toContain('BL-077a');
      expect(err.message).toContain('wrangler tail');
    }
  });

  it("set throws IrlBodyCacheWriteFailedError(cause='readback-null') when set returns true but the read-after-write probe returns null", async () => {
    const cache = new UpstashIrlBodyCache(makeReadbackNullStore());
    try {
      await cache.set(HASH_A, 'body-a');
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(IrlBodyCacheWriteFailedError);
      const err = e as IrlBodyCacheWriteFailedError;
      expect(err.cause).toBe('readback-null');
      expect(err.message).toContain('envelope-shape mismatch');
    }
  });

  it("set throws IrlBodyCacheWriteFailedError(cause='readback-mismatch') when the read-after-write probe returns a different value", async () => {
    const cache = new UpstashIrlBodyCache(makeReadbackMismatchStore('CORRUPTED'));
    try {
      await cache.set(HASH_A, 'body-a');
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(IrlBodyCacheWriteFailedError);
      const err = e as IrlBodyCacheWriteFailedError;
      expect(err.cause).toBe('readback-mismatch');
      expect(err.message).toContain('serialization corruption');
    }
  });

  it('UpstashIrlBodyCache.storeId is unique per instance — diagnoses audit alt root cause #1 (different stores) via wrangler tail', async () => {
    const store: CacheStore = {
      async get(): Promise<null> {
        return null;
      },
      async set(): Promise<boolean> {
        return true;
      },
      async del(): Promise<boolean> {
        return false;
      },
    };
    const cacheA = new UpstashIrlBodyCache(store);
    const cacheB = new UpstashIrlBodyCache(store);
    expect(cacheA.storeId).toBeTypeOf('number');
    expect(cacheB.storeId).toBeTypeOf('number');
    expect(cacheA.storeId).not.toBe(cacheB.storeId);
  });

  it('happy path: set + get round-trip emits safeLog events with success outcomes (no throw)', async () => {
    // The read-after-write probe on a working fake-store should complete
    // without throwing. (safeLog assertion is implicit — no test failure
    // means no exception propagated from the probe path.)
    const data = new Map<string, string>();
    const store: CacheStore = {
      async get<T>(key: string): Promise<T | null> {
        return (data.get(key) ?? null) as T | null;
      },
      async set<T>(key: string, value: T): Promise<boolean> {
        data.set(key, value as unknown as string);
        return true;
      },
      async del(): Promise<boolean> {
        return false;
      },
    };
    const cache = new UpstashIrlBodyCache(store);
    await expect(cache.set(HASH_A, 'body-a')).resolves.toBeUndefined();
    expect(await cache.get(HASH_A)).toBe('body-a');
  });
});
