/**
 * Schema re-exports for the MCP server.
 *
 * The website's Zod schemas under `src/schemas/` are the single source of
 * truth. We re-export them here (via relative imports — same workspace, no
 * package boundary) and add MCP-tool-specific input shapes layered on top.
 */

import { z } from 'zod';

import { CanonicalStageSchema } from '../../src/data/common/funding-stages';
import { CompanyStageSchema, ICGInputsSchema } from '../../src/schemas/icg';
import { StageSchema as TechParStageSchema, TechParInputsSchema } from '../../src/schemas/techpar';

// Re-export canonical funding-stage taxonomy + adapters (BL-031.87).
// The canonical layer is the public-API stability surface for stage-aware
// MCP tools; per-tool native enums translate via the Adapter modules.
export {
  CANONICAL_STAGES,
  CanonicalStageSchema,
  CANONICAL_STAGE_DESCRIPTIONS,
  type CanonicalStage,
} from '../../src/data/common/funding-stages';

export {
  ICG_STAGE_ADAPTER,
  TECHPAR_STAGE_ADAPTER,
  icgFromCanonical,
  icgToCanonical,
  techparFromCanonical,
  techparToCanonical,
  isCanonicalStage,
  resolveIcgStageInput,
  resolveTechparStageInput,
} from '../../src/data/common/stage-adapters';

// Re-export the diligence input schema and supporting tuples.
export { UserInputsSchema, type ValidatedUserInputs } from '../../src/schemas/diligence';

// Re-export portfolio schemas + the canonical category/theme/stage tuples.
export {
  ProjectSchema,
  ProjectsArraySchema,
  GrowthStageSchema,
  EngagementCategorySchema,
  EngagementTypeSchema,
  GROWTH_STAGE_VALUES,
  ENGAGEMENT_CATEGORY_VALUES,
  ENGAGEMENT_TYPE_VALUES,
  type Project,
  type GrowthStage,
  type EngagementCategory,
  type EngagementType,
} from '../../src/schemas/portfolio';

// Re-export ICG / TechPar / Tech Debt input schemas (BL-031.5).
export {
  ICGInputsSchema,
  CompanyStageSchema,
  COMPANY_STAGE_VALUES,
  type ICGInputs,
  type CompanyStage,
} from '../../src/schemas/icg';

export {
  TechParInputsSchema,
  ModeSchema,
  CapExViewSchema,
  StageSchema as TechParStageSchema,
  type TechParInputs,
  type Mode as TechParMode,
  type CapExView,
} from '../../src/schemas/techpar';

export {
  TechDebtInputsSchema,
  DeployFrequencySchema,
  DEPLOY_FREQUENCY_VALUES,
  type TechDebtInputs,
  type DeployFrequency,
} from '../../src/schemas/tech-debt';

export {
  RegulationSchema,
  RegulationCategorySchema,
  RegulationSearchInputSchema,
  RegulationFacetsInputSchema,
  type Regulation,
  type RegulationCategory,
  type RegulationSearchInput,
  type RegulationFacetsInput,
} from '../../src/schemas/regulatory-map';

// ─── Radar shared enums (also used by prompts/radar-brief-today.ts) ──────

import { RADAR_CATEGORIES, type RadarCategory } from './content/radar-snapshot';

/**
 * Radar feed categories — matches the four GST-prefixed Inoreader folders
 * AND the four filter pills on the /hub/radar page (BL-031.95 Phase 3
 * capability-mirror invariant).
 */
export const RadarCategoryEnum = z
  .enum(RADAR_CATEGORIES as unknown as [RadarCategory, ...RadarCategory[]])
  .describe(
    'Radar category. One of: pe-ma | enterprise-tech | ai-automation | security. Mirrors the four filter pills on the /hub/radar website page (the only filter the website surfaces; the cache itself has a 24h TTL so a `since` filter would be redundant against the website UX).'
  );
export type RadarCategoryValue = z.infer<typeof RadarCategoryEnum>;

// `RadarTierEnum` was removed under BL-031.95 Phase 3.A — the website's
// /hub/radar page renders a unified FYI+Wire feed via mergeFeed(), so no
// tool-level tier filter exists at the website surface. The MCP Resources
// (`gst://radar/fyi/latest` and `gst://radar/wire/latest`) remain
// directly addressable for prompts that need a tier-specific snapshot
// embedding.

