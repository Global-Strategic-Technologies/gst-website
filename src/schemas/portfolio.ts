import { z } from 'zod';

/**
 * Zod schemas for the M&A portfolio data source.
 *
 * These schemas are the single source of truth for portfolio data shape.
 * TypeScript types are inferred via `z.infer<>` and re-exported from
 * `src/types/portfolio.ts` so existing import paths stay stable.
 */

/** Supported currency codes for project ARR values. */
export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD'] as const;
export const CurrencySchema = z.enum(SUPPORTED_CURRENCIES);

/** The 6 canonical growth stages. Enforced strictly — no string escape hatch. */
export const GROWTH_STAGE_VALUES = [
  'Early-Stage Growth',
  'Scaling Growth',
  'Expansion Stage',
  'Established Market Leader',
  'Mature Enterprise',
  'Legacy System',
] as const;
export const GrowthStageSchema = z.enum(GROWTH_STAGE_VALUES);

/** Engagement type values. */
export const ENGAGEMENT_TYPE_VALUES = [
  'Value Creation',
  'Technical Assessment',
  'Technical Diligence',
] as const;
export const EngagementTypeSchema = z.enum(ENGAGEMENT_TYPE_VALUES);

/** Columns that projects can be sorted by. */
export const SORTABLE_COLUMNS = ['codeName', 'theme', 'arr', 'growthStage', 'year'] as const;
export const SortableColumnSchema = z.enum(SORTABLE_COLUMNS);

/** Sort direction. */
export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export const SortDirectionSchema = z.enum(SORT_DIRECTIONS);

/** A single portfolio project. */
export const ProjectSchema = z.object({
  id: z.string().min(1),
  codeName: z.string().min(1),
  industry: z.string().min(1),
  theme: z.string().min(1),
  summary: z.string().min(1),
  arr: z.string().min(1), // Display format (e.g., "$220,000,000")
  arrNumeric: z.number().nonnegative(), // For sorting/calculations
  currency: CurrencySchema,
  growthStage: GrowthStageSchema,
  year: z.number().int().min(1900).max(2100),
  technologies: z.array(z.string()).readonly(),
  engagementType: EngagementTypeSchema.optional(),
  engagementTypeTag: z.string().optional(),
  engagementTypeDescription: z.string().optional(),
  // challenge and solution use .nullish() because existing records use
  // `null` to mean "field intentionally empty" (10 of 57 projects today).
  challenge: z.string().nullish(),
  solution: z.string().nullish(),
});

/** Array of projects — the shape of `src/data/ma-portfolio/projects.json`. */
export const ProjectsArraySchema = z.array(ProjectSchema);

// Inferred TypeScript types (single source of truth).
export type Currency = z.infer<typeof CurrencySchema>;
export type GrowthStage = z.infer<typeof GrowthStageSchema>;
export type EngagementType = z.infer<typeof EngagementTypeSchema>;
export type SortableColumn = z.infer<typeof SortableColumnSchema>;
export type SortDirection = z.infer<typeof SortDirectionSchema>;
export type Project = z.infer<typeof ProjectSchema>;
