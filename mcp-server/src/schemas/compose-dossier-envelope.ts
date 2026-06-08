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
import { REGULATION_ENTRIES } from '../content/regulation-loader';
import { CONDITIONAL_TRIGGER_NAMES } from '../prompts/extraction-rules';
import { ORCHESTRATED_TOOLS } from '../prompts/irl-ingestion';
import {
  citationFieldSchema,
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

// BL-072 — irlSource: how the bytes in `filledIrl` were assembled. Required.
// Must match the four enum values the prompt's VERIFY-block sketches list at
// `src/prompts/irl-ingestion.ts:462,949` — single source of truth between
// the prompt and this schema.
const irlSourceValues = [
  'partner-paste-verbatim',
  // BL-079 Part B — operator pasted the IRL markdown into the prompt arg AND
  // the server pre-populated the IRL body cache at prompt-render time. The
  // model never emitted the body to `prepare_irl_body` — it skipped that tool
  // entirely and passed `irlBodyHash` straight to `compose_dossier_envelope`
  // and `validate_irl_provenance`. Strongest provenance form: the cache
  // contents are byte-equal to the prompt arg (no model emission roundtrip).
  // Distinguished from `partner-paste-verbatim` so operators see in the
  // VERIFY block which path actually ran.
  'partner-paste-verbatim-prepop',
  'model-reconstruction-from-xlsx',
  'model-reconstruction-trimmed',
  'placeholder',
] as const;

// BL-072 — the reconstruction modes that trigger the provenance-gap
// auto-append. Explicit Set (not a `startsWith` prefix check) so a future
// enum addition forces a conscious decision rather than silently inheriting
// the auto-append.
const RECONSTRUCTION_SOURCES = new Set<(typeof irlSourceValues)[number]>([
  'model-reconstruction-from-xlsx',
  'model-reconstruction-trimmed',
]);

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
  // BL-053: citation accepts EITHER a string (legacy single-bullet form) OR
  // an array of strings (1-8 elements) for multi-bullet claims. Array form is
  // verified per-element with strict aggregation (any unverified element →
  // aggregate unverified). Closes the structural false-negative for
  // derivation-heavy syntheses where the model's natural citation style
  // joins multiple supporting bullets — pre-BL-053 the verifier rejected
  // these as non-substring even though every supporting bullet existed.
  citation: citationFieldSchema,
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
      'OPTIONAL — the tool overrides whatever the model passes with the server-derived value from the prompt registry. Documented here for client transparency; supplying it is harmless but the field is not load-bearing.'
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
  // BL-063 server-side enforcement: defaultFiredFrameworks is the
  // Section-09 enumerated regulatory frameworks the partner is subject
  // to. The tool enforces three rules at the schema seam (matching the
  // BL-058 forcing-function pattern, since the BL-062 prose-only design
  // was empirically shown to be ignored by the model in the 2026-06-04
  // retest — SOC 2 slipped in despite being a certification not a
  // regulation; EU_AI_ACT appeared in BOTH this list and
  // conditionalTriggersFired despite the partition rule):
  //   1. Partition check (BL-063-PARTITION-VIOLATION): no overlap with
  //      conditionalTriggersFired.
  //   2. Scope check (BL-063-CERTIFICATION-NOT-REGULATION): no entries
  //      matching the certification blocklist (SOC 2, ISO 27001,
  //      PCI-DSS, SOC 1, FedRAMP, HITRUST — these are compliance
  //      attestations, not regulatory frameworks).
  //   3. Hub-backing auto-degrade (NOT a rejection): entries without
  //      a matching Hub regulatory map record auto-append a
  //      `map-absent:` entry to the (J) gap list. The unbacked entries
  //      are REMOVED from this list before rendering the meta fence —
  //      the meta fence carries only Hub-backed frameworks. This is
  //      operator-auditable: "regulations substantiated by Hub map
  //      matches" not "regulations the model thinks should apply."
  defaultFiredFrameworks: z
    .array(z.string().min(1))
    .optional()
    .default([])
    .describe(
      'Section-09 enumerated regulatory frameworks the partner is subject to (GDPR, UK GDPR, PIPEDA, POPIA, etc.). MUST be partitioned from conditionalTriggersFired (no overlap). MUST be regulatory frameworks only — certifications (SOC 2, ISO 27001, PCI-DSS) are REJECTED. Unbacked entries (absent from Hub regulatory map) auto-degrade to `map-absent:` gap entries.'
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
  // BL-076: `filledIrl` is no longer a public input field. The IRL body is
  // submitted server-side via `prepare_irl_body` (which caches it keyed by
  // its 16-hex `irlBodyHash`); `compose_dossier_envelope` re-hydrates the
  // body from cache at handler entry. Removing the body from the model-
  // emitted tool args cuts 9–80KB of output token cost per call
  // (40–80% latency reduction depending on body size). See
  // src/docs/development/MCP_SERVER_COMPOSE_BODY_BY_HASH_BL-076.md.
  irlBodyHash: z
    .string()
    .regex(
      IRL_BODY_HASH_REGEX,
      'irlBodyHash must be exactly 16 lowercase hex characters (sha256.slice(0,16) of the verbatim IRL body).'
    )
    .describe(
      'The canonical 16-hex `sha256(filledIrl).slice(0,16)` hash and now the SOLE body reference on this tool. Call `prepare_irl_body({ filledIrl })` first — it caches the body server-side keyed by this hash and returns it. Pass the returned `irlBodyHash` here. If you skip `prepare_irl_body` and call `compose_dossier_envelope` first, the server returns `Bl076BodyCacheMissError` directing you to `prepare_irl_body`. Hash sourcing rules (`pass-bound` vs `pass-internal` for the verification block) are unchanged — see the prompt directive.'
    ),
  irlSource: z
    .enum(irlSourceValues)
    .describe(
      'How the IRL body bytes were assembled. ' +
        '`partner-paste-verbatim`: operator pasted the IRL markdown into the prompt arg; hash-bind authority holds (the prompt arg is the authoritative source). ' +
        '`model-reconstruction-from-xlsx`: model parsed an xlsx attachment into markdown; hash-bind is `pass-internal` only (the model controls both the body and the hash). ' +
        '`model-reconstruction-trimmed`: model authored markdown from working memory + tool outputs without a verbatim source; same `pass-internal` caveat. ' +
        '`placeholder`: literal placeholder for error reporting. ' +
        'When the value is a reconstruction mode, the server auto-appends a `provenance-gap:` entry to (J) noting the limitation.'
    ),
  requireVerbatimBody: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Accuracy-critical run gate. When TRUE, this tool REJECTS any irlSource other than `partner-paste-verbatim`. ' +
        'Operators set this flag on the prompt arg for high-stakes engagements (regulatory deliverable, M&A close, post-mortem) where ' +
        'the hash-bind authority guarantee must hold over the partner-supplied source — not just the model-reconstructed body. ' +
        'For drafting / exploration runs, leave unset (default false) and the existing (J) provenance-gap disclosure is sufficient.'
    ),
});

