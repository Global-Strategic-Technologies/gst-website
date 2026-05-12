/**
 * MCP tool: generate_diligence_agenda
 *
 * Wraps the website's pure `generateScript` engine — same inputs, same
 * outputs, no browser round-trip. Input validation is handled by the SDK
 * via `UserInputsSchema`; on failure the SDK returns a protocol-level
 * error before the handler runs.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { generateScript } from '../../../src/utils/diligence-engine';
import { serializeToParams as serializeDiligenceUrl } from '../../../src/utils/diligence-url';
import { UserInputsSchema, type ValidatedUserInputs } from '../schemas';
import { HUB_BASE } from '../config';

/**
 * Build a Diligence Machine deep-link by delegating to the existing
 * `serializeToParams` encoder in `src/utils/diligence-url.ts`. The
 * encoder is the single source of truth for diligence URL state — same
 * code path the website page uses for `syncUrlState()` and the page-
 * load URL hydration in `restoreState()`.
 */
export function buildDiligenceDeeplink(inputs: ValidatedUserInputs): string {
  const params = serializeDiligenceUrl(inputs);
  return `${HUB_BASE}/hub/tools/diligence-machine/?${params.toString()}`;
}

const TOOL_DESCRIPTION = `Generate a prescriptive due-diligence "Inquisitor's Script" for a target M&A or investment opportunity.

**USAGE RULE — \`'unknown'\` sentinel discipline (READ FIRST)**

For every one of the 13 input dimensions, follow this hierarchy:

1. If the user **directly states** the value, map it to the enum and pass it (e.g., "B2B SaaS" → \`productType: "b2b-saas"\`).
2. If the value is a **literal one-to-one extraction** from the user's words (e.g., "Series B" → \`transactionType: "venture-series"\`, "modern cloud-native stack" → \`techArchetype: "modern-cloud-native"\`), map and pass.
3. **Otherwise, pass \`'unknown'\`.** The engine treats \`'unknown'\` as a non-eliminating value that widens the agenda conservatively. This is the supported design.

**Indirect inference is forbidden.** Specifically: do NOT infer \`businessModel\` from \`productType\` ("b2b-saas" does not imply "productized-platform" — many B2B SaaS companies are services-led or usage-based); do NOT infer \`scaleIntensity\` from \`growthStage\` (many scaling-stage companies are still small-scale); do NOT infer \`transformationState\` from \`techArchetype\` ("modern-cloud-native" does not imply "stable"); do NOT infer \`operatingModel\` from anything (org structure is not derivable from product or stage). When in doubt, pass \`'unknown'\`.

**Low-context prompts** ("no info yet", "early-stage curiosity", "hypothetical target", "draft something I can show a prospect"): set ALL 13 fields to \`'unknown'\` (and \`geographies: ['unknown']\`) and call the tool. Do NOT refuse, do NOT ask for more info first. The engine returns a wide low-confidence agenda specifically for this case, with an \`unknownDimensionCount\` ≥7 callout. This is by design.

---

Given a 13-field profile of the deal (transaction type, product type, tech archetype, company size/age/stage/revenue/geography, business model, scale intensity, transformation state, data sensitivity, operating model), returns a structured agenda containing:

- Topic-grouped diligence questions (architecture, operations, carve-out, security/risk) — already balanced and priority-sorted.
- Attention-area summaries flagged for the deal profile.
- A trigger map showing which input dimensions caused which questions to surface.
- Aggregate metadata (totalQuestions, generatedAt timestamp, an inputSummary echo).
- \`unknownDimensionCount\` — number of input dimensions where the agent supplied the \`'unknown'\` sentinel (BL-031.95 Phase 2). When ≥7 of 13 dimensions are unknown, the deliverable should lead with a low-confidence callout (parallel to ICG's ≥10/20 threshold).
- \`deeplink\` — URL to open the diligence wizard with these inputs pre-populated (for PDF / export / share via the website page). URL state takes precedence over the wizard's localStorage on page-load init.

**\`'unknown'\` value contract** (technical detail): every enum field accepts the string \`'unknown'\` as a sentinel. \`'unknown'\` does NOT eliminate any trigger — it widens the agenda conservatively. For \`geographies\`, pass \`['unknown']\` (the array still must have ≥1 element).

This is the same engine that powers https://globalstrategic.tech/hub/tools/diligence-machine — calling it via MCP eliminates the browser round-trip.`;

/**
 * Count input dimensions where the agent supplied the `'unknown'` sentinel.
 * For `geographies`, an array containing only `'unknown'` counts as 1.
 */
export function countUnknownDimensions(inputs: ValidatedUserInputs): number {
  let count = 0;
  if (inputs.transactionType === 'unknown') count++;
  if (inputs.productType === 'unknown') count++;
  if (inputs.techArchetype === 'unknown') count++;
  if (inputs.headcount === 'unknown') count++;
  if (inputs.revenueRange === 'unknown') count++;
  if (inputs.growthStage === 'unknown') count++;
  if (inputs.companyAge === 'unknown') count++;
  if (inputs.geographies.length === 1 && inputs.geographies[0] === 'unknown') count++;
  if (inputs.businessModel === 'unknown') count++;
  if (inputs.scaleIntensity === 'unknown') count++;
  if (inputs.transformationState === 'unknown') count++;
  if (inputs.dataSensitivity === 'unknown') count++;
  if (inputs.operatingModel === 'unknown') count++;
  return count;
}

/**
 * Handler for the generate_diligence_agenda MCP tool.
 *
 * Exported so integration tests can exercise the full wrapper pipeline
 * (engine call + unknownDimensionCount instrumentation) without going
 * through the MCP transport. The MCP registration below wraps this
 * same handler.
 */
export async function handleDiligenceTool(inputs: ValidatedUserInputs) {
  try {
    const result = generateScript(inputs);
    const unknownDimensionCount = countUnknownDimensions(inputs);
    const deeplink = buildDiligenceDeeplink(inputs);
    const payload = { ...result, unknownDimensionCount, deeplink };
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
      content: [{ type: 'text' as const, text: `Failed to generate diligence agenda: ${message}` }],
      isError: true,
    };
  }
}

export function registerDiligenceTool(server: McpServer): void {
  server.registerTool(
    'generate_diligence_agenda',
    {
      title: 'Generate Diligence Agenda',
      description: TOOL_DESCRIPTION,
      inputSchema: UserInputsSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    handleDiligenceTool
  );
}
