import { z } from 'zod';

/**
 * Zod schemas for Infrastructure Cost Governance (ICG) data sources.
 *
 * Single source of truth for the shape of files in
 * `src/data/infrastructure-cost-governance/`.
 *
 * The human-readable reference for the `assess_infrastructure_cost_governance`
 * MCP tool (per-field labels, valid values, downstream-effect summaries,
 * hidden-semantics callouts like the foundational-domain flag) lives at:
 *   `mcp-server/src/docs/icg/CONTRACT.md`
 */

// ─── domains.ts ──────────────────────────────────────────────────────────────

export const AnswerOptionSchema = z.object({
  score: z.number().int().min(0),
  label: z.string().min(1),
});

export const ICGQuestionSchema = z.object({
  id: z.string().min(1),
  domain: z.string().min(1),
  text: z.string().min(1),
  rationale: z.string().min(1),
});

export const DomainSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  questions: z.array(ICGQuestionSchema).min(1),
  weight: z.number().positive(),
  foundational: z.boolean(),
});

export const DomainsArraySchema = z.array(DomainSchema);
export const AnswerOptionsArraySchema = z.array(AnswerOptionSchema);

// ─── recommendations.ts ──────────────────────────────────────────────────────

export const ImpactSchema = z.enum(['high', 'medium', 'low']);
export const EffortSchema = z.enum(['quick-win', 'project', 'initiative']);

export const ICGRecommendationSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  impact: ImpactSchema,
  effort: EffortSchema,
  domain: z.string().min(1),
  triggerQuestionId: z.string().min(1),
  triggerThreshold: z.number().int().min(0),
});

export const ICGRecommendationsArraySchema = z.array(ICGRecommendationSchema);

// ─── Inferred types ──────────────────────────────────────────────────────────

export type AnswerOption = z.infer<typeof AnswerOptionSchema>;
export type ICGQuestion = z.infer<typeof ICGQuestionSchema>;
export type Domain = z.infer<typeof DomainSchema>;
export type ICGImpact = z.infer<typeof ImpactSchema>;
export type ICGEffort = z.infer<typeof EffortSchema>;
export type ICGRecommendation = z.infer<typeof ICGRecommendationSchema>;

// ─── MCP tool input ──────────────────────────────────────────────────────────
//
// Used by the `assess_infrastructure_cost_governance` MCP tool. Mirrors the
// engine's `ICGState` minus wizard-only fields (`currentStep`, `dismissed`,
// `expanded`). Answer values are 0–3 for the four maturity levels, or -1
// for "Not sure" (penalised).

export const COMPANY_STAGE_VALUES = [
  'pre-series-b',
  'series-bc',
  'pe-backed',
  'enterprise',
] as const;
export const CompanyStageSchema = z.enum(COMPANY_STAGE_VALUES);

export const ICGAnswerScoreSchema = z.number().int().min(-1).max(3);

export const ICGInputsSchema = z.object({
  answers: z.record(z.string().min(1), ICGAnswerScoreSchema),
  companyStage: CompanyStageSchema.optional(),
});

export type CompanyStage = z.infer<typeof CompanyStageSchema>;
export type ICGInputs = z.infer<typeof ICGInputsSchema>;
