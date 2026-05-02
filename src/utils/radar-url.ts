/**
 * Radar — URL state serialisation.
 *
 * Filter-grid archetype mirroring Regulatory Map's convention (BL-031.95
 * Phase 3.B): a single readable `?category=<X>` query parameter encodes
 * the website's only filter (the category pill on `/hub/radar`).
 *
 * The MCP `search_radar_cache` tool (`mcp-server/src/tools/radar-cache.ts`)
 * imports `serializeToParams` to build the `deeplink` field on its
 * response — the website page imports `decodeParams` on init to hydrate
 * the active category pill from a deeplink-arrival URL.
 *
 * **Capability-mirror invariant (Phase 3.A)**: this encoder accepts only
 * `category` because that is the only filter the `/hub/radar` website
 * surfaces. The MCP tool's input schema is the strict mirror; the cache
 * itself has a 24h TTL so a `since`-style filter has no website
 * counterpart to deep-link into. If a future website filter ships, the
 * encoder + decoder grow in lockstep with the website surface.
 */

const RADAR_CATEGORIES = ['pe-ma', 'enterprise-tech', 'ai-automation', 'security'] as const;
type RadarCategory = (typeof RADAR_CATEGORIES)[number];

const CATEGORY_SET: ReadonlySet<string> = new Set(RADAR_CATEGORIES);

export interface RadarFilters {
  /** One of the four canonical categories, or null for "all". */
  category?: RadarCategory | null;
}

/**
 * Build the query-string portion (without a leading `?`) for the
 * supplied filter state. Returns an empty string when no category is
 * active (so the all-categories view yields a clean URL).
 */
export function serializeToParams(filters: RadarFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.category && CATEGORY_SET.has(filters.category)) {
    params.set('category', filters.category);
  }
  return params;
}

/**
 * Parse a search-string (with or without a leading `?`) into validated
 * filter state. Unknown / empty `category` values are silently dropped
 * (treated as "all categories").
 */
export function deserializeFromParams(params: URLSearchParams): RadarFilters {
  const raw = params.get('category');
  return {
    category: raw && CATEGORY_SET.has(raw) ? (raw as RadarCategory) : null,
  };
}
