/**
 * Prompt: gst_radar_brief_today
 *
 * Daily / pre-meeting digest of the most recent annotated radar items,
 * summarized in the GST Take voice. Reads `gst://radar/fyi/latest`
 * (filtered by category if supplied) — never makes live Inoreader calls.
 */

import { z } from 'zod';
import { RadarCategoryEnum } from '../schemas';
import type { GstPrompt } from './types';
import { numberFromWire } from './wire-shape';

const argsSchema = z.object({
  category: RadarCategoryEnum.optional().describe(
    "Optional category filter. One of 'pe-ma' / 'enterprise-tech' / 'ai-automation' / 'security'. Omit for all categories."
  ),
  sinceHours: numberFromWire(z.number().int().positive().max(168))
    .default(24)
    .describe('Lookback window in hours. Defaults to 24; max 168 (one week).'),
});

export const radarBriefTodayPrompt: GstPrompt<typeof argsSchema> = {
  name: 'gst_radar_brief_today',
  description:
    'Daily / pre-meeting digest of the most recent annotated FYI radar items, summarized in the GST Take voice.',
  version: '0.1.0',
  lastReviewedAt: '2026-04-29',
  orchestrates: ['gst://radar/fyi/latest'] as const,
  argsSchema,
  build: (args) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: [
            `Produce a radar brief covering the last ${args.sinceHours} hour${args.sinceHours === 1 ? '' : 's'}${args.category ? `, category=${args.category}` : ' across all GST categories'}.`,
            '',
            'Step 1. Read `gst://radar/fyi/latest` to load the most recent annotated FYI items from the local snapshot.',
            args.category
              ? `  Filter the loaded items to category="${args.category}".`
              : '  Use all categories (pe-ma, enterprise-tech, ai-automation, security).',
            `  Filter by recency: include only items published within the last ${args.sinceHours} hours.`,
            '',
            "Step 2. If the snapshot is missing (the resource returns the structured 'run npm run radar:seed' error), surface the error to the user verbatim and stop. Do not fabricate items.",
            '',
            'Step 3. Group the in-scope items by category. Within each category, surface 3-5 items at most (more than that is digest-overload — the analyst will read the full feed if they want comprehensive coverage).',
            '',
            'Step 4. For each item, write 2-3 sentences in the GST Take voice — declarative, anchored to the deal-team relevance, no hedging. Lead with the why-it-matters, not the source. End each item with a one-line "what to watch" framing.',
            '',
            'Step 5. Close with a "GST Take across the brief" paragraph (3-4 sentences) that surfaces the highest-signal pattern across the in-scope items — what story do these items collectively tell?',
            '',
            'Voice: pre-meeting briefing. The reader has 90 seconds before walking into a deal call. The brief should leave them sounding informed, not overwhelmed.',
          ].join('\n'),
        },
      },
    ],
  }),
};
