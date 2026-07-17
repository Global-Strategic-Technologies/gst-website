import { z } from 'zod';

/**
 * Canonical funding-stage taxonomy used across MCP tool wrappers.
 *
 * This taxonomy is the public-API stability surface for stage-aware
 * tools (ICG, TechPar). Per-tool native enums (`CompanyStage` in
 * `src/schemas/icg.ts`, `Stage` in `src/schemas/techpar.ts`) translate
 * to/from this canonical vocabulary at the MCP-wrapper boundary via
 * Adapter modules in `./stage-adapters.ts`.
 *
 * Pattern choice (Adapter, not Proxy/Bridge/full normalization),
 * boundary choice (MCP-wrapper, not engine/schema), and
 * lossy-direction policy (intentional information-shedding for
 * benchmark-dataset granularity) are documented in
 * `src/docs/adr/0001-stage-taxonomy-adapter.md`.
 */

export const CANONICAL_STAGES = [
  'seed',
  'series-a',
  'series-b',
  'series-c',
  'pe',
  'enterprise',
] as const;

export type CanonicalStage = (typeof CANONICAL_STAGES)[number];

export const CanonicalStageSchema = z.enum(CANONICAL_STAGES);

/**
 * Human-readable descriptions for each canonical stage. Sourced from
 * public funding-round conventions; deliberately not benchmark-specific
 * (the canonical layer documents the vocabulary; per-tool benchmark
 * thresholds live in each engine's data tables).
 */
export const CANONICAL_STAGE_DESCRIPTIONS: Record<CanonicalStage, string> = {
  seed: 'Pre-revenue or earliest paying customers; typically <$2M ARR',
  'series-a': 'Product-market fit established; institutional Series A round',
  'series-b': 'Scaling go-to-market; Series B round',
  'series-c': 'Late-stage growth; Series C round',
  pe: 'Private-equity-backed (post-venture; often profitable)',
  enterprise: 'Public, mature, or otherwise large-scale enterprise',
};
