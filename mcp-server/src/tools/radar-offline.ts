/**
 * MCP tool: search_radar_offline (renamed from search_radar_cache in BL-032 Phase 4b).
 *
 * Local-only Radar tool — reads ONLY from the seeded snapshot
 * (`npm run radar:seed`) and never makes network calls. Sister to
 * `search_radar` (BL-032 Phase 4c — live, makes Inoreader calls,
 * remote-reachable). Both serve the same shape; this one is the
 * dev/CI/budget-exhausted-fallback path.
 *
 * **Why renamed**: the original `search_radar_cache` name predicted that
 * the live `search_radar` would ship alongside it. BL-032 Q2 reviewed
 * this — `_offline` is the more accurate label for what the tool does
 * (offline-from-Inoreader; reads a frozen local snapshot). The
 * deprecated alias `search_radar_cache` remains for one release and
 * tail-calls this implementation; it logs a deprecation warning to
 * stderr (acceptable on stdio — stdout is reserved for protocol traffic)
 * and will be removed in `mcp-server@0.2.0`. See
 * [`mcp-server/BREAKING_CHANGES.md`](../../BREAKING_CHANGES.md) for the
 * full rename record.
 *
 * **Transport binding** (BL-032 Q12): registered ONLY by
 * `_local-only.ts` from the stdio entrypoint. The Cloudflare Worker
 * never registers this tool — `radar-snapshot.ts` uses node:fs /
 * node:crypto at module-load time and isn't Workers-compatible.
 *
 * **BL-031.95 Phase 3 — capability mirror**: the tool's input schema is
 * the strict mirror of the website's Radar page (`/hub/radar`). The site
 * exposes a single filter — category — and renders an FYI+Wire-unified
 * feed sorted by `publishedAt` newest-first; this tool does the same.
 * Earlier versions accepted `query` / `tier` / `since` / `limit` filters
 * that had no website counterpart; those were removed under BL-031.95
 * Phase 3.A. Re-extending the surface is fine — keep website + tool
 * capability sets aligned.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  readFyiSnapshot,
  readWireSnapshot,
  SNAPSHOT_MISSING_MESSAGE,
  type RadarCategory,
  type SnapshotItem,
} from '../content/radar-snapshot';
import { oldestItemDaysAgo } from '../content/radar-transform';
import { serializeToParams as serializeRadarUrl } from '../../../src/utils/radar-url';
import { RadarCategoryEnum } from '../schemas';
import { HUB_BASE } from '../config';
import { toolOk, toolFail } from './_result';

const SearchRadarOfflineInputSchema = z.object({
  category: RadarCategoryEnum.optional().describe(
    'Optional category filter. One of "pe-ma" / "enterprise-tech" / "ai-automation" / "security". Omit for all categories. Mirrors the /hub/radar website\'s category filter pills (the only filter the website surfaces).'
  ),
});

type SearchRadarOfflineInput = z.infer<typeof SearchRadarOfflineInputSchema>;

const TOOL_DESCRIPTION = `Search the locally-cached GST Radar snapshot — strict mirror of the website's /hub/radar page. Offline / dev-mode counterpart to \`search_radar\` (the live tool over the remote MCP).

Reads from \`.cache/inoreader/\` populated by \`npm run radar:seed\`. Never makes live Inoreader API calls — protects the shared 200 req/day budget.

Input: optional \`category\` (one of "pe-ma", "enterprise-tech", "ai-automation", "security"); omit for all categories. Output mirrors the website's unified FYI + Wire feed sorted by \`publishedAt\` newest-first, plus a \`deeplink\` URL that opens /hub/radar pre-filtered to the same category.

If the snapshot is missing, returns a structured error with instructions. Companion to the gst://radar/... Resources.`;

function categoryMatches(item: SnapshotItem, filter?: RadarCategory): boolean {
  return !filter || item.category === filter;
}

/**
 * Build a Radar deep-link from the resolved input by delegating to the
 * shared encoder in `src/utils/radar-url.ts`. The encoder is the single
 * source of truth for radar URL state — same code path the website
 * page (`CategoryFilter.astro`) uses for hydration + sync.
 */
function buildRadarDeeplink(input: SearchRadarOfflineInput): string {
  const params = serializeRadarUrl({ category: input.category ?? null });
  const queryString = params.toString();
  return queryString ? `${HUB_BASE}/hub/radar?${queryString}` : `${HUB_BASE}/hub/radar`;
}

