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

// BL-053: citation accepts EITHER a single string (the historical shape) OR
// an array of citation strings for multi-bullet claims. Array elements are
// verified per-element; the verdict is aggregated. Cap at 8 elements — beyond
// that the citation is doing the work of a section reference and should be
// re-shaped.
const citationFieldSchema = z
  .union([z.string().min(1), z.array(z.string().min(1)).min(1).max(8)])
  .describe(
    'The citation backing the claim. EITHER a single citation string ("Section NN — <excerpt>" or "Section -- — partner-supplied form input — <description>") OR an array of citation strings (1-8 elements) when the claim genuinely derives from multiple supporting IRL bullets. When an array, the verifier checks each element independently and aggregates: any element unverified → aggregate unverified; all elements verified verbatim → verified; mixed verified + verified-fuzzy → verified-fuzzy; all partner-supplied → partner-supplied. Use the array form for multi-bullet syntheses (TechPar verdicts citing eng count + hosting + salary; comparables joining portfolio rows; derivations spanning Section 04 + 07).'
  );

const citationEntrySchema = z.object({
  path: z
    .string()
    .min(1)
    .describe(
      'Dot-path identifying the citation site in the dossier or _audit payload, e.g., "_audit.revenueRange.citation" or "section-C.headline". The tool echoes this back in the verdict so the model can attribute each verdict to the right claim.'
    ),
  citation: citationFieldSchema,
});

export { citationFieldSchema };

/**
 * BL-079 — body reference may arrive as the verbatim body OR as the 16-hex
 * canonical hash that re-hydrates from the shared `IrlBodyCache`. Exactly the
 * same shape as `compose_dossier_envelope.irlBodyHash` (see
 * `src/schemas/compose-dossier-envelope.ts:57`); duplicated locally to avoid
 * a circular import between the two schemas.
 */
const IRL_BODY_HASH_REGEX = /^[a-f0-9]{16}$/;

/**
 * Underlying ZodObject (no `.refine`) — exposed so `registerTool` can read
 * `.shape` for the MCP inputSchema. The `.refine` cross-field rule lives on
 * `ValidateIrlProvenanceInputSchema` below; the handler explicitly enforces
 * "at least one of filledIrl / irlBodyHash" since `registerTool` only sees
 * the per-field shape.
 */
export const ValidateIrlProvenanceInputObject = z.object({
  filledIrl: z
    .string()
    .min(200)
    .optional()
    .describe(
      'The verbatim IRL body (markdown), same shape as the gst_irl_ingestion prompt arg. Used as the haystack for excerpt verification. ' +
        'Optional. If `irlBodyHash` is supplied AND populated in the server-side IRL body cache (via a prior `prepare_irl_body` call, or the prompt-render cache pre-pop path), the server re-hydrates the body from cache and `filledIrl` may be omitted. ' +
        'For interactive / xlsx-reconstruction mode where the cache is not pre-populated, this remains the canonical path. ' +
        '`filledIrl` takes precedence when both fields are supplied (legacy compatibility for callers that emit both).'
    ),
  irlBodyHash: z
    .string()
    .regex(IRL_BODY_HASH_REGEX, 'irlBodyHash must be exactly 16 lowercase hex characters')
    .optional()
    .describe(
      'Body-by-hash mode. When the operator supplies `filledIrl` as a `gst_irl_ingestion` prompt arg, the prompt-build wrapper pre-populates the IRL body cache. The model copies the `**Body-binding hash:**` directive verbatim into this field and omits `filledIrl`. ' +
        'The model can also pass the hash returned by `prepare_irl_body` to skip emitting the full body twice in the precheck loop. ' +
        'Server re-hydrates from cache for citation matching. Falls back to `Bl076BodyCacheMissError` if the cache write did not land (operator should retry, or call `prepare_irl_body` to re-seed). For interactive / xlsx-reconstruction mode where the cache is not pre-populated, omit this field and supply `filledIrl` instead.'
    ),
  citations: z
    .array(citationEntrySchema)
    .min(1)
    .describe(
      'Citations to verify. Each entry pairs a path identifier with the citation string. Order is preserved in the response.'
    ),
});

