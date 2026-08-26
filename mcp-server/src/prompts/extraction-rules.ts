/**
 * Shared IRL-extraction rule constants — load-bearing prose originally
 * extracted from the BL-032.6 sweep prompt (since renamed to
 * `gst_irl_ingestion` under BL-045 PR B), now imported directly by the
 * ingestion prompt and any sibling ingestion-style prompts that ship.
 *
 * Each constant is the rule sentence(s) without ingestion-specific
 * orchestration framing ("Step N — Invoke `X`…", "Surface the resulting
 * `deeplink`…"). The ingestion body interpolates each constant between
 * its orchestration opener and closer. JSDoc above each constant cites the
 * `irl-tool-input-mapping.md` SOP section it derives from.
 *
 * **Refactor intent (BL-045 PR A)**: structural-only diff against the
 * pre-refactor sweep body. Sentence boundaries shift (the rule prose was
 * fused mid-sentence with sweep-specific orchestration in single template
 * literals at `diligence-sweep.ts:123/127/129/131/133` pre-refactor); the
 * meaning of every rule is preserved verbatim. Confirmed by the
 * constant-presence test added in `tests/unit/prompts/diligence-sweep.test.ts`.
 *
 * See: mcp-server/src/docs/library/irl-tool-input-mapping.md — the SOP each
 * rule constant derives from (per-constant JSDoc names the section).
 */

/**
 * SOP § "Section 00–02 → diligence dimensions" + § "Sentinel discipline".
 *
 * Governs how the model maps IRL bullets to the 13 `generate_diligence_agenda`
 * input dimensions. Three confidence tiers — Tier 1 (literal) and Tier 2
 * (direct one-step derivation) both pass concrete values; Tier 3 (correlation
 * / vibes) passes `'unknown'`. Named Tier-3 traps are explicit anti-examples
 * surfaced by past engagement audits.
 *
 * **Recalibrated under BL-045 PR B** (2026-06-02, senior-consultant review
 * Axis 1 feedback): the prior framing ("indirect inference is forbidden")
 * collapsed Tier-2 direct derivation into Tier-3 vibes-based inference and
 * mechanically forced `'unknown'`-bloated dossiers. The new framing keeps
 * the named anti-examples (which prevent observed defects) while allowing
 * the Tier-2 derivation the IRL ingestion surface is designed to do. The
 * "squad model → operatingModel: product-aligned-teams" anti-example from
 * v0.0.4 was retired — reviewer confirmed that mapping IS correct.
 *
 * **Three calibration clauses added** (PR B, 2026-06-02, real-world IRL
 * walkthrough — PRAXIS-IRL-SanFran_JLIVET.xlsx):
 *   (a) Currency normalization for bracketed dimensions (revenueRange);
 *   (b) `transformationState` tie-break between `mid-migration` and
 *       `actively-modernizing` when both fit;
 *   (c) `headcount` scope clarification (engineering ICs + management,
 *       excludes product/design/standalone-QA unless reporting into eng).
 *
 * **Second pass — b2b-saas anti-example retired** (PR B, 2026-06-02,
 * SanFran walkthrough finding #9): the `b2b-saas → productized-platform`
 * forbidden mapping from sweep v0.0.4 was overcautious. The canonical B2B
 * SaaS pattern (packaged product + recurring subscription + per-seat or
 * per-location pricing) IS a productized platform; forcing `'unknown'`
 * here is exactly the `'unknown'`-bloat the recalibration was meant to
 * prevent. Anti-example removed. Reviewer retained the cloud-native
 * trap (still defensible — capability != in-flight change).
 *
 * **Third pass — v3 calibration tightening** (PR B, 2026-06-02,
 * SanFran live-run grading against Claude Desktop): the v2 currency
 * + headcount clauses were buried mid-paragraph and the model skimmed
 * past them — Claude treated `$31M CAD` as if it were USD (→ wrong
 * bracket) and used `R&D + Product ~48` instead of `Eng ~42` for
 * headcount. Restructured each clause onto its own line and led with
 * the SanFran-shape worked example, mirroring how the Tier 1/2/3
 * worked examples already drive the rest of the rule. Also added a
 * dataSensitivity bucket clause (the v2 rule had no guidance and the
 * model defaulted to `moderate` for employee-PII-only — reviewer's call
 * was `low`).
 */
