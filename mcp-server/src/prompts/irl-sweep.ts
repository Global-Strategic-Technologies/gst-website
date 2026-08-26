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
 * Two arguments only. Target name and engagement context are INFERRED
 * from the IRL itself (`> Target:` / `> Engagement context:` preamble
 * lines first, rows 0-01 / 0-02 second — row 0-02 is absent on most
 * pipeline-generated IRLs because the generator's skip-if directive
 * removes it when a context was stated); partner lead and project code
 * name come from the conversation when the operator has stated them.
 * Arguments duplicating IRL content were the old prompt's redundancy.
 *
 * During the coexistence window `gst_irl_ingestion` remains registered
 * and unchanged; once this prompt is live-verified, PR2 removes the old
 * surface (prompt, three provenance tools, caches, `_audit` blocks).
 */

import { z } from 'zod';
import type { GstPrompt } from './types';
import { stringFromWire, enumFromWire } from './wire-shape';
import {
  authorialIntentLine,
  deliveredAsDocumentClause,
  embedIrlGeneratorSource,
  embeddedTaxonomyFraming,
  IRL_SOURCE_EMBED_URI,
} from './embed';
import {
  UNKNOWN_PROPAGATION_RULE_V2,
  TECHPAR_MODE_RULE_V2,
  MTTR_P1_RULE_V2,
  ENG_COST_DEDUP_RULE,
  ICG_SEEDING_RULES,
  EU_AI_ACT_CONDITIONAL_TRIGGER,
  NIS2_CONDITIONAL_TRIGGER,
  VDR_RESOURCE_URI,
  VDR_FOLDER_TAXONOMY,
  WORKBOOK_COLUMN_CONTRACT,
} from './extraction-rules';
import { IRL_EXTRACT_RECORD_DIRECTIVE_V2 } from '../schemas/irl-extract-record';

const PROMPT_NAME = 'gst_irl_sweep';

/** Hoisted so the registry field and the run-parameters line cannot drift. */
const PROMPT_VERSION = '0.1.0';

const modeValues = ['full', 'extract-only'] as const;

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

// Field order is load-bearing: Claude Desktop renders the slash-command
// form in property order. `.optional()` on BOTH the inner schema and the
// wrapper so Desktop's form introspection marks the field optional.
const argsSchema = z.object({
  filledIrl: stringFromWire(z.string().min(200).optional())
    .optional()
    .describe(
      'Optional. The populated Information Request List — the entire markdown body. Omit it when the IRL is attached to the conversation or was pasted earlier; the model uses whatever is present, and asks for a paste only when nothing is. Pasting into a single-line client field collapses line breaks; the run still works.'
    ),
  mode: enumFromWire(z.enum(modeValues).optional())
    .optional()
    .describe(
      'Must be one of: full · extract-only. Defaults to full — extract the inputs, invoke every applicable Hub tool through its inclusion gate, and synthesize a dossier. extract-only emits the portable IRL extract record plus the derived per-tool JSON payloads and a gap list, with no tool invocations and no synthesis prose — cheap, portable, and consumable by later sessions and other GST prompts.'
    ),
});

// ─── Body sections ─────────────────────────────────────────────────────

/**
 * Arrival + inference. The entire trust surface of this prompt: use what
 * is present, infer what the IRL already states, ask only when nothing
 * arrived. Preamble lines are the PRIMARY inference source — pipeline-
 * generated IRLs carry them (`npm run irl:extract` emits both), while row
 * 0-02 is usually absent by skip-if.
 */