/**
 * Full input schema with the BL-079 cross-field rule. Use this for explicit
 * parsing in tests and at any handler boundary that needs the refine
 * enforced. The MCP SDK consumes `ValidateIrlProvenanceInputObject.shape` at
 * `registerTool` time, which does NOT carry refine — the handler enforces
 * the "at least one of filledIrl / irlBodyHash" invariant explicitly.
 */
export const ValidateIrlProvenanceInputSchema = ValidateIrlProvenanceInputObject.refine(
  (input) => Boolean(input.filledIrl) || Boolean(input.irlBodyHash),
  {
    message:
      'At least one of `filledIrl` / `irlBodyHash` MUST be supplied. ' +
      'Body-by-hash path: pass `irlBodyHash` alone (server re-hydrates from the IrlBodyCache populated by `prepare_irl_body` or the prompt-render pre-pop path). ' +
      'Legacy interactive / xlsx-reconstruction path: pass `filledIrl` alone. ' +
      'Both allowed — `filledIrl` takes precedence when present (legacy callers).',
  }
);

export type ValidateIrlProvenanceInput = z.infer<typeof ValidateIrlProvenanceInputObject>;

/**
 * BL-079 — engine-internal input shape. The public schema makes `filledIrl`
 * optional (the handler may resolve it from the IRL body cache via
 * `irlBodyHash`); the pure-function engine still requires the body as a
 * non-empty string. The handler is the single resolution point between the
 * two — schema parses, handler resolves, engine matches.
 */
export interface RunIrlProvenanceCheckInput {
  filledIrl: string;
  citations: ValidateIrlProvenanceInput['citations'];
}

