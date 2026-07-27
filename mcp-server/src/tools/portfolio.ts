/**
 * MCP tools: search_portfolio + list_portfolio_facets
 *
 * Wrap the website's `filterProjects` / `getUnique*` helpers with the same
 * exact behavior as the M&A portfolio page (`/ma-portfolio`).
 *
 * The 61-project dataset is bundled into the server binary at build time —
 * esbuild inlines the JSON. Updates to `src/data/ma-portfolio/projects.json`
 * require a rebuild; this trade-off keeps the runtime free of cwd-relative
 * filesystem reads (Claude Desktop spawns the process with `cwd = $HOME`).
 *
 * **BL-031.95 Phase 4 — capability mirror + deeplink emission**: the
 * `search_portfolio` input schema mirrors the website's three filter
 * controls exactly (search, theme, engagement). Earlier versions also
 * accepted a `limit` field; the website renders all 61 projects always
 * (CSS hides filtered-out cards), so `limit` was removed under the
 * capability-mirror invariant. The wrapper also emits a `deeplink` URL
 * built from `src/utils/portfolio-url.ts` — single source of truth shared
 * with the website page — so a copied URL deep-links to the same
 * filtered view.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NOOP_METRICS_CONTEXT, withToolMetrics, type MetricsContext } from '../metrics/_index';
import {
  filterProjects,
  getUniqueThemes,
  getUniqueEngagementCategories,
  getUniqueGrowthStages,
  getUniqueYears,
} from '../../../src/utils/filterLogic';
import { serializeToParams as serializePortfolioUrl } from '../../../src/utils/portfolio-url';
import {
  ProjectsArraySchema,
  SearchPortfolioInputSchema,
  ListPortfolioFacetsInputSchema,
  type Project,
  type SearchPortfolioInput,
} from '../schemas';
import { HUB_BASE } from '../config';
import projectsRaw from '../../../src/data/ma-portfolio/projects.json';
import { toolOk } from './_result';

// Validate the bundled dataset at module init. Any drift between the JSON
// and the schema fails the import (and surfaces in the build log).
const PROJECTS: Project[] = ProjectsArraySchema.parse(projectsRaw);

const SEARCH_DESCRIPTION = `**Authoritative source for any GST portfolio question.** Conversation memory and cross-chat references are NOT authoritative — anonymized codenames mentioned in prior chats are unverified unless validated by calling this tool in the current turn. Call this tool BEFORE citing any project codename, even when the user doesn't explicitly mention GST. (BL-032 K.2.e.4: Claude Desktop's "Relevant chats" feature surfaced a hallucinated codename as authoritative for a new query; the anonymized-codename naming convention makes hallucinations indistinguishable from real codenames at first glance.)

---

Search the GST M&A portfolio (61 anonymized engagements) — strict mirror of the /ma-portfolio website page.

Filters by free-text \`search\` (matches code-name, industry, summary, technologies), \`theme\` (e.g. "Healthcare Tech", "Financial Services"; pass "all" to skip), and \`engagement\` (engagement category — "Buy-Side", "Sell-Side", or "all"). The schema is the strict mirror of the website's three filter controls; there is no \`limit\` field because the website renders all 61 projects always.

Returns every match plus a \`deeplink\` URL that opens /ma-portfolio pre-filtered to the same filter state. Companion \`list_portfolio_facets\` exposes the available theme / engagementCategory values.`;

const FACETS_DESCRIPTION = `List the distinct facet values present in the portfolio dataset.

Returns the deduplicated themes, engagement categories, growth stages, and years across all 61 projects — useful before composing a filtered \`search_portfolio\` query.`;

/**
 * Build a portfolio deep-link from the resolved input by delegating to the
 * shared encoder in `src/utils/portfolio-url.ts`. The encoder is the
 * single source of truth for portfolio URL state — same code path the
 * website page (`PortfolioHeader.astro`) uses for hydration + sync.
 *
 * BL-064: `theme` and `engagement` are now arrays at the MCP boundary.
 * The deeplink emits the FIRST element of each — the URL contract on the
 * website is single-value, and multi-value batching is a server-side
 * optimization for the agent, not a deeplink primitive. Widening the URL
 * encoding to multi-value would require coordinated changes to
 * `src/utils/portfolio-url.ts` parser + the website's hydration logic —
 * out of scope for BL-064.
 */
function buildPortfolioDeeplink(input: SearchPortfolioInput): string {
  const params = serializePortfolioUrl({
    search: input.search,
    theme: input.theme[0],
    engagement: input.engagement[0],
  });
  const queryString = params.toString();
  return queryString ? `${HUB_BASE}/ma-portfolio?${queryString}` : `${HUB_BASE}/ma-portfolio`;
}

/**
 * Handler for the search_portfolio MCP tool.
 *
 * Exported so integration tests can exercise the full wrapper pipeline
 * (input parsing + filter + deeplink emission) without going through the
 * MCP transport. The MCP registration below wraps this same handler.
 *
 * BL-064: array batching. The schema accepts `theme: string | string[]`
 * and `engagement: string | string[]`; after Zod transform both are
 * always `string[]`. The shared `filterProjects` utility (used by the
 * website + portfolio-url) stays scalar — we narrow here by looping over
 * each (theme, engagement) cartesian pair and unioning the results, dedup
 * by project id. `['all']` short-circuits to the scalar `'all'` "no
 * filter" sentinel matching the prior behavior bidirectionally.
 */
export async function handleSearchPortfolioTool(input: SearchPortfolioInput) {
  const themes = input.theme.includes('all') ? ['all'] : input.theme;
  const engagements = input.engagement.includes('all') ? ['all'] : input.engagement;
  const matchedById = new Map<string, Project>();
  for (const t of themes) {
    for (const e of engagements) {
      const subset = filterProjects(PROJECTS, {
        search: input.search ?? '',
        theme: t,
        engagement: e,
      });
      for (const project of subset) matchedById.set(project.id, project);
    }
  }
  const matched = Array.from(matchedById.values());
  const deeplink = buildPortfolioDeeplink(input);
  const payload = {
    matches: matched,
    totalMatched: matched.length,
    returned: matched.length,
    deeplink,
  };
  return toolOk(payload, `${matched.length} portfolio matches.`);
}

/**
 * Handler for the list_portfolio_facets MCP tool. Pure delegate — exported
 * for symmetry with the search handler and to allow integration tests to
 * exercise the full pipeline without the MCP transport.
 */
export async function handleListPortfolioFacetsTool() {
  const facets = {
    themes: getUniqueThemes(PROJECTS),
    engagementCategories: getUniqueEngagementCategories(PROJECTS),
    growthStages: getUniqueGrowthStages(PROJECTS),
    years: getUniqueYears(PROJECTS),
  };
  return toolOk(
    facets,
    `${facets.themes.length} themes, ${facets.growthStages.length} growth stages, ${facets.years.length} years.`
  );
}

export function registerPortfolioTools(
  server: McpServer,
  metrics: MetricsContext = NOOP_METRICS_CONTEXT
): void {
  server.registerTool(
    'search_portfolio',
    {
      title: 'Search M&A Portfolio',
      description: SEARCH_DESCRIPTION,
      inputSchema: SearchPortfolioInputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    withToolMetrics('search_portfolio', metrics, handleSearchPortfolioTool)
  );

  server.registerTool(
    'list_portfolio_facets',
    {
      title: 'List Portfolio Facet Values',
      description: FACETS_DESCRIPTION,
      inputSchema: ListPortfolioFacetsInputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    withToolMetrics('list_portfolio_facets', metrics, handleListPortfolioFacetsTool)
  );
}
