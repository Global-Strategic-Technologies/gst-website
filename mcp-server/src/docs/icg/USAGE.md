# Usage — `assess_infrastructure_cost_governance`: An ICG Maturity Walkthrough

A complete, reproducible end-to-end example of using the [`@gst/mcp-server`](../../../README.md) `assess_infrastructure_cost_governance` tool for a real-shaped task: scoring a target company's Infrastructure Cost Governance maturity as part of a buy-side technology diligence and producing a prioritized remediation list.

This document is a **stakeholder orientation aid** — it answers "what does it actually look like to use this" without requiring the reader to install the server first. Every input and output below is reproducible by anyone with the MCP server registered in their Claude client.

> Companion docs: [`CONTRACT.md`](./CONTRACT.md) (per-field input reference) | [`../contracts/README.md`](../contracts/README.md) (registry of all per-tool contracts).

> **The deal in this document is hypothetical.** No real client, target, or codename. Question IDs (`q1_1`, `q2_2`, etc.) and recommendation IDs (`r03`, `r07`, etc.) are real — pulled from `src/data/infrastructure-cost-governance/domains.ts` and `recommendations.ts` — but the assessment itself is illustrative.

---

## The scenario

A PE deal team is mid-way through a buy-side technology diligence on a Series B–C SaaS target — ~$30M ARR, ~80 engineers, AWS-native, multi-region. The target has scaled fast over the last 18 months and the deal hypothesis depends on operating-leverage expansion. The team needs an honest read on whether the cost-governance discipline can support 3× revenue growth without blowing up the cloud bill.

In the pre-MCP workflow, scoring the target meant:

1. Open `globalstrategic.tech/hub/tools/infrastructure-cost-governance` in a browser.
2. Click through the 6-domain wizard answering each question (~30 questions total).
3. Read the rendered overall score, per-domain scores, and recommendations.
4. Copy the prioritized remediation list into the deal memo.
5. Re-open the wizard if a follow-up management interview shifts an answer.

In the MCP workflow, the assessment happens inside the Claude conversation that's already drafting the diligence findings — no tab switch, no transcription, and the `companyStage` context is passed in once for benchmark contextualization.

---

## What you actually type

Inside any Claude client where the GST MCP server is registered (Claude Desktop, Claude Code, Cursor — see the [MCP server README](../../../README.md) for setup), describe the target's posture in prose:

> _"Score this target's ICG maturity. Series B–C SaaS, AWS-native. Tagging is enforced via SCP but the standard is half-finished — only ~60% of resources are properly tagged. They have monthly Cost Explorer dashboards but no per-team showback or chargeback. RIs / Savings Plans cover ~30% of compute. They've never run a cost-anomaly drill, but Slack alerts fire on >20% week-over-week spend deltas. They haven't formalized a FinOps team yet — one platform engineer owns it part-time. They use multi-AZ but no multi-region; backups are tested ad hoc. Container right-sizing is unmeasured. Pre-prod environments stay up 24/7. No spot or graviton adoption."_

Claude reads the prose, identifies that the `mcp__gst__assess_infrastructure_cost_governance` tool fits the request, maps the prose phrases to question IDs and 0–3 maturity scores, and calls the tool. For orientation, here is what Claude derives — the full per-question and per-score reference is in [`CONTRACT.md`](./CONTRACT.md):

| Question ID | Subject (paraphrase)                            | Score | Source phrase                                   |
| ----------- | ----------------------------------------------- | ----- | ----------------------------------------------- |
| `q1_1`      | Resource tagging coverage                       | `1`   | "half-finished... only ~60%"                    |
| `q1_2`      | Tag enforcement (policy + automation)           | `2`   | "enforced via SCP"                              |
| `q1_3`      | Cost-allocation reporting (showback/chargeback) | `1`   | "monthly Cost Explorer... no per-team showback" |
| `q2_1`      | Anomaly detection                               | `1`   | "Slack alerts on >20% week-over-week"           |
| `q2_2`      | Cost-anomaly drills / runbooks                  | `0`   | "never run a cost-anomaly drill"                |
| `q3_1`      | Reserved-instance / commitment coverage         | `1`   | "RIs / Savings Plans cover ~30%"                |
| `q3_2`      | Spot / preemptible adoption                     | `0`   | "no spot or graviton"                           |
| `q4_1`      | Right-sizing discipline                         | `0`   | "Container right-sizing is unmeasured"          |
| `q4_2`      | Pre-prod cost discipline                        | `0`   | "Pre-prod stays up 24/7"                        |
| `q5_1`      | FinOps team structure                           | `1`   | "one platform engineer... part-time"            |
| `q6_1`      | DR / multi-region readiness                     | `1`   | "multi-AZ but no multi-region"                  |
| `q6_2`      | Backup/restore drills                           | `1`   | "backups tested ad hoc"                         |

