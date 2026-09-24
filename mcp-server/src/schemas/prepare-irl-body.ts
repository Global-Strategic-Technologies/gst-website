/**
 * BL-068 — `prepare_irl_body` preflight tool schemas.
 *
 * The MCP server's `compose_dossier_envelope` tool enforces a hash-bind:
 * model-supplied `irlBodyHash` must equal `sha256(filledIrl).slice(0,16)`.
 * LLMs cannot reliably compute sha256 in-head, so the 2-attempt
 * "guess → reject → retry with bash-computed hash" pattern is the
 * structural floor under BL-049.
 *
 * `prepare_irl_body` is a preflight ergonomics tool: the model passes
 * the same `filledIrl` body here first, receives the canonical
 * `irlBodyHash`, then submits both to `compose_dossier_envelope` on
 * the first call. This eliminates the hash-bind retry for compliant
 * clients (those that read tool descriptions). Non-compliant clients
 * still hit the existing `IrlBodyHashMismatchError` rejection — no
 * regression, just no improvement.
 *
 * Note: this is NOT a new forcing function. The forcing function is
 * still `IrlBodyHashMismatchError` (BL-049). `prepare_irl_body` is a
 * retry-elimination ergonomics layer on top of it.
 */

import { z } from 'zod';
import { IRL_BODY_CACHE_MAX_BYTES_TEXT } from '../cache/irl-body-cache';

const FILLED_IRL_MIN_BYTES = 200;

export const PrepareIrlBodyInputSchema = z.object({
  filledIrl: z
    .string()
    .min(FILLED_IRL_MIN_BYTES)
    .describe(
      'The verbatim IRL markdown body, byte-for-byte as supplied — the server caches exactly these bytes and hashes them without normalization. ' +
        `Must be ≥${FILLED_IRL_MIN_BYTES} characters; bodies over ${IRL_BODY_CACHE_MAX_BYTES_TEXT} bytes are rejected with \`invalid-input\`.`
    ),
});

export type PrepareIrlBodyInput = z.infer<typeof PrepareIrlBodyInputSchema>;

export interface PrepareIrlBodyOutput {
  irlBodyHash: string;
  byteLength: number;
  /**
   * ISO-8601 mint time held by the IRL body provenance store for this hash —
   * the STORED value, not this call's clock. The store is first-write-wins, so
   * a repeat call inside the 4 h window (or one following the prompt-render
   * prepop) returns the ORIGINAL mint time.
   *
   * Optional because the store swallows its own failures by design (a missing
   * provenance record only weakens an audit claim, while a missing body
   * corrupts the dossier — ADR-0016's trade). Absent means no record landed;
   * the consumer falls back to a model-asserted timestamp rather than claiming
   * a witness it was not given.
   *
   * A plain interface field, not a wire-schema change: this is the tool's
   * output type, and the tool publishes no output schema.
   */
  mintedAt?: string;
}