export const UNKNOWN_PROPAGATION_RULE = [
  'Because the IRL is filled, derive concrete values wherever the bullets support it.',
  '',
  '**Extraction discipline — three confidence tiers, ordered by directness of evidence**:',
  '',
  '- **Tier 1 (literal)**: the IRL bullet states the enum value verbatim — use it.',
  '- **Tier 2 (direct one-step derivation)**: the IRL bullet contains the specific data that uniquely maps to one enum value (e.g., "Geographies: US (~88%), EU (~12%)" → `geographies: [US, EU]`; "ARR $45.2M Q1-FY26 annualized" + a known revenueRange schema → the bracket the value falls in; "Engagement context: buy-side review on behalf of a strategic investor" → `transactionType: buy-side`) — use the value and cite the source bullet in the provenance footer.',
  "- **Tier 3 (correlation / vibes)**: the IRL bullet correlates with an enum value but does NOT determine it — pass `'unknown'`.",
  '',
  "Map IRL sections to dimensions: Section 00 → transactionType (engagement-context bullet), revenueRange (ARR bullet), growthStage (growth-rate bullet), companyAge (founding year), headcount (engineering-FTE bullet), geographies (geographies bullet); Section 01 → productType, scaleIntensity (only if IRL literally uses 'low'/'moderate'/'high' — that's Tier 1); Section 02 → techArchetype; Section 05/09 → dataSensitivity. Each is Tier-2-or-better when the IRL bullet contains the specific signal; otherwise pass `'unknown'`.",
  '',
  "**For `businessModel` and `operatingModel`**: default to `'unknown'` unless the IRL uses one of the enum values literally (Tier 1) OR provides direct evidence that uniquely maps (Tier 2).",
  '',
  '**Currency normalization (BLOCKING — applies BEFORE any bracketed-monetary dimension is assigned)**: every monetary bullet in a non-USD currency MUST be converted to USD before bracket assignment, and the provenance footer MUST cite the conversion. Worked example — SanFran shape: an IRL bullet "Implied ARR run-rate ~$31M CAD" converts as `$31M CAD × 0.73 USD/CAD ≈ $22.6M USD ⇒ revenueRange: 5-25m`. Worked example — EUR shape: "ARR €18M FY26" converts as `€18M × 1.08 USD/EUR ≈ $19.4M USD ⇒ revenueRange: 5-25m`. Worked example — GBP shape: same form. If the converted value lands within 10% of a bracket boundary (e.g., USD $23-27M against the 25m boundary), pass `\'unknown\'` and surface the currency / conversion question in the (J) gap list — bracket misassignment compounds downstream so prefer `\'unknown\'` to a fragile commitment. **Treating a non-USD bullet as if it were USD is the most common bracketing error in real-world runs — do NOT skip this step.**',
  '',
  '**`headcount` scope (BLOCKING — applies to the `generate_diligence_agenda` `headcount` field)**: "engineering headcount" means engineering ICs + engineering management ONLY. It EXCLUDES product managers, designers, and standalone QA UNLESS QA reports into engineering. Worked example — SanFran shape: IRL Section 02 bullet "Engineering ~42: Development team 33 ... Infra/DevOps/DBA 9. Product ~6. ~15 of 48 R&D+Product are contractors" → use 42 (Eng-only), NOT 48 (R&D+Product), and cite the distinction in the provenance footer (`headcount ← Section 02: Engineering 42 (Dev 33 + Infra 9); Product 6 excluded`). When the IRL distinguishes "engineering ~N1" from "R&D + Product ~N2" or similar, N1 is always the right input. **Lumping product/design into engineering headcount mis-routes the agenda to higher-tier probes — do NOT skip this distinction.**',
  '',
  '**`dataSensitivity` bucket boundaries (Tier 2 guidance)**: the enum is `low` / `moderate` / `high`. Bucket boundaries:',
  '- **`low`**: employee PII only (names, schedules, wages, performance, HR-IDs) and/or operational metadata + telemetry; no regulated category; no customer/shopper PII at scale; no PHI; no PCI card data; no government-classified data.',
  '- **`moderate`**: customer/shopper PII at scale; financial-transaction metadata (not card numbers); employee PII combined with customer PII at scale; non-card financial data.',
  '- **`high`**: PHI (HIPAA-regulated); PCI card data; regulated-health beyond HIPAA; government-classified; large-scale identifiable consumer financial data; biometric data at scale.',
  '',
  'Worked example — SanFran shape: "Employee PII (associate names, schedules, wages, performance). Store operational + sales/KPI data (not personal). No customer/shopper PII; no PHI" → `dataSensitivity: low` (employee PII alone is `low`; the threshold to `moderate` requires customer/shopper PII at scale). Cite the bucket choice in the provenance footer.',
  '',
  '**`transformationState` tie-break** between `mid-migration` and `actively-modernizing` when both fit the IRL evidence: prefer `mid-migration` when the IRL names a specific cutover date with parallel legacy + new operation during a window (e.g., "new clients on platform B from August; legacy clients migrate from January"); prefer `actively-modernizing` when the IRL describes broader transformation work without a single migration spine (org reorg + tech reset + new product line in parallel). Cite the tie-break choice in the provenance footer.',
  '',
  '**Named Tier-3 trap** (explicit anti-example — observed wrong in past engagements): do NOT map a present-tense capability statement (e.g., "cloud-native", "AI-powered") → `transformationState: actively-modernizing` — present-tense capability ≠ in-flight change. `transformationState` maps LITERALLY to `actively-modernizing` only when Section 02 or 04 names a specific in-flight rewrite (e.g., "denial-appeals rewrite Q1-Q3 FY26"); otherwise pass `\'unknown\'`.',
].join('\n');

/**
 * Authoritative enum of named conditional-trigger constants — single source
 * of truth for the `conditionalTriggersFired` schema in
 * `compose_dossier_envelope`. Adding a new conditional trigger requires
 * extending this tuple AND the corresponding `*_CONDITIONAL_TRIGGER` prose
 * constant + body wiring; the schema then accepts the new name without
 * further drift (BL-045 PR B audit BL-3).
 */
export const CONDITIONAL_TRIGGER_NAMES = ['EU_AI_ACT', 'NIS2'] as const;
export type ConditionalTriggerName = (typeof CONDITIONAL_TRIGGER_NAMES)[number];

/**
 * SOP § "Section 05 ML/AI + EU geography → EU AI Act gap-fill".
 *
 * Conditional trigger for adding an EU AI Act `search_regulations` call when
 * Section 09 omits it but Section 05 + Section 00 make it relevant.
 */
