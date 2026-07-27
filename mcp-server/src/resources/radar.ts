/**
 * MCP Resources: gst://radar/...
 *
 * Static URIs registered at server boot:
 *   - gst://radar/fyi/latest          (annotated highlights, with GST Take)
 *   - gst://radar/wire/latest         (latest items across all categories)
 *   - gst://radar/wire/<category>     (one per of the four canonical categories)
 *
 * Per-item URIs (gst://radar/item/<id>) are NOT pre-registered as static
 * resources — there are too many cached items and the IDs change with each
 * `npm run radar:seed`. The `search_radar_offline` tool (BL-032 Phase 4b
 * rename of `search_radar_cache`) returns the items directly; callers
 * don't need to chain to a per-item Resource.
 *
 * BL-032.5 Phase 3 refactor: this module is **transport-portable** — it
 * holds no node:* imports and accepts a `SnapshotReader` from the caller.
 * The stdio entrypoint passes the file-system-backed reader (via
 * `_local-only.ts`); the Worker passes the Upstash-backed reader (via
 * `server.ts`). The handler bodies are identical across transports
 * because both readers implement the same interface.
 *
 * If the snapshot source returns null, the handler returns the
 * `SNAPSHOT_MISSING_MESSAGE` shape wrapped in a 200 OK response body.
 * The same shape ships on both transports so client UX is consistent.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  RADAR_CATEGORIES,
  type RadarCategory,
  type SnapshotTier,
} from '../content/radar-transform';
import { readThroughCache, RESOURCE_TTL_SECONDS } from '../cache/resource-cache';
import { assertScope, SCOPES, MissingScopeError, DEFAULT_SCOPES } from '../auth/scopes';
import { NOOP_METRICS_CONTEXT, withResourceMetrics, type MetricsContext } from '../metrics/_index';
import type { SnapshotReader } from '../content/radar-snapshot-reader';
import type { Env } from '../worker';

const CATEGORY_LABELS: Readonly<Record<RadarCategory, string>> = {
  'pe-ma': 'PE & M&A',
  'enterprise-tech': 'Enterprise Tech',
  'ai-automation': 'AI & Automation',
  security: 'Security',
};

const SNAPSHOT_MISSING_MESSAGE =
  'Radar snapshot is not yet populated. On the local stdio path: run `npm run radar:seed`. On the Worker path: the 6-hourly Cron refreshes the Upstash cache. Note that while the Inoreader budget circuit breaker is open, no read refreshes the cache (that is deliberate — it protects the shared upstream budget), so this state can persist until the breaker closes.';

function buildBody(uri: string, tier: SnapshotTier | null): string {
  if (!tier) {
    return JSON.stringify({ error: SNAPSHOT_MISSING_MESSAGE, uri }, null, 2);
  }
  return JSON.stringify(
    {
      uri,
      tier: tier.tier,
      lastSeededAt: tier.lastSeededAt,
      itemCount: tier.items.length,
      items: tier.items,
    },
    null,
    2
  );
}

/**
 * Register the six static radar Resources on the given server.
 *
 * @param server - MCP server (transport-agnostic at this layer)
 * @param reader - Snapshot source; injected by the caller so this module
 *                doesn't transitively pull in node:fs OR the Upstash client
 * @param env - Worker env, threaded through to the BL-032.5 cache layer.
 *              For stdio (no Upstash), pass `{}` — the cache fails open.
 * @param scopes - Scope set from the request's auth; checked per call via
 *                 `assertScope(scopes, RESOURCE_RADAR_READ)`. Defaults to
 *                 `DEFAULT_SCOPES` (full grant) for stdio.
 */
export function registerRadarResources(
  server: McpServer,
  reader: SnapshotReader,
  env: Env = {},
  scopes: readonly string[] = DEFAULT_SCOPES,
  metrics: MetricsContext = NOOP_METRICS_CONTEXT
): void {
  const readSnapshot = async (
    uri: string,
    fetch: () => Promise<SnapshotTier | null>
  ): Promise<{ body: string; mimeType: string; noStore?: boolean }> => {
    const tier = await fetch();
    return {
      body: buildBody(uri, tier),
      mimeType: 'application/json',
      // BL-091: a missing snapshot is a transient condition (cold cache, or
      // the circuit breaker suppressing refreshes). Caching that placeholder
      // for the full 15-min TTL would keep serving "not populated" well past
      // recovery, so don't persist it.
      ...(tier ? {} : { noStore: true }),
    };
  };

  // Wrap a handler with scope-check + cache. Returns the MCP contents
  // envelope or surfaces MissingScopeError to the SDK (which converts
  // it to a JSON-RPC error response).
  const buildHandler =
    (fetch: () => Promise<SnapshotTier | null>) =>
    async (
      uri: URL
    ): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> => {
      assertScope(scopes, SCOPES.RESOURCE_RADAR_READ);
      const cached = await readThroughCache(env, uri.href, RESOURCE_TTL_SECONDS.RADAR, () =>
        readSnapshot(uri.href, fetch)
      );
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: cached.mimeType,
            text: cached.body,
          },
        ],
      };
    };

  // gst://radar/fyi/latest
  server.registerResource(
    'GST Radar — FYI (latest annotated items)',
    'gst://radar/fyi/latest',
    {
      title: 'GST Radar — FYI (latest annotated)',
      description:
        'Latest annotated highlights from the GST Radar feed (snapshot-backed; refreshed via `npm run radar:seed` on stdio or hourly Worker Cron on HTTP).',
      mimeType: 'application/json',
    },
    withResourceMetrics(
      'gst://radar/fyi/latest',
      metrics,
      buildHandler(() => reader.readFyi())
    )
  );

  // gst://radar/wire/latest
  server.registerResource(
    'GST Radar — Wire (latest)',
    'gst://radar/wire/latest',
    {
      title: 'GST Radar — Wire (latest across all categories)',
      description:
        'Latest items from the merged GST Radar Wire feed (snapshot-backed; refreshed via `npm run radar:seed` on stdio or hourly Worker Cron on HTTP).',
      mimeType: 'application/json',
    },
    withResourceMetrics(
      'gst://radar/wire/latest',
      metrics,
      buildHandler(() => reader.readWire())
    )
  );

  // gst://radar/wire/<category> for each of the four canonical categories.
  for (const category of RADAR_CATEGORIES) {
    const uri = `gst://radar/wire/${category}`;
    server.registerResource(
      `GST Radar — Wire (${CATEGORY_LABELS[category]})`,
      uri,
      {
        title: `GST Radar — Wire: ${CATEGORY_LABELS[category]}`,
        description: `${CATEGORY_LABELS[category]} items from the GST Radar Wire feed (snapshot-backed).`,
        mimeType: 'application/json',
      },
      withResourceMetrics(
        uri,
        metrics,
        buildHandler(() => reader.readWireByCategory(category))
      )
    );
  }
}

/** Frozen list of expected radar URIs — used by the URI-stability test. */
export const RADAR_URIS: ReadonlyArray<string> = [
  'gst://radar/fyi/latest',
  'gst://radar/wire/latest',
  ...RADAR_CATEGORIES.map((c) => `gst://radar/wire/${c}`),
];

// Re-exports for backward-compat with callers that previously imported
// from this module (the offline-tool registration site, tests).
export { MissingScopeError };
