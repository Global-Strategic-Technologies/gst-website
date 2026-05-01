/**
 * Prompt: gst_radar_brief_today
 *
 * Daily / pre-meeting digest of the most recent annotated radar items,
 * summarized in the GST Take voice. Embeds the FYI snapshot inline as
 * the second message (Commit 5 / V1 finding 1) so the model has the
 * canonical items without `resources/read`. Never makes live Inoreader
 * calls.
 */

import { z } from 'zod';
import { RadarCategoryEnum } from '../schemas';
import type { GstPrompt } from './types';
import { enumFromWire, numberFromWire } from './wire-shape';
import { authorialIntentLine, embedFyiRadarSnapshot } from './embed';

// `.optional()` MUST be applied to the inner schema (not chained on the
// wrapper) so the wrapper's empty-string-to-undefined preprocess takes
// effect when Claude Desktop ships `""` for an unfilled form field. See
// V7 trial (b) finding. `.default()` is intentionally NOT used here:
// it only fires when input is undefined, but our preprocess turns `''`
// into undefined too late (after .default has already passed control
// downstream). Defaults are applied at use time in `build()` below.
const SINCE_HOURS_DEFAULT = 24;

const argsSchema = z.object({
  category: enumFromWire(RadarCategoryEnum.optional()).describe(
    "Optional category filter. One of 'pe-ma' / 'enterprise-tech' / 'ai-automation' / 'security'. Omit for all categories."
  ),
  sinceHours: numberFromWire(z.number().int().positive().max(168).optional()).describe(
    'Lookback window in hours. Optional; defaults to 24 (max 168 = one week).'
  ),
});

const PROMPT_NAME = 'gst_radar_brief_today';

export const radarBriefTodayPrompt: GstPrompt<typeof argsSchema> = {
  name: PROMPT_NAME,
  description:
    'Daily / pre-meeting digest of the most recent annotated FYI radar items, summarized in the GST Take voice.',
  version: '0.0.1',
  lastReviewedAt: '2026-05-01',
  orchestrates: ['gst://radar/fyi/latest'] as const,
  argsSchema,
  build: (args) => {
    const sinceHours = args.sinceHours ?? SINCE_HOURS_DEFAULT;
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              authorialIntentLine(PROMPT_NAME),
              '',
              `Produce a radar brief covering the last ${sinceHours} hour${sinceHours === 1 ? '' : 's'}${args.category ? `, category=${args.category}` : ' across all GST categories'}.`,
              '',
              'Step 1. The `gst://radar/fyi/latest` snapshot is embedded in the next message. Treat its `items[]` array as the authoritative item set for this brief — do not invent items.',
              args.category
                ? `  Filter to items where \`category === "${args.category}"\`.`
                : '  Use all categories (pe-ma, enterprise-tech, ai-automation, security).',
              `  Filter by recency: include only items where \`publishedAt\` is within the last ${sinceHours} hours of the snapshot's \`lastSeededAt\`.`,
              '',
              "Step 2. If the next message is a text block containing 'Radar snapshot not found' (instead of an embedded resource), surface that text to the user verbatim and STOP. Do not fabricate items. The user needs to run `npm run radar:seed` from the gst-website repo root.",
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
        {
          role: 'user',
          content: embedFyiRadarSnapshot(),
        },
      ],
    };
  },
};
