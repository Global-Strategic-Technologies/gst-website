/**
 * Prompt: gst_architecture_layer_review
 *
 * Walks the target through the 5-layer architecture framework using the
 * canonical `gst://library/business-architectures` Library article
 * (embedded inline as the second message — Commit 5 / V1 finding 1).
 * Surfaces architectural risks per layer.
 */

import { z } from 'zod';
import type { GstPrompt } from './types';
import { authorialIntentLine, embedLibraryArticle } from './embed';

const argsSchema = z.object({
  targetSummary: z
    .string()
    .min(20)
    .describe(
      'Free-text summary of the target — product, stage, technology stack signals, organizational shape.'
    ),
});

const PROMPT_NAME = 'gst_architecture_layer_review';

export const architectureLayerReviewPrompt: GstPrompt<typeof argsSchema> = {
  name: PROMPT_NAME,
  description:
    "Walk a target through GST's 5-layer architecture framework and surface risks per layer.",
  version: '0.0.1',
  lastReviewedAt: '2026-05-01',
  orchestrates: ['gst://library/business-architectures'] as const,
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
            'Apply the GST 5-layer architecture framework to the following target:',
            '',
            `> ${args.targetSummary}`,
            '',
            'Step 1. The canonical `gst://library/business-architectures` Library article is embedded in the next message. It defines the 5-layer framework — read its layer definitions and use them verbatim. Do NOT substitute a generic architecture taxonomy.',
            '',
            'Step 2. For each layer (in the order defined by the embedded article), produce a structured analysis:',
            "  - Current state — one paragraph describing what's likely true at this layer based on the target summary. Where the summary doesn't directly indicate the state, name the assumption you're making and proceed.",
            '  - Risks — 2-3 architectural risks specific to this layer for this target. Phrase each as a concrete liability (e.g., "vendor lock-in to a single hyperscaler limits exit-architecture optionality") rather than a generic concern.',
            "  - Investigation handles — 1-2 concrete questions or data requests that would resolve the layer's biggest unknown.",
            '',
            'Step 3. After the per-layer analysis, write a closing section called "Cross-layer patterns" that surfaces 2-3 architectural risks that span multiple layers (e.g., "data sovereignty constraints in Industry layer cascade into Infrastructure-layer multi-region requirements").',
            '',
            'Step 4. Frame as a memo with the 5 layer sections in order followed by Cross-layer patterns.',
            '',
            'Voice: architectural, deal-team-ready. The output should read as a deliverable a CTO or VP Engineering would respect.',
          ].join('\n'),
        },
      },
      {
        role: 'user',
        content: embedLibraryArticle('gst://library/business-architectures'),
      },
    ],
  }),
};
