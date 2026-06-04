/**
 * BL-045 PR B — `compose_dossier_envelope` tool schema + engine.
 *
 * **The forcing-function pattern, applied to dossier rendering.**
 *
 * v8 + v9 StoreForce traces showed an empirical pattern identical to
 * the v2/v3/v4 dimension-layer findings: the model treats prompt-body
 * directives as descriptive context, not as a procedure. Schema-enforced
 * rules (Phase 1/2/2A) force conformance because rejection at the tool
 * seam is non-negotiable; body directives that say "BLOCKING — emit X"
 * land partially or not at all.
 *
 * Concretely, v9 had genuinely A-grade content but no top-of-dossier
 * meta JSON fence, no per-section audit fences, and no (K) provenance
 * footer — the verbose-mode rendering directives weren't honored.
 *
 * **This tool closes that gap with the same architectural pattern that
 * solved the dimension-layer fabrication risk**: externalize the
 * structure into a tool input the model has to assemble before composing
 * the dossier, then return the rendered envelope (meta fence + (J) gap
 * list + (K) provenance footer) as markdown the model transcribes
 * verbatim. The model cannot compose the dossier without the envelope
 * because the envelope IS what the model has to call the tool to produce.
 *
 * Internally the tool also runs `runIrlProvenanceCheck` against every
 * load-bearing claim and auto-appends `provenance-gap:` entries to (J)
 * for fabrications — so the provenance-citation self-check fires as a
 * side-effect of calling the tool rather than relying on the model to
 * remember the directive.
 *
 * Same SDK-shape constraints as the other audit schemas: plain ZodObject;
 * logic lives in pure functions exported for unit testing.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { CONDITIONAL_TRIGGER_NAMES } from '../prompts/extraction-rules';
import { ORCHESTRATED_TOOLS } from '../prompts/irl-ingestion';
import {
  runIrlProvenanceCheck,
  type ValidateIrlProvenanceVerdict,
} from './validate-irl-provenance';

// ─── Hash-bind helpers (BL-045 PR B audit BL-2 → ALT-1) ────────────────
//
// The hash-bind forcing function: server embeds `sha256(args.filledIrl)
// .slice(0, 16)` in the prompt body; model copies it into the tool input;
// tool verifies `sha256(input.filledIrl).slice(0, 16) === input.irlBodyHash`
// and rejects on mismatch. Catches the v10 failure mode (model passed a
// condensed paraphrase of the IRL as filledIrl) without relying on the
// model to obey a prose directive. Architecturally identical to the
// dimension-layer schema enforcement pattern.

const IRL_BODY_HASH_LENGTH = 16;
const IRL_BODY_HASH_REGEX = /^[a-f0-9]{16}$/;

export function computeIrlBodyHash(filledIrl: string): string {
  return createHash('sha256').update(filledIrl).digest('hex').slice(0, IRL_BODY_HASH_LENGTH);
}

// ─── Enums shared with the prompt body's args ──────────────────────────

const modeValues = ['full', 'extract-only'] as const;
const verbosityValues = ['verbose', 'compact'] as const;
const transactionContextValues = ['sell-side', 'buy-side', 'value-creation', 'unknown'] as const;
const fillRatioStatusValues = ['halt', 'partial', 'ok'] as const;
const tierValues = ['1', '2', '3'] as const;

// BL-045 PR B audit MA-6: tier-mismatch surfaced as its own category so the
// partner can distinguish "this tier-1 claim's excerpt isn't in the IRL"
// (structurally damning) from a generic "we couldn't verify this".
// BL-049 v11 Finding B (KEPT after v0.13.1 partial revert): tier-fabrication
// surfaced as its own category to close the demote-to-dodge gaming pattern.
// Empirically validated in the v12 StoreForce live exercise (2026-06-04):
// model read the verifier's tier-fabrication diagnostic and chose to re-cite
// rather than relabel a tier-1 fabrication as tier-2 to dodge the discipline
// check. The verdict is derived from citation properties (substring +
// partner-supplied sentinel), not from model-declared tier, so demotion does
// not satisfy the check.
const gapCategoryValues = [
  'defaulted-dimension',
  'extraction-only',
  'gate-elided',
  'conditional-trigger',
  'currency-assumption',
  'map-absent',
  'provenance-gap',
  'tier-mismatch',
  'tier-fabrication',
] as const;

// ─── Sub-shapes ─────────────────────────────────────────────────────────

const fillRatioSchema = z.object({
  percent: z
    .number()
    .min(0)
    .max(100)
    .describe(
      'Computed fill ratio as a 0-100 percentage (substantive cells / total cells from the wrong-IRL pre-flight).'
    ),
  substantiveCells: z
    .number()
    .int()
    .min(0)
    .describe('Numerator: count of Response cells with substantive content.'),
  totalCells: z
    .number()
    .int()
    .min(1)
    .describe('Denominator: total Response cells across the 10 canonical IRL sections.'),
  status: z
    .enum(fillRatioStatusValues)
    .describe(
      '`halt` if percent < 15; `partial` if 15 <= percent < 40; `ok` otherwise. Drives meta-fence `fixtureFillRatioStatus`.'
    ),
});

const gateElidedSchema = z.object({
  tool: z.string().min(1),
  reason: z.string().min(1),
  irlSection: z
    .string()
    .min(1)
    .describe('Which IRL section would have satisfied the gate (for the (J) gap-list entry).'),
});

const claimSchema = z.object({
  claim: z
    .string()
    .min(1)
    .describe(
      'Short prose label of the load-bearing claim (e.g., "NRR 106%", "TechPar 46.8% above zone", "Tech Debt carrying cost $2.85M CAD/yr").'
    ),
  citation: z
    .string()
    .min(1)
    .describe(
      'IRL citation backing the claim, in the BL-045 audit shape: "Section NN row M — <excerpt>" or, for partner-supplied (non-IRL) inputs, "Section -- — partner-supplied form input — <description>".'
    ),
  tier: z
    .enum(tierValues)
    .describe(
      'Tier discipline: 1 = literal IRL bullet, 2 = one-step derivation, 3 = correlation/unknown.'
    ),
});

const gapEntrySchema = z.object({
  category: z
    .enum(gapCategoryValues)
    .describe(
      'Categorization for the (J) gap list. Allows the partner to scan/filter by category.'
    ),
  entry: z
    .string()
    .min(1)
    .describe('Prose entry for the gap list — one concrete data-room ask or open item.'),
  irlSection: z
    .string()
    .optional()
    .describe('Optional IRL section that would have answered the gap.'),
  followUp: z
    .string()
    .optional()
    .describe(
      'Optional concrete next step (e.g., JQL query, named owner to interview, document to request).'
    ),
});

// ─── Top-level input ────────────────────────────────────────────────────

// BL-045 PR B audit MA-2: tighter modelVersion regex rejects the obvious
// hallucinations the v10 trace produced ("0.0.2", "claude-opus-4-8" was
// fine but plain "claude" / empty / sentinel strings should bounce).
// Requires lowercase letter prefix + at least one digit chunk somewhere.
const MODEL_VERSION_REGEX = /^[a-z][a-z0-9_-]*\d[a-z0-9_-]*$/;

export const ComposeDossierEnvelopeInputSchema = z.object({
  // BL-045 PR B audit A revised: promptName remains a literal (already
  // was; BL-1 audit caught the stale diagnosis). promptVersion is now
  // OPTIONAL — the tool server-derives the canonical value from the
  // prompt module and overrides whatever the model passes; the schema
  // documents the field for client transparency but the value is not
  // load-bearing.
  promptName: z
    .literal('gst_irl_ingestion')
    .describe(
      'Must be the literal `gst_irl_ingestion`. The tool currently supports only this prompt; future shapes can be added in subsequent schema revisions.'
    ),
  promptVersion: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/)
    .optional()
    .describe(
      'OPTIONAL — the tool overrides whatever the model passes with the server-derived value from the prompt registry. Documented here for client transparency; supplying it is harmless but the field is not load-bearing. (BL-045 PR B audit fix for v10 promptVersion hallucination.)'
    ),
  modelVersion: z
    .string()
    .regex(
      MODEL_VERSION_REGEX,
      'modelVersion must match a vendor-family-version shape (e.g., "claude-opus-4-7", "gpt-4-turbo", "mistral-large-2407") — bare sentinels like "unknown" / "claude" are rejected.'
    )
    .describe(
      'Your model id at invocation time, e.g., "claude-opus-4-7". The tool validates the shape (lowercase, contains at least one digit chunk) to reject obvious hallucinations; the model is the only party that knows this value so it cannot be server-derived.'
    ),
  mode: z.enum(modeValues).describe('Execution mode the prompt args specified.'),
  verbosity: z.enum(verbosityValues).describe('Output verbosity the prompt args specified.'),
  transactionContext: z
    .enum(transactionContextValues)
    .describe('Engagement context the prompt args specified.'),
  fillRatio: fillRatioSchema.describe(
    'Output of the wrong-IRL pre-flight directive — the model must run that computation before calling this tool.'
  ),
  // BL-045 PR B audit MA-5: gatesPassed tightened to the orchestrated-
  // tool enum derived from `ORCHESTRATED_TOOLS` so future tool additions
  // can't drift the schema. The model now cannot list arbitrary strings.
  gatesPassed: z
    .array(z.enum(ORCHESTRATED_TOOLS))
    .describe(
      "Names of orchestrated tools whose inclusion gate fired or were forced. Constrained to the prompt's `orchestrates` enum."
    ),
  gatesElided: z
    .array(gateElidedSchema)
    .describe(
      'Tools whose inclusion gate failed and were NOT forced; surface in the meta fence + (J) gap list.'
    ),
  // BL-045 PR B audit BL-3: tightened to the const enum exported from
  // extraction-rules.ts (`CONDITIONAL_TRIGGER_NAMES`). The model can no
  // longer list every Section-09-named framework here (v10 over-
  // populated this field with 7 entries when only EU_AI_ACT was a real
  // conditional trigger).
  conditionalTriggersFired: z
    .array(z.enum(CONDITIONAL_TRIGGER_NAMES))
    .describe(
      'Named conditional triggers that fired DESPITE not being in Section 09 — currently `EU_AI_ACT` (EU geography + ML/AI use) and `NIS2` (EU geography + regulated sector). Empty array if none. Do NOT list frameworks that ARE in Section 09 — those go in the regulatory subsection prose, not here.'
    ),
  // BL-045 PR B audit MA-5: forceToolsApplied tightened to the same enum.
  forceToolsApplied: z
    .array(z.enum(ORCHESTRATED_TOOLS))
    .describe('Echo of the `forceTools` arg the prompt was invoked with. Empty array if none.'),
  claims: z
    .array(claimSchema)
    .min(1)
    .describe(
      'EVERY load-bearing claim the dossier will make — monetary figures, headcount numbers, regulatory frameworks, paradigm verdicts, ICG maturity scores, comparable engagement code names. The tool renders (K) provenance footer from these AND runs `validate_irl_provenance` internally to auto-flag fabricated excerpts.'
    ),
  gaps: z
    .array(gapEntrySchema)
    .describe(
      'Categorized gap entries for the (J) gap list. `provenance-gap` and `tier-mismatch` entries auto-discovered by the internal verification pass are APPENDED to this array — do NOT pre-populate those categories.'
    ),
  filledIrl: z
    .string()
    .min(200)
    .describe(
      'The VERBATIM IRL body — exactly the bytes the prompt was invoked with. Hash-bound: the tool computes sha256(filledIrl).slice(0,16) and rejects if the result does not match `irlBodyHash`. This catches paraphrased / summarized IRL bodies that would otherwise pass through and produce false-positive provenance gaps.'
    ),
  // BL-045 PR B audit BL-2 → ALT-1: hash-bind forcing function.
  irlBodyHash: z
    .string()
    .regex(
      IRL_BODY_HASH_REGEX,
      'irlBodyHash must be exactly 16 lowercase hex characters (sha256.slice(0,16) of the verbatim IRL body).'
    )
    .describe(
      "Copy verbatim from the prompt body's `**Body-binding hash:**` directive. The tool verifies `sha256(filledIrl).slice(0,16) === irlBodyHash` and rejects on mismatch — preventing the v10 failure mode where the model passed a condensed paraphrase of the IRL as filledIrl and the provenance verifier flagged 25/29 claims as false-positive unverified."
    ),
});

export type ComposeDossierEnvelopeInput = z.infer<typeof ComposeDossierEnvelopeInputSchema>;

export interface ComposeDossierEnvelopeResult {
  metaFenceMarkdown: string;
  gapListMarkdown: string;
  provenanceFooterMarkdown: string;
  provenanceVerification: {
    total: number;
    verified: number;
    verifiedFuzzy: number;
    partnerSupplied: number;
    unverified: number;
    autoAppendedGaps: number;
    /** BL-045 PR B audit MA-6: tier-1 claims (declared verbatim IRL bullet) whose excerpt was NOT found in the IRL. Structurally more damning than a generic unverified verdict — model declared verbatim but cited a paraphrase or fabrication. */
    tierMismatches: number;
    /** BL-049 v11 Finding B: tier-2 claims (declared one-step derivation) whose citation neither substring-matches the IRL nor carries the `Section --` partner-supplied sentinel. Surfaces the demote-to-dodge gaming pattern where a model tries to downgrade tier-1 to tier-2 to convert a tier-mismatch into a soft provenance-gap. */
    tierFabrications: number;
  };
  emitInstructions: string;
}

