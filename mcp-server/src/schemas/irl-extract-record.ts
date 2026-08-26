/**
 * The IRL extract record — `gst_irl_ingestion`'s `extract-only` output, keyed
 * by SUBJECT rather than by consumer.
 *
 * ─── Why the record exists ────────────────────────────────────────────────
 *
 * Extract-only's spine used to be `payload: <tool-name>` fences, one per tool
 * *the ingestion prompt itself* orchestrates. Reusability was bounded by that
 * one prompt's tool list: every other consumer had to reverse-engineer facts
 * out of argument bundles shaped for someone else's schema. That single
 * property explained both observed symptoms — `gst_target_quick_look` could not
 * consume the extract, and the extract was not a durable representation of the
 * target. The record inverts the index: one JSON document describing the
 * TARGET, keyed by the canonical IRL taxonomy. The `payload:` fences stay,
 * demoted to a derived projection of the record.
 *
 * See [ADR-0019](../../../src/docs/adr/0019-irl-extract-record-subject-indexing.md)
 * for the indexing, transport and retention decisions this schema implements.
 *
 * ─── Transport: context-borne, with no server copy ────────────────────────
 *
 * The record travels by being present in the conversation — model output,
 * operator paste — and downstream prompts consume it from context. There is no
 * addressable server copy, by operator policy: the GST MCP server does not
 * durably retain target / IRL evidence data. A travelling artifact therefore
 * has to date and version ITSELF, which is what `_meta.generatedAt` and
 * `_meta.promptVersion` are for; nothing server-side can supply them later.
 *
 * ─── The record carries its own semantics ─────────────────────────────────
 *
 * `request` is the VERBATIM IRL request text, carried with every fact, so a
 * consumer matches on it directly against the same vocabulary the target
 * answered. An earlier draft told consumers to resolve `ref → my input` by
 * reading `gst://library/irl-tool-input-mapping`; `prompts/embed.ts` refutes
 * that mechanism in writing — the model can only `resources/read` URIs the user
 * has pinned, so a body that says "read `gst://…`" gets a training-data
 * substitute instead. Adding consumer #11 therefore needs no edit here and no
 * mapping table to keep in sync.
 *
 * **Request-text matching is a convenience layer, not the correctness
 * mechanism.** A `request` string structurally cannot encode a NEGATIVE, and
 * the observed misroutes (Section-02 components pulled into `rdOpEx`; Section
 * 04's `remediationBudget` pulled across tools) happened *with* a mapping table
 * present. The anti-mappings stay inline in `prompts/extraction-rules.ts`. The
 * record makes the right mapping easy to find; the rule constants make the
 * wrong one refused. Both, not either.
 *
 * ─── Normalization is to units and scalars, never to a consumer's enums ────
 *
 * USD-normalized money with the conversion basis recorded, ISO dates, integer
 * counts, verbatim excerpt. Mapping a fact onto `generate_diligence_agenda`'s
 * 13-dimension enum set would be indexing by a consumer's schema — the root
 * cause restated. That mapping belongs in the consumer.
 */

import { z } from 'zod';
import { buildReferenceId } from '../../../src/utils/irl/generate-xlsx';
import { IRL_SOURCE_VALUES } from './irl-source';

// ─── Ref grammar ───────────────────────────────────────────────────────────

/**
 * The record's `ref` is the workbook's `Reference` column VERBATIM — no
 * translation.
 *
 * `buildReferenceId` composes the section digit (leading zero stripped) with
 * the bullet's AUTHORED ordinal, so ARR is `0-03`. Three sibling builders
 * produce `00-03` instead — the `NN-II` exclusion key — and picking wrong fails
 * SILENTLY: a record keyed `00-03` parses, looks canonical, and never matches
 * the reference the target quoted. `_meta.refFormat` names the choice
 * explicitly so a model holding both a record and a `list_irl_requests` result
 * (which hands out `key: "00-03"`) does not conflate the two identifiers.
 *
 * Sections 10 and 11 are engagement-specific additions that real workbooks
 * carry and the generator source does not, so the grammar admits a two-digit
 * section for them while the canonical range stays single-digit.
 */
export const IRL_REF_PATTERN = /^(?:[0-9]|1[01])-[0-9]{2}$/;

