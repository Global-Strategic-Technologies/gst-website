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
    WRONG_IRL_DETECTOR_PREFLIGHT,
    '',
    `Step 1 — Extract the 13 diligence dimensions from the IRL, then invoke \`generate_diligence_agenda\` with the dimension values AND the required \`_audit\` sibling that carries per-dimension provenance + calibration metadata. ${UNKNOWN_PROPAGATION_RULE}`,
    '',
    `**Step 1a — Schema-enforced audit shape (the tool REJECTS calls without it).** The \`generate_diligence_agenda\` tool's input schema requires a sibling \`_audit\` field next to the 13 dimensions. Each dimension's audit entry carries \`tier\` (1/2/3) + \`citation\` (in the form "Section NN — <substantial excerpt>") plus dimension-specific calibration fields. Worked StoreForce-shape example:`,
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
    '  "operatingModel": "centralized-eng",',
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
    '    "operatingModel":      { "tier": "2", "citation": "Section 07 row 116 — D. Woodward (VP Engineering) owns Development team 33; Leland Gordon (VP Ops) owns Infrastructure 9; Trace Snider (VP Product) owns Product 6. Three functional VPs report to CTO Joel Livet." }',
    '  }',
    '}',
    '```',
    '',
    '**The tool runs cross-field calibration refinements automatically and rejects malformed payloads** with a structured diagnostic. If you submit a call with `revenueRange` derived from a CAD bullet without `currencyConversion`, or `headcount.scope = "total-company"`, or `dataSensitivity = "moderate"` with `piiCategoriesPresent = ["employee-pii"]` only, the tool returns `isError: true` with the BL-045 rule citation explaining what to fix. Read the error and retry with the corrected payload.',
    '',
    '**Step 1b — Calibration-clause guidance (the tool enforces these; this is the prose for your reference):**',
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
    `Step 2 — Pull comparable engagements. Call \`list_portfolio_facets\` first to see the filterable dimensions of GST's 57-engagement portfolio, then call \`search_portfolio\` with filters that match the target's profile (productType, industry-equivalent from Section 01, growthStage, geographies). **Use the literal theme / industry names returned by \`list_portfolio_facets\` verbatim** — do NOT guess at intuitive labels (e.g., the canonical theme is "Healthcare", not "Healthcare Tech"; a guess will return zero matches and force a retry). Pull 3-5 comparables. Surface the resulting code-named matches + the \`deeplink\` URL.`,
    '',
    `Step 3 — Pull the regulatory framework bodies the target is exposed to. Call \`list_regulation_facets\` first to enumerate available jurisdictions, then call \`search_regulations\` once per framework named in IRL Section 09 (e.g., HIPAA, GDPR, BDSG, CNIL, CCPA — whichever the filled IRL surfaces). **Two conditional triggers — both gap-fill the IRL when the partner's Section 09 list misses them:** (a) ${EU_AI_ACT_CONDITIONAL_TRIGGER} (b) ${NIS2_CONDITIONAL_TRIGGER} **Surface the \`deeplink\` URL from each \`search_regulations\` response in the dossier** — each one opens the Regulatory Map filtered to that framework's region + category. Cite article numbers verbatim when summarizing obligations; do NOT invent citations beyond what the framework bodies return.`,
    '',
    `Step 4 — Invoke \`compute_techpar\` using the architecture and engineering-cost data from IRL Section 02 + Section 03 + Section 07. Key inputs: engineering FTE count (Section 02), product personnel cost (Section 02), annual build/tooling cost (Section 02), monthly hosting + infra spend (Section 03 — annualize the 3-month average), infrastructure headcount (Section 03), material capex (Section 03), average fully-loaded engineering salary (Section 07). Toggle the capex view per the capex bullet in Section 03. ${ENG_COST_DEDUP_RULE}`,
    '',
    `**Step 4a — TechPar audit shape (the tool REQUIRES \`_audit\` — schema rejection on missing or wrong shape).** The BL-045 Phase-2 audit enforces TWO things for compute_techpar: (1) a SINGLE declared currency basis for all monetary inputs, and (2) PER-FIELD annualization provenance (no more ad-hoc YTD ×4 vs ×1.2 swings across runs on the same fixture). Worked StoreForce-shape example (CAD source, converted to USD):`,
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
}): string {
  const targetClause = args.targetName
    ? `The target is **${args.targetName}**.`
    : 'Infer the target name from the IRL header (Section 00 — Basics, first bullet).';
  const voiceClause = args.transactionContext
    ? `Voice cue: ${VOICE_CUES[args.transactionContext]}`
    : 'Voice cue: universal. No engagement-specific framing.';

  return [
    authorialIntentLine(PROMPT_NAME),
    '',
    `Run the GST IRL ingestion in **EXTRACT-ONLY mode** against the populated Information Request List below. This is the bookend to \`gst_information_request_list\` — the request the partner sent (\`${IRL_RESOURCE_URI}\`, embedded as the next message for taxonomy reference) has come back filled. **In extract-only mode you DO NOT invoke any tools and DO NOT compose a dossier.** You produce a structured JSON artifact: the dimension worksheet + the per-tool input payloads that WOULD have been submitted if the sweep ran. This is the audit-trail surface for downstream automation, partner inspection, or single-section refinement.`,
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
    WRONG_IRL_DETECTOR_PREFLIGHT,
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
    // BL-045 PR B body dispatch — three builders:
    //   - filledIrl absent              → buildInteractiveBody (paste ask)
    //   - filledIrl present, full mode  → buildFullBody (full sweep)
    //   - filledIrl present, extract-only → buildExtractOnlyBody (audit-trail JSON)
    //
    // mode defaults to 'full' when undefined (matches the design doc's
    // default semantics; the Zod arg description states default 'full').
    const mode = args.mode ?? 'full';
    let bodyText: string;
    if (!args.filledIrl) {
      bodyText = INTERACTIVE_BODY;
    } else if (mode === 'extract-only') {
      bodyText = buildExtractOnlyBody({ ...args, filledIrl: args.filledIrl });
    } else {
      bodyText = buildOneShotBody({ ...args, filledIrl: args.filledIrl });
    }
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