export interface ComposeDossierEnvelopeServerContext {
  /** Server-derived prompt version from the prompt module (overrides any model-supplied value). */
  promptVersion: string;
}

// ─── Render helpers (pure, exported for unit testing) ──────────────────

// BL-045 PR B audit MI-1: deterministic key order. JSON.stringify on an
// object literal happens to preserve V8 insertion order for non-integer
// keys, but that's an implementation detail not a language guarantee —
// and for an "auditable spine" output the order must be load-bearing
// across runtimes. Concat the JSON line-by-line so the order is part
// of the source, not an emergent property.
export function renderMetaFence(
  input: ComposeDossierEnvelopeInput,
  serverDerivedPromptVersion: string
): string {
  const stringifyArr = (a: readonly string[]): string =>
    a.length === 0 ? '[]' : JSON.stringify(a);
  const stringifyObjArr = <T>(a: readonly T[]): string =>
    a.length === 0 ? '[]' : JSON.stringify(a, null, 2).replace(/\n/g, '\n  ');
  const lines = [
    '{',
    `  "promptName": "${input.promptName}",`,
    `  "promptVersion": "${serverDerivedPromptVersion}",`,
    `  "modelVersion": ${JSON.stringify(input.modelVersion)},`,
    `  "mode": "${input.mode}",`,
    `  "verbosity": "${input.verbosity}",`,
    `  "transactionContext": "${input.transactionContext}",`,
    `  "fixtureFillRatio": ${input.fillRatio.percent / 100},`,
    `  "fixtureFillRatioStatus": "${input.fillRatio.status}",`,
    `  "gatesPassed": ${stringifyArr(input.gatesPassed)},`,
    `  "gatesElided": ${stringifyObjArr(input.gatesElided)},`,
    `  "conditionalTriggersFired": ${stringifyArr(input.conditionalTriggersFired)},`,
    `  "forceToolsApplied": ${stringifyArr(input.forceToolsApplied)}`,
    '}',
  ];
  return ['```json', lines.join('\n'), '```'].join('\n');
}

