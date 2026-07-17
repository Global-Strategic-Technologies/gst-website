/**
 * Prompt: gst_irl_ingestion (renamed from `gst_diligence_sweep` under BL-045).
 *
 * Bookend to `gst_information_request_list`. Where the IRL prompt emits the
 * *request* artifact (universal intake checklist), this prompt ingests a
 * *populated* IRL — the structured response a target returns — and uses the
 * full content to drive every applicable Hub tool surface and downstream
 * prompt artifact GST exposes. Scenario-neutral surface: serves buy-side
 * diligence, sell-side prep, value-creation engagements, and post-close
 * hardening; the `transactionContext` arg modulates voice cues without
 * gating tool selection.
 *
 * Input modes:
 *   1. `filledIrl` supplied — one-shot mode; runs the full ingestion.
 *   2. `filledIrl` omitted — interactive mode; the model asks the user to
 *      paste the populated IRL before ingesting.
 *
 * Resource embedding: the canonical `gst://library/information-request-list`
 * article is embedded so the model can reconcile the user's filled bullets
 * back to the IRL section taxonomy (especially when the user pastes a
 * minimally-formatted reply rather than the verbatim IRL skeleton);
 * `gst://library/vdr-structure` is embedded so the synthesis section can
 * use the canonical VDR-folder labels for follow-up requests verbatim.
 *
 * See: mcp-server/src/docs/prompts/irl-ingestion.md (companion doc)
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { GstPrompt } from './types';
import {
  authorialIntentLine,
  embedLibraryArticle,
  embedIrlGeneratorSource,
  IRL_SOURCE_EMBED_URI,
} from './embed';
import { arrayFromWire, booleanFromWire } from './wire-shape';
import {
  UNKNOWN_PROPAGATION_RULE,
  EU_AI_ACT_CONDITIONAL_TRIGGER,
  NIS2_CONDITIONAL_TRIGGER,
  ENG_COST_DEDUP_RULE,
  ICG_SEEDING_RULES,
  MTTR_P1_RULE,
} from './extraction-rules';

/**
 * Compute the 16-character hex prefix of sha256(filledIrl). Inlined here
 * (rather than imported from `src/schemas/compose-dossier-envelope.ts`)
 * to avoid a circular import — the schema imports `ORCHESTRATED_TOOLS`
 * from this module. MUST match the algorithm in
 * `computeIrlBodyHash` in the schema; both functions feed the same
 * hash-bind forcing function (BL-045 PR B audit BL-2 → ALT-1).
 */
function computeIrlBodyHashForBody(filledIrl: string): string {
  return createHash('sha256').update(filledIrl).digest('hex').slice(0, 16);
}

// IRL taxonomy reference embeds the decoupled generator source
// (`IRL_SOURCE_EMBED_URI` = gst://irl/source), NOT the library article — so the
// filled-IRL reconciliation taxonomy stays the canonical list, free of the
// library page's prose/promo. VDR still embeds its library article Resource.
const VDR_RESOURCE_URI = 'gst://library/vdr-structure';

const transactionContextValues = ['sell-side', 'buy-side', 'value-creation', 'unknown'] as const;

const modeValues = ['full', 'extract-only'] as const;
const verbosityValues = ['verbose', 'compact'] as const;

/**
 * Authoritative list of tool names this prompt may orchestrate.
 * Single source of truth — drives BOTH the `orchestrates` array (which
 * also includes the embedded Library Resource URIs) AND the `forceTools`
 * arg's accepted-value enum. Adding a tool here automatically expands
 * both surfaces (Acceptance Criteria: "forceTools enum derived from
 * orchestrates at build time, not hand-maintained").
 */
export const ORCHESTRATED_TOOLS = [
  'generate_diligence_agenda',
  'list_portfolio_facets',
  'search_portfolio',
  'list_regulation_facets',
  'search_regulations',
  'compute_techpar',
  'assess_infrastructure_cost_governance',
  'estimate_tech_debt_cost',
  'search_radar',
  'compose_dossier_envelope',
] as const;

const argsSchema = z.object({
  targetName: z
    .string()
    .min(1)
    .optional()
    .describe(
      "The target / client name as referenced in the filled IRL (e.g., 'MedSig Health'). Omit to let the model infer it from the IRL header."
    ),
  filledIrl: z
    .string()
    .min(200)
    .optional()
    .describe(
      'The populated Information Request List returned by the target — the entire markdown body of the response, including all 10 sections. Omit to enter interactive mode (the model will ask you to paste it).'
    ),
  transactionContext: z
    .enum(transactionContextValues)
    .optional()
    .describe(
      'Engagement context. Must be one of: sell-side · buy-side · value-creation · unknown.'
    ),
  partnerLead: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Name of the GST partner leading the engagement — used to attribute the synthesis handoff memo (e.g., 'Reid Peryam'). Omit to leave the attribution generic."
    ),
  projectCodeName: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Engagement code name for the synthesis handoff section (e.g., 'Cygnet'). Omit to use the target name."
    ),
  mode: z
    .enum(modeValues)
    .optional()
    .describe(
      "Execution mode. Defaults to 'full' (extract inputs, invoke every applicable Hub tool through its inclusion gate, synthesize a dossier). 'extract-only' extracts inputs and emits JSON payloads + provenance + a gap list with NO tool invocations and NO synthesis prose — cheap, fast, audit-focused, and downstream-feedable."
    ),
  verbosity: z
    .enum(verbosityValues)
    .optional()
    .describe(
      "Output verbosity. Defaults to 'verbose' (emits per-field provenance footers + schema-validated JSON-fence self-check directives). 'compact' elides both — useful when piping the dossier JSON downstream to automation that does not need the audit prose."
    ),
  // BL-082 follow-up: `.optional()` chained on BOTH the inner schema (so the
  // wrapper's empty-string-as-undefined path is accepted) AND the outer
  // ZodEffects wrapper (so Claude Desktop's form-introspection sees a
  // top-level `ZodOptional` and marks the field as optional in the slash-
  // command UI — without the outer `.optional()` the form shows it as
  // required even though Zod's runtime accepts it missing).
  forceTools: arrayFromWire(z.array(z.enum(ORCHESTRATED_TOOLS)).optional())
    .optional()
    .describe(
      "Escape hatch — explicit override that bypasses inclusion gates for the listed tool names. Defaults to `[]` (gates fully apply). Use when (a) the partner wants a tool output despite sparse IRL signal, or (b) the partner is refining a single section. Strict enum — accepted values are derived from the prompt's orchestrates array at build time, so an unknown tool name is rejected at parse time."
    ),
  requireVerbatimBody: booleanFromWire(z.boolean().optional())
    .optional()
    .describe(
      'BL-070 — accuracy-critical run gate. Set TRUE for high-stakes engagements (regulatory deliverable, M&A close, post-mortem) where BL-049 hash-bind authority MUST hold over the partner-supplied source — not the model-reconstructed body. When set, the `compose_dossier_envelope` tool REFUSES any `irlSource !== "partner-paste-verbatim"` with a structured error directing the operator to re-invoke with the IRL pasted as markdown into the `filledIrl` arg. Default unset (false) — drafting / exploration mode where the BL-072 (J) gap-list disclosure is sufficient.'
    ),
  embedToolWorkedExamples: booleanFromWire(z.boolean().optional())
    .optional()
    .describe(
      "Restore the inline worked-example payloads for generate_diligence_agenda / compute_techpar / estimate_tech_debt_cost. Use for unfamiliar models with high arg-shape-rejection rates without in-prompt examples. Default unset (false) — the calibration prose plus the tools' own structured rejection diagnostics carry first-call shape discipline."
    ),
});

const PROMPT_NAME = 'gst_irl_ingestion';

// Per BL-045 design doc § Decisions row "Scenario reframing", each of the
// four `transactionContext` values gets a meaningful, distinct posture.
// The body-mention invariant (orchestrates → body) means every cue must
// be visible; the per-scenario sentence count is intentionally 3 so each
// scenario reads as a complete framing.
const VOICE_CUES: Record<(typeof transactionContextValues)[number], string> = {
  'sell-side':
    "Sell-side: framing emphasizes the target's defensible story and where GST can sharpen positioning before buyers see the data room. The dossier reads as a credibility document — the target can hand it to the buyer side as a pre-emptive answer to the questions a strategic acquirer will ask. Highlight the durable signal (proprietary engines, retention curves, unit economics, certifications) and frame open items as known-and-managed rather than blind spots.",
  'buy-side':
    'Buy-side: framing emphasizes the technical, regulatory, and organizational risks the data confirms, denies, or fails to address — what the buyer needs to weigh against the deal thesis (whether pre-LOI or LOI-stage). The dossier reads as a confirmation document — does the technology shape match the deal model? Highlight the magnitude of TechPar + tech-debt + ICG gaps that would materially shift the entry price, and frame open items as discovery work to put on the timeline before closing.',
  'value-creation':
    'Value-creation: framing emphasizes the 100-day plan and the highest-leverage platform investments the dossier reveals. The dossier reads as a sequenced work plan — what does the post-close team do first, second, third? Highlight the 1-2 architectural decisions that compound across multiple value-creation plays (data architecture, AI moat, FinOps maturity), and frame open items as Day-100 deliverables with named owners rather than gaps.',
  unknown:
    'Engagement context unspecified — write the dossier in universal voice; the partner can sharpen framing on read. The dossier reads as a balanced read — neither prosecution (buy-side) nor defense (sell-side) nor work plan (value-creation). Surface the same evidence with equal weight on each side and let the partner choose the framing in the cover note.',
};

// ─── Shared helper: wrong-IRL detector pre-flight ──────────────────────
//
// Per BL-045 design doc § Acceptance Criteria "Wrong-IRL detector".
// Structural + semantic detector that fires BEFORE any extraction step.
// Forces the model to compute a fill ratio and either halt (<15%),
// proceed with partial-IRL framing (15-40%), or proceed normally (≥40%).
// Lives in both buildFullBody and buildExtractOnlyBody — the only
// divergence between modes is what happens AFTER the pre-flight passes.

const WRONG_IRL_DETECTOR_PREFLIGHT = [
  '## Pre-flight — wrong-IRL structural detector (BLOCKING — perform BEFORE any extraction)',
  '',
  'Before extracting any dimension or invoking any tool, compute the IRL fill ratio:',
  '',
  '1. Walk the 10 canonical IRL sections (00 BASICS · 01 PRODUCT · 02 SOFTWARE ARCHITECTURE · 03 INFRASTRUCTURE & OPERATIONS · 04 SDLC · 05 DATA, ANALYTICS & AI · 06 SECURITY · 07 PEOPLE & ORGANIZATION · 08 CORPORATE IT · 09 GOVERNANCE & COMPLIANCE). Optional engagement-specific sections (10, 11) do NOT count toward the ratio.',
  '2. Count `totalResponseCells` = the total number of Response cells (rows tagged with reference IDs like `0-01`, `0-02`, …, `9-NN`).',
  '3. Count `substantiveCells` = the number of Response cells containing substantive content. Substantive = not blank AND not just `"n/a"` / `"not yet tracked"` / `"open"` / `"--"` / `"TBD"` / one-character placeholders.',
  '4. `fillRatio = substantiveCells / totalResponseCells` (express as a percentage rounded to nearest integer).',
  '',
  'Then act on the ratio:',
  '',
  '- **`fillRatio < 15%`** → HALT. Output in (A): `"This looks like an unfilled request IRL or a substantially-empty filled IRL — confirm before proceeding. IRL completeness: <pct>% (<substantive> of <total> Response cells filled). If you intended to run against this artifact, re-submit with explicit acknowledgement."`. Emit NO per-tool sections. STOP after (A).',
  '- **`15% ≤ fillRatio < 40%`** → PROCEED with partial-IRL framing. Flag partial-IRL status explicitly in (A). Tighten elision: any tool whose source-IRL sections are ALL empty is skipped automatically; surface the skip in (J) gap list.',
  '- **`fillRatio ≥ 40%`** → PROCEED normally.',
  '',
  'Surface the computed `fillRatio` as the FIRST sentence of section (A) in all three paths (e.g., `"IRL completeness: 58% (8 of 10 sections substantively filled)."`). This is a structural quality signal the partner reads before any extraction value.',
].join('\n');

// ─── Shared helper: tool inclusion gates ───────────────────────────────
//
// Per BL-045 design doc § Tool inclusion gates. Each tool the prompt
// orchestrates has an explicit gate — a predicate over which IRL sections
// must provide non-empty signal. In `mode: full`, gates whose predicate
// fails are elided (the tool isn't invoked; the section is skipped with
// a note in (A) and a (J) gap-list entry). In `mode: extract-only`, the
// same gates decide whether to emit the section's audited input payload.
//
// transactionContext is advisory-only — scenarios modulate voice cues
// but do NOT modulate the gate predicates. forceTools is the partner
// escape hatch.

