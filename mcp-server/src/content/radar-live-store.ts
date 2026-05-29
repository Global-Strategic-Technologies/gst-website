/**
 * Worker-side radar content adapter (BL-032 Phase 4c).
 *
 * Live equivalent of `radar-snapshot.ts` (the offline / dev-mode reader).
 * Same `SnapshotItem` shape on the way out — both content adapters
 * implement the same interface, differing only in their source:
 *
 *   - `radar-snapshot.ts`   reads from `<repo>/.cache/inoreader/` (Node fs)
 *   - `radar-live-store.ts` reads from Upstash KV (mcp:radar:* keys, 6h TTL),
 *     falling back to a fresh Inoreader fetch on cache miss
 *
 * **Cache strategy**: 6h TTL on the merged stream + the FYI stream.
 * Matches the website's ISR window — both surfaces converge on the same
 * "stop hammering Inoreader" cadence.
 *
 * **Failure handling**: Inoreader 429 propagates as a structured failure
 * the caller (radar-live tool) inspects to call `openCircuit(env, ...)`
 * before returning a 503-shaped MCP error. Other failure modes
 * (token-stale, network-timeout, etc.) propagate without opening the
 * breaker — the breaker is specifically for "Inoreader budget
 * exhausted, all keys must back off."
 */

import {
  fetchAllStreams,
  fetchAnnotatedItems,
  type InoreaderResult,
  type RateLimitInfo,
} from '../lib/inoreader-client';
import type { InoreaderEgressCategory } from '../lib/inoreader-egress';
import { createCacheStore } from '../lib/upstash-cache-store';
import {
  recordInoreaderStatus,
  type InoreaderObservedSource,
} from '../observability/inoreader-status';
import { toSnapshotItem, type SnapshotItem } from './radar-transform';
import type { Env } from '../worker';

const CACHE_TTL_SECONDS = 6 * 60 * 60; // 6h, matches website ISR window
const CACHE_KEY_WIRE = 'mcp:radar:cache:wire';
const CACHE_KEY_FYI = 'mcp:radar:cache:fyi';

/** What the radar-live tools get back. Mirrors `SnapshotTier` shape. */
export type LiveTierResult =
  | {
      readonly ok: true;
      readonly tier: 'fyi' | 'wire';
      readonly items: readonly SnapshotItem[];
      readonly fetchedAt: string;
      readonly cacheHit: boolean;
    }
  | {
      readonly ok: false;
      readonly status: number;
      readonly reason:
        | 'inoreader-rate-limit'
        | 'token-stale'
        | 'config-missing'
        | 'token-missing'
        | 'upstream-error'
        | 'network-timeout';
      readonly message: string;
      /**
       * Populated on `inoreader-rate-limit` (429) responses when Inoreader
       * returned the `X-Reader-Zone*` headers. T.Z.3 (BL-032.7) — surfaces
       * the diagnostic headers through the live-store boundary so the
       * radar-live tools can attach them as Sentry tags.
       */
      readonly rateLimitInfo?: RateLimitInfo;
      /**
       * First ~200 chars of the Inoreader 429 response body. T.Z.3
       * (BL-032.7) — forwarded so the radar-live tools can include it in
       * the Sentry `extra` payload alongside the structured tags.
       */
      readonly bodyExcerpt?: string;
    };

interface CachedTier {
  readonly tier: 'fyi' | 'wire';
  readonly items: readonly SnapshotItem[];
  readonly fetchedAt: string;
}

/**
 * Map the `InoreaderObservedSource` surfaced through readWireLive / readFyiLive
 * to the corresponding `InoreaderEgressCategory` consumed by the egress
 * accounting wrapper (BL-032.75 Phase 0). The mapping is:
 *
 *   'cron'         → 'cron-radar'
 *   'live-tool'    → 'live-radar'
 *   'http-snapshot'→ 'http-radar-snapshot'
 *
 * The egress wrapper additionally synthesizes a '401-retry' category inside
 * authenticatedFetch; that path is not reachable from here.
 *
 * BL-032.75 Phase 0 audit fix S1: exhaustive switch with `never`
 * exhaustiveness check. A future `InoreaderObservedSource` widening now
 * fails the build (compile-time error pointing at this function), rather
 * than silently routing the new value into 'live-radar' via a `default`.
 */
function sourceToCategory(source: InoreaderObservedSource): InoreaderEgressCategory {
  switch (source) {
    case 'cron':
      return 'cron-radar';
    case 'live-tool':
      return 'live-radar';
    case 'http-snapshot':
      return 'http-radar-snapshot';
  }
  // If TypeScript reports an error on this line, a new value was added to
  // `InoreaderObservedSource` without a corresponding case above. Map it
  // to the right category (or add a new one in inoreader-egress.ts).
  const _exhaustive: never = source;
  throw new Error(`Unhandled InoreaderObservedSource: ${String(_exhaustive)}`);
}

