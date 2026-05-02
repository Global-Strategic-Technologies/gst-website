# Usage — `compute_techpar`: A Tech-Cost Benchmarking Walkthrough

A complete, reproducible end-to-end example of using the [`@gst/mcp-server`](../../../README.md) `compute_techpar` tool for a real-shaped task: benchmarking a target's technology cost ratio against stage-specific peer ranges as input to a buy-side investment thesis.

This document is a **stakeholder orientation aid** — it answers "what does it actually look like to use this" without requiring the reader to install the server first. Every input and output below is reproducible by anyone with the MCP server registered in their Claude client.

> Companion docs: [`CONTRACT.md`](./CONTRACT.md) (per-field input reference) | [`../contracts/README.md`](../contracts/README.md) (registry of all per-tool contracts).

> **The deal in this document is hypothetical.** No real client, target, or codename. Stage labels, zone names, and benchmark ranges are real — they come from `src/data/techpar/stages.ts` — but the example numbers are illustrative.

---

## The scenario

A PE deal team is in the LOI stage of a buy-side process on a vertical SaaS target. The target's CFO shared a P&L breakdown showing technology spending at 24% of ARR. The deal partner asks: _"Is 24% high, low, or about right for this stage and growth profile? And if it's high, what's the size of the cumulative excess we'd want priced into the model?"_

In the pre-MCP workflow, answering this meant:

1. Open `globalstrategic.tech/hub/tools/techpar` in a browser.
2. Click through the 14-input form (ARR, stage, growth rate, exit multiple, infra hosting, R&D OpEx/CapEx, eng FTE, eng/prod/tooling cost...).
3. Read the rendered zone classification, KPIs, and 36-month projection.
4. Copy the cumulative-excess number into the deal model.
5. Re-open the wizard if a sensitivity analysis is needed.

In the MCP workflow, the benchmarking happens inside the Claude conversation that's already drafting the IC memo. Sensitivity analyses become single-sentence pivots.

---

## What you actually type

Inside any Claude client where the GST MCP server is registered (Claude Desktop, Claude Code, Cursor — see the [MCP server README](../../../README.md) for setup), describe the deal in prose:

> _"Run TechPar on this target. Series B–C SaaS, $25M ARR, growing 30% YoY, exit multiple 12×. Cash basis. Annual infra hosting is $960K (so $80K/month), infra personnel $600K/year, R&D OpEx $4M, R&D CapEx $500K. They have 25 engineers."_

Claude reads the prose, identifies that the `mcp__gst__compute_techpar` tool fits the request, extracts the 14 inputs, and calls the tool. For orientation, here is what Claude derives — the full per-field reference is in [`CONTRACT.md`](./CONTRACT.md):

| Schema field         | Resolved value | Source phrase                                           |
| -------------------- | -------------- | ------------------------------------------------------- |
| `arr`                | `25_000_000`   | "$25M ARR"                                              |
| `stage`              | `series_bc`    | "Series B–C SaaS"                                       |
| `mode`               | `quick`        | (default — no `engCost`/`prodCost` split given)         |
| `capexView`          | `cash`         | "Cash basis"                                            |
| `growthRate`         | `30`           | "growing 30% YoY"                                       |
| `exitMultiple`       | `12`           | "exit multiple 12×"                                     |
| `infraHostingAnnual` | `960_000`      | "$80K/month → $960K/year" (BL-031.95: schema is annual) |
| `infraPersonnel`     | `600_000`      | "$600K/year"                                            |
| `rdOpEx`             | `4_000_000`    | "R&D OpEx $4M"                                          |
| `rdCapEx`            | `500_000`      | "R&D CapEx $500K"                                       |
| `engFTE`             | `25`           | "25 engineers"                                          |
| `engCost`            | `0`            | (deepdive-only — set 0 in `quick`)                      |
| `prodCost`           | `0`            | (deepdive-only — set 0 in `quick`)                      |
| `toolingCost`        | `0`            | (deepdive-only — set 0 in `quick`)                      |

If a phrase is ambiguous, Claude asks a follow-up before calling the tool — e.g., _"You said R&D OpEx is $4M — does that include the $500K CapEx, or are they separate? TechPar treats them as separate; I'm assuming separate."_

