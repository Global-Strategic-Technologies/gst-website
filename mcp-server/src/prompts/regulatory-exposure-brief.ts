/**
 * Prompt: gst_regulatory_exposure_brief
 *
 * Compiles applicable regulatory frameworks for a target's jurisdictional
 * and data footprint. Surfaces per-framework summaries grounded in the
 * `search_regulations` result fields (name, summary, scope,
 * keyRequirements, penalties) plus the filtered Regulatory Map deep-link.
 *
 * Body design contract: search regulations once per jurisdiction ×
 * data-category combination; for each match, build the per-framework
 * summary from the search-result fields directly. Resources are user-
 * pinned (not model-fetchable from prompt expansion in Claude Desktop —
 * V1 finding 1) so the prompt does not call `resources/read`. The
 * enriched search-result schema (BL-031.75 V4 follow-up) gives the
 * model enough source data to keep prose grounded without falling back
 * to training.
 */

import { z } from 'zod';
import type { GstPrompt } from './types';
import { arrayFromWire } from './wire-shape';
import { authorialIntentLine, irlEvidencePrecedence } from './embed';

const argsSchema = z.object({
  targetJurisdictions: arrayFromWire(z.array(z.string().min(2)).min(1)).describe(
    'Jurisdictions where the target operates / collects / processes data (e.g. ["eu", "us-ca"]).'
  ),
  dataCategories: arrayFromWire(z.array(z.string().min(3)).min(1)).describe(
    'Regulatory categories to assess — typically a subset of "data-privacy" / "ai-governance" / "industry-compliance" / "cybersecurity".'
  ),
  productType: z
    .string()
    .min(2)
    .describe(
      'Target product type (informs which frameworks are applicable beyond pure jurisdiction).'
    ),
});

const PROMPT_NAME = 'gst_regulatory_exposure_brief';

export const regulatoryExposureBriefPrompt: GstPrompt<typeof argsSchema> = {
  name: PROMPT_NAME,
  description:
    'Compile applicable regulatory frameworks for a target, with summaries pulled from the search-result data + per-framework Regulatory Map URIs.',
  version: '0.1.0',
  lastReviewedAt: '2026-08-20',
  orchestrates: ['search_regulations', 'gst://regulations/'] as const,
  consumesTargetEvidence: true,
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
            `Compile a regulatory exposure brief for a ${args.productType} target operating across the following jurisdictions: ${args.targetJurisdictions.join(', ')}.`,
            '',
            `Data / regulation categories in scope: ${args.dataCategories.join(', ')}.`,
            '',
            irlEvidencePrecedence(),
            '',
            'Step 1. For each jurisdiction × category pair, call `search_regulations` with `{ jurisdiction, category }`. If a jurisdiction id is not recognized (no matches returned), call `list_regulation_facets` to find the canonical id (e.g. is it "uk" or "gbr"? "us-ca" or "ca"?) and retry.',
            '',
            "Step 2. For each unique framework that appears in any search result, build the per-framework summary FROM THE SEARCH-RESULT FIELDS — not from training. The richer fields are the primary source: `scope` (who/where the framework applies), `keyRequirements` (the authored bullet-point obligations), `penalties` (the statutory penalty band). The high-level `summary` field is the framing paragraph; quote or paraphrase it for the lede. Cite specific obligations by reading from `keyRequirements` rather than naming statute articles or thresholds the model recalls — this keeps the brief auditable and grounded. The per-framework `gst://regulations/<jurisdiction>/<framework-id>` URI is included so the analyst can pin the canonical Resource in Claude Desktop's connectors UX for full text. Do not attempt `resources/read` from a prompt expansion — Resources are user-pinned, not model-fetchable from prompts.",
            '',
            'Step 3. Frame the output as a structured brief with the following sections:',
            '  (1) Header — target product type + jurisdictions + categories assessed.',
            '  (2) Per-jurisdiction breakdown — for each jurisdiction, list the applicable frameworks with: name, effective date (from `effectiveDate`), and a 1-paragraph summary of the relevant obligations FOR A ' +
              args.productType.toUpperCase() +
              ' BUSINESS (built from the search-result `scope` + `keyRequirements` fields where present; tailored to the product type, not a generic restatement of the framework).',
            '  (3) Cross-jurisdictional themes — surface 2-3 patterns that span the supplied jurisdictions (e.g., "all three jurisdictions impose breach-notification windows under 72 hours").',
            "  (4) Open in Hub — embed the per-result `deeplink` field for each framework discussed (links into the Regulatory Map filtered to that framework's region+category) and the aggregate `filterDeeplink` from the search response when present.",
            '',
            'Voice: precise, citation-anchored. Each obligation referenced should map to a specific framework named in the brief. No regulatory hand-waving.',
          ].join('\n'),
        },
      },
    ],
  }),
};
