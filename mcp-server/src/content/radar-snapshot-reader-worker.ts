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

import {
  readFyiLive,
  readWireLive,
  readFyiCached,
  readWireCached,
  type LiveTierResult,
  type CachedTierResult,
} from './radar-live-store';
import { isCircuitOpen } from '../ratelimit/circuit-breaker';
import { handleInoreaderFailure } from '../lib/inoreader-failure-handler';
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

  /**
   * Collapse a tier read to the `SnapshotTier | null` this reader's contract
   * requires — but FIRST route an Inoreader failure through
   * `handleInoreaderFailure` so a 429 seen here can open the breaker.
   *
   * Before BL-091 this surface swallowed 429s entirely (`if (!ok) return null`),
   * making it — alongside `/radar/snapshot` — one of two paths that could burn
   * upstream quota without ever tripping the breaker, violating ADR-0006
   * § T.Z.2's "every Inoreader call site routes through the failure handler".
   * That matters most here: resource reads are model-initiated and bill to the
   * general rate-limit tier, not the stricter radar tier (ADR-0004).
   *
   * Only the live readers can produce an `InoreaderFailure`; the cache-only
   * readers' `cache-empty` is not assignable to it (by design) and is skipped.
   */
  const settle = async (
    result: LiveTierResult | CachedTierResult
  ): Promise<Extract<LiveTierResult, { ok: true }> | null> => {
    if (result.ok) return result;
    if (result.reason !== 'cache-empty') {
      await handleInoreaderFailure(env, result, 'resource-radar');
    }
    return null;
  };

  return {
    async readFyi(): Promise<SnapshotTier | null> {
      const result = await settle(
        (await isDegraded()) ? await readFyiCached(env) : await readFyiLive(env)
      );
      if (!result) return null;
      return {
        tier: 'fyi',
        items: result.items,
        lastSeededAt: result.fetchedAt,
      };
    },

    async readWire(): Promise<SnapshotTier | null> {
      const result = await settle(
        (await isDegraded()) ? await readWireCached(env) : await readWireLive(env)
      );
      if (!result) return null;
      return {
        tier: 'wire',
        items: result.items,
        lastSeededAt: result.fetchedAt,
      };
    },

    async readWireByCategory(category: RadarCategory): Promise<SnapshotTier | null> {
      const wire = await settle(
        (await isDegraded()) ? await readWireCached(env) : await readWireLive(env)
      );
      if (!wire) return null;
      return {
        tier: 'wire',
        items: wire.items.filter((item) => item.category === category),
        lastSeededAt: wire.fetchedAt,
      };
    },
  };
}
