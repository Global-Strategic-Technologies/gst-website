/**
 * Prompt: gst_diligence_kickoff
 *
 * Starter agenda for a new diligence engagement, framed in GST's house
 * style. Orchestrates the diligence-agenda Tool and references the VDR
 * Structure Library Resource for follow-up requests.
 *
 * Body design contract: instruct the model to call
 * `generate_diligence_agenda` with the supplied parameters, reference
 * `gst://library/vdr-structure` for VDR-folder follow-ups per topic, and
 * frame the result as a one-page memo with four sections — target context,
 * prioritized agenda, attention areas, suggested VDR requests.
 */

import { z } from 'zod';
import { UserInputsSchema } from '../schemas';
import type { GstPrompt } from './types';

const argsSchema = UserInputsSchema.extend({
  targetName: z.string().min(1),
});

export const diligenceKickoffPrompt: GstPrompt<typeof argsSchema> = {
  name: 'gst_diligence_kickoff',
  description:
    'Generate a starter diligence agenda for a new engagement. Use at the kickoff of a buy-side or sell-side review.',
  version: '0.1.0',
  lastReviewedAt: '2026-04-29',
  orchestrates: ['generate_diligence_agenda', 'gst://library/vdr-structure'] as const,
  argsSchema,
  build: (args) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: [
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
            'Step 2. Read the `gst://library/vdr-structure` resource to ground VDR-folder follow-ups in the canonical 10-folder taxonomy.',
            '',
            `Step 3. Frame the result as a one-page kickoff memo for ${args.targetName} in GST's house style with four sections:`,
            '  (1) Target context — one paragraph anchoring the engagement (transaction, product, stage, geography).',
            '  (2) Prioritized agenda by topic — pull from the diligence-agenda tool result, ordered by signal-to-effort.',
            '  (3) Attention areas — the surfaced attention areas from the agenda result, with one-line "why this matters" framing.',
            '  (4) Suggested VDR requests — for each topic and attention area, name the canonical VDR folder (per the Library resource) and 1-2 concrete document requests.',
            '',
            'Voice: declarative, terse, deal-team-ready. Avoid hedging language and tutorial framing. The output should read as if a senior consultant wrote it.',
          ].join('\n'),
        },
      },
    ],
  }),
};