---

## The benchmark the engine returns

The engine produces a `TechParResult` with total tech cost as % of ARR, zone classification, per-category KPIs, and a 36-month gap projection.

### Headline numbers

- **Total tech cost: $6.06M/yr — 24.2% of ARR**
- **Zone: `above`** (Series B–C benchmark band: 18–22% — target is one band above)
- **36-month cumulative excess at current trajectory: ~$3.4M** (the spend over the 22% ceiling, compounded by 30% growth)
- **Exit-value impact at 12×: ~$40.8M** of EBITDA-equivalent value at risk

### Per-category KPIs

| Category        | Spend    | % of ARR | Stage benchmark    | Zone    |
| --------------- | -------- | -------- | ------------------ | ------- |
| Infra hosting   | $960K/yr | 3.8%     | 2–4%               | healthy |
| Infra personnel | $600K/yr | 2.4%     | 1.5–3%             | healthy |
| R&D OpEx        | $4.0M/yr | 16.0%    | 12–14%             | above   |
| R&D CapEx       | $500K/yr | 2.0%     | (derived 1.6–2.7%) | healthy |

The R&D OpEx category is the elevated bucket. Infra is in-band; CapEx-of-R&D ratio looks normal.

### Headline KPIs (additional context)

- **Revenue per engineer: $1.0M** (engFTE = 25, ARR = $25M) — at the median for Series B–C SaaS; below leaders (~$1.5M+).
- **Blended infra ratio: 6.2%** of ARR — within the 5.5–7% band typical for the stage.
- **CapEx-as-%-of-R&D: 11.1%** — modest capitalization, consistent with a software-heavy R&D mix.

---

## Anchoring the finding in the deal model

The cumulative-36-month excess is the headline number for the deal partner. Three uses:

1. **Pricing the gap into the model.** $3.4M cumulative excess × 12× exit multiple = $40.8M of value at risk if the spending pattern continues unchanged. This figure goes into the deal model as a separate line: _"Tech-cost normalization opportunity, 36-month."_
2. **Operating-improvement thesis.** R&D OpEx is the elevated bucket. Two structural levers: increase revenue per engineer (better PM discipline, fewer abandoned products), or reduce R&D headcount (typically the wrong move at scaling stage). The investment thesis should make this lever explicit.
3. **Stage-shift sensitivity.** If the target is closer to PE-backed than Series B–C (i.e., the maturity is further along than the current funding round suggests), the benchmark shifts and the zone might re-classify. Worth checking — see iteration patterns below.

In the same conversation, you can pivot to other tools:

> _"Pull comparable past engagements where TechPar showed 'above' or 'elevated' zones — what did remediation look like?"_

→ `search_portfolio { search: "tech-cost", engagement: "Buy-Side" }` returns relevant engagements for inline reference.

> _"What's the regulatory cost overlay for this target if they operate in EU + US with PII?"_

→ `search_regulations { jurisdiction: "eu", category: "data-privacy" }` plus `search_regulations { jurisdiction: "us-ca" }` — establishes the compliance overhead that constrains the cost-out levers.

---

## The iteration pattern

The website wizard's value proposition is the visual scaffolding (zone bar, trajectory chart). The MCP server's value proposition is **fast sensitivity analysis in the same conversation**. The iteration patterns below are sub-second.

| Pivot               | Prompt                                                                              | What changes                                                                             |
| ------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Different stage     | _"What if I bench this against PE stage instead?"_                                  | Stage benchmark band shifts to 12–16%; the same 24.2% reads as `elevated`, not `above`   |
| GAAP basis          | _"Show it on a GAAP basis instead of cash."_                                        | Total drops by `rdCapEx` (CapEx excluded); `totalTechPct` drops ~2pp; zone may shift     |
| Higher growth       | _"Sensitize for 50% YoY growth instead of 30%."_                                    | 36-month cumulative excess scales up — fast growth amplifies overspend                   |
| Lower exit multiple | _"What if we model a 6× exit multiple, recession scenario?"_                        | Exit-value impact halves; the partner cares less about long-tail excess at low multiples |
| Add deepdive split  | _"R&D OpEx is split: $2.4M eng cost, $1M product, $600K tooling. Re-run deepdive."_ | Mode flips to `deepdive`; per-category KPIs gain `engPctOfRD`, `prodPctOfRD`             |
| Different size      | _"What if ARR is $50M instead of $25M, same spending?"_                             | All percentages halve; zone re-classifies to `healthy` or `ahead` (over-investment path) |