`companyStage: "series-bc"` (extracted from "Series B–C SaaS").

If a phrase is ambiguous, Claude asks a follow-up before calling the tool — e.g., _"You said tagging is 'half-finished' at 60% coverage — does the SCP block untagged resources from being created, or only flag them retroactively? Block-on-create is `2` (Established); flag-only is `1` (Ad hoc)."_

---

## The assessment the engine returns

The engine produces an `ICGResult` with overall + per-domain scores, a maturity level, recommendation list, and benchmark contextualization (when `companyStage` is supplied).

### Headline numbers

- **Overall score: 31/100 — `Aware`** (the second-lowest tier; just above `Reactive`)
- **Stage benchmark**: Series B–C typically falls 30–55. **Within range, low end** — not unusual for the stage but not a leverage point either.
- **Foundational gap flagged**: Domain 1 (Visibility & Tagging) and Domain 4 (Optimization Discipline) score below the 33-point foundational threshold.
- **6 domains scored, 12 of ~30 questions answered** — the rest are unanswered (treated as zero) or `-1` ("Not sure")

### Per-domain breakdown

| Domain                                 | Score | Maturity | Foundational? | Below threshold? |
| -------------------------------------- | ----- | -------- | ------------- | ---------------- |
| 1 — Visibility & Tagging               | 31    | Aware    | ✅            | (just under)     |
| 2 — Anomaly Detection & Response       | 17    | Reactive |               |                  |
| 3 — Commitment-Based Discount Strategy | 17    | Reactive |               |                  |
| 4 — Optimization Discipline            | 0     | Reactive | ✅            | **✅**           |
| 5 — FinOps Operating Model             | 33    | Aware    |               |                  |
| 6 — Resilience & Recovery Posture      | 33    | Aware    |               |                  |

### Recommendations (sorted high-impact first)

The engine returns the subset of `RECOMMENDATIONS[]` whose `triggerQuestionId` answer is `≤ triggerThreshold`. For this assessment, the high-impact items surface first:

| Rec ID | Impact | Effort     | Domain | Title                                                        |
| ------ | ------ | ---------- | ------ | ------------------------------------------------------------ |
| `r07`  | High   | quick-win  | d4     | Audit pre-prod environment shutdown windows                  |
| `r12`  | High   | quick-win  | d4     | Implement automated container right-sizing recommendations   |
| `r03`  | High   | project    | d1     | Backfill the resource-tagging standard to 95%+ coverage      |
| `r15`  | High   | project    | d3     | Build a 12-month commitment-coverage roadmap targeting ≥ 65% |
| `r09`  | Medium | quick-win  | d2     | Run a quarterly cost-anomaly drill                           |
| `r18`  | Medium | initiative | d5     | Stand up a part-time FinOps guild with cross-team reps       |

The trigger logic is deliberately additive — answering a question higher (e.g. moving `q4_1` from `0` to `2`) drops `r12` from the list. Recommendations are sorted by impact (high / medium / low), then effort (quick-win / project / initiative), then domain order.

---

## Anchoring against the deal hypothesis

The deal hypothesis depends on operating-leverage expansion. The ICG assessment validates whether the cost-governance discipline can absorb 3× revenue growth. Three findings carry directly into the deal model:

1. **Domain 4 score of 0** — pre-prod 24/7 + unmeasured right-sizing means cloud costs are growing roughly linearly with usage, not sub-linearly. At 3× revenue, a back-of-envelope says cloud spend grows ≥ 3× too. Quick-wins (`r07`, `r12`) typically reduce cloud spend by 15–30% within a quarter; that's the operating-leverage upside the deal needs.
2. **Foundational gap on Visibility & Tagging** — without complete tagging, per-customer unit economics aren't computable. Any post-close pricing-tier rationalization or unit-economics-driven cost-out work is blocked until tagging is at 95%+.
3. **Stage benchmark says "low end of normal"** — the target isn't an outlier, but they're not a leader either. The remediation list is the operating-improvement plan; a willing CIO can execute most of it within a year.

In the same conversation, you can pivot to other tools:

> _"Pull comparable past engagements that had similar Series B–C cost-governance gaps — what did remediation look like and how long did it take?"_

→ `search_portfolio { search: "FinOps", engagement: "Buy-Side" }` returns relevant engagements; their challenge / solution paragraphs are inline reference for the deal memo.

> _"What regulations apply if this target is in EU + UK and handles customer data?"_