/**
 * Public input — what the tool publishes and what `handleComposeDossierEnvelopeTool`
 * receives from the MCP transport. Does NOT carry the IRL body since BL-076:
 * the body is fetched server-side from `IrlBodyCache` keyed by `irlBodyHash`.
 */
export type ComposeDossierEnvelopeInput = z.infer<typeof ComposeDossierEnvelopeInputSchema>;

/**
 * Engine-internal input — what `runComposeDossierEnvelope` consumes. Adds
 * `filledIrl` back to the public input shape; the handler re-injects it
 * after fetching from cache. Engine tests construct this type directly and
 * bypass the cache layer entirely (audit M-1 — keeps existing engine tests
 * unchanged and the cache concern confined to the handler).
 */
export type ComposeDossierEnvelopeEngineInput = ComposeDossierEnvelopeInput & {
  filledIrl: string;
};

export interface ServerToolCallCountEntry {
  attempted: number;
  succeeded: number;
  rejected: number;
  errored: number;
}

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
  /**
   * BL-071 — server-authoritative snapshot of every tool call in this session
   * (attempted / succeeded / rejected / errored per tool). The model MUST copy
   * this object VERBATIM into the BL-045-VERIFY block `toolCallCounts` field
   * and derive `precheck.iterations` (== validate_irl_provenance.succeeded),
   * `precheck.attemptsTotal` (== validate_irl_provenance.attempted), and the
   * COUNT of `precheck.errorsEncountered` (== validate_irl_provenance.rejected)
   * from these counts. The server counts are the source of truth; model
   * self-narration of `toolCallCounts` has demonstrated drift (sonnet fabricated
   * a tool call; opus omitted one; a third run reported the same event in two
   * YAML surfaces inconsistently).
   *
   * `compose_dossier_envelope` itself appears here as `attempted: N, succeeded: N-1`
   * — the envelope tool is in-flight while it computes the snapshot.
   *
   * Optional: present when the server-side `MetricsContext` carries a
   * `ToolCallCounters` accumulator (i.e. always in the deployed transports;
   * absent only in legacy/no-op tests that build a `MetricsContext` without
   * counters).
   */
  serverToolCallCounts?: Record<string, ServerToolCallCountEntry>;
  /**
   * BL-079 Part B — server-authoritative byte length of the cache-hydrated
   * IRL body. Under `partner-paste-verbatim-prepop` (where the body never
   * passes through model emission), the model has no reliable way to report
   * `filledIrl.bytes` in the VERIFY block — there is no emission to
   * self-measure. The server measures the cache entry it re-hydrated and
   * surfaces the count here; the model copies it verbatim into
   * `filledIrl.bytes`. Reported in UTF-8 byte length to match
   * `Buffer.byteLength(body, 'utf8')`. Present whenever the body was
   * resolved (cache or input) — model copies in any mode for consistency.
   */
  serverCachedBodyBytes?: number;
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
    `  "defaultFiredFrameworks": ${stringifyArr(input.defaultFiredFrameworks ?? [])},`,
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