/**
 * Section digits the generator source actually defines (`## 00`–`## 09`).
 * Refs outside it are admitted — engagement sections 10/11 exist in the wild —
 * but `resolveRefSection` reports them as unresolvable so a consumer can say so
 * rather than silently assume a canonical anchor.
 */
export const CANONICAL_REF_SECTION_DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Split a `ref` into its section digit and 1-based ordinal, and report whether
 * the section is one the generator source defines.
 *
 * Deliberately NOT a "this ref resolves to a canonical bullet" membership
 * check. Such a guard would reject legitimate rows: `customRequests` append at
 * `ordinal = base + 1 + k` where `base` is the section's
 * `canonicalBulletCount`, so a custom on §00 is `0-11` — present in the filled
 * workbook, absent from the source. `customRequests` is a first-class
 * `gst_information_request_list` argument, so the strict form would fail on
 * every engagement that used it. Well-formed refs past `canonicalBulletCount`
 * are admitted as customs.
 */
export function resolveRefSection(ref: string): {
  sectionDigit: string;
  /** Zero-padded, matching the generator source's `## NN` headings. */
  sectionNumber: string;
  ordinal: number;
  canonicalSection: boolean;
} | null {
  if (!IRL_REF_PATTERN.test(ref)) return null;
  const [sectionDigit, ordinalPart] = ref.split('-');
  return {
    sectionDigit,
    sectionNumber: sectionDigit.padStart(2, '0'),
    ordinal: Number(ordinalPart),
    canonicalSection: CANONICAL_REF_SECTION_DIGITS.includes(sectionDigit),
  };
}

/**
 * TEST SUPPORT — no production caller, and that is deliberate.
 *
 * Round-trip guard: the ref a record carries must be the one `buildReferenceId`
 * would produce for that section + ordinal. Reusing the generator's own function
 * is what makes the record's key the workbook's key by construction rather than
 * by coincidence — a test that reimplemented the format would agree with itself
 * and drift from the workbook silently, which is the failure this exists to
 * prevent.
 *
 * It lives here rather than in the test file because `buildReferenceId` sits in
 * the WEBSITE workspace (`src/utils/irl/generate-xlsx.ts`) alongside three
 * sibling builders that produce the `NN-II` exclusion key instead. This is the
 * seam that names the right one once; picking wrong fails silently.
 */
export function refForBullet(sectionNumber: string, bulletOrdinal: number): string {
  return buildReferenceId(sectionNumber, bulletOrdinal);
}

// ─── Excerpt cap ───────────────────────────────────────────────────────────

/**
 * Cap on the verbatim answer-slot excerpt each fact carries, in CHARACTERS.
 *
 * **Settled by measurement, not by preference.** Against the two workbook-shape
 * fixtures the excerpt is not the dominant term at fixture scale — the record
 * runs ~1.2× the body either way, because `request` text is carried on every
 * fact. It becomes decisive at real scale: record bytes ≈ rows × (≈207 B of
 * ref/request/status/tier overhead + min(answerChars, cap)). A real 60–80 KB
 * body with ~67 answered rows averages ~1,000 chars of answer per row, so an
 * uncapped record lands near the body's own size (~80 KB) on top of the
 * worksheet fence and up to eight `payload:` fences, while this cap holds it
 * near 30 KB and roughly flat as bodies grow.
 *
 * **Why a capped excerpt survives at all rather than being dropped.** Full
 * provenance means the record travels WITH the filled IRL, so an excerpt
 * duplicates bytes the paired body already carries. But record-only is a
 * legitimate mode — a later session may hold the record and not the body — and
 * `diligence-audit.ts` tier-1/2 validation is excerpt-based, so a record with
 * no excerpt could not cite at all.
 *
 * **Hard floor, and the reason for it.** `diligence-audit.ts` requires a
 * post-em-dash excerpt of at least {@link IRL_EXTRACT_EXCERPT_MIN_CHARS}
 * characters and, for tier 1, requires it to contain the dimension's enum value
 * as a whole-token literal (`BL-045-TIER-1-LITERAL-MISMATCH`). A byte-only cap
 * that severs that token silently demotes every tier-1 citation to tier 2 —
 * defeating the reason the excerpt is kept — so truncation is on a word
 * boundary and a truncated excerpt is FLAGGED (`excerptTruncated`) rather than
 * passed off as a complete span.
 */
