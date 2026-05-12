/**
 * M&A Portfolio — URL state serialisation.
 *
 * Filter-grid archetype mirroring Radar / Diligence / Regulatory Map
 * (BL-031.95 Phase 4.B): readable `?key=value` query parameters encode
 * each of the three filter controls on `/ma-portfolio`:
 *
 *   - `search` → free-text search input
 *   - `theme`  → Theme single-select chip
 *   - `eng`    → Engagement (engagementCategory) single-select chip
 *
 * The MCP `search_portfolio` tool (`mcp-server/src/tools/portfolio.ts`)
 * imports `serializeToParams` to build the `deeplink` field on its
 * response — the website page (`PortfolioHeader.astro`) imports
 * `deserializeFromParams` on init to hydrate the active filters from a
 * deeplink-arrival URL, and writes the URL on every filter / search
 * change so a copied URL deep-links to the same filtered view.
 *
 * **Capability-mirror invariant (Phase 4.A)**: this encoder accepts
 * exactly the three filters the `/ma-portfolio` website surfaces. The
 * MCP tool's input schema is the strict mirror; if a future website
 * filter ships, the encoder + decoder grow in lockstep with the
 * website surface.
 *
 * Schema validation lives at the engine boundary in
 * `src/schemas/portfolio.ts`; this module silently drops empty values
 * on decode (treating them as the "all" / no-filter sentinel).
 */

export interface PortfolioFilters {
  /** Free-text search query. Empty string is dropped. */
  search?: string;
  /** Theme value, or "all" / undefined to skip. */
  theme?: string;
  /** EngagementCategory value, or "all" / undefined to skip. */
  engagement?: string;
}

/**
 * Build the query-string portion (without a leading `?`) for the
 * supplied filter state. Empty / "all" / undefined values are omitted
 * so a freshly-loaded page (no active filters) yields an empty URL.
 */
export function serializeToParams(filters: PortfolioFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search && filters.search.length > 0) {
    params.set('search', filters.search);
  }
  if (filters.theme && filters.theme !== 'all' && filters.theme.length > 0) {
    params.set('theme', filters.theme);
  }
  if (filters.engagement && filters.engagement !== 'all' && filters.engagement.length > 0) {
    params.set('eng', filters.engagement);
  }
  return params;
}

/**
 * Parse URL search params into a partial filter state. Missing or empty
 * values are dropped; unknown filter values are passed through (the
 * website's chip-availability logic + `filterProjects` engine handle
 * unknown-but-shaped input gracefully — unmatched theme / engagement
 * yields zero results, same as typing a non-existent value into a chip).
 */
export function deserializeFromParams(params: URLSearchParams): PortfolioFilters {
  const out: PortfolioFilters = {};
  const search = params.get('search');
  if (search && search.length > 0) out.search = search;
  const theme = params.get('theme');
  if (theme && theme.length > 0) out.theme = theme;
  const engagement = params.get('eng');
  if (engagement && engagement.length > 0) out.engagement = engagement;
  return out;
}