→ `search_regulations { jurisdiction: "eu" }` plus `gst://regulations/gb/dpa` Resource — establishes the compliance overlay that affects right-sizing decisions (some workloads can't shed capacity below regulatory minimums).

---

## The iteration pattern

The website wizard's value proposition is the visual scaffolding (radar chart, sub-domain breakdowns). The MCP server's value proposition is **fast re-runs in the same conversation**. The iteration patterns below are sub-second; each is a single sentence in the chat.

| Pivot                     | Prompt                                                                         | What changes                                                                       |
| ------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Different stage benchmark | _"What if this were a PE-backed target instead of Series B–C?"_                | Benchmark range shifts to 45–70; the same overall score now reads as "below range" |
| Stronger Domain 4         | _"They actually shut down pre-prod nightly and use spot for batch."_           | `q4_1: 2`, `q4_2: 2`, `q3_2: 2` → Domain 4 score climbs, foundational flag clears  |
| Add FinOps maturity       | _"They just hired a dedicated FinOps lead, six months in."_                    | `q5_1: 2` → Domain 5 climbs to 50ish (Optimizing); operating-model gap recedes     |
| Drop foundational tagging | _"Tagging is now at 90% with hard SCP enforcement."_                           | Foundational flag for Domain 1 clears; `r03` drops from recommendations            |
| Add a "Not sure" for DR   | _"Actually we don't know if they've ever DR-tested — set q6_2 to 'Not sure'."_ | `q6_2: -1` → counted in `skippedCount`; Domain 6 score drops slightly              |

Each pivot is a single tool call. Compare to the website-wizard equivalent: re-open the wizard, navigate to the affected question, change the answer, re-render, scroll through the entire result panel.

---

## Reshape the same output without re-running the engine

Once you have the assessment, Claude can reshape it without invoking the engine again. The result is now in conversation context; transformation is pure prompting:

| Reshape goal                    | Prompt                                                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Quick-wins-only list            | _"Give me just the quick-win recommendations, ranked by impact."_                                                                                      |
| Per-domain remediation timeline | _"For each domain that scored below 50, draft a 90-day remediation plan with the relevant recommendations grouped by quarter."_                        |
| Convert to deal-memo language   | _"Rewrite the foundational-gap finding as a one-paragraph risk callout for the Investment Committee memo, emphasizing the operating-leverage thesis."_ |
| Counter-factual operating model | _"If they hit Strategic on every domain, what would the cloud spend reduction look like at 3× revenue? Give a directional estimate."_                  |
| 100-day plan post-close         | _"Draft a 100-day post-close plan for the new CTO that addresses the foundational gaps first and sequences remediation by team capacity."_             |

These are the operations that previously required manual extraction from the wizard's UI plus separate Claude prompting.

---

## Why this matters (the value summary for stakeholders)

| Concern                                   | Pre-MCP workflow                                       | MCP workflow                                                                           |
| ----------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Time to first assessment                  | 15–25 min (browser, 30-question wizard, reading panel) | < 60 seconds (one prose prompt summarizing what you observed in management interviews) |
| Time to re-run with revised answers       | Same as initial assessment                             | Sub-second (single sentence in the same conversation)                                  |
| Cross-tool integration                    | Manual: open another wizard, switch back, transcribe   | Inline: `search_portfolio`, `search_regulations`, library Resources all in one thread  |
| Re-shaping output for deal-memo audiences | Manual extraction and reformatting                     | Prompt-driven; the structured result is already in conversation                        |
| Engine drift risk                         | Two surfaces (web + MCP) → divergence possible         | Both call the same `calculateResults` engine — by construction, identical output       |

The engine is not new. The 6-domain assessment framework is not new. **What is new is putting both inside the conversation that's drafting the deal memo, briefing the IC, or planning the 100-day post-close work** — without any context-switch.

---

## Reproducing this walkthrough

To run the exact scenario in this document:

1. Set up the MCP server per [`mcp-server/README.md`](../../../README.md) → "Install & build" and "Configure clients" sections.
2. In a fresh Claude conversation with the `gst` server enabled, paste the prose prompt under [What you actually type](#what-you-actually-type).
3. Compare the assessment against the structure under [The assessment the engine returns](#the-assessment-the-engine-returns). Outputs will be byte-identical for the same question-score map.

The engine is deterministic; per-domain scores and the recommendation list are direct functions of the answer map. The benchmark contextualization is also deterministic given the `companyStage`.

---

## Related documentation

- [`mcp-server/README.md`](../../../README.md) — install, configure, tool inventory, troubleshooting
- [`CONTRACT.md`](./CONTRACT.md) — the canonical input contract (per-field reference, valid values, hidden semantics)
- [`../contracts/README.md`](../contracts/README.md) — registry of all per-tool input contracts; what a contract is; the IRL forward-look
- [`src/docs/development/MCP_SERVER_HUB_SURFACE_BL-031_5.md`](../../../../src/docs/development/MCP_SERVER_HUB_SURFACE_BL-031_5.md) — architecture and design rationale for BL-031.5

---

_Last Updated: 2026-04-28_
