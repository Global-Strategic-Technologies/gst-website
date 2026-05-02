import { z } from 'zod';

/**
 * Zod schemas for TechPar data sources.
 *
 * These schemas are the single source of truth for the shape of the
 * data files in `src/data/techpar/`. The TechPar engine
 * (`src/utils/techpar-engine.ts`) imports inferred types from this file.
 *
 * The human-readable reference for the `compute_techpar` MCP tool
 * (per-field semantics, mode/capexView interactions, zone classification
 * rules, R&D CapEx benchmark derivation) lives at:
 *   `mcp-server/src/docs/techpar/CONTRACT.md`
 */

// ─── Enums ───────────────────────────────────────────────────────────────────

export const STAGE_KEYS = ['seed', 'series_a', 'series_bc', 'pe', 'enterprise'] as const;
export const StageSchema = z.enum(STAGE_KEYS);

export const FRAME_KEYS = ['convergence', 'dollars'] as const;
export const FrameSchema = z.enum(FRAME_KEYS);

export const ZONE_KEYS = [
  'underinvest',
  'ahead',
  'healthy',
  'above',
  'elevated',
  'critical',
] as const;
export const ZoneSchema = z.enum(ZONE_KEYS);

export const INDUSTRY_KEYS = ['saas', 'fintech', 'marketplace', 'infra_hw', 'other'] as const;
export const IndustrySchema = z.enum(INDUSTRY_KEYS);

// ─── stages.ts ───────────────────────────────────────────────────────────────

const BenchmarkRangeSchema = z.tuple([z.number(), z.number()]);

export const StageConfigSchema = z.object({
  key: StageSchema,
  label: z.string().min(1),
  frame: FrameSchema,
  note: z.string().min(1),
  noteUnder: z.string().min(1).optional(),
  zones: z.object({
    underinvest: z.number(),
    lo: z.number(),
    hi: z.number(),
    above: z.number(),
    critical: z.number(),
  }),
  benchmarks: z.object({
    infraHosting: BenchmarkRangeSchema,
    infraPersonnel: BenchmarkRangeSchema,
    rdOpEx: BenchmarkRangeSchema,
    rdCapExOfRD: BenchmarkRangeSchema,
    total: BenchmarkRangeSchema,
  }),
});

/** Map of stage key → stage config. The shape of `STAGES` in stages.ts. */
export const StagesMapSchema = z.record(StageSchema, StageConfigSchema);

// ─── recommendations.ts ──────────────────────────────────────────────────────

/** Per-stage, per-zone array of recommendation strings. */
export const TechParRecommendationsSchema = z.record(
  StageSchema,
  z.record(ZoneSchema, z.array(z.string().min(1)))
);

// ─── signal-copy.ts ──────────────────────────────────────────────────────────

export const SignalCopySchema = z.object({
  headline: z.string().min(1),
  body: z.string().min(1),
});

export const SignalCopyMapSchema = z.record(StageSchema, z.record(ZoneSchema, SignalCopySchema));

// ─── industry-notes.ts ───────────────────────────────────────────────────────

export const IndustryNoteSchema = z.object({
  label: z.string().min(1),
  // `note` is empty string for the default `saas` entry, so allow empty.
  note: z.string(),
  disclaimer: z.string().min(1),
});

export const IndustryNotesMapSchema = z.record(IndustrySchema, IndustryNoteSchema);

// ─── Inferred types ──────────────────────────────────────────────────────────

export type Stage = z.infer<typeof StageSchema>;
export type Frame = z.infer<typeof FrameSchema>;
export type Zone = z.infer<typeof ZoneSchema>;
export type Industry = z.infer<typeof IndustrySchema>;
export type StageConfig = z.infer<typeof StageConfigSchema>;
export type SignalCopy = z.infer<typeof SignalCopySchema>;
export type IndustryNote = z.infer<typeof IndustryNoteSchema>;

