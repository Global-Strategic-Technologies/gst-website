# Usage — `generate_diligence_agenda`: A TDD Walkthrough

A complete, reproducible end-to-end example of using the [`@gst/mcp-server`](../../../README.md) `generate_diligence_agenda` tool for a real-shaped task: drafting a Technical Due Diligence agenda for a client evaluating a private-equity investment.

This document is a **stakeholder orientation aid** — it answers "what does it actually look like to use this" without requiring the reader to install the server first. Every input and output below is reproducible by anyone with the MCP server registered in their Claude client.

> Companion docs: [`CONTRACT.md`](./CONTRACT.md) (per-field input reference) | [`../contracts/README.md`](../contracts/README.md) (registry of all per-tool contracts).

> **The deal in this document is hypothetical.** No real client, target, or codename. The portfolio engagements pulled in for analogical reference (Fusion, Ultra2, Fender) are real anonymized engagements from the bundled portfolio dataset, but their use here as comparables is illustrative — actual engagement matching in a real deal would involve human judgment, not a string match.

---

## The scenario

A private-equity client is evaluating a **majority-stake investment** in a B2B SaaS company serving mid-market financial services firms. They've asked GST to lead the Technical Due Diligence. The first deliverable is a **diligence agenda** — the prioritized question set the analyst team will use during management interviews and document review.

In the pre-MCP workflow, drafting this agenda meant:

1. Open `globalstrategic.tech/hub/tools/diligence-machine` in a browser.
2. Click through 13 wizard steps to specify the deal profile.
3. Read the rendered output in the right-hand panel.
4. Copy-paste relevant questions into the proposal document.
5. Switch tabs back to the wizard if the deal profile shifts mid-draft.

In the MCP workflow, the entire sequence happens inside the Claude conversation that's _already drafting the proposal_ — no tab switch, no transcription, no re-entering inputs to iterate.

---

## The deal profile

| Dimension            | Value                                                          |
| -------------------- | -------------------------------------------------------------- |
| Industry             | B2B SaaS — vertical SaaS for mid-market financial services     |
| Architecture         | Modern cloud-native (AWS, EKS, multi-tenant)                   |
| Headcount            | ~250 employees                                                 |
| Revenue              | ~$50M ARR                                                      |
| Age                  | 12 years                                                       |
| Growth stage         | Scaling                                                        |
| Geographies          | US + Canada + EU (German subsidiary handles EU compliance)     |
| Business model       | Productized platform with usage-tiered pricing                 |
| Scale intensity      | Moderate (real customer concurrency, not hyper-scale)          |
| Transformation state | Actively modernizing (replatforming a legacy reporting module) |
| Data sensitivity     | High (handles customer PII + financial records)                |
| Operating model      | Product-aligned squads                                         |
| Transaction type     | Majority-stake                                                 |

This is a realistic mid-market PE shape: the target is mature enough that the audit will surface real findings, modern enough that the conversation isn't dominated by legacy debt, and regulated enough that compliance materially affects deal value.

---

## What you actually type

Inside any Claude client where the GST MCP server is registered (Claude Desktop, Claude Code, Cursor — see the [MCP server README](../../../README.md) for setup), you would type the deal description in prose. No structured input, no schema knowledge required:

> _"I'm doing TDD for a client evaluating a majority-stake in a 12-year-old B2B SaaS targeting mid-market financial services. ~$50M ARR, ~250 employees, scaling stage. Modern cloud-native AWS/EKS, multi-tenant productized platform, moderate scale intensity. They have customers in US, Canada, and EU (German entity handles EU). Currently replatforming a legacy reporting module. They handle high-sensitivity data (PII + financial records). Squad-based product-aligned engineering org. Generate the diligence agenda."_

Claude reads the prose, recognizes that the `mcp__gst__generate_diligence_agenda` tool fits the request, extracts the 13 structured inputs from the description, and calls the tool. The user does not see this mapping step in normal use — but for orientation, here is what Claude derives:

> The full per-field reference — every valid enum value, every per-option description, every downstream effect — lives in [`CONTRACT.md`](./CONTRACT.md). The mapping table below is illustrative; the contract is canonical.

