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

const FILLED_IRL_MIN_BYTES = 200;

export const PrepareIrlBodyInputSchema = z.object({
  filledIrl: z
    .string()
    .min(FILLED_IRL_MIN_BYTES)
    .describe(
      'The verbatim IRL markdown body — exactly the bytes you intend to pass to `compose_dossier_envelope.filledIrl`. ' +
        'Must be ≥200 chars (matches the `compose_dossier_envelope` constraint).'
    ),
});

export type PrepareIrlBodyInput = z.infer<typeof PrepareIrlBodyInputSchema>;

export interface PrepareIrlBodyOutput {
  irlBodyHash: string;
  byteLength: number;
}
