/**
 * MCP tool: estimate_tech_debt_cost
 *
 * Wraps the website's pure Tech Debt engine via `calculateFromRawInputs` —
 * the slider-position helpers stay on the website side so agents pass raw
 * business values directly.
 *
 * The result includes a `deeplink` that opens the Tech Debt Calculator
 * with sliders pre-positioned to reproduce the supplied inputs (subject
 * to slider-granularity quantization — see BL-034 cleanup item).
 */

import type { McpServer } from '@modelcontextprotocol/server';
import {
  calculateFromRawInputs,
  encodeState,
  teamSizeToPos,
  salaryToPos,
  budgetToPos,
  arrToPos,
  DEPLOY_OPTIONS,
  type CalcState,
  type RawTechDebtInputs,
} from '../../../src/utils/tech-debt-engine';
import { TechDebtInputsSchema } from '../schemas';
import { HUB_BASE } from '../config';

const TOOL_DESCRIPTION = `Estimate the carrying cost of accumulated technical debt for a target organization.

Given raw business values (team size, average salary, maintenance burden %, deployment frequency, incidents/month, MTTR hours, remediation budget, ARR, planned remediation efficiency, and whether to model context-switch overhead), returns:

- \`annualCost\` and \`totalMonthly\` — total monthly + annualized debt-carrying cost
- \`directMonthly\`, \`contextSwitchMonthly\`, \`incidentMonthly\` — cost decomposition
- \`hoursLostPerEng\` — weekly engineering hours lost to maintenance
- \`debtPctArr\` — debt cost as a percentage of ARR
- \`paybackMonths\` — remediation budget payback at the configured efficiency
- \`doraLabel\` and DORA velocity multiplier (V) — derived from deployment frequency
- \`deeplink\` — URL to open the Tech Debt Calculator with sliders pre-positioned to these inputs (for PDF / export / share via the website page)

The MCP tool accepts raw values directly. The website's slider-position helpers (\`posToTeamSize\`, \`posToSalary\`, \`posTobudget\`, \`posToArr\`) are deliberately bypassed — sliders are a UI concern with no place in an agent-facing schema.`;

/**
 * Convert raw inputs back to a CalcState (slider-position representation)
 * using the website's inverse helpers. Subject to slider-granularity
 * quantization — the deep-link will reproduce the inputs to whatever
 * precision the sliders support.
 */
export function rawToState(raw: RawTechDebtInputs): CalcState {
  const deployIdx = DEPLOY_OPTIONS.findIndex((d) => d.label === raw.deployFrequency);
  if (deployIdx < 0) {
    throw new Error(`Unknown deployFrequency: ${raw.deployFrequency}`);
  }
  return {
    advancedOpen: false,
    teamSizePos: teamSizeToPos(raw.teamSize),
    salaryPos: salaryToPos(raw.salary),
    maintPct: raw.maintenanceBurdenPct,
    deployIdx,
    incidents: raw.incidents,
    mttr: raw.mttrHours,
    budgetPos: budgetToPos(raw.remediationBudget),
    arrPos: arrToPos(raw.arr),
    remediationPct: raw.remediationPct,
    contextSwitchOn: raw.contextSwitchOn,
  };
}

export function buildTechDebtDeeplink(raw: RawTechDebtInputs): string {
  const encoded = encodeState(rawToState(raw));
  return `${HUB_BASE}/hub/tools/tech-debt-calculator/?s=${encoded}`;
}

export function registerTechDebtTool(server: McpServer): void {
  server.registerTool(
    'estimate_tech_debt_cost',
    {
      title: 'Estimate Tech Debt Cost',
      description: TOOL_DESCRIPTION,
      inputSchema: TechDebtInputsSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (inputs) => {
      try {
        const result = calculateFromRawInputs(inputs);
        const deeplink = buildTechDebtDeeplink(inputs);
        const payload = { ...result, deeplink };
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(payload, null, 2),
            },
          ],
          structuredContent: payload as unknown as Record<string, unknown>,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text', text: `Failed to estimate tech-debt cost: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
