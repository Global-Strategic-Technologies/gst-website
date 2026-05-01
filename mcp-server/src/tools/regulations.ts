/**
 * MCP tools: search_regulations + list_regulation_facets
 *
 * Companion to the `gst://regulations/<jurisdiction>/<framework-id>` Resources.
 * Search returns matching frameworks with their resolved Resource URI so the
 * model can call `resources/read` next, plus a `deeplink` per result that
 * opens the Regulatory Map filtered to that framework's region. The aggregate
 * response includes a `filterDeeplink` reflecting the user's `jurisdiction` /
 * `category` filters when supplied.
 */

import type { McpServer } from '@modelcontextprotocol/server';
import {
  RegulationSearchInputSchema,
  RegulationFacetsInputSchema,
  type RegulationSearchInput,
} from '../schemas';
import {
  REGULATION_ENTRIES,
  listJurisdictions,
  listCategories,
  type RegulationEntry,
} from '../content/regulation-loader';
import { encodeFilters } from '../../../src/utils/regulatory-map-url';
import { HUB_BASE } from '../config';

const REGULATORY_MAP_PATH = '/hub/tools/regulatory-map/';

const SEARCH_DESCRIPTION = `Search the GST Regulatory Map (120 frameworks across data privacy, AI governance, cybersecurity, and industry compliance).

Filters by \`jurisdiction\` (e.g. "eu", "us", "us-ca", "ca-qc"), \`category\` (one of "data-privacy", "ai-governance", "industry-compliance", "cybersecurity"), and free-text \`query\` (matches name, summary, and id). Returns up to \`limit\` matches (default 20, max 120).

Each match includes the resource \`uri\` (e.g. \`gst://regulations/eu/gdpr\`) plus a summary card (id, name, jurisdiction, category, effectiveDate, summary) and a \`deeplink\` that opens the Regulatory Map filtered to that framework's region (for PDF / export / share via the website page). The aggregate response includes a \`filterDeeplink\` reflecting the supplied filters when present. Use the URI with \`resources/read\` to fetch the full framework body.`;

const FACETS_DESCRIPTION = `List the distinct facet values present in the GST Regulatory Map dataset.

Returns deduplicated jurisdictions and categories — useful before composing a filtered \`search_regulations\` query, especially when an agent doesn't know which jurisdiction codes are valid (e.g. is it "uk" or "gbr"?).`;

interface SearchResult {
  uri: string;
  id: string;
  name: string;
  jurisdiction: string;
  category: string;
  effectiveDate: string;
  summary: string;
  deeplink: string;
}

function matchesQuery(entry: RegulationEntry, query: string): boolean {
  const q = query.toLowerCase();
  const d = entry.data;
  return (
    d.id.toLowerCase().includes(q) ||
    d.name.toLowerCase().includes(q) ||
    d.summary.toLowerCase().includes(q)
  );
}

function applyFilters(input: RegulationSearchInput): RegulationEntry[] {
  return REGULATION_ENTRIES.filter((entry) => {
    if (input.jurisdiction && entry.jurisdiction !== input.jurisdiction) return false;
    if (input.category && entry.data.category !== input.category) return false;
    if (input.query && !matchesQuery(entry, input.query)) return false;
    return true;
  });
}

export function buildRegulatoryMapDeeplink(filters: {
  region?: string | null;
  filter?: string | null;
}): string {
  const qs = encodeFilters(filters);
  return qs ? `${HUB_BASE}${REGULATORY_MAP_PATH}?${qs}` : `${HUB_BASE}${REGULATORY_MAP_PATH}`;
}

function toSearchResult(entry: RegulationEntry): SearchResult {
  return {
    uri: entry.uri,
    id: entry.data.id,
    name: entry.data.name,
    jurisdiction: entry.jurisdiction,
    category: entry.data.category,
    effectiveDate: entry.data.effectiveDate,
    summary: entry.data.summary,
    deeplink: buildRegulatoryMapDeeplink({
      region: entry.jurisdiction,
      filter: entry.data.category,
    }),
  };
}

export function registerRegulationsTool(server: McpServer): void {
  server.registerTool(
    'search_regulations',
    {
      title: 'Search Regulatory Map',
      description: SEARCH_DESCRIPTION,
      inputSchema: RegulationSearchInputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (input) => {
      const matched = applyFilters(input);
      const returned = matched.slice(0, input.limit);
      const filterDeeplink =
        input.jurisdiction || input.category
          ? buildRegulatoryMapDeeplink({
              region: input.jurisdiction ?? null,
              filter: input.category ?? null,
            })
          : undefined;
      const payload = {
        matches: returned.map(toSearchResult),
        totalMatched: matched.length,
        returned: returned.length,
        ...(filterDeeplink ? { filterDeeplink } : {}),
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload as unknown as Record<string, unknown>,
      };
    }
  );

  server.registerTool(
    'list_regulation_facets',
    {
      title: 'List Regulatory Map Facet Values',
      description: FACETS_DESCRIPTION,
      inputSchema: RegulationFacetsInputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async () => {
      const facets = {
        jurisdictions: listJurisdictions(),
        categories: listCategories(),
        totalFrameworks: REGULATION_ENTRIES.length,
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(facets, null, 2) }],
        structuredContent: facets as unknown as Record<string, unknown>,
      };
    }
  );
}