export const EU_AI_ACT_CONDITIONAL_TRIGGER =
  '**EU AI Act**: if Section 05 names any production ML/AI capability AND Section 00 geographies include the EU, add an EU AI Act search (healthcare-domain decision-support ML typically classifies as Annex III high-risk).';

/**
 * SOP § "Section 00 EU + Section 01 regulated sector → NIS2 gap-fill".
 *
 * Conditional trigger for adding a NIS2 `search_regulations` call when
 * Section 09 omits it but Section 00 + Section 01 make the entity NIS2-
 * scoped. The Annex I/II sector enumeration is verbatim from NIS2 article 2.
 */
export const NIS2_CONDITIONAL_TRIGGER =
  '**NIS2**: if Section 00 geographies include the EU AND Section 01 product description names a regulated sector covered by NIS2 Annex I or II (healthcare, energy, transport, banking, digital infrastructure, drinking water, wastewater, public administration, space, postal/courier, waste management, chemicals, food, manufacture of critical products, digital providers, research) — add an NIS2 search (24-hour early-warning + 72-hour incident-notification + supply-chain risk obligations + Director-level personal liability).';

/**
 * BL-126 — which TechPar mode this prompt runs, and why it is not a choice.
 *
 * `compute_techpar` is mode-conditional: `techpar-engine.ts` computes
 * `rdOpEx` as `engCost + prodCost + toolingCost` in `deepdive` and reads the
 * `rdOpEx` input directly in `quick`. The prompt named no mode — zero matches
 * for `deepdive`/`quick` before this rule — and the tool's `mode` is a required
 * enum with no default, so the model chose it unguided on every call.
 *
 * That produced a 1.9× divergence on `rdOpEx` across two runs over identical
 * IRL bytes, and with it a partner-facing verdict inversion (32.6% "healthy"
 * vs 47.5% "above the PE ceiling"). Neither run misbehaved. Step 4 enumerates
 * the Section-02 components, which are `deepdive` inputs; a model that obeyed
 * it and picked `quick` held three figures the engine discards and whose
 * `_audit` entries the schema rejects, plus a required `rdOpEx` with no
 * documented source — so it folded the components in. A model that picked
 * `deepdive` found `rdOpEx` ignored and supplied it anyway, from Section 04.
 *
 * `deepdive` is not a preference: it is the only mode the canonical IRL
 * supports. Section 02 asks for the product-personnel and tooling components
 * directly, and supplies the FTE breakdown `engCost` derives from. **No bullet
 * anywhere asks for a total R&D OpEx figure**, so `quick`'s required input has
 * no canonical source by construction.
 */
export const TECHPAR_MODE_RULE =
  '**Run `compute_techpar` in `mode: "deepdive"`. Always.** This is not a judgement call: `deepdive` synthesizes R&D OpEx from `engCost + prodCost + toolingCost`, and IRL Section 02 asks the target for the product-personnel and tooling components directly while `engCost` derives from its FTE breakdown against the Section 07 salary band. `quick` instead takes `rdOpEx` as a direct input, and **no IRL bullet anywhere asks for a total R&D OpEx figure** — so in `quick` mode that required input has no source and gets improvised, which is what produced a 1.9x swing and an inverted zone verdict across two runs of the same IRL. **Wire shape under `deepdive` (the schema requires this even though the engine ignores the value):** pass `rdOpEx: 0` and an `_audit.rdOpEx` of `{ annualizationSource: "irl-annualized-stated", citation: "Section -- — not sourced; deepdive synthesizes R&D OpEx from engCost + prodCost + toolingCost" }`. Both fields are REQUIRED in both modes and the call is rejected without them — do not omit them, and do not compute a real figure for a field the engine discards. In particular do NOT source it from the Section 04 technical-debt remediation figure: that bullet feeds the Tech Debt Calculator input `remediationBudget`, a different tool, and routing it here has already happened once. **On the `_audit.rdOpEx` above**: `irl-annualized-stated` is a placeholder, not a claim. The enum has five values and every one asserts that a derivation happened — there is no value meaning "this field has no source" — so a required audit on a field the engine discards has no honest option. Use the `Section --` citation to say so in words, and treat this as the one sanctioned exception to the rule below. **If a Section-02 COMPONENT bullet (`engCost` / `prodCost` / `toolingCost`) is blank or `n/a`**, pass 0 for that component and say so explicitly in the (J) gap list — name the component, the Section 02 bullet that would have answered it, and the consequence, which is that a zeroed component understates total technology cost and moves the zone verdict in the flattering direction. For those three, do NOT invent an annualization source: they are figures the engine actually uses, so a fabricated provenance there corrupts a number the dossier rests on.';

/**
 * SOP § "Section 02 sub-counts → TechPar engCost / infraPersonnel dedup".
 *
 * Governs how the model splits an engineering total across `engCost` and
 * `infraPersonnel` inputs to `compute_techpar`. Includes the worked math
 * example (58 − 8 = 50) that locks the canonical buy-side fixture's
 * subtraction basis and the explicit anti-instruction against subtracting
 * security / data / DX engineers.
 */