const CATEGORY_DISPLAY: Record<(typeof gapCategoryValues)[number], string> = {
  'defaulted-dimension': '**defaulted-dimension:**',
  'extraction-only': '**extraction-only:**',
  'gate-elided': '**gate-elided:**',
  'conditional-trigger': '**conditional-trigger:**',
  'currency-assumption': '**currency-assumption:**',
  'map-absent': '**map-absent:**',
  'provenance-gap': '**provenance-gap:**',
  'tier-mismatch': '**tier-mismatch:**',
  'tier-fabrication': '**tier-fabrication:**',
};

export function renderGapList(gaps: ComposeDossierEnvelopeInput['gaps']): string {
  if (gaps.length === 0) {
    return ['## (J) Gap list', '', '_No gaps surfaced this run._'].join('\n');
  }
  const lines: string[] = ['## (J) Gap list', ''];
  let idx = 1;
  for (const gap of gaps) {
    const prefix = `${idx}. ${CATEGORY_DISPLAY[gap.category]}`;
    const tail = [
      gap.entry,
      gap.irlSection ? `(IRL section: ${gap.irlSection})` : null,
      gap.followUp ? `**Follow-up:** ${gap.followUp}` : null,
    ]
      .filter((s): s is string => s !== null)
      .join(' — ');
    lines.push(`${prefix} ${tail}`);
    idx++;
  }
  return lines.join('\n');
}