// BL-053: render a citation field that may be string OR string[] for the
// (K) provenance footer. Array form is rendered as semicolon-joined elements
// with an explicit element count prefix so partners reading the dossier can
// see at a glance which claims rest on multi-bullet derivations.
function renderCitationField(citation: string | string[]): string {
  if (typeof citation === 'string') return citation;
  return `[${citation.length} citations] ${citation.join(' ; ')}`;
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
    lines.push(
      `- ${c.claim} ← ${renderCitationField(c.citation)} (tier ${c.tier}) [${verdictTag}]`
    );
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

// ─── BL-063 server-side enforcement (partition + scope + Hub-backing) ──
//
// The 2026-06-04 retest produced an implicit-rule violation on all three
// axes (EU_AI_ACT in both fired and defaultFiredFrameworks; SOC 2 in
// defaultFiredFrameworks; NIST AI RMF + Canada AIDA in
// defaultFiredFrameworks without Hub backing) despite prose-style
// surrounding context. Per the impartial-audit recommendation, server-
// side enforcement at the tool seam matches the BL-058 forcing-function
// pattern; prose-only is the wrong lever for silent failure modes.

/**
 * Compliance certifications (NOT regulatory frameworks). Entries in
 * `defaultFiredFrameworks` matching this blocklist are rejected with
 * `BL-063-CERTIFICATION-NOT-REGULATION`. The list is intentionally
 * narrow — the most common certifications a model conflates with
 * regulations. Match is normalized (lowercased + non-alphanumeric
 * stripped) so `SOC 2`, `SOC2`, `soc-2`, `Soc 2 Type II` all match.
 */
const CERTIFICATION_BLOCKLIST = [
  'soc2',
  'soc1',
  'iso27001',
  'iso27002',
  'iso27017',
  'iso27018',
  'iso27701',
  'pcidss',
  'fedramp',
  'hitrust',
  'csa-star',
  'cyberessentials',
] as const;

/** Normalize a framework name for blocklist + Hub-backing matching. */
export function normalizeFrameworkName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Build the Hub-backed framework index from the regulatory map.
 * Indexed at module load. Two match paths per entry:
 *
 * 1. **Canonical-name bidirectional substring** (existing semantics, preserved
 *    verbatim so no current match regresses). Hub regulation names are formal
 *    long-form (e.g., "General Data Protection Regulation (GDPR)") while the
 *    model passes acronyms (e.g., "GDPR"). A model name normalized to ≥4 chars
 *    is Hub-backed if (model ⊂ hub) OR (hub ⊂ model). The 4-char floor
 *    prevents pathological matches like "law" or "act" matching everything.
 *
 * 2. **BL-073 alias exact-equality on normalized form.** Empirically, three
 *    frameworks fail the substring rule because no overlap exists between the
 *    model idiom and the canonical name: "UK GDPR" vs "UK Data Protection Act
 *    2018", "Australia Privacy Act" vs "Privacy Act 1988 (as amended 2024)",
 *    "EU AI Act" vs "EU Artificial Intelligence Act (Regulation 2024/1689)".
 *    Curated aliases on those entries cover the gap. Exact-equality (not
 *    substring) is the safer default — substring on aliases would risk
 *    spurious matches on short curated forms ("AI Act" alias substring-matching
 *    "Quebec AI Act" or future state-level frameworks). The canonical-substring
 *    path still catches its own variants; aliases are an additive net.
 *
 * Duplicate-alias collisions are caught at codegen time by
 * `scripts/generate-regulations-index.mjs` (which throws if any normalized
 * alias appears in two entries) — so `findMatchedHubFramework` returning the
 * first canonical-name match is safe by construction.
 */
interface HubFrameworkIndexEntry {
  /** Canonical Hub name returned by `findMatchedHubFramework` */
  readonly canonicalName: string;
  /** Normalized canonical name — used by the existing substring path */
  readonly normalizedCanonical: string;
  /** Normalized aliases (BL-073) — model-idiom variants that match this entry */
  readonly normalizedAliases: readonly string[];
}

const HUB_FRAMEWORK_INDEX: readonly HubFrameworkIndexEntry[] = REGULATION_ENTRIES.map((entry) => ({
  canonicalName: entry.data.name,
  normalizedCanonical: normalizeFrameworkName(entry.data.name),
  normalizedAliases: (entry.data.aliases ?? []).map(normalizeFrameworkName),
}));

const HUB_MATCH_MIN_LENGTH = 4;

function matchesEntry(entry: HubFrameworkIndexEntry, normalizedModelName: string): boolean {
  // Canonical-name bidirectional substring — preserved verbatim from pre-BL-073.
  if (
    entry.normalizedCanonical.length >= HUB_MATCH_MIN_LENGTH &&
    (entry.normalizedCanonical.includes(normalizedModelName) ||
      normalizedModelName.includes(entry.normalizedCanonical))
  ) {
    return true;
  }
  // BL-073 alias exact-equality on normalized form (NOT substring).
  return entry.normalizedAliases.some((alias) => alias === normalizedModelName);
}

function isHubBacked(modelName: string): boolean {
  const normalized = normalizeFrameworkName(modelName);
  if (normalized.length < HUB_MATCH_MIN_LENGTH) return false;
  return HUB_FRAMEWORK_INDEX.some((entry) => matchesEntry(entry, normalized));
}

/**
 * BL-068 — return the matched Hub framework name (formal long-form, as
 * stored in the regulatory-map JSON) for a model-supplied name, or null
 * if no Hub entry matches under the substring or alias rules. Used to
 * surface the matched Hub framework in the `BL-068 map-absent validation
 * FAILED` rejection so the model knows which Hub entry covers its
 * (false-positive) `map-absent:` claim.
 *
 * BL-073 extension: also matches via curated aliases (exact-equality on
 * normalized form). Returns the canonical name regardless of whether
 * the match came via canonical substring or alias path.
 */
function findMatchedHubFramework(modelName: string): string | null {
  const normalized = normalizeFrameworkName(modelName);
  if (normalized.length < HUB_MATCH_MIN_LENGTH) return null;
  for (const entry of HUB_FRAMEWORK_INDEX) {
    if (matchesEntry(entry, normalized)) return entry.canonicalName;
  }
  return null;
}

/**
 * Custom error thrown when `defaultFiredFrameworks` overlaps
 * `conditionalTriggersFired`. Each framework appears EXACTLY ONCE; when
 * a framework legitimately fires via BOTH paths, the conditional-
 * trigger path wins (appears in `fired` only).
 */
export class Bl063PartitionViolationError extends Error {
  readonly overlap: readonly string[];
  constructor(overlap: readonly string[]) {
    super(
      `BL-063-PARTITION-VIOLATION: ${overlap.length} framework${overlap.length === 1 ? '' : 's'} ` +
        `appear${overlap.length === 1 ? 's' : ''} in BOTH conditionalTriggersFired AND defaultFiredFrameworks: ` +
        `[${overlap.join(', ')}]. ` +
        `Each framework appears EXACTLY ONCE — when a framework BOTH (a) is a conditional trigger that fired ` +
        `AND (b) is also named in Section 09, the conditional-trigger path wins. ` +
        `Remove these from defaultFiredFrameworks; they stay in conditionalTriggersFired.`
    );
    this.name = 'Bl063PartitionViolationError';
    this.overlap = overlap;
  }
}

/**
 * Custom error thrown when `defaultFiredFrameworks` contains a known
 * compliance certification. Certifications are attestations of
 * compliance state, NOT regulatory frameworks; they belong in the
 * dossier (D) ICG section, not in the regulatory subsection.
 */
export class Bl063CertificationNotRegulationError extends Error {
  readonly offending: readonly string[];
  constructor(offending: readonly string[]) {
    super(
      `BL-063-CERTIFICATION-NOT-REGULATION: ${offending.length} entr${offending.length === 1 ? 'y' : 'ies'} ` +
        `in defaultFiredFrameworks ${offending.length === 1 ? 'is' : 'are'} compliance certification${offending.length === 1 ? '' : 's'}, not regulatory framework${offending.length === 1 ? '' : 's'}: ` +
        `[${offending.join(', ')}]. ` +
        `Compliance certifications (SOC 2, ISO 27001, PCI-DSS, FedRAMP, HITRUST, etc.) are attestations of compliance state, ` +
        `not regulatory frameworks the partner is subject to. ` +
        `Remove them from defaultFiredFrameworks; they belong in the dossier's (D) ICG section as compliance posture context, not in the regulatory subsection.`
    );
    this.name = 'Bl063CertificationNotRegulationError';
    this.offending = offending;
  }
}

/**
 * BL-068 — custom error thrown when one or more model-supplied
 * `map-absent:` claims in `input.gaps` name a framework that IS present
 * in the Hub regulatory map (false-positive). Surfaces the matching
 * Hub framework name(s) so the model can correct the claim.
 */
export class Bl068MapAbsentFalsePositiveError extends Error {
  readonly offenders: ReadonlyArray<{ entry: string; matchedHub: string }>;
  constructor(offenders: ReadonlyArray<{ entry: string; matchedHub: string }>) {
    const offenderLines = offenders
      .map(
        (o) =>
          `  - "${o.entry}" — matches Hub framework "${o.matchedHub}" (normalized: ${normalizeFrameworkName(o.matchedHub)})`
      )
      .join('\n');
    super(
      `map-absent validation FAILED: ${offenders.length} model-supplied \`map-absent:\` claim${offenders.length === 1 ? '' : 's'} name framework${offenders.length === 1 ? '' : 's'} that ARE present in the Hub regulatory map.\n\n` +
        `Offending claims:\n${offenderLines}\n\n` +
        `Fix: either (a) remove the false-positive \`map-absent:\` claim from \`gaps\`, OR (b) call \`search_regulations\` for that framework name and use the actual results to back your claim. The Hub registry is searchable by jurisdiction, category, and framework-name substring.\n\n` +
        `Note: alias coverage is incomplete; if your \`map-absent:\` claim concerns a framework you believe is Hub-covered under a different name, call \`search_regulations\` to confirm before claiming absence.`
    );
    this.name = 'Bl068MapAbsentFalsePositiveError';
    this.offenders = offenders;
  }
}

/**
 * BL-070 — thrown when `requireVerbatimBody: true` was passed AND `irlSource`
 * is NOT `partner-paste-verbatim`. Surfaces a structured rejection directing
 * the operator to re-run with the IRL pasted as markdown so BL-049 hash-bind
 * authority holds over the partner-supplied source (not the model's
 * reconstruction).
 */
export class Bl070VerbatimBodyRequiredError extends Error {
  readonly irlSource: string;
  constructor(irlSource: string) {
    super(
      `verbatim-body required: requireVerbatimBody=true but irlSource="${irlSource}". ` +
        `For accuracy-critical runs (regulatory deliverable, M&A close, post-mortem), the hash-bind ` +
        `authority guarantee MUST hold over the partner-supplied source. In xlsx-reconstruction modes the model ` +
        `controls both filledIrl and irlBodyHash so the hash-bind is internal-consistency only. ` +
        `Re-run with the IRL pasted directly as markdown into the prompt arg so the bytes round-trip verbatim ` +
        `(irlSource="partner-paste-verbatim"). If this run is for drafting / exploration and the verbatim guarantee ` +
        `is not needed, omit requireVerbatimBody (defaults to false) and the existing (J) gap-list disclosure is sufficient.`
    );
    this.name = 'Bl070VerbatimBodyRequiredError';
    this.irlSource = irlSource;
  }
}

/**
 * BL-076 — thrown when `compose_dossier_envelope` was called with an
 * `irlBodyHash` that is NOT present in the server-side IRL body cache.
 * Surfaces a structured rejection directing the model to call
 * `prepare_irl_body` first.
 *
 * Caused by one of:
 *   - Model skipped `prepare_irl_body` and called `compose_dossier_envelope`
 *     directly. Recovery: call `prepare_irl_body` then retry.
 *   - Cache entry was evicted (stdio LRU at capacity) or expired (Worker
 *     Upstash TTL). Recovery: call `prepare_irl_body` again to re-seed.
 *   - Hash typo / drift. Recovery: re-run `prepare_irl_body` with the
 *     intended body to obtain a fresh canonical hash.
 */
export class Bl076BodyCacheMissError extends Error {
  readonly irlBodyHash: string;
  constructor(irlBodyHash: string) {
    super(
      `body-cache miss for irlBodyHash="${irlBodyHash}": call ` +
        `prepare_irl_body({ filledIrl }) first to seed the cache. The body-by-hash ` +
        `pattern requires the IRL body to be submitted via prepare_irl_body ` +
        `before compose_dossier_envelope can re-hydrate it for internal provenance ` +
        `verification. If you already called prepare_irl_body, the cache entry may have ` +
        `been evicted (stdio LRU capacity exceeded) or expired (Worker TTL); re-call ` +
        `prepare_irl_body with the same body to re-seed and retry. ` +
        'If this prompt was invoked with `filledIrl` ' +
        'as a prompt arg, the server pre-populates the cache at prompt-render time — ' +
        'if you see this error in that mode, the prepop write likely failed. Check ' +
        '`wrangler tail` for a `bl079.cache.preload.failed` event with the same key. ' +
        'Fall back to calling `prepare_irl_body({ filledIrl })` explicitly to re-seed.'
    );
    this.name = 'Bl076BodyCacheMissError';
    this.irlBodyHash = irlBodyHash;
  }
}

/**
 * BL-068 — scan model-supplied `gaps` for `map-absent:` claims that
 * point at Hub-backed frameworks. Returns the list of offenders (empty
 * if all claims are legitimate). Throws nothing; caller decides whether
 * to throw `Bl068MapAbsentFalsePositiveError`.
 *
 * Extracts the framework name from the `entry` text by taking the prefix
 * before " — " (matching the auto-append shape: `${framework} — named in
 * Section 09 but absent...`) OR the full text when no em-dash is present.
 */
export function findFalsePositiveMapAbsentClaims(
  gaps: ReadonlyArray<{ category: string; entry: string }>
): ReadonlyArray<{ entry: string; matchedHub: string }> {
  const offenders: Array<{ entry: string; matchedHub: string }> = [];
  for (const gap of gaps) {
    if (gap.category !== 'map-absent') continue;
    const frameworkName = gap.entry.split(' — ')[0]?.trim() ?? gap.entry.trim();
    const matchedHub = findMatchedHubFramework(frameworkName);
    if (matchedHub) {
      offenders.push({ entry: gap.entry, matchedHub });
    }
  }
  return offenders;
}

/**
 * Partition check (BL-063 rule 1). Throws if any framework name appears
 * in both lists. Matching is normalized so case + whitespace + hyphens
 * differences don't dodge the check.
 */
export function checkBl063Partition(
  conditionalTriggersFired: readonly string[],
  defaultFiredFrameworks: readonly string[]
): void {
  if (defaultFiredFrameworks.length === 0 || conditionalTriggersFired.length === 0) return;
  const conditionalNormalized = new Set(conditionalTriggersFired.map(normalizeFrameworkName));
  const overlap: string[] = [];
  for (const f of defaultFiredFrameworks) {
    if (conditionalNormalized.has(normalizeFrameworkName(f))) {
      overlap.push(f);
    }
  }
  if (overlap.length > 0) {
    throw new Bl063PartitionViolationError(overlap);
  }
}

/**
 * Scope check (BL-063 rule 2). Throws if any entry matches the
 * certification blocklist (normalized).
 */
export function checkBl063Scope(defaultFiredFrameworks: readonly string[]): void {
  if (defaultFiredFrameworks.length === 0) return;
  const blocklist = new Set<string>(CERTIFICATION_BLOCKLIST);
  const offending = defaultFiredFrameworks.filter((f) => blocklist.has(normalizeFrameworkName(f)));
  if (offending.length > 0) {
    throw new Bl063CertificationNotRegulationError(offending);
  }
}

/**
 * Hub-backing partition (BL-063 rule 3 — auto-degrade, NOT reject).
 * Returns the subset of `defaultFiredFrameworks` that have a matching
 * Hub regulatory-map record (Hub-backed) and the subset that does NOT
 * (unbacked — to be auto-appended as `map-absent:` gap entries and
 * removed from the meta fence).
 */
export function partitionByHubBacking(defaultFiredFrameworks: readonly string[]): {
  backed: string[];
  unbacked: string[];
} {
  const backed: string[] = [];
  const unbacked: string[] = [];
  for (const f of defaultFiredFrameworks) {
    if (isHubBacked(f)) {
      backed.push(f);
    } else {
      unbacked.push(f);
    }
  }
  return { backed, unbacked };
}

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
      `hash-bind FAILED: irlBodyHash mismatch. ` +
        `Model supplied irlBodyHash="${suppliedHash}" but sha256(filledIrl).slice(0,16)="${actualHash}". ` +
        `This means the filledIrl you passed is NOT a verbatim copy of the IRL body the prompt was invoked with — ` +
        `most likely a condensed paraphrase / summary built from working memory. ` +
        `Per the prompt body's Body-binding hash directive, pass the EXACT IRL markdown bytes the prompt arg supplied; ` +
        `do not summarize, do not paraphrase, do not abridge. ` +
        `Re-call this tool with the verbatim filledIrl AND the matching irlBodyHash from the Body-binding hash directive.\n\n` +
        `Fix: call \`prepare_irl_body\` with the same \`filledIrl\` body to get the canonical \`irlBodyHash\`, ` +
        `then resubmit with that value. LLMs cannot reliably compute sha256 in-head — use \`prepare_irl_body\` to ` +
        `avoid this retry entirely on the first call.`
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
  input: ComposeDossierEnvelopeEngineInput,
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

  // BL-070 — verbatim-body gate. When operator has set requireVerbatimBody=true,
  // refuse any reconstruction-mode run before doing the expensive provenance
  // verification + envelope rendering work. The BL-072 (J) disclosure documents
  // the limitation; this flag converts it from operator-discipline into a
  // system-enforced refusal for accuracy-critical engagements.
  // BL-079 Part B — dual-accept: both `partner-paste-verbatim` (legacy:
  // model relayed the bytes through prepare_irl_body emission) AND
  // `partner-paste-verbatim-prepop` (BL-079: server pre-populated cache at
  // prompt-render time; model never emitted the body) represent operator-
  // supplied bytes and pass the BL-070 verbatim-body discipline. The prepop
  // variant is structurally stronger (no emission roundtrip) but BL-070's
  // gate is concerned with "operator-supplied, not model-reconstructed" —
  // both variants satisfy that.
  if (
    input.requireVerbatimBody &&
    input.irlSource !== 'partner-paste-verbatim' &&
    input.irlSource !== 'partner-paste-verbatim-prepop'
  ) {
    throw new Bl070VerbatimBodyRequiredError(input.irlSource);
  }

  // BL-063 server-side enforcement (in order — fail fast on rejections,
  // then auto-degrade Hub-backing into gap entries):
  //   1. Partition check: reject overlap with conditionalTriggersFired.
  //   2. Scope check: reject compliance certifications.
  //   3. Hub-backing partition: NOT a rejection — unbacked entries are
  //      removed from the meta fence and auto-appended as `map-absent:`
  //      gap entries so the partner sees the coverage gap transparently.
  const defaultFiredFrameworks = input.defaultFiredFrameworks ?? [];
  checkBl063Partition(input.conditionalTriggersFired, defaultFiredFrameworks);
  checkBl063Scope(defaultFiredFrameworks);
  const { backed: backedFrameworks, unbacked: unbackedFrameworks } =
    partitionByHubBacking(defaultFiredFrameworks);

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
    // BL-053 follow-up: branch the diagnostic on derived tier so the model
    // receives an accurate description of what failed. Generic "not a
    // substring of the IRL body" is misleading when the derived tier is
    // `partner-supplied` (the citation IS anchored — to a partner-form
    // input, not to the IRL) and when the citation is an array form
    // where one element of N failed.
    if (declared === '1' && derived !== 'tier-1-literal') {
      tierMismatches++;
      const isArrayForm = Array.isArray(claim.citation);
      const elementsClause = isArrayForm
        ? ` (citation is a ${(claim.citation as string[]).length}-element array — at least one element did not anchor in the IRL)`
        : '';
      const diagnostic =
        derived === 'partner-supplied'
          ? `the citation is partner-supplied (\`Section --\` sentinel), not a literal IRL bullet. Tier-1 requires a verbatim IRL substring.`
          : `the citation excerpt is not a substring of the IRL body${elementsClause}.`;
      autoAppended.push({
        category: 'tier-mismatch',
        entry: `${claim.claim} — declared tier=1 (literal IRL bullet) but ${diagnostic} Re-cite the literal IRL bullet OR demote the claim to tier=2 (one-step derivation, in which case ${derived === 'partner-supplied' ? 'partner-supplied is an acceptable tier-2 source' : 'verbatim IRL anchoring is still required'}).`,
        followUp:
          derived === 'partner-supplied'
            ? "If the IRL row also supports the claim, supply the verbatim IRL bullet as the citation excerpt (overriding the partner-supplied sentinel). Otherwise change tier to '2'."
            : "If the IRL row supports the claim, supply the verbatim bullet text as the citation excerpt. If the claim is a derivation rather than literal, change tier to '2'.",
      });
      continue;
    }

    // Declared tier-2: must derive as tier-1-literal (substring matched —
    // honest case where the model labeled a literal as a derivation) OR
    // partner-supplied. A 'fabrication' derived tier under tier-2 IS the
    // v11 Finding B gaming pattern.
    if (declared === '2' && derived === 'fabrication') {
      tierFabrications++;
      const isArrayForm = Array.isArray(claim.citation);
      const elementsClause = isArrayForm
        ? ` (citation is a ${(claim.citation as string[]).length}-element array — at least one element did not anchor anywhere)`
        : '';
      autoAppended.push({
        category: 'tier-fabrication',
        entry: `${claim.claim} — declared tier=2 (one-step derivation) but the citation excerpt is neither a substring of the IRL body nor a partner-supplied sentinel${elementsClause}. This is the demote-to-dodge pattern: relabeling a tier-1 fabrication as tier-2 does NOT satisfy provenance — the verdict is derived from the citation, not the declared tier. Re-cite the IRL bullet that supports the derivation OR remove the claim.`,
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

  // BL-063 rule 3 — auto-append `map-absent:` entries for unbacked
  // defaultFiredFrameworks. This converts an undetected fabrication
  // (model listing frameworks it knows from training without Hub map
  // backing) into a forcing-function audit artifact the partner sees
  // in (J). The unbacked entries are also stripped from the meta fence
  // output below (renderMetaFence receives `backedFrameworks`, not the
  // raw input).
  for (const unbacked of unbackedFrameworks) {
    autoAppended.push({
      category: 'map-absent',
      entry: `${unbacked} — named in Section 09 but absent from the Hub regulatory map; the dossier cannot back this framework with article-level citations.`,
      followUp:
        'If the framework genuinely applies, file a regulatory-map coverage request. Until then, the partner should source obligations directly from the regulator.',
    });
  }

  // BL-072 — xlsx-reconstruction provenance disclosure. In any
  // reconstruction mode the model controls both `filledIrl` and
  // `irlBodyHash`; BL-049's "model proved it sent the verbatim body"
  // authority does NOT hold. Provenance verification runs over the
  // model's reconstruction, not the source xlsx. Surface this as a
  // gap-list entry automatically so every reconstruction run carries
  // the disclosure structurally — operators don't have to rely on
  // model honesty (which is model-tier-dependent; sonnet-4-6 omitted
  // this disclosure, opus-4-8 surfaced it voluntarily on 2026-06-05).
  if (RECONSTRUCTION_SOURCES.has(input.irlSource)) {
    autoAppended.push({
      category: 'provenance-gap',
      entry: `xlsx-reconstruction mode (irlSource="${input.irlSource}"): hashBindResult \`pass-internal\` is internal-consistency only; the model controls both \`filledIrl\` and \`irlBodyHash\`, and provenance verification is over the model-reconstructed body, not an authoritative source. Verbatim-body authority does NOT hold in this mode.`,
      followUp:
        'For authoritative provenance (regulatory, M&A close, post-mortem), re-run with the IRL pasted directly as markdown so it round-trips verbatim from the prompt arg (irlSource="partner-paste-verbatim"). The structural xlsx-canonicalization fix that would close this gap is deferred per the cross-host Claude Desktop topology blocker.',
    });
  }

  // BL-068 — validate that model-supplied `map-absent:` claims don't
  // point at frameworks the Hub registry already covers. The model has
  // empirically claimed Hub-backed frameworks absent (NIST AI RMF + AU
  // Privacy Act in the 2026-06-05 retest); this prevents that class of
  // false positive from reaching the dossier. Known false-negative: UK
  // GDPR doesn't match GB-DPA under bidirectional substring; covered by
  // separate regulatory-map alias work.
  const falsePositiveMapAbsent = findFalsePositiveMapAbsentClaims(input.gaps);
  if (falsePositiveMapAbsent.length > 0) {
    throw new Bl068MapAbsentFalsePositiveError(falsePositiveMapAbsent);
  }

  const allGaps = [...input.gaps, ...autoAppended];

  return {
    metaFenceMarkdown: renderMetaFence(
      { ...input, defaultFiredFrameworks: backedFrameworks },
      serverContext.promptVersion
    ),
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
    serverCachedBodyBytes: Buffer.byteLength(input.filledIrl, 'utf8'),
    emitInstructions: EMIT_INSTRUCTIONS,
  };
}