export const ENG_COST_DEDUP_RULE =
  '**Critical `engCost` dedup — worked math example:** `engCost` covers R&D engineering headcount that is NOT also booked in `infraPersonnel`. If IRL Section 02 breaks the engineering org into named sub-counts, you MUST identify the infra-personnel sub-count (SRE / platform infra / FinOps roles — NOT security, data, or platform DX) and subtract ONLY that group from the engineering total. Example for an IRL bullet "58 total engineering — 38 product engineering, 8 infrastructure / SRE, 3 security, 7 data + ML, 2 platform DX": `infraPersonnel = 8 × salary` (the SRE group); `engCost = (58 − 8) × salary = 50 × salary`. **Do NOT subtract the security, data, or DX engineers** — they are R&D, not infra. **Do NOT pass the full 58 into engCost** while also passing 8 into infraPersonnel — that double-counts the 8 SRE (once in synthesized R&D OpEx via deepdive, once standalone) and inflates total tech / ARR by ~$1.8M / 4 percentage points for a mid-market RCM target. If Section 02 does NOT break the engineering org into sub-counts and Section 03 separately states an infra-personnel FTE count, use that infra-FTE count as the subtraction basis.';

/**
 * SOP § "Section 02 + 03 + 07 → ICG seeding rules".
 *
 * Governs how the model translates IRL signals into seeded answers for
 * `assess_infrastructure_cost_governance`. The penalization framing
 * (`-1` harsher than `0`) prevents the model from defensively flooding the
 * payload with "Not sure" answers and mechanically forcing a Reactive score.
 * The five-rule signal-mapping table + q5_3 tenure caveat capture the
 * canonical IRL-to-q-id mappings.
 */
export const ICG_SEEDING_RULES =
  '**Seeding philosophy — important:** the ICG engine penalizes `-1` ("Not sure") MORE harshly than `0` ("Not in place"). Over-conservatism is therefore worse than calibrated seeding: leaving every silent question at `-1` mechanically forces a Reactive score even when the IRL provides strong adjacent infrastructure-maturity signals. Seed at the IRL-supported level when the signal is direct OR strongly one-step adjacent. **Seeding-signal mapping table — apply each rule when the IRL text matches:** (a) IaC tooling named (Terraform / Pulumi / CloudFormation) + per-service observability (Datadog APM / per-service metrics) → q1_1 tagging at level 2 (Established). (b) Named FinOps owner / FinOps lead role + IRL Section 03 lists multi-month spend tracking → q1_2 cost visibility at level 2 AND q1_3 cost review cadence at level 2. (c) Multi-region hosting with strict region-or-tenant isolation + gated staging→production deploys → q2_1 environment segregation at level 2. (d) Continuous utilization tracking (Datadog metrics, named utilization %, capacity headroom targets) → q3_1 utilization monitoring at level 2. (e) Production serverless / managed-ML / usage-billed API in Section 02 or 05 (SageMaker endpoint, OpenAI API, Lambda) → q5_2 serverless adoption at level 2. **Tenure caveat for q5_3 (FinOps champion):** named-and-hired FinOps lead is level 2 (Established), NOT level 3 (Strategic / Optimized). Level 3 requires evidence of a *practice* — optimization wins shipped, architectural influence demonstrated, cross-team adoption — none of which the IRL typically captures for a hire <12 months tenured.';

/**
 * SOP § "Section 04 MTTR → Tech Debt P1 scalar selection".
 *
 * Governs which MTTR scalar the model passes to `estimate_tech_debt_cost`
 * when Section 04 reports P0 and P1 separately. P1 is the workhorse number;
 * the engine multiplies MTTR × incidents linearly, so picking the wrong
 * scalar understates carrying cost by the full ratio. Also fixes the
 * incident-frequency input rule (most-recent quarter monthly equivalent).
 */
export const MTTR_P1_RULE =
  '**MTTR input — use P1 (the workhorse number):** if Section 04 lists MTTR separately for P0 and P1 (e.g., "Mean time to resolution P0 2.4h, P1 7.8h"), pass the P1 value to the tool. P0s are rare (typically one or two per year at this scale); P1s drive the steady-state incident-carrying cost the model is computing. **Do NOT use the P0 number, do NOT use a midpoint, do NOT use an average** — the engine multiplies MTTR × incidents linearly, so picking the wrong scalar understates carrying cost by the full ratio (P1/P0 ≈ 3× for typical operations). **MTTR-unfilled guard (BLOCKING)**: if Section 04 lists no MTTR value, marks MTTR as OPEN, or says "not yet tracked" / "n/a" — DO NOT substitute a placeholder (24h, 8h, or any arbitrary anchor). Instead omit the MTTR field from the `estimate_tech_debt_cost` payload (or pass it explicitly null) and mark the Tech Debt section in the dossier as `extraction-only` for that field, with a provenance line `mttrHours ← Section 04 OPEN / not stated; placeholder substitution refused; surfaced in (J) gap list`. Surface the missing MTTR in (J) as a target follow-up (e.g., "Pull 24-month JQL for client-incident MTTR over the period; replace the omitted-field marker once available"). **A fabricated MTTR value passes through the engine\'s linear multiplier and produces an unrecoverable false carrying-cost number — do NOT do this.** **Incident frequency input:** use the most recent quarterly count from the trend, converted to monthly. If Section 04 shows a declining trend (e.g., "FY24-Q1 8 incidents... FY25-Q4 4 incidents"), use the most-recent quarter\'s monthly equivalent (4/3 ≈ 1.3/month), not an inflated round number. **If incident counts are themselves OPEN/unfilled**, apply the same guard — omit, mark extraction-only, surface in (J).';

// ─── Shared workbook + VDR constants (moved verbatim from irl-ingestion.ts,
// PR1 phase 1.2 of the trust-the-operator rebuild) ──────────────────────
//
// Moved so both the old prompt (during the coexistence window) and the new
// `gst_irl_sweep` prompt import ONE copy. The move is byte-identical to the
// old prompt's render — proven by its body-hash suite staying green.

