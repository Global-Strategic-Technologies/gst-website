/**
 * `gst_irl_sweep` — the trust-the-operator IRL ingestion prompt (ADR-0022
 * when it lands; plan: goofy-prancing-wirth).
 *
 * Successor to `gst_irl_ingestion`, rebuilt from first principles: a
 * populated GST IRL is ipso facto trusted input — the IRL schema exists
 * precisely to feed the Hub tools — so this prompt carries NO provenance
 * apparatus. No body hashing, no server-side caching, no citation
 * verification loops, no RUN-AUDIT blocks, no meta fences, no audit
 * levels. The audit surface is one model-authored "Gaps & assumptions"
 * section. What it KEEPS from its predecessor is everything that encodes
 * engine behavior rather than distrust: the workbook column contract, the
 * inclusion gates (they encode engine null-returns), the engine-math rule
 * constants, the conditional regulatory triggers, and the deeplink
 * discipline.
 *
 * ONE argument, ONE behavior (v0.2.0). The sweep always runs full —
 * extract-to-dossier. The former `mode: extract-only` behavior is its own
 * prompt, `gst_irl_extract` (operator ruling 2026-08-25: modularity + a
 * simpler slash form). Target name and engagement context are INFERRED
 * from the IRL itself (`> Target:` / `> Engagement context:` preamble
 * lines first, rows 0-01 / 0-02 second — row 0-02 is absent on most
 * pipeline-generated IRLs because the generator's skip-if directive
 * removes it when a context was stated); partner lead and project code
 * name come from the conversation when the operator has stated them.
 *
 * During the coexistence window `gst_irl_ingestion` remains registered
 * and unchanged; once this prompt is live-verified, the removal PR deletes
 * the old surface (prompt, three provenance tools, caches, `_audit`
 * blocks per the operator's pending end-state decision).
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
  VDR_RESOURCE_URI,
  VDR_FOLDER_TAXONOMY,
  WORKBOOK_COLUMN_CONTRACT,
  IRL_TRUSTED_ARRIVAL,
  IRL_COMPLETENESS_CHECK,
  IRL_INCLUSION_GATES,
  IRL_EXTRACTION_RULES_SECTION,
} from './extraction-rules';

const PROMPT_NAME = 'gst_irl_sweep';

/** Hoisted so the registry field and the run-parameters line cannot drift. */
const PROMPT_VERSION = '0.2.0';

/**
 * The nine tools this prompt orchestrates. The old prompt's list minus
 * `compose_dossier_envelope` — there is no envelope step; the model writes
 * the dossier and its gap list directly.
 */
