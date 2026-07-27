/**
 * MCP tool: assess_infrastructure_cost_governance
 *
 * Wraps the website's pure ICG calculation engine. Computes the maturity
 * score, per-domain breakdown, and triggered recommendations for a target
 * company's cost-governance posture.
 *
 * The result includes a `deeplink` that opens the ICG wizard with all
 * answers pre-populated.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NOOP_METRICS_CONTEXT, withToolMetrics, type MetricsContext } from '../metrics/_index';
import {
  calculateResults,
  getRecommendations,
  encodeState,
  type ICGState,
} from '../../../src/utils/icg-engine';
import { DOMAINS } from '../../../src/data/infrastructure-cost-governance/domains';
import { RECOMMENDATIONS } from '../../../src/data/infrastructure-cost-governance/recommendations';
import {
  ICGMcpInputsSchema,
  type ICGMcpInputs,
  ICG_STAGE_ADAPTER,
  resolveIcgStageInput,
  type ICGInputs,
} from '../schemas';
import { HUB_BASE } from '../config';
import { toolOk, toolFail } from './_result';

/**
 * Build the ICGState that the deep-link should restore. `currentStep: 7`
 * lands the wizard on the results view (intro=0, domains 1-6, results=7).
 * The deep-link's purpose is to skip to the populated outcome, not the
 * start screen.
 */
export function buildResultsState(inputs: ICGInputs): ICGState {
  return {
    answers: inputs.answers,
    currentStep: 7,
    dismissed: [],
    companyStage: inputs.companyStage,
  };
}

const TOOL_DESCRIPTION = `Assess a target company's Infrastructure Cost Governance maturity.

**Structure-discovery usage (READ FIRST)**: When the user asks ABOUT the ICG framework rather than asking you to assess a specific company — e.g. "what does the ICG framework cover?", "what are the ICG domains?", "how would I assess ICG maturity?" — call this tool with \`answers: {}\` (empty object, no \`companyStage\`). The response's \`domainScores[].name\` field returns the canonical 6 domain names (with all scores at 0). Use this to ground framework descriptions in the actual taxonomy. **Do NOT describe the framework from memory** — GST's ICG framework has 6 specific domains, and describing them from training-knowledge has produced fabricated domain names in soak testing.

---

Given an \`answers\` map keyed by ICG question ID (values: 0-3 for the four maturity levels, or -1 for "Not sure" which is penalised) and an optional \`companyStage\`, returns:

- \`overallScore\` (0-100) and \`maturityLevel\` ('Reactive' | 'Aware' | 'Optimizing' | 'Strategic')
- Per-domain scores with foundational-flag status — each entry's \`name\` field is the canonical domain name (use these names verbatim; do not paraphrase or substitute)
- Sorted recommendations triggered by below-threshold answers (impact-then-effort ordering). Each recommendation carries \`triggerQuestionAnswered: boolean\` — \`true\` when the trigger question was explicitly answered (any value 0-3 or -1), \`false\` when the key was absent and the engine defaulted to 0. Use this to distinguish confirmed gaps from assumed gaps in summarized output.
- Aggregate counts (answered, total, "Not sure" responses)
- \`deeplink\` — URL to open the ICG wizard with these answers pre-populated (for PDF / export / share via the website page)
- \`stageContext\` — when \`companyStage\` is supplied, echoes the native value the engine used and the canonical funding-stage equivalents

\`companyStage\` accepts either canonical values (seed | series-a | series-b | series-c | pe | enterprise — preferred) or ICG-native values (pre-series-b | series-bc | pe-backed | enterprise). ICG collapses canonical seed + series-a into pre-series-b and canonical series-b + series-c into series-bc; the canonical layer documents this honestly.

Same engine that powers https://globalstrategic.tech/hub/tools/infrastructure-cost-governance — calling it via MCP eliminates the wizard round-trip.`;

export function buildIcgDeeplink(state: ICGState): string {
  const encoded = encodeState(state);
  return `${HUB_BASE}/hub/tools/infrastructure-cost-governance/?s=${encoded}`;
}

/**
 * Handler for the assess_infrastructure_cost_governance MCP tool.
 *
 * Exported so integration tests can exercise the full wrapper pipeline
 * (canonical stage resolution + engine call + deeplink + stageContext)
 * without going through the MCP transport. The MCP registration below
 * wraps this same handler.
 */
export async function handleIcgTool(mcpInputs: ICGMcpInputs) {
  try {
    // Resolve canonical-or-native stage to native (BL-031.87).
    const nativeStage = resolveIcgStageInput(mcpInputs.companyStage);
    const inputs: ICGInputs = {
      answers: mcpInputs.answers,
      companyStage: nativeStage,
    };
    const state = buildResultsState(inputs);
    const result = calculateResults(state, DOMAINS);
    const recommendations = getRecommendations(state, RECOMMENDATIONS);
    const deeplink = buildIcgDeeplink(state);
    const stageContext = nativeStage
      ? {
          native: nativeStage,
          canonical: ICG_STAGE_ADAPTER.toCanonical[nativeStage],
        }
      : undefined;
    const payload = stageContext
      ? { ...result, recommendations, deeplink, stageContext }
      : { ...result, recommendations, deeplink };
    return toolOk(
      payload,
      `Infrastructure cost governance assessed: ${recommendations.length} recommendations.`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolFail('internal-error', `Failed to assess ICG: ${message}`);
  }
}

export function registerIcgTool(
  server: McpServer,
  metrics: MetricsContext = NOOP_METRICS_CONTEXT
): void {
  server.registerTool(
    'assess_infrastructure_cost_governance',
    {
      title: 'Assess Infrastructure Cost Governance',
      description: TOOL_DESCRIPTION,
      inputSchema: ICGMcpInputsSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    withToolMetrics('assess_infrastructure_cost_governance', metrics, handleIcgTool)
  );
}