const INCLUSION_GATES_DIRECTIVE = [
  '## Tool inclusion gates (evaluate BEFORE each per-tool step)',
  '',
  'For each orchestrated tool, evaluate the inclusion gate against the filled IRL. If the gate FAILS and the tool is NOT in `forceTools`, elide the tool: skip the invocation, skip the dossier section, and add an entry in (J) gap list ("tool X elided — gate predicate <P> failed; IRL Section <S> would have satisfied").',
  '',
  '1. **`generate_diligence_agenda`** — **Always pass.** Every dimension can default to `unknown`; the agenda is still useful as a "what\'s known vs not" inventory.',
  '',
  '2. **`compute_techpar`** — Pass if `(Section 00 ARR bullet supplies non-empty signal) AND (Section 02 engineering-cost signal OR Section 03 hosting signal)`. The TechPar engine returns null if either `arr` or `infraHostingAnnual` is zero, so the gate must require BOTH a denominator (ARR) AND a numerator (eng-cost OR hosting). Section 07 average salary is a refinement that improves accuracy when both halves of the gate already pass — NOT a sufficient trigger on its own.',
  '',
  '3. **`assess_infrastructure_cost_governance`** — **Always pass.** `companyStage` from Section 00 + seven seeding rules each have fallback-to-`-1` semantics; the dossier section is the value even when most answers default.',
  '',
  "4. **`estimate_tech_debt_cost`** — Pass if `Section 04 (SDLC / technical-debt assessment) has ≥1 non-empty Response cell`. Section 04 is the canonical Tech Debt input section; if it's wholly empty, no IRL signal supports the calculation.",
  '',
  '5. **`search_regulations`** — Pass if `(Section 09 names ≥1 framework) OR (EU AI Act conditional trigger fires) OR (NIS2 conditional trigger fires)`. The conditional triggers (EU + Section 05 ML/AI; EU + Section 01 NIS2 Annex sector) gap-fill Section 09 when the partner missed a framework that the engagement clearly faces.',
  '',
  '6. **`search_portfolio`** — Pass if `(Section 00 productType-like signal present) OR (Section 01 industry / competitive landscape signal present)`. Gate passes for any non-trivial IRL; portfolio is the comparables corpus.',
  '',
  '7. **`search_radar`** — **Always pass.** Any non-trivial IRL provides at least a product description or geography that maps to a Radar category. Synthesis directives weight radar output as supplementary context, not load-bearing.',
  '',
  '8. **`list_portfolio_facets`** — Inherits from `search_portfolio`. Called as preface to obtain canonical facet values.',
  '',
  '9. **`list_regulation_facets`** — Inherits from `search_regulations`. Called as preface to obtain canonical facet values.',
  '',
  '**`forceTools` override.** When the partner supplies `forceTools` with a tool name, that tool runs regardless of gate failure (and emits a payload in extract-only mode). Surface `forceToolsApplied` in the meta JSON fence so the partner can see which gates were overridden.',
  '',
  '**Partial-IRL handling.** When the wrong-IRL pre-flight returned `15-40%` fillRatio (partial-IRL flag), tighten elision: any tool whose source-IRL sections are ALL empty is elided automatically (even if its gate predicate technically passes on a single trivial cell). Surface every partial-IRL elision in (J) with the IRL sections that would have been load-bearing.',
].join('\n');

// ─── Shared helper: top-of-dossier meta JSON fence ─────────────────────
//
// Per BL-045 design doc § Decisions row "Top-of-dossier meta JSON fence"
// + § Output structure. Emitted as the FIRST content of every dossier
// (both full and extract-only). Turns each dossier into an auditable
// artifact: cross-run comparison, telemetry consumption, partner
// debugging all key off this block.

const META_JSON_FENCE_DIRECTIVE = [
  '## Top-of-dossier meta JSON fence (REQUIRED — emit BEFORE section (A))',
  '',
  'Emit a single JSON code fence as the first content of the output. Shape:',
  '',
  '```json',
  '{',
  '  "promptName": "gst_irl_ingestion",',
  '  "promptVersion": "<server-derived — compose_dossier_envelope overrides this with the prompt-registry version>",',
  '  "modelVersion": "<your model id at invocation time, e.g. claude-opus-4-7>",',
  '  "mode": "full | extract-only",',
  '  "verbosity": "verbose | compact",',
  '  "transactionContext": "buy-side | sell-side | value-creation | unknown",',
  '  "fixtureFillRatio": 0.58,',
  '  "fixtureFillRatioStatus": "ok | partial | halt",',
  '  "gatesPassed": ["generate_diligence_agenda", "compute_techpar", "..."],',
  '  "gatesElided": [{ "tool": "estimate_tech_debt_cost", "reason": "Section 04 silent" }],',
  '  "conditionalTriggersFired": ["EU_AI_ACT", "NIS2"],',
  '  "forceToolsApplied": []',
  '}',
  '```',
  '',
  'Field rules:',
  '- `fixtureFillRatio` is the value the wrong-IRL pre-flight computed; `fixtureFillRatioStatus` is `halt` if `<15%`, `partial` if `15-40%`, `ok` if `≥40%`.',
  '- `gatesPassed` lists tool names whose inclusion-gate predicate fired or were forced via `forceTools`.',
  '- `gatesElided` is an array of `{tool, reason, irlSection}` for tools whose predicate failed and were NOT forced.',
  '- `conditionalTriggersFired` lists the named triggers from the rule constants (`EU_AI_ACT_CONDITIONAL_TRIGGER` → `"EU_AI_ACT"`; `NIS2_CONDITIONAL_TRIGGER` → `"NIS2"`).',
  '- `forceToolsApplied` echoes the `forceTools` arg passed to the prompt (may be `[]`).',
  '',
  'Cross-run comparison works off this block. Downstream automation parses this fence first to decide what to render. The meta fence is the only JSON output in `verbosity: compact` mode that comes before the human-readable dossier.',
].join('\n');

// ─── Shared helper: tool-error degradation directive ───────────────────
//
// Per BL-045 design doc § Decisions row "Graceful tool-error degradation".
// Full-mode only — extract-only doesn't invoke tools so this doesn't apply.

const TOOL_ERROR_DEGRADATION_DIRECTIVE = [
  '## Tool-error degradation (BLOCKING — full mode only)',
  '',
  'If a tool invocation errors mid-sweep (the tool returns `isError: true` or a network error, OR the schema audit rejected the input payload and you exhausted reasonable retries): emit the error VERBATIM in the dossier section that would have been built from that tool, mark the section `extraction-only`, and continue to the next gate-passing tool.',
  '',
  'Specific behavior:',
  '- Do NOT swallow or paraphrase the error. The partner needs the verbatim error text to know what to fix.',
  '- Do NOT skip to synthesis (I) prematurely. Other tools still run; their sections still emit.',
  '- The meta JSON fence `gatesPassed` entry for the failing tool becomes `{ "tool": <name>, "errorVerbatim": <error text> }` (an object) rather than the bare tool name.',
  '- Surface the failure in (J) gap list with the corrective action (e.g., "compute_techpar rejected: ytdMonths/ytdMathCheck arithmetic inconsistent — recheck the YTD period").',
  '- If `generate_diligence_agenda` itself errors (the prerequisite for every other tool), HALT the sweep and emit only (A) snapshot + the meta fence + (J) gap list explaining the precondition failure.',
].join('\n');

// ─── Shared helper: per-section JSON fence + schema self-check ─────────
//
// Per BL-045 design doc § Body rendering strategy — verbose mode emits an
// auditable JSON payload after each tool-backed dossier section (C-H).
// This is the surface that turns each section into a partner-debuggable
// artifact: the narrative + the inputs that produced it + the deeplink.
// Verbose + full mode only — extract-only IS structured JSON throughout
// so the per-section fence would be redundant.

const PER_SECTION_JSON_FENCE_DIRECTIVE = [
  '## Per-section JSON fence + schema self-check (REQUIRED — verbose mode)',
  '',
  'For each tool-backed dossier section (C, D, E, F, G, H), emit IMMEDIATELY AFTER the closing "Open in Hub" deeplink line a single JSON code fence labeled `audit: <section-letter>` with this shape:',
  '',
  '```json',
  '{',
  '  "tool": "<orchestrated-tool-name>",',
  '  "inputPayload": { /* the audited input that was sent — _audit included */ },',
  '  "outputSummary": { /* the load-bearing fields from the tool response */ },',
  '  "deeplink": "<URL the section closed with>"',
  '}',
  '```',
  '',
  "Then on the next line, emit a self-check sentence: `Self-check: inputPayload._audit citations point at IRL sections cited in the prose; outputSummary values match the section's headline numbers; deeplink is the verbatim string returned by the tool.` If any of the three checks fail, do NOT silently rewrite — surface the failure as a numbered entry in (J) gap list (`provenance-mismatch: <section> — <which check failed>`).",
  '',
  '(F) Regulatory exposure — one `audit: F.<framework>` fence per framework subsection (HIPAA, GDPR, NIS2, EU-AI-Act, etc.); each fence carries its own `tool: search_regulations` + per-framework inputPayload + per-framework deeplink. Do NOT collapse the regulatory frameworks into a single fence.',
].join('\n');

// ─── Shared helper: provenance footer (K) ──────────────────────────────
//
// Per BL-045 design doc § Output structure section (K). Verbose mode
// only — applies to BOTH full mode and extract-only mode. The (K) footer
// is the audit reviewer's single-surface scan: every load-bearing claim
// in the dossier → its IRL anchor. Partner can verify the dossier without
// re-reading the IRL.

const PROVENANCE_FOOTER_DIRECTIVE = [
  '## (K) Provenance footer — required in verbose mode',
  '',
  'AFTER (J) gap list, emit a section labeled `(K) Provenance footer`. For every load-bearing claim in the dossier, list one line:',
  '',
  '- `<claim summary> ← Section NN row M: "<verbatim excerpt from the IRL>" (tier <1|2|3>)`',
  '',
  'Load-bearing = every monetary figure (ARR, hosting spend, R&D OpEx, salary), every headcount number, every named regulatory framework, every paradigm verdict from TechPar (Brutalist / Steel-and-Glass / Productized), every ICG maturity score, every Tech Debt carrying-cost figure, every code-named comparable engagement. Each line is one claim → one IRL anchor.',
  '',
  'When a tool returned `extractionOnly: [...]` (Tech Debt MTTR null, ICG seed defaulted to `-1`), the (K) line for that surface reads `<claim> ← Section NN: OPEN; honest extraction-only per BL-045 schema enforcement (tier 3)`. Do NOT fabricate an anchor.',
  '',
  'Partner scans (K) before reading (I) synthesis — every claim should resolve to an IRL excerpt without context-switching back to the IRL document.',
].join('\n');

// ─── Shared helper: provenance citation self-check (final pass) ────────
//
// Per BL-045 design doc § Body rendering strategy — verbose mode runs a
// final cross-check between dossier prose and (K) footer; gaps surface
// in (J) rather than being silently dropped. Applies to BOTH modes.

const PROVENANCE_CITATION_SELF_CHECK_DIRECTIVE = [
  '## Provenance citation self-check (BLOCKING — verbose mode, runs LAST)',
  '',
  'Before finalizing the dossier, walk every numeric / framework / verdict claim in (C) through (I) and confirm it appears in the (K) provenance footer with an IRL anchor. For each claim missing an anchor: do NOT delete the claim, do NOT invent an anchor — instead append a numbered entry to (J) gap list: `provenance-gap: <claim summary> — claim used in dossier but no IRL row supports it; partner should verify or remove`.',
  '',
  'Common provenance-gap patterns to watch for:',
  '- Tool output values quoted verbatim (e.g., "carrying cost $X.XM/yr") with no `(K)` line tying them back to an IRL input row.',
  '- Conditional-trigger frameworks (EU AI Act, NIS2) cited in (F) but with no `(K)` anchor for the trigger predicate (EU geography + ML/AI use OR EU + NIS2 sector).',
  '- Comparable code-named engagements in (G) cited without a `(K)` line explaining which IRL dimensions justified the match.',
  '',
  'Surface every gap. The (J) section is allowed to grow; the dossier is allowed to be honest about what it has and has not anchored.',
].join('\n');

// ─── Shared helper: mandatory envelope-composition directive ───────────
//
// Per BL-045 PR B post-audit empirical evidence (v8 + v9 StoreForce
// traces): the model treats body-text directives for meta fence + (J) +
// (K) as descriptive context, not as a procedure. Same finding the
// v2/v3/v4 dimension-layer traces produced, now at the rendering layer.
//
// The forcing function is the new `compose_dossier_envelope` tool — the
// model can't compose the dossier without externalizing the structure
// into the tool input, and the tool returns the literal markdown to
// transcribe. The tool internally verifies every load-bearing claim's
// citation against the IRL and auto-appends `provenance-gap:` entries
// to (J), so the provenance-citation self-check fires as a side-effect
// of calling the tool rather than relying on the model to remember.

// ─── BL-051 — citation-iteration precheck directive ────────────────────
//
// Empirically established in the v12 StoreForce live exercise: the
// heavyweight `compose_dossier_envelope` tool's tool-input dictation
// cost (~30KB JSON: full claims array + gaps + filledIrl + meta) makes
// per-iteration cycles minute-scale. When the model iterates citation
// correctness DIRECTLY on the envelope, each correction round re-dictates
// the entire input, repeating the same multi-minute serialization for
// what is fundamentally a small per-claim verdict refinement.
//
// BL-051 directs the model to converge citation correctness on
// `validate_irl_provenance` FIRST — a purpose-built fast verifier with
// minimal input (filledIrl + citations only) and minimal output (per-
// claim verdict). Once ≥90% of citations verify, call the envelope
// ONCE on the clean set. Net effect: dossier ships in 1 envelope call
// instead of 2-5, verification rate lifts (each unverified claim got
// a real correction opportunity, not just one shot), throughput is
// minutes faster.
//
// This precedes the ENVELOPE_COMPOSITION_DIRECTIVE in both verbose
// body shapes (one-shot + interactive). Skipped in extract-only mode
// (no envelope call there).

