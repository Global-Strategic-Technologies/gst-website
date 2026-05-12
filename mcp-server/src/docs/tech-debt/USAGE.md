# Usage — `estimate_tech_debt_cost`: A Debt-as-Deal-Model-Input Walkthrough

A complete, reproducible end-to-end example of using the [`@gst/mcp-server`](../../../README.md) `estimate_tech_debt_cost` tool for a real-shaped task: estimating the carrying cost of a target's accumulated technical debt and the payback economics of a remediation effort, as a defensible figure to anchor in a CTO interview and as an input to the deal model.

This document is a **stakeholder orientation aid** — it answers "what does it actually look like to use this" without requiring the reader to install the server first. Every input and output below is reproducible by anyone with the MCP server registered in their Claude client.

> Companion docs: [`CONTRACT.md`](./CONTRACT.md) (per-field input reference) | [`../contracts/README.md`](../contracts/README.md) (registry of all per-tool contracts).

> **The deal in this document is hypothetical.** No real client, target, or codename. Deployment-frequency labels and DORA tiers are real — they come from `src/utils/tech-debt-engine.ts` `DEPLOY_OPTIONS` — but the example numbers are illustrative.

---

## The scenario

A buy-side deal team is mid-CTO-interview. The CTO has just admitted that "maybe 30% of the team's time" goes to maintenance work — bug-fixes, on-call, fighting brittle deployments. The deal partner wants to translate that admission into a defensible dollar figure: _"30% of $X engineering payroll equals $Y/year of carrying cost. Here's the payback math on a $500K remediation budget at 70% efficiency."_

In the pre-MCP workflow, getting that figure meant:

1. Open `globalstrategic.tech/hub/tools/tech-debt-calculator` in a browser.
2. Manipulate the wizard sliders to match the disclosed inputs (sliders quantize values — close approximation, not exact).
3. Read the rendered annual cost, monthly cost, payback period.
4. Transcribe back into the IC memo and deal model.

In the MCP workflow, the figure is computed in the same conversation that's drafting the management interview notes. **Crucially, the MCP tool accepts raw values directly — no slider quantization, no approximation.** The CTO said 30%, you compute on 30%.

---

## What you actually type

Inside any Claude client where the GST MCP server is registered (Claude Desktop, Claude Code, Cursor — see the [MCP server README](../../../README.md) for setup), describe the inputs in prose:

> _"Estimate the carrying cost of this target's tech debt. 8 engineers, $150K average fully-loaded salary, 25% maintenance burden. They deploy bi-weekly. About 3 production incidents per month with 4-hour MTTR. They have a $500K remediation budget reserved and expect 70% efficiency on that. ARR is $10M. Skip the context-switch overhead modeling for this run."_

Claude reads the prose, identifies that the `mcp__gst__estimate_tech_debt_cost` tool fits the request, extracts the 10 raw inputs, and calls the tool. For orientation, here is what Claude derives — the full per-field reference is in [`CONTRACT.md`](./CONTRACT.md):

| Schema field           | Resolved value | Source phrase                         |
| ---------------------- | -------------- | ------------------------------------- |
| `teamSize`             | `8`            | "8 engineers"                         |
| `salary`               | `150_000`      | "$150K average fully-loaded"          |
| `maintenanceBurdenPct` | `25`           | "25% maintenance burden"              |
| `deployFrequency`      | `Bi-weekly`    | "deploy bi-weekly"                    |
| `incidents`            | `3`            | "3 production incidents per month"    |
| `mttrHours`            | `4`            | "4-hour MTTR"                         |
| `remediationBudget`    | `500_000`      | "$500K remediation budget"            |
| `arr`                  | `10_000_000`   | "ARR is $10M"                         |
| `remediationPct`       | `70`           | "70% efficiency"                      |
| `contextSwitchOn`      | `false`        | "Skip the context-switch... modeling" |

If a phrase is ambiguous, Claude asks a follow-up before calling the tool — e.g., _"You said 'maybe 30%' for maintenance burden — should I use 30, or did the bi-weekly deploy cadence and 3 incidents/month suggest something more like 25%? Both are plausible; the engine is sensitive to this."_

---

## The estimate the engine returns

The engine produces a `CalcResult` with monthly + annual cost decomposition, payback economics, and DORA classification.

