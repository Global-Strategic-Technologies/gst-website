/**
 * MCP tool: prepare_irl_body
 *
 * BL-068 — preflight ergonomics for the BL-049 hash-bind on
 * `compose_dossier_envelope`. The model passes the same `filledIrl`
 * body here first, receives the canonical `irlBodyHash`, then submits
 * both to `compose_dossier_envelope` on the first call.
 *
 * This is NOT a new forcing function. The forcing function is
 * `IrlBodyHashMismatchError`; `prepare_irl_body` is a retry-elimination
 * ergonomics layer on top of it. Models that ignore this tool still
 * hit the existing rejection path (with the new `Fix:` line steering
 * them here).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NOOP_METRICS_CONTEXT, withToolMetrics, type MetricsContext } from '../metrics/_index';
import { computeIrlBodyHash } from '../schemas/compose-dossier-envelope';
import {
  PrepareIrlBodyInputSchema,
  type PrepareIrlBodyInput,
  type PrepareIrlBodyOutput,
} from '../schemas/prepare-irl-body';

const TOOL_DESCRIPTION = `Compute the canonical \`irlBodyHash\` for a \`filledIrl\` body so you can submit it to \`compose_dossier_envelope\`.

**CALL THIS TOOL FIRST**, before \`compose_dossier_envelope\`. Do NOT guess or hand-compute sha256 — LLMs do not produce reliable hashes in-head. The 16-hex hash returned here is the only value \`compose_dossier_envelope\` will accept for this body; submitting any other value will trigger \`IrlBodyHashMismatchError\` and force a retry.

**Inputs**:
- \`filledIrl\`: the verbatim IRL markdown body — EXACTLY the bytes you intend to pass to \`compose_dossier_envelope.filledIrl\`. Must be ≥200 chars.

**Outputs**:
- \`irlBodyHash\`: 16-hex-char prefix of sha256(filledIrl). Pass this verbatim to \`compose_dossier_envelope.irlBodyHash\`.
- \`byteLength\`: UTF-8 byte length of the body, for your own bookkeeping.

The hash is deterministic: same body in, same hash out. No normalization is applied — byte-for-byte sha256.`;

export async function handlePrepareIrlBodyTool(payload: PrepareIrlBodyInput) {
  const irlBodyHash = computeIrlBodyHash(payload.filledIrl);
  const byteLength = Buffer.byteLength(payload.filledIrl, 'utf8');
  const result: PrepareIrlBodyOutput = { irlBodyHash, byteLength };
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    structuredContent: result as unknown as Record<string, unknown>,
  };
}

export function registerPrepareIrlBodyTool(
  server: McpServer,
  metrics: MetricsContext = NOOP_METRICS_CONTEXT
): void {
  server.registerTool(
    'prepare_irl_body',
    {
      title: 'Compute canonical irlBodyHash for compose_dossier_envelope preflight',
      description: TOOL_DESCRIPTION,
      inputSchema: PrepareIrlBodyInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    withToolMetrics('prepare_irl_body', metrics, handlePrepareIrlBodyTool)
  );
}