export function renderProvenanceFooter(
  claims: ComposeDossierEnvelopeInput['claims'],
  verdicts: ValidateIrlProvenanceVerdict[]
): string {
  const lines: string[] = ['## (K) Provenance footer', ''];
  for (let i = 0; i < claims.length; i++) {
    const c = claims[i];
    const v = verdicts[i];
    const verdictTag =
      v.status === 'verified'
        ? '✓ verified'
        : v.status === 'verified-fuzzy'
          ? '≈ verified (fuzzy)'
          : v.status === 'partner-supplied'
            ? '◇ partner-supplied'
            : '✗ unverified';
    lines.push(`- ${c.claim} ← ${c.citation} (tier ${c.tier}) [${verdictTag}]`);
  }
  return lines.join('\n');
}

const EMIT_INSTRUCTIONS = [
  'TRANSCRIPTION DISCIPLINE — the three markdown blocks above are the dossier envelope:',
  '',
  '1. `metaFenceMarkdown` — paste verbatim as the FIRST content of the dossier (before section A).',
  '2. `gapListMarkdown` — paste verbatim as section `(J)`, between (I) synthesis and (K) provenance footer.',
  '3. `provenanceFooterMarkdown` — paste verbatim as section `(K)`, the LAST section of the dossier.',
  '',
  'Auto-appended `provenance-gap:` entries in `gapListMarkdown` reflect claims whose excerpts the tool could not verify against the IRL — do NOT edit or remove them; the partner needs to see what was flagged.',
  '',
  'If you discover additional gaps or claims after transcribing the envelope, re-call `compose_dossier_envelope` with the updated arrays rather than editing the markdown by hand.',
].join('\n');