// The URI is kept as a provenance caption on the inlined table, which also
// satisfies the orchestrates→body invariant for prompts declaring it.
export const VDR_RESOURCE_URI = 'gst://library/vdr-structure';

/**
 * The VDR folder taxonomy, inlined (BL-123). The labels must be IN the
 * body: a bare "read `gst://library/vdr-structure`" instruction makes the
 * model substitute a generic PE-diligence taxonomy from training (measured
 * in V1). **This is a second copy of canonical Library content** — source
 * of truth is `src/data/library/vdr-structure/article.md`; the drift guard
 * at `tests/integration/vdr-taxonomy-drift-guard.test.ts` pins the two.
 */
export const VDR_FOLDER_TAXONOMY = [
  `**Canonical VDR folder taxonomy** (from \`${VDR_RESOURCE_URI}\` — use these labels VERBATIM; do NOT substitute a generic PE-diligence taxonomy):`,
  '',
  '| #   | Folder                      | Contents                                                                                    |',
  '| --- | --------------------------- | ------------------------------------------------------------------------------------------- |',
  '| 01  | Product                     | Roadmap, release history, feature analytics, UX research, backlog health.                   |',
  '| 02  | Software Architecture       | System design, stack inventory, data models, integration points, code-quality metrics.      |',
  '| 03  | Infrastructure & Operations | Cloud architecture, monitoring, SLA history, capacity planning.                             |',
  '| 04  | SDLC                        | Methodology, branching strategy, code review, testing, release process.                     |',
  '| 05  | Data, Analytics & AI        | Data architecture, pipelines, analytics, ML/AI models, governance.                          |',
  '| 06  | Security                    | Policies, pen-test results, incident history, access controls, BCP/DR plans.                |',
  '| 07  | People & Organization       | Org charts, key personnel, headcount census, retention risk, hiring plan.                   |',
  '| 08  | Corporate IT                | Enterprise systems, internal tools, endpoint management, identity providers, IT operations. |',
  '| 09  | Governance & Compliance     | Certifications, audit reports, data-privacy controls, regulatory correspondence, licensing. |',
].join('\n');

/**
 * The workbook column contract (BL-120 / ADR-0015): the canonical rule for
 * composing a markdown IRL body from a filled `.xlsx`. Both the model
 * reconstruction path and the operator-side `npm run irl:extract` script
 * render this same bullet shape — the script's header comments point here.
 */
export const WORKBOOK_COLUMN_CONTRACT = [
  '## IRL workbook column contract (READ FIRST if you are reconstructing from an attached .xlsx)',
  '',
  'Skip this section when the IRL you have is already markdown — it is already in the shape described here. It governs the case where you are reading a `.xlsx` attachment and writing the body yourself.',
  '',
  'The workbook has **seven** columns:',
  '',
  '| A | B | C | D | E | F | G |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  '| Reference | Request | Status | File Location | Comments | Notes | Response |',
  '',
  "**Trust the header row of the data sheet. Do NOT trust the Instructions sheet** — workbooks in the wild predate the current generator, and at least one documents a five-column layout with Response in column D. Following it would publish source-document filenames as the recipient's answers.",
  '',
  '**D, E and F carry authored content, not metadata.** GST pre-populates research into **Comments (E)**, source pointers into **File Location (D)** and caveats into **Notes (F)**; the recipient confirms by setting Status. On real workbooks Comments frequently holds *the answer* while Response (G) is empty — treat Comments as an answer, not as a side channel.',
  '',
  '**Compose each filled row as ONE bullet, in exactly this shape:**',
  '',
  '```',
  '- <ref> <request> [<STATUS>] — <answer> (Source: <D>) (Note: <F>)',
  '```',
  '',
  '- `<answer>` is **G and E joined into one contiguous span, G first**. The separator is a single space; **add a period after G unless G already ends in `.` `?` `!` `:` `;` `,` `…` or a dash — test the LAST character after peeling off any closing brackets and quotes.** So a G already terminated gets no second terminator; a G ending in a comma reads `foo, bar` rather than `foo,. bar`, including when a closing quote follows the comma; and a G ending in a unit or symbol (`14%`, `$4.15M +`) still gets its period. **Do not label the two halves.** A label between them injects a token into the middle of every citation that reads across the boundary, dropping the provenance matcher below its contiguous-run floor and marking faithful citations unverified.',
  '- `(Source:)` and `(Note:)` append only when D / F are non-empty, each preceded by one space. They stay **outside** the answer slot.',
  '- All four content columns empty → `— <NO RESPONSE>`. **D or F present with no answer → `— <NO RESPONSE> (Source: …)`** — a row whose only content is a filename is NOT answered.',
  '- Status passes through verbatim (`OPEN` / `PARTIAL` / `CLOSED`); an **empty** Status reads as `OPEN`. Status does **not** gate inclusion: an OPEN row carrying content still contributes its content.',
  '- Trim every cell. Newlines INSIDE a cell survive, so a multi-line Comments value can push `(Source: …)` onto its own visual line — that is expected, not a rendering bug to work around.',
  '- Section header rows and section intros are omitted from the bullet stream entirely.',
  '',
  'One difference from the operator-side `npm run irl:extract`, which renders this same shape: that script also emits an H1 title and a `> Engagement context:` / `> Generated:` / `> Canonical reference:` preamble. Those are a strict superset — non-citation content that no verification reads. **The two paths agree at the bullet level**, which is the level every citation, gate and ratio operates on.',
  '',
  '**Citation hygiene (audit rule, not style): cite from the answer slot only — never from `(Source:)` or `(Note:)`.** Both are inside the body the verifier matches against, so a claim citing a VDR path or a note tail **will verify and will NOT raise a `provenance-gap:`** — presenting the dossier as anchored on a filename. The verifier cannot catch this for you; you are the control. Also avoid quoting an em-dash that appears inside a Note: the excerpt extractor anchors on the LAST em-dash in a citation, so the citation collapses to the note tail.',
].join('\n');

