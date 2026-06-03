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
import type { GstPrompt } from './types';
import { userInputsShapeFromWire } from './diligence-shape';
import { authorialIntentLine, embedLibraryArticle } from './embed';

// targetName comes first so it surfaces as the first form field in clients
// (Claude Desktop renders inputs in argsSchema property order). The two
// optional pre-generated artefacts stay last where they belong on a form.
// The 13 UserInputs enums and the geographies array all arrive case-
// tolerantly via userInputsShapeFromWire — see the helper for rationale.
const argsSchema = z.object({
  targetName: z.string().min(1),
  ...userInputsShapeFromWire(),
  agendaJson: z
    .string()
    .optional()
    .describe(
      'Optional pre-generated diligence-agenda JSON. If absent, the prompt will call generate_diligence_agenda.'
    ),
  comparablesJson: z
    .string()
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
  version: '0.0.3',
  lastReviewedAt: '2026-05-03',
  orchestrates: [
    'generate_diligence_agenda',
    'search_portfolio',
    'gst://library/vdr-structure',
  ] as const,
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
            'Step 1. Diligence agenda.',
            args.agendaJson
              ? '  The user supplied a pre-generated agendaJson — use it directly:\n```json\n' +
                args.agendaJson +
                '\n```'
              : `  Call \`generate_diligence_agenda\` with the supplied parameters AND the required \`_audit\` sibling carrying Tier-3 partner-supplied defaults (this prompt collects values from partner form input, not from a structured IRL — every audit entry uses tier "3" with citation "Section -- — partner-supplied form input — <field description>"; headcount.scope = "engineering-only", revenueRange.nativeCurrency = "USD", growthStage.velocityEvidence = "unknown" if growthStage is "unknown" else "revenue-growth-explicit", dataSensitivity.piiCategoriesPresent matches the bucket: ["phi"] for high / ["customer-pii-at-scale"] for moderate / ["employee-pii"] for low / ["none"] for unknown). If the tool returns a structured BL-045 calibration error, fix the cited field and retry. Any field defaulted to \`'unknown'\` (BL-031.95 Phase 2 sentinel) tells the engine "agent could not derive this from supplied context"; the engine widens the agenda conservatively rather than guessing. Pass \`'unknown'\` (rather than guessing) for any dimension you cannot derive from the user's prose. Dimension parameters: transactionType=${args.transactionType}, productType=${args.productType}, techArchetype=${args.techArchetype}, headcount=${args.headcount}, revenueRange=${args.revenueRange}, growthStage=${args.growthStage}, companyAge=${args.companyAge}, geographies=${JSON.stringify(args.geographies)}, businessModel=${args.businessModel}, scaleIntensity=${args.scaleIntensity}, transformationState=${args.transformationState}, dataSensitivity=${args.dataSensitivity}, operatingModel=${args.operatingModel}.`,
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
            '  (1) Engagement context — one paragraph (target, transaction, product, stage, geography).',
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
