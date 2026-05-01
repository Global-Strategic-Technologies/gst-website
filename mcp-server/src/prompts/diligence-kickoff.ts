/**
 * Prompt: gst_diligence_kickoff
 *
 * Starter agenda for a new diligence engagement, framed in GST's house
 * style. Orchestrates the diligence-agenda Tool and embeds the VDR
 * Structure Library Resource so the model has the canonical taxonomy
 * inline (no resources/read needed — see Commit 5 / V1 finding 1).
 */

import { z } from 'zod';
import { UserInputsSchema } from '../schemas';
import type { GstPrompt } from './types';
import { arrayFromWire } from './wire-shape';
import { authorialIntentLine, embedLibraryArticle } from './embed';

const argsSchema = UserInputsSchema.extend({
  targetName: z.string().min(1),
  geographies: arrayFromWire(UserInputsSchema.shape.geographies),
});

const PROMPT_NAME = 'gst_diligence_kickoff';

export const diligenceKickoffPrompt: GstPrompt<typeof argsSchema> = {
  name: PROMPT_NAME,
  description:
    'Generate a starter diligence agenda for a new engagement. Use at the kickoff of a buy-side or sell-side review.',
  version: '0.0.1',
  lastReviewedAt: '2026-05-01',
  orchestrates: ['generate_diligence_agenda', 'gst://library/vdr-structure'] as const,
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
            `You are advising on the diligence kickoff for ${args.targetName}.`,
            '',
            'Step 1. Call the `generate_diligence_agenda` tool with the supplied parameters:',
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
            '  (1) Target context — one paragraph anchoring the engagement (transaction, product, stage, geography).',
            '  (2) Prioritized agenda by topic — pull from the diligence-agenda tool result, ordered by signal-to-effort.',
            '  (3) Attention areas — the surfaced attention areas from the agenda result, with one-line "why this matters" framing.',
            '  (4) Suggested VDR requests — for each topic and attention area, name the canonical VDR folder (verbatim from the embedded Library article) and 2 concrete document requests prioritized by signal-to-effort.',
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
  }),
};
