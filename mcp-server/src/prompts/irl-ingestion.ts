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
 * See: src/docs/development/MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md
 */

import { z } from 'zod';
import type { GstPrompt } from './types';
import { authorialIntentLine, embedLibraryArticle } from './embed';
import {
  UNKNOWN_PROPAGATION_RULE,
  EU_AI_ACT_CONDITIONAL_TRIGGER,
  NIS2_CONDITIONAL_TRIGGER,
  ENG_COST_DEDUP_RULE,
  ICG_SEEDING_RULES,
  MTTR_P1_RULE,
} from './extraction-rules';

const IRL_RESOURCE_URI = 'gst://library/information-request-list';
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
const ORCHESTRATED_TOOLS = [
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
  forceTools: z
    .array(z.enum(ORCHESTRATED_TOOLS))
    .optional()
    .describe(
      "Escape hatch — explicit override that bypasses inclusion gates for the listed tool names. Defaults to `[]` (gates fully apply). Use when (a) the partner wants a tool output despite sparse IRL signal, or (b) the partner is refining a single section. Strict enum — accepted values are derived from the prompt's orchestrates array at build time, so an unknown tool name is rejected at parse time."
    ),
});

const PROMPT_NAME = 'gst_irl_ingestion';

const VOICE_CUES: Record<(typeof transactionContextValues)[number], string> = {
  'sell-side':
    "Sell-side: framing emphasizes the target's defensible story and where GST can sharpen positioning before buyers see the data room.",
  'buy-side':
    'Buy-side: framing emphasizes the technical, regulatory, and organizational risks the data confirms, denies, or fails to address — what the buyer needs to weigh against the deal thesis (whether pre-LOI or LOI-stage).',
  'value-creation':
    'Value-creation: framing emphasizes the 100-day plan and the highest-leverage platform investments the dossier reveals.',
  unknown:
    'Engagement context unspecified — write the dossier in universal voice; the partner can sharpen framing on read.',
};