export const IRL_EXTRACT_EXCERPT_CAP_CHARS = 240;

/** The tier-1 citation floor `diligence-audit.ts` enforces. The cap may never go below it. */
export const IRL_EXTRACT_EXCERPT_MIN_CHARS = 20;

/** Schema version of the record document itself, carried in `_meta.recordVersion`. */
export const IRL_EXTRACT_RECORD_VERSION = '1.0';

/**
 * The v2 record version (trust-the-operator rebuild). v2 drops the
 * provenance `_meta` fields — `irlBodyHash`, `irlSource`,
 * `generatedAtSource` — and keeps the self-describing ones: a travelling
 * artifact still dates and versions itself (`generatedAt`, `promptVersion`),
 * and still names its interpretation keys (`refFormat`, `excerptCapChars`,
 * `coverage`). Produced by `gst_irl_extract` (the record workflow split out
 * of the sweep, 2026-08-25); v1 remains produced by `gst_irl_ingestion`
 * during the coexistence window.
 */
export const IRL_EXTRACT_RECORD_VERSION_V2 = '2.0';

/** The `_meta.refFormat` literal. Names the ref vocabulary so `00-03` is not mistaken for it. */
export const IRL_EXTRACT_REF_FORMAT = 'workbook-reference';

/**
 * Apply the word-boundary cap the directive states and the schema validates.
 *
 * **No in-repo production caller, and unlike {@link refForBullet} that is not
 * because it is test support.** The caller this implements for is the MODEL,
 * following {@link IRL_EXTRACT_RECORD_DIRECTIVE} — the record is built in the
 * model's turn, not on the server. What lives here is the executable statement
 * of that rule, so the schema tests can drive the real thing and any future
 * server-side record builder has one implementation to reach for rather than a
 * fourth restatement.
 *
 * The rule was written down three times — in {@link IRL_EXTRACT_RECORD_DIRECTIVE}
 * for the model, in the `excerptTruncated` refinement for the wire, and in each
 * test that had to build a conformant fixture. The third copy was the problem:
 * a test asserting "the word-boundary rule keeps the last token intact" against
 * its own local implementation proves only that the test agrees with itself.
 * Callers get the real rule here, and the constants it reads are the same ones
 * the directive interpolates.
 *
 * Truncation backs up to the last space rather than cutting mid-token, because
 * a severed tier-1 enum literal silently demotes the citation — see the cap's
 * own docstring.
 *
 * **The back-up floor is HALF THE CAP, matching the `excerptTruncated`
 * refinement below.** It used to be {@link IRL_EXTRACT_EXCERPT_MIN_CHARS} (20),
 * which let the helper emit a record its own schema rejects: an early space
 * followed by one unbroken 200-character token backs up to a 22-character
 * flagged excerpt, and the refinement refuses any flagged excerpt under half the
 * cap. Unreachable on real IRL prose — but this helper exists so a caller gets
 * the rule rather than a re-implementation of it, and a rule that disagrees with
 * the validator is not the rule. Below the floor there is no word boundary worth
 * honouring and the hard slice stands, which is always well over it.
 */
export function capIrlExtractExcerpt(text: string): { excerpt: string; truncated: boolean } {
  if (text.length <= IRL_EXTRACT_EXCERPT_CAP_CHARS) return { excerpt: text, truncated: false };
  const slice = text.slice(0, IRL_EXTRACT_EXCERPT_CAP_CHARS - 1);
  const lastSpace = slice.lastIndexOf(' ');
  const kept = lastSpace * 2 > IRL_EXTRACT_EXCERPT_CAP_CHARS ? slice.slice(0, lastSpace) : slice;
  return { excerpt: `${kept}…`, truncated: true };
}

// ─── Fact ──────────────────────────────────────────────────────────────────

const statusValues = ['OPEN', 'PARTIAL', 'CLOSED'] as const;