// ─── Engine (pure) ──────────────────────────────────────────────────────

/**
 * Custom error thrown on hash-bind mismatch so the tool handler can
 * surface the BL-045 forcing-function diagnostic verbatim rather than
 * wrapping it in a generic 500.
 */
export class IrlBodyHashMismatchError extends Error {
  readonly expectedHash: string;
  readonly suppliedHash: string;
  constructor(suppliedHash: string, actualHash: string) {
    super(
      `BL-045 PR B hash-bind FAILED: irlBodyHash mismatch. ` +
        `Model supplied irlBodyHash="${suppliedHash}" but sha256(filledIrl).slice(0,16)="${actualHash}". ` +
        `This means the filledIrl you passed is NOT a verbatim copy of the IRL body the prompt was invoked with — ` +
        `most likely a condensed paraphrase / summary built from working memory. ` +
        `Per the prompt body's Body-binding hash directive, pass the EXACT IRL markdown bytes the prompt arg supplied; ` +
        `do not summarize, do not paraphrase, do not abridge. ` +
        `Re-call this tool with the verbatim filledIrl AND the matching irlBodyHash from the Body-binding hash directive.`
    );
    this.name = 'IrlBodyHashMismatchError';
    this.expectedHash = actualHash;
    this.suppliedHash = suppliedHash;
  }
}