/**
 * Handler for the search_radar_offline MCP tool.
 *
 * Exported so integration tests can exercise the full wrapper pipeline
 * (input parsing + snapshot read + filter + sort + deeplink emission)
 * without going through the MCP transport. The MCP registration below
 * wraps this same handler. The deprecated `search_radar_cache` alias
 * also tail-calls into this same function.
 */
export async function handleRadarOfflineTool(input: SearchRadarOfflineInput) {
  const fyi = readFyiSnapshot();
  const wire = readWireSnapshot();
  if (!fyi && !wire) {
    return toolFail('snapshot-missing', SNAPSHOT_MISSING_MESSAGE);
  }

  const tagged: Array<SnapshotItem & { tier: 'fyi' | 'wire' }> = [];
  if (fyi) {
    for (const item of fyi.items) tagged.push({ ...item, tier: 'fyi' });
  }
  if (wire) {
    for (const item of wire.items) tagged.push({ ...item, tier: 'wire' });
  }

  const matched = tagged
    .filter((item) => categoryMatches(item, input.category))
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));

  const deeplink = buildRadarDeeplink(input);
  const payload = {
    matches: matched,
    totalMatched: matched.length,
    returned: matched.length,
    // BL-031.95 follow-up: freshness signal at the envelope. `null` when
    // matches is empty; otherwise rolling 24h-bucketed age of the oldest.
    // For the offline tool this reflects the snapshot's freshness — useful
    // for dev/test reminders that the cache is stale (`npm run radar:seed`).
    oldestItemDaysAgo: oldestItemDaysAgo(matched),
    snapshotInfo: {
      fyiLastSeededAt: fyi?.lastSeededAt ?? null,
      wireLastSeededAt: wire?.lastSeededAt ?? null,
    },
    deeplink,
  };
  return toolOk(payload, `${matched.length} radar items from the local snapshot.`);
}

/**
 * Register the canonical `search_radar_offline` tool. The deprecated
 * `search_radar_cache` alias is registered separately by
 * `registerSearchRadarCacheAlias` (one-release deprecation lifespan;
 * removed in `mcp-server@0.2.0`).
 */
export function registerRadarOfflineTool(server: McpServer): void {
  server.registerTool(
    'search_radar_offline',
    {
      title: 'Search Radar (offline / cached snapshot)',
      description: TOOL_DESCRIPTION,
      inputSchema: SearchRadarOfflineInputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    handleRadarOfflineTool
  );
}

const ALIAS_DESCRIPTION = `**DEPRECATED** — renamed to \`search_radar_offline\` in BL-032 Phase 4. Use \`search_radar_offline\` instead.

This alias remains for one release (will be removed in mcp-server@0.2.0). It tail-calls the same implementation as \`search_radar_offline\` and emits a deprecation warning to stderr on each invocation.

${TOOL_DESCRIPTION}`;

/**
 * Register the deprecated `search_radar_cache` alias. Same input/output
 * as `search_radar_offline`; logs a deprecation warning to stderr on
 * each invocation. Will be removed in `mcp-server@0.2.0` per the entry
 * in `mcp-server/BREAKING_CHANGES.md`.
 *
 * Stderr is the appropriate channel here — stdout is reserved for MCP
 * protocol traffic on the stdio transport, and the alias is stdio-only
 * (registered from `_local-only.ts`). The console.error call is exempt
 * from the no-console eslint rule because that rule scopes to the
 * Worker code path; stdio-only modules use console.error freely (same
 * as `src/index.ts`).
 */
export function registerSearchRadarCacheAlias(server: McpServer): void {
  server.registerTool(
    'search_radar_cache',
    {
      title: 'Search Radar Cache (DEPRECATED — use search_radar_offline)',
      description: ALIAS_DESCRIPTION,
      inputSchema: SearchRadarOfflineInputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (input: SearchRadarOfflineInput) => {
      console.error(
        '[gst-mcp] DEPRECATION: search_radar_cache renamed to search_radar_offline. Update your client config; this alias will be removed in mcp-server@0.2.0.'
      );
      return handleRadarOfflineTool(input);
    }
  );
}

// Re-export schema for downstream test imports.
export { SearchRadarOfflineInputSchema };