const valueSchema = z
  .object({
    normalized: z
      .union([z.number(), z.string()])
      .describe(
        "The scalar the fact reduces to — USD-normalized money as a number, an ISO-8601 date as a string, an integer count as a number. NEVER a consumer tool's enum value: mapping onto `generate_diligence_agenda`'s 13-dimension enums is indexing by a consumer's schema, which is the defect the record exists to remove."
      ),
    unit: z
      .string()
      .min(1)
      .describe(
        'Unit of `normalized` — e.g. `USD/yr`, `FTE`, `hours`, `incidents/quarter`, `ISO-8601`.'
      ),
    basis: z
      .object({
        native: z
          .string()
          .min(1)
          .describe(
            'The figure exactly as the IRL stated it, with its native currency — e.g. `31000000 CAD`.'
          ),
        usdRate: z.number().positive().describe('USD rate applied to reach `normalized`.'),
      })
      .optional()
      .describe(
        'Present ONLY when a currency conversion was applied. Recording the basis is what lets a consumer re-derive or challenge the conversion instead of inheriting it.'
      ),
  })
  .describe(
    'Present when the answer reduces to a scalar. Absent for narrative answers, which carry only `excerpt`.'
  );

export const IrlExtractFactSchema = z.object({
  ref: z
    .string()
    .regex(
      IRL_REF_PATTERN,
      'ref must be the workbook Reference column verbatim — section digit, hyphen, two-digit 1-based ordinal (e.g. `0-03`). NOT the `NN-II` exclusion key `list_irl_requests` returns (`00-03`).'
    )
    .describe('The workbook `Reference` column value for this row, verbatim.'),
  request: z
    .string()
    .min(3)
    .describe(
      "The IRL request text VERBATIM. This is what a consumer matches on — it carries the record's semantics so there is no lookup step."
    ),
  status: z
    .enum(statusValues)
    .describe(
      'The workbook `Status` column, verbatim. An empty Status reads as `OPEN`. Status does NOT gate inclusion: an OPEN row carrying content still contributes its content.'
    ),
  excerpt: z
    .string()
    .min(1)
    .max(
      IRL_EXTRACT_EXCERPT_CAP_CHARS + 1,
      `excerpt exceeds the ${IRL_EXTRACT_EXCERPT_CAP_CHARS}-character cap. Truncate on a word boundary, append the single-character ellipsis, and set excerptTruncated: true.`
    )
    .describe(
      `Verbatim span from the row's ANSWER SLOT (Response + Comments joined), never from \`(Source:)\` or \`(Note:)\`. Capped at ${IRL_EXTRACT_EXCERPT_CAP_CHARS} characters; truncate on a word boundary so a citable token is never severed.`
    ),
  excerptTruncated: z
    .literal(true)
    .optional()
    .describe(
      'Set when `excerpt` was cut at the cap. A consumer building a tier-1 citation needs to know the enum token it is looking for may lie past the cut.'
    ),
  value: valueSchema.optional(),
  tier: z
    .union([z.literal(1), z.literal(2), z.literal(3)])
    .describe(
      'Confidence in this fact AS EXTRACTED, on the same three-tier scale the `_audit` siblings use: 1 = the row states it verbatim, 2 = direct one-step derivation, 3 = correlation. A consumer re-grades for its own field; this is the extraction-side grade.'
    ),
});

export type IrlExtractFact = z.infer<typeof IrlExtractFactSchema>;

// ─── _meta ─────────────────────────────────────────────────────────────────

