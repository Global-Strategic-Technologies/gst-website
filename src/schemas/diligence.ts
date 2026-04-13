import { z } from 'zod';

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

// ─── Inferred types ──────────────────────────────────────────────────────────

export type WizardOption = z.infer<typeof WizardOptionSchema>;
export type WizardField = z.infer<typeof WizardFieldSchema>;
export type WizardStep = z.infer<typeof WizardStepSchema>;
export type QuestionCondition = z.infer<typeof QuestionConditionSchema>;
export type DiligenceQuestion = z.infer<typeof DiligenceQuestionSchema>;
export type AttentionArea = z.infer<typeof AttentionAreaSchema>;