const ENVELOPE_PRECHECK_DIRECTIVE = [
  '## Envelope precheck — citation iteration via `validate_irl_provenance` (BLOCKING — full mode + verbose verbosity only)',
  '',
  'BEFORE calling `compose_dossier_envelope`, run the citation-iteration loop on `validate_irl_provenance`. The envelope tool is heavyweight (its input is ~30KB on a full sweep: claims + gaps + filledIrl + meta); the verifier is purpose-built for fast iteration (input is just `filledIrl` + `claims`). Converge citation correctness on the cheap tool, then call the expensive one ONCE on the clean set. This is the empirically-required workflow discipline: it lifts first-call verification rate into the 80-90% band and eliminates the multi-iteration heavyweight-tool churn the v12 trace surfaced.',
  '',
  'Loop:',
  '',
  '1. Assemble your draft `claims` array (every load-bearing claim with `{claim, citation, tier}`) exactly as you would pass to the envelope.',
  '2. Call `validate_irl_provenance` with `{filledIrl, citations}` — pass each claim as a `{path, citation}` entry in the `citations` array (use the claim label or a short dot-path as `path`; the tool echoes it back so you can attribute verdicts). The tool returns per-claim verdicts: `verified` / `verified-fuzzy` / `partner-supplied` / `unverified`.',
  '',
  '   **Partner-paste prepop mode (this path)**: a `**Body-binding hash:**` directive appears in this prompt body above — the server has ALREADY pre-populated the IRL body cache from the operator-supplied `filledIrl` prompt arg. **SKIP `prepare_irl_body` entirely** — do NOT call it. Pass `{ irlBodyHash, citations }` (NOT `{ filledIrl, citations }`) to every `validate_irl_provenance` iteration, copying the directive value verbatim into `irlBodyHash`. The body never flows through your tool-call output stream — emission per validate call drops from full-body to 16 hex chars, eliminating the output stream ceiling that caused transport-timeout errors on >10KB bodies. Report `irlSource: partner-paste-verbatim-prepop` in your compose call AND in the VERIFY block.',
  '3. For every `unverified` entry: re-cite using a verbatim substring of the IRL body. The IRL body is the ground truth — find the bullet that supports the claim and copy its exact wording (single bullet, single substring, in the canonical `Section NN — <verbatim excerpt>` shape). If a claim genuinely cannot be supported by any IRL substring, do NOT fabricate a citation — leave it `unverified` and accept the `provenance-gap:` flag the envelope will auto-append; the partner needs to see what was unsupported.',
  '4. (Optional, stricter discipline) For `verified-fuzzy` entries where you can find a verbatim substring instead, upgrade. Fuzzy verification is acceptable but verbatim is the gold standard.',
  '5. Re-call `validate_irl_provenance` to confirm corrections landed.',
  '6. Repeat 3-5 until `(verified + verifiedFuzzy + partnerSupplied) / total ≥ 0.90` OR you have made 4 precheck iterations (whichever comes first — convergence beyond 4 rounds is not cheap, and remaining unverified entries are likely genuine gaps the partner should see).',
  '',
  'Then — and only then — call `compose_dossier_envelope` with the clean claims set. Target: 1 envelope call total (`totalEnvelopeCalls: 1` in the BL-045-VERIFY block, `selfCorrectionCalls: 0`).',
  '',
  'Why this discipline matters (read carefully):',
  '',
  '- The envelope tool internally runs the SAME `validate_irl_provenance` pass + auto-appends `provenance-gap` / `tier-mismatch` / `tier-fabrication` entries to (J). Iterating on the envelope works structurally but is slow per round.',
  "- Iterating on the verifier first is functionally identical for citation correctness but ~6× faster per round (small input, small output) — the model's tool-input dictation cost is the bottleneck, not the server's computation.",
  '- An envelope call on a pre-converged citation set produces a clean meta fence + (J) + (K) on the first try. The dossier ships faster AND the BL-045-VERIFY block reflects a tighter, more honest run.',
  '',
  '**Multi-bullet claims (BL-053 array form):** a claim that genuinely derives from multiple supporting IRL bullets (TechPar verdicts citing eng count + hosting + salary; comparables joining portfolio rows; syntheses spanning Section 04 + 07) can pass `citation` as an ARRAY of strings (`["Section 02 — ...", "Section 03 — ...", ...]`, 1-8 elements) instead of a single string. Each element is verified independently against the IRL body. Aggregation rule: ANY element unverified → aggregate unverified; ALL elements verified → verified; mix that includes verified-fuzzy → verified-fuzzy. **Use the array form** for genuine multi-bullet derivations — it preserves multi-source attribution in the (K) provenance footer AND prevents the model from having to pick one bullet arbitrarily. **Do NOT split a single-bullet claim into a 1-element array** (no benefit, costs verifier output bytes). **Do NOT inflate the citations count** by splitting one array-form claim into N single-string claims to dodge the strict any-unverified-wins aggregation — that produces the same number of unverified verdicts but lies about how many distinct claims the dossier rests on.',
  '',
  '**Skip rules:** if your draft `claims` array is empty (no load-bearing claims in this run — extract-only-equivalent path), skip the precheck and proceed to the envelope. If `validate_irl_provenance` returns an error, treat it as a tool-error degradation per § Tool error degradation and proceed to the envelope; the envelope will run its own internal verification.',
].join('\n');

const ENVELOPE_COMPOSITION_DIRECTIVE = [
  '## Envelope composition (BLOCKING — full mode + verbose verbosity only)',
  '',
  'Before composing the dossier prose, you MUST call `compose_dossier_envelope` with the structured inputs the tool requires. The tool returns three markdown blocks (`metaFenceMarkdown`, `gapListMarkdown`, `provenanceFooterMarkdown`) you then transcribe VERBATIM into the dossier:',
  '',
  '- `metaFenceMarkdown` becomes the FIRST content of the dossier — before section (A). It is the auditable spine of the run (promptVersion, mode, verbosity, fillRatio, gatesPassed, gatesElided, conditionalTriggersFired, forceToolsApplied).',
  '- `gapListMarkdown` becomes section `(J) Gap list`, between (I) synthesis and (K) provenance footer.',
  '- `provenanceFooterMarkdown` becomes section `(K) Provenance footer`, the LAST section of the dossier.',
  '',
  'Input contract for the call:',
  '',
  '- `promptName` / `promptVersion` / `modelVersion` / `mode` / `verbosity` / `transactionContext` — copy from this prompt run.',
  '- `fillRatio` — the output of the wrong-IRL pre-flight (percent + substantiveCells + totalCells + status).',
  '- `gatesPassed`, `gatesElided`, `conditionalTriggersFired`, `forceToolsApplied` — your inclusion-gate evaluation results.',
  '- `claims` — EVERY load-bearing claim the dossier will make: every monetary figure (ARR, hosting, R&D, salary, carry cost), every headcount number, every regulatory framework cited, every TechPar verdict, every ICG maturity score, every comparable code name surfaced in (G), every TechPar/Tech Debt/ICG headline number from (C)/(D)/(E). Each carries `{claim, citation, tier}`. The tool renders (K) from this array AND runs an internal `validate_irl_provenance` pass.',
  '- `gaps` — categorized entries you have already identified, using the enum: `defaulted-dimension` (any dimension defaulted to `unknown`), `extraction-only` (Tech Debt MTTR null, ICG defaults, etc.), `gate-elided` (each tool whose gate failed and was not forced), `conditional-trigger` (EU AI Act / NIS2 fired without explicit Section 09 backing), `currency-assumption` (TechPar run in non-USD basis), `map-absent` (regulatory frameworks named but not in the Map). Do NOT pre-populate `provenance-gap`, `tier-mismatch`, or `tier-fabrication` — the tool auto-appends those based on the citation verdicts.',
  '- **Body submission — partner-paste prepop mode (this path)**: a `**Body-binding hash:**` directive appears above, and the server has ALREADY pre-populated the IRL body cache at prompt-render time from the operator-supplied `filledIrl` arg. **SKIP `prepare_irl_body`** — pass the directive value as `irlBodyHash` directly to `compose_dossier_envelope` AND every `validate_irl_provenance` call. The IRL body is no longer a public input field on this tool — it is fetched server-side from the cache via `irlBodyHash`. Report `irlSource: partner-paste-verbatim-prepop` (the strongest provenance form — the body never round-tripped through model emission). Report `filledIrl.bytes` as the value the envelope output returns in `serverCachedBodyBytes` (the server measures the cache entry; under prepop there is no model emission to self-measure).',
  "- `irlBodyHash` — copy verbatim from the prompt body's `**Body-binding hash:**` directive. That is the partner-authoritative `pass-bound` form. The envelope tool verifies `sha256(rehydratedBody).slice(0,16) === irlBodyHash` after cache re-hydrate and rejects on mismatch. In your VERIFY block, report `hashBindResult: pass-bound`. See § Step 5 — verification harness for the discipline rules.",
  "- `irlSource` — REQUIRED. Pass `partner-paste-verbatim-prepop` on this path (the directive appears above, you skipped `prepare_irl_body`, the server pre-populated the cache from the operator's prompt arg). Match this value in `filledIrl.source` of the VERIFY block.",
  '- `requireVerbatimBody` — accuracy-critical run gate. If the operator invoked this prompt with `requireVerbatimBody: true`, you MUST pass that value through VERBATIM to `compose_dossier_envelope.requireVerbatimBody`. In that mode the server REFUSES any `irlSource` other than the partner-paste forms (`partner-paste-verbatim` or `partner-paste-verbatim-prepop`); both are accepted, so on this prepop path the gate passes. If the operator did not set the flag, omit `requireVerbatimBody` from the tool call (defaults to false — drafting / exploration mode).',
  '',
  'The tool returns `provenanceVerification` summarizing how many of your claims verified. If `unverified > 0`, the tool has already appended `provenance-gap:` entries to the gap list — read them, and either correct the citation (re-call the tool) or accept the flag (the partner needs to see what was unverifiable).',
  '',
  '**`serverToolCallCounts` (server-authoritative)**. The envelope output also returns `serverToolCallCounts` — a server-authoritative snapshot of every tool call in this session (`{ attempted, succeeded, rejected, errored }` per tool). Copy this OBJECT VERBATIM into the VERIFY block `toolCallCounts` field. DO NOT self-narrate the counters or estimate from memory — the server counts are the source of truth; model self-narration has demonstrated drift across runs. The server-emitted counts close this drift.',
  '',
  '**Precheck derivation rules** — also derive from `serverToolCallCounts`. The `precheck` block has historically drifted from `toolCallCounts` for the SAME event:',
  '  - `precheck.iterations` MUST equal `serverToolCallCounts.validate_irl_provenance.succeeded`.',
  '  - `precheck.attemptsTotal` MUST equal `serverToolCallCounts.validate_irl_provenance.attempted`.',
  '  - `precheck.errorsEncountered` MUST have exactly `serverToolCallCounts.validate_irl_provenance.rejected` entries (`errorClass` and `recoveryAction` per entry are model-narrated; the COUNT is server-arithmetic).',
  '  - `precheck.outcome` stays model-narrated (operator verdict: `converged` | `hit-cap` | `never-attempted` | `abandoned-after-error`).',
  '',
  '**Precheck-derivation identity guard**: the identity `precheck.iterations === serverToolCallCounts.validate_irl_provenance.succeeded` holds because `validate_irl_provenance` is registered EXACTLY ONCE and `compose_dossier_envelope` calls the internal verification engine directly (bypassing the wrapper, NOT incrementing the counter). Trust the snapshot; do not invent corrections.',
  '',
  '`compose_dossier_envelope` itself appears in the snapshot as `attempted: N, succeeded: N-1` — the envelope tool is in-flight while it computes the snapshot. This is correct semantics; copy as-is.',
  '',
  'Re-calling: if you discover additional claims or gaps mid-composition, re-call the tool with the updated arrays rather than editing the markdown by hand. The tool is pure and cheap.',
  '',
  '**This step is non-optional in `mode: full` + `verbosity: verbose` (the default).** A dossier emitted without the envelope is non-conformant; treat the tool call as the final required step of the sweep.',
].join('\n');

// ─── BL-045 PR B / BL-049 — verification harness emission directive ─────
//
// Operator-facing structured artifact the model emits as the final
// block of its response. Operators copy this single fenced block to
// verify the run without scrolling through multi-KB tool outputs.
// Schema documented in BL-049 § Verification protocol. Shipped on
// EVERY body shape (interactive, one-shot, extract-only) so every live
// run produces a load-bearing artifact regardless of code path.

