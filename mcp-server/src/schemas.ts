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

/** Radar feed categories — matches the four GST-prefixed Inoreader folders. */
export const RadarCategoryEnum = z.enum(
  RADAR_CATEGORIES as unknown as [RadarCategory, ...RadarCategory[]]
);
export type RadarCategoryValue = z.infer<typeof RadarCategoryEnum>;

/** Radar tier — FYI (annotated) vs Wire (raw). */
export const RadarTierEnum = z.enum(['fyi', 'wire']);
export type RadarTierValue = z.infer<typeof RadarTierEnum>;

// ─── MCP tool input schemas ──────────────────────────────────────────────

/** Input for the `search_portfolio` tool. */
export const SearchPortfolioInputSchema = z.object({
  search: z.string().optional(),
  theme: z.string().default('all'),
  engagement: z.string().default('all'),
  limit: z.number().int().positive().max(61).default(20),
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