// ─── V2 rule variants (trust-the-operator posture, gst_irl_sweep) ───────
//
// The V1 constants above are byte-pinned by the old prompt's body-hash
// suite and cannot change in place during the coexistence window. Each V2
// keeps the ENGINE-MATH content of its V1 verbatim in meaning and drops
// only the provenance-apparatus phrasing (provenance footers, `_audit`
// wire shapes). PR2 deletes the V1s and de-suffixes these.

/**
 * V2 of `UNKNOWN_PROPAGATION_RULE`: identical tiering / section-mapping /
 * currency / headcount / dataSensitivity / transformationState content;
 * every "cite … in the provenance footer" becomes an inline citation
 * instruction (the new prompt has no provenance footer).
 */
export const UNKNOWN_PROPAGATION_RULE_V2 = [
  'Because the IRL is filled, derive concrete values wherever the bullets support it.',
  '',
  '**Extraction discipline — three confidence tiers, ordered by directness of evidence**:',
  '',
  '- **Tier 1 (literal)**: the IRL bullet states the enum value verbatim — use it.',
  '- **Tier 2 (direct one-step derivation)**: the IRL bullet contains the specific data that uniquely maps to one enum value (e.g., "Geographies: US (~88%), EU (~12%)" → `geographies: [US, EU]`; "ARR $45.2M Q1-FY26 annualized" + a known revenueRange schema → the bracket the value falls in; "Engagement context: buy-side review on behalf of a strategic investor" → `transactionType: buy-side`) — use the value and name the source Section/row inline where the dossier states it.',
  "- **Tier 3 (correlation / vibes)**: the IRL bullet correlates with an enum value but does NOT determine it — pass `'unknown'`.",
  '',
  "Map IRL sections to dimensions: Section 00 → transactionType (engagement-context bullet), revenueRange (ARR bullet), growthStage (growth-rate bullet), companyAge (founding year), headcount (engineering-FTE bullet), geographies (geographies bullet); Section 01 → productType, scaleIntensity (only if IRL literally uses 'low'/'moderate'/'high' — that's Tier 1); Section 02 → techArchetype; Section 05/09 → dataSensitivity. Each is Tier-2-or-better when the IRL bullet contains the specific signal; otherwise pass `'unknown'`.",
  '',
  "**For `businessModel` and `operatingModel`**: default to `'unknown'` unless the IRL uses one of the enum values literally (Tier 1) OR provides direct evidence that uniquely maps (Tier 2).",
  '',
  '**Currency normalization (BLOCKING — applies BEFORE any bracketed-monetary dimension is assigned)**: every monetary bullet in a non-USD currency MUST be converted to USD before bracket assignment, and the dossier states the conversion inline where the figure is used. Worked example — an IRL bullet "Implied ARR run-rate ~$31M CAD" converts as `$31M CAD × 0.73 USD/CAD ≈ $22.6M USD ⇒ revenueRange: 5-25m`. Worked example — EUR shape: "ARR €18M FY26" converts as `€18M × 1.08 USD/EUR ≈ $19.4M USD ⇒ revenueRange: 5-25m`. Worked example — GBP shape: same form. If the converted value lands within 10% of a bracket boundary (e.g., USD $23-27M against the 25m boundary), pass `\'unknown\'` and surface the currency / conversion question in the Gaps & assumptions list — bracket misassignment compounds downstream so prefer `\'unknown\'` to a fragile commitment. **Treating a non-USD bullet as if it were USD is the most common bracketing error in real-world runs — do NOT skip this step.**',
  '',
  '**`headcount` scope (BLOCKING — applies to the `generate_diligence_agenda` `headcount` field)**: "engineering headcount" means engineering ICs + engineering management ONLY. It EXCLUDES product managers, designers, and standalone QA UNLESS QA reports into engineering. Worked example: IRL Section 02 bullet "Engineering ~42: Development team 33 ... Infra/DevOps/DBA 9. Product ~6. ~15 of 48 R&D+Product are contractors" → use 42 (Eng-only), NOT 48 (R&D+Product), and state the distinction inline where the headcount is used (`headcount ← Section 02: Engineering 42; Product 6 excluded`). When the IRL distinguishes "engineering ~N1" from "R&D + Product ~N2" or similar, N1 is always the right input. **Lumping product/design into engineering headcount mis-routes the agenda to higher-tier probes — do NOT skip this distinction.**',
  '',
  '**`dataSensitivity` bucket boundaries (Tier 2 guidance)**: the enum is `low` / `moderate` / `high`. Bucket boundaries:',
  '- **`low`**: employee PII only (names, schedules, wages, performance, HR-IDs) and/or operational metadata + telemetry; no regulated category; no customer/shopper PII at scale; no PHI; no PCI card data; no government-classified data.',
  '- **`moderate`**: customer/shopper PII at scale; financial-transaction metadata (not card numbers); employee PII combined with customer PII at scale; non-card financial data.',
  '- **`high`**: PHI (HIPAA-regulated); PCI card data; regulated-health beyond HIPAA; government-classified; large-scale identifiable consumer financial data; biometric data at scale.',
  '',
  'Worked example: "Employee PII (associate names, schedules, wages, performance). Store operational + sales/KPI data (not personal). No customer/shopper PII; no PHI" → `dataSensitivity: low` (employee PII alone is `low`; the threshold to `moderate` requires customer/shopper PII at scale). State the bucket choice inline where it is used.',
  '',
  '**`transformationState` tie-break** between `mid-migration` and `actively-modernizing` when both fit the IRL evidence: prefer `mid-migration` when the IRL names a specific cutover date with parallel legacy + new operation during a window (e.g., "new clients on platform B from August; legacy clients migrate from January"); prefer `actively-modernizing` when the IRL describes broader transformation work without a single migration spine (org reorg + tech reset + new product line in parallel). State the tie-break choice inline where it is used.',
  '',
  '**Named Tier-3 trap** (explicit anti-example — observed wrong in past engagements): do NOT map a present-tense capability statement (e.g., "cloud-native", "AI-powered") → `transformationState: actively-modernizing` — present-tense capability ≠ in-flight change. `transformationState` maps LITERALLY to `actively-modernizing` only when Section 02 or 04 names a specific in-flight rewrite (e.g., "denial-appeals rewrite Q1-Q3 FY26"); otherwise pass `\'unknown\'`.',
].join('\n');

