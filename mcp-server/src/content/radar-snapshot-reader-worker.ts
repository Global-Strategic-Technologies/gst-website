/**
 * Worker SnapshotReader — wraps `radar-live-store.ts` (the Upstash-backed
 * cache: `mcp:radar:cache:wire`, `mcp:radar:cache:fyi`).
 *
 * Used by the transport-portable layer in `server.ts` when the Worker
 * registers radar Resources. The underlying `radar-live-store.ts` is
 * Workers-compatible (no node:* imports).
 *
 * The Upstash cache is refreshed on a 6-hourly Worker Cron
 * (`cron/radar-refresh.ts`), and opportunistically by any read that misses
 * the cache while the Inoreader circuit breaker is CLOSED.
 *
 * **Circuit-breaker discipline (BL-091)**: when the breaker is OPEN this
 * reader switches to the cache-only readers, so a `resources/read` of
 * `gst://radar/*` can never spend Inoreader budget during a breaker window.
 * Before BL-091 this surface had no breaker check at all and would fetch
 * live on a cold cache — the exact leak the breaker exists to prevent. The
 * breaker state is resolved once per reader instance (one instance is built
 * per request in `server.ts`) and memoized, because `createWorkerSnapshotReader`
 * is called synchronously and cannot become async.
 */

import { readFyiLive, readWireLive, readFyiCached, readWireCached } from './radar-live-store';
import { isCircuitOpen } from '../ratelimit/circuit-breaker';
import type { SnapshotReader } from './radar-snapshot-reader';
import type { RadarCategory, SnapshotTier } from './radar-transform';
import type { Env } from '../worker';

/**
 * Build a worker-side SnapshotReader bound to the given Env. The env
 * carries Upstash credentials and is captured per-request from the
 * fetch handler (matching the pattern of radar Tools).
 */
export function createWorkerSnapshotReader(env: Env): SnapshotReader {
  // Memoized per reader instance (i.e. per request). `null` from
  // `isCircuitOpen` means Upstash gave no signal → fail open, read live.
  let breakerOpen: Promise<boolean> | null = null;
  const isDegraded = (): Promise<boolean> => {
    breakerOpen ??= isCircuitOpen(env).then((state) => state?.open === true);
    return breakerOpen;
  };

  return {
    async readFyi(): Promise<SnapshotTier | null> {
      const result = (await isDegraded()) ? await readFyiCached(env) : await readFyiLive(env);
      if (!result.ok) return null;
      return {
        tier: 'fyi',
        items: result.items,
        lastSeededAt: result.fetchedAt,
      };
    },

    async readWire(): Promise<SnapshotTier | null> {
      const result = (await isDegraded()) ? await readWireCached(env) : await readWireLive(env);
      if (!result.ok) return null;
      return {
        tier: 'wire',
        items: result.items,
        lastSeededAt: result.fetchedAt,
      };
    },

    async readWireByCategory(category: RadarCategory): Promise<SnapshotTier | null> {
      const wire = (await isDegraded()) ? await readWireCached(env) : await readWireLive(env);
      if (!wire.ok) return null;
      return {
        tier: 'wire',
        items: wire.items.filter((item) => item.category === category),
        lastSeededAt: wire.fetchedAt,
      };
    },
  };
}
