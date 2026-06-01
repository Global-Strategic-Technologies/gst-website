/**
 * Shared IRL-extraction rule constants — load-bearing prose extracted from
 * `gst_diligence_sweep` so it can be reused by future ingestion-style
 * prompts (BL-045 PR B will rename sweep to `gst_irl_ingestion` and import
 * these constants directly).
 *
 * Each constant is the rule sentence(s) without sweep-specific orchestration
 * framing ("Step N — Invoke `X`…", "Surface the resulting `deeplink`…").
 * The sweep body interpolates each constant between its orchestration
 * opener and closer. JSDoc above each constant cites the
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
 * input dimensions. Strict propagation of the `'unknown'` sentinel; named
 * anti-inference anti-examples (`productized-platform`, `product-aligned-teams`)
 * that the diligence tool's USAGE RULE forbids.
 */
export const UNKNOWN_PROPAGATION_RULE =
  "Because the IRL is filled, you should be able to derive concrete values for many dimensions — but the tool's USAGE RULE on the `'unknown'` sentinel is strict and indirect inference is forbidden. **A dimension passes a literal value ONLY IF the IRL directly states it or maps one-to-one from the IRL text; otherwise pass `'unknown'`.** Map IRL sections to dimensions: Section 00 → transactionType (from engagement-context bullet), revenueRange (from ARR bullet), growthStage (from growth-rate bullet), companyAge (from founding year), headcount (from total-headcount bullet), geographies (from geographies bullet); Section 01 → productType, scaleIntensity (only if IRL literally uses 'low'/'moderate'/'high'); Section 02 → techArchetype; Section 05/09 → dataSensitivity. **For `businessModel` and `operatingModel`: default to `'unknown'` unless the IRL uses one of the enum values literally.** Specifically: do NOT map `productType: b2b-saas` → `businessModel: productized-platform` (forbidden — many B2B SaaS are usage-based or services-led; the IRL bullet \"B2B SaaS multi-year subscription with per-claim transactional uplift\" is mixed-model and should pass `'unknown'` unless the partner confirms). Do NOT map \"squad model\" → `operatingModel: product-aligned-teams` (forbidden — \"squad\" is a colloquialism, not a one-to-one enum mapping; the tool's USAGE RULE says \"do NOT infer operatingModel from anything\"). For `transformationState`: if Section 02 or 04 names an in-flight rewrite of a specific service (\"denial-appeals rewrite Q1-Q3 FY26\"), that maps LITERALLY to `actively-modernizing`; if the IRL is silent, pass `'unknown'`.";

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
  '**MTTR input — use P1 (the workhorse number):** if Section 04 lists MTTR separately for P0 and P1 (e.g., "Mean time to resolution P0 2.4h, P1 7.8h"), pass the P1 value to the tool. P0s are rare (typically one or two per year at this scale); P1s drive the steady-state incident-carrying cost the model is computing. **Do NOT use the P0 number, do NOT use a midpoint, do NOT use an average** — the engine multiplies MTTR × incidents linearly, so picking the wrong scalar understates carrying cost by the full ratio (P1/P0 ≈ 3× for typical operations). **Incident frequency input:** use the most recent quarterly count from the trend, converted to monthly. If Section 04 shows a declining trend (e.g., "FY24-Q1 8 incidents... FY25-Q4 4 incidents"), use the most-recent quarter\'s monthly equivalent (4/3 ≈ 1.3/month), not an inflated round number.';

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