// ─── MCP tool input ──────────────────────────────────────────────────────────
//
// Used by the `compute_techpar` MCP tool. Mirrors the engine's `TechParInputs`
// interface — kept in sync with `src/utils/techpar-engine.ts`.

export const MODE_VALUES = ['quick', 'deepdive'] as const;
export const ModeSchema = z.enum(MODE_VALUES);

export const CAPEX_VIEW_VALUES = ['cash', 'gaap'] as const;
export const CapExViewSchema = z.enum(CAPEX_VIEW_VALUES);

export const TechParInputsSchema = z.object({
  arr: z
    .number()
    .nonnegative()
    .describe(
      'Annual recurring revenue, in dollars. Drives every percentage-of-revenue calculation. Must be > 0 for the engine to return a non-null result.'
    ),
  stage: StageSchema.describe(
    'Funding-stage cohort. Selects the per-stage benchmark band from STAGES (per-stage zones, benchmarks, frame). The MCP wrapper additionally accepts canonical funding-stage values from BL-031.87 (seed | series-a | series-b | series-c | pe | enterprise) and translates locally.'
  ),
  mode: ModeSchema.describe(
    '`quick` uses the `rdOpEx` field directly. `deepdive` synthesizes R&D OpEx as `engCost + prodCost + toolingCost`, ignoring the raw `rdOpEx` value.'
  ),
  capexView: CapExViewSchema.describe(
    '`cash` includes `rdCapEx` in `total`. `gaap` excludes it (matches GAAP-style accounting view). Affects `total`, `totalTechPct`, and the `zone` classification.'
  ),
  growthRate: z
    .number()
    .describe(
      'Annual revenue growth rate (%). Used in the 36-month projection (`computeGap` / `computeUnderGap`) to model revenue compounding monthly. Affects `gap.cumulative36` and `gap.underinvestGap`.'
    ),
  exitMultiple: z
    .number()
    .nonnegative()
    .describe(
      'Multiplier applied to `gap.cumulative36` to compute `gap.exitValue`. Convention: 12× as the SaaS default.'
    ),
  // BL-031.95: renamed from `infraHosting` (which stored monthly values
  // and the engine multiplied by 12) to make units explicit. All six money
  // fields now share annual units. Engine no longer multiplies; the website
  // page's monthly/annual UI toggle does the conversion at the input
  // boundary so the schema always sees annual.
  infraHostingAnnual: z
    .number()
    .nonnegative()
    .describe(
      'Annual infrastructure / cloud hosting cost (dollars). Must be > 0 for the engine to return a non-null result. BL-031.95: renamed from `infraHosting` (which stored monthly with internal × 12); now all six money fields share annual units.'
    ),
  infraPersonnel: z.number().nonnegative().describe('Annual infra personnel cost (dollars).'),
  rdOpEx: z
    .number()
    .nonnegative()
    .describe(
      'Annual R&D OpEx (dollars). Used in `quick` mode; ignored in `deepdive` (which sums `engCost + prodCost + toolingCost`).'
    ),
  rdCapEx: z
    .number()
    .nonnegative()
    .describe(
      'Annual R&D CapEx (capitalized R&D, dollars). Included in `total` only when `capexView` is `cash`.'
    ),
  engFTE: z
    .number()
    .nonnegative()
    .describe(
      'Engineering full-time-equivalent count. Used to compute `revenuePerEngineer = arr / engFTE` (null if 0).'
    ),
  engCost: z
    .number()
    .nonnegative()
    .describe('Annual engineering personnel cost (dollars). Used only in `deepdive` mode.'),
  prodCost: z
    .number()
    .nonnegative()
    .describe('Annual product personnel cost (dollars). Used only in `deepdive` mode.'),
  toolingCost: z
    .number()
    .nonnegative()
    .describe('Annual tooling cost (dollars). Used only in `deepdive` mode.'),
});

export type Mode = z.infer<typeof ModeSchema>;
export type CapExView = z.infer<typeof CapExViewSchema>;
export type TechParInputs = z.infer<typeof TechParInputsSchema>;
