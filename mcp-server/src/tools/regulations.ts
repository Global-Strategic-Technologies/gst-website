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

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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

Each match includes:
- \`uri\` (e.g. \`gst://regulations/eu/gdpr\`) — canonical resource URI
- Summary card: \`id\`, \`name\`, \`jurisdiction\`, \`category\`, \`effectiveDate\`, \`summary\`
- Richer source-data fields (when present in the underlying framework record): \`scope\` (a one-paragraph who/where applicability statement), \`keyRequirements\` (array of authored bullet-point obligations — use these directly in prose summaries to keep claims grounded), \`penalties\` (statutory penalty band)
- \`deeplink\` — URL to open the Regulatory Map filtered to that framework's region+category (for PDF / export / share via the website page)

The aggregate response includes a \`filterDeeplink\` reflecting the supplied filters when present. Use the URI with \`resources/read\` to fetch the full framework body.`;

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
  // Optional richer fields lifted from the underlying regulation file when
  // present. Exposed so prompts that build per-framework summaries (e.g.
  // gst_regulatory_exposure_brief) can ground their prose in source data
  // instead of falling back to the agent's training. Only the high-level
  // `summary` is guaranteed; the rest may be undefined for older or
  // smaller-scope frameworks.
  scope?: string;
  keyRequirements?: readonly string[];
  penalties?: string;
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

/**
 * Convert an MCP-side jurisdiction code (lowercase alpha-2 like 'us', or
 * lowercase subnational like 'us-ca') to the region key the page expects
 * in `?region=`. The page's regionMap uses ISO 3166-1 alpha-3 for countries
 * (`USA`, `GBR`, `CAN`, ...) and uppercase ISO 3166-2 for US states / CA
 * provinces (`US-CA`, `CA-QC`, ...). Aggregate jurisdictions (`eu`,
 * `global`) don't correspond to a single SVG path — they return null and
 * the caller drops the `region` param, leaving only the category filter.
 *
 * Without this normalization the page's URL-restoration silently fails
 * (selector `path[data-state-code="us-ca"]` doesn't match `US-CA`), which
 * is the V2 root cause behind "regulatory map links don't expand
 * regulations next to the map."
 */
export function jurisdictionToRegion(jurisdiction: string): string | null {
  if (!jurisdiction) return null;
  if (AGGREGATE_JURISDICTIONS.has(jurisdiction)) return null;
  if (SUBNATIONAL_RE.test(jurisdiction)) return jurisdiction.toUpperCase();
  if (COUNTRY_ALPHA2_RE.test(jurisdiction)) {
    return COUNTRY_ALPHA2_TO_ALPHA3[jurisdiction] ?? null;
  }
  return null;
}

const AGGREGATE_JURISDICTIONS: ReadonlySet<string> = new Set(['eu', 'global']);
const SUBNATIONAL_RE = /^[a-z]{2}-[a-z]{2}$/;
const COUNTRY_ALPHA2_RE = /^[a-z]{2}$/;

// ISO 3166-1 alpha-2 → alpha-3 for every country code that appears as a
// regulation jurisdiction in `src/data/regulatory-map/`. Kept inline (no
// external lib) because the set is small and stable; if a new regulation
// adds a previously-unseen country, this map gets one new entry plus a
// test row in `regulatory-map-deeplink.test.ts`.
const COUNTRY_ALPHA2_TO_ALPHA3: Readonly<Record<string, string>> = {
  ae: 'ARE',
  ar: 'ARG',
  au: 'AUS',
  bd: 'BGD',
  bh: 'BHR',
  br: 'BRA',
  ca: 'CAN',
  ch: 'CHE',
  cl: 'CHL',
  cn: 'CHN',
  co: 'COL',
  ec: 'ECU',
  eg: 'EGY',
  gb: 'GBR',
  gh: 'GHA',
  id: 'IDN',
  il: 'ISR',
  in: 'IND',
  jp: 'JPN',
  ke: 'KEN',
  kr: 'KOR',
  kz: 'KAZ',
  mx: 'MEX',
  my: 'MYS',
  ng: 'NGA',
  nz: 'NZL',
  pe: 'PER',
  ph: 'PHL',
  pk: 'PAK',
  qa: 'QAT',
  rs: 'SRB',
  rw: 'RWA',
  sa: 'SAU',
  sg: 'SGP',
  th: 'THA',
  tr: 'TUR',
  tz: 'TZA',
  ug: 'UGA',
  us: 'USA',
  uy: 'URY',
  uz: 'UZB',
  vn: 'VNM',
  za: 'ZAF',
};

export function toSearchResult(entry: RegulationEntry): SearchResult {
  const d = entry.data;
  return {
    uri: entry.uri,
    id: d.id,
    name: d.name,
    jurisdiction: entry.jurisdiction,
    category: d.category,
    effectiveDate: d.effectiveDate,
    summary: d.summary,
    ...(d.scope !== undefined ? { scope: d.scope } : {}),
    ...(d.keyRequirements !== undefined ? { keyRequirements: d.keyRequirements } : {}),
    ...(d.penalties !== undefined ? { penalties: d.penalties } : {}),
    deeplink: buildRegulatoryMapDeeplink({
      region: jurisdictionToRegion(entry.jurisdiction),
      filter: d.category,
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
              region: input.jurisdiction ? jurisdictionToRegion(input.jurisdiction) : null,
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
