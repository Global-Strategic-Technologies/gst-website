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

## Per-engagement IRL drift — decision flow

The Gap-detection workflow above covers the **forward** direction: a new Hub tool ships and needs an input the IRL doesn't yet capture. This section covers the **inverse**: a specific engagement's filled IRL contains content that diverges from the canonical article — added bullets, deleted bullets, rephrased questions, or entirely new sections.

**Why this matters**: every filled IRL flows through `gst_irl_ingestion` (BL-032.6), which reads the whole markdown body as the `filledIrl` arg and dispatches a parallel fan-out across nine Hub tools. The model is the routing layer between unstructured IRL text and structured tool inputs. Three things determine whether a per-engagement deviation flows through cleanly or needs an engineering response: (1) does the data point map to an existing tool's Zod schema, (2) does it need a structured score or just narrative surfacing, (3) is it a one-off or a repeatable pattern worth promoting to canonical.

### Decision table

| Situation                                                                                                                                         | Right path                                                                                                                                                                                                                                                                                                                              | Code change?                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Rephrasing or splitting an existing bullet (clarity edit; same underlying request)                                                                | Edit the bullet text in `article.md`. The model maps the new phrasing to the same tool input via semantics. Update this doc's mapping row if the bullet's wording changes materially. Update the parser regression test's `EXPECTED_SECTIONS` if section / bullet counts shift.                                                         | Canonical-article edit only.                                |
| New bullet whose answer is consumable by an **existing** tool (e.g., a more granular cost field that fits `TechParInputs.toolingCost`)            | Edit `article.md`, add a row to this doc pointing the new bullet at the existing tool input. No tool schema change.                                                                                                                                                                                                                     | Canonical-article edit only.                                |
| New bullet whose answer fits an existing analysis **dimension** but the tool's Zod schema has no slot for it                                      | Extend the tool's Zod schema with an additive optional field. Update the tool's wrapper, unit tests, and this doc's mapping. Bump `mcp-server` patch version per the semver-as-contract discipline.                                                                                                                                     | Small — one tool's schema + tests.                          |
| New bullet introducing a **qualitative** dimension that doesn't benefit from structured scoring (e.g., cultural fit observation, key-person risk) | Edit `article.md`. Accept that the data flows through `gst_irl_ingestion` into the model's narrative layer (Context section, Open Questions section, or inline editorial annotation on a structured section). Update this doc's "Cross-cutting reads" table or per-section table noting the bullet is narrative-only by design.         | Canonical-article edit only.                                |
| New bullet introducing a **quantifiable** dimension worth scoring (e.g., supply-chain risk index, vendor-concentration ratio)                     | Ship a new MCP tool with its own Zod input schema + pure-function compute + MCP wrapper. Add it to `gst_irl_ingestion`'s `orchestrates`. Add the IRL bullet pointing at the new tool's input. Bump `mcp-server` minor version. Pattern reference: BL-031 / BL-031.5 / BL-031.95 (~2-4 hours per tool).                                  | Full surface — new tool ship.                               |
| Engagement deletes a bullet because the data was supplied separately (existing deck, prior call)                                                  | **Don't delete.** Convention: keep the bullet, write the value or a pointer ("see attached XYZ deck") in the Response cell. Maintains Reference ID stability across engagements and across the `gst_irl_ingestion` analysis surface.                                                                                                    | None — convention only.                                     |
| Engagement deletes a bullet because the question is genuinely N/A (e.g., asking ML/AI questions of a target with no ML/AI)                        | **Don't delete.** Write "n/a" in the Response cell per the Instructions sheet discipline. The presence of "n/a" is signal; absence is ambiguity. The model treats "n/a" as "verified no" rather than the `'unknown'` widening behavior the Diligence Machine applies to missing data.                                                   | None — convention only.                                     |
| Engagement adds a new section (e.g., "10 — Marketing Operations")                                                                                 | Parser accepts it (any section count). Reference IDs continue to work (`10-01`, `10-02`, ...). The model reads the section in `filledIrl`. **But** there's no Hub tool consuming Marketing Ops inputs — the section lives in narrative only. If the pattern repeats across engagements, promote it to canonical via the row-3 path.     | Canonical-article edit IF promoted; otherwise none.         |
| A pattern of per-engagement additions reappears across 3+ engagements                                                                             | Promote to canonical. Edit `article.md`. If the new bullets cluster under an existing tool, extend that tool's schema (row 3). If they cluster as a new analysis dimension, ship a new tool (row 5). Update this doc's mapping. **Don't let canonical drift behind reality** — that's how the "single source of truth" property erodes. | Varies — driven by whether a new analysis dimension exists. |