function buildOneShotBody(args: {
  targetName?: string;
  filledIrl: string;
  transactionContext?: (typeof transactionContextValues)[number];
  partnerLead?: string;
  projectCodeName?: string;
}): string {
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
    `Run the GST diligence sweep against the populated Information Request List below. This is the bookend to \`gst_information_request_list\` — the request the partner sent (\`${IRL_RESOURCE_URI}\`, embedded as the next message for taxonomy reference) has come back filled. Your job is to translate the filled answers into a coordinated invocation of every relevant GST Hub tool and downstream artifact, then synthesize the outputs into a single dossier.`,
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
    `Step 1 — Extract the 13 diligence dimensions from the IRL, audit them against the calibration clauses, then invoke \`generate_diligence_agenda\`. ${UNKNOWN_PROPAGATION_RULE}`,
    '',
    `**Step 1a — Dimension extraction worksheet (BLOCKING — output BEFORE invoking the tool).** After applying the Extraction discipline above, output the 13 dimensions as a JSON code fence. For each: the assigned value, the tier (1/2/3), and the IRL citation that supports it (which Section, which bullet/row, plus any conversion or scope-narrowing math). This worksheet is what you audit in Step 1b — without it, the audit cannot run.`,
    '',
    '```json',
    '{',
    '  "transactionType":     { "value": "...", "tier": 1, "citation": "Section 00 row N (bullet)" },',
    '  "productType":         { "value": "...", "tier": 1, "citation": "..." },',
    '  "techArchetype":       { "value": "...", "tier": 2, "citation": "..." },',
    '  "headcount":           { "value": "...", "tier": 2, "citation": "Section 02 row N — Engineering ~X (Dev + Infra only, Product/Design excluded)" },',
    '  "revenueRange":        { "value": "...", "tier": 2, "citation": "Section 00 row N — ARR $X CAD × 0.73 = $Y USD ⇒ bracket Z" },',
    '  "growthStage":         { "value": "...", "tier": 2, "citation": "..." },',
    '  "companyAge":          { "value": "...", "tier": 1, "citation": "..." },',
    '  "geographies":         { "value": ["..."], "tier": 2, "citation": "..." },',
    '  "businessModel":       { "value": "...", "tier": 1, "citation": "..." },',
    '  "scaleIntensity":      { "value": "...", "tier": 1, "citation": "..." },',
    '  "transformationState": { "value": "...", "tier": 2, "citation": "...", "tie_break": "mid-migration | actively-modernizing — rationale per the tie-break clause" },',
    '  "dataSensitivity":     { "value": "...", "tier": 2, "citation": "...", "bucket_check": "PII categories present + threshold check vs low/moderate/high bucket boundaries" },',
    '  "operatingModel":      { "value": "...", "tier": 2, "citation": "..." }',
    '}',
    '```',
    '',
    '**Step 1b — Calibration-clause self-audit (BLOCKING — rewrite violations before invoking the tool).** Walk the worksheet against these four checks IN ORDER. If any fails, REWRITE the value and the citation, then re-run the check.',
    '',
    '1. **Currency check** — for `revenueRange` and any future bracketed-monetary dimension: did you convert non-USD bullets to USD? If the IRL bullet says `$X CAD` / `€X EUR` / `£X GBP`, the worksheet citation MUST show the conversion math (e.g., `$31M CAD × 0.73 = $22.6M USD ⇒ 5-25m`). If the citation is just the native-currency number with no conversion arrow, the conversion was SKIPPED — REWRITE: convert to USD, re-bracket, re-cite. **Treating a non-USD bullet as if it were USD is the most common bracketing error observed in real-world runs.**',
    '',
    '2. **Headcount-scope check** — for the `headcount` dimension: does the citation reference an *engineering-specific* bullet ("Engineering ~N", "engineering FTE: N", "Dev team N + Infra M")? If the citation instead references "Total headcount", "R&D + Product", "Combined HC", "All staff", or any non-engineering aggregate, the rule was VIOLATED — REWRITE: use the engineering-only subtotal, re-bracket, re-cite. **The schema field `headcount` is ENGINEERING headcount, not total company headcount — confusing the two routes the agenda to the wrong tier of probes.**',
    '',
    '3. **`dataSensitivity` bucket check** — re-read the bucket boundaries. If the IRL says "employee PII only; no customer/shopper PII; no PHI; no PCI" (or equivalent — the absence of regulated categories is dispositive), the value is `low`. `moderate` REQUIRES customer/shopper PII at scale OR financial-transaction metadata. `high` REQUIRES PHI, PCI card data, government-classified, or large-scale identifiable consumer financial data. If your assignment was `moderate` on employee-PII-only evidence, REWRITE to `low`.',
    '',
    '4. **`growthStage` Tier-discipline check** — `growthStage` is a Tier-2 derivation from velocity (revenue growth %, headcount growth, fundraising tempo), NOT from transformation-program activity. Mature companies with active modernization programs (Unify-style platform replatforming, AI build-out) are still `mature` if revenue growth is in the mature range (typically ≤15-20%); ongoing transformation is a separate dimension (`transformationState`). If you reasoned from "active transformation → scaling" rather than from revenue-growth velocity, REWRITE.',
    '',
    'After all four checks pass on the worksheet, invoke `generate_diligence_agenda` with the audited values. Surface the resulting agenda topics + attention areas + the `deeplink` URL.',
    '',
    `Step 2 — Pull comparable engagements. Call \`list_portfolio_facets\` first to see the filterable dimensions of GST's 57-engagement portfolio, then call \`search_portfolio\` with filters that match the target's profile (productType, industry-equivalent from Section 01, growthStage, geographies). **Use the literal theme / industry names returned by \`list_portfolio_facets\` verbatim** — do NOT guess at intuitive labels (e.g., the canonical theme is "Healthcare", not "Healthcare Tech"; a guess will return zero matches and force a retry). Pull 3-5 comparables. Surface the resulting code-named matches + the \`deeplink\` URL.`,
    '',
    `Step 3 — Pull the regulatory framework bodies the target is exposed to. Call \`list_regulation_facets\` first to enumerate available jurisdictions, then call \`search_regulations\` once per framework named in IRL Section 09 (e.g., HIPAA, GDPR, BDSG, CNIL, CCPA — whichever the filled IRL surfaces). **Two conditional triggers — both gap-fill the IRL when the partner's Section 09 list misses them:** (a) ${EU_AI_ACT_CONDITIONAL_TRIGGER} (b) ${NIS2_CONDITIONAL_TRIGGER} **Surface the \`deeplink\` URL from each \`search_regulations\` response in the dossier** — each one opens the Regulatory Map filtered to that framework's region + category. Cite article numbers verbatim when summarizing obligations; do NOT invent citations beyond what the framework bodies return.`,
    '',
    `Step 4 — Invoke \`compute_techpar\` using the architecture and engineering-cost data from IRL Section 02 + Section 03 + Section 07. Key inputs: engineering FTE count (Section 02), product personnel cost (Section 02), annual build/tooling cost (Section 02), monthly hosting + infra spend (Section 03 — annualize the 3-month average), infrastructure headcount (Section 03), material capex (Section 03), average fully-loaded engineering salary (Section 07). Toggle the capex view per the capex bullet in Section 03. ${ENG_COST_DEDUP_RULE} **Surface the \`deeplink\` URL from the tool response in the dossier** — it opens the TechPar wizard with these same inputs pre-populated, so the partner can refine in-browser or share the URL. Surface the resulting paradigm assessment + total R&D OpEx + deeplink.`,
    '',
    `Step 5 — Invoke \`assess_infrastructure_cost_governance\` using IRL Section 03 (hosting model + spend trajectory) + Section 02 (tooling + technical-debt-assessment) + Section 07 (FinOps-adjacent headcount, if any). Run the canonical two-call pattern: an empty-args call first to retrieve the 20-question schema across 6 domains; then a seeded call with the IRL-extractable signals. ${ICG_SEEDING_RULES} **Surface the \`deeplink\` URL in the dossier** — it opens the ICG wizard with these same answers pre-populated. Capture the ICG maturity scoring across domains, surface 3-5 prioritized recommendations, and the deeplink.`,
    '',
    `Step 6 — Invoke \`estimate_tech_debt_cost\` using IRL Section 04. Key inputs: maintenance burden percentage (Section 04 active-maintenance bullet), deployment frequency (Section 04), incidents quarterly trend + MTTR (Section 04), planned remediation budget (Section 04), team size (Section 07 engineering headcount), average salary (Section 07). ${MTTR_P1_RULE}`,
    '',
    '**Step 6a — MTTR + incident-count fabrication guard (BLOCKING — applies BEFORE invoking the tool).** Re-read IRL Section 04 specifically for the MTTR row and the incident-count row. For EACH: if the IRL marks it OPEN, "not yet tracked", "n/a", blank, or qualifies it as "sprint-scoped only" / "dashboard-only" / "needs JQL pull" — DO NOT substitute a placeholder value (24h, 8h, 2/mo, or any arbitrary anchor). Instead OMIT the field from the `estimate_tech_debt_cost` payload (or pass null explicitly), and add a provenance line in the Tech Debt section: `mttrHours ← Section 04: OPEN; placeholder substitution refused per MTTR_P1_RULE; surfaced in (J) gap list`. Mark the Tech Debt dossier section as `extraction-only` for the omitted fields and surface the missing inputs in the gap list with the concrete target follow-up (e.g., the 24-month JQL query needed to compute MTTR from raw incident records). **A fabricated MTTR value passes through the engine\'s linear multiplier and produces an unrecoverable false carrying-cost number — every downstream "11% of ARR" or "$X.XM/yr carry" claim then rests on a fiction. Do NOT do this.**',
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

const INTERACTIVE_BODY = [
  authorialIntentLine(PROMPT_NAME),
  '',
  `Help the user run the GST diligence sweep — the bookend to \`gst_information_request_list\`. The IRL article (\`${IRL_RESOURCE_URI}\`) is embedded as the next message for taxonomy reference; \`${VDR_RESOURCE_URI}\` follows for VDR-folder labels in synthesis.`,
  '',
  'Step 1. Ask the user:',
  '',
  "> Paste the populated Information Request List your target returned (all 10 sections, in markdown). If you can also share the target name, the engagement context (sell-side / buy-side / value-creation), the partner lead, and an engagement code name, I'll tailor the dossier — but only the filled IRL is required to run the sweep.",
  '',
  'Step 2. Once the user pastes the filled IRL, run the full sweep:',
  `  - Step 2a — Extract the 13 diligence dimensions from the IRL and call \`generate_diligence_agenda\`. The IRL is filled, so derive concrete values; do NOT default to \`'unknown'\`.`,
  `  - Step 2b — Call \`list_portfolio_facets\` then \`search_portfolio\` to pull 3-5 comparable past engagements.`,
  `  - Step 2c — Call \`list_regulation_facets\` then \`search_regulations\` once per framework the IRL Section 09 names.`,
  `  - Step 2d — Call \`compute_techpar\` using IRL Section 02 + 03 + 07 inputs.`,
  `  - Step 2e — Call \`assess_infrastructure_cost_governance\` using IRL Section 03 + 02 + 07.`,
  `  - Step 2f — Call \`estimate_tech_debt_cost\` using IRL Section 04 + 07.`,
  `  - Step 2g — Call \`search_radar\` for the target's product segment + geographies.`,
  '',
  `Step 3. Compose the unified dossier — nine sections (A–I): target snapshot · diligence agenda · architecture · ICG · tech debt · regulatory · comparables · market signal · synthesis. **Every section that pulls from a tool MUST close with that tool's \`deeplink\` URL as an "Open in Hub" link** — TechPar wizard for (C), ICG wizard for (D), Tech Debt Calculator for (E), Regulatory Map for (F, one per framework), portfolio view for (G), Radar feed for (H). The deeplinks open the corresponding Hub surface with state pre-populated; this is the bridge between the read-only dossier and the partner-refinable interactive tool. Reference the canonical VDR taxonomy (\`${VDR_RESOURCE_URI}\`) verbatim for follow-up document requests in the synthesis section.`,
  '',
  "Voice: dossier-quality. The output reads as a single coherent partner-level document. Surface concrete numbers from the IRL verbatim. Honor every tool's `deeplink` field as a clickable Hub link (do NOT invent URLs). Do NOT fabricate data the IRL did not supply.",
].join('\n');

export const irlIngestionPrompt: GstPrompt<typeof argsSchema> = {
  name: PROMPT_NAME,
  description:
    'Bookend to gst_information_request_list — ingest a populated IRL and orchestrate every applicable Hub tool + downstream artifact to produce a unified engagement dossier. Scenario-neutral: serves buy-side diligence, sell-side prep, value-creation engagements, and post-close hardening. The "high-fidelity intake → full platform ingestion" workflow.',
  version: '0.1.0',
  lastReviewedAt: '2026-06-01',
  orchestrates: [...ORCHESTRATED_TOOLS, IRL_RESOURCE_URI, VDR_RESOURCE_URI] as const,
  argsSchema,
  build: (args) => {
    const bodyText = args.filledIrl
      ? buildOneShotBody({ ...args, filledIrl: args.filledIrl })
      : INTERACTIVE_BODY;
    return {
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: bodyText },
        },
        {
          role: 'user',
          content: embedLibraryArticle(IRL_RESOURCE_URI),
        },
        {
          role: 'user',
          content: embedLibraryArticle(VDR_RESOURCE_URI),
        },
      ],
    };
  },
};
