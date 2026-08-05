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

/** Engagement category values (Buy-Side, Sell-Side, Value Creation). */
export const ENGAGEMENT_CATEGORY_VALUES = ['Buy-Side', 'Sell-Side'] as const;
export const EngagementCategorySchema = z.enum(ENGAGEMENT_CATEGORY_VALUES);

/** Columns that projects can be sorted by. */
export const SORTABLE_COLUMNS = ['codeName', 'theme', 'arr', 'growthStage', 'year'] as const;
export const SortableColumnSchema = z.enum(SORTABLE_COLUMNS);

/** Sort direction. */
export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export const SortDirectionSchema = z.enum(SORT_DIRECTIONS);

/** A single portfolio project. */
export const ProjectSchema = z.object({
  id: z.string().min(1).describe('Stable project identifier (slug-style).'),
  codeName: z.string().min(1).describe('Anonymised engagement code name.'),
  industry: z.string().min(1).describe('Free-text industry label (e.g., "Healthcare", "Fintech").'),
  theme: z
    .string()
    .min(1)
    .describe(
      'High-level theme (e.g., "Healthcare", "Finance"). One of the values surfaced by the website\'s Theme filter chips.'
    ),
  summary: z.string().min(1).describe('One-line plain-text engagement summary.'),
  arr: z.string().min(1).describe('Display-format ARR string (e.g., "$220,000,000").'),
  arrNumeric: z
    .number()
    .nonnegative()
    .describe('Numeric ARR in source currency for sort/aggregate.'),
  currency: CurrencySchema.describe(
    'ISO currency code for `arrNumeric` (USD | EUR | GBP | JPY | AUD).'
  ),
  growthStage: GrowthStageSchema.describe(
    'Canonical growth-stage label (Early-Stage Growth | Scaling Growth | Expansion Stage | Established Market Leader | Mature Enterprise | Legacy System).'
  ),
  year: z.number().int().min(1900).max(2100).describe('Engagement year (4-digit).'),
  technologies: z
    .array(z.string())
    .readonly()
    .describe('Technology / platform tags surfaced in card and used by free-text search.'),
  engagementType: EngagementTypeSchema.optional().describe(
    'Granular engagement type (Value Creation | Technical Assessment | Technical Diligence). Optional.'
  ),
  // challenge and solution use .nullish() because existing records use
  // `null` to mean "field intentionally empty" (a minority of records).
  challenge: z.string().nullish().describe('Optional engagement challenge narrative.'),
  solution: z.string().nullish().describe('Optional engagement solution narrative.'),
  engagementCategory: EngagementCategorySchema.optional().describe(
    "Coarse engagement category (Buy-Side | Sell-Side). Optional. Surfaced as the website's Engagement filter chips."
  ),
});

/** Array of projects — the shape of `src/data/ma-portfolio/projects.json`. */
export const ProjectsArraySchema = z.array(ProjectSchema);

// Inferred TypeScript types (single source of truth).
export type Currency = z.infer<typeof CurrencySchema>;
export type GrowthStage = z.infer<typeof GrowthStageSchema>;
export type EngagementType = z.infer<typeof EngagementTypeSchema>;
export type EngagementCategory = z.infer<typeof EngagementCategorySchema>;
export type SortableColumn = z.infer<typeof SortableColumnSchema>;
export type SortDirection = z.infer<typeof SortDirectionSchema>;
export type Project = z.infer<typeof ProjectSchema>;