export interface ValidateIrlProvenanceVerdict {
  path: string;
  /** Echoes back the original citation shape — string for legacy single-bullet form, array for BL-053 multi-bullet form. */
  citation: string | string[];
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
 *
 * BL-049 closeout hardening (2026-07-09): curly quotes (U+2018 U+2019
 * U+201C U+201D) flatten to space alongside their straight equivalents,
 * so `don’t` in a citation matches `don't` in the body and vice versa —
 * the last encoding-drift class from the BL-049 problem statement
 * (em-dashes were already flattened; NBSP variants are already covered
 * because JS `\s` matches all Unicode space separators).
 */
export function normalizeForMatching(s: string): string {
  return s
    .toLowerCase()
    .replace(/[*`_~]+/g, '')
    .replace(/[—–-]+/g, ' ')
    .replace(/[,;:.?!()[\]{}'"‘’“”/+]+/g, ' ')
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
 * SanFran live runs: the longest run of matching words between
 * model-paraphrased citations and the IRL was ≥12 in every v5+
 * trace; v2-v4 fabrications had runs ≤4.
 */
export const FUZZY_MIN_RUN = 8;

/**
 * Verify a single citation string against the normalized IRL.
 * Extracted from `runIrlProvenanceCheck` so the BL-053 array-form
 * aggregator can reuse the same logic per-element.
 */
type ElementStatus = 'verified' | 'verified-fuzzy' | 'partner-supplied' | 'unverified';

function verifyCitationString(
  citation: string,
  haystackNorm: string,
  haystackWords: string[]
): { status: ElementStatus; matchedSpan?: string } {
  if (isPartnerSupplied(citation)) {
    return { status: 'partner-supplied' };
  }
  const excerpt = extractExcerpt(citation);
  const excerptNorm = normalizeForMatching(excerpt);
  if (excerptNorm.length === 0) {
    return { status: 'unverified' };
  }
  if (haystackNorm.includes(excerptNorm)) {
    return { status: 'verified', matchedSpan: excerptNorm };
  }
  const excerptWords = excerptNorm.split(' ').filter((w) => w.length > 0);
  const runLen = longestContiguousRun(excerptWords, haystackWords);
  if (runLen >= FUZZY_MIN_RUN) {
    return {
      status: 'verified-fuzzy',
      matchedSpan: `<run of ${runLen} consecutive words matched>`,
    };
  }
  return { status: 'unverified' };
}

/**
 * BL-053 aggregation rule for array-form citations. Applied when an
 * entry's `citation` is an array of strings (multi-bullet claim).
 *
 *   - ANY element unverified  → aggregate `unverified` (weakest verdict
 *     dominates failure — the claim has unsupported provenance).
 *   - ALL elements partner-supplied → `partner-supplied`.
 *   - ALL elements verified verbatim → `verified`.
 *   - Mixed verified + partner-supplied (no fuzzy, no unverified) → `verified`.
 *   - Any verified-fuzzy in the mix → `verified-fuzzy` (fuzzy taints
 *     the aggregate down to fuzzy verification).
 *
 * Rationale: a claim genuinely supported by multiple IRL bullets should
 * verify only when EVERY supporting bullet is anchored. Allowing
 * partner-supplied to mask unverified would invert the incentive.
 */
function aggregateArrayVerdict(
  elementStatuses: ElementStatus[],
  elementSpans: (string | undefined)[]
): { status: ElementStatus; matchedSpan?: string } {
  if (elementStatuses.some((s) => s === 'unverified')) {
    return { status: 'unverified' };
  }
  const allPartner = elementStatuses.every((s) => s === 'partner-supplied');
  if (allPartner) {
    return { status: 'partner-supplied' };
  }
  const anyFuzzy = elementStatuses.some((s) => s === 'verified-fuzzy');
  if (anyFuzzy) {
    return {
      status: 'verified-fuzzy',
      matchedSpan: `<${elementStatuses.length}-element citation array, includes fuzzy>`,
    };
  }
  const firstSpan = elementSpans.find((s) => s !== undefined);
  return {
    status: 'verified',
    matchedSpan: `<${elementStatuses.length}-element citation array, all verified${firstSpan ? `, first: ${firstSpan}` : ''}>`,
  };
}

/**
 * Run the provenance verification engine over an input payload.
 * Pure function — no I/O, no global state. Suitable for unit testing
 * the matching logic in isolation from the MCP transport.
 *
 * BL-053: when `entry.citation` is an array, each element is verified
 * independently with `verifyCitationString` and aggregated with
 * `aggregateArrayVerdict`. The per-entry verdict echoes back the
 * original citation shape (string or array) so the model can attribute
 * verdicts to its emitted citation structure unchanged.
 */
export function runIrlProvenanceCheck(
  input: RunIrlProvenanceCheckInput
): ValidateIrlProvenanceResult {
  const haystackNorm = normalizeForMatching(input.filledIrl);
  const haystackWords = haystackNorm.split(' ').filter((w) => w.length > 0);

  const verdicts: ValidateIrlProvenanceVerdict[] = [];
  let verified = 0;
  let verifiedFuzzy = 0;
  let partnerSupplied = 0;
  let unverified = 0;

  for (const entry of input.citations) {
    let aggregate: { status: ElementStatus; matchedSpan?: string };
    if (typeof entry.citation === 'string') {
      aggregate = verifyCitationString(entry.citation, haystackNorm, haystackWords);
    } else {
      const elementResults = entry.citation.map((c) =>
        verifyCitationString(c, haystackNorm, haystackWords)
      );
      aggregate = aggregateArrayVerdict(
        elementResults.map((r) => r.status),
        elementResults.map((r) => r.matchedSpan)
      );
    }
    verdicts.push({
      path: entry.path,
      citation: entry.citation,
      status: aggregate.status,
      ...(aggregate.matchedSpan ? { matchedSpan: aggregate.matchedSpan } : {}),
    });
    switch (aggregate.status) {
      case 'verified':
        verified++;
        break;
      case 'verified-fuzzy':
        verifiedFuzzy++;
        break;
      case 'partner-supplied':
        partnerSupplied++;
        break;
      case 'unverified':
        unverified++;
        break;
    }
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
