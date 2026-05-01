/**
 * Prompt: gst_architecture_layer_review
 *
 * Walks the target through the 5-layer architecture framework
 * (Software → Infrastructure → Data → Org → Industry) using the canonical
 * Library article. Surfaces architectural risks per layer.
 */

import { z } from 'zod';
import type { GstPrompt } from './types';

const argsSchema = z.object({
  targetSummary: z
    .string()
    .min(20)
    .describe(
      'Free-text summary of the target — product, stage, technology stack signals, organizational shape.'
    ),
});

export const architectureLayerReviewPrompt: GstPrompt<typeof argsSchema> = {
  name: 'gst_architecture_layer_review',
  description:
    "Walk a target through GST's 5-layer architecture framework and surface risks per layer.",
  version: '0.1.0',
  lastReviewedAt: '2026-04-29',
  orchestrates: ['gst://library/business-architectures'] as const,
  argsSchema,
  build: (args) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: [
            'Apply the GST 5-layer architecture framework to the following target:',
            '',
            `> ${args.targetSummary}`,
            '',
            'Step 1. Read `gst://library/business-architectures` to load the canonical 5-layer framework definition. The five layers are: Software, Infrastructure, Data, Organizational, Industry.',
            '',
            'Step 2. For each layer, produce a structured analysis:',
            "  - Current state — one paragraph describing what's likely true at this layer based on the target summary. Where the summary doesn't directly indicate the state, name the assumption you're making and proceed.",
            '  - Risks — 2-3 architectural risks specific to this layer for this target. Phrase each as a concrete liability (e.g., "vendor lock-in to a single hyperscaler limits exit-architecture optionality") rather than a generic concern.',
            "  - Investigation handles — 1-2 concrete questions or data requests that would resolve the layer's biggest unknown.",
            '',
            'Step 3. After the per-layer analysis, write a closing section called "Cross-layer patterns" that surfaces 2-3 architectural risks that span multiple layers (e.g., "data sovereignty constraints in Industry layer cascade into Infrastructure-layer multi-region requirements").',
            '',
            'Step 4. Frame as a memo with these sections, in order: Software, Infrastructure, Data, Organizational, Industry, Cross-layer patterns.',
            '',
            'Voice: architectural, deal-team-ready. The output should read as a deliverable a CTO or VP Engineering would respect.',
          ].join('\n'),
        },
      },
    ],
  }),
};
