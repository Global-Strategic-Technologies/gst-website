/**
 * MCP tool: validate_irl_provenance (BL-045 PR B Phase 2B).
 *
 * Residual-fabrication guard. Takes the filledIrl body + a list of
 * citations the model emitted in `_audit` blocks / (K) provenance
 * footer entries and verifies each excerpt against the IRL.
 *
 * Pure tool — no engine state, no Hub deeplink. Returns a per-citation
 * verdict array the model uses to populate (J) gap list entries for
 * unverified claims.
 *
 * See: src/schemas/validate-irl-provenance.ts for the matching engine.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NOOP_METRICS_CONTEXT, withToolMetrics, type MetricsContext } from '../metrics/_index';
import {
  ValidateIrlProvenanceInputSchema,
  runIrlProvenanceCheck,
  type ValidateIrlProvenanceInput,
} from '../schemas/validate-irl-provenance';

const TOOL_DESCRIPTION = `Verify that citations the model emitted (in \`_audit\` blocks, the (K) provenance footer, etc.) actually appear in the supplied filled IRL.

**Why call this**: the BL-045 calibration audit refines structural shape but cannot verify excerpt truthfulness — a model that obeys every audit rule can still fabricate the excerpt itself. This tool closes that gap by substring-matching every cited excerpt against the IRL body.

**Inputs**:

- \`filledIrl\` — the populated IRL body, same shape as the \`gst_irl_ingestion\` prompt arg.
- \`citations\` — array of \`{ path, citation }\` pairs. \`path\` identifies the claim site in your dossier (e.g., \`_audit.revenueRange.citation\`, \`section-C.headline\`); \`citation\` is the string you emitted (e.g., \`"Section 00 row 10 — Recurring revenue $2.64M CAD/mo Apr-2026"\`).

**Outputs**: per-citation verdict in one of four buckets:

- \`verified\` — the excerpt after the em-dash is a substring of the normalized IRL.
- \`verified-fuzzy\` — not verbatim but a run of ≥8 consecutive matching words appears in the IRL. Allows for minor paraphrasing while flagging real fabrication.
- \`partner-supplied\` — citation uses the \`Section --\` + \`partner-supplied form input\` sentinel (kickoff/handoff prompts that don't ingest an IRL). No verification expected.
- \`unverified\` — neither verbatim nor fuzzy match. Treat as residual fabrication: surface in (J) gap list as \`provenance-gap\` and either remove the dossier claim or replace it with an honest "open" marker.

The tool is pure (no engine call, no Hub URLs). Call it during your (K) provenance footer + provenance-citation self-check pass.`;

/**
 * Handler exported so integration tests can exercise the full pipeline
 * without going through the MCP transport.
 */
export async function handleValidateIrlProvenanceTool(payload: ValidateIrlProvenanceInput) {
  try {
    const result = runIrlProvenanceCheck(payload);
    const text = JSON.stringify(result, null, 2);
    return {
      content: [{ type: 'text' as const, text }],
      structuredContent: result as unknown as Record<string, unknown>,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text' as const, text: `Failed to validate IRL provenance: ${message}` }],
      isError: true,
    };
  }
}

export function registerValidateIrlProvenanceTool(
  server: McpServer,
  metrics: MetricsContext = NOOP_METRICS_CONTEXT
): void {
  server.registerTool(
    'validate_irl_provenance',
    {
      title: 'Validate IRL provenance',
      description: TOOL_DESCRIPTION,
      inputSchema: ValidateIrlProvenanceInputSchema.shape,
    },
    withToolMetrics('validate_irl_provenance', metrics, handleValidateIrlProvenanceTool)
  );
}
