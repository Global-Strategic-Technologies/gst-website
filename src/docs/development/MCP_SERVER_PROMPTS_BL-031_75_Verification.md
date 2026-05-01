# BL-031.75 Verification Punch-List (V1–V8)

> **Status**: Open · **Started**: 2026-05-01 · **Owner**: senior consultant (the user) — this is the binding AC gate for BL-031.75 closure.
>
> **Architecture & punch-list spec**: [`MCP_SERVER_PROMPTS_BL-031_75.md` § Verification punch-list (V1–V8 — one per prompt)](MCP_SERVER_PROMPTS_BL-031_75.md#verification-punch-list-v1v8--one-per-prompt). The architecture doc is the source of truth for what each V<n> verifies; this doc is the working surface where evidence is captured **before being migrated** to the durable home.
>
> **End state** (lesson learned BL-031.5):
>
> - Recorded outputs migrate into `mcp-server/README.md` § "Last verified (BL-031.75 surface)" (≤ 6 lines per prompt) and the corresponding `mcp-server/tests/examples/<slug>.golden.md` (full input + expanded body + model output).
> - Once V1–V8 are recorded and the senior consultant has signed off, this doc is **deleted** in the closure commit. Doc history reachable via `git log`.
> - Two AC items in [`BACKLOG.md` § BL-031.75](BACKLOG.md#bl-03175-mcp-server--consultant-prompt-library) are gated on this doc:
>   - Golden-output snapshots per prompt — populated during V1–V8.
>   - Senior-consultant review gate.
>
> Mirrors the BL-031.5 V1–V7 closure (commit `1ad2ba5`).

---

## Prerequisites (one-time, before V1)

- [ ] **0.1 — Working tree clean.** `git status` shows no uncommitted changes on `feature-mcp1`. The five BL-031.75 commits are present (`cadb2fb` → `e095f50`).
- [ ] **0.2 — `mcp-server` built.** `npm -w @gst/mcp-server run build` from repo root. Output reports `[gst-mcp] built dist/index.js (v0.0.1)`. The wire-protocol version is 0.0.1 per the pre-commit chore.
- [ ] **0.3 — Tests green.** `npm -w @gst/mcp-server run test` reports `172 passed`. Repo-root `npx astro check && npm run lint && npm run lint:css && npm run test:run` all green.
- [ ] **0.4 — Claude Desktop configured.** `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) / `%APPDATA%\Claude\claude_desktop_config.json` (Windows) registers the GST MCP server pointing at `<repo>/mcp-server/dist/index.js`. See [`mcp-server/README.md` § Configure clients → Claude Desktop](../../../mcp-server/README.md#claude-desktop) for the exact JSON snippet.
- [ ] **0.5 — Restart Claude Desktop.** Quit fully, relaunch. The MCP indicator should show "gst" as connected.
- [ ] **0.6 — Connection sanity.** Open the connectors UX in Claude Desktop and confirm the GST server lists 9 Tools, 128 Resources, **8 Prompts** (the new surface). The eight prompts should appear in the slash-menu picker when you type `/` in chat — names start with `gst_`.
- [ ] **0.7 — Radar cache seeded.** From repo root: `npm run radar:seed`. The `.cache/inoreader/` directory must exist before V7 runs (one of V7's trials deliberately deletes it; seed first).

If any prereq fails: fix before proceeding. Server-boot failures usually surface at the `assertPromptInvariants` check in `_registry.ts` — read the thrown message and fix the offender.

---

## ⚠ V1 was run on 2026-05-01 (pre-Commit-5) and surfaced three findings

The first V1 invocation succeeded as a proof of the full prompt path (slash menu → server → schema → build → model → deliverable) but the model's deliverable was degraded by two architectural gaps and one downstream effect:

1. **Resources not model-fetchable** — model couldn't read `gst://library/vdr-structure`, fell back to a generic PE-diligence VDR taxonomy. Fixed in Commit 5 via `EmbeddedResource` content blocks.
2. **Prompt expansion read as "uploaded document"** — model hedged about prompt provenance before proceeding. Fixed in Commit 5 via standardized authorial-intent leading line in every prompt body.
3. **VDR taxonomy substituted** — downstream effect of #1; resolves once Commit 5's embeds land.

Wire-shape fix (`arrayFromWire` / `numberFromWire`) shipped in `c88b598` was also part of getting V1 attachable in the first place. Restart your client (kill orphaned `node ./mcp-server/dist/index.js` processes; reload VSCode / quit-relaunch Desktop) so the fresh `dist/index.js` from Commit 5 is loaded.

**V1 must be re-run** against Commit 5's binary to verify (a) the embedded VDR Library article is used verbatim (no fallback substitution), and (b) the model proceeds without the prompt-provenance hedge.

---

## V1 — `gst_diligence_kickoff`

**Procedure**

1. In Claude Desktop, type `/` to open the slash-menu. Select `gst_diligence_kickoff`.
2. Fill the form with a real or representative target. Required fields: `targetName` + the 13 `UserInputs` enums + `geographies` array.
3. Submit. Observe the model: it should call `generate_diligence_agenda` exactly once, then reference `gst://library/vdr-structure` (either by reading it or by naming it in the output).

**Pass criteria**

- [x] Memo has 4 sections: target context, prioritized agenda, attention areas, suggested VDR requests.
- [x] `generate_diligence_agenda` is called once.
- [x] `gst://library/vdr-structure` is referenced (canonical 9-folder taxonomy used verbatim — folder labels `02 — Software Architecture` through `09 — Governance & Compliance` appear in the output).
- [x] Senior-consultant sign-off: "reads as if I wrote it." (recorded 2026-05-01 against the Commit-5 binary; first invocation against the pre-Commit-5 binary on the same day surfaced findings 1–3 documented in the architecture doc § Deviations and resolved before sign-off).

**Evidence (recorded 2026-05-01 against `dist/index.js` v0.0.1 @ 466.2 KB after Commit `4313d9c`)**

<details>
<summary>V1 input args</summary>

```json
{
  "targetName": "Helios Health",
  "transactionType": "majority-stake",
  "productType": "b2b-saas",
  "techArchetype": "modern-cloud-native",
  "headcount": "51-200",
  "revenueRange": "25-100m",
  "growthStage": "scaling",
  "companyAge": "5-10yr",
  "geographies": ["us", "eu"],
  "businessModel": "productized-platform",
  "scaleIntensity": "moderate",
  "transformationState": "mid-migration",
  "dataSensitivity": "high",
  "operatingModel": "product-aligned-teams"
}
```

(Helios Health is a fictional B2B healthtech SaaS target; the schema-valid payload covers every UserInputs field. `geographies` parsed correctly via `arrayFromWire` from Commit `c88b598`.)

</details>

<details>
<summary>V1 model output (post-Commit-5 — embedded VDR Library article + authorial-intent line both verified)</summary>

```
I'll execute this workflow. Let me start by loading the diligence agenda tool.

Now I have the agenda data and the canonical VDR taxonomy. Drafting the kickoff memo.

---

# Helios Health — Diligence Kickoff Memo

**Engagement:** Majority-stake investment, technology diligence
**Prepared by:** Global Strategic Technologies
**Date:** May 1, 2026

---

## 1. Target context

Helios Health is a B2B SaaS productized platform, 5–10 years old, scaling-stage, with $25–100M revenue and 51–200 headcount across product-aligned teams. Modern cloud-native stack, currently mid-migration. US/EU operating footprint with high data sensitivity. The transaction is a majority-stake investment, so diligence is calibrated to operating leverage, structural scalability, and governance handoff — not full carve-out separation. Three deal-shaping conditions converge: (a) an in-flight migration during a scaling window, (b) high-sensitivity data under dual US/EU regulatory regimes, and (c) a B2B SaaS moat thesis that must hold up against AI-platform commoditization.

## 2. Prioritized agenda by topic

**Architecture (CTO / VP Engineering)**
1. Migration risk profile — timeline, stage gates, rollback per stage.
2. System decomposition — monolith vs. service-oriented; deployment coupling as a velocity signal.
3. DR/BC architecture — documented RPO/RTO, validation through testing.
4. Database scaling headroom — replicas, sharding, time to next scaling event.
5. Tenancy model — single vs. multi-tenant; cost/timeline if migration is required.
6. IaC maturity — full production reproducibility from version control.
7. SLA adherence history and current performance bottlenecks.

**Operations & Delivery (VP Engineering)**
1. CI/CD cycle time, manual intervention rate.
2. Key-person dependencies per major subsystem.
3. Last end-to-end DR test — actual recovery time vs. target.
4. Deployment frequency, rollback success rate, rollback duration.
5. On-call structure, MTTD/MTTR for P1 incidents.

**Security, Compliance & Governance (CISO)**
1. Compliance certifications — SOC 2, ISO 27001 — last audit, material findings.
2. GDPR posture — DPAs with sub-processors, DSR fulfillment process.
3. Secrets and credential management.
4. Security incident history — root causes, blast radius, systemic remediation.
5. EU AI Act posture — risk classification, conformity assessment plan.
6. Data classification framework — segmentation, encryption, access control by sensitivity tier.

**Carve-out / Integration (M&A Lead)**
1. Regulatory certification transferability across US/EU.
2. Duplicate-system rationalization plan with the sponsor's portfolio.

## 3. Attention areas

- **Mid-migration instability.** Dual-run architectures, partial data cutovers, and split team expertise compound during scaling. Budget 20–30% contingency on migration timelines and stabilization.
- **Cross-border data compliance.** US/EU footprint puts GDPR, transfer mechanisms, and emerging EU AI Act obligations directly on the critical path. Non-compliance is a market-access blocker, not just a fine risk.
- **AI commodity risk (moat erosion).** Validate that defensibility comes from proprietary data, workflow lock-in, or distribution — not from a foundation-model API that the platform is effectively reselling.
- **Sensitive data breach liability.** High-sensitivity data at this revenue scale typically outpaces breach preparedness. Cyber insurance adequacy, incident response testing, and pen test currency need direct validation.
- **Data classification maturity gap.** Scaling headcount under high data sensitivity routinely creates an informal-governance window. Inventory completeness, access audit trails, and offboarding rigor are the leading indicators.

## 4. Suggested VDR requests

Folder labels are taken verbatim from the GST Library VDR taxonomy.

**Architecture / Migration → 02 — Software Architecture**
1. C4-style system architecture diagrams (context, container, component) with the post-migration target state called out.
2. Migration plan with stage gates, rollback procedures per stage, and current schedule vs. baseline.

**DR/BC → 03 — Infrastructure & Operations**
1. Documented RPO/RTO targets by service tier, with the most recent end-to-end DR test report (actuals vs. targets).
2. Cloud architecture diagram showing multi-AZ/multi-region posture and identified single points of failure.

**CI/CD and engineering velocity → 04 — SDLC**
1. CI/CD pipeline overview with cycle time (commit → prod) and manual-step inventory over the last 90 days.
2. Deployment frequency, change failure rate, and rollback log for the trailing two quarters.

**Database scaling and capacity → 03 — Infrastructure & Operations**
1. Database engine inventory, replication topology, and current utilization vs. scaling triggers.
2. Capacity planning model with the next anticipated scaling event and headroom assumptions.

**Tenancy and platform economics → 02 — Software Architecture**
1. Tenancy model documentation; if single-tenant, a cost and timeline estimate to multi-tenant.
2. Per-customer infrastructure cost analysis for the top 10 accounts.

**Compliance certifications → 09 — Governance & Compliance**
1. Most recent SOC 2 Type II and ISO 27001 reports (or equivalents) with remediation status on all findings.
2. Audit trail of certification scope changes over the last 24 months.

**GDPR and cross-border data → 09 — Governance & Compliance**
1. Sub-processor register with executed DPAs and current transfer mechanisms (SCCs, adequacy reliance).
2. DSR fulfillment process documentation with volume metrics for the trailing 12 months.

**EU AI Act readiness → 09 — Governance & Compliance**
1. Inventory of AI/ML use cases with EU AI Act risk classification per system.
2. Conformity assessment plan (or gap analysis) for any high-risk AI systems deployed in-product.

**Data classification and sensitive data handling → 06 — Security**
1. Data classification policy with examples of how PII/PHI/financial data is segmented, encrypted, and access-controlled vs. operational data.
2. Most recent access review report covering production data stores containing high-sensitivity data.

**Secrets management and security hygiene → 06 — Security**
1. Secrets management architecture (vault solution, rotation cadence, code-repo scanning results).
2. Most recent penetration test executive summary with remediation tracking.

**Security incident history → 06 — Security**
1. Incident log for the trailing 36 months with severity, root cause, blast radius, and systemic remediations.
2. Incident response runbook and most recent tabletop exercise output.

**Key-person dependency and team depth → 07 — People & Organization**
1. Subsystem ownership matrix showing engineers qualified to deploy, debug, and recover each major subsystem independently.
2. Org chart with tenure, retention-risk flags, and 12-month hiring plan.

**AI moat validation → 05 — Data, Analytics & AI**
1. Model inventory distinguishing proprietary models, fine-tuned third-party models, and pure API integrations — with associated unit economics.
2. Data assets that materially differentiate the product (proprietary datasets, customer-derived data, network effects).

**Duplicate-system rationalization → 08 — Corporate IT**
1. Enterprise application inventory with annual spend and renewal dates.
2. Identity/SSO architecture and provisioning workflows for integration sequencing with the sponsor's existing portfolio.
```

</details>

**Polish opportunities for V0.0.2** (deferred — not V1 blockers):

- Agenda density: model produced 7 / 5 / 6 / 2 numbered sub-items per topic. Bound by adding "3–5 prioritized items per topic" to the prompt body if subsequent V<n> outputs trend dense.
- Trigger-map provenance: the `generate_diligence_agenda` tool returns a `triggerMap` showing which input dimensions caused which questions to surface. The deliverable doesn't reference it. Add a footnote like _"Agenda surfaced from the following deal dimensions: …"_ if you want that audit trail visible to the deal team.

---

## ⚠ V2 was run on 2026-05-01 (pre-fix) and surfaced three findings

The first V2 invocation produced a substantively well-framed deliverable but the deep-links and ICG result were silently degraded by three architectural defects in the MCP layer:

1. **ICG deep-link landed on the wizard intro, not the results view.** Cause: `mcp-server/src/tools/icg.ts` constructed the encoded state with `currentStep: 0` (the page's landing view), so the link reproduced the inputs but never advanced past "Start assessment." Fixed by `buildResultsState()` helper that sets `currentStep: 7` (results view) — see `tests/unit/deeplinks/icg-deeplink.test.ts` for the regression guard.
2. **Regulatory Map deep-links did not select / expand the region's regulations.** Root cause: the page's `regionMap` is keyed by ISO 3166-1 alpha-3 for countries (`USA`, `GBR`, `CAN`) and uppercase ISO 3166-2 for subnational (`US-CA`, `CA-QC`), but MCP `entry.jurisdiction` arrives lowercase alpha-2 / lowercase subnational (`us`, `us-ca`). The selector `path[data-state-code="us-ca"]` never matched `data-state-code="US-CA"`, so `selectRegion` was never dispatched. Fixed by the new `jurisdictionToRegion()` helper in `mcp-server/src/tools/regulations.ts` that normalizes lowercase alpha-2 → uppercase alpha-3 (`us → USA`) and uppercases subnational codes (`us-ca → US-CA`); aggregate jurisdictions (`eu`, `global`) drop the `region=` param so only the category filter applies.
3. **`gst_target_quick_look` invoked ICG with flat question IDs (`q1`–`q20`) the engine silently ignored.** The schema is `q<domain>_<index>` (22 IDs total: `q1_1`…`q6_4`), per `mcp-server/src/docs/icg/CONTRACT.md`: "Unknown keys are silently ignored." The deliverable's claim of "20 of 20 answers were `-1`" was fiction; zero answers reached the engine. Fixed by enumerating all 22 IDs by domain in the prompt body (`target-quick-look.ts`) and correcting "20" → "22" in the body and the low-confidence threshold.

The Tech Debt deep-link was unaffected (already lands on the populated calculator). TechPar deferred-deep-link disclosure fired correctly.

Fixes shipped in commits `<TBD>`. **V2 must be re-run** against the post-fix `dist/index.js` to verify (a) ICG link opens results view directly, (b) Regulatory Map link both highlights the region AND auto-opens the panel with category-filtered regulations, (c) deliverable's "Assumptions / unknowns" list contains the 22 schema-canonical IDs (not the fictional flat IDs).

---

## V2 — `gst_target_quick_look`

**Procedure**

1. Slash-menu → `gst_target_quick_look`. Fill: `{ targetName, productType, arr, stage, hqJurisdiction }`.
2. Pick a target where SOME inputs are derivable and OTHERS are explicitly unknown — V2's whole point is exercising the ICG `-1` ("Not sure") fallback workflow.
3. Submit. The model invokes 4 tools (ICG, TechPar, Tech Debt, search_regulations).
4. **Click each surfaced "Open in Hub" deep-link in a browser** to verify state restoration:
   - ICG link → wizard opens **directly on the results view** with all 22 answers pre-populated (post-fix).
   - Tech Debt link → calculator opens with all 10 inputs restored (subject to slider quantization).
   - Regulatory Map link → opens filtered to the supplied `hqJurisdiction` AND highlights the region AND auto-opens the side panel with category-filtered regulations expanded (post-fix).

**Pass criteria**

- [x] Output is one digestible page (header + 5 content sections + Open-in-Hub).
- [x] ICG, TechPar, Tech Debt called once each; `search_regulations` called for the supplied jurisdiction. — _Post-fix re-run: TechPar called twice (first attempt with annual values produced 12× output for `infraHosting`; agent self-corrected on retry by sending monthly values — see BL-031.95 input-ergonomics line item). Acceptable as "called once per intent."_
- [x] Regulatory frameworks named for the supplied jurisdiction. — _CCPA/CPRA + SB 942 (us-ca) + HIPAA + CIRCIA (us federal overlay, conditional applicability framing)_
- [x] **3 deep-links present and restore state** (ICG + Tech Debt + Regulatory Map). — _Post-fix re-run: ICG URL decodes to `currentStep: 7` (results view) ✓; Reg Map URL emits uppercase `US-CA` and the page selects + opens panel ✓; Tech Debt URL unchanged (already lands on populated calculator)_
- [x] **TechPar deferred-deep-link disclosure note appears** (BL-031.95 reference). — _"TechPar deep-link pending — tracked under BL-031.95" appeared verbatim_
- [x] Assumptions / unknowns subsection lists every ICG question answered as `-1`. — _Post-fix re-run: schema-canonical IDs `q1_1`…`q6_4` listed by domain (matches `src/data/infrastructure-cost-governance/domains.ts`)_
- [x] Senior-consultant sign-off. — _Recorded 2026-05-01 against post-fix `dist/index.js` (commits applying V2 findings #1–#3 + the secondary 22→20 count correction). Page screenshots from the senior consultant confirm ICG results view renders correctly with all-(-1) inputs (gauge 0/100 Reactive, foundational warning fires, all 27 recommendations shown)._

**Evidence**

<details>
<summary>V2 input args</summary>

```json
{
  "targetName": "Helios Health",
  "productType": "b2b-saas",
  "arr": 25000000,
  "stage": "Scaling Growth",
  "hqJurisdiction": "us-ca"
}
```

</details>

<details>
<summary>V2 model output (first-run, pre-fix — captures the three findings above)</summary>

```
I'll execute the workflow. Let me load the required tools first.

Now let me check the regulation facets to confirm the jurisdiction code, then execute all four workflow steps in parallel where possible.

`us-ca` is canonical. Now executing all workflow steps in parallel.

For ICG: B2B SaaS at scaling growth with $25M ARR — I can derive reasonable answers for some questions (typical FinOps maturity, observability practices) but many specifics aren't knowable from the inputs. I'll use ICG question IDs that match the standard 20-question schema (6 domains: visibility, accountability, optimization, forecasting, governance, culture). Without the exact question IDs from the schema, I'll use the documented convention.

Let me try with `-1` for all 20 to be schema-safe, then pivot if the engine returns unknown IDs.

All 20 are `-1`. The engine accepts `q1`-`q20` IDs. Now executing the remaining steps in parallel.

The TechPar result with zero costs returns "underinvest" — that's a degenerate result from no real cost data. For a quick-look brief without cost data, this is a low-confidence read. I'll flag this in the output rather than fabricate cost numbers. Continuing with tech debt and regulations.

Helios *Health* — federal HIPAA likely applies even though it's not state-level. Let me also check `us` jurisdiction for federal data privacy and industry compliance frameworks that would apply to a CA-headquartered B2B SaaS in healthcare.

All data captured. Drafting the brief.

---

# Helios Health — Quick Look

**Helios Health** | b2b-saas | ARR $25M | Scaling Growth | HQ us-ca

> ICG portion is a low-confidence baseline — 20 of 20 answers were "Not sure." The maturity score is the engine's penalised default and should not be read as an actual maturity assessment. Run the full wizard with operator inputs for a confident read.

---

## Cost-governance read

**Overall score: 0/100 — Reactive.** Both foundational domains (Visibility & Tagging, Account Structure & Attribution) flagged below threshold by default. Score reflects the absence of operator data, not observed posture.

Top recommendations the engine surfaced (high-impact, quick-win):

1. **Deploy a cloud cost visibility dashboard** — engineering leads need direct, ungated access to cost data (Cost Explorer, GCP Billing, or a FinOps platform).
2. **Enable continuous utilization monitoring** — flag right-sizing candidates automatically below 30% average utilization over 14 days.
3. **Embed cost review into ADRs** — make cost projection a mandatory field for infrastructure changes above a defined spend threshold.

**Assumptions / unknowns** (all 20 ICG questions answered `-1` "Not sure"): q1–q20 across Visibility & Tagging, Account Structure & Attribution, Right-Sizing & Utilization, Lifecycle & Waste, Architectural Efficiency, and Governance & Alerting. Every domain is currently a blind spot from the agent's perspective.

---

## Unit-economics (TechPar)

**Zone: underinvest** — but this is a degenerate result. Cost inputs (engCost, R&D OpEx, infra hosting) were not supplied, so totalTechPct computed at ~0%. **Defer interpretation until operator cost breakdown is in hand.** A real Series B–C target should land between 35–55% of ARR on total tech spend.

---

## Tech-debt range

- **Annual cost: $2.39M**
- **Debt as % of ARR: 9.6%**
- **Payback: 4.2 months** at a $500K remediation budget and 60% remediation efficiency
- **DORA tier: High** (weekly deploy cadence)
- Hours lost per engineer per week: 12

Inputs synthesized at conservative midpoints for a 51–200-headcount, scaling B2B SaaS: 40 engineers, $160K loaded salary, 30% maintenance burden, 8 incidents/month, 4-hour MTTR, context-switch overhead modeled on.

---

## Regulatory exposure (us-ca + federal overlay for healthcare vertical)

- **California Consumer Privacy Act (CCPA/CPRA)** — us-ca, data-privacy. Expanded California consumer rights over personal information; thresholds-based applicability and CPPA enforcement.
- **California AI Transparency Act (SB 942)** — us-ca, ai-governance. Watermarking and detection-tool obligations for large generative AI providers (>1M monthly CA users); effective Aug 2026.
- **HIPAA** — us federal, industry-compliance. PHI privacy, security, and breach notification standards binding on covered entities and business associates. **Almost certainly in-scope given "Health" in the target name** — confirm scope of PHI handling on first management call.

No matches in the Map for us-ca cybersecurity or industry-compliance. Federal sectoral overlay (HIPAA) is the dominant industry-compliance framework here.

---

## Open in Hub

- [Open ICG](https://globalstrategic.tech/hub/tools/infrastructure-cost-governance/?s=eyJzIjowLCJhIjp7InExIjotMSwicTIiOi0xLCJxMyI6LTEsInE0IjotMSwicTUiOi0xLCJxNiI6LTEsInE3IjotMSwicTgiOi0xLCJxOSI6LTEsInExMCI6LTEsInExMSI6LTEsInExMiI6LTEsInExMyI6LTEsInExNCI6LTEsInExNSI6LTEsInExNiI6LTEsInExNyI6LTEsInExOCI6LTEsInExOSI6LTEsInEyMCI6LTF9LCJnIjoic2VyaWVzLWJjIn0=)  ⚠ landed on intro
- [Open Tech Debt](https://globalstrategic.tech/hub/tools/tech-debt-calculator/?s=eyJhIjowLCJ0cyI6MzMsInNwIjozMywibXAiOjMwLCJkaSI6MiwiaW4iOjgsIm10dHIiOjQsImJwIjoxNiwiYXAiOjIzLCJyZSI6NjAsImNzIjoxfQ==)
- [Open Regulatory Map (us-ca, data-privacy)](https://globalstrategic.tech/hub/tools/regulatory-map/?region=us-ca&filter=data-privacy)  ⚠ region not selected, panel not opened
- [Open Regulatory Map (us-ca, ai-governance)](https://globalstrategic.tech/hub/tools/regulatory-map/?region=us-ca&filter=ai-governance)  ⚠ region not selected, panel not opened
- [Open Regulatory Map (us, HIPAA)](https://globalstrategic.tech/hub/tools/regulatory-map/?region=us)  ⚠ alpha-2 vs alpha-3 mismatch, no region selected

TechPar deeplink pending — page does not yet support URL state (BL-031.95).
```

</details>

<details>
<summary>V2 re-run output (post-fix — confirms findings #1, #2, #3 resolved + secondary count correction)</summary>

```
I'll execute the GST quick-look workflow. Let me load the tools first.

Now let me run all four assessments in parallel where possible. Stage "Scaling Growth" maps to `series-bc` for ICG and `series_bc` for TechPar. For a $25M ARR b2b-saas at scaling growth, I'll set baseline assumptions and use `-1` only where a true reasonable baseline can't be derived.

The schema is 20 questions, not 22 (q1 has 3, q2 has 4, q3-q5 have 3 each, q6 has 4 = 20). The instructions had stale counts but the IDs are correct. With all `-1`, this is the maximally low-confidence baseline — exactly what the workflow specifies should trigger the lead-line warning. Now the other three calls in parallel.

The TechPar result is wildly off — `infraHosting` of $18M is being treated as monthly or has the wrong unit interpretation (12x the $1.5M I sent, which suggests the field expects monthly). Let me re-check by sending monthly values.

Actually, looking again: `infraHosting` returned 18,000,000 from my input of 1,500,000 — that's a 12x multiplier, confirming the field expects **monthly** dollars. Same for `infraPersonnel` (600,000 → 600,000? no, that returned $600K which is 1x my input — wait).

Let me re-read: `value: 600000` for infraPersonnel but I sent 600000. So infraPersonnel is annual, but infraHosting got multiplied by 12. That's inconsistent. Looking more carefully: infraHosting 1,500,000 × 12 = 18,000,000. The engine likely treats infraHosting as monthly. Let me retry with monthly hosting and check tooling/eng/prod (which weren't shown in categories, so behavior is unclear). Let me retry with sensible monthly hosting figures.

Confirmed: `infraHosting` is monthly. Numbers now sensible — 30.4% blended tech ratio, "ahead" zone (lean for stage), with a slight underinvestment signal. Now tech debt and regulations.

Helios Health is in the name — HIPAA is going to apply at the federal level. Let me also pull federal-level frameworks relevant to a US-based healthcare-adjacent SaaS.

I have everything I need. The cybersecurity hits (CIRCIA, CMMC) don't naturally apply to a generalist B2B SaaS unless Helios Health serves DoD or critical-infrastructure providers — I'll note them as conditional. CCPA and HIPAA are the high-confidence applicables for a US-CA HQ healthcare SaaS.

---

# Helios Health — First Look

**B2B SaaS** | **ARR $25M** | **Scaling Growth** | **HQ US-CA**

> ⚠️ **ICG read is a low-confidence baseline.** All 20 cost-governance questions were answered "Not sure" (no operator data available). The score below reflects the worst-case penalised baseline; recommendations surface every domain because nothing has been validated. Run the full ICG wizard with the target's CTO/FinOps lead before treating this as diligence-grade.

### 1. Cost Governance (ICG)
- Overall: 0/100 — Reactive (penalised baseline; not a real read)
- All six domains below threshold; both foundational domains (Visibility/Tagging, Account Structure) flagged
- Top 3 quick-wins to validate first: cost visibility dashboard, continuous utilization monitoring, per-team budgets
- Assumptions / unknowns: q1_1, q1_2, q1_3, q2_1, q2_2, q2_3, q2_4, q3_1, q3_2, q3_3, q4_1, q4_2, q4_3, q5_1, q5_2, q5_3, q6_1, q6_2, q6_3, q6_4

### 2. Unit Economics (TechPar)
- Total tech spend: 30.4% of ARR — Zone: Ahead (lean for Series B–C; healthy band 35–55%)
- Revenue per engineer: $714K (35 FTE assumed)
- Inputs synthesized after correcting infraHosting unit (monthly per BL-031.95 follow-up)

### 3. Tech Debt Carrying Cost
- Annual cost: $2.22M (8.9% of ARR), 12 hrs/eng/wk, DORA tier High, $500K remediation pays back in 10.8mo

### 4. Regulatory Exposure
| Framework | Jurisdiction | Summary |
|---|---|---|
| HIPAA | US (federal) | Healthcare-name implies PHI — diligence-priority. |
| CCPA / CPRA | US-CA | Triggered at $25M ARR; CPPA enforcement active. |
| CA AI Transparency Act (SB 942) | US-CA | Conditional on >1M monthly CA users + genAI features. |
| CIRCIA | US (federal) | Conditional on critical-infrastructure scope. |

### 5. Open in Hub
- Open ICG → ?s=eyJzIjo3,... (decodes to currentStep:7, all 20 IDs as -1) ✓ lands on results view
- Open Tech Debt → ?s=eyJhIjow,... ✓
- Open Regulatory Map → ?region=US-CA ✓ (uppercase; page selects + opens panel)
- TechPar deep-link pending — tracked under BL-031.95.

Diligence priority for next 48 hours: (1) Confirm HIPAA scope + BAA inventory. (2) Pull cloud bill + tagging coverage to convert ICG from baseline to read. (3) Verify TechPar headroom is intentional efficiency vs. under-investment.
```

**Findings carried forward to BL-031.95** (input ergonomics):

1. **TechPar `infraHosting` unit inconsistency** — the agent had to discover at runtime that `infraHosting` is annualized via `× 12` while every other money field is treated as annual. Captured in BL-031.95 as the "TechPar `infraHosting` unit normalization" line item; the rename to `infraHostingAnnual` removes the trial-and-error retry path.
2. **Diligence Machine "unknown" parity with ICG `-1`** — observation while reviewing V2: the diligence wizard requires every field, forcing agents to fabricate at deal kickoff (when much is unknown). Captured in BL-031.95 as the "Diligence Machine `'unknown'` input support" line item; mirrors the ICG pattern that the BL-031.75 prompt-body design directive explicitly endorsed.
3. **Secondary count correction** — the prompt body said "22 questions" (my error during the V2 fix); the model self-corrected at runtime to "20 of 20" and adapted. The body and its regression test were corrected in the same fix bundle as V2 findings #1–#3.

</details>

---

## V3 — `gst_comparable_engagements_memo`

**Procedure**

1. Slash-menu → `gst_comparable_engagements_memo`. Fill `targetDescription` (free text); optionally `theme` and `engagementCategory`.
2. Submit. The model should call `list_portfolio_facets` first, then 1–3× `search_portfolio` to find a useful match set.

**Pass criteria**

- [x] 3–5 comparable engagements named (codeName + 1-line context + lesson per match). — _Run 1: 5 (Onfray, Chariot, Wolverine, Knapsack, Regatta). Run 2: 4 (Atlas, Wellness, Tempo, Oktoberfest). Both within band._
- [x] Lessons framed analogically as guidance for the current target, not retrospective narrative. — _Both runs use forward-looking phrasing: "scope diligence to test whether…", "LOI scope should explicitly separate…". No retrospective obituaries._
- [x] Closing 2–3 sentence cross-shortlist synthesis present. — _Run 1: two-tier scope recommendation (pre-LOI Regatta-shaped + post-LOI Onfray/Chariot-shaped). Run 2: four-workstream scope + explicit "Healthcare hint should be treated as directional" caveat._
- [x] Senior-consultant sign-off. — _Recorded 2026-05-01 against post-V2-fix `dist/index.js` (commits `8dd24e1` → `c89bcca`)._

**Findings carried forward**:

1. **`engagementCategory` strict-case rejection** — user attempted `'Buy-side'` (lowercase 's') in Run 2; argsSchema rejected via `z.enum`. Fixed by `enumFromWire` preprocessor at the MCP wire boundary (case-insensitive normalization to canonical `'Buy-Side'`); applied to every enum-typed argsSchema field across all 8 prompts. See commits following V3.
2. **Run 1 over-searched** (6× `search_portfolio` calls vs body's "1–3 times" budget). Output quality was excellent so the body is intentionally left unchanged; this is recorded as a soft observation rather than a defect. If subsequent runs trend toward exhaustion, the "Run the search 1–3 times" sentence in the body can be tightened to a hard cap.

**Evidence**

<details>
<summary>V3 Run 1 input + output (no hints — derive everything from the description)</summary>

Input args:

```json
{
  "targetDescription": "PE-sponsored bolt-on acquisition of a vertical SaaS in industrial supply chain, ARR ~$60M, scaling stage. Significant integration debt from two prior tuck-in acquisitions. North American customer base, EU expansion underway. Sponsor needs a technology DD scope for LOI by end of month."
}
```

Tool calls observed: `list_portfolio_facets` (1×) → `search_portfolio` (6× across Logistics, Software, Operations Management, Manufacturing, plus cross-cuts).

Output (excerpt):

```
# Comparable Engagements Memo — Target: Industrial Supply Chain Vertical SaaS (PE Bolt-On, ~$60M ARR)

Search basis. Filtered the 61-engagement portfolio across Logistics, Software,
Manufacturing, and Operations Management themes on the Buy-Side category. Five
comparables share at least two of {industry adjacency, scaling-stage growth,
vertical SaaS deal shape, integration-debt pattern} with the current target.

## Shortlist
- Onfray (Logistics SaaS, $180M ARR, Scaling Growth, 2022) — closest deal-shape twin; lesson on scaling-stage SaaS with monolith + heterogeneous front-ends
- Chariot (Logistics marketplace + adjacent TMS, Scaling Growth, 2022) — analogous to NA-to-EU expansion overlay on already-scaling platform
- Wolverine (Supply Chain Analytics, $10M ARR, Scaling Growth, 2025) — closest domain match; refactoring program for complex modules
- Knapsack (Manufacturing scheduling, Legacy System, 2024) — integration-platform recommendation; tuck-in integration angle
- Regatta (Data Integration SaaS, $5M ARR, Early-Stage Growth, 2024) — pre-bid light-touch assessment; procedural analog to end-of-month LOI deadline

## What this means for the current deal
The portfolio precedent points to a two-tier scope: a fast pre-LOI assessment
(Regatta-shaped) covering stack viability, integration-debt sizing, and org-gap
inventory, with a deeper post-LOI TDD (Onfray/Chariot-shaped) covering
modernization roadmap, second-region readiness, and the integration-platform
workstream Knapsack flagged. The prior tuck-ins are the dominant risk vector —
they should be treated as a distinct diligence track.
```

</details>

<details>
<summary>V3 Run 2 input + output (Healthcare theme hint, deliberately mismatched to target)</summary>

Input args:

```json
{
  "targetDescription": "PE-sponsored bolt-on acquisition of a vertical SaaS in industrial supply chain, ARR ~$60M, scaling stage. Significant integration debt from two prior tuck-in acquisitions. North American customer base, EU expansion underway. Sponsor needs a technology DD scope for LOI by end of month.",
  "theme": "Healthcare"
}
```

(Note: this run also surfaced the `engagementCategory` strict-case issue — the user attempted `'Buy-side'` in a follow-up and it was rejected. Fixed in the post-V3 enum-tolerance commits.)

Tool calls observed: `list_portfolio_facets` (1×) → `search_portfolio` (2× — Healthcare/Buy-Side filtered + free-text deal-shape pass).

Output (excerpt):

```
# Comparable Engagements Memo — Target: Industrial Supply Chain Vertical SaaS (PE Bolt-On, ~$60M ARR)

Search basis. Filtered the portfolio on Healthcare theme (per supplied hint)
and Buy-Side category. Note that the target's industrial supply chain domain
does not directly align with Healthcare; however, four of the seven Healthcare
comparables share at least two of {ARR proximity, scaling-stage profile,
acquisition-integration question, EU exposure} with the target and analogize
cleanly across vertical-SaaS deal mechanics. The hint itself merits a flag —
the analogies below hold on deal shape, not domain, and a complementary cut
against Logistics or Manufacturing themes would strengthen the working
hypothesis.

## Shortlist
- Atlas (Healthcare RCM, $67M ARR, Mature Enterprise, 2026) — closest ARR
  twin; legacy core + cloud peripherals; integration-compatibility lens
- Wellness (Telehealth, $70M ARR, Scaling Growth, 2025) — closest combined
  ARR + stage match; "Growth-Ready" SDLC verdict; framework consolidation
- Tempo (HealthTech, $13M ARR, Scaling Growth, 2024) — directly analogous on
  the integration question; acquirer-stack-fit deliverable pattern
- Oktoberfest (Clinical Research, €6.5M ARR, Scaling Growth, 2023) — only
  comparable with explicit EU regulatory profile; GDPR + data-residency
  pattern applies to the current EU expansion

## What this means for the current deal
Four-workstream scope: (1) core platform viability + SDLC maturity rating
sized to the $60M ARR band, (2) acquirer-stack-fit and post-tuck-in
integration debt as an explicit deliverable, (3) EU readiness covering GDPR
and data residency, (4) long-range platform transition cost. Healthcare hint
should be treated as directional rather than determinative — a confirmatory
pass against Logistics and Manufacturing themes would surface domain-native
comparables.
```

Run 2 also exhibited a strong "honor-the-hint-but-flag-the-mismatch" behavior — the model accepted the Healthcare constraint without forcing a poor-fit comparable, instead surfacing the analogical-axis-rather-than-domain framing in both the search-basis preamble and the closing synthesis. This is the design intent: hints are advisory, not determinative.

</details>

---

## V4 — `gst_regulatory_exposure_brief`

> **Spec note (reconciled 2026-05-01)**: this section originally instructed the model to call `resources/read gst://regulations/...` for each match. Commit 5 of BL-031.75 (V1 finding 1) established that Resources are not model-fetchable from prompt expansion in Claude Desktop; the Library and Radar prompts solved this by embedding Resource bodies as `EmbeddedResource` content blocks. For the 120-framework regulation set, embedding all bodies is infeasible — instead the prompt body's design uses the `search_regulations` result fields (name, summary, keyRequirements, penalties, jurisdiction, effectiveDate) as the authoritative source for the brief. The procedure and pass criteria below have been reworded to match that design; the original "Per-framework Resources read by URI" criterion is obsolete and removed.

**Procedure**

1. Slash-menu → `gst_regulatory_exposure_brief`. Fill: `{ targetJurisdictions: ['eu', 'us-ca'], dataCategories: ['data-privacy', 'ai-governance'], productType: <e.g. 'b2b-saas'> }`.
2. Submit. The model calls `search_regulations` per jurisdiction × category and assembles the brief from the search-result fields directly (no `resources/read` calls — see spec note above).
3. **Click the surfaced filtered Regulatory Map deep-link** in a browser to verify `?region=&filter=` filter restoration. (Should now decode to uppercase `EU` / `US-CA` per the V2 jurisdiction-normalization fix in commit `e4fe98d`.)

**Pass criteria**

- [ ] `search_regulations` called for each jurisdiction × category combination.
- [ ] Per-framework summaries are sourced from the `search_regulations` result fields (name, summary, keyRequirements, penalties) — no invented prose, no `resources/read` calls. The summary may name additional context (effective date, enforcement authority) only if it appears verbatim in the search result.
- [ ] Brief assembled with: per-jurisdiction breakdown + cross-jurisdictional themes + Open-in-Hub.
- [ ] **Per-framework deep-links present** — each named framework cites the per-result `deeplink` field from its `search_regulations` match (Regulatory Map filtered to that framework's region+category).
- [ ] **Aggregate filtered Regulatory Map deep-link** (the search response's `filterDeeplink`) restores `?region=&filter=` filters byte-identically when clicked.
- [ ] Obligation summaries are tailored to the supplied `productType` (not generic).
- [ ] Senior-consultant sign-off.

**Evidence**

<details>
<summary>V4 input + output</summary>

```
TBD
```

</details>

---

## V5 — `gst_vdr_audit` (TWO trials: one-shot + interactive)

**Procedure (a) — one-shot mode**

1. Slash-menu → `gst_vdr_audit`. Fill `vdrInventory` with a representative list (e.g., copy from a real VDR you have access to, or simulate with 5–10 folders).
2. Submit. The model reads `gst://library/vdr-structure` and produces the audit immediately.

**Procedure (b) — interactive mode**

1. Slash-menu → `gst_vdr_audit`. Leave `vdrInventory` empty / omitted.
2. Submit. The model should ask you to paste your VDR list before proceeding.
3. Paste the same list as (a) (or a different one to exercise variation). The model produces the audit.

**Pass criteria (both modes)**

- [ ] Mapping table (canonical folder × target folder × Direct/Partial/Gap status).
- [ ] Gaps flagged with 2–3 concrete document requests each.
- [ ] Out-of-scope content surfaced with recommendations.
- [ ] Prioritized follow-up request list (top 5–7).
- [ ] Senior-consultant sign-off on BOTH modes.

**Evidence**

<details>
<summary>V5(a) input + output</summary>

```
TBD
```

</details>

<details>
<summary>V5(b) input + output</summary>

```
TBD
```

</details>

---

## V6 — `gst_architecture_layer_review`

**Procedure**

1. Slash-menu → `gst_architecture_layer_review`. Fill `targetSummary` (free text, ≥ 20 chars).
2. Submit. The model reads `gst://library/business-architectures` and walks all 5 layers.

**Pass criteria**

- [ ] All 5 layers walked in order: Software → Infrastructure → Data → Organizational → Industry.
- [ ] 2–3 architectural risks per layer, phrased as concrete liabilities (not generic concerns).
- [ ] 1–2 investigation handles per layer.
- [ ] Closing "Cross-layer patterns" section with 2–3 patterns spanning multiple layers.
- [ ] `gst://library/business-architectures` referenced.
- [ ] Senior-consultant sign-off.

**Evidence**

<details>
<summary>V6 input + output</summary>

```
TBD
```

</details>

---

## V7 — `gst_radar_brief_today` (TWO trials + cache-missing path)

**Procedure (a) — category filter**

1. Confirm `.cache/inoreader/` is seeded (`npm run radar:seed` from repo root if not).
2. Slash-menu → `gst_radar_brief_today`. Fill `category: 'enterprise-tech'`. Leave `sinceHours` at default (24).
3. Submit. The model reads `gst://radar/fyi/latest`, filters to enterprise-tech, summarizes.

**Procedure (b) — defaults (all categories)**

1. Slash-menu → `gst_radar_brief_today`. Leave both args empty.
2. Submit. The model produces a brief across all four categories.

**Procedure (c) — snapshot-missing**

1. Delete the cache: `rm -rf .cache/inoreader/` (or platform equivalent).
2. Restart Claude Desktop (or wait for the MCP server to re-read on next invocation).
3. Slash-menu → `gst_radar_brief_today`. Submit with any args.
4. Confirm the model surfaces the snapshot-missing structured error verbatim and **does not fabricate items**.
5. **Important**: re-seed (`npm run radar:seed`) when V7 is done so subsequent verification (or normal use) works.

**Pass criteria**

- [ ] (a) and (b): FYI snapshot read; items grouped by category; 3–5 items per category; GST Take voice; "GST Take across the brief" closing paragraph.
- [ ] (c): structured error wired in BL-031.5 fires cleanly; no fabricated items; no stack trace.
- [ ] Senior-consultant sign-off on all three trials.

**Evidence**

<details>
<summary>V7(a), (b), (c) — input + output</summary>

```
TBD
```

</details>

---

## V8 — `gst_diligence_handoff_memo`

**Procedure**

1. Slash-menu → `gst_diligence_handoff_memo`. Fill the full `UserInputs` payload + `targetName`.
2. Optional variant: also supply `agendaJson` from a previous V1 run to exercise the "use pre-generated artifact" branch.
3. Submit. The model orchestrates `generate_diligence_agenda` (or uses the supplied JSON) + `search_portfolio` + reads `gst://library/vdr-structure`.

**Pass criteria**

- [ ] Single coherent memo (not stitched-together tool outputs).
- [ ] All sections present: engagement context, agenda, attention areas (cross-referenced to comparables), comparable engagement library, prioritized VDR follow-ups, open questions / next steps.
- [ ] Per-portfolio-match anchor URLs to `/ma-portfolio` rows present (static `/#<id>` anchors; not stateful — keep simple per the deep-link table).
- [ ] When `agendaJson` is supplied, the model uses it directly instead of re-calling `generate_diligence_agenda`.
- [ ] Senior-consultant sign-off.

**Evidence**

<details>
<summary>V8 input + output</summary>

```
TBD
```

</details>

---

## Closure procedure (after V1–V8 all signed off)

In a single closure commit:

1. **Migrate the recorded evidence** from this doc's `<details>` blocks into:
   - **`mcp-server/README.md` § "Last verified (BL-031.75 surface)"** — replace the placeholder with V1–V8 excerpts (≤ 6 lines per prompt; pattern parallels the BL-031.5 stanza in commit `1ad2ba5`).
   - **`mcp-server/tests/examples/<slug>.golden.md`** — replace each placeholder with the full recorded input + expanded body + model output. Update the frontmatter `recordedAt` (ISO date) and `model` (e.g., `claude-opus-4-7`).
2. **Update `BACKLOG.md` § BL-031.75**:
   - Tick the two pending AC items: "Golden-output snapshots per prompt" and "**Senior-consultant review gate**".
   - Update the Status line: `Code-complete (April 30, 2026); closure pending V1–V8 verification + senior-consultant sign-off` → `Complete (May <DD>, 2026)`.
3. **Delete this verification doc** (`git rm src/docs/development/MCP_SERVER_PROMPTS_BL-031_75_Verification.md`). Doc history is in `git log`.
4. **Validate**: `npm -w @gst/mcp-server run typecheck && build && test` green; repo-root `npx astro check && npm run lint && npm run lint:css && npm run test:run` green. The golden-snapshots integration test now validates the recorded frontmatter (real `recordedAt` + `model` values).
5. **Commit** with message:
   ```
   docs(mcp): close BL-031.75 — V1-V8 land, README has real recorded values
   ```
6. **Push only on user direction.** Standing rule from CLAUDE.md.

---

_Last updated: 2026-05-01_
