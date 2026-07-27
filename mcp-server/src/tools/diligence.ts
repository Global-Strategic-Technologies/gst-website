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
import { NOOP_METRICS_CONTEXT, withToolMetrics, type MetricsContext } from '../metrics/_index';
import { type ValidatedUserInputs } from '../schemas';
import {
  AuditedUserInputsSchema,
  formatAuditIssues,
  runAuditRefinements,
  type AuditedUserInputs,
} from '../schemas/diligence-audit';
import { HUB_BASE } from '../config';
import { toolOk, toolFail } from './_result';

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
export async function handleDiligenceTool(payload: AuditedUserInputs) {
  // BL-032.25 § 3 instrumentation: when MCP_REPRO_TIMING=1, emit three
  // high-resolution checkpoints to stderr so the repro-k2b3.mjs script can
  // classify the timing distribution (engine / serialization / wire).
  // Off by default; zero cost in normal operation.
  const trace = process.env.MCP_REPRO_TIMING === '1';
  const mark = (label: string): void => {
    if (trace) console.error(`[REPRO] ${label} t=${performance.now().toFixed(2)}ms`);
  };
  mark('handler:enter');

  // BL-066 — structural validation is performed by the SDK against the
  // published `AuditedUserInputsSchema.shape` (see `registerDiligenceTool`
  // below). The handler runs only after structural parse succeeds, so
  // `payload` here is already a fully-typed `AuditedUserInputs`. Only the
  // BL-045 cross-field refinements remain in the handler body — those
  // cannot live on `.superRefine` without breaking JSON Schema publication.
  const auditIssues = runAuditRefinements(payload);
  mark('audit:complete');
  if (auditIssues.length > 0) {
    // The formatted block carries the BL-045 rule citation the `gst_irl_ingestion`
    // prompt tells the model to read and retry on — verbatim to `content`.
    return toolFail('audit-failed', formatAuditIssues(auditIssues));
  }

  try {
    // Strip the _audit sibling before invoking the engine — the engine
    // operates on the 13 dimension fields only.
    const { _audit: _ignored, ...inputs } = payload;
    void _ignored;
    const result = generateScript(inputs as ValidatedUserInputs);
    mark('engine:returned');
    const unknownDimensionCount = countUnknownDimensions(inputs as ValidatedUserInputs);
    const deeplink = buildDiligenceDeeplink(inputs as ValidatedUserInputs);
    const responsePayload = { ...result, unknownDimensionCount, deeplink };
    if (trace) {
      // BL-090: the response no longer carries a second, pretty-printed copy of
      // the payload, so measure the structured channel — the only copy on the wire.
      console.error(`[REPRO] serialized bytes=${JSON.stringify(responsePayload).length}`);
    }
    mark('handler:returning');
    return toolOk(
      responsePayload,
      `Diligence agenda generated (${unknownDimensionCount} unknown dimensions).`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolFail('internal-error', `Failed to generate diligence agenda: ${message}`);
  }
}

export function registerDiligenceTool(
  server: McpServer,
  metrics: MetricsContext = NOOP_METRICS_CONTEXT
): void {
  // BL-066: registered `inputSchema` is the publishable structural shape
  // of `AuditedUserInputsSchema` (a plain `ZodObject` extended with
  // `_audit`). Publishing the full per-field JSON Schema is load-bearing
  // for wire-format type coercion in MCP bridges (the claude.ai bridge
  // type-coerces nested `_audit` and `geographies` against this schema —
  // a permissive schema causes it to JSON-stringify them, breaking the
  // tool, see BL-065 regression). Cross-field BL-045 refinements still
  // run inside the handler via `runAuditRefinements`, and their rejection
  // messages carry the BL-065 forcing-function framing (preamble + per-
  // rule `Fix:` lines + Rule 0 naming + Rule-0 batch summary).
  server.registerTool(
    'generate_diligence_agenda',
    {
      title: 'Generate Diligence Agenda',
      description: TOOL_DESCRIPTION,
      inputSchema: AuditedUserInputsSchema.shape,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    withToolMetrics('generate_diligence_agenda', metrics, handleDiligenceTool)
  );
}