/**
 * BL-049 v11 Finding B (kept after v0.13.1 partial revert) — derive the
 * effective tier from citation properties so the model cannot dodge
 * `tier-mismatch:` by relabeling a literal IRL bullet as tier-2.
 *
 *   - `tier-1-literal`: citation excerpt is a verbatim normalized
 *     substring of the IRL OR a fuzzy run ≥ FUZZY_MIN_RUN words.
 *   - `partner-supplied`: citation uses the `Section --` +
 *     `partner-supplied form input` sentinel.
 *   - `fabrication`: neither. No legitimate tier can produce this
 *     verdict — the citation isn't anchored anywhere.
 *
 * The auto-append loop compares derived tier vs declared tier:
 *   - declared 1 + derived 'tier-1-literal' → no gap (normal verified path)
 *   - declared 1 + derived anything else    → `tier-mismatch:` (existing v0.12.0)
 *   - declared 2 + derived 'tier-1-literal' or 'partner-supplied' → no gap
 *   - declared 2 + derived 'fabrication'    → `tier-fabrication:` (NEW)
 *   - declared 3 + any                       → no gap (correlation/unknown tier
 *                                              is explicitly soft)
 */
export type DerivedTier = 'tier-1-literal' | 'partner-supplied' | 'fabrication';

export function deriveTier(verdict: ValidateIrlProvenanceVerdict): DerivedTier {
  if (verdict.status === 'verified' || verdict.status === 'verified-fuzzy') {
    return 'tier-1-literal';
  }
  if (verdict.status === 'partner-supplied') {
    return 'partner-supplied';
  }
  return 'fabrication';
}