| Schema field          | Resolved value           | Source phrase                 |
| --------------------- | ------------------------ | ----------------------------- |
| `transactionType`     | `majority-stake`         | "majority-stake investment"   |
| `productType`         | `b2b-saas`               | "B2B SaaS"                    |
| `techArchetype`       | `modern-cloud-native`    | "modern cloud-native AWS/EKS" |
| `headcount`           | `201-500`                | "~250 employees"              |
| `revenueRange`        | `25-100m`                | "~$50M ARR"                   |
| `growthStage`         | `scaling`                | "scaling stage"               |
| `companyAge`          | `10-20yr`                | "12-year-old"                 |
| `geographies`         | `["us", "canada", "eu"]` | listed                        |
| `businessModel`       | `productized-platform`   | "productized platform"        |
| `scaleIntensity`      | `moderate`               | listed                        |
| `transformationState` | `actively-modernizing`   | "currently replatforming"     |
| `dataSensitivity`     | `high`                   | "PII + financial records"     |
| `operatingModel`      | `product-aligned-teams`  | "squad-based"                 |

If a phrase is ambiguous, Claude asks a follow-up before calling the tool — e.g., _"You said 'mid-market' — does that mean ~$25-100M ARR or ~$100M+? Both are 'mid-market' under different definitions."_

---

## The agenda the engine returns

The engine produces a structured `GeneratedScript` with topic-grouped questions, attention-area summaries, a trigger map, and aggregate metadata.

### Headline numbers

- **20 questions** across **4 topics**
- **5 attention areas** (3 high-relevance, 2 medium)
- **Trigger map** linking each question to the input dimensions that caused it to surface

### Topics

| Topic                             | Audience                 | Questions | Priority breakdown   |
| --------------------------------- | ------------------------ | --------- | -------------------- |
| Architecture                      | CTO / VP Engineering     | 6         | 1 high, 5 medium     |
| Operations & Delivery             | VP Engineering / Product | 6         | 3 high, 3 medium     |
| Carve-out / Integration           | M&A Lead / CIO           | 2         | 1 medium, 1 standard |
| Security, Compliance & Governance | CISO                     | 6         | 6 high               |

The audience-banding is what lets you split this single agenda into per-interview question sets without re-running the engine.

### The trigger map (the personalization)

Every question has an `id` and a `conditions` block that defines when it surfaces. The trigger map is the inverse: for _this_ deal, _these_ are the questions that exist _because_ of _these_ specific inputs. Without those inputs, the questions would not be in the agenda.

| Question ID | Subject                                      | Triggered by                           | Why it surfaced for this deal                                             |
| ----------- | -------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------- |
| `arch-09`   | DR/RPO/RTO with documented testing           | Revenue ≥ $5M                          | Untested DR is a material revenue-protection risk at this scale           |
| `arch-02`   | Database scaling headroom                    | Headcount 201-500                      | Hidden bottleneck for platforms at this size                              |
| `arch-03`   | Single-tenant vs multi-tenant migration cost | B2B SaaS                               | Tenancy model is a structural lever for SaaS operating leverage           |
| `arch-04`   | Infrastructure-as-Code maturity              | Modern cloud-native or hybrid-legacy   | IaC maturity correlates with DR capability and environment parity         |
| `arch-12`   | SLA history & current bottlenecks            | B2B SaaS + scaling/mature growth stage | Reliability is a retention lever for SaaS in this phase                   |
| `ops-03`    | Key-person dependencies                      | Any headcount                          | Universal — but increasingly material as headcount grows                  |
| `ops-13`    | Last end-to-end DR test                      | Revenue ≥ $5M                          | DR capability is only "real" when tested under realistic conditions       |
| `ops-04`    | Incident management — MTTD / MTTR            | B2B SaaS / B2C marketplace             | Incident maturity reflects retention risk for customer-facing platforms   |
| `ops-05`    | Tech debt quantification & engineering split | Company age 5-10yr+                    | At 10+ years, undocumented debt compounds invisibly                       |
| `ci-08`     | Duplicate systems rationalization            | Business-integration / majority-stake  | Majority-stake commonly involves portfolio consolidation                  |
| `ci-10`     | Regulatory cert transfer                     | Multi-region geography (incl. CA, EU)  | Certs are not always transferable; gaps can halt operations post-close    |
| `sec-05`    | GDPR posture (DPAs, DSR fulfillment)         | EU/UK geography                        | Non-compliance carries fines up to 4% of global revenue                   |
| `sec-17`    | EU AI Act conformity assessment              | EU geography                           | Newly operationalizing — first-mover advantage if mature, exposure if not |
| `sec-18`    | Data classification framework                | High data sensitivity                  | PII/financial requires segmented controls, not flat operational handling  |

