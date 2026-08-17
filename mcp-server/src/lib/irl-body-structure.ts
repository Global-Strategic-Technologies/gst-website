/**
 * BL-123 / BL-124 — byte and newline measurement for a `filledIrl` body.
 *
 * **What this is now**: two counts, used as an operator diagnostic. Nothing
 * refuses on them.
 *
 * ─── Why the refusal was withdrawn (read before reinstating it) ───────────
 *
 * BL-123 shipped a check that HALTED the run when a body arrived with zero
 * newlines — the signature of Claude Desktop collapsing a multi-line paste,
 * because it renders each prompt argument as a single-line input. BL-124
 * withdrew that halt one day later. The reasoning, so it is not re-derived
 * from scratch:
 *
 *   - **Citation verification cannot tell the difference.** `normalizeForMatching`
 *     in `src/schemas/validate-irl-provenance.ts` applies `.replace(/\s+/g, ' ')`
 *     before both the substring check and the word-run tokenizer — the exact
 *     transformation the client performed. Flattening is a provable no-op there.
 *   - **Nothing else reads line structure.** The only `split(/\r?\n/)` sites in
 *     this workspace parse the IRL *generator source* and a different prompt's
 *     `customRequests` arg. The extractor produces bodies and never consumes
 *     one. The fill-ratio pre-flight keys on `N-NN` reference ids.
 *   - **Byte-identity was the wrong proxy.** The hash-bind exists to catch the
 *     model substituting a condensed PARAPHRASE for the partner's text.
 *     Flattening is not paraphrase: every word survives, in order.
 *   - **The cost was total.** The smallest IRL fixture in this repo is 4,256 B,
 *     so the halt fired at every realistic size, and its own remediation
 *     (interactive mode) cannot carry a large body — that path needs the model
 *     to emit the whole thing as a tool argument, ~21k output tokens for an
 *     80KB IRL. Operators were left with no completing path at all.
 *
 * The harm was asserted from first principles and never demonstrated. If you
 * are considering a refusal again, demonstrate the harm first.
 *
 * ─── What survived, and why ──────────────────────────────────────────────
 *
 * The newline count. A flattened body will not hash-match the file on the
 * operator's disk, and explaining THAT mismatch is the one thing with residual
 * value — it cost a full investigation session to work out the first time. It
 * surfaces as `serverCachedBodyNewlines` on the envelope response and as
 * `filledIrl.newlines` in the RUN-AUDIT block. `newlines: 0` on a multi-kilobyte
 * body means the client collapsed the paste. That is information, not an error.
 */

export interface IrlBodyStructure {
  /** UTF-8 byte length of the body. */
  byteLength: number;
  /**
   * Count of newline CHARACTERS — deliberately not `split('\n').length`, which
   * returns 1 for a newline-free string and would make a `=== 0` comparison dead.
   */
  newlineCount: number;
}

export function assessIrlBodyStructure(body: string): IrlBodyStructure {
  const byteLength = Buffer.byteLength(body, 'utf8');
  let newlineCount = 0;
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === '\n') newlineCount += 1;
  }
  return { byteLength, newlineCount };
}