### Headline numbers

- **Annual carrying cost: $330K** — i.e., the cost of doing nothing about debt for one year
- **Monthly cost: $27.5K** (broken down: $27.5K direct labor + $0 context-switch + $0 incident — at this scale, incidents are rounding error)
- **Hours lost per engineer per week: 10 hours** (`40 × 25%`)
- **Cost per engineer per month: $3.4K** of debt-servicing burden
- **Debt as % of ARR: 3.3%** — meaningful but not deal-breaking; well-managed companies sit ≤ 1–2%
- **Payback period: 18.2 months** at the configured 70% remediation efficiency
- **DORA tier: `High`** (bi-weekly deploys map to V = 1.1)

### The cost decomposition

```
$27.5K/month total
├── $27.5K direct labor    (8 × $12.5K/month × 25% × 1.1 deploy multiplier)
├── $0     context-switch  (disabled — would add 23% surcharge if enabled)
└── $0     incident labor  (3 × 4hr × ~$72/hr ≈ $865/month → rounds to $0 in the headline)
```

### Sensitivity to deploy cadence

The deploy-frequency multiplier `V` is the most underestimated lever in tech-debt modeling:

| Deploy cadence | DORA     | V       | Resulting annual cost |
| -------------- | -------- | ------- | --------------------- |
| Multiple/day   | Elite    | 0.8     | $240K (-27%)          |
| Daily          | Elite    | 0.9     | $270K                 |
| Weekly         | High     | 1.0     | $300K                 |
| **Bi-weekly**  | **High** | **1.1** | **$330K (this run)**  |
| Three-week     | Medium   | 1.25    | $375K                 |
| Monthly        | Medium   | 1.45    | $435K                 |
| Quarterly+     | Low      | 1.7     | $510K                 |
| Bi-annually    | Low      | 2.0     | $600K                 |
| Annually       | Low      | 2.4     | $720K                 |

A move from bi-weekly to weekly cadence saves $30K/year of debt-carrying cost, before considering any other improvements. Cadence improvements compound with burden reduction.

---

## Anchoring the finding in the deal model

Three uses for this estimate:

1. **As a deal-model line item.** $330K/year is below the materiality threshold for most middle-market PE deals — but the CTO's admission of a 25% burden is a leading indicator that the pace will accelerate without intervention. Model the cost as flat in year 1, growing 10–15% annually if unaddressed.
2. **As a payback case for the remediation budget.** $500K budget paying back in 18.2 months at the configured efficiency is a strong ROI case for a deal partner asking _"Why are we earmarking $500K for technical debt before we even close?"_ Re-frame: it's a 65%+ IRR project before any operating-leverage benefit.
3. **As a comparable-engagement anchor.** Run `search_portfolio` for similar engagements:

   > _"Pull our past Buy-Side engagements where the target had a 20-30% maintenance burden — what did the remediation timeline look like and what was the realized debt reduction?"_

   → `search_portfolio { search: "tech debt", engagement: "Buy-Side" }` returns relevant engagements; their challenge/solution paragraphs are inline reference for the deal memo.

In the same conversation, you can layer in regulatory considerations:

> _"What's the compliance overhead if this target operates in EU and handles PII? Does that constrain the remediation timeline?"_