// ─── MCP tool input schemas ──────────────────────────────────────────────

/**
 * Input for the `search_portfolio` tool.
 *
 * **Capability-mirror invariant (BL-031.95 Phase 4.A)**: the schema mirrors
 * the website's three filter controls on `/ma-portfolio` exactly — a free-
 * text `search` box, a single-select `theme` chip, and a single-select
 * `engagement` (engagementCategory) chip. Earlier versions accepted a
 * `limit` field that had no website counterpart (the page renders all 61
 * projects always; CSS hides filtered-out cards). `limit` was removed
 * under the capability-mirror invariant — see
 * `mcp-server/src/docs/portfolio/CONTRACT.md` for the rationale.
 */
export const SearchPortfolioInputSchema = z.object({
  search: z
    .string()
    .optional()
    .describe(
      'Free-text query, case-insensitive. Matches against codeName, industry, summary, and the technologies array. Mirrors the website search input on /ma-portfolio. Omit or pass empty string for no search filter.'
    ),
  theme: z
    .string()
    .default('all')
    .describe(
      'Theme filter; pass "all" (the default) to skip. One of the values listed under `themes` in `list_portfolio_facets`. Mirrors the website Theme chip row.'
    ),
  engagement: z
    .string()
    .default('all')
    .describe(
      'Engagement-category filter; pass "all" (the default) to skip. One of the values listed under `engagementCategories` in `list_portfolio_facets` (typically "Buy-Side" or "Sell-Side"). Mirrors the website Engagement chip row.'
    ),
});

export type SearchPortfolioInput = z.infer<typeof SearchPortfolioInputSchema>;

/** Input for the `list_portfolio_facets` tool — no parameters. */
export const ListPortfolioFacetsInputSchema = z.object({});
export type ListPortfolioFacetsInput = z.infer<typeof ListPortfolioFacetsInputSchema>;

// ─── MCP tool input schemas with canonical-stage backward-compat (BL-031.87)
//
// The wrapped ICG and TechPar tools accept either the canonical funding-
// stage taxonomy (preferred — see `CANONICAL_STAGES`) or the per-tool
// native enum (backward-compat). The wrapper translates canonical to
// native via the adapter resolvers (`resolveIcgStageInput` /
// `resolveTechparStageInput`) before invoking the engine.

const ICG_STAGE_DESCRIPTION =
  'Funding-stage cohort. Prefer canonical values (seed | series-a | series-b | series-c | pe | enterprise); ICG-native values (pre-series-b | series-bc | pe-backed | enterprise) are accepted for backward compatibility. ICG collapses canonical seed + series-a into pre-series-b and canonical series-b + series-c into series-bc — see contracts glossary in mcp-server/src/docs/contracts/README.md.';

const TECHPAR_STAGE_DESCRIPTION =
  'Funding-stage cohort. Prefer canonical values (seed | series-a | series-b | series-c | pe | enterprise); TechPar-native values (seed | series_a | series_bc | pe | enterprise) are accepted for backward compatibility. TechPar collapses canonical series-b + series-c into series_bc.';

/**
 * MCP-layer input schema for `assess_infrastructure_cost_governance`.
 * Wraps `ICGInputsSchema` and replaces `companyStage` with a union
 * accepting canonical or native values. Wrapper resolves to native
 * before invoking the ICG engine.
 */
export const ICGMcpInputsSchema = ICGInputsSchema.extend({
  companyStage: z
    .union([CanonicalStageSchema, CompanyStageSchema])
    .optional()
    .describe(ICG_STAGE_DESCRIPTION),
});
export type ICGMcpInputs = z.infer<typeof ICGMcpInputsSchema>;

/**
 * MCP-layer input schema for `compute_techpar`. Wraps
 * `TechParInputsSchema` and replaces `stage` with a union accepting
 * canonical or native values. Wrapper resolves to native before
 * invoking the TechPar engine.
 */
export const TechParMcpInputsSchema = TechParInputsSchema.extend({
  stage: z.union([CanonicalStageSchema, TechParStageSchema]).describe(TECHPAR_STAGE_DESCRIPTION),
});
export type TechParMcpInputs = z.infer<typeof TechParMcpInputsSchema>;