const BL_045_VERIFY_DIRECTIVE = [
  '## Final emission — BL-045-VERIFY block (mandatory)',
  '',
  'After every other section of your response is complete (dossier, extract-only JSON, or the partner-paste request prose), emit a SINGLE fenced block at the VERY END of your response with the literal label `BL-045-VERIFY` and the schema below. This is the operator-facing verification artifact for run auditing — without it, operators have to spelunk through multi-KB tool outputs to verify whether the run worked.',
  '',
  '```text',
  '```BL-045-VERIFY',
  'promptVersion: <semver — the gst_irl_ingestion prompt version emitted in the meta fence; NOT the mcp-server package version>',
  'runScenario: partner-paste | interactive-paste-request | xlsx-reconstruction',
  'filledIrl:',
  '  bytes: <int — byte length of the filledIrl value you submitted to compose_dossier_envelope>',
  '  source: partner-paste-verbatim | partner-paste-verbatim-prepop | model-reconstruction-from-xlsx | model-reconstruction-trimmed | placeholder',
  '  fingerprint:',
  '    headChars: <verbatim first 120 chars of filledIrl — single-line, escape newlines as ⏎>',
  '    tailChars: <verbatim last 120 chars of filledIrl — single-line, escape newlines as ⏎>',
  'firstEnvelopeCall:',
  '  irlBodyHash: <16hex>',
  '  hashBindResult: pass-bound | pass-internal | IrlBodyHashMismatchError',
  '  provenanceVerification: { total: N, verified: N, verifiedFuzzy: N, partnerSupplied: N, unverified: N, tierMismatches: N, tierFabrications: N }',
  'precheck:',
  '  iterations: <int — count of SUCCESSFUL validate_irl_provenance calls BEFORE firstEnvelopeCall>',
  '  attemptsTotal: <int — including schema-rejected and transport-failed attempts; ≥ iterations>',
  '  outcome: converged | hit-cap | never-attempted | abandoned-after-error',
  '  errorsEncountered: [<{errorClass: string, recoveryAction: string}, ...> — empty list if none]',
  'toolCallCounts:  # BL-071: copy VERBATIM from compose_dossier_envelope output `serverToolCallCounts`',
  '  validate_irl_provenance: { attempted: N, succeeded: N, rejected: N, errored: N }',
  '  compose_dossier_envelope: { attempted: N, succeeded: N, rejected: N, errored: N }',
  '  <other tools used>: { attempted: N, succeeded: N, rejected: N, errored: N }',
  'toolErrors: [<{tool: string, attemptNumber: int, errorClass: string, recoveryAction: string}, ...> — every NON-precheck failed tool attempt across the workflow session; empty list if none; precheck failures stay in precheck.errorsEncountered>]',
  'selfCorrectionCalls: <int — total envelope calls AFTER the first across the entire session, not just this response>',
  'totalEnvelopeCalls: <int — cumulative across the session>',
  'meaningfulRecallsHaveDifferentInputs: <bool — true | false | null>',
  'conditionalTriggers:',
  '  considered: [<every conditional trigger you evaluated, fired or not — currently EU_AI_ACT, NIS2; NOT Section-09-enumerated frameworks>]',
  '  fired: [<subset of considered that actually fired>]',
  '  suppressedWithRationale: [<{trigger: string, whyNot: string}, ...> — empty list if none>]',
  '  defaultFiredFrameworks: [<Section-09-enumerated framework name, ...> — frameworks fired via Section-09 evidence path, NOT conditional-trigger evaluation; empty list if Section 09 named none>]',
  'gatesElided: [<{tool: string, rationale: string}, ...>]',
  'response:',
  '  continuations: <int — number of "continue" prompts the operator issued to complete this response>',
  '  verifyBlockEmissionPoint: final-continuation | mid-stream',
  '  compactionEvents: <int | null — count of host-triggered auto-compaction events you can detect; null when you genuinely cannot tell; 0 only with positive reason to believe no compaction>',
  '```',
  '```',
  '',
  'Rules:',
  '- The block MUST be the last content in your response. Nothing after it.',
  '- Use YAML inside the fence (terse, no JSON for top-level fields; inline {} only where shown). One field per line.',
  '- DO NOT omit any field. Operators parse this verbatim with field-presence assertions — missing fields fail downstream tooling.',
  '- If the run did not produce an envelope call (e.g., interactive-paste-request scenario that ended without compose), set `firstEnvelopeCall: null`, all counts to 0, `precheck.outcome: never-attempted` (or whatever actually happened), and `filledIrl: null`.',
  '- **`filledIrl` block (BL-058)** — operator cross-checks the body the model actually submitted against what the partner sent:',
  '  - `filledIrl.bytes`: integer byte length of the EXACT string passed as the `filledIrl` argument to `compose_dossier_envelope`. Not the original Excel size; the submitted-body size. Operators compare this against the partner-supplied source-of-truth size to detect reconstruction drift.',
  '  - `filledIrl.source`: how the bytes were assembled — `partner-paste-verbatim` (one-shot mode with `filledIrl` prompt arg = strong audit), `model-reconstruction-from-xlsx` (model parsed an attached Excel and wrote markdown bytes), `model-reconstruction-trimmed` (model authored a compressed/restructured body from partner input), `placeholder` (literal placeholder string — REPORT THIS HONESTLY if you used one; the schema will catch it).',
  '  - `filledIrl.fingerprint.headChars` + `tailChars`: the first and last 120 verbatim characters of the submitted body, with newlines escaped as the literal `⏎` character so each value is a single YAML line. Lets operators eyeball whether the body bears partner content vs reconstruction.',
  '- **`precheck` block (BL-058 expansion of BL-056)** — observability for the BL-051 stopping rule:',
  '  - `precheck.iterations`: count of validate_irl_provenance calls that RETURNED A SUCCESSFUL VERDICT before firstEnvelopeCall. Schema-rejected or transport-failed attempts do NOT count here.',
  '  - `precheck.attemptsTotal`: total attempts including failures. If `attemptsTotal > iterations`, the difference is your failed attempts — those must be enumerated in `errorsEncountered`.',
  '  - `precheck.outcome`: `converged` (coverage hit 0.90 healthily), `hit-cap` (4-iteration cap reached without convergence), `never-attempted` (BL-051 directive elided — flag), `abandoned-after-error` (precheck was attempted but you gave up after one or more failures — flag; the prompt directive expects you to recover honestly, not abandon).',
  '  - `precheck.errorsEncountered`: list of `{errorClass, recoveryAction}` for every failed attempt. errorClass is the short error label (e.g., `schema-min-200`, `transport-timeout`, `IrlBodyHashMismatchError`); recoveryAction is what you did next (e.g., `retried-with-full-body`, `downgraded-to-reconstruction`, `abandoned-precheck`).',
  '- **`toolCallCounts` block (BL-058 + BL-071)** — server-arithmetic. Copy VERBATIM from `compose_dossier_envelope` output `serverToolCallCounts`. The server counts every wrapped tool call (`attempted` at wrap entry, `succeeded`/`rejected`/`errored` at wrap exit) so this block is the ground-truth source — operators no longer cross-check against the model self-report (the model used to self-narrate this and drifted). The `errored` field (BL-071) is additive over the previous BL-058 shape: `attempted = succeeded + rejected + errored` is the new arithmetic identity. Note the envelope tool itself shows `attempted: N, succeeded: N-1` in its own snapshot (in-flight while computing). Include every tool the server reported, even if zero.',
  '- **`precheck` ↔ `toolCallCounts` derivation (BL-071)** — derive precheck fields from `serverToolCallCounts.validate_irl_provenance` per the rules in the envelope-composition directive above. `precheck.iterations` MUST equal `succeeded`; `precheck.attemptsTotal` MUST equal `attempted`; `precheck.errorsEncountered` length MUST equal `rejected`. These are server-arithmetic identities — operators will hard-check them and fail the run on drift.',
  '- **`toolErrors` block (BL-060)** — per-attempt diagnostic detail for the failed-attempt counts in `toolCallCounts`:',
  '  - One entry per failed tool attempt across the workflow session, EXCLUDING precheck failures (those live in `precheck.errorsEncountered` — partition is strict, no overlap).',
  "  - Shape: `{tool: <toolName>, attemptNumber: <int — 1-based position within that tool's call sequence>, errorClass: <short label>, recoveryAction: <what you did next>}`.",
  '  - `errorClass` values: `arg-shape-rejection` (Zod schema rejected your arg structure), `hash-bind-retry` (compose_dossier_envelope rejected via IrlBodyHashMismatchError — a structural retry path, not a coaching gap), `transport-timeout`, `transport-disconnect`, `tool-internal-error`. Pick the narrowest accurate label.',
  '  - **Arithmetic ground-truth**: for every tool T, `count(toolErrors where tool == T) MUST equal toolCallCounts.T.attempted - toolCallCounts.T.succeeded`. Operators check this arithmetic to detect under-reporting.',
  '  - **Compaction fallback (BL-061 interaction)**: if `response.compactionEvents > 0`, `toolErrors` MAY be partial because pre-compaction failures may have been summarized away. In that case, include `<partial-due-to-compaction>` as the FIRST entry (literal string in `errorClass`), then enumerate what you can recover.',
  '- `selfCorrectionCalls` + `totalEnvelopeCalls` are CUMULATIVE across the whole workflow session, not just the final response. If you made 3 envelope calls total to ship, those are 2 and 3.',
  '- `meaningfulRecallsHaveDifferentInputs` (BL-052) distinguishes healthy iteration from transport thrash:',
  '  - `true` — each `compose_dossier_envelope` recall AFTER the first had progressively cleaner inputs (claims set tightened, gaps revised, citations re-anchored). This is healthy workflow.',
  '  - `false` — recall inputs were identical or near-identical to a previous call. Flags an operator/transport issue (timeout retried, response not received, tool-error retry loop) worth surfacing — the model did the work twice, not better twice.',
  '  - `null` — `selfCorrectionCalls` is 0 (no recalls). Use `null`, not `true` (there is nothing to qualify).',
  '  - **Post-BL-051**: with the envelope-precheck discipline (iterate citation correctness on `validate_irl_provenance` BEFORE the envelope), `selfCorrectionCalls: 0` is the target healthy state. A non-zero count with `meaningfulRecallsHaveDifferentInputs: true` is still healthy (genuine in-flight refinement); a non-zero count with `false` is the diagnostic operators need to investigate.',
  '- **`conditionalTriggers` block (BL-058 expansion + BL-062)** — four lists to make trigger/framework reasoning transparent:',
  "  - `considered`: every CONDITIONAL TRIGGER you evaluated at any point — currently EU_AI_ACT and NIS2 are the only named conditional triggers in the directive. Section-09-enumerated frameworks (GDPR, UK GDPR, PIPEDA, POPIA, Australia Privacy Act, etc.) are NOT conditional triggers — they go in `defaultFiredFrameworks`. Operators audit completeness here against the directive's conditional-trigger taxonomy, not against the IRL's Section 09 list.",
  '  - `fired`: subset of `considered` that you decided to fire. The dossier meta-fence may carry fewer if later simplifications dropped some; this list is the full audit set.',
  '  - `suppressedWithRationale`: for every trigger in `considered` but NOT in `fired`, supply a brief `{trigger, whyNot}` entry. Empty list `[]` is honest when nothing was suppressed; absence-of-rationale for a considered-but-not-fired trigger is non-compliant.',
  '  - **`defaultFiredFrameworks` (BL-062 — server-side enforced at compose_dossier_envelope per BL-063)**: regulatory frameworks (NOT certifications) the partner is subject to via the gate-5 Section-09 evidence path. The `compose_dossier_envelope` tool enforces three rules at the schema seam and REJECTS or AUTO-DEGRADES non-compliant submissions — these are not advisory:',
  '    - **Partition rejection (`BL-063-PARTITION-VIOLATION`)**: a framework cannot appear in BOTH `conditionalTriggers.fired` AND `defaultFiredFrameworks`. When a framework is both a conditional trigger that fired AND named in Section 09, put it in `fired` only.',
  "    - **Scope rejection (`BL-063-CERTIFICATION-NOT-REGULATION`)**: compliance certifications (SOC 2, ISO 27001, PCI-DSS, FedRAMP, HITRUST, etc.) are blocked from this list. They belong in the dossier's (D) ICG section as compliance posture.",
  '    - **Hub-backing auto-degrade**: entries without a matching Hub regulatory-map record are silently REMOVED from the rendered meta fence AND auto-appended to (J) as `map-absent:` gap entries so the partner sees the coverage gap transparently. Apply your own pre-check: only list frameworks you have already substantiated via successful `search_regulations` matches.',
  '    - Empty list `[]` is honest when no Section-09 frameworks are claimed (none named, or all fall in the conditional-trigger path).',
  '- **`gatesElided` block (BL-058 expansion)** — now structured as `{tool, rationale}` per elided gate (e.g., `[{tool: search_radar, rationale: target not technology-investment-themed}]`) so operators can audit gate-skip reasoning. The bare `[<tool name>]` form is deprecated.',
  '- **`response` block (BL-058 + BL-061)** — catches stream pathologies that invalidate the audit artifact:',
  '  - `response.continuations`: how many "continue" prompts the operator issued for you to finish this response. Zero is the healthy case.',
  '  - `response.verifyBlockEmissionPoint`: `final-continuation` (block emitted at the true end of the full response — the only correct value) or `mid-stream` (block emitted before continuation seam — INVALID; if you find yourself emitting the block mid-stream, you must re-emit it as the last content of the FINAL continuation).',
  '  - **`response.compactionEvents` (BL-061)**: count of HOST-triggered auto-compaction events you can detect during this workflow session. THREE valid states with strict semantics:',
  '    - `<int > 0>`: you have positive reason to believe N compaction events occurred (e.g., you detected a host-injected compaction marker, or you can identify a discontinuity in your conversation context where recent reasoning detail was summarized).',
  '    - `0`: you have POSITIVE REASON TO BELIEVE no compaction occurred (conversation context shows no detail loss, no host-injected summary markers). Do NOT report `0` by default.',
  '    - `null`: you genuinely CANNOT TELL whether compaction occurred. Post-compaction the host re-prompts you with a synthesized summary as if it were prior context; you may not see a labeled seam. This is the honest answer when uncertain. Operators rely on Claude Desktop UI for ground truth in that case.',
  "    - The asymmetry: false-negatives (`0` reported when compaction actually occurred) defeat the field's purpose; `null` is always preferable to `0` when uncertain.",
  '- **`hashBindResult` semantics (load-bearing — read carefully)**:',
  "  - `pass-bound` — the envelope tool accepted the call AND the `irlBodyHash` value you supplied came verbatim from the prompt body's `**Body-binding hash:**` directive. This is the strong form: the hash binds the call to bytes the prompt SERVER computed from a `filledIrl` prompt arg the partner supplied (one-shot mode). Audit grade: high.",
  "  - `pass-internal` — the envelope tool accepted the call BUT no `**Body-binding hash:**` directive existed in the prompt body (interactive-mode invocation where no `filledIrl` arg was supplied). You computed `sha256(filledIrl).slice(0,16)` of the body bytes you yourself intend to submit. This is the weak form: the hash confirms internal consistency between the body and citations you submit (function 1 of hash-bind), but it does NOT bind to a partner-authoritative source (function 2 is absent). Audit grade: medium — the partner reading the dossier should know that the IRL bytes came from the model's reconstruction (e.g., from an attached xlsx), not from a partner-pasted markdown arg.",
  '  - `IrlBodyHashMismatchError` — the envelope tool REJECTED the call. The `irlBodyHash` you supplied did not equal `sha256(filledIrl).slice(0,16)` of the body you supplied. Re-call with consistent bytes.',
  '- **DO NOT** report `pass-bound` if the prompt body did not contain a `**Body-binding hash:**` directive you could copy from. Reporting `pass-bound` when the directive was absent is a fabricated audit claim. Report `pass-internal` instead — it is honest and the partner sees the provenance limit transparently.',
  '- Do NOT add fields not in the schema. Do NOT decorate the block. The operator parses this verbatim.',
].join('\n');

// ─── Shared helper: gap list (J) directive ─────────────────────────────
//
// Per BL-045 design doc § Output structure section (J). Always emitted
// in both full and extract-only modes. The highest-leverage diligence-
// prep deliverable: the "ask the target a follow-up" checklist.

