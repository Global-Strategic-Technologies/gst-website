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
 *   `mcp-server/src/docs/tools/tech-debt/CONTRACT.md`
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

// `incidents` and `mttrHours` carry no `.describe()` here: the MCP audit schema
// (`mcp-server/src/schemas/tech-debt-audit.ts`) replaces both fields with
// nullable, described versions, so text on these would never reach tools/list.
export const TechDebtInputsSchema = z.object({
  teamSize: z.number().int().positive().describe('Engineering headcount.'),
  salary: z
    .number()
    .positive()
    .describe('Average annual fully-loaded cost per engineer, in dollars (e.g. 180000).'),
  maintenanceBurdenPct: z
    .number()
    .min(0)
    .max(100)
    .describe(
      'Percent of engineering capacity spent on maintenance / debt servicing, as 0-100 (25 = a quarter of capacity), not a 0-1 fraction.'
    ),
  deployFrequency: DeployFrequencySchema.describe(
    `Deployment cadence; sets the DORA-aligned velocity multiplier. One of: ${DEPLOY_FREQUENCY_VALUES.join(' · ')}.`
  ),
  incidents: z.number().int().min(0),
  mttrHours: z.number().min(0),
  remediationBudget: z
    .number()
    .nonnegative()
    .describe('Capital available for debt paydown, in dollars; the numerator of `paybackMonths`.'),
  arr: z
    .number()
    .nonnegative()
    .describe('Annual recurring revenue, in dollars; used for `debtPctArr`.'),
  remediationPct: z
    .number()
    .min(0)
    .max(100)
    .describe(
      'Expected reduction in debt-carrying cost if the remediation is executed, as 0-100. 0 means no savings, so `paybackMonths` has no finite value.'
    ),
  contextSwitchOn: z
    .boolean()
    .describe(
      'Whether to add the context-switch overhead surcharge: 23% of the direct maintenance cost, added to the carrying cost.'
    ),
});

export type DeployFrequency = z.infer<typeof DeployFrequencySchema>;
export type TechDebtInputs = z.infer<typeof TechDebtInputsSchema>;
