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
import { RadarCategoryEnum, RadarTierEnum } from '../schemas';

const SearchRadarCacheInputSchema = z.object({
  query: z.string().optional(),
  category: RadarCategoryEnum.optional(),
  tier: RadarTierEnum.optional(),
  since: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/, 'Must be ISO date (YYYY-MM-DD or full ISO 8601)')
    .optional(),
  limit: z.number().int().positive().max(100).default(20),
});

type SearchRadarCacheInput = z.infer<typeof SearchRadarCacheInputSchema>;

const TOOL_DESCRIPTION = `Search the locally-cached GST Radar snapshot (FYI annotated items + Wire feed).

Reads from \`.cache/inoreader/\` populated by \`npm run radar:seed\`. Never makes live Inoreader API calls — protects the shared 200 req/day budget.

Filters by free-text \`query\` (matches title and source), \`category\` (one of "pe-ma", "enterprise-tech", "ai-automation", "security"), \`tier\` ("fyi" or "wire" — defaults to both), and \`since\` (ISO date). Returns up to \`limit\` matches (default 20, max 100).

If the snapshot is missing, returns a structured error with instructions. Companion to the gst://radar/... Resources.`;

function tierMatches(
  item: SnapshotItem & { tier: 'fyi' | 'wire' },
  filter?: 'fyi' | 'wire'
): boolean {
  return !filter || item.tier === filter;
}

function categoryMatches(item: SnapshotItem, filter?: RadarCategory): boolean {
  return !filter || item.category === filter;
}

function queryMatches(item: SnapshotItem, query?: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return item.title.toLowerCase().includes(q) || item.source.toLowerCase().includes(q);
}

function sinceMatches(item: SnapshotItem, since?: string): boolean {
  if (!since) return true;
  return item.publishedAt >= since;
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
    async (input: SearchRadarCacheInput) => {
      const fyi = readFyiSnapshot();
      const wire = readWireSnapshot();
      if (!fyi && !wire) {
        return {
          content: [{ type: 'text', text: SNAPSHOT_MISSING_MESSAGE }],
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
        .filter((item) => tierMatches(item, input.tier))
        .filter((item) => categoryMatches(item, input.category))
        .filter((item) => queryMatches(item, input.query))
        .filter((item) => sinceMatches(item, input.since))
        .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));

      const returned = matched.slice(0, input.limit);
      const payload = {
        matches: returned,
        totalMatched: matched.length,
        returned: returned.length,
        snapshotInfo: {
          fyiLastSeededAt: fyi?.lastSeededAt ?? null,
          wireLastSeededAt: wire?.lastSeededAt ?? null,
        },
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload as unknown as Record<string, unknown>,
      };
    }
  );
}

// Re-export schema for downstream test imports.
export { SearchRadarCacheInputSchema };