const ARRIVAL_AND_INFERENCE = [
  '## The IRL, and what it already tells you',
  '',
  '**The populated IRL is whichever of these is present: the `filledIrl` argument (rendered at the end of this message when supplied), an attachment on this conversation, or a paste earlier in the thread. Use it as given — it is the input this workflow exists to consume.** If none is present, ask the user to paste it and stop until they do. If more than one candidate is present, name them and ask which to use rather than merging. The only rule: extract what the document states — do not invent rows or answers it does not contain.',
  '',
  "**A submission with no accompanying chat message is a normal invocation** — many clients send the populated form with no typed text, and some deliver the expansion as an attached file. The submission itself carries the operator's intent: the resolved mode in Run parameters is what they asked for.",
  '',
  '**Infer the run context from the IRL rather than asking for it:**',
  '',
  '- **Target name**: the `> Target:` metadata line in the IRL header if present, else row 0-01 (Company name). If neither exists, ask the user for the target name — that is the one thing a sweep cannot proceed without.',
  '- **Engagement context** (voice only — it never changes which tools run): resolve through this chain, and name the source you used in (A). (1) The `> Engagement context:` metadata line, **if it carries one of the canonical display labels** — `Sell-side`, `Buy-side`, `Value Creation`, `Unspecified`. (2) A header that carries anything else — an engagement title, a phase name, free text — is NOT a context label; **fall through to row 0-02** and map its stated posture onto the nearest label (e.g. "post-close value creation" → `Value Creation`; "buy-side review" → `Buy-side`). (3) Neither source states one → universal voice. `Unspecified` and an absent line both mean universal voice. Row 0-02 is absent on most pipeline-generated IRLs (the generator omits it when a context was stated at generation time), which is why the header is checked first — but a specific row 0-02 answer always beats a non-canonical header.',
  '- **Partner lead / project code name**: use them if the user has stated them in this conversation; otherwise attribute the synthesis generically and label the engagement by target name.',
  '',
  'State the inferred target name and engagement context in the opening of section (A) so the user can correct either conversationally.',
].join('\n');

/**
 * The advisory completeness check — the permissive successor to the old
 * blocking pre-flight. Same ratio arithmetic (so the operator-side
 * extractor and BL-140's conformance suite still reconcile against it);
 * only the truly-degenerate case halts.
 */
const COMPLETENESS_CHECK = [
  '## Completeness check (advisory — compute it, state it, proceed)',
  '',
  'Before extracting, compute the fill ratio over the **10 canonical sections (00–09)** — engagement-specific sections 10/11 do not count:',
  '',
  '- `totalResponseCells` = all request rows present (ref-tagged `0-01` … `9-NN`).',
  '- `substantiveCells` = rows whose ANSWER SLOT (Response + Comments joined, per the workbook column contract) carries substantive content. Blank, `n/a`, `not yet tracked`, `TBD`, `--`, `<NO RESPONSE>`, or a bare `(Source:)`/`(Note:)` pointer is not substantive.',
  '- `fillRatio = substantiveCells / totalResponseCells`, stated as a rounded percentage.',
  '',
  '**Halt ONLY if `substantiveCells` is 0 or the ratio is below 5%** — that is the blank request template, not a filled IRL; say so and ask the user to confirm before proceeding. **Otherwise ALWAYS proceed**, whatever the ratio: state it as the first sentence of section (A), and list the thin or empty sections in (J) Gaps & assumptions. A sparse IRL produces a sparse dossier with an honest gap list — that is the correct output, not an error.',
].join('\n');

/**
 * The inclusion gates — kept from the old prompt because they encode
 * ENGINE behavior (null returns, honest-widening sentinels), not distrust.
 * Restated compactly; predicates unchanged.
 */
const INCLUSION_GATES = [
  '## Inclusion gates (which tools run)',
  '',
  '"Signal" means a substantive answer in a row\'s ANSWER SLOT — a `(Source: file.xlsx)` pointer or a `(Note: pending)` caveat is a promise of signal, not signal. A gate that failed means: skip the invocation, skip its dossier section, and add one line to (J) naming the failed predicate and the IRL section that would have satisfied it.',
  '',
  '1. **`generate_diligence_agenda`** — always runs. Every dimension honestly defaults to `unknown`; the agenda is useful as a known-vs-not inventory.',
  '2. **`compute_techpar`** — runs if (§00 ARR is substantive) AND (§02 carries engineering-cost signal OR §03 carries hosting signal). The engine returns null when `arr` or `infraHostingAnnual` is zero, so the gate needs both a denominator and a numerator. §07 salary refines accuracy but does not open the gate alone.',
  '3. **`assess_infrastructure_cost_governance`** — always runs. Every unseeded answer falls back honestly (see the seeding rules).',
  '4. **`estimate_tech_debt_cost`** — runs if §04 has at least one row with a substantive answer. §04 is the canonical input section; computing a dollar carrying-cost from a section that states nothing would fabricate the headline number.',
  '5. **`search_regulations`** — runs if (§09 names at least one framework) OR (a conditional trigger below fires).',
  '6. **`search_portfolio`** — runs if §00 supplies a product-type-like answer OR §01 supplies an industry / competitive-landscape answer.',
  '7. **`search_radar`** — always runs; its output is supplementary market context.',
  '8. **`list_portfolio_facets`** — inherits from `search_portfolio` (called first, to obtain canonical facet values).',
  '9. **`list_regulation_facets`** — inherits from `search_regulations` (same).',
  '',
  '**Conditional regulatory triggers** (gap-fills for a §09 the partner left thin):',
  '',
  `- ${EU_AI_ACT_CONDITIONAL_TRIGGER}`,
  `- ${NIS2_CONDITIONAL_TRIGGER}`,
].join('\n');

