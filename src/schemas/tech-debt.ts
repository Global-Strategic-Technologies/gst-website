import { z } from 'zod';

/**
 * Zod schemas for the Tech Debt Cost Calculator.
 *
 * Used by the `estimate_tech_debt_cost` MCP tool. The schema mirrors
 * `RawTechDebtInputs` in `src/utils/tech-debt-engine.ts` — raw business
 * values (team size, salary, etc.) so agents do not need to know about
 * the website wizard's slider domain.
 *
 * The deployment-frequency labels are duplicated here verbatim from
 * `DEPLOY_OPTIONS` in the engine. Drift is caught by a unit test that
 * asserts the two lists stay in sync.
 *
 * The human-readable reference for the MCP tool (per-field semantics,
 * the DORA-aligned velocity multiplier table, slider-bypass rationale,
 * payback-period semantics) lives at:
 *   `mcp-server/src/docs/tech-debt/CONTRACT.md`
 */

export const DEPLOY_FREQUENCY_VALUES = [
  'Multiple/day',
  'Daily',
  'Weekly',
  'Bi-weekly',
  'Three-week',
  'Monthly',
  'Quarterly+',
  'Bi-annually',
  'Annually',
] as const;

export const DeployFrequencySchema = z.enum(DEPLOY_FREQUENCY_VALUES);

export const TechDebtInputsSchema = z.object({
  teamSize: z.number().int().positive(),
  salary: z.number().positive(),
  maintenanceBurdenPct: z.number().min(0).max(100),
  deployFrequency: DeployFrequencySchema,
  incidents: z.number().int().min(0),
  mttrHours: z.number().min(0),
  remediationBudget: z.number().nonnegative(),
  arr: z.number().nonnegative(),
  remediationPct: z.number().min(0).max(100),
  contextSwitchOn: z.boolean(),
});

export type DeployFrequency = z.infer<typeof DeployFrequencySchema>;
export type TechDebtInputs = z.infer<typeof TechDebtInputsSchema>;
