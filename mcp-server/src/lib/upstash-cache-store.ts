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
 * **Namespace discipline (Q13 / Path 2)**: this store talks ONLY to the MCP
 * DB via `createMcpClient(env)`. All keys written here use the `mcp:` prefix
 * (cache snapshots, rate-limit counters, circuit-breaker flags); Inoreader
 * OAuth token state is never touched through this store — that path goes
 * through `inoreader-token-store.ts` (`mcp:inoreader:*` in the same MCP DB;
 * the legacy website Inoreader DB was retired in BL-032.8 Phase B).
 */

import { safeLog } from '../auth/safe-logger';
import { createMcpClient } from './upstash-clients';
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
export function createCacheStore(
  env: Env,
  /**
   * BL-123 — forwarded to `createMcpClient`. Callers whose store sits on a
   * tool's response path should pass `{ retry: false }`: the SDK default is six
   * attempts and ~4,289 ms of backoff sleep, which during an Upstash brownout
   * would sit in front of every call. BL-121 established this for the run
   * counters; it applies to any store whose value only labels an audit claim.
   */
  opts: { retry?: false } = {}
): CacheStore | null {
  const redis = createMcpClient(env, opts);
  if (!redis) return null;

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
      let serializedByteLength: number | undefined;
      try {
        const entry: Entry<T> = { storedAt: Date.now(), data: value };
        const serialized = JSON.stringify(entry);
        serializedByteLength = Buffer.byteLength(serialized, 'utf8');
        await redis.set(key, serialized, { ex: ttlSeconds });
        return true;
      } catch (err) {
        // BL-077b — surface the Upstash error before swallowing.
        // Pre-BL-077b, this catch silently returned `false`, hiding the
        // actual failure mode (size limit, quota, auth, network).
        // BL-077a's read-after-write probe (on `UpstashIrlBodyCache`)
        // catches the symptom; this logs the cause exactly once at the
        // substrate level so `wrangler tail` operators can see which
        // Upstash failure is firing. The `reason` field is truncated to
        // 300 chars to keep log lines bounded — sufficient for the typical
        // Upstash error envelope (`{"error":"..."}` or HTTP status text).
        safeLog({
          event: 'upstash.set.failed',
          key,
          byteLength: serializedByteLength,
          ttlSeconds,
          reason: err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300),
          success: false,
          errorCode: 'upstash-set-threw',
        });
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
