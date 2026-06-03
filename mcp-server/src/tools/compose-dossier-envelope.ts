/**
 * MCP tool: compose_dossier_envelope (BL-045 PR B forcing-function tightening).
 *
 * Closes the dossier-rendering compliance gap empirically exposed by the
 * v8 + v9 StoreForce traces: the model treats body-text directives
 * (meta fence, (J), (K), self-check) as descriptive context, not as a
 * procedure. This tool externalizes the structure into a tool input so
 * the model can't compose the dossier without producing the envelope.
 *
 * Pure tool — no engine state, no Hub deeplink. Internally calls
 * `runIrlProvenanceCheck` to verify every load-bearing claim against the
 * IRL and auto-appends `provenance-gap:` entries to (J) for fabrications.
 *
 * See: src/schemas/compose-dossier-envelope.ts for the input shape +
 * render functions + the pure engine.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NOOP_METRICS_CONTEXT, withToolMetrics, type MetricsContext } from '../metrics/_index';
import {
  ComposeDossierEnvelopeInputSchema,
  runComposeDossierEnvelope,
  type ComposeDossierEnvelopeInput,
} from '../schemas/compose-dossier-envelope';

const TOOL_DESCRIPTION = `Render the dossier's structural envelope (top-of-document meta JSON fence, (J) gap list, (K) provenance footer) as markdown the model transcribes verbatim into the dossier.

**Why call this tool**: prior runs showed the model treats markdown directives in the prompt body as descriptive context, not as a procedure to execute. The meta fence, (J), and (K) were silently elided from otherwise high-quality dossiers. This tool closes that gap with the same architectural pattern that solved the dimension-layer fabrication risk — externalize the structure so the model has to assemble it before composing the dossier.

**When to call**: AS THE FINAL STEP of \`gst_irl_ingestion\` in \`mode: full\`, BEFORE composing the dossier prose. You must have already (a) run the wrong-IRL pre-flight to compute fillRatio, (b) evaluated every inclusion gate, (c) gathered every load-bearing claim with its IRL citation, and (d) enumerated the gap-list entries by category.

**Input contract** (see the input schema for full details):
- \`promptName\`, \`promptVersion\`, \`modelVersion\`, \`mode\`, \`verbosity\`, \`transactionContext\` — meta-fence header.
- \`fillRatio\` — output of the wrong-IRL pre-flight (percent + substantiveCells + totalCells + status enum).
- \`gatesPassed\`, \`gatesElided\`, \`conditionalTriggersFired\`, \`forceToolsApplied\` — meta-fence body.
- \`claims\` — EVERY load-bearing claim the dossier will make (NRR figures, ARR, TechPar verdicts, ICG scores, Tech Debt carry, regulatory frameworks, comparable engagement code names, etc.). Each carries the claim label + IRL citation + tier. The tool renders (K) from these.
- \`gaps\` — categorized gap entries (\`defaulted-dimension\` / \`extraction-only\` / \`gate-elided\` / \`conditional-trigger\` / \`currency-assumption\` / \`map-absent\`). The tool auto-APPENDS \`provenance-gap:\` entries for unverified claims; do NOT pre-populate that category.
- \`filledIrl\` — the populated IRL body. Used internally to verify every claim's citation against the IRL via the same engine \`validate_irl_provenance\` uses.

**Output**: three markdown blocks (\`metaFenceMarkdown\`, \`gapListMarkdown\`, \`provenanceFooterMarkdown\`) the model pastes verbatim into the dossier, plus a \`provenanceVerification\` summary (count of verified / verified-fuzzy / partner-supplied / unverified / auto-appended-gaps) and \`emitInstructions\` with the transcription discipline.

**Re-calling**: if you discover additional gaps or claims after a first call, re-call the tool with the updated arrays rather than editing the markdown by hand.`;

/**
 * Handler exported so integration tests can exercise the full pipeline
 * without going through the MCP transport.
 */
export async function handleComposeDossierEnvelopeTool(payload: ComposeDossierEnvelopeInput) {
  try {
    const result = runComposeDossierEnvelope(payload);
    const text = JSON.stringify(result, null, 2);
    return {
      content: [{ type: 'text' as const, text }],
      structuredContent: result as unknown as Record<string, unknown>,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text' as const, text: `Failed to compose dossier envelope: ${message}` }],
      isError: true,
    };
  }
}

export function registerComposeDossierEnvelopeTool(
  server: McpServer,
  metrics: MetricsContext = NOOP_METRICS_CONTEXT
): void {
  server.registerTool(
    'compose_dossier_envelope',
    {
      title: 'Compose dossier envelope (meta fence + (J) gap list + (K) provenance footer)',
      description: TOOL_DESCRIPTION,
      inputSchema: ComposeDossierEnvelopeInputSchema.shape,
    },
    withToolMetrics('compose_dossier_envelope', metrics, handleComposeDossierEnvelopeTool)
  );
}
