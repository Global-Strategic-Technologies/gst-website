/**
 * Prompt: gst_radar_brief_today
 *
 * Daily / pre-meeting digest of the most recent annotated radar items,
 * summarized in the GST Take voice. Embeds the FYI snapshot inline as
 * the second message (Commit 5 / V1 finding 1) so the model has the
 * canonical items without `resources/read`. Never makes live Inoreader
 * calls — on the Worker the registry supplies a CACHE-ONLY reader
 * precisely so a model-initiated `prompts/get` cannot spend the shared
 * Inoreader budget on a cold cache.
 *
 * The block itself is resolved by `_registry.ts`, not here: the choice of
 * reader AND of degraded-state wording is transport-specific, and this
 * module cannot see which transport it is running on.
 *
 * **BL-031.95 Phase 3 — capability mirror**: argsSchema mirrors the
 * /hub/radar website's filter UI (single `category` pill). The earlier
 * `sinceHours` argument was removed in v0.0.2 because the underlying
 * cache has a 24h TTL — items older than 24h aren't in the snapshot
 * regardless, and the website surfaces no time filter. Items are
 * inherently scoped to the snapshot's window; the body sorts by
 * `publishedAt` newest-first (matching the website's natural feed
 * order). If a tighter window becomes a real consumer need, the right
 * place to add it is BL-032 (live Inoreader transport) where a `since`
 * filter has more reach than 24h.
 */

import { z } from 'zod';
import { RadarCategoryEnum } from '../schemas';
import type { GstPrompt } from './types';
import { enumFromWire } from './wire-shape';
import { authorialIntentLine } from './embed';

// Optional-field pattern for wire-shape-wrapped args — applies `.optional()`
// at BOTH levels:
//
//   INNER `.optional()` (on the base Zod type) lets the wrapper's empty-
//     string-to-undefined preprocess produce an undefined value the
//     inner schema accepts at parse time. See V7 trial (b) fix.
//
//   OUTER `.optional()` (on the wrapper itself) makes the field appear
//     optional in Claude Desktop's form rendering (JSON Schema's
//     `required` array). The Zod-to-JSON-Schema introspection only
//     looks at the outermost schema's typeName — it sees `ZodEffects`
//     (preprocess) and doesn't unwrap to find the inner `ZodOptional`,
//     so without the outer .optional() the form renders the field with
//     a required `*` marker. See V7 trial (a) regression fix.
const argsSchema = z.object({
  category: enumFromWire(RadarCategoryEnum.optional())
    .optional()
    .describe(
      "Optional category filter. One of 'pe-ma' / 'enterprise-tech' / 'ai-automation' / 'security'. Omit for all categories. Mirrors the /hub/radar website's category filter pills."
    ),
});

const PROMPT_NAME = 'gst_radar_brief_today';

export const radarBriefTodayPrompt: GstPrompt<typeof argsSchema> = {
  name: PROMPT_NAME,
  description:
    'Daily / pre-meeting digest of the most recent annotated FYI radar items, summarized in the GST Take voice.',
  version: '0.0.5',
  lastReviewedAt: '2026-08-11',
  orchestrates: ['gst://radar/fyi/latest'] as const,
  argsSchema,
  needsFyiSnapshot: true,
  build: (args, fyiEmbed) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: [
            authorialIntentLine(PROMPT_NAME),
            '',
            `Produce a radar brief from the current FYI snapshot${args.category ? `, filtered to category=${args.category}` : ' across all GST categories'}. The cache has a 24-hour TTL so the snapshot inherently covers recent items; sort by \`publishedAt\` newest-first to match the /hub/radar website's natural feed order.`,
            '',
            'Step 1. The `gst://radar/fyi/latest` snapshot is embedded in the next message. Treat its `items[]` array as the authoritative item set for this brief — do not invent items.',
            args.category
              ? `  Filter to items where \`category === "${args.category}"\`.`
              : '  Use all categories (pe-ma, enterprise-tech, ai-automation, security).',
            '',
            'Step 2. If the next message is a plain TEXT block rather than an embedded resource, no items are available: surface that text to the user verbatim and STOP. Do not fabricate items, and do not add remediation advice of your own — the text already states what applies to this deployment.',
            '',
            'Step 3. Group the in-scope items by category. Within each category, surface 3-5 items at most (more than that is digest-overload — the analyst will read the full feed if they want comprehensive coverage). Sort within each group by `publishedAt` newest-first.',
            '',
            'Step 4. For each item, write 2-3 sentences in the GST Take voice — declarative, anchored to the deal-team relevance, no hedging. Lead with the why-it-matters, not the source. End each item with a one-line "what to watch" framing.',
            '',
            'Step 5. Close with a "GST Take across the brief" paragraph (3-4 sentences) that surfaces the highest-signal pattern across the in-scope items — what story do these items collectively tell?',
            '',
            args.category
              ? `Step 6. Append an "Open in Hub" footer with the link \`https://globalstrategic.tech/hub/radar?category=${args.category}\` — opens \`/hub/radar\` filtered to the same category so the analyst can browse the full feed (BL-031.95 Phase 3.B). Use exactly that URL — do not URL-encode the category value (the filter values are already URL-safe slugs).`
              : 'Step 6. Append an "Open in Hub" footer with the link `https://globalstrategic.tech/hub/radar` — opens the unfiltered Radar page so the analyst can browse the full feed (BL-031.95 Phase 3.B).',
            '',
            // BL-119 cycle-2 Finding 1. The brief reads as finished analytical
            // prose and is forwardable as-is, but every item in it is
            // third-party reporting that GST aggregated and annotated — not
            // reporting GST verified. The caveat existed in the backlog, the
            // operator runbook and the marketing copy, and in NO surface that
            // actually emits the content, so a partner could paste this into a
            // client email with nothing marking its provenance. It is a step
            // rather than a Voice note because the v0.0.4 run followed all
            // seven steps faithfully and emitted no caveat: the model does what
            // the numbered steps say.
            'Step 7. Close with a one-line provenance caveat, after the "Open in Hub" footer. State that the brief aggregates third-party reporting with GST annotation, that it is not independently verified, and that items should be confirmed against their sources before being acted on or shared with a client. Keep it to a single sentence in the brief\'s own voice — it is a standing property of the content, not a disclaimer bolted on.',
            '',
            'Voice: pre-meeting briefing. The reader has 90 seconds before walking into a deal call. The brief should leave them sounding informed, not overwhelmed.',
          ].join('\n'),
        },
      },
      // Resolved by `_registry.ts` — see `GstPrompt.build`. Omitted entirely
      // when absent rather than falling back to a locally-imported constant:
      // choosing the text here would mean choosing it without knowing the
      // transport, which is how remote clients ended up being told to run a
      // local seed script. Unreachable in production (the registry always
      // supplies a block for `needsFyiSnapshot` prompts); reachable from unit
      // tests that call `build(args)` with one argument.
      ...(fyiEmbed ? [{ role: 'user' as const, content: fyiEmbed }] : []),
    ],
  }),
};