export const IrlExtractRecordMetaSchema = z.object({
  recordVersion: z
    .literal(IRL_EXTRACT_RECORD_VERSION)
    .describe('Schema version of this record document.'),
  refFormat: z
    .literal(IRL_EXTRACT_REF_FORMAT)
    .describe(
      'Names the ref vocabulary: `workbook-reference` is the `Reference` column (`0-03`), NOT the `NN-II` exclusion key `list_irl_requests` returns (`00-03`). Stated so a model holding both artifacts does not conflate two identifiers for one bullet.'
    ),
  irlBodyHash: z
    .string()
    .regex(/^[0-9a-f]{16}$/, 'irlBodyHash is the 16-hex prefix `prepare_irl_body` returned.')
    .describe(
      'The canonical `sha256(body).slice(0,16)` of the filled IRL this record was extracted from, as RETURNED BY `prepare_irl_body` — never hand-computed. Attests IDENTITY, not verifiability: hashing is byte-for-byte with no normalization, so a legitimate re-paste can alter bytes and change the hash.'
    ),
  irlSource: z
    .enum(IRL_SOURCE_VALUES)
    .describe(
      'How the bytes of the body behind `irlBodyHash` were assembled. Same vocabulary as `compose_dossier_envelope.irlSource`.'
    ),
  generatedAt: z
    .string()
    .datetime()
    .describe(
      'ISO-8601 timestamp of extraction. A travelling artifact must date itself: no server-side copy exists to date it later.'
    ),
  generatedAtSource: z
    .enum(['server-witnessed', 'model-asserted'])
    .describe(
      "`server-witnessed` ONLY when `generatedAt` was copied from `prepare_irl_body`'s returned `mintedAt` — the value the provenance store actually kept. `model-asserted` otherwise. Over-claiming provenance is the failure class ADR-0018 exists to prevent, so the discriminator is carried rather than inferred."
    ),
  promptVersion: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, 'promptVersion is the semver stated in the Run parameters block.')
    .describe(
      'The `gst_irl_ingestion` version that produced this record, copied from the Run parameters block — not re-derived.'
    ),
  excerptCapChars: z
    .number()
    .int()
    .min(IRL_EXTRACT_EXCERPT_MIN_CHARS)
    .describe(
      `The excerpt cap in force when this record was written. Floored at ${IRL_EXTRACT_EXCERPT_MIN_CHARS} because \`diligence-audit.ts\` rejects a shorter post-em-dash excerpt outright.`
    ),
  coverage: z
    .object({
      answered: z
        .number()
        .int()
        .nonnegative()
        .describe('Rows with a substantive answer — the number of entries in `facts`.'),
      rowsPresent: z
        .number()
        .int()
        .positive()
        .describe(
          'Request rows present in THIS workbook. Not 67: `skip-if` removals, `excludeRequests`, `customRequests` and the optional engagement sections all move the denominator, so there is no fixed number to reconcile to. This must be the SAME set the fill-ratio denominator uses.'
        ),
    })
    .describe("The record's coverage claim, counted against the rows present in this workbook."),
});

export type IrlExtractRecordMeta = z.infer<typeof IrlExtractRecordMetaSchema>;

// ─── _meta v2 (trust-the-operator: no provenance fields) ──────────────────

export const IrlExtractRecordMetaV2Schema = z.object({
  recordVersion: z
    .literal(IRL_EXTRACT_RECORD_VERSION_V2)
    .describe('Schema version of this record document.'),
  refFormat: IrlExtractRecordMetaSchema.shape.refFormat,
  generatedAt: z
    .string()
    .datetime()
    .describe(
      'ISO-8601 timestamp of extraction, from your own clock. A travelling artifact must date itself: no server-side copy exists to date it later.'
    ),
  promptVersion: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, 'promptVersion is the semver stated in the Run parameters block.')
    .describe(
      "The producing prompt's version (`gst_irl_extract`), copied from the Run parameters block — not re-derived."
    ),
  excerptCapChars: IrlExtractRecordMetaSchema.shape.excerptCapChars,
  coverage: IrlExtractRecordMetaSchema.shape.coverage,
});

export type IrlExtractRecordMetaV2 = z.infer<typeof IrlExtractRecordMetaV2Schema>;

// ─── Record ────────────────────────────────────────────────────────────────

/**
 * Cross-record checks shared by v1 and v2 — the coverage identity, the
 * duplicate-ref guard, and the excerpt-cap discipline are properties of the
 * `facts` array + `coverage`/`excerptCapChars`, which both versions carry.
 */
