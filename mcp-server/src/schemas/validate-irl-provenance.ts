/**
 * BL-045 PR B Phase 2B — `validate_irl_provenance` tool schema + engine.
 *
 * **Why this exists** (per BL-045 § M6 honestly-scoped):
 *
 * The Phase 1/2 audit refinements enforce structural citation shape but
 * cannot verify that a citation's excerpt actually appears in the supplied
 * IRL body — the IRL isn't in scope at the diligence-agenda / TechPar /
 * tech-debt tool input. A model that obeys every structural rule can
 * still fabricate the excerpt itself ("Section 02 row 43 — Engineering
 * FTE 71" when the IRL actually says 58). The audit then ships a
 * partner-misleading number wrapped in plausible-looking provenance.
 *
 * Phase 2B closes that gap with a dedicated tool the model invokes
 * during the (K) provenance footer / provenance-citation self-check
 * pass: pass the IRL body + every load-bearing citation; the tool
 * verifies each excerpt appears (verbatim or near-verbatim) in the IRL
 * and returns three groups:
 *
 *   - `verified` — excerpt is a substring of the normalized IRL.
 *   - `verifiedFuzzy` — excerpt is not verbatim but a long contiguous-
 *     word run from it (≥8 words) appears in the IRL. Allows for minor
 *     paraphrasing in the citation while flagging real fabrication.
 *   - `partnerSupplied` — citation uses the `"Section --"` sentinel; no
 *     IRL anchor exists by design (kickoff/handoff partner-form path).
 *   - `unverified` — neither verbatim nor fuzzy match. Likely
 *     fabrication; partner should remove the claim or supply real
 *     provenance.
 *
 * The tool is pure: no engine call, no Hub deeplink. It exists solely
 * to give the model a structural verification step that surfaces
 * unverifiable claims in the dossier's (J) gap list rather than letting
 * them ride.
 *
 * Same SDK-shape constraints as the other audit schemas — plain
 * ZodObject; logic lives in the handler.
 */

import { z } from 'zod';

// ─── Schema ─────────────────────────────────────────────────────────────

const citationEntrySchema = z.object({
  path: z
    .string()
    .min(1)
    .describe(
      'Dot-path identifying the citation site in the dossier or _audit payload, e.g., "_audit.revenueRange.citation" or "section-C.headline". The tool echoes this back in the verdict so the model can attribute each verdict to the right claim.'
    ),
  citation: z
    .string()
    .min(1)
    .describe(
      'The citation string the model emitted. Form: "Section NN — <excerpt>" or "Section -- — partner-supplied form input — <description>".'
    ),
});

export const ValidateIrlProvenanceInputSchema = z.object({
  filledIrl: z
    .string()
    .min(200)
    .describe(
      'The populated IRL body (markdown), same shape as the gst_irl_ingestion prompt arg. Used as the haystack for excerpt verification.'
    ),
  citations: z
    .array(citationEntrySchema)
    .min(1)
    .describe(
      'Citations to verify. Each entry pairs a path identifier with the citation string. Order is preserved in the response.'
    ),
});

export type ValidateIrlProvenanceInput = z.infer<typeof ValidateIrlProvenanceInputSchema>;

export interface ValidateIrlProvenanceVerdict {
  path: string;
  citation: string;
  status: 'verified' | 'verified-fuzzy' | 'partner-supplied' | 'unverified';
  matchedSpan?: string;
}

export interface ValidateIrlProvenanceResult {
  total: number;
  verified: number;
  verifiedFuzzy: number;
  partnerSupplied: number;
  unverified: number;
  verdicts: ValidateIrlProvenanceVerdict[];
}

// ─── Engine ─────────────────────────────────────────────────────────────

/**
 * Normalize a string for matching: lowercase, strip the common
 * markdown noise (asterisks, backticks, em-dashes, soft hyphens),
 * collapse whitespace. Punctuation that disambiguates words (commas,
 * colons, periods) is preserved as whitespace so word boundaries are
 * still meaningful for the fuzzy-run check.
 *
 * BL-049 defensive hardening: `/` and `+` are also flattened to space so
 * `cad/mo` and `hosting + infrastructure` decompose into word boundaries
 * the fuzzy-run logic can use. Before this, `cad/mo` survived intact as
 * a single token, which made `cad/mo` in citation vs `cad / mo` in body
 * fail substring AND fuzzy.
 */