### Operator action checklist (any drift response)

After picking a row above, the universal closure steps:

1. **Update the canonical article** (`src/data/library/information-request-list/article.md`) if the change is canonical, OR keep the per-engagement IRL as a local copy if it's truly one-off.
2. **Update this mapping doc** so a future reader can trace every bullet to its consumer.
3. **Run `npm -w @gst/mcp-server run prebuild`** to regenerate `library-data.generated.ts` from the article.
4. **Update the parser regression test** (`mcp-server/tests/unit/lib/parse-irl-article.test.ts`) if section / bullet counts changed — the `EXPECTED_SECTIONS` constant locks the shape intentionally.
5. **Re-record the prompt golden** (`mcp-server/tests/examples/information-request-list.golden.md`) if the article shape change is material enough to alter the deliverable's structure.
6. **Bump versions** if a tool surface changed: extend-schema → patch; new tool → minor; rename/remove → major (avoid).

### What NOT to do

- **Don't add a hardcoded check** in the parser / generator that an engagement-specific bullet is present. The parser is intentionally schema-agnostic; the moment we add "bullet X must exist" we trade extensibility for false safety.
- **Don't author per-engagement forks of `article.md`**. The single-source-of-truth property is load-bearing for both the agent-pinned Resource and the partner-printed PDF — divergent copies break that.
- **Don't reach for a new MCP tool reflexively**. For qualitative dimensions, narrative-only is the highest-fidelity output the dossier can produce; a structured score would hide the nuance.
- **Don't skip the mapping-doc update** when adding a bullet. The discipline is what keeps canonical drift bounded over a 6-12 month horizon.

### Future evolution lanes (not yet implemented)

- **[BL-044.5 candidate](../../../../src/docs/development/BACKLOG.md) — subtractive content-filter directives**: tag bullets and sections in `article.md` with hidden HTML comments like `<!-- skip-if: productType=b2c -->`. The parser would filter at AST-construction time; every downstream surface (XLSX, prompt, Hub page) consumes the filtered output from one source. Lets a single canonical article serve many engagement types without per-project forking.
- **[BL-045 PR B — shipped](../../../../src/docs/development/MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md) — `gst_irl_ingestion`**: BL-032.6's `gst_diligence_sweep` was renamed to `gst_irl_ingestion` under BL-045 PR B and hardened with explicit inclusion gates + tool-input audit schemas. The IRL → tool-input mapping is now enforced at the MCP tool-schema boundary (audit-bearing `_audit` siblings with cross-field calibration refinements) rather than relying solely on prompt prose, closing the "implicit-inside-sweep" gap this stanza originally flagged.

When either lane ships, this section should be updated to reference the new mechanism.

### Generator custom requests are NOT canonical (2026-07)

The BL-044 generator now lets a partner **filter sections** and **append ad-hoc `customRequests`** to individual sections at generation time (both surfaces, via `src/utils/irl/customize-article.ts`). These custom requests are **section-scoped and engagement-local** — they do not add rows to `article.md` and therefore carry no entry in this mapping. They are exactly the "keep the per-engagement IRL as a local copy if it's truly one-off" path in the operator checklist above; if a custom request recurs across 3+ engagements, promote it to canonical via the row-3 path (which _does_ update this doc). The generator cannot mint a brand-new ad-hoc section (e.g., "10 — Marketing Operations") — that still requires the canonical-article edit described in the decision table.

---

_Last updated: 2026-07-02 (added "Generator custom requests are NOT canonical" note under Future evolution lanes for the BL-044 configurability follow-up)._