function runRecordCrossChecks(
  record: {
    _meta: { coverage: { answered: number; rowsPresent: number }; excerptCapChars: number };
    facts: IrlExtractFact[];
  },
  ctx: z.RefinementCtx
): void {
  if (record.facts.length !== record._meta.coverage.answered) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['_meta', 'coverage', 'answered'],
      message: `coverage.answered (${record._meta.coverage.answered}) must equal facts.length (${record.facts.length}). The coverage claim and the fact list are the same set counted twice; a divergence means one of them is asserted rather than counted.`,
    });
  }
  if (record._meta.coverage.answered > record._meta.coverage.rowsPresent) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['_meta', 'coverage'],
      message: `coverage.answered (${record._meta.coverage.answered}) exceeds coverage.rowsPresent (${record._meta.coverage.rowsPresent}) — more rows answered than the workbook contains.`,
    });
  }
  const seen = new Map<string, number>();
  record.facts.forEach((fact, index) => {
    const first = seen.get(fact.ref);
    if (first !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['facts', index, 'ref'],
        message: `duplicate ref "${fact.ref}" (first seen at facts[${first}]). One workbook row is one fact; a repeated ref means two facts claim the same anchor and a consumer cannot tell which the target actually said.`,
      });
    } else {
      seen.set(fact.ref, index);
    }
    if (fact.excerpt.length > record._meta.excerptCapChars + 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['facts', index, 'excerpt'],
        message: `excerpt is ${fact.excerpt.length} characters, past this record's declared cap of ${record._meta.excerptCapChars}.`,
      });
    }
    // Half the cap, not the cap itself: word-boundary truncation legitimately
    // backs up by one word, so an exact-cap check would reject the very
    // behaviour the directive mandates. What this catches is a flag on a span
    // that plainly was not cut — which tells a consumer to distrust a
    // citation it could have used at tier 1, the missing-flag defect inverted.
    if (fact.excerptTruncated && fact.excerpt.length * 2 < record._meta.excerptCapChars) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['facts', index, 'excerptTruncated'],
        message: `excerptTruncated is set but the excerpt is only ${fact.excerpt.length} characters against a cap of ${record._meta.excerptCapChars} — a truncation flag on a span that was plainly not cut tells a consumer to distrust a complete citation.`,
      });
    }
  });
}

export const IrlExtractRecordSchema = z
  .object({
    _meta: IrlExtractRecordMetaSchema,
    facts: z.array(IrlExtractFactSchema),
  })
  .superRefine(runRecordCrossChecks);

export type IrlExtractRecord = z.infer<typeof IrlExtractRecordSchema>;

export const IrlExtractRecordV2Schema = z
  .object({
    _meta: IrlExtractRecordMetaV2Schema,
    facts: z.array(IrlExtractFactSchema),
  })
  .superRefine(runRecordCrossChecks);

export type IrlExtractRecordV2 = z.infer<typeof IrlExtractRecordV2Schema>;

// ─── The body directive ────────────────────────────────────────────────────

/**
 * The record directive rendered into BOTH extract-only arms.
 *
 * Lives beside the schema deliberately: the cap and the floor are interpolated
 * from the same constants Zod validates against, so the prose and the schema
 * cannot state different numbers. The lockstep note on
 * `META_JSON_FENCE_DIRECTIVE` (ADR-0017) is the precedent — a model-authored
 * artifact whose shape is described in one place and enforced in another drifts
 * silently.
 */
