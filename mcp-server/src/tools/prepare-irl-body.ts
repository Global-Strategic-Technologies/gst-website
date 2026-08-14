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

import type { McpServer } from '@modelcontextprotocol/server';
import { NOOP_METRICS_CONTEXT, withToolMetrics, type MetricsContext } from '../metrics/_index';
import {
  IrlBodyCacheSizeExceededError,
  IrlBodyCacheWriteFailedError,
} from '../cache/irl-body-cache';
import { computeIrlBodyHash } from '../schemas/compose-dossier-envelope';
import type { IrlBodyMintedBy } from '../cache/irl-body-provenance';
import { assessIrlBodyStructure } from '../lib/irl-body-structure';
import {
  PrepareIrlBodyInputSchema,
  type PrepareIrlBodyInput,
  type PrepareIrlBodyOutput,
} from '../schemas/prepare-irl-body';
import { toolOk, toolFail } from './_result';

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
  metrics?: MetricsContext,
  // BL-123 — who is writing this body. OPTIONAL, defaulting to the WEAKER
  // value, for two reasons. First, ten call sites exist and two of them
  // (`tests/unit/tools/prepare-irl-body.test.ts`) invoke the handler with a
  // single argument, so a required parameter is a compile error. Second and
  // more important: an un-updated caller can then only ever mint the weaker
  // grade, never the stronger — the safe failure direction for a field whose
  // whole purpose is to resist over-claiming.
  mintedBy: IrlBodyMintedBy = 'prepare-tool'
) {
  // BL-124 — measured, never refused. The count rides along on the provenance
  // record so an operator can see `newlines: 0` and understand why this body
  // will not hash-match the file on their disk. See `lib/irl-body-structure.ts`
  // for why the BL-123 refusal was withdrawn.
  const structure = assessIrlBodyStructure(payload.filledIrl);

  const irlBodyHash = computeIrlBodyHash(payload.filledIrl);
  const byteLength = Buffer.byteLength(payload.filledIrl, 'utf8');

  // BL-076 — write the body to the IRL body cache keyed by the canonical
  // hash so `compose_dossier_envelope` can re-hydrate it without the model
  // re-emitting it as tool args. Best-effort, with the two known write failures
  // separated by who can act on them (BL-090): a body over the per-entry size cap
  // is the model's to fix (`invalid-input` — trim and retry), while a write
  // failure is ours (`internal-error`). Anything else rethrows; the next compose
  // call then surfaces `Bl076BodyCacheMissError` directing a retry.
  try {
    await metrics?.irlBodyCache?.set(irlBodyHash, payload.filledIrl);
  } catch (error) {
    // These two are deliberately NOT `cache-miss`: that reason means "the body
    // was never stored, call prepare_irl_body first", and a client branching on it
    // would retry the very call that just failed. Size-exceeded is the model's
    // input to fix (trim the body); a write failure is ours.
    if (error instanceof IrlBodyCacheSizeExceededError) {
      // Tells the model to trim the body before retrying — verbatim to `content`.
      return toolFail('invalid-input', error.message);
    }
    if (error instanceof IrlBodyCacheWriteFailedError) {
      return toolFail('internal-error', error.message);
    }
    throw error;
  }

  // BL-123 — record what the server witnessed, so `compose_dossier_envelope`
  // can cap an over-strong `irlSource` claim instead of trusting the model's
  // assertion. Deliberately AFTER the body write and deliberately not guarded:
  // the store swallows its own failures, because a missing provenance record
  // only weakens an audit claim while a missing body corrupts the dossier
  // (ADR-0016's trade). First-write-wins is enforced inside the store.
  await metrics?.irlBodyProvenance?.record(irlBodyHash, {
    mintedBy,
    mintedAt: new Date().toISOString(),
    byteLength,
    newlineCount: structure.newlineCount,
  });

  const result: PrepareIrlBodyOutput = { irlBodyHash, byteLength };
  return toolOk(result, `IRL body hashed (${byteLength} bytes).`);
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
      inputSchema: PrepareIrlBodyInputSchema,
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
