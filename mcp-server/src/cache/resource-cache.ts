/**
 * Server-side Resource cache for BL-032.5 Phase 1.
 *
 * Replaces the original BL-032.5 design's HTTP ETag/Cache-Control plan.
 * MCP Streamable HTTP is JSON-RPC over POST, not REST — there's no per-
 * Resource GET endpoint and no client-side `If-None-Match → 304` round-
 * trip. The cache therefore lives entirely server-side: every Resource
 * handler wraps its `compute()` step with `readThroughCache(...)`, and
 * cache hits short-circuit body recomputation. Invisible to clients;
 * only the server-side logs distinguish hit from miss.
 *
 * Cache substrate: Upstash KV via `createCacheStore` (shares the
 * existing MCP-DB client + `mcp:*` namespace).
 * Key shape: `mcp:resource:<sha256(uri)>`.
 * Value shape: `{ body, mimeType, populatedAt }` wrapped in the
 * `upstash-cache-store` Entry envelope.
 *
 * **Fail-open behaviour**:
 *   - No Upstash binding → skip cache, call `compute()`
 *   - Cache GET error → skip cache, call `compute()` (handled inside `upstash-cache-store`)
 *   - Cache SET error → return computed body, swallow the failure
 *
 * Reads never break because of cache infrastructure.
 */

import { createCacheStore } from '../lib/upstash-cache-store';
import { safeLog } from '../auth/safe-logger';
import type { Env } from '../worker';

const KEY_PREFIX = 'mcp:resource:';

/** Per-Resource-family TTLs in seconds. Centralized so policy lives in one place. */
export const RESOURCE_TTL_SECONDS = {
  /** Library articles change rarely; aggressive 24h cache keeps Upstash command count low. */
  LIBRARY: 24 * 60 * 60,
  /** Regulation frameworks change infrequently and atomically per-framework; 24h. */
  REGULATION: 24 * 60 * 60,
  /** Radar list snapshots: 15 min, matches the BL-032.5 Cron refresh cadence. */
  RADAR: 15 * 60,
  /** Radar items are effectively immutable once published; 24h. */
  RADAR_ITEM: 24 * 60 * 60,
} as const;

/** What `readThroughCache` returns. Body shape is identical hit-vs-miss. */
export interface CacheResult {
  readonly body: string;
  readonly mimeType: string;
  /** True if the body came from cache; false if `compute()` ran (or cache skipped). */
  readonly cacheHit: boolean;
}

interface CachedBody {
  readonly body: string;
  readonly mimeType: string;
  readonly populatedAt: number;
}

/** SHA-256 a URI into a lowercase hex digest. WebCrypto works in both Workers and Node 22+. */
async function hashUri(uri: string): Promise<string> {
  const data = new TextEncoder().encode(uri);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

/**
 * Read-through cache for a Resource body.
 *
 * Algorithm:
 *   1. If Upstash isn't bound, run `compute()` and return — no caching.
 *   2. Look up `mcp:resource:<sha256(uri)>`. On a well-formed hit, return
 *      the cached body and mark `cacheHit: true`.
 *   3. On a miss (or malformed cached value), run `compute()`, best-effort
 *      write the result, and return with `cacheHit: false`.
 *
 * **`noStore` (BL-091)**: `compute()` may flag a result as non-cacheable, and
 * the write is then skipped. This exists because a *degraded* body — e.g. the
 * radar "snapshot not populated" placeholder produced while the Inoreader
 * circuit breaker is open — would otherwise be pinned for the full TTL and
 * keep serving failure text long after the underlying state recovered.
 * Caching a transient error is worse than not caching at all.
 *
 * Every call emits one `safeLog` event:
 *   - `resource_cache_skip` (no Upstash, or `noStore`; populated `reason`)
 *   - `resource_cache_hit` (cache served the body)
 *   - `resource_cache_miss` (compute ran)
 */
export async function readThroughCache(
  env: Env,
  uri: string,
  ttlSeconds: number,
  compute: () => Promise<{ body: string; mimeType: string; noStore?: boolean }>
): Promise<CacheResult> {
  const startedAt = Date.now();
  const store = createCacheStore(env);

  if (!store) {
    const fresh = await compute();
    safeLog({
      event: 'resource_cache_skip',
      uri,
      reason: 'upstash-not-bound',
      durationMs: Date.now() - startedAt,
    });
    return { body: fresh.body, mimeType: fresh.mimeType, cacheHit: false };
  }

  const key = KEY_PREFIX + (await hashUri(uri));
  const cached = await store.get<CachedBody>(key);
  if (cached && typeof cached.body === 'string' && typeof cached.mimeType === 'string') {
    safeLog({
      event: 'resource_cache_hit',
      uri,
      durationMs: Date.now() - startedAt,
    });
    return { body: cached.body, mimeType: cached.mimeType, cacheHit: true };
  }

  const fresh = await compute();

  // BL-091: never persist a body the producer flagged as degraded/transient —
  // caching it would outlive the condition that produced it.
  if (fresh.noStore) {
    safeLog({
      event: 'resource_cache_skip',
      uri,
      reason: 'no-store',
      durationMs: Date.now() - startedAt,
    });
    return { body: fresh.body, mimeType: fresh.mimeType, cacheHit: false };
  }

  const value: CachedBody = {
    body: fresh.body,
    mimeType: fresh.mimeType,
    populatedAt: Date.now(),
  };
  await store.set<CachedBody>(key, value, ttlSeconds);

  safeLog({
    event: 'resource_cache_miss',
    uri,
    durationMs: Date.now() - startedAt,
  });
  return { body: fresh.body, mimeType: fresh.mimeType, cacheHit: false };
}