The questions without entries in the trigger map (`arch-01`, `ops-01`, `ops-02`, `sec-01`, `sec-07`, `sec-08`) are universal — every diligence covers them. The personalization value is in the rest.

### Attention areas (proactive risk callouts)

These are _not_ questions — they are themes the engine wants you to bring up unprompted in the engagement kickoff because the deal profile elevates them.

| Attention area                   | Relevance | Triggered by                                 | Action implication                                                                                           |
| -------------------------------- | --------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Cross-Border Data Compliance     | **High**  | Multi-region (EU + Canada present)           | Verify DPA paper trail and cross-border transfer mechanisms; don't trust counsel's assertion alone           |
| AI Commodity Risk (Moat Erosion) | **High**  | B2B SaaS                                     | Probe whether AI features are proprietary moats or thin wrappers around third-party APIs                     |
| Sensitive Data Breach Liability  | **High**  | Revenue ≥ $5M + high data sensitivity        | At this scale + sensitivity, breach prep is often immature; recommend pen-test + breach simulation pre-close |
| Canadian Privacy Law Complexity  | Medium    | Canadian geography                           | PIPEDA + provincial overlays (Quebec Law 25, Alberta, BC) — verify provincial coverage                       |
| Data Classification Maturity Gap | Medium    | Scaling growth stage + high data sensitivity | Headcount growth often outpaces governance; validate inventory completeness and offboarding procedures       |

The high-relevance items belong in the kickoff narrative. The medium-relevance items belong in the deeper-dive sessions for the relevant topic owners.

---

## Anchoring in past engagements

In the same conversation, you can pull comparable past engagements via the `search_portfolio` tool to ground the agenda in proper-noun precedent. The natural-language prompt:

> _"Pull our past engagements that touched financial services or fund administration."_

Returns matches from the 61-engagement anonymized dataset. For this deal profile the most useful matches are:

| Codename   | Engagement type              | ARR   | Stack                                                 | Why it's a useful analogy                                                                               |
| ---------- | ---------------------------- | ----- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Fusion** | Sell-Side, Mature Enterprise | A$68M | AWS/EKS, Java/Angular, AI/RAG/SageMaker, Multi-AZ RDS | Closest analogue — fund admin / registry SaaS, cloud-native, multi-region (SG/UK/CA expansion)          |
| **Ultra2** | Buy-Side, Mature Enterprise  | n/a   | Azure/C#/.NET, RPA, Xceptor                           | Different stack but similar fund-management problem space; useful if the target has a legacy .NET core  |
| Fender     | Sell-Side, Early-Stage       | n/a   | Node.js/AWS                                           | Less relevant (Operations Management theme), but demonstrates GST's cloud-migration value-creation work |

How this lands in the engagement:

> _"When we did similar diligence on Fusion — a mature, multi-region, cloud-native financial-services SaaS — the cross-border compliance gaps we found were [X]. We'd want to compare your target's posture against that baseline."_

Anchoring in proper-noun precedents (even anonymized codenames) carries more weight in stakeholder conversations than abstract risk lists.

---

## The iteration pattern

The website wizard's value proposition is the visual scaffolding. The MCP server's value proposition is **fast re-runs in the same conversation**. The iteration patterns below are sub-second; each one is a single sentence in the chat.

