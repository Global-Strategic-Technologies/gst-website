/**
 * Regulatory Map — URL state serialisation
 *
 * Encodes/decodes the page's filter state to/from a search-string query.
 * Two filterable dimensions, both readable params (no base64):
 *   - `region` — region/jurisdiction id (no whitelist; the page validates against
 *     its own region list at apply-time)
 *   - `filter` — category, one of VALID_CATEGORIES; unrecognized values are
 *     dropped on decode (treated as "no filter")
 *
 * Imported by both the website page (`src/pages/hub/tools/regulatory-map/index.astro`)
 * and the MCP tool wrapper (`mcp-server/src/tools/regulations.ts`) so the
 * encoder is a single source of truth.
 */

export const VALID_CATEGORIES = [
  'data-privacy',
  'ai-governance',
  'industry-compliance',
  'cybersecurity',
] as const;

export type RegulatoryMapCategory = (typeof VALID_CATEGORIES)[number];

const VALID_CATEGORY_SET: ReadonlySet<string> = new Set(VALID_CATEGORIES);

export interface RegulatoryMapFilters {
  region?: string | null;
  filter?: string | null;
}

/**
 * Build the query-string portion (without a leading `?`) for the supplied
 * filter state. Returns an empty string when no filters are active.
 */
export function encodeFilters({ region, filter }: RegulatoryMapFilters): string {
  const params = new URLSearchParams();
  if (region) params.set('region', region);
  if (filter && filter !== 'all' && VALID_CATEGORY_SET.has(filter)) {
    params.set('filter', filter);
  }
  return params.toString();
}

/**
 * Parse a search-string (with or without leading `?`) into validated
 * filter state. Unknown filter values are silently dropped.
 */
export function decodeFilters(search: string): {
  region: string | null;
  filter: RegulatoryMapCategory | null;
} {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const filter = params.get('filter');
  return {
    region: params.get('region'),
    filter: filter && VALID_CATEGORY_SET.has(filter) ? (filter as RegulatoryMapCategory) : null,
  };
}
