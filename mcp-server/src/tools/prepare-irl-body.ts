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
import {
  IrlBodyCacheSizeExceededError,
  IrlBodyCacheWriteFailedError,
} from '../cache/irl-body-cache';
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

export async function handlePrepareIrlBodyTool(
  payload: PrepareIrlBodyInput,
  metrics?: MetricsContext
) {
  const irlBodyHash = computeIrlBodyHash(payload.filledIrl);
  const byteLength = Buffer.byteLength(payload.filledIrl, 'utf8');

  // BL-076 — write the body to the IRL body cache keyed by the canonical
  // hash so `compose_dossier_envelope` can re-hydrate it without the model
  // re-emitting it as tool args. Best-effort: if the cache rejects the body
  // (over the per-entry size cap), surface a structured error so the model
  // knows to trim the body before retrying. Other cache write failures
  // (e.g., Upstash transient blip) propagate as a thrown error which the
  // handler catches below — the next compose call will surface
  // `Bl076BodyCacheMissError` directing a retry.
  try {
    await metrics?.irlBodyCache?.set(irlBodyHash, payload.filledIrl);
  } catch (error) {
    if (
      error instanceof IrlBodyCacheSizeExceededError ||
      error instanceof IrlBodyCacheWriteFailedError
    ) {
      return {
        content: [{ type: 'text' as const, text: error.message }],
        isError: true,
      };
    }
    throw error;
  }

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
        // BL-076 audit R-2: cache write is a side effect. Idempotent stays
        // true (same body in → same cache state by construction).
        readOnlyHint: false,
        idempotentHint: true,
      },
    },
    withToolMetrics(
      'prepare_irl_body',
      metrics,
      // BL-076: capture `metrics` in the closure so the handler can write
      // to `metrics.irlBodyCache` at call time.
      (payload: PrepareIrlBodyInput) => handlePrepareIrlBodyTool(payload, metrics)
    )
  );
}