/**
 * Read the merged Wire stream (live, with Upstash 6h cache).
 * On cache miss, calls Inoreader's `tag/list` + parallel folder fetches via
 * `fetchAllStreams`. Items are tagged `tier: 'wire'`.
 *
 * `opts.forceRefresh`: skip the cache lookup and always fetch from Inoreader.
 * Used by the BL-032.5 Phase 4 Worker Cron to refresh the snapshot on a
 * schedule independent of read traffic.
 *
 * `opts.source`: which path the call originated from. Recorded on the
 * `mcp:inoreader:last-status` entry so `/health` can surface
 * `inoreaderObservedSource`. Defaults to `'live-tool'` because that's
 * what most callers are (MCP tool handlers, the `/radar/snapshot` HTTP
 * route, the snapshot-reader adapter); the cron explicitly passes
 * `'cron'`.
 */
export async function readWireLive(
  env: Env,
  opts: { forceRefresh?: boolean; source?: InoreaderObservedSource; keyOwner?: string } = {}
): Promise<LiveTierResult> {
  const source: InoreaderObservedSource = opts.source ?? 'live-tool';
  const cache = createCacheStore(env);
  if (cache && !opts.forceRefresh) {
    const cached = await cache.get<CachedTier>(CACHE_KEY_WIRE);
    if (cached) {
      return {
        ok: true,
        tier: 'wire',
        items: cached.items,
        fetchedAt: cached.fetchedAt,
        cacheHit: true,
      };
    }
  }

  const result = await fetchAllStreams(env, 'GST-', 15, sourceToCategory(source), opts.keyOwner);
  if (!result.ok) {
    // BL-032 Phase 5: record observed Inoreader status for /health
    // surfacing. Best-effort; doesn't affect the failure response shape.
    await recordInoreaderStatus(env, 'degraded', source, `wire:${result.reason}`);
    return mapFailure(result);
  }

  // BL-032 Phase 5: record OK status so /health reflects fresh signal.
  await recordInoreaderStatus(env, 'ok', source, 'wire');

  const items: SnapshotItem[] = [];
  for (const item of result.data.items) {
    items.push(toSnapshotItem(item, 'wire'));
  }
  const fetchedAt = new Date().toISOString();

  if (cache) {
    await cache.set<CachedTier>(
      CACHE_KEY_WIRE,
      { tier: 'wire', items, fetchedAt },
      CACHE_TTL_SECONDS
    );
  }
  return { ok: true, tier: 'wire', items, fetchedAt, cacheHit: false };
}

/**
 * Read the FYI stream (live, with Upstash 6h cache).
 * On cache miss, calls Inoreader's annotated-stream endpoint via
 * `fetchAnnotatedItems`. Items are tagged `tier: 'fyi'`.
 *
 * `opts.forceRefresh`: skip the cache lookup and always fetch from Inoreader.
 * Used by the BL-032.5 Phase 4 Worker Cron.
 *
 * `opts.source`: see `readWireLive` docstring.
 */
export async function readFyiLive(
  env: Env,
  count: number = 30,
  opts: { forceRefresh?: boolean; source?: InoreaderObservedSource; keyOwner?: string } = {}
): Promise<LiveTierResult> {
  const source: InoreaderObservedSource = opts.source ?? 'live-tool';
  const cache = createCacheStore(env);
  if (cache && !opts.forceRefresh) {
    const cached = await cache.get<CachedTier>(CACHE_KEY_FYI);
    if (cached) {
      // Limit cached items to the requested count (cache stores up to 30,
      // callers may request fewer; just slice rather than re-fetching).
      const items = cached.items.slice(0, count);
      return { ok: true, tier: 'fyi', items, fetchedAt: cached.fetchedAt, cacheHit: true };
    }
  }

  const result = await fetchAnnotatedItems(env, count, sourceToCategory(source), opts.keyOwner);
  if (!result.ok) {
    await recordInoreaderStatus(env, 'degraded', source, `fyi:${result.reason}`);
    return mapFailure(result);
  }

  await recordInoreaderStatus(env, 'ok', source, 'fyi');

  const items: SnapshotItem[] = [];
  for (const item of result.data.items) {
    items.push(toSnapshotItem(item, 'fyi'));
  }
  const fetchedAt = new Date().toISOString();

  if (cache) {
    await cache.set<CachedTier>(
      CACHE_KEY_FYI,
      { tier: 'fyi', items, fetchedAt },
      CACHE_TTL_SECONDS
    );
  }
  return { ok: true, tier: 'fyi', items, fetchedAt, cacheHit: false };
}

/** Map an InoreaderResult failure to the LiveTierResult failure shape. */
function mapFailure(
  result: Extract<InoreaderResult, { ok: false }>
): Extract<LiveTierResult, { ok: false }> {
  return {
    ok: false,
    status: result.status,
    reason: result.reason,
    message: result.message,
    // Forward Inoreader's rate-limit diagnostic headers when present
    // (T.Z.3 — only populated on 429 responses).
    ...(result.rateLimitInfo ? { rateLimitInfo: result.rateLimitInfo } : {}),
    // Forward the body excerpt for Sentry `extra` (T.Z.3).
    ...(result.bodyExcerpt ? { bodyExcerpt: result.bodyExcerpt } : {}),
  };
}
