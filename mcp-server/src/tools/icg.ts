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

import type { McpServer } from '@modelcontextprotocol/server';
import {
  calculateResults,
  getRecommendations,
  encodeState,
  type ICGState,
} from '../../../src/utils/icg-engine';
import { DOMAINS } from '../../../src/data/infrastructure-cost-governance/domains';
import { RECOMMENDATIONS } from '../../../src/data/infrastructure-cost-governance/recommendations';
import { ICGInputsSchema, type ICGInputs } from '../schemas';
import { HUB_BASE } from '../config';

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

Given an \`answers\` map keyed by ICG question ID (values: 0-3 for the four maturity levels, or -1 for "Not sure" which is penalised) and an optional \`companyStage\` ('pre-series-b' | 'series-bc' | 'pe-backed' | 'enterprise'), returns:

- \`overallScore\` (0-100) and \`maturityLevel\` ('Reactive' | 'Aware' | 'Optimizing' | 'Strategic')
- Per-domain scores with foundational-flag status
- Sorted recommendations triggered by below-threshold answers (impact-then-effort ordering)
- Aggregate counts (answered, total, "Not sure" responses)
- \`deeplink\` — URL to open the ICG wizard with these answers pre-populated (for PDF / export / share via the website page)

Same engine that powers https://globalstrategic.tech/hub/tools/infrastructure-cost-governance — calling it via MCP eliminates the wizard round-trip.`;

export function buildIcgDeeplink(state: ICGState): string {
  const encoded = encodeState(state);
  return `${HUB_BASE}/hub/tools/infrastructure-cost-governance/?s=${encoded}`;
}

export function registerIcgTool(server: McpServer): void {
  server.registerTool(
    'assess_infrastructure_cost_governance',
    {
      title: 'Assess Infrastructure Cost Governance',
      description: TOOL_DESCRIPTION,
      inputSchema: ICGInputsSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (inputs) => {
      try {
        const state = buildResultsState(inputs);
        const result = calculateResults(state, DOMAINS);
        const recommendations = getRecommendations(state, RECOMMENDATIONS);
        const deeplink = buildIcgDeeplink(state);
        const payload = { ...result, recommendations, deeplink };
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
          content: [{ type: 'text', text: `Failed to assess ICG: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
