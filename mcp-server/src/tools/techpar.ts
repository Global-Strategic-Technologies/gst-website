/**
 * MCP tool: compute_techpar
 *
 * Wraps the website's pure TechPar calculation engine. Computes blended
 * tech cost ratio, zone classification, per-category KPIs, and the
 * 36-month gap projection for a company's tech-spend posture.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NOOP_METRICS_CONTEXT, withToolMetrics, type MetricsContext } from '../metrics/_index';
import { compute, serializeToParams } from '../../../src/utils/techpar-engine';
import type { TechParInputs } from '../../../src/schemas/techpar';
import { TECHPAR_STAGE_ADAPTER, resolveTechparStageInput } from '../schemas';
import {
  AuditedTechParInputsSchema,
  formatTechParAuditIssues,
  runTechParAuditRefinements,
  type AuditedTechParInputs,
} from '../schemas/techpar-audit';
import { HUB_BASE } from '../config';
import { toolOk, toolFail } from './_result';

/**
 * Build a TechPar deep-link from the resolved (native-shape) inputs by
 * delegating to the existing `serializeToParams` encoder in the engine.
 * The encoder is the single source of truth for URL state — same code
 * path the website page uses for `syncUrlState()` and `hydrateFromUrl()`.
 */
function buildTechparDeeplink(inputs: TechParInputs): string {
  const params = serializeToParams(inputs);
  // The wizard has two infra-cost-period modes (monthly / annual) and
  // defaults to `monthly`, which multiplies the `h` field by 12 on
  // compute. BL-031.95 standardized the tool API on annual units, so the
  // `h` value we emit is ALWAYS annual — set `b=annual` so the wizard
  // restores in annual mode and doesn't apply the ×12 monthly conversion
  // to an already-annualized value. Without this, the wizard renders
  // ~7× the correct totalTechPct (live finding 2026-05-22: a
  // healthcare-RCM target at $23.4M annual hosting / $45.2M ARR
  // restored as 655.6% instead of 92.4%).
  params.set('b', 'annual');
  return `${HUB_BASE}/hub/tools/techpar/?${params.toString()}`;
}

const TOOL_DESCRIPTION = `Compute TechPar — a benchmark of a target company's technology cost ratio against stage-specific peer ranges.

Given a 14-field input (ARR, funding stage, mode, capex view, growth rate, exit multiple, infra hosting/personnel, R&D OpEx/CapEx, engineering FTEs, and per-category cost breakdown), returns:

- \`totalTechPct\` — blended technology cost as a percentage of revenue
- \`zone\` — one of underinvest / ahead / healthy / above / elevated / critical
- Per-category KPIs with benchmark ranges and zone classifications
- 36-month gap projection (cumulative excess or underinvestment)
- Stage configuration metadata
- \`stageContext\` — the native stage the engine used and the canonical funding-stage equivalents
- \`deeplink\` — URL to open the TechPar wizard with these inputs pre-populated (for PDF / export / share via the website page)

\`stage\` accepts either canonical values (seed | series-a | series-b | series-c | pe | enterprise — preferred) or TechPar-native values (seed | series_a | series_bc | pe | enterprise). TechPar collapses canonical series-b + series-c into series_bc; the canonical layer documents this honestly.

\`infraHostingAnnual\` and \`arr\` must both be > 0 (the engine returns null otherwise — surfaced here as an error). All six money fields (\`infraHostingAnnual\`, \`infraPersonnel\`, \`rdOpEx\`, \`rdCapEx\`, \`engCost\`, \`prodCost\`, \`toolingCost\`) are annual dollars. Same engine as https://globalstrategic.tech/hub/tools/techpar.`;

/**
 * Handler for the compute_techpar MCP tool.
 *
 * Exported so integration tests can exercise the full wrapper pipeline
 * (canonical stage resolution + engine call + deeplink + stageContext +
 * isError shape) without going through the MCP transport. The MCP
 * registration below wraps this same handler.
 */
export async function handleTechparTool(payload: AuditedTechParInputs) {
  // BL-045 PR B Phase 2 — TechPar calibration audit (currency basis +
  // per-monetary-field annualization provenance). Refinements run here in
  // the handler body, same pattern as diligence + tech-debt audits.
  const auditIssues = runTechParAuditRefinements(payload);
  if (auditIssues.length > 0) {
    // The formatted issue block is a retry directive the model is instructed to
    // act on, so it reaches `content` verbatim (BL-090 Invariant 2).
    return toolFail('audit-failed', formatTechParAuditIssues(auditIssues));
  }

  try {
    // Strip _audit before invoking the engine. Audit metadata is surfaced
    // back to the caller in the response payload (alongside the deeplink)
    // so the dossier rendering step can show partner-readable provenance.
    const { _audit, ...mcpInputs } = payload;
    const nativeStage = resolveTechparStageInput(mcpInputs.stage);
    const inputs: TechParInputs = { ...mcpInputs, stage: nativeStage };
    const result = compute(inputs);
    if (result === null) {
      return toolFail(
        'invalid-input',
        'TechPar requires both `arr` and `infraHostingAnnual` to be greater than zero.'
      );
    }
    const stageContext = {
      native: nativeStage,
      canonical: TECHPAR_STAGE_ADAPTER.toCanonical[nativeStage],
    };
    const deeplink = buildTechparDeeplink(inputs);
    const responsePayload = {
      ...result,
      stageContext,
      deeplink,
      monetaryBasis: _audit.monetaryBasis,
    };
    return toolOk(responsePayload, `TechPar computed for stage ${nativeStage}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolFail('internal-error', `Failed to compute TechPar: ${message}`);
  }
}

export function registerTechparTool(
  server: McpServer,
  metrics: MetricsContext = NOOP_METRICS_CONTEXT
): void {
  server.registerTool(
    'compute_techpar',
    {
      title: 'Compute TechPar Benchmark',
      description: TOOL_DESCRIPTION,
      inputSchema: AuditedTechParInputsSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    withToolMetrics('compute_techpar', metrics, handleTechparTool)
  );
}
