/**
 * MCP tool: search_radar_cache
 *
 * Local-only equivalent of BL-032's planned `search_radar` (which will hit
 * the live Inoreader API). This tool reads ONLY from the seeded snapshot
 * (`npm run radar:seed`) and never makes network calls — see
 * radar-snapshot.ts for the budget-protection invariant.
 *
 * Naming: the `_cache` suffix prevents collision with BL-032's `search_radar`
 * when the live remote tool ships.
 *
 * **BL-031.95 Phase 3 — capability mirror**: the tool's input schema is
 * the strict mirror of the website's Radar page (`/hub/radar`). The site
 * exposes a single filter — category — and renders an FYI+Wire-unified
 * feed sorted by `publishedAt` newest-first; this tool does the same.
 * Earlier versions accepted `query` / `tier` / `since` / `limit` filters
 * that had no website counterpart; those were removed in commit
 * <closure of Phase 3.A>. Re-extending the surface in the future is fine
 * — the test suite + Zod schema + CONTRACT.md are the canonical contract;
 * keep the website and tool capability sets aligned.
 */

import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  readFyiSnapshot,
  readWireSnapshot,
  SNAPSHOT_MISSING_MESSAGE,
  type RadarCategory,
  type SnapshotItem,
} from '../content/radar-snapshot';
import { serializeToParams as serializeRadarUrl } from '../../../src/utils/radar-url';
import { RadarCategoryEnum } from '../schemas';
import { HUB_BASE } from '../config';

const SearchRadarCacheInputSchema = z.object({
  category: RadarCategoryEnum.optional().describe(
    'Optional category filter. One of "pe-ma" / "enterprise-tech" / "ai-automation" / "security". Omit for all categories. Mirrors the /hub/radar website\'s category filter pills (the only filter the website surfaces).'
  ),
});

type SearchRadarCacheInput = z.infer<typeof SearchRadarCacheInputSchema>;

const TOOL_DESCRIPTION = `Search the locally-cached GST Radar snapshot — strict mirror of the website's /hub/radar page.

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
function buildRadarDeeplink(input: SearchRadarCacheInput): string {
  const params = serializeRadarUrl({ category: input.category ?? null });
  const queryString = params.toString();
  return queryString ? `${HUB_BASE}/hub/radar?${queryString}` : `${HUB_BASE}/hub/radar`;
}

/**
 * Handler for the search_radar_cache MCP tool.
 *
 * Exported so integration tests can exercise the full wrapper pipeline
 * (input parsing + snapshot read + filter + sort + deeplink emission)
 * without going through the MCP transport. The MCP registration below
 * wraps this same handler.
 */
export async function handleRadarCacheTool(input: SearchRadarCacheInput) {
  const fyi = readFyiSnapshot();
  const wire = readWireSnapshot();
  if (!fyi && !wire) {
    return {
      content: [{ type: 'text' as const, text: SNAPSHOT_MISSING_MESSAGE }],
      isError: true,
    };
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
    snapshotInfo: {
      fyiLastSeededAt: fyi?.lastSeededAt ?? null,
      wireLastSeededAt: wire?.lastSeededAt ?? null,
    },
    deeplink,
  };
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload as unknown as Record<string, unknown>,
  };
}

export function registerRadarCacheTool(server: McpServer): void {
  server.registerTool(
    'search_radar_cache',
    {
      title: 'Search Radar Cache (snapshot)',
      description: TOOL_DESCRIPTION,
      inputSchema: SearchRadarCacheInputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    handleRadarCacheTool
  );
}

// Re-export schema for downstream test imports.
export { SearchRadarCacheInputSchema };
