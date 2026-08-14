/**
 * Prompt: gst_comparable_engagements_memo
 *
 * Identifies 3-5 comparable past engagements from the M&A portfolio,
 * summarizes the relevant lesson from each, frames analogically for
 * the current deal.
 *
 * Body design contract: call `list_portfolio_facets` first so the model
 * knows valid theme/category values, then call `search_portfolio` with
 * appropriate filters. Synthesize 3-5 matches with one-line takeaway
 * per match. The closing memo surfaces every `deeplink` field returned
 * by the search calls as an "Open in Hub" link so the analyst can
 * forward the memo with click-through to the same filtered Portfolio
 * view (BL-031.95 Phase 4.B).
 */

import { z } from 'zod';
import { EngagementCategorySchema } from '../schemas';
import type { GstPrompt } from './types';
import { enumFromWire, stringFromWire } from './wire-shape';
import { authorialIntentLine } from './embed';

const argsSchema = z.object({
  targetDescription: z
    .string()
    .min(10)
    .describe('Free-text description of the target — industry, theme, deal-shape signal.'),
  theme: stringFromWire(z.string().optional())
    .optional()
    .describe(
      'Optional. Defaults to deriving the theme from the description. A short thematic hint to steer the comparables search (e.g. "vertical SaaS consolidation", "carve-out").'
    ),
  engagementCategory: enumFromWire(EngagementCategorySchema.optional())
    .optional()
    .describe(
      'Must be one of: Buy-Side · Sell-Side. Defaults to considering both unless the description clearly implies one. Filters the comparable engagements the memo draws on.'
    ),
});

const PROMPT_NAME = 'gst_comparable_engagements_memo';

export const comparableEngagementsMemoPrompt: GstPrompt<typeof argsSchema> = {
  name: PROMPT_NAME,
  description:
    'Identify 3-5 comparable past GST engagements and frame analogically for the current deal.',
  version: '0.0.3',
  lastReviewedAt: '2026-05-03',
  orchestrates: ['search_portfolio', 'list_portfolio_facets'] as const,
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
            `Identify and synthesize 3-5 comparable past GST engagements for the following target:`,
            '',
            `> ${args.targetDescription}`,
            '',
            args.theme
              ? `Theme hint: ${args.theme}`
              : 'Theme: not supplied — derive from the description.',
            args.engagementCategory
              ? `Engagement category hint: ${args.engagementCategory}`
              : 'Engagement category: not supplied — consider Buy-Side and Sell-Side both unless the description suggests one.',
            '',
            'Step 1. Call `list_portfolio_facets` to enumerate valid themes and engagement categories. This avoids guessing facet values that will fail the search.',
            '',
            'Step 2. Call `search_portfolio` with filters derived from the target description and the supplied hints. Run the search 1-3 times if needed to surface a useful set of matches — vary the `theme` filter or use the free-text `search` parameter to find adjacent comparables when the first pass is sparse.',
            '',
            'Step 3. From the matches, select the 3-5 most analogically useful past engagements. Prefer matches that share TWO or more of: industry, theme, growthStage, deal shape (engagementCategory). Diversity within the shortlist is valuable — pick comparables that illuminate different angles of the current target.',
            '',
            'Step 4. For EACH selected comparable, write one paragraph (3-4 sentences) covering:',
            "  - The match's codeName + 1-line context (industry, stage, year).",
            '  - The strategic question that engagement answered.',
            '  - The relevant lesson — phrased as guidance for the current target, not a retrospective.',
            '',
            'Step 5. Close with a 2-3 sentence "what this means for the current deal" framing that synthesizes the lessons across the shortlist into a directional view.',
            '',
            'Step 6. Append an "Open in Hub" footer that lists every `deeplink` URL returned by the `search_portfolio` calls (one per filter combination explored). Each link should be labelled by the filter it represents — e.g., `Open in Hub: Healthcare / Buy-Side · Logistics / Buy-Side`. The deeplink opens `/ma-portfolio` with the same filter chips pre-active so the deal team lands on the exact filtered view the memo references (BL-031.95 Phase 4.B). If no deeplink is present in a tool response (older server build), omit that link silently — never invent a URL.',
            '',
            'Voice: analytical, peer-reviewed. No client names beyond the codeName. Lessons should read as live guidance, not historical narrative.',
          ].join('\n'),
        },
      },
    ],
  }),
};
