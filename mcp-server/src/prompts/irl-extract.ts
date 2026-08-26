/**
 * `gst_irl_extract` — the portable IRL extract record, as its own prompt.
 *
 * Split out of `gst_irl_sweep` (operator ruling 2026-08-25): the record
 * is a different artifact for a different moment — a cheap, tool-call-free
 * snapshot an operator saves, pastes into a later session, or hands to any
 * other GST prompt — and folding it into the sweep as a `mode` argument
 * bought modality at the cost of a second parameter on the workflow
 * operators run most. Each prompt now does exactly one thing.
 *
 * Same trust-the-operator posture as the sweep: no provenance apparatus,
 * no hashing, no verification; the record is extract-record **v2**
 * (identityless `_meta` — self-dating, no hash or source grade), and the
 * audit surface is the (J) Gaps & assumptions list. The shared sections
 * (arrival trust, completeness arithmetic, engine-math rules, inclusion
 * gates) are imported from `extraction-rules.ts` so the two prompts cannot
 * drift.
 *
 * No target-name or engagement-context inference here: the record carries
 * neither — facts are keyed by the IRL taxonomy, and voice is a dossier
 * concern.
 */

import { z } from 'zod';
import type { GstPrompt } from './types';
import { stringFromWire } from './wire-shape';
import {
  authorialIntentLine,
  deliveredAsDocumentClause,
  embedIrlGeneratorSource,
  embeddedTaxonomyFraming,
  IRL_SOURCE_EMBED_URI,
} from './embed';
import {
  ICG_SEEDING_RULES,
  WORKBOOK_COLUMN_CONTRACT,
  IRL_TRUSTED_ARRIVAL,
  IRL_COMPLETENESS_CHECK,
  IRL_INCLUSION_GATES,
  IRL_EXTRACTION_RULES_SECTION,
} from './extraction-rules';
import { IRL_EXTRACT_RECORD_DIRECTIVE_V2 } from '../schemas/irl-extract-record';

const PROMPT_NAME = 'gst_irl_extract';

/** Hoisted so the registry field and the run-parameters line cannot drift. */
const PROMPT_VERSION = '0.1.0';

/**
 * The tools whose input payloads the record projects. This prompt CALLS
 * none of them — it emits one `payload:` fence per gate-passing tool, the
 * exact arguments a sweep would have used — but the names are the
 * prompt's working vocabulary, so they are declared and body-mentioned
 * like any orchestrated surface.
 */
export const EXTRACT_PROJECTED_TOOLS = [
  'generate_diligence_agenda',
  'list_portfolio_facets',
  'search_portfolio',
  'list_regulation_facets',
  'search_regulations',
  'compute_techpar',
  'assess_infrastructure_cost_governance',
  'estimate_tech_debt_cost',
  'search_radar',
] as const;

// `.optional()` on BOTH the inner schema and the wrapper so Desktop's
// form introspection marks the field optional.
const argsSchema = z.object({
  filledIrl: stringFromWire(z.string().min(200).optional())
    .optional()
    .describe(
      'Optional. The populated Information Request List — the entire markdown body. Omit it when the IRL is attached to the conversation or was pasted earlier; the model uses whatever is present, and asks for a paste only when nothing is. Pasting into a single-line client field collapses line breaks; the run still works.'
    ),
});

// ─── Body sections ─────────────────────────────────────────────────────

const OUTPUT_STEPS = [
  '## Output',
  '',
  '**No tool invocations, no dossier prose.** Produce, in order:',
  '',
  '1. **The IRL extract record** (directive below) — the primary artifact.',
  '2. **One `payload: <tool>` JSON fence per GATE-PASSING tool** from the inclusion-gates list — the exact arguments a full sweep would have called it with (base schemas, no `_audit`). Fences are for the seven argument-bearing tools: `generate_diligence_agenda`, `compute_techpar`, `assess_infrastructure_cost_governance`, `estimate_tech_debt_cost`, `search_regulations`, `search_portfolio`, `search_radar`; the prefacing `list_portfolio_facets` / `list_regulation_facets` take no arguments and get no fences.',
  '3. **One `elided: <tool>` line per gate-failing tool**, naming the failed predicate.',
  '4. **(J) Gaps & assumptions** (below).',
  '',
  IRL_EXTRACT_RECORD_DIRECTIVE_V2,
].join('\n');