const GAP_LIST_DIRECTIVE = [
  '## (J) Gap list — always emitted',
  '',
  'After every other section, emit a `(J) Gap list` section that enumerates EVERY explicit gap the sweep surfaced. Categories:',
  '',
  '- **Dimensions defaulted to `unknown`** across the `generate_diligence_agenda` payload (with the IRL section that would have answered each).',
  '- **`extraction-only` fields surfaced by tools** (e.g., Tech Debt MTTR / incidents null with `source: irl-open`) — list the concrete follow-up the partner should pull (JQL queries, file requests, named owners to interview).',
  '- **Tool sections elided** by inclusion gates (if `mode: full`) with the gate that failed and the IRL section that would have satisfied it.',
  '- **Conditional triggers that fired without explicit Section 09 backing** (e.g., NIS2 added because EU geography + regulated sector — partner should confirm with target).',
  '- **Currency / annualization assumptions** the audit forced (e.g., "TechPar run in CAD basis with conversionRate 0.73 — confirm actual basis with partner").',
  '- **Map-absent regulatory frameworks** named by the IRL Section 09 but not in the curated Regulatory Map (e.g., Canada AIDA, NIST AI RMF) — flagged for manual tracking rather than fabricated.',
  '',
  'This section is the "ask the target a follow-up" checklist — every item is a concrete deliverable for the next data room request, not an abstract concern. Number each item.',
].join('\n');

