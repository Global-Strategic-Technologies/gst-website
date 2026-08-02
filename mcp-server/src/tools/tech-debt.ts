/**
 * MCP tool: estimate_tech_debt_cost
 *
 * Wraps the website's pure Tech Debt engine via `calculateFromRawInputs`.
 * Agents pass raw business values directly; the website's CalcState now
 * stores those same raw values, so deeplinks reproduce inputs exactly
 * (no slider-position quantization loss).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NOOP_METRICS_CONTEXT, withToolMetrics, type MetricsContext } from '../metrics/_index';
import {
  calculateFromRawInputs,
  encodeState,
  DEPLOY_OPTIONS,
  type CalcState,
  type RawTechDebtInputs,
} from '../../../src/utils/tech-debt-engine';
import {
  AuditedTechDebtInputsSchema,
  formatTechDebtAuditIssues,
  runTechDebtAuditRefinements,
  type AuditedTechDebtInputs,
} from '../schemas/tech-debt-audit';
import { HUB_BASE } from '../config';
import { toolOk, toolFail } from './_result';

const TOOL_DESCRIPTION = `Estimate the carrying cost of accumulated technical debt for a target organization.

Given raw business values (team size, average salary, maintenance burden %, deployment frequency, incidents/month, MTTR hours, remediation budget, ARR, planned remediation efficiency, and whether to model context-switch overhead), returns:

- \`annualCost\` and \`totalMonthly\` — total monthly + annualized debt-carrying cost
- \`directMonthly\`, \`contextSwitchMonthly\`, \`incidentMonthly\` — cost decomposition
- \`hoursLostPerEng\` — weekly engineering hours lost to maintenance
- \`debtPctArr\` — debt cost as a percentage of ARR
- \`paybackMonths\` — remediation budget payback at the configured efficiency
- \`doraLabel\` and DORA velocity multiplier (V) — derived from deployment frequency
- \`deeplink\` — URL to open the Tech Debt Calculator with sliders pre-positioned to these inputs (for PDF / export / share via the website page)

The MCP tool accepts raw values directly. The website stores the same raw values as canonical state, so deep-links round-trip exactly without slider-granularity quantization.`;

/**
 * Convert raw MCP inputs to CalcState. Since CalcState now holds raw business
 * values (post-precision-thrash refactor), this is mostly a field-renaming +
 * deployFrequency-label-to-index lookup.
 */
export function rawToState(raw: RawTechDebtInputs): CalcState {
  const deployIdx = DEPLOY_OPTIONS.findIndex((d) => d.label === raw.deployFrequency);
  if (deployIdx < 0) {
    throw new Error(`Unknown deployFrequency: ${raw.deployFrequency}`);
  }
  return {
    advancedOpen: false,
    teamSize: raw.teamSize,
    salary: raw.salary,
    maintPct: raw.maintenanceBurdenPct,
    deployIdx,
    incidents: raw.incidents,
    mttr: raw.mttrHours,
    remediationBudget: raw.remediationBudget,
    arr: raw.arr,
    remediationPct: raw.remediationPct,
    contextSwitchOn: raw.contextSwitchOn,
  };
}

export function buildTechDebtDeeplink(raw: RawTechDebtInputs): string {
  const encoded = encodeState(rawToState(raw));
  return `${HUB_BASE}/hub/tools/tech-debt-calculator/?s=${encoded}`;
}

export function registerTechDebtTool(
  server: McpServer,
  metrics: MetricsContext = NOOP_METRICS_CONTEXT
): void {
  server.registerTool(
    'estimate_tech_debt_cost',
    {
      title: 'Estimate Tech Debt Cost',
      description: TOOL_DESCRIPTION,
      inputSchema: AuditedTechDebtInputsSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    withToolMetrics('estimate_tech_debt_cost', metrics, async (payload: AuditedTechDebtInputs) => {
      // BL-045 PR B — MTTR + incident-count fabrication guard.
      const auditIssues = runTechDebtAuditRefinements(payload);
      if (auditIssues.length > 0) {
        // Retry directive — reaches `content` verbatim (BL-090 Invariant 2).
        return toolFail('audit-failed', formatTechDebtAuditIssues(auditIssues));
      }

      try {
        // Strip _audit; substitute 0 for null mttrHours / incidents fields
        // (the engine multiplies them linearly so 0 elides the line item).
        // Track which fields were elided so the response can surface
        // extractionOnly[] for the prompt to render the section correctly.
        const { _audit, ...rest } = payload;
        const extractionOnly: Array<'mttrHours' | 'incidents'> = [];
        if (rest.mttrHours === null) extractionOnly.push('mttrHours');
        if (rest.incidents === null) extractionOnly.push('incidents');
        const inputsForEngine: RawTechDebtInputs = {
          ...rest,
          mttrHours: rest.mttrHours ?? 0,
          incidents: rest.incidents ?? 0,
        };
        const result = calculateFromRawInputs(inputsForEngine);
        const deeplink = buildTechDebtDeeplink(inputsForEngine);
        const responsePayload = {
          ...result,
          deeplink,
          extractionOnly,
          mttrSource: _audit.mttrSource,
          incidentsSource: _audit.incidentsSource,
        };
        return toolOk(
          responsePayload,
          `Tech-debt cost estimated${extractionOnly.length > 0 ? ` (${extractionOnly.length} field(s) extraction-only)` : ''}.`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return toolFail('internal-error', `Failed to estimate tech-debt cost: ${message}`);
      }
    })
  );
}
