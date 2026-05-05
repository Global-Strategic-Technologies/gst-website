/**
 * Generic Upstash KV cache helper for the Worker (BL-032 Phase 4a).
 *
 * Wraps `@upstash/redis` with the patterns the Worker needs:
 *   - Lazy connection — `null` when creds aren't bound (graceful skip)
 *   - JSON serialize / deserialize on read+write
 *   - TTL enforcement (`ex` option)
 *   - Best-effort writes — errors during set are non-fatal (returns false
 *     instead of throwing); the caller proceeds without caching rather than
 *     failing user requests because Upstash is degraded
 *
 * **Namespace discipline (Q13)**: every key written here uses the `mcp:`
 * prefix. Keys read here are either `mcp:*` (Worker-owned data — cache
 * snapshots, rate-limit counters, circuit-breaker flags) OR shared
 * `inoreader:*` keys (read-only — OAuth tokens written by the website).
 * The convention is enforced by review, not at the type level — adding
 * a key without a prefix is a code-review red flag.
 */

import { Redis } from '@upstash/redis';
import type { Env } from '../worker';

/** Cache entry shape stored in Upstash. */
interface Entry<T> {
  readonly storedAt: number;
  readonly data: T;
}

/** Public handle returned by the factory. `null` when Upstash isn't reachable. */
export interface CacheStore {
  /** Read+deserialize an entry; returns null on miss / expired / Upstash error. */
  get: <T>(key: string) => Promise<T | null>;
  /** Serialize+write with TTL. Returns true on success, false on best-effort skip. */
  set: <T>(key: string, value: T, ttlSeconds: number) => Promise<boolean>;
  /** Best-effort delete; returns true if the key existed. */
  del: (key: string) => Promise<boolean>;
}

/**
 * Build a CacheStore from the Worker env, or `null` when Upstash creds
 * aren't bound. Callers treat null as "skip caching" (radar tools will
 * still call Inoreader, just without ISR-style amortization — same
 * graceful-skip pattern as the rate-limiter).
 */
export function createCacheStore(env: Env): CacheStore | null {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const redis = new Redis({ url, token });

  return {
    async get<T>(key: string): Promise<T | null> {
      try {
        // @upstash/redis returns the deserialized value if it was stored as
        // JSON; here we wrap in our Entry envelope so we control the shape.
        const raw = await redis.get<Entry<T> | string | null>(key);
        if (raw == null) return null;
        // Upstash may return either the parsed object (if it auto-parsed
        // JSON) or the raw string. Normalize.
        const entry: Entry<T> = typeof raw === 'string' ? (JSON.parse(raw) as Entry<T>) : raw;
        return entry.data;
      } catch {
        return null;
      }
    },

    async set<T>(key: string, value: T, ttlSeconds: number): Promise<boolean> {
      try {
        const entry: Entry<T> = { storedAt: Date.now(), data: value };
        await redis.set(key, JSON.stringify(entry), { ex: ttlSeconds });
        return true;
      } catch {
        return false;
      }
    },

    async del(key: string): Promise<boolean> {
      try {
        const result = await redis.del(key);
        return result > 0;
      } catch {
        return false;
      }
    },
  };
}
