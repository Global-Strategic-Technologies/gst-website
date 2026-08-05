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
import projectsRaw from '../../src/data/ma-portfolio/projects.json';
import { getUniqueThemes } from '../../src/utils/filterLogic';
import type { Project } from '../../src/schemas/portfolio';

/**
 * Live theme vocabulary, derived from the data (BL-108).
 *
 * Interpolated into the `search_portfolio` argument description below, which ships
 * in `tools/list` and is the ONLY portfolio vocabulary a cold LLM call can see
 * before its first tool call. The hand-written examples had rotted into fiction —
 * `"Healthcare Tech"`, `"Financial Services"` and `"Life Sciences"`, none of which
 * exist — and a real Claude Desktop session burned calls probing them by trial.
 *
 * Uses the SAME `getUniqueThemes` helper that backs `list_portfolio_facets`
 * (`src/utils/filterLogic.ts`), which `portfolio/CONTRACT.md` names as the source
 * of truth. That is what makes the description's "`list_portfolio_facets` returns
 * the same list at runtime" claim true by construction rather than by coincidence:
 * two independent derivations would drift silently the day `ProjectSchema.theme`
 * gained a transform. `filterLogic.ts` has no runtime imports, so reuse is free.
 *
 * Deliberately NOT `ProjectsArraySchema.parse`: a description string needs no
 * validation, and `tools/portfolio.ts` already parses this same JSON unconditionally
 * at isolate init (`registerPortfolioTools` is always registered, `server.ts`), so a
 * Zod pass here would merely duplicate that — a second full-dataset validation to
 * build a description string. Dataset/schema drift is caught by that existing parse
 * regardless. (Module init runs once per isolate, not once per importer, so the
 * twelve modules importing `schemas.ts` share one evaluation.)
 *
 * Why a cast at all: `Project` narrows four fields to string-literal unions via
 * `z.enum` — `currency`, `growthStage`, `engagementType`, `engagementCategory`
 * (`src/schemas/portfolio.ts`) — and TypeScript infers those as plain `string` from
 * a JSON import, so `const x: Project[] = projectsRaw` does not type-check. It is
 * NOT about optional-field presence: all records carry an identical key set.
 *
 * The cast is *unchecked* — a record losing `theme` would not be a compile error
 * here. That is covered at runtime by `ProjectsArraySchema.parse` in
 * `tools/portfolio.ts` and by the derived-vocabulary tests in
 * `tests/unit/portfolio.test.ts`.
 */
const PORTFOLIO_THEMES: readonly string[] = getUniqueThemes(projectsRaw as Project[]);

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
 * `limit` field that had no website counterpart (the page renders every
 * project always; CSS hides filtered-out cards). `limit` was removed
 * under the capability-mirror invariant — see
 * `mcp-server/src/docs/tools/portfolio/CONTRACT.md` for the rationale.
 */
// BL-064: array-batching union for theme + engagement. Mirrors the
// `StringOrStringArray` pattern in `src/schemas/regulatory-map.ts` so the
// model can pass multiple values in one call instead of fanning out N
// sequential calls. The handler narrows internally (per-element loop +
// dedup) before calling the shared scalar `filterProjects` utility so the
// website's portfolio page and `src/utils/portfolio-url.ts` are not
// affected by the widened MCP boundary.
const StringOrStringArray = z
  .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
  .transform((v) => (Array.isArray(v) ? v : [v]));

export const SearchPortfolioInputSchema = z.object({
  search: z
    .string()
    .optional()
    .describe(
      'Free-text query, case-insensitive. Matches against codeName, industry, summary, and the technologies array. Mirrors the website search input on /ma-portfolio. Omit or pass empty string for no search filter.'
    ),
  theme: StringOrStringArray.default(['all']).describe(
    `Theme filter. Accepts a single string OR an array of strings (BL-064 batching). Pass "all" (the default) — or omit — to skip filtering. Mirrors the website Theme chip row. **The complete set of valid values is:** ${PORTFOLIO_THEMES.map((t) => `"${t}"`).join(', ')}. Use them verbatim — anything else matches zero projects. \`list_portfolio_facets\` returns the same list at runtime. **Batched usage**: when IRL Section 01 + the target profile suggest multiple themes, pass them as an array — \`theme: ["Finance", "Software"]\` returns matches across both in a single call. Do NOT call \`search_portfolio\` once per theme.`
  ),
  engagement: StringOrStringArray.default(['all']).describe(
    'Engagement-category filter. Accepts a single string OR an array of strings (BL-064 batching). Pass "all" (the default) — or omit — to skip filtering. Each value must be one of the strings listed under `engagementCategories` in `list_portfolio_facets` (typically "Buy-Side" or "Sell-Side"). Mirrors the website Engagement chip row. **Natural-language mapping**: "GST advised on selling X" / "X was sold to Y" / "X exited to Y" → `Sell-Side`; "GST did diligence on X for an acquirer" / "X was acquired by Y" / "we bought X" / "we are evaluating acquiring X" → `Buy-Side`. When the user\'s phrasing is genuinely ambiguous about which side GST was on (e.g. "GST worked on the X transaction"), pass BOTH in a single call as `engagement: ["Buy-Side", "Sell-Side"]` and surface the split in synthesis — do NOT default to one side and do NOT run two separate calls.'
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
  'Funding-stage cohort. Prefer canonical values (seed | series-a | series-b | series-c | pe | enterprise); ICG-native values (pre-series-b | series-bc | pe-backed | enterprise) are accepted for backward compatibility. ICG collapses canonical seed + series-a into pre-series-b and canonical series-b + series-c into series-bc — see contracts glossary in mcp-server/src/docs/tools/README.md.';

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