export const SWEEP_ORCHESTRATED_TOOLS = [
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

/**
 * Arrival + inference. The trust half (`IRL_TRUSTED_ARRIVAL`) is shared
 * with `gst_irl_extract`; the inference bullets are sweep-only — the
 * extract record carries no target or voice, so only the dossier needs
 * them. Preamble lines are the PRIMARY inference source — pipeline-
 * generated IRLs carry them (`npm run irl:extract` emits both), while row
 * 0-02 is usually absent by skip-if.
 */
const ARRIVAL_AND_INFERENCE = [
  '## The IRL, and what it already tells you',
  '',
  IRL_TRUSTED_ARRIVAL,
  '',
  '**Infer the run context from the IRL rather than asking for it:**',
  '',
  '- **Target name**: the `> Target:` metadata line in the IRL header if present, else row 0-01 (Company name). If neither exists, ask the user for the target name — that is the one thing a sweep cannot proceed without.',
  '- **Engagement context** (voice only — it never changes which tools run): resolve through this chain, and name the source you used in (A). (1) The `> Engagement context:` metadata line, **if it carries one of the canonical display labels** — `Sell-side`, `Buy-side`, `Value Creation`, `Unspecified`. (2) A header that carries anything else — an engagement title, a phase name, free text — is NOT a context label; **fall through to row 0-02** and map its stated posture onto the nearest label (e.g. "post-close value creation" → `Value Creation`; "buy-side review" → `Buy-side`). (3) Neither source states one → universal voice. `Unspecified` and an absent line both mean universal voice. Row 0-02 is absent on most pipeline-generated IRLs (the generator omits it when a context was stated at generation time), which is why the header is checked first — but a specific row 0-02 answer always beats a non-canonical header.',
  '- **Partner lead / project code name**: use them if the user has stated them in this conversation; otherwise attribute the synthesis generically and label the engagement by target name.',
  '',
  'State the inferred target name and engagement context in the opening of section (A) so the user can correct either conversationally.',
].join('\n');

/** Tool steps + dossier shape — the sweep's whole job. */
const SWEEP_STEPS = [
  '## Tool steps',
  '',
  "Call each gate-passing tool ONCE with inputs extracted per the rules above. Base schemas only — no `_audit` blocks. `'unknown'` sentinels and `null` fields are welcome where the IRL is silent; that is the honest input, not a failure.",
  '',
  "- **`generate_diligence_agenda`**: all 13 dimensions, `'unknown'` where the IRL does not determine a value (`geographies: ['unknown']` for the array).",
  '- **`compute_techpar`**: `mode: "deepdive"` per the rule above; all money fields in annual dollars on a single currency basis (convert to USD first and state the conversion inline).',
  '- **`assess_infrastructure_cost_governance`**: call it FIRST with `answers: {}` to fetch the canonical domain and question ids from the response — do NOT describe the framework from memory — then call it seeded per the seeding rules.',
  '- **`estimate_tech_debt_cost`**: per the MTTR rule; `null` for fields §04 does not state (the response returns `extractionOnly` naming them).',
  '- **`list_regulation_facets`** then **`search_regulations`**: one call per framework/jurisdiction, using facet values verbatim. Keep `limit` at or below 50 — larger responses have exceeded real client ceilings; if `returned < totalMatched`, narrow by category and batch a second call rather than raising the limit.',
  '- **`list_portfolio_facets`** then **`search_portfolio`**: use returned theme / engagement values VERBATIM — anything else matches zero projects. When the engagement side is ambiguous, pass both in one call.',
  '- **`search_radar`**: the category enum has four values (`pe-ma | enterprise-tech | ai-automation | security`); omit `category` to sweep all.',
  '',
  '**Deeplink discipline**: every tool response carries a `deeplink`. Each tool-backed dossier section MUST close with its deeplink, copied VERBATIM — never invent or edit a URL. Without the links the dossier is read-only.',
  '',
  '## Dossier shape',
  '',
  'Write these sections in order. Tool-backed sections render only when their tool ran.',
  '',
  '- **(A) Target snapshot** — 3-4 sentences orienting the reader: the fill ratio first, then the inferred target name and engagement context, then what the target is and where it operates (§00 + §01).',
  '- **(B) Diligence agenda** — topics and attention areas from `generate_diligence_agenda`, one bullet per topic. Close: "Open Diligence Wizard" deeplink.',
  '- **(C) Architecture & paradigm assessment** — 2-3 paragraphs from `compute_techpar`: paradigm, R&D posture, cost drivers. Close: "Open TechPar Wizard" deeplink.',
  '- **(D) Infrastructure cost governance** — maturity scores and the 3-5 highest-leverage recommendations from `assess_infrastructure_cost_governance`. Close: "Open ICG Wizard" deeplink.',
  '- **(E) Technical debt** — carrying cost, payback, and the 1-2 most expensive debt categories from `estimate_tech_debt_cost`; name any `extractionOnly` fields plainly. Close: "Open Tech Debt Calculator" deeplink.',
  '- **(F) Regulatory exposure** — one subsection per framework from `search_regulations`, quoting `keyRequirements` verbatim, citing frameworks by `name` + `effectiveDate` (the corpus carries no article numbers — do not invent any). Close each subsection with ITS deeplink ("Open in Regulatory Map") — they filter to different region + category combinations.',
  '- **(G) Comparable engagements** — 3-5 code-named matches from `search_portfolio`, one line each on why relevant + the lesson. Close: portfolio deeplink.',
  '- **(H) Market signal** — 2-3 bullets from `search_radar` on market timing. Close: "Open Radar Feed" deeplink.',
  '- **(I) Synthesis & recommendation** — 3-5 sentences in the engagement voice, attributed per the inference rules, closing with 5-7 follow-up document requests using the VDR folder labels VERBATIM from the taxonomy below.',
  '- **(J) Gaps & assumptions** — see its own section below.',
].join('\n');

/** The single audit surface. */
const GAP_LIST = [
  '## (J) Gaps & assumptions (the audit surface of this run)',
  '',
  'One numbered list, written by you, honest and specific:',
  '',
  '- High-value IRL rows that are unanswered or carry only pointers, with the concrete follow-up (a named document, a JQL pull, an owner to ask).',
  '- Tools elided by their gates, and the predicate that failed.',
  '- Every assumption, conversion, or synthesis you applied: currency conversions and their rates, zeroed TechPar components, `extractionOnly` fields, dimensions passed as `unknown` that a follow-up could resolve.',
  '- Anything the run inferred that the user should confirm (target name / engagement context when inferred from thin evidence).',
  '',
  'The dossier says "per the IRL" — it never claims server-side verification, because there is none. This list is what makes that honest.',
].join('\n');

/** Compressed voice cues, keyed off the INFERRED context display labels. */
const VOICE_CUES = [
  '## Voice (keyed off the inferred engagement context)',
  '',
  '- **`Sell-side`**: the defensible story — durable signal first, open items framed as known-and-managed. Reads as a pre-emptive answer to the questions an acquirer will ask.',
  '- **`Buy-side`**: risks against the deal thesis — the TechPar / tech-debt / ICG gaps that would shift the entry price, open items framed as discovery for the closing timeline.',
  '- **`Value Creation`**: the 100-day plan — the 1-2 architectural decisions that compound across plays, open items framed as Day-100 deliverables.',
  '- **Absent or `Unspecified`**: universal voice — balanced read, equal weight, the partner sharpens framing on read.',
].join('\n');

// ─── Build ─────────────────────────────────────────────────────────────

type Args = z.infer<typeof argsSchema>;

function buildBody(args: Args): string {
  const sections = [
    authorialIntentLine(PROMPT_NAME),
    '',
    '## Run parameters',
    '',
    '- Workflow: **full sweep** — extract, invoke every gate-passing Hub tool, synthesize the dossier. (The portable extract record without tool calls is its own prompt, `gst_irl_extract`.)',
    `- Prompt version: **${PROMPT_VERSION}**.`,
    '',
    '**Run completeness.** The run parameters above, together with the IRL, are the operator\'s complete instruction: the workflow is fixed, the target and engagement context are inferable from the IRL itself, and no choice is left open. Populating the arguments and submitting is how an operator says "run this" — that is what invoking a workflow means. The run has three genuine stop conditions, each worth saying plainly if hit: no IRL is present anywhere, the blank-template halt fires, or the analysis tools are unavailable in this conversation.',
    '',
    deliveredAsDocumentClause({ citesRunParameters: true }),
    '',
    ARRIVAL_AND_INFERENCE,
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
    SWEEP_STEPS,
    '',
    GAP_LIST,
    '',
    VOICE_CUES,
    '',
    VDR_FOLDER_TAXONOMY,
  ];
  if (args.filledIrl) {
    sections.push('', '## The populated IRL (verbatim)', '', args.filledIrl);
  }
  return sections.join('\n');
}

export const irlSweepPrompt: GstPrompt<typeof argsSchema> = {
  name: PROMPT_NAME,
  description:
    'Ingest a populated GST IRL and drive every applicable Hub tool to a unified engagement dossier. Trust-the-operator successor to gst_irl_ingestion: one optional argument, no provenance apparatus, one honest gap list. For the portable extract record without tool calls, use gst_irl_extract.',
  version: PROMPT_VERSION,
  lastReviewedAt: '2026-08-25',
  orchestrates: [...SWEEP_ORCHESTRATED_TOOLS, IRL_SOURCE_EMBED_URI, VDR_RESOURCE_URI] as const,
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
