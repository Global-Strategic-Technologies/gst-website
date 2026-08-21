/**
 * Prompt: gst_diligence_handoff_memo
 *
 * Combines a diligence agenda + comparable engagements + VDR follow-ups
 * into a draft handoff memo for the deal team.
 *
 * Body design contract: orchestrate `generate_diligence_agenda` and
 * `search_portfolio`, ground VDR follow-ups in the canonical
 * `gst://library/vdr-structure` taxonomy. Optional `agendaJson` /
 * `comparablesJson` arguments let the user supply previously-generated
 * artifacts to avoid re-running the upstream tools.
 */

import { z } from 'zod';
import { stringFromWire } from './wire-shape';
import type { GstPrompt } from './types';
import { userInputsShapeFromWire } from './diligence-shape';
import { authorialIntentLine, embedLibraryArticle, irlEvidencePrecedence } from './embed';

// targetName comes first so it surfaces as the first form field in clients
// (Claude Desktop renders inputs in argsSchema property order). The two
// optional pre-generated artefacts stay last where they belong on a form.
// The 13 UserInputs enums and the geographies array all arrive case-
// tolerantly via userInputsShapeFromWire — see the helper for rationale.
const argsSchema = z.object({
  targetName: z.string().min(1),
  ...userInputsShapeFromWire(),
  agendaJson: stringFromWire(z.string().optional())
    .optional()
    .describe(
      'Optional pre-generated diligence-agenda JSON. If absent, the prompt will call generate_diligence_agenda.'
    ),
  comparablesJson: stringFromWire(z.string().optional())
    .optional()
    .describe(
      'Optional pre-generated comparable-engagements JSON. If absent, the prompt will call search_portfolio.'
    ),
});

const PROMPT_NAME = 'gst_diligence_handoff_memo';