/**
 * V2 of `TECHPAR_MODE_RULE`: keeps always-`deepdive`, the `rdOpEx: 0`
 * escape and its rationale, the Section-04-remediation anti-mapping, and
 * the blank-component gap-list rule; drops the `_audit.rdOpEx` wire-shape
 * passage (`_audit` is gone from the new prompt's calls).
 */
export const TECHPAR_MODE_RULE_V2 =
  '**Run `compute_techpar` in `mode: "deepdive"`. Always.** This is not a judgement call: `deepdive` synthesizes R&D OpEx from `engCost + prodCost + toolingCost`, and IRL Section 02 asks the target for the product-personnel and tooling components directly while `engCost` derives from its FTE breakdown against the Section 07 salary band. `quick` instead takes `rdOpEx` as a direct input, and **no IRL bullet anywhere asks for a total R&D OpEx figure** — so in `quick` mode that required input has no source and gets improvised, which is what produced a 1.9x swing and an inverted zone verdict across two runs of the same IRL. **Wire shape under `deepdive`: pass `rdOpEx: 0`** — the field is required by the schema but the engine discards it in this mode; do not compute a real figure for it. In particular do NOT source it from the Section 04 technical-debt remediation figure: that bullet feeds the Tech Debt Calculator input `remediationBudget`, a different tool, and routing it here has already happened once. **If a Section-02 COMPONENT bullet (`engCost` / `prodCost` / `toolingCost`) is blank or `n/a`**, pass 0 for that component and say so explicitly in the Gaps & assumptions list — name the component, the Section 02 bullet that would have answered it, and the consequence, which is that a zeroed component understates total technology cost and moves the zone verdict in the flattering direction.';

/**
 * V2 of `MTTR_P1_RULE`: keeps P1 selection, the null-when-OPEN guard, and
 * the monthly incident conversion; drops the provenance-line sentence
 * (the gap-list surfacing sentence carries the disclosure instead).
 */
export const MTTR_P1_RULE_V2 =
  '**MTTR input — use P1 (the workhorse number):** if Section 04 lists MTTR separately for P0 and P1 (e.g., "Mean time to resolution P0 2.4h, P1 7.8h"), pass the P1 value to the tool. P0s are rare (typically one or two per year at this scale); P1s drive the steady-state incident-carrying cost the model is computing. **Do NOT use the P0 number, do NOT use a midpoint, do NOT use an average** — the engine multiplies MTTR × incidents linearly, so picking the wrong scalar understates carrying cost by the full ratio (P1/P0 ≈ 3× for typical operations). **MTTR-unfilled guard (BLOCKING)**: if Section 04 lists no MTTR value, marks MTTR as OPEN, or says "not yet tracked" / "n/a" — DO NOT substitute a placeholder (24h, 8h, or any arbitrary anchor). Pass `mttrHours: null`; the tool elides the field and returns it in `extractionOnly`, and the dossier marks the Tech Debt section extraction-only for that field. Surface the missing MTTR in the Gaps & assumptions list as a target follow-up (e.g., "Pull 24-month JQL for client-incident MTTR over the period; replace the omitted-field marker once available"). **A fabricated MTTR value passes through the engine\'s linear multiplier and produces an unrecoverable false carrying-cost number — do NOT do this.** **Incident frequency input:** use the most recent quarterly count from the trend, converted to monthly. If Section 04 shows a declining trend (e.g., "FY24-Q1 8 incidents... FY25-Q4 4 incidents"), use the most-recent quarter\'s monthly equivalent (4/3 ≈ 1.3/month), not an inflated round number. **If incident counts are themselves OPEN/unfilled**, apply the same guard — pass null, mark extraction-only, surface in Gaps & assumptions.';

// ─── Shared prompt-body sections (trust-the-operator prompt family) ─────
//
// Composed sections both `gst_irl_sweep` and `gst_irl_extract` render.
// One copy here so the two prompts cannot drift on arrival trust, the
// advisory completeness arithmetic, or the gate predicates.