function buildOneShotBody(args: {
  targetName?: string;
  filledIrl: string;
  transactionContext?: (typeof transactionContextValues)[number];
  partnerLead?: string;
  projectCodeName?: string;
  verbosity: (typeof verbosityValues)[number];
  embedToolWorkedExamples?: boolean;
}): string {
  const isVerbose = args.verbosity === 'verbose';
  // BL-086 L2: worked-example JSON megapayloads for Steps 1a / 4a / 6a are
  // elided by default (the calibration prose + each tool's structured
  // rejection diagnostic carry first-call shape discipline). Operators can
  // restore them for unfamiliar models via `embedToolWorkedExamples: true`.
  const embedExamples = args.embedToolWorkedExamples ?? false;
  // BL-045 PR B audit BL-2 → ALT-1: hash-bind. Compute the canonical
  // 16-hex prefix of sha256(filledIrl) and embed it as a Body-binding
  // hash directive the model copies into `compose_dossier_envelope`'s
  // `irlBodyHash` input. The tool rejects on sha256(supplied) mismatch,
  // which catches paraphrased filledIrl payloads (v10 failure mode).
  const irlBodyHash = computeIrlBodyHashForBody(args.filledIrl);
  const bodyBindingDirective = isVerbose
    ? [
        '## Body-binding hash (BLOCKING — pass to compose_dossier_envelope.irlBodyHash)',
        '',
        `**Body-binding hash:** \`${irlBodyHash}\``,
        '',
        "When you call `compose_dossier_envelope` (the mandatory closing step), copy the 16-character hex string above into the `irlBodyHash` input AND pass the VERBATIM IRL body (the markdown between the `## Filled IRL` header and the next `##` below it) as `filledIrl`. The tool computes `sha256(filledIrl).slice(0,16)` and rejects on mismatch — this catches paraphrased / summarized IRL bodies that would otherwise pass through and produce false-positive provenance gaps in (J)/(K). Do NOT condense, do NOT paraphrase, do NOT abridge the IRL body when supplying `filledIrl` — the tool's hash check is non-negotiable.",
      ].join('\n')
    : '';
  const targetClause = args.targetName
    ? `The target is **${args.targetName}**.`
    : 'Infer the target name from the IRL header (Section 00 — Basics, first bullet) and use it consistently throughout the dossier.';
  const voiceClause = args.transactionContext
    ? `Voice cue: ${VOICE_CUES[args.transactionContext]}`
    : 'Voice cue: universal. No engagement-specific framing.';
  const leadClause = args.partnerLead
    ? `Partner lead: **${args.partnerLead}** — attribute the synthesis handoff memo to this name.`
    : 'Partner lead: not supplied — attribute the synthesis handoff memo generically ("the GST team").';
  const codeNameClause = args.projectCodeName
    ? `Engagement code name: **${args.projectCodeName}** — use it as the project label in the synthesis section.`
    : 'Engagement code name: not supplied — use the target name as the project label.';

  return [
    authorialIntentLine(PROMPT_NAME),
    '',
    `Run the GST Discovery sweep against the populated Information Request List below. This is the bookend to \`gst_information_request_list\` — the request the partner sent has come back filled — the canonical IRL taxonomy (\`${IRL_SOURCE_EMBED_URI}\`) is embedded as the next message for reference. Your job is to translate the filled answers into a coordinated invocation of every relevant GST Hub tool and downstream artifact, then synthesize the outputs into a single dossier.`,
    '',
    'Engagement context:',
    `- ${targetClause}`,
    `- ${voiceClause}`,
    `- ${leadClause}`,
    `- ${codeNameClause}`,
    '',
    '## Filled IRL (paste from the target — read carefully, all 10 sections)',
    '',
    '```markdown',
    args.filledIrl,
    '```',
    '',
    '## Sweep plan — execute the steps in order, do not skip any',
    '',
    META_JSON_FENCE_DIRECTIVE,
    '',
    WRONG_IRL_DETECTOR_PREFLIGHT,
    '',
    INCLUSION_GATES_DIRECTIVE,
    '',
    TOOL_ERROR_DEGRADATION_DIRECTIVE,
    ...(isVerbose ? ['', PER_SECTION_JSON_FENCE_DIRECTIVE] : []),
    '',
    `Step 1 — Extract the 13 diligence dimensions from the IRL, then invoke \`generate_diligence_agenda\` with the dimension values AND the required \`_audit\` sibling that carries per-dimension provenance + calibration metadata. ${UNKNOWN_PROPAGATION_RULE}`,
    '',
    `**Step 1a — Schema-enforced audit shape (the tool REJECTS calls without it).** The \`generate_diligence_agenda\` tool's input schema requires a sibling \`_audit\` field next to the 13 dimensions. Each dimension's audit entry carries \`tier\` (1/2/3) + \`citation\` (in the form "Section NN — <substantial excerpt>") plus dimension-specific calibration fields. Build the \`_audit\` sibling from the calibration rules in Step 1b below; if the shape or any calibration field is wrong the tool returns \`isError: true\` with the BL-045 rule citation naming exactly what to fix — read it and retry. (Pass \`embedToolWorkedExamples: true\` to inline a full StoreForce-shape example payload here.)`,
    ...(embedExamples
      ? [
          '',
          '```json',
          '{',
          '  "transactionType": "majority-stake",',
          '  "productType": "b2b-saas",',
          '  "techArchetype": "hybrid-legacy",',
          '  "headcount": "1-50",',
          '  "revenueRange": "5-25m",',
          '  "growthStage": "mature",',
          '  "companyAge": "10-20yr",',
          '  "geographies": ["us", "canada", "eu", "uk", "apac", "multi-region"],',
          '  "businessModel": "productized-platform",',
          '  "scaleIntensity": "high",',
          '  "transformationState": "mid-migration",',
          '  "dataSensitivity": "low",',
          '  "operatingModel": "unknown",',
          '  "_audit": {',
          '    "transactionType":     { "tier": "2", "citation": "Section 00 row 11 — AKKR Emerging Buyout Partners II majority equity investment, March 22, 2023" },',
          '    "productType":         { "tier": "1", "citation": "Section 00 row 12 — B2B SaaS (retail workforce management + retail execution platform)" },',
          '    "techArchetype":       { "tier": "2", "citation": "Section 02 row 43 — .NET (legacy) / .NET 8 (new), SQL Server; ThinkTime TypeScript; Azure consolidation in progress with legacy SQL Server remaining" },',
          '    "headcount":           { "tier": "2", "citation": "Section 02 row 45 — Engineering ~42: Development team 33 + Infra/DevOps/DBA 9. Product 6 excluded per BL-045 scope rule.", "scope": "engineering-only" },',
          '    "revenueRange":        { "tier": "2", "citation": "Section 00 row 10 — Implied ARR run-rate ~$31M CAD × 0.73 = $22.6M USD ⇒ 5-25m bracket", "nativeCurrency": "CAD", "currencyConversion": { "nativeAmountMillions": 31, "usdRate": 0.73, "convertedUsdMillions": 22.6 } },',
          '    "growthStage":         { "tier": "2", "citation": "Section 00 row 17 — Recurring revenue +10% YoY; mature growth band per BL-045 Tier discipline", "velocityEvidence": "recurring-revenue-growth-explicit" },',
          '    "companyAge":          { "tier": "1", "citation": "Section 00 row 8 — Founded 2010" },',
          '    "geographies":         { "tier": "2", "citation": "Section 00 row 13 + Section 09 row 135 — US, Canada, EU, UK, APAC named explicitly" },',
          '    "businessModel":       { "tier": "2", "citation": "Section 00 row 12 + Section 01 row 31 — B2B SaaS hybrid per-seat + per-location pricing on packaged platform" },',
          '    "scaleIntensity":      { "tier": "1", "citation": "Section 01 row 34 — High operational scale: 50,000+ stores across 60+ countries; 30-min KPI ingestion" },',
          '    "transformationState": { "tier": "2", "citation": "Section 00 row 23 — Unify launch July 31 2026 (net-new); legacy migration from Jan 2027. Tie-break: mid-migration per parallel legacy+new operation clause." },',
          '    "dataSensitivity":     { "tier": "2", "citation": "Section 05 row 91 + Section 09 row 134 — Employee PII (associate names, schedules, wages, performance); no customer/shopper PII; no PHI; no PCI", "piiCategoriesPresent": ["employee-pii"] },',
          '    "operatingModel":      { "tier": "3", "citation": "Section 07 — VP topology described but no centralized-vs-decentralized signal sufficient to assign the canonical enum" }',
          '  }',
          '}',
          '```',
        ]
      : []),
    '',
    '**The tool runs cross-field calibration refinements automatically and rejects malformed payloads** with a structured diagnostic. If you submit a call with `revenueRange` derived from a CAD bullet without `currencyConversion`, or `headcount.scope = "total-company"`, or `dataSensitivity = "moderate"` with `piiCategoriesPresent = ["employee-pii"]` only, the tool returns `isError: true` with the BL-045 rule citation explaining what to fix. Read the error and retry with the corrected payload.',
    '',
    '**Step 1b — Calibration-clause guidance (the tool enforces these; this is the prose for your reference):**',
    '',
    '0. **Tier-discipline universal rule (BL-059 coaching — the 2026-06-04 retest exposed this as the dominant generate_diligence_agenda retry-tax cause)**: `tier` and `value` are coupled across every dimension:',
    '',
    '   - **`tier: "1"`** = the IRL bullet states the enum value verbatim. The value MUST be one of the enum literals, NOT `"unknown"`. (`tier: "1"` + `value: "unknown"` is a contradiction.)',
    '   - **`tier: "2"`** = direct one-step derivation from a specific IRL bullet. The value MUST be one of the enum literals, NOT `"unknown"`. (Same reason.) MOST diligence-agenda dimensions are tier-2 (the IRL rarely uses the exact enum literal you need to pass).',
    '   - **`tier: "3"`** = correlation/vibes; the value MUST be `"unknown"`. The tool REJECTS `tier: "3"` paired with a non-`"unknown"` value.',
    '   - **`value: "unknown"`** (in any dimension) REQUIRES `tier: "3"`. The tool REJECTS `value: "unknown"` paired with `tier: "1"` or `tier: "2"`.',
    '',
    '   Apply BEFORE submitting: if any dimension value is `"unknown"`, set its tier to `"3"` in the audit sibling. If a dimension`s tier is `"3"`, set its value to `"unknown"`. This bidirectional coupling eliminates ~2 retries per call.',
    '',
    '1. **Currency check** — for any non-USD `revenueRange` bullet (`$X CAD` / `€X EUR` / `£X GBP` / etc.), supply `_audit.revenueRange.currencyConversion = { nativeAmountMillions, usdRate, convertedUsdMillions }` AND set `_audit.revenueRange.nativeCurrency` to the IRL bullet\'s currency. Then bracket on the USD value. The tool also cross-checks that the bracket you assigned matches the converted USD amount (within 10% of a boundary → pass `"unknown"` and surface in (J)).',
    '',
    '2. **Headcount-scope check** — `_audit.headcount.scope` MUST be `"engineering-only"` when the dimension value is non-`"unknown"`. The tool rejects any other scope value. If the IRL doesn\'t separate engineering from total HC, set `headcount = "unknown"`.',
    '',
    '3. **`dataSensitivity` bucket check** — supply `_audit.dataSensitivity.piiCategoriesPresent` as the array of PII categories the IRL evidences. Categories: `employee-pii`, `customer-pii-at-scale`, `financial-transaction-metadata`, `phi`, `pci-card-data`, `government-classified`, `biometric-at-scale`, `none`. The tool cross-checks: `low` is incompatible with `phi`/`pci`/`government`/`biometric`; `moderate` requires `customer-pii-at-scale` or financial-tx; `high` requires one of the regulated categories.',
    '',
    '4. **`growthStage` Tier-discipline check** — `_audit.growthStage.velocityEvidence` MUST be one of `revenue-growth-explicit` / `recurring-revenue-growth-explicit` / `headcount-growth-explicit` / `customer-growth-explicit` / `funding-velocity-explicit` when the value is non-`"unknown"`. If the IRL doesn\'t supply explicit velocity signal, set `growthStage = "unknown"` and `velocityEvidence = "unknown"` (Tier 3).',
    '',
    'After the tool accepts the call, surface the resulting agenda topics + attention areas + the `deeplink` URL.',
    '',
    `Step 2 — Pull comparable engagements. Call \`list_portfolio_facets\` first to see the filterable dimensions of GST's 57-engagement portfolio, then call \`search_portfolio\` **ONCE** with arrays: \`theme: ["Healthcare", "Financial Services", ...]\` collecting every theme suggested by IRL Section 01 + the target's product profile, and \`engagement: ["Buy-Side", "Sell-Side"]\` when the side is genuinely ambiguous. The schema accepts \`string | string[]\` and OR-matches within each facet — one call returns every comparable across all chosen themes. (Worked example: \`{ theme: ["Healthcare", "Life Sciences"], engagement: ["Buy-Side"] }\`.) **Use the literal theme / industry names returned by \`list_portfolio_facets\` verbatim** — do NOT guess at intuitive labels (e.g., the canonical theme is "Healthcare", not "Healthcare Tech"; a guess will return zero matches and force a retry). Pull 3-5 comparables. Surface the resulting code-named matches + the \`deeplink\` URL. **Do NOT call \`search_portfolio\` once per theme — batch into a single array call.**`,
    '',
    `Step 3 — Pull the regulatory framework bodies the target is exposed to. Call \`list_regulation_facets\` first to enumerate available jurisdictions. Then call \`search_regulations\` **ONCE** with arrays: \`jurisdiction: ["eu", "us-ca", "gb", ...]\` collecting every jurisdiction surfaced by IRL Section 09, and \`category: ["data-privacy", "ai-governance", "cybersecurity", ...]\` collecting the relevant categories. The schema accepts \`string | string[]\` and OR-matches within each facet — one call returns every relevant framework. (Worked example: \`{ jurisdiction: ["eu", "us-ca"], category: ["data-privacy", "ai-governance"], limit: 50 }\`.) Per-framework name lookup via \`query\` remains a per-name call if a specific framework is missing from the batched response, but jurisdiction + category filtering MUST be batched into a single call — **do NOT call \`search_regulations\` once per framework**. **Two conditional triggers — both gap-fill the IRL when the partner's Section 09 list misses them:** (a) ${EU_AI_ACT_CONDITIONAL_TRIGGER} (b) ${NIS2_CONDITIONAL_TRIGGER} **Surface the \`deeplink\` URL from the batched \`search_regulations\` response in the dossier** — it opens the Regulatory Map filtered to the chosen region + category set. Cite article numbers verbatim when summarizing obligations; do NOT invent citations beyond what the framework bodies return.`,
    '',
    `Step 4 — Invoke \`compute_techpar\` using the architecture and engineering-cost data from IRL Section 02 + Section 03 + Section 07. Key inputs: engineering FTE count (Section 02), product personnel cost (Section 02), annual build/tooling cost (Section 02), monthly hosting + infra spend (Section 03 — annualize the 3-month average), infrastructure headcount (Section 03), material capex (Section 03), average fully-loaded engineering salary (Section 07). Toggle the capex view per the capex bullet in Section 03. ${ENG_COST_DEDUP_RULE}`,
    '',
    `**Step 4a — TechPar audit shape (the tool REQUIRES \`_audit\` — schema rejection on missing or wrong shape).** The BL-045 Phase-2 audit enforces TWO things for compute_techpar: (1) a SINGLE declared currency basis for all monetary inputs, and (2) PER-FIELD annualization provenance (no more ad-hoc YTD ×4 vs ×1.2 swings across runs on the same fixture). Follow the Critical anti-fabrication rules below to shape \`_audit\`; on a missing or malformed sibling the tool rejects with a structured BL-045 diagnostic naming the failed field and fix — read it and retry. (Pass \`embedToolWorkedExamples: true\` to inline a full StoreForce-shape example payload here.)`,
    ...(embedExamples
      ? [
          '',
          '```json',
          '{',
          '  "arr": 22600000,',
          '  "stage": "pe",',
          '  "mode": "quick",',
          '  "capexView": "gaap",',
          '  "growthRate": 10,',
          '  "exitMultiple": 12,',
          '  "infraHostingAnnual": 2970000,',
          '  "infraPersonnel": 663000,',
          '  "rdOpEx": 9680000,',
          '  "rdCapEx": 0,',
          '  "engFTE": 42,',
          '  "engCost": 0,',
          '  "prodCost": 0,',
          '  "toolingCost": 0,',
          '  "_audit": {',
          '    "monetaryBasis":      { "currency": "USD", "conversionRate": 0.73, "citation": "Section 00 row 10 — ARR $31M CAD; conversionRate 0.73 USD/CAD applied throughout (CAD → USD basis)" },',
          '    "arr":                {',
          '      "annualizationSource": "ytd-annualized-with-period",',
          '      "ytdMonths": 3,',
          '      "ytdMathCheck": { "monthlyAnchorAmount": 2640000, "monthlyAnchorCitation": "Section 00 row 10 — Recurring revenue $2.64M CAD/mo Apr-2026", "ytdActualReportedAmount": 7860000, "ytdActualReportedCitation": "Section 00 row 10 — $7.86M YTD FY27 recurring" },',
          '      "citation": "Section 00 row 10 — Recurring $2.64M CAD/mo Apr-2026; YTD $7.86M ⇒ ytdMonths: 3 (math balances: 2.64 × 3 = 7.92 ≈ 7.86)"',
          '    },',
          '    "infraHostingAnnual": { "annualizationSource": "monthly-x12", "citation": "Section 03 row 59 — Hosting+infra non-headcount COGS $339K CAD/mo × 12 = $4.07M CAD ⇒ $2.97M USD. Caveat: this is the COGS-non-headcount envelope, not hosting-only — surface in (J) gap list." },',
          '    "infraPersonnel":     { "annualizationSource": "estimated-from-headcount", "citation": "Section 03 row 61 — 9 FTE infra/DevOps × $101K CAD avg base × 1.25 fully-loaded ≈ $1.14M CAD ⇒ $0.66M USD" },',
          '    "rdOpEx":             {',
          '      "annualizationSource": "ytd-annualized-with-period",',
          '      "ytdMonths": 3,',
          '      "ytdMathCheck": { "monthlyAnchorAmount": 2640000, "monthlyAnchorCitation": "Section 00 row 10 — Recurring revenue $2.64M CAD/mo Apr-2026 (used as YTD-period anchor for all YTD-annualized fields)", "ytdActualReportedAmount": 7860000, "ytdActualReportedCitation": "Section 00 row 10 — $7.86M YTD FY27 recurring" },',
          '      "citation": "Section 02 row 47 — R&D $2.42M YTD CAD over 3-month YTD × 4 = $9.68M CAD ⇒ $7.07M USD; same YTD-period as ARR"',
          '    },',
          '    "rdCapEx":            { "annualizationSource": "irl-annualized-stated", "citation": "Section 03 row 65 — Material capex flagged as Minimal / no capitalized line evidenced ⇒ 0" }',
          '  }',
          '}',
          '```',
        ]
      : []),
    '',
    '**Critical anti-fabrication rules**:',
    '',
    "1. **Currency basis is SINGLE** — all monetary fields must be in the declared currency. Do NOT mix CAD ARR with USD hosting; the engine's percentage calculations are only meaningful when the basis is consistent. If the IRL gives mixed currencies, pre-convert all to one (typically USD) before submitting.",
    '',
    '2. **YTD annualization REQUIRES `ytdMonths`** — if a monetary field was annualized from a YTD figure (the most common case for IRLs reporting against a partial fiscal year), the audit DEMANDS you declare how many months of YTD actuals you extrapolated. This is the root cause of the cross-run TechPar swings observed in pre-Phase-2 runs (the same fixture produced 9.1% / 13.9% / 31.2% R&D% depending on ad-hoc annualization). The tool rejects `annualizationSource: "ytd-annualized-with-period"` without `ytdMonths`. To find the YTD period: cross-reference the IRL\'s recurring-revenue monthly figure × YTD months → should equal the YTD total. For StoreForce: recurring $2.64M/mo × 3 = $7.92M YTD ≈ $7.86M YTD → ytdMonths = 3.',
    '',
    '3. **Estimation-from-headcount is a valid source** — when no IRL line gives the figure but you can derive it from team size × salary, use `annualizationSource: "estimated-from-headcount"` and show the math in the citation. This is honest extraction.',
    '',
    `**Surface the \`deeplink\` URL from the tool response in the dossier** — it opens the TechPar wizard with these same inputs pre-populated, so the partner can refine in-browser or share the URL. The response payload now also carries \`monetaryBasis\` (currency + conversionRate) so the dossier can quote the converted dollar figures transparently. Surface the resulting paradigm assessment + total R&D OpEx + deeplink + the currency basis from the response.`,
    '',
    `Step 5 — Invoke \`assess_infrastructure_cost_governance\` using IRL Section 03 (hosting model + spend trajectory) + Section 02 (tooling + technical-debt-assessment) + Section 07 (FinOps-adjacent headcount, if any). Run the canonical two-call pattern: an empty-args call first to retrieve the 20-question schema across 6 domains; then a seeded call with the IRL-extractable signals. ${ICG_SEEDING_RULES} **Surface the \`deeplink\` URL in the dossier** — it opens the ICG wizard with these same answers pre-populated. Capture the ICG maturity scoring across domains, surface 3-5 prioritized recommendations, and the deeplink.`,
    '',
    `Step 6 — Invoke \`estimate_tech_debt_cost\` using IRL Section 04. Key inputs: maintenance burden percentage (Section 04 active-maintenance bullet), deployment frequency (Section 04), incidents quarterly trend + MTTR (Section 04), planned remediation budget (Section 04), team size (Section 07 engineering headcount), average salary (Section 07). ${MTTR_P1_RULE}`,
    '',
    '**Step 6a — MTTR + incident-count fabrication guard (the tool ENFORCES this).** The `estimate_tech_debt_cost` tool requires an `_audit` sibling with `mttrSource` and `incidentsSource` enum values. For EACH:',
    '',
    '- If the IRL Section 04 explicitly states a numeric value → `mttrSource: "irl-stated"`, supply the number.',
    '- If the IRL marks the field OPEN / "not yet tracked" / "n/a" / blank → `mttrSource: "irl-open"`, **pass `mttrHours: null`** (the tool will REJECT non-null values when source is `irl-open`).',
    '- If no MTTR row exists at all → `mttrSource: "irl-absent"`, also null.',
    '- If the IRL gives a value but in a wrong unit / scope (sprint-scoped only, dashboard-only, needs JQL pull) → `mttrSource: "irl-scope-mismatch"`, also null.',
    '',
    'Same enum + null discipline applies to `incidentsSource` / `incidents`. **Substituting 24h or any arbitrary placeholder for an OPEN field will fail the schema refinement.** The tool will return a structured error citing the BL-045 rule.',
    '',
    'When `mttrHours` or `incidents` is null, the tool elides the corresponding line item from the engine computation and returns `extractionOnly: ["mttrHours"]` (or both fields) in the response. Use this signal: render the Tech Debt section as `extraction-only` for the omitted fields, add a provenance line `mttrHours ← Section 04: OPEN; placeholder substitution refused per BL-045 schema enforcement`, and surface the missing inputs in the gap list with the concrete target follow-up (e.g., the 24-month JQL query needed to compute MTTR from raw incident records). **A fabricated MTTR value passes through the engine\'s linear multiplier and produces an unrecoverable false carrying-cost number — every downstream "11% of ARR" or "$X.XM/yr carry" claim then rests on a fiction. The schema enforcement now makes this fabrication structurally impossible.**',
    '',
    '(Pass `embedToolWorkedExamples: true` to inline worked example payloads showing both the OPEN/null shape and the supplied-value shape.)',
    ...(embedExamples
      ? [
          '',
          'Example payload shapes:',
          '',
          '```json',
          '// StoreForce shape: Section 04 MTTR is OPEN, incidents are sprint-scoped',
          '{',
          '  "teamSize": 42, "salary": 135000, "maintenanceBurdenPct": 30, "deployFrequency": "Quarterly+",',
          '  "incidents": null, "mttrHours": null, "remediationBudget": 0, "remediationPct": 0,',
          '  "arr": 22600000, "contextSwitchOn": true,',
          '  "_audit": { "mttrSource": "irl-open", "incidentsSource": "irl-scope-mismatch" }',
          '}',
          '',
          '// Fixture-clean shape: Section 04 supplies both values',
          '{',
          '  "teamSize": 50, "salary": 185000, "maintenanceBurdenPct": 22, "deployFrequency": "Daily",',
          '  "incidents": 4, "mttrHours": 7.8, "remediationBudget": 1800000, "remediationPct": 20,',
          '  "arr": 45200000, "contextSwitchOn": false,',
          '  "_audit": { "mttrSource": "irl-stated", "incidentsSource": "irl-stated" }',
          '}',
          '```',
        ]
      : []),
    '',
    `**Surface the \`deeplink\` URL in the dossier** — it opens the Tech Debt Calculator with sliders pre-positioned. Surface the resulting annualized debt-carry cost + payback projection + deeplink.`,
    '',
    `Step 7 — Invoke \`search_radar\` for the target's product segment + geographies (derive search terms from IRL Section 01 product description and Section 00 geographies). **Surface the \`deeplink\` URL in the dossier** — it opens the Radar feed filtered to that category. Surface the 3-5 most relevant radar items as market-signal context + the deeplink.`,
    '',
    `Step 8 — Compose the unified dossier. Cross-reference the \`gst://library/vdr-structure\` Library article (embedded later) for VDR-folder labels when surfacing follow-up document requests. Output structure:`,
    '',
    '  **(A) Target snapshot** — one-paragraph profile pulled from IRL Section 00 + 01. Quick-look voice — partner-readable, three-sentence orientation. Include any open-question flags where the IRL gave non-definitive answers.',
    '',
    '  **(B) Diligence agenda** — surface the agenda topics + attention areas from Step 1. One bullet per topic with the "what we look for" framing. Include the wizard `deeplink` from Step 1 as a single "Open Diligence Wizard" link.',
    '',
    '  **(C) Architecture + paradigm assessment** — pull from Step 4 (`compute_techpar`). **MUST close with the `compute_techpar` `deeplink` as a single "Open TechPar Wizard" link** so the partner can refine inputs in-browser; this is non-optional. Frame the body as a 2-3 paragraph read on the target\'s technical paradigm, R&D OpEx posture, and biggest architectural-cost drivers visible from the IRL.',
    '',
    '  **(D) Infrastructure cost governance assessment** — pull from Step 5 (`assess_infrastructure_cost_governance`). **MUST close with the `assess_infrastructure_cost_governance` `deeplink` as a single "Open ICG Wizard" link**; this is non-optional. Body: maturity scores + 3-5 prioritized recommendations, ranked by leverage.',
    '',
    '  **(E) Technical debt assessment** — pull from Step 6 (`estimate_tech_debt_cost`). **MUST close with the `estimate_tech_debt_cost` `deeplink` as a single "Open Tech Debt Calculator" link** with sliders pre-positioned to the IRL-derived inputs; this is non-optional. Body: annualized carry cost, headline payback projection, and the 1-2 most expensive debt categories the IRL surfaced (e.g., legacy services flagged for rewrite).',
    '',
    '  **(F) Regulatory exposure** — pull from Step 3. **Each framework subsection MUST close with the `search_regulations` `deeplink` for that framework** as an "Open in Regulatory Map" link (one deeplink per framework — they filter the map to different region+category combinations); this is non-optional. Body: one subsection per jurisdiction/framework, citing verbatim article numbers. Cross-jurisdictional transfer mechanism review if the IRL Section 09 flags cross-border data flows.',
    '',
    '  **(G) Comparable engagements** — pull from Step 2. **MUST close with the `search_portfolio` `deeplink` as a single "Open Hub: Comparable engagement view" link**; this is non-optional. Body: for each of the 3-5 matched code-named engagements, write a 1-line "why this one is relevant" + 1-line lesson.',
    '',
    '  **(H) Market signal** — pull from Step 7. **MUST close with the `search_radar` `deeplink` as a single "Open Radar Feed" link** filtered to the relevant category; this is non-optional. Body: 2-3 bullet summary of what the radar items reveal about the target\'s market timing.',
    '',
    '  **(I) Synthesis + recommendation** — handoff-memo voice (mirror `gst_diligence_handoff_memo`). 3-5 sentences integrating the above: what does the dossier collectively recommend? Where are the biggest unanswered questions even after the high-fidelity intake? What 5-7 VDR follow-up documents (using verbatim labels from `' +
      VDR_RESOURCE_URI +
      '`) should be requested before the next milestone?',
    '',
    GAP_LIST_DIRECTIVE,
    ...(isVerbose
      ? [
          '',
          PROVENANCE_FOOTER_DIRECTIVE,
          '',
          PROVENANCE_CITATION_SELF_CHECK_DIRECTIVE,
          '',
          bodyBindingDirective,
          '',
          ENVELOPE_PRECHECK_DIRECTIVE,
          '',
          ENVELOPE_COMPOSITION_DIRECTIVE,
        ]
      : []),
    '',
    BL_045_VERIFY_DIRECTIVE,
    '',
    '## Voice + format directives',
    '',
    '- Dossier-quality. The output should read as a single coherent partner-level document, not a stitched-together set of tool outputs. Every tool result is a means to a sentence.',
    `- Attribute the synthesis section (I) to ${args.partnerLead ? '`' + args.partnerLead + '`' : 'the GST team'}.`,
    `- Use ${args.projectCodeName ? '`' + args.projectCodeName + '`' : args.targetName ? '`' + args.targetName + '`' : 'the target name'} as the project label.`,
    '- Surface concrete numbers (ARR, headcount, cloud spend, MTTR) from the IRL verbatim — they are the evidence behind every claim.',
    '- Do NOT fabricate data the IRL did not supply. If the filled IRL is sparse on a dimension, flag the gap honestly in the relevant section.',
    "- Honor every tool's `deeplink` field when surfaced — pass it through as a clickable Hub link, do not invent URLs. **Every section (C / D / E / F / G / H) that pulled from a tool MUST close with the corresponding Open-in-Hub link** — this is the bridge between the Claude Desktop dossier and the partner-refinable Hub surface; without it the dossier is read-only.",
    '- Do NOT pad the dossier with section-divider commentary or `gst_irl_ingestion`-meta commentary; the partner reads the artifact, not the process.',
  ].join('\n');
}

