/**
 * MCP tool: compute_techpar
 *
 * Wraps the website's pure TechPar calculation engine. Computes blended
 * tech cost ratio, zone classification, per-category KPIs, and the
 * 36-month gap projection for a company's tech-spend posture.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { compute, serializeToParams } from '../../../src/utils/techpar-engine';
import type { TechParInputs } from '../../../src/schemas/techpar';
import {
  TechParMcpInputsSchema,
  type TechParMcpInputs,
  TECHPAR_STAGE_ADAPTER,
  resolveTechparStageInput,
} from '../schemas';
import { HUB_BASE } from '../config';

/**
 * Build a TechPar deep-link from the resolved (native-shape) inputs by
 * delegating to the existing `serializeToParams` encoder in the engine.
 * The encoder is the single source of truth for URL state — same code
 * path the website page uses for `syncUrlState()` and `hydrateFromUrl()`.
 */
function buildTechparDeeplink(inputs: TechParInputs): string {
  const params = serializeToParams(inputs);
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
export async function handleTechparTool(mcpInputs: TechParMcpInputs) {
  try {
    // Resolve canonical-or-native stage to native (BL-031.87).
    const nativeStage = resolveTechparStageInput(mcpInputs.stage);
    const inputs: TechParInputs = { ...mcpInputs, stage: nativeStage };
    const result = compute(inputs);
    if (result === null) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'TechPar requires both `arr` and `infraHostingAnnual` to be greater than zero.',
          },
        ],
        isError: true,
      };
    }
    const stageContext = {
      native: nativeStage,
      canonical: TECHPAR_STAGE_ADAPTER.toCanonical[nativeStage],
    };
    const deeplink = buildTechparDeeplink(inputs);
    const payload = { ...result, stageContext, deeplink };
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(payload, null, 2),
        },
      ],
      structuredContent: payload as unknown as Record<string, unknown>,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text' as const, text: `Failed to compute TechPar: ${message}` }],
      isError: true,
    };
  }
}

export function registerTechparTool(server: McpServer): void {
  server.registerTool(
    'compute_techpar',
    {
      title: 'Compute TechPar Benchmark',
      description: TOOL_DESCRIPTION,
      inputSchema: TechParMcpInputsSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    handleTechparTool
  );
}