| Pivot                    | Prompt                                                   | What changes in the agenda                                                                |
| ------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Different deal structure | _"Now run it as a carve-out instead of majority-stake."_ | `ci-08` (duplicate systems) drops out; carve-out separation questions surface             |
| Different size           | _"What if ARR is $120M instead of $50M?"_                | `revenueRange: 100m+` triggers more enterprise-tier questions                             |
| Add UK                   | _"Add UK to the geographies."_                           | UK-specific questions appear (UK-GDPR, ICO posture); compounds with EU                    |
| Drop EU                  | _"Actually they pulled out of EU last year."_            | `sec-05` (GDPR), `sec-17` (EU AI Act) drop out; agenda becomes shorter                    |
| Lower sensitivity        | _"Data sensitivity is moderate, not high."_              | `sec-18` and the breach-liability attention area drop out                                 |
| Different transformation | _"They're stable, no major modernization in flight."_    | Transformation-state-specific questions adjust; "actively-modernizing" risk callouts drop |

Each pivot is a single tool call. Compare to the website-wizard equivalent: re-open the wizard, click through 13 steps, re-render, scroll, copy-paste new content into your draft.

---

## Reshape the same output without re-running the engine

Once you have the agenda, Claude can reshape it without invoking the engine again. The questions are now in conversation context; transformation is pure prompting:

| Reshape goal                       | Prompt                                                                                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| High-priority subset only          | _"Give me just the high-priority questions, organized by topic."_                                                                        |
| Per-interview split                | _"Split this agenda by audience: CTO vs CISO vs M&A Lead, in three separate sections."_                                                  |
| Reverse map (risks → questions)    | _"For each attention area, list the specific questions that probe it."_                                                                  |
| Convert to interview-script format | _"Rewrite each question as a conversational interview prompt with one follow-up probe."_                                                 |
| Generate a kickoff brief           | _"Draft a one-page kickoff brief that names the 3 high-relevance attention areas and the 5 highest-priority questions per topic owner."_ |

These are the operations that previously required manual extraction from the wizard's UI.

---

## Why this matters (the value summary for stakeholders)

| Concern                                   | Pre-MCP workflow                                                 | MCP workflow                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Time to first draft                       | 10-15 min (browser context-switch, click-through, transcription) | < 30 seconds (one prose prompt)                                                         |
| Time to re-run with changed inputs        | Same as initial draft                                            | Sub-second (same conversation, single sentence)                                         |
| Anchoring in past engagements             | Manual recall or open `/ma-portfolio` and search visually        | Inline tool call in the same thread, results pasted alongside                           |
| Re-shaping output for different audiences | Manual extraction and reformatting                               | Prompt-driven; data is already in conversation                                          |
| Engine drift risk                         | Two surfaces (web + MCP) → divergence possible                   | Both surfaces call the same `generateScript` engine — by construction, identical output |

The engine is not new. The 61-engagement dataset is not new. **What is new is putting both inside the conversation that's writing the proposal, prepping the call, or briefing the analyst** — without any context-switch.

---

## Reproducing this walkthrough

To run the exact scenario in this document:

1. Set up the MCP server per [`mcp-server/README.md`](../../../README.md) → "Install & build" and "Configure clients" sections.
2. In a fresh Claude conversation with the `gst` server enabled, paste the prose prompt under [What you actually type](#what-you-actually-type).
3. Compare the agenda against the structure under [What the agenda the engine returns](#the-agenda-the-engine-returns).

Outputs will be byte-identical to those documented here. The engine is deterministic; the trigger map and attention areas are direct functions of the 13 inputs.

For other use cases (comparable-deal recall, pitch / scope mapping), see [`mcp-server/README.md` → Why this exists (use cases)](../../../README.md#why-this-exists-use-cases).

---

## Related documentation

- [`mcp-server/README.md`](../../../README.md) — install, configure, tool inventory, troubleshooting
- [`src/docs/development/MCP_SERVER_ARCHITECTURE_BL-031.md`](../../../../src/docs/development/MCP_SERVER_ARCHITECTURE_BL-031.md) — architecture and design rationale
- [`src/docs/development/BACKLOG.md` § BL-031](../../../../src/docs/development/BACKLOG.md) — initiative scope, acceptance criteria, sibling phases
- [`mcp-server/src/docs/testing/README.md`](../testing/README.md) — workspace testing conventions

---

_Last Updated: 2026-04-28_