// ─── buildExtractOnlyBody ──────────────────────────────────────────────
//
// mode: 'extract-only' renders a body that performs the wrong-IRL
// pre-flight + dimension extraction with the same _audit shape as full
// mode, then emits one JSON code fence per tool (with the audited input
// payload that WOULD have been sent if the tool ran). No tool invocation,
// no synthesis prose. Use case: audit-trail JSON dump for downstream
// automation, refinement of a single section without re-running the
// whole sweep, partner inspection of model extraction before committing
// to ~5 min and ~9 tool calls.
function buildExtractOnlyBody(args: {
  targetName?: string;
  filledIrl: string;
  transactionContext?: (typeof transactionContextValues)[number];
  partnerLead?: string;
  projectCodeName?: string;
  verbosity: (typeof verbosityValues)[number];
}): string {
  const isVerbose = args.verbosity === 'verbose';
  const targetClause = args.targetName
    ? `The target is **${args.targetName}**.`
    : 'Infer the target name from the IRL header (Section 00 — Basics, first bullet).';
  const voiceClause = args.transactionContext
    ? `Voice cue: ${VOICE_CUES[args.transactionContext]}`
    : 'Voice cue: universal. No engagement-specific framing.';

  return [
    authorialIntentLine(PROMPT_NAME),
    '',
    `Run the GST IRL ingestion in **EXTRACT-ONLY mode** against the populated Information Request List below. This is the bookend to \`gst_information_request_list\` — the request the partner sent has come back filled — the canonical IRL taxonomy (\`${IRL_SOURCE_EMBED_URI}\`) is embedded as the next message for reference. **In extract-only mode you DO NOT invoke any tools and DO NOT compose a dossier.** You produce a structured JSON artifact: the dimension worksheet + the per-tool input payloads that WOULD have been submitted if the sweep ran. This is the audit-trail surface for downstream automation, partner inspection, or single-section refinement.`,
    '',
    'Engagement context:',
    `- ${targetClause}`,
    `- ${voiceClause}`,
    '',
    '## Filled IRL (paste from the target — read carefully, all 10 sections)',
    '',
    '```markdown',
    args.filledIrl,
    '```',
    '',
    '## Extraction plan — execute the steps in order',
    '',
    META_JSON_FENCE_DIRECTIVE,
    '',
    WRONG_IRL_DETECTOR_PREFLIGHT,
    '',
    INCLUSION_GATES_DIRECTIVE,
    '',
    `**Step 1 — Dimension extraction worksheet (REQUIRED).** Apply the BL-045 extraction discipline to derive the 13 \`generate_diligence_agenda\` dimensions: ${UNKNOWN_PROPAGATION_RULE}`,
    '',
    'Emit ONE JSON code fence labeled `worksheet: generate_diligence_agenda` containing the 13 dimensions + the `_audit` sibling in the canonical shape (per-dimension tier + citation + dimension-specific calibration fields). Do NOT invoke the tool. This is the payload that would be submitted in full mode.',
    '',
    "**Step 2 — Per-tool input payloads (REQUIRED, one JSON fence per tool).** For each of the orchestrated tools (`compute_techpar`, `estimate_tech_debt_cost`, `assess_infrastructure_cost_governance`, `search_portfolio`, `search_regulations`, `search_radar`, `list_portfolio_facets`, `list_regulation_facets`), emit a JSON code fence labeled `payload: <tool-name>` containing the audited input payload — including all `_audit` calibration fields per the tool's schema. Use the same currency basis / annualization sources / scope declarations the full-mode invocation would use. Do NOT invoke the tools.",
    '',
    'If an inclusion gate fails for a tool (per § Tool inclusion gates of the BL-045 design doc), emit a fence labeled `elided: <tool-name>` with `{ "reason": "<which gate predicate failed>", "irlSection": "<which IRL section would have satisfied it>" }` instead of the payload.',
    '',
    GAP_LIST_DIRECTIVE,
    ...(isVerbose
      ? ['', PROVENANCE_FOOTER_DIRECTIVE, '', PROVENANCE_CITATION_SELF_CHECK_DIRECTIVE]
      : []),
    '',
    BL_045_VERIFY_DIRECTIVE,
    '',
    '## Voice + format directives (extract-only)',
    '',
    '- NO synthesis prose. NO dossier sections (A) – (I). The only narrative content is the (J) gap list.',
    '- NO tool invocations. The output is a sequence of JSON code fences.',
    '- Surface the computed `fillRatio` above the first JSON fence as a one-line summary (per the pre-flight directive).',
    '- Do NOT fabricate IRL content. Cite every claim back to a specific section / row in the per-payload audit metadata.',
    '- Do NOT invent tool deeplinks. The extract-only mode produces no Hub URLs (those come from the tools, which were not invoked).',
  ].join('\n');
}

