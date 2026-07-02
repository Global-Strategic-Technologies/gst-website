/**
 * Diligence engine input schemas (Zod).
 *
 * Validation surface only — no `.describe()` calls. The human-readable
 * reference (per-field labels, valid-value descriptions, downstream-effect
 * summaries, hidden-semantics callouts) lives at:
 *   `mcp-server/src/docs/tools/diligence/CONTRACT.md`
 *
 * The wizard-config at `src/data/diligence-machine/wizard-config.ts` is the
 * source of user-facing labels; the contract doc cites both files.
 */
import { z } from 'zod';

import {
  TRANSACTION_TYPE_IDS,
  PRODUCT_TYPE_IDS,
  TECH_ARCHETYPE_IDS,
  HEADCOUNT_IDS,
  REVENUE_RANGE_IDS,
  GROWTH_STAGE_IDS,
  COMPANY_AGE_IDS,
  GEOGRAPHY_IDS,
  BUSINESS_MODEL_IDS,
  SCALE_INTENSITY_IDS,
  TRANSFORMATION_STATE_IDS,
  DATA_SENSITIVITY_IDS,
  OPERATING_MODEL_IDS,
} from '../data/diligence-machine/wizard-config';

/**
 * Zod schemas for Diligence Machine data sources.
 *
 * Single source of truth for the shape of files in
 * `src/data/diligence-machine/`.
 */

// ─── wizard-config.ts ────────────────────────────────────────────────────────

export const WizardOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1).optional(),
});

export const WizardFieldSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  inputType: z.literal('select'),
  options: z.array(WizardOptionSchema).min(1),
});

export const WizardInputTypeSchema = z.enum(['single-select', 'multi-select', 'compound']);

export const WizardStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  navLabel: z.string().min(1),
  subtitle: z.string().min(1),
  inputType: WizardInputTypeSchema,
  options: z.array(WizardOptionSchema).optional(),
  fields: z.array(WizardFieldSchema).optional(),
});

export const WizardStepsArraySchema = z.array(WizardStepSchema);

// ─── questions.ts ────────────────────────────────────────────────────────────

export const QuestionConditionSchema = z.object({
  transactionTypes: z.array(z.string()).optional(),
  productTypes: z.array(z.string()).optional(),
  techArchetypes: z.array(z.string()).optional(),
  growthStages: z.array(z.string()).optional(),
  geographies: z.array(z.string()).optional(),
  headcountMin: z.string().optional(),
  revenueMin: z.string().optional(),
  companyAgeMin: z.string().optional(),
  excludeTransactionTypes: z.array(z.string()).optional(),
  // v2 condition dimensions
  businessModels: z.array(z.string()).optional(),
  scaleIntensity: z.array(z.string()).optional(),
  transformationStates: z.array(z.string()).optional(),
  dataSensitivity: z.array(z.string()).optional(),
  operatingModels: z.array(z.string()).optional(),
});

export const QuestionTopicSchema = z.enum([
  'architecture',
  'operations',
  'carveout-integration',
  'security-risk',
]);

export const QuestionPrioritySchema = z.enum(['high', 'medium', 'standard']);

export const ExitImpactSchema = z.enum(['Multiple Expander', 'Valuation Drag', 'Operational Risk']);

export const TrackSchema = z.enum(['Architecture', 'Operations', 'Carve-out', 'Security']);

export const DiligenceQuestionSchema = z.object({
  id: z.string().min(1),
  topic: QuestionTopicSchema,
  topicLabel: z.string().min(1),
  audienceLevel: z.string().min(1),
  text: z.string().min(1),
  rationale: z.string().min(1),
  priority: QuestionPrioritySchema,
  conditions: QuestionConditionSchema,
  exitImpact: ExitImpactSchema.optional(),
  lookoutSignal: z.string().optional(),
  track: TrackSchema.optional(),
});

export const DiligenceQuestionsArraySchema = z.array(DiligenceQuestionSchema);

// ─── attention-areas.ts ──────────────────────────────────────────────────────

