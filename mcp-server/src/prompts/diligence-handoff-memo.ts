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
import { UserInputsSchema } from '../schemas';
import type { GstPrompt } from './types';
import { arrayFromWire } from './wire-shape';

const argsSchema = UserInputsSchema.extend({
  targetName: z.string().min(1),
  geographies: arrayFromWire(UserInputsSchema.shape.geographies),
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

export const diligenceHandoffMemoPrompt: GstPrompt<typeof argsSchema> = {
  name: 'gst_diligence_handoff_memo',
  description:
    'Draft handoff memo for the deal team — combines agenda + comparables + VDR follow-ups in a single document.',
  version: '0.1.0',
  lastReviewedAt: '2026-04-29',
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
            `Draft a handoff memo for the ${args.targetName} deal team. The memo combines three artifacts: the diligence agenda, comparable past engagements, and prioritized VDR follow-ups.`,
            '',
            'Step 1. Diligence agenda.',
            args.agendaJson
              ? '  The user supplied a pre-generated agendaJson — use it directly:\n```json\n' +
                args.agendaJson +
                '\n```'
              : `  Call \`generate_diligence_agenda\` with: transactionType=${args.transactionType}, productType=${args.productType}, techArchetype=${args.techArchetype}, headcount=${args.headcount}, revenueRange=${args.revenueRange}, growthStage=${args.growthStage}, companyAge=${args.companyAge}, geographies=${JSON.stringify(args.geographies)}, businessModel=${args.businessModel}, scaleIntensity=${args.scaleIntensity}, transformationState=${args.transformationState}, dataSensitivity=${args.dataSensitivity}, operatingModel=${args.operatingModel}.`,
            '',
            'Step 2. Comparable engagements.',
            args.comparablesJson
              ? '  The user supplied a pre-generated comparablesJson — use it directly:\n```json\n' +
                args.comparablesJson +
                '\n```'
              : `  Call \`search_portfolio\` with filters that match this target's profile (productType=${args.productType}, growthStage=${args.growthStage}, transactionType=${args.transactionType}). Pull 3-5 comparables.`,
            '',
            'Step 3. Read `gst://library/vdr-structure` to ground VDR follow-ups in the canonical 10-folder taxonomy.',
            '',
            `Step 4. Frame the output as a handoff memo for ${args.targetName} with these sections:`,
            '  (1) Engagement context — one paragraph (target, transaction, product, stage, geography).',
            '  (2) Diligence agenda — prioritized topics from the agenda result; one bullet per topic with a 1-line "what we look for here" framing.',
            '  (3) Attention areas — surfaced from the agenda result; each one cross-referenced to applicable comparable engagements where the same area surfaced.',
            '  (4) Comparable engagement library — for each of the 3-5 selected comparables: codeName, 1-line "why this one is relevant," 1-line lesson.',
            '  (5) VDR follow-ups — for each agenda topic and attention area, name the canonical VDR folder (per the Library resource) and 1-2 concrete document requests, prioritized by signal-to-effort.',
            '  (6) Open quesions / next steps — 3-5 bullets the deal team should resolve before the next milestone.',
            '',
            'Voice: handoff-quality. Reads as a single coherent document, not a stitched-together set of tool outputs. The deal team should be able to act on it without consulting the underlying tool results.',
          ].join('\n'),
        },
      },
    ],
  }),
};
