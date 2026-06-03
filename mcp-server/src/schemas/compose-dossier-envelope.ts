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

import { z } from 'zod';
import {
  runIrlProvenanceCheck,
  type ValidateIrlProvenanceVerdict,
} from './validate-irl-provenance';

// ─── Enums shared with the prompt body's args ──────────────────────────

const modeValues = ['full', 'extract-only'] as const;
const verbosityValues = ['verbose', 'compact'] as const;
const transactionContextValues = ['sell-side', 'buy-side', 'value-creation', 'unknown'] as const;
const fillRatioStatusValues = ['halt', 'partial', 'ok'] as const;
const tierValues = ['1', '2', '3'] as const;

const gapCategoryValues = [
  'defaulted-dimension',
  'extraction-only',
  'gate-elided',
  'conditional-trigger',
  'currency-assumption',
  'map-absent',
  'provenance-gap',
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

export const ComposeDossierEnvelopeInputSchema = z.object({
  promptName: z
    .literal('gst_irl_ingestion')
    .describe(
      'Must be the literal `gst_irl_ingestion` — the only prompt this envelope shape is calibrated for. Other prompts can be added in future schema revisions if/when needed.'
    ),
  promptVersion: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/)
    .describe(
      "SemVer prompt version (the model copies this from the body's authorial-intent line)."
    ),
  modelVersion: z
    .string()
    .min(1)
    .describe('Your model id at invocation time, e.g., "claude-opus-4-7".'),
  mode: z.enum(modeValues).describe('Execution mode the prompt args specified.'),
  verbosity: z.enum(verbosityValues).describe('Output verbosity the prompt args specified.'),
  transactionContext: z
    .enum(transactionContextValues)
    .describe('Engagement context the prompt args specified.'),
  fillRatio: fillRatioSchema.describe(
    'Output of the wrong-IRL pre-flight directive — the model must run that computation before calling this tool.'
  ),
  gatesPassed: z
    .array(z.string().min(1))
    .describe('Names of orchestrated tools whose inclusion gate fired or were forced.'),
  gatesElided: z
    .array(gateElidedSchema)
    .describe(
      'Tools whose inclusion gate failed and were NOT forced; surface in the meta fence + (J) gap list.'
    ),
  conditionalTriggersFired: z
    .array(z.string().min(1))
    .describe(
      'Named conditional triggers that fired (e.g., "EU_AI_ACT", "NIS2"). Empty array if none.'
    ),
  forceToolsApplied: z
    .array(z.string().min(1))
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
      'Categorized gap entries for the (J) gap list. Provenance-gap entries auto-discovered by the internal verification pass are APPENDED to this array — do NOT pre-populate them.'
    ),
  filledIrl: z
    .string()
    .min(200)
    .describe(
      'The populated IRL body — same shape as the prompt arg. Used for the internal provenance verification of `claims`.'
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
  };
  emitInstructions: string;
}

// ─── Render helpers (pure, exported for unit testing) ──────────────────

export function renderMetaFence(input: ComposeDossierEnvelopeInput): string {
  const block = {
    promptName: input.promptName,
    promptVersion: input.promptVersion,
    modelVersion: input.modelVersion,
    mode: input.mode,
    verbosity: input.verbosity,
    transactionContext: input.transactionContext,
    fixtureFillRatio: input.fillRatio.percent / 100,
    fixtureFillRatioStatus: input.fillRatio.status,
    gatesPassed: input.gatesPassed,
    gatesElided: input.gatesElided,
    conditionalTriggersFired: input.conditionalTriggersFired,
    forceToolsApplied: input.forceToolsApplied,
  };
  return ['```json', JSON.stringify(block, null, 2), '```'].join('\n');
}

const CATEGORY_DISPLAY: Record<(typeof gapCategoryValues)[number], string> = {
  'defaulted-dimension': '**defaulted-dimension:**',
  'extraction-only': '**extraction-only:**',
  'gate-elided': '**gate-elided:**',
  'conditional-trigger': '**conditional-trigger:**',
  'currency-assumption': '**currency-assumption:**',
  'map-absent': '**map-absent:**',
  'provenance-gap': '**provenance-gap:**',
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

export function runComposeDossierEnvelope(
  input: ComposeDossierEnvelopeInput
): ComposeDossierEnvelopeResult {
  // 1. Run provenance verification on every load-bearing claim.
  const verification = runIrlProvenanceCheck({
    filledIrl: input.filledIrl,
    citations: input.claims.map((c, i) => ({
      path: `claims[${i}]:${c.claim}`,
      citation: c.citation,
    })),
  });

  // 2. Auto-append provenance-gap entries for unverified claims.
  //    Verdict order matches `input.claims` order (runIrlProvenanceCheck
  //    preserves input order).
  const autoAppended = verification.verdicts
    .filter((v) => v.status === 'unverified')
    .map((v) => {
      // The path encoding `claims[i]:label` lets us recover the claim label
      // without requiring a separate map.
      const labelMatch = v.path.match(/^claims\[\d+\]:(.+)$/);
      const label = labelMatch ? labelMatch[1] : v.path;
      const entry: ComposeDossierEnvelopeInput['gaps'][number] = {
        category: 'provenance-gap',
        entry: `${label} — citation excerpt not found in IRL body (model-emitted excerpt may be paraphrased or fabricated)`,
        followUp:
          'Verify the IRL bullet supports this claim. If the source is real, supply a more verbatim excerpt; if not, remove the claim or mark it open.',
      };
      return entry;
    });

  const allGaps = [...input.gaps, ...autoAppended];

  return {
    metaFenceMarkdown: renderMetaFence(input),
    gapListMarkdown: renderGapList(allGaps),
    provenanceFooterMarkdown: renderProvenanceFooter(input.claims, verification.verdicts),
    provenanceVerification: {
      total: verification.total,
      verified: verification.verified,
      verifiedFuzzy: verification.verifiedFuzzy,
      partnerSupplied: verification.partnerSupplied,
      unverified: verification.unverified,
      autoAppendedGaps: autoAppended.length,
    },
    emitInstructions: EMIT_INSTRUCTIONS,
  };
}