const GAP_LIST = [
  '## (J) Gaps & assumptions (the audit surface of this run)',
  '',
  'One numbered list, written by you, honest and specific:',
  '',
  '- High-value IRL rows that are unanswered or carry only pointers, with the concrete follow-up (a named document, a JQL pull, an owner to ask).',
  '- Tools elided by their gates, and the predicate that failed.',
  '- Every assumption or conversion the record or the payloads carry: currency conversions and their rates, zeroed TechPar components, nulled tech-debt fields, dimensions passed as `unknown` that a follow-up could resolve.',
  '',
  "The record's excerpts are extraction-time verbatim spans, stated plainly — nothing here claims server-side verification, because there is none. This list is what makes that honest.",
].join('\n');

// ─── Build ─────────────────────────────────────────────────────────────

type Args = z.infer<typeof argsSchema>;

function buildBody(args: Args): string {
  const sections = [
    authorialIntentLine(PROMPT_NAME),
    '',
    '## Run parameters',
    '',
    '- Workflow: **extract-only** — the portable IRL extract record plus derived per-tool payloads, with zero tool invocations. (The full extract-to-dossier sweep is its own prompt, `gst_irl_sweep`.)',
    `- Prompt version: **${PROMPT_VERSION}** — copy this into the record's \`_meta.promptVersion\`; nothing server-side supplies it.`,
    '',
    '**Run completeness.** The run parameters above, together with the IRL, are the operator\'s complete instruction: the workflow is fixed and no choice is left open. Populating the arguments and submitting is how an operator says "run this" — that is what invoking a workflow means. The run has two genuine stop conditions, each worth saying plainly if hit: no IRL is present anywhere, or the blank-template halt fires.',
    '',
    deliveredAsDocumentClause({ citesRunParameters: true }),
    '',
    '## The IRL',
    '',
    IRL_TRUSTED_ARRIVAL,
    '',
    `The canonical IRL taxonomy (\`${IRL_SOURCE_EMBED_URI}\`) is embedded as the next message for reconciling minimally-formatted replies against the canonical bullet set.`,
    '',
    WORKBOOK_COLUMN_CONTRACT,
    '',
    IRL_COMPLETENESS_CHECK,
    '',
    IRL_EXTRACTION_RULES_SECTION,
    '',
    ICG_SEEDING_RULES,
    '',
    IRL_INCLUSION_GATES,
    '',
    OUTPUT_STEPS,
    '',
    GAP_LIST,
  ];
  if (args.filledIrl) {
    sections.push('', '## The populated IRL (verbatim)', '', args.filledIrl);
  }
  return sections.join('\n');
}

export const irlExtractPrompt: GstPrompt<typeof argsSchema> = {
  name: PROMPT_NAME,
  description:
    'Distill a populated GST IRL into the portable extract record (v2) plus derived per-tool payloads — zero tool invocations, savable and pasteable into later sessions and other GST prompts. For the full extract-to-dossier sweep, use gst_irl_sweep.',
  version: PROMPT_VERSION,
  lastReviewedAt: '2026-08-25',
  orchestrates: [...EXTRACT_PROJECTED_TOOLS, IRL_SOURCE_EMBED_URI] as const,
  argsSchema,
  build: (args) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `${buildBody(args)}\n\n${embeddedTaxonomyFraming(true)}`,
        },
      },
      {
        role: 'user',
        content: embedIrlGeneratorSource(),
      },
    ],
  }),
};