export const diligenceHandoffMemoPrompt: GstPrompt<typeof argsSchema> = {
  name: PROMPT_NAME,
  description:
    'Draft handoff memo for the deal team — combines agenda + comparables + VDR follow-ups in a single document.',
  version: '0.1.0',
  lastReviewedAt: '2026-08-20',
  orchestrates: [
    'generate_diligence_agenda',
    'search_portfolio',
    'gst://library/vdr-structure',
  ] as const,
  consumesTargetEvidence: true,
  argsSchema,
  build: (args) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: [
            authorialIntentLine(PROMPT_NAME),
            '',
            `Draft a handoff memo for the ${args.targetName} deal team. The memo combines three artifacts: the diligence agenda, comparable past engagements, and prioritized VDR follow-ups.`,
            '',
            irlEvidencePrecedence(),
            '',
            'Step 1. Diligence agenda.',
            args.agendaJson
              ? '  The user supplied a pre-generated agendaJson — use it directly:\n```json\n' +
                args.agendaJson +
                '\n```'
              : `  Call \`generate_diligence_agenda\` with the supplied parameters AND the required \`_audit\` sibling. The audit shape is **per dimension**, and which shape a dimension takes depends on where its value actually came from.

  **Evidence branch.** When canonical target evidence in context covers a dimension — most often an IRL extract record fact — cite THAT: \`"citation": "Section NN — <the fact's verbatim excerpt>"\`, with the section derived from the fact's reference (\`0-03\` → \`Section 00\`), graded honestly as tier "1" when the excerpt contains the enum value as a whole-token literal and tier "2" for a one-step derivation (which is most of them). The excerpt must be at least 20 characters of substantive content and the separator is an EM-DASH (—). \`diligence-audit.ts\` already validates exactly this — no schema change is involved.

  **No-evidence branch.** With only partner form input, an entry uses tier "3" with citation "Section -- — partner-supplied form input — <field description>". Under the derived-tier discipline that sentinel grades as \`partner-supplied\` rather than as a verified IRL citation, which is what keeps a form pick and a real IRL figure from arriving at the same grade. Field specifics either way: headcount.scope = "engineering-only", revenueRange.nativeCurrency = "USD" (or the record's native currency, with the conversion recorded), growthStage.velocityEvidence = "unknown" if growthStage is "unknown" else one of the explicit-evidence values, dataSensitivity.piiCategoriesPresent matches the bucket: ["phi"] for high / ["customer-pii-at-scale"] for moderate / ["employee-pii"] for low / ["none"] for unknown.

  **\`'unknown'\` survives the evidence branch.** A dimension the evidence does not cover keeps the existing behavior — pass \`'unknown'\` with tier "3" rather than inferring; the engine then widens the agenda conservatively instead of guessing. Rule 0 couples the two bidirectionally, so \`'unknown'\` REQUIRES tier "3" and tier "3" REQUIRES \`'unknown'\`. Having a record in context must not suppress that sentinel, and mapping a record fact onto a dimension's enum is your job here — the record deliberately does not carry this tool's 13-dimension enum set. If the tool returns a structured BL-045 calibration error, fix the cited field and retry.

  Dimension parameters: transactionType=${args.transactionType}, productType=${args.productType}, techArchetype=${args.techArchetype}, headcount=${args.headcount}, revenueRange=${args.revenueRange}, growthStage=${args.growthStage}, companyAge=${args.companyAge}, geographies=${JSON.stringify(args.geographies)}, businessModel=${args.businessModel}, scaleIntensity=${args.scaleIntensity}, transformationState=${args.transformationState}, dataSensitivity=${args.dataSensitivity}, operatingModel=${args.operatingModel}.`,
            '',
            'Step 2. Comparable engagements.',
            args.comparablesJson
              ? '  The user supplied a pre-generated comparablesJson — use it directly:\n```json\n' +
                args.comparablesJson +
                '\n```'
              : `  Call \`search_portfolio\` with filters that match this target's profile (productType=${args.productType}, growthStage=${args.growthStage}, transactionType=${args.transactionType}). Pull 3-5 comparables.`,
            '',
            'Step 3. The canonical `gst://library/vdr-structure` Library article is embedded in the next message. Use its folder labels verbatim for the VDR follow-up section — do NOT substitute a generic taxonomy.',
            '',
            `Step 4. Frame the output as a handoff memo for ${args.targetName} with these sections:`,
            '  (1) Engagement context — one paragraph (target, transaction, product, stage, geography). When target evidence was in context, say which dimensions were resolved from it, and whether those citations are verified this session or carried asserted-not-verified from a record.',
            '  (2) Diligence agenda — prioritized topics from the agenda result; one bullet per topic with a 1-line "what we look for here" framing.',
            '  (3) Attention areas — surfaced from the agenda result; each one cross-referenced to applicable comparable engagements where the same area surfaced.',
            '  (4) Comparable engagement library — for each of the 3-5 selected comparables: codeName, 1-line "why this one is relevant," 1-line lesson. Close this section with a single "Open in Hub: Comparable engagement view" link that uses the `deeplink` field from the `search_portfolio` tool response (BL-031.95 Phase 4.B) — opens `/ma-portfolio` with the same filter chips active so the deal team can browse the matched cards. Do NOT invent per-comparable codeName anchor URLs (older drafts of this prompt instructed that pattern; the website has no codeName-level anchor handler today, so the only canonical click-through is the filtered-grid deeplink).',
            '  (5) VDR follow-ups — for each agenda topic and attention area, name the canonical VDR folder (verbatim from the embedded Library article) and 2 concrete document requests, prioritized by signal-to-effort.',
            '  (6) Open questions / next steps — 3-5 bullets the deal team should resolve before the next milestone.',
            `  (7) Open in Hub — single "Open Diligence Wizard" link from the \`deeplink\` field on the \`generate_diligence_agenda\` tool response (BL-031.95 Phase 2.B) — opens the wizard pre-populated with the same dimensions, including \`'unknown'\` fallbacks rendered as "Not sure" chips. If a tool response is missing \`deeplink\` (older server build), omit that link silently — never invent a URL.`,
            '',
            'Voice: handoff-quality. Reads as a single coherent document, not a stitched-together set of tool outputs. The deal team should be able to act on it without consulting the underlying tool results.',
          ].join('\n'),
        },
      },
      {
        role: 'user',
        content: embedLibraryArticle('gst://library/vdr-structure'),
      },
    ],
  }),
};
