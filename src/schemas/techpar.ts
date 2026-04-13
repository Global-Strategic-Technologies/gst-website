import { z } from 'zod';

/**
 * Zod schemas for TechPar data sources.
 *
 * These schemas are the single source of truth for the shape of the
 * data files in `src/data/techpar/`. The TechPar engine
 * (`src/utils/techpar-engine.ts`) imports inferred types from this file.
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
