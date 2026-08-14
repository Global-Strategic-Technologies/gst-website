/**
 * BL-123 — structural integrity check for a `filledIrl` body.
 *
 * **The failure this exists for.** Claude Desktop renders every prompt-argument
 * field as a single-line `<input>`. Pasting a multi-line markdown IRL into it
 * collapses every newline to a space before the argument ever reaches the
 * server. Measured against the production artifact that surfaced this
 * (2026-08-13): 141 newlines became 0, the byte length moved by −1 (140
 * newlines became spaces; the trailing one was trimmed), and the content
 * differed at 140 positions. The byte delta reads like an off-by-one and is
 * not one — it is total loss of line structure.
 *
 * Nothing downstream could see it. The server hashes what it receives, caches
 * it, and reports the hash honestly, so the run completes looking clean while
 * the section headers, blockquotes and bullet boundaries the dossier depends
 * on are gone.
 *
 * **Repair is impossible and must not be attempted.** `\n → " "` is lossy: in a
 * ~79KB body there is no way to tell which of ~13,000 spaces used to be line
 * breaks. The only correct response is refusal.
 *
 * ─── Why the test is narrow rather than clever ────────────────────────────
 *
 * The tempting generalization is a bytes-per-line ratio. It is wrong here. A
 * real filled IRL already runs ~560 bytes/line, because individual answers are
 * long prose paragraphs on one line — so a ratio threshold tight enough to
 * catch partial mangling would false-positive on legitimate bodies and block
 * real operator work. The observed failure is *total* collapse, which is
 * unambiguous: a multi-kilobyte body claiming to be a ten-section markdown
 * document cannot have zero line breaks.
 *
 * So: certainty over cleverness. If you are reading this intending to
 * "improve" the check into a heuristic, the false-positive cost lands on an
 * operator mid-engagement who cannot proceed and has no way to override.
 */

/**
 * Byte floor below which a newline-free body is not treated as flattened.
 *
 * `filledIrl` carries `.min(200)` at the schema, so this floor sits an order of
 * magnitude above the smallest accepted body: a legitimately terse IRL is never
 * caught. Anything past 2KB with no line break at all is a destroyed document,
 * not a compact one.
 */
export const FLATTENED_BODY_BYTE_FLOOR = 2000;

export interface IrlBodyStructure {
  /** UTF-8 byte length of the body. */
  byteLength: number;
  /**
   * Count of newline CHARACTERS — deliberately not `split('\n').length`, which
   * returns 1 for a newline-free string and would make the `=== 0` test dead.
   */
  newlineCount: number;
  /** True when the body shows the total-collapse signature described above. */
  flattened: boolean;
}

export function assessIrlBodyStructure(body: string): IrlBodyStructure {
  const byteLength = Buffer.byteLength(body, 'utf8');
  let newlineCount = 0;
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === '\n') newlineCount += 1;
  }
  return {
    byteLength,
    newlineCount,
    flattened: newlineCount === 0 && byteLength > FLATTENED_BODY_BYTE_FLOOR,
  };
}

/**
 * Operator-facing explanation, shared by every refusal site so the diagnosis
 * reads identically whether it surfaces in a rendered prompt body or a tool
 * error. States that this is a client limitation rather than operator error —
 * the operator did nothing wrong, and telling them so is what stops them
 * retrying the identical paste.
 */
export function flattenedBodyExplanation(structure: IrlBodyStructure): string {
  return [
    `The IRL body arrived with **no line breaks at all** (${structure.byteLength} bytes, 0 newlines).`,
    '',
    'This is a client limitation, not an error on your part. Claude Desktop renders each prompt argument as a single-line input field, so pasting a multi-line markdown IRL into it collapses every newline to a space before the server sees it. The bytes are intact but the document structure — section headers, blockquotes, per-item boundaries — is gone, and it cannot be reconstructed: there is no way to tell which spaces used to be line breaks.',
    '',
    'A dossier built on this body would look clean and cite a structure that is no longer there, so the run stops here rather than proceeding.',
    '',
    '**To proceed**, supply the IRL through a path that preserves newlines — attach the `.md` or `.xlsx` file to the conversation and invoke the prompt without `filledIrl` (interactive mode will walk you through it), or call the prompt from a client whose argument input accepts multi-line text.',
  ].join('\n');
}
