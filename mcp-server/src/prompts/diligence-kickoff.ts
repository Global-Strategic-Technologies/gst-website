/**
 * Prompt: gst_diligence_kickoff
 *
 * Starter agenda for a new diligence engagement, framed in GST's house
 * style. Orchestrates the diligence-agenda Tool and embeds the VDR
 * Structure Library Resource so the model has the canonical taxonomy
 * inline (no resources/read needed — see Commit 5 / V1 finding 1).
 */

import { z } from 'zod';
import type { GstPrompt } from './types';
import { userInputsShapeFromWire } from './diligence-shape';
import { authorialIntentLine, embedLibraryArticle } from './embed';

// targetName comes first so it surfaces as the first form field in clients
// (Claude Desktop renders inputs in argsSchema property order). The 13
// UserInputs enums and the geographies array all arrive case-tolerantly
// via userInputsShapeFromWire — see the helper for rationale.
const argsSchema = z.object({
  targetName: z.string().min(1),
  ...userInputsShapeFromWire(),
});

const PROMPT_NAME = 'gst_diligence_kickoff';

export const diligenceKickoffPrompt: GstPrompt<typeof argsSchema> = {
  name: PROMPT_NAME,
  description:
    'Generate a starter diligence agenda for a new engagement. Use at the kickoff of a buy-side or sell-side review.',
  version: '0.0.3',
  lastReviewedAt: '2026-05-03',
  orchestrates: ['generate_diligence_agenda', 'gst://library/vdr-structure'] as const,
  argsSchema,
  build: (args) => {
    // BL-031.95 Phase 2.D: count how many dimensions defaulted to 'unknown'
    // so the body can lead with a low-confidence callout when the agent
    // had little to derive from. Threshold ≥ 7-of-13 mirrors the spec
    // (parallels ICG's ≥ 10/20 threshold in `gst_target_quick_look`).
    const isUnknown = (v: string | string[]): boolean =>
      Array.isArray(v) ? v.length === 1 && v[0] === 'unknown' : v === 'unknown';
    const unknownDimensions = [
      args.transactionType,
      args.productType,
      args.techArchetype,
      args.headcount,
      args.revenueRange,
      args.growthStage,
      args.companyAge,
      args.geographies,
      args.businessModel,
      args.scaleIntensity,
      args.transformationState,
      args.dataSensitivity,
      args.operatingModel,
    ].filter(isUnknown).length;

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              authorialIntentLine(PROMPT_NAME),
              '',
              `You are advising on the diligence kickoff for ${args.targetName}.`,
              '',
              `Step 1. Call the \`generate_diligence_agenda\` tool with the supplied parameters. Any field defaulted to \`'unknown'\` (BL-031.95 Phase 2 sentinel) tells the engine "agent could not derive this from supplied context"; the engine widens the agenda conservatively rather than guessing. You should pass \`'unknown'\` (rather than guessing) for any dimension you cannot derive from the user's prose; only known values should narrow the agenda.`,
              `  transactionType=${args.transactionType}, productType=${args.productType}, techArchetype=${args.techArchetype},`,
              `  headcount=${args.headcount}, revenueRange=${args.revenueRange}, growthStage=${args.growthStage},`,
              `  companyAge=${args.companyAge}, geographies=${JSON.stringify(args.geographies)},`,
              `  businessModel=${args.businessModel}, scaleIntensity=${args.scaleIntensity},`,
              `  transformationState=${args.transformationState}, dataSensitivity=${args.dataSensitivity},`,
              `  operatingModel=${args.operatingModel}.`,
              '',
              'Step 2. The canonical `gst://library/vdr-structure` Library article is embedded in the next message. Treat it as the authoritative source for VDR-folder taxonomy and use its folder labels verbatim — do NOT substitute a generic PE-diligence taxonomy.',
              '',
              `Step 3. Frame the result as a one-page kickoff memo for ${args.targetName} in GST's house style with four sections:`,
              unknownDimensions >= 7
                ? `  (0) **Low-confidence baseline** — ${unknownDimensions} of 13 dimensions were unknown when the agenda was generated. Lead with a one-line note that this is a placeholder kickoff awaiting more deal context; suggest the user re-run with the full deal profile once it lands. The \`unknownDimensionCount\` field on the tool response carries the live count.`
                : `  (0) Note: when ${unknownDimensions === 0 ? 'no' : `only ${unknownDimensions}`} dimensions were unknown, omit any low-confidence framing — the agenda has full signal.`,
              '  (1) Target context — one paragraph anchoring the engagement (transaction, product, stage, geography). Surface every dimension that was passed as `unknown` under an "Assumptions / unknowns" sub-bullet so the deal team sees where the model widened the agenda.',
              '  (2) Prioritized agenda by topic — pull from the diligence-agenda tool result, ordered by signal-to-effort.',
              '  (3) Attention areas — the surfaced attention areas from the agenda result, with one-line "why this matters" framing.',
              '  (4) Suggested VDR requests — for each topic and attention area, name the canonical VDR folder (verbatim from the embedded Library article) and 2 concrete document requests prioritized by signal-to-effort.',
              `  (5) Open in Hub — embed the \`deeplink\` field from the \`generate_diligence_agenda\` tool result as a single "Open Diligence Wizard" link. The deeplink opens the Diligence Machine pre-populated with the same dimensions (any \`'unknown'\` fields land as the wizard's "Not sure" affordance — BL-031.95 Phase 2). If \`deeplink\` is absent (older server build), omit this section silently — never invent a URL.`,
              '',
              'Voice: declarative, terse, deal-team-ready. Avoid hedging language and tutorial framing. The output should read as if a senior consultant wrote it.',
            ].join('\n'),
          },
        },
        {
          role: 'user',
          content: embedLibraryArticle('gst://library/vdr-structure'),
        },
      ],
    };
  },
};