export function runComposeDossierEnvelope(
  input: ComposeDossierEnvelopeInput,
  serverContext: ComposeDossierEnvelopeServerContext
): ComposeDossierEnvelopeResult {
  // BL-045 PR B audit BL-2 → ALT-1: hash-bind verification. The model
  // cannot pass a paraphrased filledIrl through this check because
  // sha256 does not paraphrase. Throws on mismatch so the tool handler
  // surfaces the diagnostic; the model retries with verbatim IRL.
  const actualHash = computeIrlBodyHash(input.filledIrl);
  if (actualHash !== input.irlBodyHash) {
    throw new IrlBodyHashMismatchError(input.irlBodyHash, actualHash);
  }

  // 1. Run provenance verification on every load-bearing claim.
  const verification = runIrlProvenanceCheck({
    filledIrl: input.filledIrl,
    citations: input.claims.map((c, i) => ({
      path: `claims[${i}]:${c.claim}`,
      citation: c.citation,
    })),
  });

  // 2. Auto-append provenance-gap entries for unverified claims, plus
  //    tier-mismatch (MA-6 — declared tier-1, excerpt not in IRL) and
  //    tier-fabrication (BL-049 v11 Finding B — declared tier-2 to dodge
  //    tier-mismatch, but excerpt is neither verifiable nor
  //    partner-supplied). The verdict is DERIVED from the citation, so
  //    the model cannot dodge tier-mismatch by relabeling.
  const autoAppended: ComposeDossierEnvelopeInput['gaps'][number][] = [];
  let tierMismatches = 0;
  let tierFabrications = 0;
  for (let i = 0; i < input.claims.length; i++) {
    const claim = input.claims[i];
    const verdict = verification.verdicts[i];
    const derived = deriveTier(verdict);
    const declared = claim.tier;

    // Declared tier-1: must derive as tier-1-literal (verified or fuzzy).
    if (declared === '1' && derived !== 'tier-1-literal') {
      tierMismatches++;
      autoAppended.push({
        category: 'tier-mismatch',
        entry: `${claim.claim} — declared tier=1 (literal IRL bullet) but the citation excerpt is not a substring of the IRL body. Re-cite the literal IRL bullet OR demote the claim to tier=2 (one-step derivation).`,
        followUp:
          "If the IRL row supports the claim, supply the verbatim bullet text as the citation excerpt. If the claim is a derivation rather than literal, change tier to '2'.",
      });
      continue;
    }

    // Declared tier-2: must derive as tier-1-literal (substring matched —
    // honest case where the model labeled a literal as a derivation) OR
    // partner-supplied. A 'fabrication' derived tier under tier-2 IS the
    // v11 Finding B gaming pattern.
    if (declared === '2' && derived === 'fabrication') {
      tierFabrications++;
      autoAppended.push({
        category: 'tier-fabrication',
        entry: `${claim.claim} — declared tier=2 (one-step derivation) but the citation excerpt is neither a substring of the IRL body nor a partner-supplied sentinel. This pattern matches the BL-049 v11 Finding B demote-to-dodge: relabeling a tier-1 fabrication as tier-2 does NOT satisfy provenance — the verdict is derived from the citation, not the declared tier. Re-cite the IRL bullet that supports the derivation OR remove the claim.`,
        followUp:
          'Supply the verbatim IRL bullet text the derivation rests on. If no such bullet exists, the claim is fabricated and must be removed (or marked open with `Section -- — partner-supplied form input — <description>`).',
      });
      continue;
    }

    // Declared tier-3 (correlation/unknown) or any "verified" derivation:
    // no auto-append. tier-2 + 'partner-supplied' is also fine — model
    // legitimately attributed a derivation to partner input.
    // Unverified status without a tier-mismatch / fabrication promotion
    // still surfaces as a soft provenance-gap so the partner sees it.
    if (verdict.status === 'unverified' && derived !== 'fabrication') {
      // Defensive — shouldn't reach here under current logic, but
      // preserves the soft-fallback if classification logic evolves.
      autoAppended.push({
        category: 'provenance-gap',
        entry: `${claim.claim} — citation excerpt not found in IRL body (tier=${claim.tier})`,
        followUp:
          'Verify the IRL bullet supports this claim. If the source is real, supply a more verbatim excerpt; if not, remove the claim or mark it open.',
      });
    } else if (verdict.status === 'unverified' && declared === '3') {
      autoAppended.push({
        category: 'provenance-gap',
        entry: `${claim.claim} — citation excerpt not found in IRL body (tier=3 correlation/unknown — soft gap; consider whether the claim is load-bearing)`,
        followUp:
          'Tier-3 claims should be treated as hypotheses, not facts. Either supply IRL backing OR mark the claim explicitly as a working hypothesis.',
      });
    }
  }

  const allGaps = [...input.gaps, ...autoAppended];

  return {
    metaFenceMarkdown: renderMetaFence(input, serverContext.promptVersion),
    gapListMarkdown: renderGapList(allGaps),
    provenanceFooterMarkdown: renderProvenanceFooter(input.claims, verification.verdicts),
    provenanceVerification: {
      total: verification.total,
      verified: verification.verified,
      verifiedFuzzy: verification.verifiedFuzzy,
      partnerSupplied: verification.partnerSupplied,
      unverified: verification.unverified,
      autoAppendedGaps: autoAppended.length,
      tierMismatches,
      tierFabrications,
    },
    emitInstructions: EMIT_INSTRUCTIONS,
  };
}