/** Extraction rules — the engine-math constants, v2 forms. */
const EXTRACTION_RULES_SECTION = [
  '## Extraction rules (engine math — these prevent wrong numbers, read them)',
  '',
  UNKNOWN_PROPAGATION_RULE_V2,
  '',
  TECHPAR_MODE_RULE_V2,
  '',
  ENG_COST_DEDUP_RULE,
  '',
  MTTR_P1_RULE_V2,
].join('\n');

/** Full-mode tool steps + dossier shape. */
const FULL_MODE_STEPS = [
  '## Tool steps (full mode)',
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
  '## Dossier shape (full mode)',
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

/** Extract-only mode: the v2 record + derived payload fences. */
const EXTRACT_ONLY_STEPS = [
  '## Extract-only mode',
  '',
  'No tool invocations, no dossier prose. Produce, in order: the IRL extract record (below), then one `payload: <tool>` JSON fence per GATE-PASSING tool from the inclusion-gates list — the exact arguments you would have called it with (base schemas, no `_audit`) — then one `elided: <tool>` line per gate-failing tool naming the failed predicate, then (J) Gaps & assumptions. Fences are for the seven argument-bearing tools: `generate_diligence_agenda`, `compute_techpar`, `assess_infrastructure_cost_governance`, `estimate_tech_debt_cost`, `search_regulations`, `search_portfolio`, `search_radar`; the prefacing `list_portfolio_facets` / `list_regulation_facets` take no arguments and get no fences.',
  '',
  IRL_EXTRACT_RECORD_DIRECTIVE_V2,
].join('\n');

/** The single audit surface. */
const GAP_LIST = [
  '## (J) Gaps & assumptions (both modes — the audit surface of this run)',
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
  const mode = args.mode ?? 'full';
  const sections = [
    authorialIntentLine(PROMPT_NAME),
    '',
    '## Run parameters',
    '',
    `- Mode: **${mode}**`,
    `- Prompt version: **${PROMPT_VERSION}** — copy this into the extract record's \`_meta.promptVersion\` (extract-only); nothing server-side supplies it.`,
    '',
    '**Run completeness.** The run parameters above, together with the IRL, are the operator\'s complete instruction: `mode` is resolved, the target and engagement context are inferable from the IRL itself, and no choice is left open. Populating the arguments and submitting is how an operator says "run this" — that is what invoking a workflow means. The run has three genuine stop conditions, each worth saying plainly if hit: no IRL is present anywhere, the blank-template halt fires, or the analysis tools are unavailable in this conversation.',
    '',
    deliveredAsDocumentClause({ citesRunParameters: true }),
    '',
    ARRIVAL_AND_INFERENCE,
    '',
    `The canonical IRL taxonomy (\`${IRL_SOURCE_EMBED_URI}\`) is embedded as the next message for reconciling minimally-formatted replies against the canonical bullet set.`,
    '',
    WORKBOOK_COLUMN_CONTRACT,
    '',
    COMPLETENESS_CHECK,
    '',
    EXTRACTION_RULES_SECTION,
    '',
    ICG_SEEDING_RULES,
    '',
    INCLUSION_GATES,
    '',
    mode === 'extract-only' ? EXTRACT_ONLY_STEPS : FULL_MODE_STEPS,
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
    'Ingest a populated GST IRL and drive every applicable Hub tool to a unified engagement dossier — or, in extract-only mode, a portable target record. Trust-the-operator successor to gst_irl_ingestion: two arguments, no provenance apparatus, one honest gap list.',
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