→ `search_regulations { jurisdiction: "eu", category: "data-privacy" }` plus `gst://regulations/eu/gdpr` Resource — establishes the compliance-floor that prevents certain cost-out maneuvers (e.g., can't shed certain data-handling capacity below regulatory minimums).

---

## The iteration pattern

The website wizard's value proposition is the visual scaffolding (sliders, payback gauge). The MCP server's value proposition is **fast sensitivity analysis at exact values**. The iteration patterns below are sub-second and free of slider quantization.

| Pivot                        | Prompt                                                                             | What changes                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Higher burden                | _"Sensitize at 35% burden instead of 25%."_                                        | Annual cost climbs to ~$462K; payback shortens to ~13 months at the same budget  |
| Faster cadence               | _"What if they ship daily instead of bi-weekly?"_                                  | DORA flips to `Elite`, V drops to 0.9, annual cost falls to ~$270K               |
| Add context-switch           | _"Turn on the 23% context-switch overhead."_                                       | `contextSwitchMonthly` becomes ~$6.3K/month, annual cost adds ~$76K              |
| Larger team                  | _"What if the team grows to 16 engineers, same burden?"_                           | Cost roughly doubles (linear in team size)                                       |
| Lower remediation efficiency | _"Be conservative — assume 40% remediation efficiency, not 70%."_                  | Monthly savings drops to $11K, payback extends to 45 months — kills the ROI case |
| Different incident profile   | _"They actually have 12 incidents/month with 8-hour MTTR — pager-duty is brutal."_ | `incidentMonthly` becomes a real line ($6.9K/month); annual cost adds ~$83K      |

Each pivot is a single tool call. Compare to the website-wizard equivalent: re-open the wizard, drag sliders, fight the quantization (sliders snap to specific values), re-render.

---

## Reshape the same output without re-running the engine

Once you have the estimate, Claude can reshape it without invoking the engine again:

| Reshape goal                          | Prompt                                                                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CTO-interview talking points          | _"Draft three follow-up questions for the CTO based on these numbers — focus on whether the 25% burden is structural or temporary."_                    |
| IC-memo paragraph                     | _"Write a one-paragraph IC-memo finding on the tech-debt carrying cost, leading with the payback economics on the $500K budget."_                       |
| Counter-factual (best vs worst case)  | _"What does this look like in the worst case (35% burden, monthly deploys, context-switch on) vs best case (15% burden, daily deploys, no incidents)?"_ |
| Multi-year projection                 | _"Project the carrying cost over years 1–3 assuming the burden grows 5pp/year if unaddressed."_                                                         |
| Convert to engineering-leadership ask | _"Translate this into a one-page case the new CTO would use to ask for the $500K remediation budget."_                                                  |

These are operations that previously required manual extraction from the wizard's UI plus separate Claude prompting.

---

## Why this matters (the value summary for stakeholders)

| Concern                               | Pre-MCP workflow                                     | MCP workflow                                                                                                                                 |
| ------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Time to first estimate                | 3–5 min (browser, slider manipulation)               | < 30 seconds (one prose prompt with the disclosed numbers)                                                                                   |
| Slider quantization                   | Approximation only — sliders snap to specific values | Exact raw values — what the CTO said is what the engine computes                                                                             |
| Sensitivity across multiple scenarios | Re-key sliders for each scenario                     | Sub-second pivots (single sentence per scenario)                                                                                             |
| Cross-tool integration                | Manual context-switch                                | Inline: `search_portfolio` analogues, `search_regulations` overlays, library Resources                                                       |
| Engine drift risk                     | Two surfaces (web + MCP) → divergence possible       | Both call `calculateFromRawInputs` (the website's `calculate(state)` is a wrapper) — by construction, identical output for equivalent inputs |

The engine is not new. The DORA-aligned velocity multipliers are not new. **What is new is putting both inside the conversation that's recording the management interview, drafting the deal model, or briefing the IC** — at exact CTO-disclosed values, without slider quantization.

---

## Reproducing this walkthrough

To run the exact scenario in this document:

1. Set up the MCP server per [`mcp-server/README.md`](../../../README.md) → "Install & build" and "Configure clients" sections.
2. In a fresh Claude conversation with the `gst` server enabled, paste the prose prompt under [What you actually type](#what-you-actually-type).
3. Compare the estimate against the structure under [The estimate the engine returns](#the-estimate-the-engine-returns). Outputs will be byte-identical for the same input vector.

The engine is deterministic; cost decomposition, debt-as-%-of-ARR, and payback months are direct functions of the 10 raw inputs and the `DEPLOY_OPTIONS` velocity multiplier.

---

## Related documentation

- [`mcp-server/README.md`](../../../README.md) — install, configure, tool inventory, troubleshooting
- [`CONTRACT.md`](./CONTRACT.md) — the canonical input contract (per-field reference, DORA tier table, slider-bypass rationale, payback semantics)
- [`../contracts/README.md`](../contracts/README.md) — registry of all per-tool input contracts; what a contract is; the IRL forward-look
- [`src/docs/development/MCP_SERVER_HUB_SURFACE_BL-031_5.md`](../../../../src/docs/development/MCP_SERVER_HUB_SURFACE_BL-031_5.md) — architecture and design rationale for BL-031.5

---

_Last Updated: 2026-04-28_