export const AttentionRelevanceSchema = z.enum(['high', 'medium', 'low']);

export const AttentionAreaSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  relevance: AttentionRelevanceSchema,
  conditions: QuestionConditionSchema,
});

export const AttentionAreasArraySchema = z.array(AttentionAreaSchema);

// ─── User inputs (consumed by The Diligence Machine wizard + MCP tool) ──────

/**
 * The 'unknown' sentinel — BL-031.95 Phase 2 mirror of ICG's `-1`
 * ("Not sure") pattern. Every UserInputs enum accepts this value in
 * addition to its canonical `*_IDS` set; the diligence engine's
 * `matchesConditions` treats `'unknown'` as a non-eliminating value
 * (only known values filter questions out — agenda widens conservatively
 * when input is incomplete). The wizard renders 'unknown' as an "I don't
 * know" affordance per step, NOT as an entry in each step's option grid;
 * keeping it out of the `*_IDS` tuples preserves the wizard-config /
 * schema subset invariant.
 */
export const UNKNOWN_INPUT = 'unknown' as const;

/**
 * Helper: extend a canonical `*_IDS` tuple with the `'unknown'` sentinel.
 * Returns a new readonly tuple suitable for `z.enum(...)`.
 */
function withUnknown<T extends readonly [string, ...string[]]>(
  ids: T
): readonly [...T, typeof UNKNOWN_INPUT] {
  return [...ids, UNKNOWN_INPUT] as readonly [...T, typeof UNKNOWN_INPUT];
}

/**
 * Runtime-validated shape of the wizard's submitted answers.
 *
 * Every enum is bound to the `*_IDS` tuple in
 * `src/data/diligence-machine/wizard-config.ts` PLUS the `'unknown'`
 * sentinel (see `UNKNOWN_INPUT` above). Adding a new option to the
 * wizard without updating the schema (or vice versa) trips the
 * `diligence-wizard-schema.test.ts` subset invariant.
 *
 * `.describe()` text on every field surfaces in the JSON Schema that
 * MCP clients (Claude Desktop, Cursor) introspect — sourced from
 * `mcp-server/src/docs/tools/diligence/CONTRACT.md` per-field detail.
 */
const UNKNOWN_DESC =
  " Pass `'unknown'` (BL-031.95 Phase 2 sentinel) when the agent cannot derive this from supplied context — the engine treats `'unknown'` as a non-eliminating value, widening the agenda conservatively rather than guessing.";