export const IRL_EXTRACT_RECORD_DIRECTIVE = [
  "## Extraction step 1 — the IRL extract record (REQUIRED — this mode's primary artifact)",
  '',
  'Emit ONE JSON code fence labeled `record: irl-extract` describing **the target**, keyed by the canonical IRL taxonomy. This is the primary output of extract-only mode: a portable document an operator can save, paste into a later session, or hand to any other GST prompt. Every other fence below is a derived projection of it.',
  '',
  '**Coverage: every answered row** — every row whose ANSWER SLOT (Response + Comments joined, per § IRL workbook column contract) carries substantive content. Count against the rows present in THIS workbook, not against a fixed number: removed questions, custom requests and optional engagement sections all move the denominator. Use the same row set the fill-ratio denominator used.',
  '',
  '```json',
  '{',
  '  "_meta": {',
  `    "recordVersion": "${IRL_EXTRACT_RECORD_VERSION}",`,
  `    "refFormat": "${IRL_EXTRACT_REF_FORMAT}",`,
  // Arm-agnostic on purpose. This directive renders into BOTH extract-only
  // bodies, and they acquire the hash differently: the deferred arm calls
  // `prepare_irl_body`, the one-shot arm is told NOT to and copies the
  // body-binding hash the server already stated. Naming the tool here — as this
  // line did — instructed the one-shot arm to make the call its own procedure
  // forbids. Point at the procedure instead; each arm's step says which it is.
  '    "irlBodyHash": "<16 hex — the value the provenance step above gave you; do NOT hand-compute>",',
  '    "irlSource": "<partner-paste-verbatim | partner-paste-verbatim-prepop | model-reconstruction-from-xlsx | model-reconstruction-trimmed | placeholder>",',
  '    "generatedAt": "<ISO-8601 — the `mintedAt` the provenance step returned, or your own clock when it returned none>",',
  '    "generatedAtSource": "<server-witnessed | model-asserted — which of those two you just did>",',
  '    "promptVersion": "<copy from the Run parameters block — do not re-derive>",',
  `    "excerptCapChars": ${IRL_EXTRACT_EXCERPT_CAP_CHARS},`,
  '    "coverage": { "answered": 58, "rowsPresent": 67 }',
  '  },',
  '  "facts": [',
  '    { "ref": "0-03",',
  '      "request": "Annual recurring revenue (most recent quarter, plus prior 12 months if available)",',
  '      "status": "CLOSED",',
  '      "excerpt": "<verbatim answer-slot span, at most ' +
    IRL_EXTRACT_EXCERPT_CAP_CHARS +
    ' characters>",',
  '      "value": { "normalized": 22600000, "unit": "USD/yr",',
  '                 "basis": { "native": "31000000 CAD", "usdRate": 0.73 } },',
  '      "tier": 2 }',
  '  ]',
  '}',
  '```',
  '',
  'Field rules:',
  '',
  '- **`ref` is the workbook `Reference` column VERBATIM** — section digit, hyphen, two-digit ordinal (`0-03`). It is NOT the `NN-II` key `list_irl_requests` returns (`00-03`); if you are holding both artifacts, they are two identifiers for one bullet and `_meta.refFormat` says which this record uses. Refs are stable across differently-configured engagements — a removed question leaves a GAP (`2-01, 2-02, 2-04`) rather than renumbering — so a buy-side IRL still calls ARR `0-03`.',
  '- **`request` is the IRL request text VERBATIM.** It is what makes the record self-resolving: a consumer matches on the request text directly, against the same vocabulary the target answered. Do not paraphrase, abbreviate, or substitute a tool field name.',
  `- **\`excerpt\` is a verbatim span of the ANSWER SLOT only** — never from \`(Source:)\` or \`(Note:)\`, per the citation-hygiene rule. Cap it at **${IRL_EXTRACT_EXCERPT_CAP_CHARS} characters**. **Truncate on a word boundary and append \`…\`, never mid-token, and set \`"excerptTruncated": true\`.** A cap that severs a token silently demotes a downstream tier-1 citation to tier 2, which defeats the reason the excerpt is carried. **If the last word boundary falls below HALF the cap (${IRL_EXTRACT_EXCERPT_CAP_CHARS / 2} characters), cut at the cap instead of backing up** — one unbroken token longer than half the cap is the only case where this bites, and a flagged excerpt that short is REJECTED rather than accepted as a short answer. Never truncate below **${IRL_EXTRACT_EXCERPT_MIN_CHARS} characters** — that is the floor \`generate_diligence_agenda\`'s audit rejects beneath. A genuinely short answer is carried whole and needs no flag.`,
  "- **`value` normalizes to units and scalars, NOT to any tool's enums.** USD-normalized money with the conversion basis recorded, ISO dates, integer counts. Omit `value` entirely for a narrative answer. Do NOT map a fact onto a consumer's enum set here — that is the consumer's job, and doing it here would re-index the record by one consumer's schema.",
  '- **`tier`** grades the EXTRACTION: `1` the row states it verbatim, `2` direct one-step derivation, `3` correlation. A consumer re-grades for its own field.',
  '',
  '**The record and the filled IRL travel together as a pair when full provenance matters.** A record alone still resolves inputs, with its citations carried as asserted-not-verified.',
].join('\n');

/**
 * The v2 record directive — rendered by `gst_irl_extract`'s output steps.
 *
 * Same fence label, same fact rules, same cap/floor constants interpolated
 * from the values Zod validates against. The provenance-step bullets are
 * gone: v2's `_meta` carries no hash, no source grade, and no witness
 * discriminator — the record dates and versions itself and states its
 * interpretation keys, nothing more.
 */