Each pivot is a single tool call. Compare to the website-wizard equivalent: re-open the wizard, edit one input, re-render, scroll through the result panel.

---

## Reshape the same output without re-running the engine

Once you have the benchmark, Claude can reshape it without invoking the engine again. The structured result is now in conversation context:

| Reshape goal                        | Prompt                                                                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deal-memo paragraph                 | _"Write a one-paragraph IC-memo finding on the tech-cost ratio, leading with the cumulative excess number."_                                                  |
| Sensitivity table                   | _"Build a sensitivity table for cumulative excess: rows = growth rate (10/30/50%), columns = stage (Series A / Series B–C / PE). I'll re-run for each cell."_ |
| Operating-leverage scenario         | _"If R&D OpEx normalizes to the top of the band over 18 months, what's the implied EBITDA expansion at exit? Be explicit about assumptions."_                 |
| Counter-position the seller's pitch | _"The seller's banker is positioning the 16% R&D OpEx as 'investment for growth.' Counter-frame using the benchmark and the zone classification."_            |
| Convert to executive briefing slide | _"Draft a single-slide summary for the deal partner: zone, gap, three operating levers, three diligence priorities."_                                         |

These are operations that previously required manual extraction from the wizard's UI plus separate Claude prompting on the extracted numbers.

---

## Why this matters (the value summary for stakeholders)

| Concern                         | Pre-MCP workflow                                 | MCP workflow                                                                           |
| ------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Time to first benchmark         | 5–10 min (browser, 14-input form, reading panel) | < 30 seconds (one prose prompt with the numbers from the seller's P&L)                 |
| Time to re-run with sensitivity | Same as initial benchmark                        | Sub-second (single sentence in the same conversation)                                  |
| Cross-tool integration          | Manual context-switch                            | Inline: `search_portfolio` analogues, `search_regulations` overlays, library Resources |
| Sensitivity / scenario analysis | Painful (re-key 14 inputs each time)             | Trivial (change one number in prose)                                                   |
| Engine drift risk               | Two surfaces (web + MCP) → divergence possible   | Both call the same `compute` engine — by construction, identical output                |

The engine is not new. The stage-specific benchmark bands are not new. **What is new is putting both inside the conversation that's drafting the IC memo, building the sensitivity table, or rebutting the seller's positioning** — without any context-switch.

---

## Reproducing this walkthrough

To run the exact scenario in this document:

1. Set up the MCP server per [`mcp-server/README.md`](../../../README.md) → "Install & build" and "Configure clients" sections.
2. In a fresh Claude conversation with the `gst` server enabled, paste the prose prompt under [What you actually type](#what-you-actually-type).
3. Compare the benchmark against the structure under [The benchmark the engine returns](#the-benchmark-the-engine-returns). Outputs will be byte-identical for the same input vector.

The engine is deterministic; per-category zones, KPIs, and the 36-month projection are direct functions of the 14 inputs and the stage configuration in `src/data/techpar/stages.ts`.

---

## Related documentation

- [`mcp-server/README.md`](../../../README.md) — install, configure, tool inventory, troubleshooting
- [`CONTRACT.md`](./CONTRACT.md) — the canonical input contract (per-field reference, valid values, mode/capexView interactions, zone classification rules)
- [`../contracts/README.md`](../contracts/README.md) — registry of all per-tool input contracts; what a contract is; the IRL forward-look
- [`src/docs/development/MCP_SERVER_HUB_SURFACE_BL-031_5.md`](../../../../src/docs/development/MCP_SERVER_HUB_SURFACE_BL-031_5.md) — architecture and design rationale for BL-031.5

---

_Last Updated: 2026-04-28_