export const UserInputsSchema = z.object({
  transactionType: z
    .enum(withUnknown(TRANSACTION_TYPE_IDS))
    .describe(
      'Type of M&A or investment transaction being evaluated. Gates carve-out / integration questions; specific values trigger different separation-readiness probes.' +
        UNKNOWN_DESC
    ),
  productType: z
    .enum(withUnknown(PRODUCT_TYPE_IDS))
    .describe(
      'What the target company builds or delivers. Drives product-shape architecture questions; e.g., `b2b-saas` triggers tenancy and SLA-retention probes.' +
        UNKNOWN_DESC
    ),
  techArchetype: z
    .enum(withUnknown(TECH_ARCHETYPE_IDS))
    .describe(
      'How the target provisions technology infrastructure. The largest fan-out lever in the engine — modern-cloud-native vs hybrid-legacy vs self-managed surface very different operational and cost questions.' +
        UNKNOWN_DESC
    ),
  headcount: z
    .enum(withUnknown(HEADCOUNT_IDS))
    .describe(
      'Engineering headcount bracket (ordinal: `1-50` < `51-200` < `201-500` < `500+`). Used as a minimum threshold via `meetsMinimumBracket` — questions with `headcountMin: "51-200"` surface for any user input from `51-200` upward.' +
        UNKNOWN_DESC
    ),
  revenueRange: z
    .enum(withUnknown(REVENUE_RANGE_IDS))
    .describe(
      'ARR bracket (ordinal: `0-5m` < `5-25m` < `25-100m` < `100m+`). Used as a minimum threshold; `revenueMin: "5-25m"` and above surface DR/RPO/RTO questions and the Sensitive Data Breach Liability attention area.' +
        UNKNOWN_DESC
    ),
  growthStage: z
    .enum(withUnknown(GROWTH_STAGE_IDS))
    .describe(
      'Company maturity coarse bucketing (`early` / `scaling` / `mature`). Distinct from BL-031.87 funding-stage canonical taxonomy — `growthStage` captures velocity, not funding-cohort. Combines with other inputs to gate stage-specific questions.' +
        UNKNOWN_DESC
    ),
  companyAge: z
    .enum(withUnknown(COMPANY_AGE_IDS))
    .describe(
      'Company age bracket (ordinal: `under-2yr` < `2-5yr` < `5-10yr` < `10-20yr` < `20yr+`). At `5-10yr` and above, technical-debt quantification questions surface; `20yr+` adds legacy-system replatforming probes.' +
        UNKNOWN_DESC
    ),
  geographies: z
    .array(z.enum(withUnknown(GEOGRAPHY_IDS)))
    .min(1)
    .describe(
      "Multi-select array of operating regions (≥ 1 element). Selecting 2+ specific regions auto-syncs `multi-region` via `syncMultiRegion()`. EU triggers GDPR + EU AI Act questions; Canada triggers PIPEDA + Quebec Law 25 attention area. Pass `['unknown']` (still satisfies .min(1)) when geographies are not derivable; the engine treats `['unknown']` exactly like a single-value `'unknown'` (widens triggers)."
    ),
  businessModel: z
    .enum(withUnknown(BUSINESS_MODEL_IDS))
    .describe(
      'Primary delivery and monetization model. Drives operational and unit-economics questions; interacts with `scaleIntensity` and `productType` to surface the right operational-leverage probes.' +
        UNKNOWN_DESC
    ),
  scaleIntensity: z
    .enum(withUnknown(SCALE_INTENSITY_IDS))
    .describe(
      'Operational scale and user-volume pressure (`low` / `moderate` / `high`). `high` intensity surfaces additional database-scaling and load-testing probes.' +
        UNKNOWN_DESC
    ),
  transformationState: z
    .enum(withUnknown(TRANSFORMATION_STATE_IDS))
    .describe(
      'Current state of technology modernization. Gates migration-risk and replatforming-state probes; `mid-migration` and `actively-modernizing` surface dual-system reconciliation questions.' +
        UNKNOWN_DESC
    ),
  dataSensitivity: z
    .enum(withUnknown(DATA_SENSITIVITY_IDS))
    .describe(
      'Sensitivity level of the data the target handles (`low` / `moderate` / `high`). When `high`, surfaces the data-classification framework question and elevates the Sensitive Data Breach Liability attention area (when paired with `revenueMin: 5-25m+`).' +
        UNKNOWN_DESC
    ),
  operatingModel: z
    .enum(withUnknown(OPERATING_MODEL_IDS))
    .describe(
      'How the engineering organization is structured. Drives org-structure questions about velocity, ownership, and key-person risk; `outsourced-heavy` surfaces vendor-dependency and IP-ownership probes.' +
        UNKNOWN_DESC
    ),
});

// ─── Inferred types ──────────────────────────────────────────────────────────

export type WizardOption = z.infer<typeof WizardOptionSchema>;
export type WizardField = z.infer<typeof WizardFieldSchema>;
export type WizardStep = z.infer<typeof WizardStepSchema>;
export type QuestionCondition = z.infer<typeof QuestionConditionSchema>;
export type DiligenceQuestion = z.infer<typeof DiligenceQuestionSchema>;
export type AttentionArea = z.infer<typeof AttentionAreaSchema>;

/**
 * Strict literal-union shape produced by `UserInputsSchema.parse()`.
 * Used at the MCP boundary; the engine itself uses the looser
 * `UserInputs` interface in `src/utils/diligence-engine.ts`.
 */
export type ValidatedUserInputs = z.infer<typeof UserInputsSchema>;
