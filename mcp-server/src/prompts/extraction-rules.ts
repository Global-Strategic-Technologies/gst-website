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
 * See: src/docs/development/MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md
 *      § Pre-implementation refactor.
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
 * walkthrough — PRAXIS-IRL-StoreForce_JLIVET.xlsx):
 *   (a) Currency normalization for bracketed dimensions (revenueRange);
 *   (b) `transformationState` tie-break between `mid-migration` and
 *       `actively-modernizing` when both fit;
 *   (c) `headcount` scope clarification (engineering ICs + management,
 *       excludes product/design/standalone-QA unless reporting into eng).
 *
 * **Second pass — b2b-saas anti-example retired** (PR B, 2026-06-02,
 * StoreForce walkthrough finding #9): the `b2b-saas → productized-platform`
 * forbidden mapping from sweep v0.0.4 was overcautious. The canonical B2B
 * SaaS pattern (packaged product + recurring subscription + per-seat or
 * per-location pricing) IS a productized platform; forcing `'unknown'`
 * here is exactly the `'unknown'`-bloat the recalibration was meant to
 * prevent. Anti-example removed. Reviewer retained the cloud-native
 * trap (still defensible — capability != in-flight change).
 *
 * **Third pass — v3 calibration tightening** (PR B, 2026-06-02,
 * StoreForce live-run grading against Claude Desktop): the v2 currency
 * + headcount clauses were buried mid-paragraph and the model skimmed
 * past them — Claude treated `$31M CAD` as if it were USD (→ wrong
 * bracket) and used `R&D + Product ~48` instead of `Eng ~42` for
 * headcount. Restructured each clause onto its own line and led with
 * the StoreForce-shape worked example, mirroring how the Tier 1/2/3
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
  '**Currency normalization (BLOCKING — applies BEFORE any bracketed-monetary dimension is assigned)**: every monetary bullet in a non-USD currency MUST be converted to USD before bracket assignment, and the provenance footer MUST cite the conversion. Worked example — StoreForce shape: an IRL bullet "Implied ARR run-rate ~$31M CAD" converts as `$31M CAD × 0.73 USD/CAD ≈ $22.6M USD ⇒ revenueRange: 5-25m`. Worked example — EUR shape: "ARR €18M FY26" converts as `€18M × 1.08 USD/EUR ≈ $19.4M USD ⇒ revenueRange: 5-25m`. Worked example — GBP shape: same form. If the converted value lands within 10% of a bracket boundary (e.g., USD $23-27M against the 25m boundary), pass `\'unknown\'` and surface the currency / conversion question in the (J) gap list — bracket misassignment compounds downstream so prefer `\'unknown\'` to a fragile commitment. **Treating a non-USD bullet as if it were USD is the most common bracketing error in real-world runs — do NOT skip this step.**',
  '',
  '**`headcount` scope (BLOCKING — applies to the `generate_diligence_agenda` `headcount` field)**: "engineering headcount" means engineering ICs + engineering management ONLY. It EXCLUDES product managers, designers, and standalone QA UNLESS QA reports into engineering. Worked example — StoreForce shape: IRL Section 02 bullet "Engineering ~42: Development team 33 ... Infra/DevOps/DBA 9. Product ~6. ~15 of 48 R&D+Product are contractors" → use 42 (Eng-only), NOT 48 (R&D+Product), and cite the distinction in the provenance footer (`headcount ← Section 02: Engineering 42 (Dev 33 + Infra 9); Product 6 excluded`). When the IRL distinguishes "engineering ~N1" from "R&D + Product ~N2" or similar, N1 is always the right input. **Lumping product/design into engineering headcount mis-routes the agenda to higher-tier probes — do NOT skip this distinction.**',
  '',
  '**`dataSensitivity` bucket boundaries (Tier 2 guidance)**: the enum is `low` / `moderate` / `high`. Bucket boundaries:',
  '- **`low`**: employee PII only (names, schedules, wages, performance, HR-IDs) and/or operational metadata + telemetry; no regulated category; no customer/shopper PII at scale; no PHI; no PCI card data; no government-classified data.',
  '- **`moderate`**: customer/shopper PII at scale; financial-transaction metadata (not card numbers); employee PII combined with customer PII at scale; non-card financial data.',
  '- **`high`**: PHI (HIPAA-regulated); PCI card data; regulated-health beyond HIPAA; government-classified; large-scale identifiable consumer financial data; biometric data at scale.',
  '',
  'Worked example — StoreForce shape: "Employee PII (associate names, schedules, wages, performance). Store operational + sales/KPI data (not personal). No customer/shopper PII; no PHI" → `dataSensitivity: low` (employee PII alone is `low`; the threshold to `moderate` requires customer/shopper PII at scale). Cite the bucket choice in the provenance footer.',
  '',
  '**`transformationState` tie-break** between `mid-migration` and `actively-modernizing` when both fit the IRL evidence: prefer `mid-migration` when the IRL names a specific cutover date with parallel legacy + new operation during a window (e.g., "new clients on platform B from August; legacy clients migrate from January"); prefer `actively-modernizing` when the IRL describes broader transformation work without a single migration spine (org reorg + tech reset + new product line in parallel). Cite the tie-break choice in the provenance footer.',
  '',
  '**Named Tier-3 trap** (explicit anti-example — observed wrong in past engagements): do NOT map a present-tense capability statement (e.g., "cloud-native", "AI-powered") → `transformationState: actively-modernizing` — present-tense capability ≠ in-flight change. `transformationState` maps LITERALLY to `actively-modernizing` only when Section 02 or 04 names a specific in-flight rewrite (e.g., "denial-appeals rewrite Q1-Q3 FY26"); otherwise pass `\'unknown\'`.',
].join('\n');

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

/**
 * Aggregate object — convenient re-export for callers that want to spread the
 * rules into a template literal map. Each value is a verbatim reference to
 * the matching named export above.
 */
export const EXTRACTION_RULES = {
  UNKNOWN_PROPAGATION_RULE,
  EU_AI_ACT_CONDITIONAL_TRIGGER,
  NIS2_CONDITIONAL_TRIGGER,
  ENG_COST_DEDUP_RULE,
  ICG_SEEDING_RULES,
  MTTR_P1_RULE,
} as const;