export const IRL_EXTRACT_RECORD_DIRECTIVE_V2 = [
  "## Extraction step 1 — the IRL extract record (REQUIRED — this mode's primary artifact)",
  '',
  'Emit ONE JSON code fence labeled `record: irl-extract` describing **the target**, keyed by the canonical IRL taxonomy. This is the primary output of extract-only mode: a portable document an operator can save, paste into a later session, or hand to any other GST prompt. Every other fence below is a derived projection of it.',
  '',
  '**Coverage: every answered row** — every row whose ANSWER SLOT (Response + Comments joined, per § IRL workbook column contract) carries substantive content. Count against the rows present in THIS workbook, not against a fixed number: removed questions, custom requests and optional engagement sections all move the denominator. Use the same row set the fill-ratio denominator used.',
  '',
  '```json',
  '{',
  '  "_meta": {',
  `    "recordVersion": "${IRL_EXTRACT_RECORD_VERSION_V2}",`,
  `    "refFormat": "${IRL_EXTRACT_REF_FORMAT}",`,
  '    "generatedAt": "<ISO-8601 — your own clock at extraction time>",',
  '    "promptVersion": "<copy from the Run parameters block — do not re-derive>",',
  `    "excerptCapChars": ${IRL_EXTRACT_EXCERPT_CAP_CHARS},`,
  '    "coverage": { "answered": 58, "rowsPresent": 67 }',
  '  },',
  '  "facts": [',
  '    { "ref": "0-03",',
  '      "request": "Annual recurring revenue (most recent quarter, plus prior 12 months if available)",',
  '      "status": "CLOSED",',
  '      "excerpt": "<verbatim answer-slot span, at most ' +
    IRL_EXTRACT_EXCERPT_CAP_CHARS +
    ' characters>",',
  '      "value": { "normalized": 22600000, "unit": "USD/yr",',
  '                 "basis": { "native": "31000000 CAD", "usdRate": 0.73 } },',
  '      "tier": 2 }',
  '  ]',
  '}',
  '```',
  '',
  'Field rules:',
  '',
  '- **`ref` is the workbook `Reference` column VERBATIM** — section digit, hyphen, two-digit ordinal (`0-03`). It is NOT the `NN-II` key `list_irl_requests` returns (`00-03`); if you are holding both artifacts, they are two identifiers for one bullet and `_meta.refFormat` says which this record uses. Refs are stable across differently-configured engagements — a removed question leaves a GAP (`2-01, 2-02, 2-04`) rather than renumbering — so a buy-side IRL still calls ARR `0-03`.',
  '- **`request` is the IRL request text VERBATIM.** It is what makes the record self-resolving: a consumer matches on the request text directly, against the same vocabulary the target answered. Do not paraphrase, abbreviate, or substitute a tool field name.',
  `- **\`excerpt\` is a verbatim span of the ANSWER SLOT only** — never from \`(Source:)\` or \`(Note:)\`. Cap it at **${IRL_EXTRACT_EXCERPT_CAP_CHARS} characters**. **Truncate on a word boundary and append \`…\`, never mid-token, and set \`"excerptTruncated": true\`.** A cap that severs a token silently degrades a downstream citation, which defeats the reason the excerpt is carried. **If the last word boundary falls below HALF the cap (${IRL_EXTRACT_EXCERPT_CAP_CHARS / 2} characters), cut at the cap instead of backing up** — one unbroken token longer than half the cap is the only case where this bites, and a flagged excerpt that short is REJECTED rather than accepted as a short answer. Never truncate below **${IRL_EXTRACT_EXCERPT_MIN_CHARS} characters** — keep excerpts at least that long so they remain citable. A genuinely short answer is carried whole and needs no flag.`,
  "- **`value` normalizes to units and scalars, NOT to any tool's enums.** USD-normalized money with the conversion basis recorded, ISO dates, integer counts. Omit `value` entirely for a narrative answer. Do NOT map a fact onto a consumer's enum set here — that is the consumer's job, and doing it here would re-index the record by one consumer's schema.",
  '- **`tier`** grades the EXTRACTION: `1` the row states it verbatim, `2` direct one-step derivation, `3` correlation. A consumer re-grades for its own field.',
  '',
  "**The record travels on its own terms.** Its excerpts are extraction-time verbatim spans; a consumer reading it later treats them as the record's claim about the IRL, stated plainly, and says so when a figure comes from the record rather than from a document in its own context.",
].join('\n');
