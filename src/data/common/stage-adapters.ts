import { type CompanyStage } from '../../schemas/icg';
import { type Stage as TechParStage } from '../../schemas/techpar';
import { CANONICAL_STAGES, type CanonicalStage } from './funding-stages';

/**
 * Adapter modules translating between the canonical funding-stage
 * taxonomy (see `./funding-stages.ts`) and each tool's tuned native
 * enum.
 *
 * Each adapter exposes:
 *
 * - `fromCanonical: Record<CanonicalStage, NativeStage>`
 *   Total function — every canonical value has a defined native target.
 *   This direction is always safe; never lossy.
 *
 * - `toCanonical: Record<NativeStage, readonly CanonicalStage[]>`
 *   Array-valued. Where a native enum collapses canonical values
 *   (e.g., TechPar `series_bc` covers canonical `series-b` and
 *   `series-c`), the array exposes the ambiguity honestly rather than
 *   picking one and silently losing information. Array order follows
 *   `CANONICAL_STAGES` order (lowest funding stage first).
 *
 * Information shedding is intentional: each tool's native enum is
 * coupled to its benchmark dataset, and the dataset doesn't always
 * separate adjacent canonical stages. Documenting the collapse
 * explicitly is preferred over inventing benchmark precision the data
 * doesn't support.
 *
 * Full pattern-choice and lossy-direction rationale:
 * `src/docs/development/MCP_SERVER_STAGE_ADAPTER_BL-031_87.md`.
 */

// ─── ICG adapter ─────────────────────────────────────────────────────────────
// ICG's `companyStage` enum has 4 values (no `seed` cohort — its benchmark
// dataset doesn't separate seed from Series A) and uses kebab-case
// throughout (`pre-series-b`, `series-bc`, `pe-backed`, `enterprise`).

export const ICG_STAGE_ADAPTER = {
  fromCanonical: {
    seed: 'pre-series-b',
    'series-a': 'pre-series-b',
    'series-b': 'series-bc',
    'series-c': 'series-bc',
    pe: 'pe-backed',
    enterprise: 'enterprise',
  } as const satisfies Record<CanonicalStage, CompanyStage>,

  toCanonical: {
    'pre-series-b': ['seed', 'series-a'],
    'series-bc': ['series-b', 'series-c'],
    'pe-backed': ['pe'],
    enterprise: ['enterprise'],
  } as const satisfies Record<CompanyStage, readonly CanonicalStage[]>,
} as const;

// ─── TechPar adapter ─────────────────────────────────────────────────────────
// TechPar's `stage` enum has 5 values (includes `seed`) and uses
// snake_case for `series_a` and `series_bc`. Like ICG, it collapses
// Series B and C into one cohort because the benchmark dataset doesn't
// separate them.

export const TECHPAR_STAGE_ADAPTER = {
  fromCanonical: {
    seed: 'seed',
    'series-a': 'series_a',
    'series-b': 'series_bc',
    'series-c': 'series_bc',
    pe: 'pe',
    enterprise: 'enterprise',
  } as const satisfies Record<CanonicalStage, TechParStage>,

  toCanonical: {
    seed: ['seed'],
    series_a: ['series-a'],
    series_bc: ['series-b', 'series-c'],
    pe: ['pe'],
    enterprise: ['enterprise'],
  } as const satisfies Record<TechParStage, readonly CanonicalStage[]>,
} as const;

// ─── Per-tool helpers ─────────────────────────────────────────────────────────
// Thin function wrappers around the records for clean call sites. Use
// the records directly when you want the type system to know exactly
// which keys exist; use the helpers when you have a runtime value of
// the appropriate native type.

export function icgFromCanonical(canonical: CanonicalStage): CompanyStage {
  return ICG_STAGE_ADAPTER.fromCanonical[canonical];
}

export function icgToCanonical(native: CompanyStage): readonly CanonicalStage[] {
  return ICG_STAGE_ADAPTER.toCanonical[native];
}

export function techparFromCanonical(canonical: CanonicalStage): TechParStage {
  return TECHPAR_STAGE_ADAPTER.fromCanonical[canonical];
}

export function techparToCanonical(native: TechParStage): readonly CanonicalStage[] {
  return TECHPAR_STAGE_ADAPTER.toCanonical[native];
}

// ─── MCP-wrapper-boundary resolvers ──────────────────────────────────────────
// These accept a runtime value that has been validated by Zod as either a
// canonical funding-stage or a tool-native stage, and return the native
// value the engine expects. Use at the MCP-wrapper boundary right after
// schema parsing, before invoking the engine.

export function isCanonicalStage(value: string): value is CanonicalStage {
  return (CANONICAL_STAGES as readonly string[]).includes(value);
}

/**
 * Resolve an ICG stage input (canonical or native) to the native
 * `CompanyStage` value the ICG engine expects. Returns `undefined`
 * when the input is `undefined` (ICG's `companyStage` is optional).
 */
export function resolveIcgStageInput(value: string | undefined): CompanyStage | undefined {
  if (value === undefined) return undefined;
  return isCanonicalStage(value) ? ICG_STAGE_ADAPTER.fromCanonical[value] : (value as CompanyStage);
}

/**
 * Resolve a TechPar stage input (canonical or native) to the native
 * `Stage` value the TechPar engine expects. TechPar's `stage` is
 * required; this function does not accept `undefined`.
 */
export function resolveTechparStageInput(value: string): TechParStage {
  return isCanonicalStage(value)
    ? TECHPAR_STAGE_ADAPTER.fromCanonical[value]
    : (value as TechParStage);
}
