/**
 * Worker SnapshotReader — wraps `radar-live-store.ts` (the Upstash-backed
 * cache: `mcp:radar:cache:wire`, `mcp:radar:cache:fyi`).
 *
 * Used by the transport-portable layer in `server.ts` when the Worker
 * registers radar Resources. The underlying `radar-live-store.ts` is
 * Workers-compatible (no node:* imports).
 *
 * BL-032.5 Phase 4 will populate the Upstash cache hourly via Worker
 * Cron. Until that ships, the cache is populated opportunistically by
 * the existing radar Tools (`search_radar`, `get_latest_insights`) on
 * each first call after TTL expiry, OR by the website's ISR.
 */

import { readFyiLive, readWireLive } from './radar-live-store';
import type { SnapshotReader } from './radar-snapshot-reader';
import type { RadarCategory, SnapshotTier } from './radar-transform';
import type { Env } from '../worker';

/**
 * Build a worker-side SnapshotReader bound to the given Env. The env
 * carries Upstash credentials and is captured per-request from the
 * fetch handler (matching the pattern of radar Tools).
 */
export function createWorkerSnapshotReader(env: Env): SnapshotReader {
  return {
    async readFyi(): Promise<SnapshotTier | null> {
      const result = await readFyiLive(env);
      if (!result.ok) return null;
      return {
        tier: 'fyi',
        items: result.items,
        lastSeededAt: result.fetchedAt,
      };
    },

    async readWire(): Promise<SnapshotTier | null> {
      const result = await readWireLive(env);
      if (!result.ok) return null;
      return {
        tier: 'wire',
        items: result.items,
        lastSeededAt: result.fetchedAt,
      };
    },

    async readWireByCategory(category: RadarCategory): Promise<SnapshotTier | null> {
      const wire = await readWireLive(env);
      if (!wire.ok) return null;
      return {
        tier: 'wire',
        items: wire.items.filter((item) => item.category === category),
        lastSeededAt: wire.fetchedAt,
      };
    },
  };
}