const INTERACTIVE_BODY = [
  authorialIntentLine(PROMPT_NAME),
  '',
  `Help the user run the GST Discovery sweep — the bookend to \`gst_information_request_list\`. The canonical IRL taxonomy (\`${IRL_SOURCE_EMBED_URI}\`) is embedded as the next message for reference; \`${VDR_RESOURCE_URI}\` follows for VDR-folder labels in synthesis.`,
  '',
  'Step 1. Ask the user:',
  '',
  "> Paste the populated Information Request List your target returned (all 10 sections, in markdown). If you can also share the target name, the engagement context (sell-side / buy-side / value-creation), the partner lead, and an engagement code name, I'll tailor the dossier — but only the filled IRL is required to run the sweep.",
  '',
  'Step 2. Once the user pastes the filled IRL, run the full sweep:',
  `  - Step 2a — Extract the 13 diligence dimensions from the IRL and call \`generate_diligence_agenda\`. The IRL is filled, so derive concrete values; do NOT default to \`'unknown'\`.`,
  `  - Step 2b — Call \`list_portfolio_facets\` then \`search_portfolio\` ONCE with array filters (\`theme: [...]\`, \`engagement: [...]\` — \`string | string[]\` accepted) to pull 3-5 comparable past engagements in a single call.`,
  `  - Step 2c — Call \`list_regulation_facets\` then \`search_regulations\` ONCE with array filters (\`jurisdiction: [...]\`, \`category: [...]\` — \`string | string[]\` accepted) covering every framework the IRL Section 09 names. Do NOT call once per framework.`,
  `  - Step 2d — Call \`compute_techpar\` using IRL Section 02 + 03 + 07 inputs.`,
  `  - Step 2e — Call \`assess_infrastructure_cost_governance\` using IRL Section 03 + 02 + 07.`,
  `  - Step 2f — Call \`estimate_tech_debt_cost\` using IRL Section 04 + 07.`,
  `  - Step 2g — Call \`search_radar\` for the target's product segment + geographies.`,
  '',
  `Step 3. Compose the unified dossier — nine sections (A–I): target snapshot · diligence agenda · architecture · ICG · tech debt · regulatory · comparables · market signal · synthesis. **Every section that pulls from a tool MUST close with that tool's \`deeplink\` URL as an "Open in Hub" link** — TechPar wizard for (C), ICG wizard for (D), Tech Debt Calculator for (E), Regulatory Map for (F, one per framework), portfolio view for (G), Radar feed for (H). The deeplinks open the corresponding Hub surface with state pre-populated; this is the bridge between the read-only dossier and the partner-refinable interactive tool. Reference the canonical VDR taxonomy (\`${VDR_RESOURCE_URI}\`) verbatim for follow-up document requests in the synthesis section.`,
  '',
  `Step 3a. **Envelope precheck — citation iteration via \`validate_irl_provenance\` (BLOCKING).** BEFORE calling \`compose_dossier_envelope\`, converge citation correctness on \`validate_irl_provenance\` first. Assemble your draft \`claims\` array (every load-bearing claim with \`{claim, citation, tier}\`) and call \`validate_irl_provenance\` with \`{filledIrl, citations}\` — pass each claim as a \`{path, citation}\` entry in the \`citations\` array (use the claim label or a short dot-path as \`path\`). **For genuine multi-bullet derivations** (TechPar verdicts citing eng count + hosting + salary; comparables joining portfolio rows; syntheses spanning Section 04 + 07), pass \`citation\` as an array of strings (\`["Section 02 — ...", "Section 03 — ...", ...]\`, 1-8 elements) — each element is verified independently and aggregated (any-unverified wins). For every \`unverified\` entry, re-cite using a verbatim substring of the IRL body (\`Section NN — <exact wording>\`). Re-call to confirm. Repeat until \`(verified + verifiedFuzzy + partnerSupplied) / total ≥ 0.90\` OR you have made 4 precheck iterations. Then — and only then — call \`compose_dossier_envelope\` ONCE on the clean set. The verifier is purpose-built for fast iteration (small input, small output); the envelope is heavyweight (~30KB input per call). Iterating on the cheap tool first lifts first-call verification rate into the 80-90% band and ships the dossier in 1 envelope call instead of 2-5. If a claim genuinely cannot be supported by any IRL substring, accept the \`unverified\` flag — the partner needs to see what was unsupported.`,
  '',
  `Step 4. **Mandatory closing step.** Before emitting the dossier prose, call \`compose_dossier_envelope\` with the structured inputs (promptName/promptVersion/modelVersion/mode/verbosity/transactionContext/fillRatio/gatesPassed/gatesElided/conditionalTriggersFired/forceToolsApplied/claims/gaps/irlBodyHash/irlSource/requireVerbatimBody). The IRL body is no longer a public input field on this tool — submit it via \`prepare_irl_body\` first. **Call \`prepare_irl_body({ filledIrl: <body> })\` FIRST**; it caches the body server-side keyed by the canonical \`irlBodyHash\` and returns that hash. Then pass ONLY \`irlBodyHash\` to \`compose_dossier_envelope\` — the server re-hydrates the body from the cache for internal provenance verification. (Rationale: emitting the full body to \`compose_dossier_envelope\` as tool args costs 5–15 minutes per call in output-token generation time; the cache eliminates that cost.) If you skip \`prepare_irl_body\` and call \`compose_dossier_envelope\` first, the server returns \`Bl076BodyCacheMissError\` directing you to call \`prepare_irl_body\` first. The envelope tool returns three markdown blocks the dossier MUST include verbatim: \`metaFenceMarkdown\` as the FIRST content (before A), \`gapListMarkdown\` as section (J), \`provenanceFooterMarkdown\` as section (K). The tool internally verifies every load-bearing claim against the IRL and auto-appends \`provenance-gap:\` / \`tier-mismatch:\` / \`tier-fabrication:\` entries. Pass \`irlSource\` as a top-level argument matching how the IRL body bytes were assembled: \`partner-paste-verbatim\` when the operator pasted the IRL markdown directly, \`model-reconstruction-from-xlsx\` when you parsed an xlsx attachment, \`model-reconstruction-trimmed\` when you assembled markdown without a verbatim source. The server auto-appends a \`provenance-gap:\` entry to (J) when the value indicates reconstruction — this is intentional and surfaces the hash-bind tautology in non-partner-paste modes. **requireVerbatimBody gate**: if the operator invoked this prompt with \`requireVerbatimBody: true\`, you MUST pass that value through verbatim to \`compose_dossier_envelope.requireVerbatimBody\`. In that mode the server REFUSES any \`irlSource !== "partner-paste-verbatim"\`; you cannot self-degrade to xlsx-reconstruction when the flag is set. If the operator did not paste the IRL markdown directly AND set the flag, return a graceful error directing the operator to re-invoke with the markdown pasted into the \`filledIrl\` prompt arg.`,
  '',
  '## Step 5 — verification harness (mandatory final output)',
  '',
  'AFTER you have transcribed the envelope into the dossier and rendered the final document, emit a SINGLE fenced block at the very end of your response with the label `BL-045-VERIFY` and the schema below. This block is the architect-facing verification artifact — operators copy this one block to verify the run. Do NOT omit it; do NOT decorate it; do NOT add fields not in the schema.',
  '',
  '```',
  '```BL-045-VERIFY',
  'promptVersion: <semver — copy from the meta fence promptVersion field at the top of your dossier; NOT the mcp-server package version>',
  'runScenario: partner-paste | interactive-paste-request | xlsx-reconstruction',
  'filledIrl:',
  '  bytes: <int — byte length of the filledIrl value you submitted to compose_dossier_envelope>',
  '  source: partner-paste-verbatim | partner-paste-verbatim-prepop | model-reconstruction-from-xlsx | model-reconstruction-trimmed | placeholder',
  '  fingerprint:',
  '    headChars: <verbatim first 120 chars of filledIrl — single-line, escape newlines as ⏎>',
  '    tailChars: <verbatim last 120 chars of filledIrl — single-line, escape newlines as ⏎>',
  'firstEnvelopeCall:',
  '  irlBodyHash: <16hex>',
  '  hashBindResult: pass-bound | pass-internal | IrlBodyHashMismatchError',
  '  provenanceVerification: { total: N, verified: N, verifiedFuzzy: N, partnerSupplied: N, unverified: N, tierMismatches: N, tierFabrications: N }',
  'precheck:',
  '  iterations: <int — count of SUCCESSFUL validate_irl_provenance calls BEFORE firstEnvelopeCall>',
  '  attemptsTotal: <int — including schema-rejected and transport-failed attempts; ≥ iterations>',
  '  outcome: converged | hit-cap | never-attempted | abandoned-after-error',
  '  errorsEncountered: [<{errorClass: string, recoveryAction: string}, ...> — empty list if none]',
  'toolCallCounts:  # BL-071: copy VERBATIM from compose_dossier_envelope output `serverToolCallCounts`',
  '  validate_irl_provenance: { attempted: N, succeeded: N, rejected: N, errored: N }',
  '  compose_dossier_envelope: { attempted: N, succeeded: N, rejected: N, errored: N }',
  '  <other tools used>: { attempted: N, succeeded: N, rejected: N, errored: N }',
  'toolErrors: [<{tool: string, attemptNumber: int, errorClass: string, recoveryAction: string}, ...> — every NON-precheck failed tool attempt; empty list if none; precheck failures stay in precheck.errorsEncountered>]',
  'selfCorrectionCalls: <int — CUMULATIVE total envelope calls AFTER the first across the entire session, not just this response>',
  'totalEnvelopeCalls: <int — CUMULATIVE across the session>',
  'meaningfulRecallsHaveDifferentInputs: <bool — true | false | null; BL-052 transport-vs-iteration discriminator; null when selfCorrectionCalls=0>',
  'conditionalTriggers:',
  '  considered: [<conditional triggers you evaluated — currently EU_AI_ACT, NIS2; NOT Section-09 frameworks>]',
  '  fired: [<subset of considered that actually fired>]',
  '  suppressedWithRationale: [<{trigger: string, whyNot: string}, ...> — empty list if none>]',
  '  defaultFiredFrameworks: [<Section-09-enumerated framework name, ...> — fired via Section-09 evidence path, NOT trigger evaluation>]',
  'gatesElided: [<{tool: string, rationale: string}, ...>]',
  'response:',
  '  continuations: <int — number of "continue" prompts the operator issued to complete this response>',
  '  verifyBlockEmissionPoint: final-continuation | mid-stream',
  '  compactionEvents: <int | null — count of detected host-triggered auto-compaction events; null when uncertain; 0 only with positive reason to believe no compaction>',
  '```',
  '```',
  '',
  "`hashBindResult` reporting discipline: use `pass-bound` ONLY when you copied the `irlBodyHash` value verbatim from the prompt body's `**Body-binding hash:**` directive (one-shot mode where `filledIrl` was a partner-supplied arg). Use `pass-internal` when the prompt body had no such directive (interactive-mode invocation) and you computed the hash yourself from the body bytes you submitted — that is honest internal consistency, not a fabricated authoritative bind. Use `IrlBodyHashMismatchError` when the envelope rejected the call. Reporting `pass-bound` without a real directive to copy from is a fabricated audit claim — do not.",
  '',
  '`filledIrl` block (BL-058) reporting discipline: `filledIrl.bytes` is the EXACT byte length of the string you passed as the `filledIrl` argument to `compose_dossier_envelope` — not the original Excel size, not the inline-paste size, the submitted-body size. `filledIrl.source` is honest categorical reporting of how the bytes were assembled — `placeholder` is a real option and you MUST report it if you used one (e.g., the `"PLACEHOLDER"` literal or an ellipsis-truncation). `filledIrl.fingerprint.headChars` and `tailChars` are the first and last 120 verbatim characters with newlines escaped as `⏎` so each is a single YAML line. Operators cross-check this against the IRL they sent.',
  '',
  '`precheck` block (BL-058 expansion of BL-056) reporting discipline: `precheck.iterations` counts ONLY validate_irl_provenance calls that returned a successful verdict; schema-rejected and transport-failed attempts go into `precheck.attemptsTotal` and `precheck.errorsEncountered`. `precheck.outcome: converged` requires `(verified + verifiedFuzzy + partnerSupplied) / total >= 0.90`; `hit-cap` means 4 attempts without convergence; `never-attempted` means BL-051 elided; `abandoned-after-error` means you attempted and gave up after failures — the directive does NOT permit abandonment, so this outcome is a compliance flag. `errorsEncountered` lists `{errorClass, recoveryAction}` for each failed attempt — `errorClass` is the short label (e.g., `schema-min-200`, `transport-timeout`, `IrlBodyHashMismatchError`); `recoveryAction` is what you did next (e.g., `retried-with-full-body`, `downgraded-to-reconstruction`, `abandoned-precheck`).',
  '',
  '`toolCallCounts` block (BL-058 + BL-071) reporting discipline: server-arithmetic. Copy VERBATIM from `compose_dossier_envelope` output `serverToolCallCounts` — the server tracks every wrapped tool call (`attempted` at wrap entry, `succeeded`/`rejected`/`errored` at exit) and this snapshot is the ground-truth source. The `errored` field is additive over BL-058; the arithmetic identity is `attempted = succeeded + rejected + errored`. **Precheck derivation rules (BL-071)**: `precheck.iterations` MUST equal `serverToolCallCounts.validate_irl_provenance.succeeded`; `precheck.attemptsTotal` MUST equal `attempted`; `precheck.errorsEncountered` length MUST equal `rejected`. The envelope tool itself appears as `attempted: N, succeeded: N-1` (in-flight while computing the snapshot); copy as-is. Do NOT self-narrate the counters or estimate from memory — server self-report drift was the empirical failure mode this field closes.',
  '',
  "`toolErrors` block (BL-060) reporting discipline: per-attempt diagnostic detail for the failed-attempt counts in `toolCallCounts`. One entry per failed tool attempt EXCLUDING precheck failures (those live in `precheck.errorsEncountered` — strict partition, no overlap). Shape: `{tool, attemptNumber, errorClass, recoveryAction}`. `errorClass` is the narrowest accurate short label — `arg-shape-rejection`, `hash-bind-retry` (legitimate compose_dossier_envelope structural retry path, not a coaching gap), `transport-timeout`, `transport-disconnect`, `tool-internal-error`. **Arithmetic ground-truth**: for every tool T, `count(toolErrors where tool == T)` MUST equal `toolCallCounts.T.attempted - toolCallCounts.T.succeeded`. **Compaction fallback (BL-061 interaction)**: if `response.compactionEvents > 0`, `toolErrors` MAY be partial; include `<partial-due-to-compaction>` as the FIRST entry's `errorClass`, then enumerate what you can recover.",
  '',
  '`conditionalTriggers` block (BL-058 expansion + BL-062 + BL-063 server-side enforcement) reporting discipline: `considered` is every CONDITIONAL TRIGGER you evaluated — currently EU_AI_ACT and NIS2 are the only named conditional triggers; do NOT list Section-09 frameworks here. `fired` is the subset of `considered` you decided to fire. `suppressedWithRationale` lists `{trigger, whyNot}` for every trigger in `considered` but NOT in `fired`. **`defaultFiredFrameworks` (BL-062 + BL-063)** is the separate list of Section-09 regulatory frameworks fired via the gate-5 evidence path. **The `compose_dossier_envelope` tool enforces three BL-063 rules at the schema seam**: (1) **partition** — no overlap with `conditionalTriggers.fired` (REJECTED with `BL-063-PARTITION-VIOLATION`); (2) **scope** — no certifications (SOC 2, ISO 27001, PCI-DSS, etc., REJECTED with `BL-063-CERTIFICATION-NOT-REGULATION`); (3) **Hub-backing** — entries without a Hub regulatory-map match are auto-removed from the meta fence AND auto-appended to (J) as `map-absent:` gap entries. Apply your own pre-check: only list frameworks you have substantiated via successful `search_regulations` matches.',
  '',
  '`gatesElided` block (BL-058 expansion) reporting discipline: structured as `[{tool, rationale}]`. The bare list-of-strings form is deprecated. Empty list `[]` if no tools were elided.',
  '',
  '`response` block (BL-058 + BL-061) reporting discipline: `response.continuations` is how many "continue" prompts the operator issued for you to finish this response; zero is healthy. `response.verifyBlockEmissionPoint: final-continuation` is the only correct value — if you emitted the block mid-stream and the operator continued, RE-EMIT the block at the true end. `mid-stream` value is an honest report of an invalid run. **`response.compactionEvents` (BL-061)** has three valid states: `<int > 0>` (you have positive reason to believe N compaction events occurred — host-injected marker, detectable conversation-context discontinuity), `0` (POSITIVE REASON to believe none occurred — do NOT default to `0`), `null` (you genuinely cannot tell — preferable to `0` whenever uncertain). The asymmetry matters: false-negatives (reporting `0` when compaction actually occurred) defeat the field\'s purpose; `null` is always preferable to `0` under uncertainty.',
  '',
  'DO NOT omit any field. DO NOT add fields not in the schema. The operator parses this verbatim with field-presence assertions.',
  '',
  '(Use the actual outer ```` fence around the literal ` ```BL-045-VERIFY ` block — the nested fences above are just so this directive renders cleanly.)',
  '',
  "Voice: dossier-quality. The output reads as a single coherent partner-level document. Surface concrete numbers from the IRL verbatim. Honor every tool's `deeplink` field as a clickable Hub link (do NOT invent URLs). Do NOT fabricate data the IRL did not supply.",
].join('\n');

export const irlIngestionPrompt: GstPrompt<typeof argsSchema> = {
  name: PROMPT_NAME,
  description:
    'Bookend to gst_information_request_list — ingest a populated IRL and orchestrate every applicable Hub tool + downstream artifact to produce a unified engagement dossier. Scenario-neutral: serves buy-side diligence, sell-side prep, value-creation engagements, and post-close hardening. The "high-fidelity intake → full platform ingestion" workflow.',
  version: '0.21.1',
  lastReviewedAt: '2026-07-09',
  orchestrates: [...ORCHESTRATED_TOOLS, IRL_SOURCE_EMBED_URI, VDR_RESOURCE_URI] as const,
  argsSchema,
  build: (args) => {
    // BL-045 PR B body dispatch — three builders:
    //   - filledIrl absent              → buildInteractiveBody (paste ask)
    //   - filledIrl present, full mode  → buildFullBody (full sweep)
    //   - filledIrl present, extract-only → buildExtractOnlyBody (audit-trail JSON)
    //
    // mode defaults to 'full' when undefined (matches the design doc's
    // default semantics; the Zod arg description states default 'full').
    const mode = args.mode ?? 'full';
    const verbosity = args.verbosity ?? 'verbose';
    let bodyText: string;
    if (!args.filledIrl) {
      bodyText = INTERACTIVE_BODY;
    } else if (mode === 'extract-only') {
      bodyText = buildExtractOnlyBody({ ...args, filledIrl: args.filledIrl, verbosity });
    } else {
      bodyText = buildOneShotBody({ ...args, filledIrl: args.filledIrl, verbosity });
    }
    return {
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: bodyText },
        },
        {
          role: 'user',
          content: embedIrlGeneratorSource(),
        },
        {
          role: 'user',
          content: embedLibraryArticle(VDR_RESOURCE_URI),
        },
      ],
    };
  },
};