/**
 * The trust surface of the prompt family: use whichever arrival channel is
 * present, treat a bare form submission as a normal invocation, ask only
 * when nothing arrived. Stated in the BL-086 register — facts, no
 * do-not-ask imperatives (Kestrel trials 2-3 proved the imperative form
 * triggers the confirmation pause it tries to prevent).
 */
export const IRL_TRUSTED_ARRIVAL = [
  '**The populated IRL is whichever of these is present: the `filledIrl` argument (rendered at the end of this message when supplied), an attachment on this conversation, or a paste earlier in the thread. Use it as given — it is the input this workflow exists to consume.** If none is present, ask the user to paste it and stop until they do. If more than one candidate is present, name them and ask which to use rather than merging. The only rule: extract what the document states — do not invent rows or answers it does not contain.',
  '',
  "**A submission with no accompanying chat message is a normal invocation** — many clients send the populated form with no typed text, and some deliver the expansion as an attached file. The submission itself carries the operator's intent: the workflow stated in Run parameters is what they asked for.",
].join('\n');

/**
 * The advisory completeness check — the permissive successor to the old
 * blocking pre-flight. Same ratio arithmetic (so the operator-side
 * extractor and BL-140's conformance suite still reconcile against it);
 * only the truly-degenerate case halts.
 */
export const IRL_COMPLETENESS_CHECK = [
  '## Completeness check (advisory — compute it, state it, proceed)',
  '',
  'Before extracting, compute the fill ratio over the **10 canonical sections (00–09)** — engagement-specific sections 10/11 do not count:',
  '',
  '- `totalResponseCells` = all request rows present (ref-tagged `0-01` … `9-NN`).',
  '- `substantiveCells` = rows whose ANSWER SLOT (Response + Comments joined, per the workbook column contract) carries substantive content. Blank, `n/a`, `not yet tracked`, `TBD`, `--`, `<NO RESPONSE>`, or a bare `(Source:)`/`(Note:)` pointer is not substantive.',
  '- `fillRatio = substantiveCells / totalResponseCells`, stated as a rounded percentage.',
  '',
  '**Halt ONLY if `substantiveCells` is 0 or the ratio is below 5%** — that is the blank request template, not a filled IRL; say so and ask the user to confirm before proceeding. **Otherwise ALWAYS proceed**, whatever the ratio: state it at the top of your output, and list the thin or empty sections in (J) Gaps & assumptions. A sparse IRL produces a sparse output with an honest gap list — that is the correct result, not an error.',
].join('\n');

/**
 * The inclusion gates — kept from the retired ingestion prompt because
 * they encode ENGINE behavior (null returns, honest-widening sentinels),
 * not distrust. Predicates unchanged.
 */
export const IRL_INCLUSION_GATES = [
  '## Inclusion gates (which tools apply)',
  '',
  '"Signal" means a substantive answer in a row\'s ANSWER SLOT — a `(Source: file.xlsx)` pointer or a `(Note: pending)` caveat is a promise of signal, not signal. A gate that failed means: skip that tool (its invocation or its payload, whichever this run produces), skip its output section, and add one line to (J) naming the failed predicate and the IRL section that would have satisfied it.',
  '',
  '1. **`generate_diligence_agenda`** — always applies. Every dimension honestly defaults to `unknown`; the agenda is useful as a known-vs-not inventory.',
  '2. **`compute_techpar`** — applies if (§00 ARR is substantive) AND (§02 carries engineering-cost signal OR §03 carries hosting signal). The engine returns null when `arr` or `infraHostingAnnual` is zero, so the gate needs both a denominator and a numerator. §07 salary refines accuracy but does not open the gate alone.',
  '3. **`assess_infrastructure_cost_governance`** — always applies. Every unseeded answer falls back honestly (see the seeding rules).',
  '4. **`estimate_tech_debt_cost`** — applies if §04 has at least one row with a substantive answer. §04 is the canonical input section; computing a dollar carrying-cost from a section that states nothing would fabricate the headline number.',
  '5. **`search_regulations`** — applies if (§09 names at least one framework) OR (a conditional trigger below fires).',
  '6. **`search_portfolio`** — applies if §00 supplies a product-type-like answer OR §01 supplies an industry / competitive-landscape answer.',
  '7. **`search_radar`** — always applies; its output is supplementary market context.',
  '8. **`list_portfolio_facets`** — inherits from `search_portfolio` (called first, to obtain canonical facet values).',
  '9. **`list_regulation_facets`** — inherits from `search_regulations` (same).',
  '',
  '**Conditional regulatory triggers** (gap-fills for a §09 the partner left thin):',
  '',
  `- ${EU_AI_ACT_CONDITIONAL_TRIGGER}`,
  `- ${NIS2_CONDITIONAL_TRIGGER}`,
].join('\n');

/** The engine-math rules, composed under one heading — v2 forms. */
export const IRL_EXTRACTION_RULES_SECTION = [
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

/**
 * Aggregate object — convenient re-export for callers that want to spread the
 * rules into a template literal map. Each value is a verbatim reference to
 * the matching named export above.
 */
export const EXTRACTION_RULES = {
  UNKNOWN_PROPAGATION_RULE,
  TECHPAR_MODE_RULE,
  EU_AI_ACT_CONDITIONAL_TRIGGER,
  NIS2_CONDITIONAL_TRIGGER,
  ENG_COST_DEDUP_RULE,
  ICG_SEEDING_RULES,
  MTTR_P1_RULE,
} as const;
