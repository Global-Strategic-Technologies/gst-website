/**
 * The `irlSource` vocabulary — how the bytes of an IRL body were assembled.
 *
 * Extracted to its own module so the two consumers share one tuple rather than
 * maintaining parallel literals: `compose-dossier-envelope.ts` (where the model
 * asserts it and `capIrlSource` may downgrade it) and `irl-extract-record.ts`
 * (where a travelling record states the provenance of the body it was extracted
 * from). A shared module rather than an import between those two, because
 * `compose-dossier-envelope.ts` already imports `ORCHESTRATED_TOOLS` from
 * `prompts/irl-ingestion.ts` and the record schema is imported BY that prompt —
 * so a direct import would close a cycle the ingestion module goes out of its
 * way to avoid (see `computeIrlBodyHashForBody`, inlined for exactly that
 * reason).
 */

/**
 * Five values, matching the set the prompt's RUN-AUDIT block sketches list.
 *
 * `partner-paste-verbatim-prepop` (BL-079 Part B) is the strongest form: the
 * operator pasted the IRL markdown into the prompt arg AND the server
 * pre-populated the body cache at prompt-render time, so the cache contents are
 * byte-equal to the prompt arg with no model-emission round trip.
 */
export const IRL_SOURCE_VALUES = [
  'partner-paste-verbatim',
  'partner-paste-verbatim-prepop',
  'model-reconstruction-from-xlsx',
  'model-reconstruction-trimmed',
  'placeholder',
] as const;

export type IrlSource = (typeof IRL_SOURCE_VALUES)[number];
