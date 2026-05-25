# IRL → Hub Tool Input Mapping (internal SOP)

> **Audience**: GST engineers and senior consultants maintaining the [Information Request List](../../../../src/data/library/information-request-list/article.md) and the Hub tools / MCP prompts that consume the answers it gathers.
>
> **Why this exists**: the public IRL deliberately ships with **no tool attribution** (clean for client consumption — per [BL-043 design decisions](../../../../src/docs/development/MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md#decisions)). This doc is the engineering-side mirror that keeps the "what feeds what" knowledge alive. When a new Hub tool ships and needs an IRL input the artifact doesn't currently ask for, this is the document that surfaces the gap — and the place to record the resolution.
>
> **Maintenance discipline**: every IRL change (`src/data/library/information-request-list/article.md`) ships with a corresponding update to this file in the same PR. Every new Hub tool / MCP prompt that needs partner-supplied input adds a row to its respective section here.

---

## Section 00 — Basics

| Bullet                   | Feeds (Hub tool / MCP prompt input)                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Target / client name     | `targetName` arg in `gst_diligence_kickoff`, `gst_target_quick_look`, `gst_diligence_handoff_memo`, `gst_information_request_list` |
| Engagement context       | `transactionContext` arg in `gst_information_request_list`; informs `gst_diligence_kickoff` framing                                |
| Annual recurring revenue | TechPar `arr`; `gst_target_quick_look.arr`                                                                                         |
| Funding stage            | TechPar `stage`; ICG canonical-stage adapter; `gst_target_quick_look.stage`                                                        |
| Business model           | Diligence Machine `productType` derivation; `gst_target_quick_look.productType`                                                    |
| Geographies of operation | Diligence Machine `geographies[]`; `gst_regulatory_exposure_brief.targetJurisdictions[]`                                           |
| HQ jurisdiction          | `gst_target_quick_look.hqJurisdiction`                                                                                             |
| Company age              | Diligence Machine `companyAge`                                                                                                     |
| Total headcount          | Diligence Machine `headcount`; Tech Debt Calculator `teamSize` (engineering subset derived from § 07)                              |
| YoY growth rate          | Diligence Machine `growthStage` derivation; TechPar growth-rate slider                                                             |

## Section 01 — Product

| Bullet                            | Feeds                                                                                                                                                                                                                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One-paragraph product description | `gst_architecture_layer_review.targetSummary`; `gst_information_request_list.productSummary` (light)                                                                                                                                                                          |
| Target market                     | Diligence Machine `productType` (segment hint), `dataSensitivity` (industry hint)                                                                                                                                                                                             |
| Product roadmap snapshot          | (qualitative — informs `gst_diligence_handoff_memo` synthesis section)                                                                                                                                                                                                        |
| Top 3 features by adoption        | (qualitative — informs `gst_target_quick_look` close-line and `gst_diligence_kickoff` attention)                                                                                                                                                                              |
| Customer profile                  | Diligence Machine `scaleIntensity` derivation (concentration risk signal)                                                                                                                                                                                                     |
| Competitive landscape             | `gst_comparable_engagements_memo.targetDescription` context                                                                                                                                                                                                                   |
| Operational scale (low/mod/high)  | Diligence Machine `scaleIntensity` enum (direct). **Lockstep**: bullet wording mirrors [`src/data/diligence-machine/wizard-config.ts:325-340`](../../../../src/data/diligence-machine/wizard-config.ts) verbatim — any wizard-config edit triggers an IRL edit in the same PR |

## Section 02 — Software Architecture

| Bullet                                | Feeds                                                                                              |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| High-level architecture diagram       | `gst_architecture_layer_review` Layer 1 grounding                                                  |
| Technology stack                      | Diligence Machine `techArchetype`; `gst_architecture_layer_review` Layer 1                         |
| Repository organization               | (qualitative — `gst_architecture_layer_review` Layer 1)                                            |
| Engineering FTE count                 | TechPar `engFTEs`; Tech Debt Calculator `teamSize`                                                 |
| Product personnel cost                | TechPar `prodCost` (deep-dive mode); unlocks disaggregated R&D OpEx synthesis                      |
| Annual build and tooling cost         | TechPar `toolingCost`                                                                              |
| Third-party dependency overview       | (qualitative — `gst_architecture_layer_review` Layer 1; future tool: vendor-risk scoring)          |
| Most recent technical-debt assessment | Tech Debt Calculator inputs (`maintPct`, `incidents`, `mttr`); qualitative tone of `targetSummary` |

## Section 03 — Infrastructure & Operations

| Bullet                                           | Feeds                                                                              |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Hosting model                                    | TechPar `infraHosting` framing; `gst_architecture_layer_review` Layer 2            |
| Past 3 months' monthly hosting and infra spend   | TechPar `infraHosting` (annualized — primary input)                                |
| 12–24 mo hosting / infra spend history           | ICG cost-governance trend analysis (Optimizing vs Reactive maturity scoring)       |
| Headcount dedicated to infrastructure operations | TechPar `infraPersonnel`                                                           |
| Monitoring and alerting stack                    | ICG Monitoring domain answers (qualitative; future: explicit ICG question mapping) |
| Deployment frequency to production               | Tech Debt Calculator `deployIdx`                                                   |
| Capacity headroom                                | ICG Infrastructure domain                                                          |
| Material capital expenditure on infrastructure   | TechPar `capexView` toggle (capex-on / capex-off framing)                          |

## Section 04 — SDLC

| Bullet                                          | Feeds                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Development methodology                         | Diligence Machine `operatingModel` derivation                                                     |
| Branching strategy and code-review process      | (qualitative — `gst_architecture_layer_review` Layer 2)                                           |
| Test coverage                                   | Tech Debt Calculator `maintPct` proxy                                                             |
| Production deployment process                   | Tech Debt Calculator `deployIdx`                                                                  |
| Production incidents (24-mo quarterly trend)    | Tech Debt Calculator `incidents`, `mttr`; trend supports stability-improving / -worsening framing |
| Active maintenance burden as % engineering time | Tech Debt Calculator `maintPct`                                                                   |
| Annual remediation investment plan              | Tech Debt Calculator `remediationBudget`; unlocks payback-months projection                       |
| Open bugs by severity                           | Tech Debt Calculator `incidents` quality signal                                                   |
| Engineering operating model                     | Diligence Machine `operatingModel`                                                                |

## Section 05 — Data, Analytics & AI

| Bullet                           | Feeds                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| Data architecture overview       | `gst_architecture_layer_review` Layer 3 (data product surface)                        |
| Data sensitivity classification  | Diligence Machine `dataSensitivity`; `gst_regulatory_exposure_brief.dataCategories[]` |
| ML/AI capabilities in production | (qualitative — informs `gst_target_quick_look` close-line)                            |
| Third-party data dependencies    | (qualitative; future tool: vendor-risk scoring)                                       |
| Analytics stack                  | (qualitative — `gst_architecture_layer_review` Layer 3)                               |

## Section 06 — Security

| Bullet                                       | Feeds                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------------------- |
| Most recent penetration test                 | ICG Security domain answers                                                      |
| Security incident history                    | ICG Security domain; `gst_regulatory_exposure_brief` context                     |
| Access controls                              | ICG Security domain                                                              |
| Compliance certifications maintained         | `gst_regulatory_exposure_brief` framework matching; Regulatory Map filter inputs |
| Business continuity / disaster recovery plan | ICG Security + Infrastructure domains                                            |

## Section 07 — People & Organization

| Bullet                                  | Feeds                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------- |
| Organizational chart                    | Diligence Machine `operatingModel`; `gst_architecture_layer_review` Layer 4 |
| Engineering headcount by role           | TechPar `engFTEs` decomposition; Tech Debt Calculator `teamSize`            |
| Average fully-loaded engineering salary | Tech Debt Calculator `salary`                                               |
| Key-person dependencies                 | Diligence Machine `transformationState` (often correlates)                  |
| Attrition                               | (qualitative — `gst_diligence_handoff_memo` risk section)                   |
| Twelve-month hiring plan                | (qualitative — informs `gst_target_quick_look` close-line)                  |
| Recent organizational transformation    | Diligence Machine `transformationState`                                     |

## Section 08 — Corporate IT

| Bullet                            | Feeds                                                                     |
| --------------------------------- | ------------------------------------------------------------------------- |
| Enterprise applications inventory | ICG Corporate IT overlay (qualitative today; future: explicit ICG domain) |
| Identity and access management    | ICG Security domain overlay                                               |
| Annual IT spend                   | (qualitative — informs `gst_target_quick_look` cost summary)              |

## Section 09 — Governance & Compliance

| Bullet                           | Feeds                                                                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Data categories handled          | `gst_regulatory_exposure_brief.dataCategories[]`; Diligence Machine `dataSensitivity`                                  |
| Jurisdictions of operation       | `gst_regulatory_exposure_brief.targetJurisdictions[]`; Regulatory Map filter inputs; Diligence Machine `geographies[]` |
| Applicable regulatory frameworks | `search_regulations` output; `gst_regulatory_exposure_brief` framework matching                                        |
| Audit history                    | (qualitative — informs `gst_diligence_handoff_memo` risk section)                                                      |
| Data processing agreements       | `gst_regulatory_exposure_brief` cross-border-transfer framing                                                          |

---

## Cross-cutting reads (BL-044 generator)

Some surfaces consume the **whole article body** structurally rather than answering specific bullets. These don't slot into the per-section bullet→input rows above, but the lockstep maintenance discipline still applies — any IRL edit must run `npm -w @gst/mcp-server run test` to confirm the parser regression test ([`mcp-server/tests/unit/lib/parse-irl-article.test.ts`](../../../tests/unit/lib/parse-irl-article.test.ts)) still locks the expected section + bullet counts.

| Consumer                                                | What it reads from the article                                                                                                                                                                                                                               | Stability contract                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`generate_information_request_list_xlsx`** _(BL-044)_ | Title + intro + every section header + every bullet, rendered as one row per bullet in column A of the generated `.xlsx`. Reads via the same `gst://library/information-request-list` Resource the prompt embeds.                                            | Article structure (section count, section numbering scheme, bullet markers) is locked by the [parser regression test](../../../tests/unit/lib/parse-irl-article.test.ts). Section count / bullet count changes are intentional but require updating the expected-shape constants in the test in the same PR.                                                                |
| `gst_information_request_list` v0.0.2+ prompt body      | Embeds the canonical Resource as the second message in both modes; the model reproduces the bullets verbatim in the paste-ready text artifact. When called with args, also orchestrates the XLSX generator (additive behavior — interactive mode unchanged). | Body-mention invariant from `assertPromptInvariants` requires the Resource URI to appear literally in the rendered text; the per-mode `orchestrates` body-mention contract (URI in both modes; tool name in one-shot only) is asserted by [`mcp-server/tests/unit/prompts/information-request-list.test.ts`](../../../tests/unit/prompts/information-request-list.test.ts). |

---

## Gap-detection workflow

When a new Hub tool or MCP prompt ships:

1. List every partner-supplied input it requires.
2. For each input, find the matching IRL bullet in the table above.
3. If no match exists, the IRL has a coverage gap. Resolve in the same PR:
   - **Add a bullet** to `src/data/library/information-request-list/article.md` in the appropriate section.
   - **Add a row** to the corresponding section table above pointing to the new tool input.
   - **Run** `npm -w @gst/mcp-server run prebuild` to regenerate the codegen.
   - **Verify** the `gst_information_request_list` golden file still captures representative output (re-record if the artifact's shape changed materially).

When a Hub tool input is renamed or removed:

1. Grep this doc for the old input name.
2. Update affected rows.
3. If the input no longer exists, decide whether to keep the IRL bullet (it may still be useful for partner-context even without an automated downstream).

---

_Last updated: 2026-05-24 (BL-044 — added "Cross-cutting reads" section documenting the `generate_information_request_list_xlsx` tool's whole-article consumption pattern + lockstep parser-regression-test discipline)._