export function normalizeForMatching(s: string): string {
  return s
    .toLowerCase()
    .replace(/[*`_~]+/g, '')
    .replace(/[—–-]+/g, ' ')
    .replace(/[,;:.?!()[\]{}'"/+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract the excerpt portion of a citation — everything after the
 * LAST em-dash. Citations in the BL-045 audit shape are
 * "Section NN <header text> — <excerpt>". The excerpt is what the
 * verification operates over.
 *
 * BL-049 defensive hardening: anchors on `lastIndexOf('—')` rather than
 * the first em-dash so multi-em-dash citations (e.g., a citation that
 * echoes a canonical section header containing its own em-dash —
 * `"Section 02 — Software Architecture — 2-05 — text"`) extract the
 * trailing excerpt correctly rather than dragging the header in as
 * noise. For single-em-dash citations (the canonical "Section NN row N-NN
 * — excerpt" shape v11 actually emitted), behavior is unchanged.
 */
export function extractExcerpt(citation: string): string {
  const dashIdx = citation.lastIndexOf('—');
  if (dashIdx === -1) return citation;
  return citation.slice(dashIdx + 1).trim();
}

/**
 * Test whether the partner-supplied sentinel is present. The kickoff +
 * handoff prompts emit citations with `Section --` (literal two
 * hyphens) and the phrase `partner-supplied form input` — both must be
 * present to count as a partner-supplied sentinel (defensive: avoids
 * a real `Section -- — Some Section` from being misclassified).
 */
function isPartnerSupplied(citation: string): boolean {
  // `\bsection\s+--` matches "Section --"; we don't trail with `\b` because
  // `-` is non-word so the boundary after `--` is missing whenever the
  // next char is whitespace (the common case). The literal "--" with
  // word-boundary before "section" is discriminating enough.
  return /\bsection\s+--/i.test(citation) && /partner-supplied form input/i.test(citation);
}

/**
 * Longest contiguous-word run from `needleWords` that appears (in
 * order) anywhere inside `haystackWords`. Returns the maximum run
 * length found.
 *
 * Quadratic O(n·m) on word counts — fine for the use case (citation
 * excerpts are typically 5-30 words; IRL bodies typically <10k words).
 */
function longestContiguousRun(needleWords: string[], haystackWords: string[]): number {
  if (needleWords.length === 0 || haystackWords.length === 0) return 0;
  let best = 0;
  // Build a haystack-word→positions map once so the inner loop is
  // bounded by the actual occurrence count of each needle starter
  // rather than the full haystack length.
  const positionsOf = new Map<string, number[]>();
  for (let i = 0; i < haystackWords.length; i++) {
    const w = haystackWords[i];
    const list = positionsOf.get(w);
    if (list) list.push(i);
    else positionsOf.set(w, [i]);
  }
  for (let i = 0; i < needleWords.length; i++) {
    const starts = positionsOf.get(needleWords[i]);
    if (!starts) continue;
    for (const start of starts) {
      let run = 0;
      while (
        i + run < needleWords.length &&
        start + run < haystackWords.length &&
        needleWords[i + run] === haystackWords[start + run]
      ) {
        run++;
      }
      if (run > best) best = run;
    }
  }
  return best;
}

/**
 * Minimum contiguous-word run required for a fuzzy verification.
 *
 * Rationale: 8 consecutive words is long enough that random co-
 * occurrence in an IRL body is implausible (a uniform 1k-word
 * vocabulary gives ~1e-24 probability of 8-word match by chance)
 * yet short enough that the model can paraphrase a comma-and-or
 * cleanup without losing verification. Calibration based on the
 * StoreForce live runs: the longest run of matching words between
 * model-paraphrased citations and the IRL was ≥12 in every v5+
 * trace; v2-v4 fabrications had runs ≤4.
 */
export const FUZZY_MIN_RUN = 8;

/**
 * Run the provenance verification engine over an input payload.
 * Pure function — no I/O, no global state. Suitable for unit testing
 * the matching logic in isolation from the MCP transport.
 */
export function runIrlProvenanceCheck(
  input: ValidateIrlProvenanceInput
): ValidateIrlProvenanceResult {
  const haystackNorm = normalizeForMatching(input.filledIrl);
  const haystackWords = haystackNorm.split(' ').filter((w) => w.length > 0);

  const verdicts: ValidateIrlProvenanceVerdict[] = [];
  let verified = 0;
  let verifiedFuzzy = 0;
  let partnerSupplied = 0;
  let unverified = 0;

  for (const entry of input.citations) {
    if (isPartnerSupplied(entry.citation)) {
      verdicts.push({ path: entry.path, citation: entry.citation, status: 'partner-supplied' });
      partnerSupplied++;
      continue;
    }
    const excerpt = extractExcerpt(entry.citation);
    const excerptNorm = normalizeForMatching(excerpt);
    if (excerptNorm.length === 0) {
      verdicts.push({ path: entry.path, citation: entry.citation, status: 'unverified' });
      unverified++;
      continue;
    }
    if (haystackNorm.includes(excerptNorm)) {
      verdicts.push({
        path: entry.path,
        citation: entry.citation,
        status: 'verified',
        matchedSpan: excerptNorm,
      });
      verified++;
      continue;
    }
    const excerptWords = excerptNorm.split(' ').filter((w) => w.length > 0);
    const runLen = longestContiguousRun(excerptWords, haystackWords);
    if (runLen >= FUZZY_MIN_RUN) {
      verdicts.push({
        path: entry.path,
        citation: entry.citation,
        status: 'verified-fuzzy',
        matchedSpan: `<run of ${runLen} consecutive words matched>`,
      });
      verifiedFuzzy++;
      continue;
    }
    verdicts.push({ path: entry.path, citation: entry.citation, status: 'unverified' });
    unverified++;
  }

  return {
    total: input.citations.length,
    verified,
    verifiedFuzzy,
    partnerSupplied,
    unverified,
    verdicts,
  };
}
