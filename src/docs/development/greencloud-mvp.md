# GreenCloud — MVP Design Document
**Status:** Planning
**Code name:** GreenCloud (final name TBD)
**Target location:** /hub/tools/greencloud
**Suite pairing:** Infrastructure Cost Governance (operational maturity wizard)

---

## 1. Product Concept

GreenCloud is a financial analysis and communication tool that quantifies the business cost of a company's cloud infrastructure posture. It takes accounting-layer inputs — revenue, margin, cloud spend, historical trends — and computes investor-grade KPIs with a live-updating dashboard and an AI-generated narrative suitable for IC packages, board decks, sell-side preparation, or 100-day planning.

**What it is not:** An operational remediation tool. It does not assess practices, recommend configurations, or produce a maturity score. That is the job of Infrastructure Cost Governance. GreenCloud takes the financial consequence of whatever posture exists and translates it into the language investors and executives use to make decisions.

**Primary audience:** PE investors, portfolio company CFOs, founders preparing for a transaction, GST consultants preparing client-facing deliverables.

**Secondary audience:** Engineering and finance leads who need to make an internal business case for cloud cost investment.

**Core value proposition:** Transforms a cloud bill into a business case. Every output is expressed in dollars, percentages of revenue, and margin impact — not configuration recommendations or technical severity scores.

---

## 2. Suite Relationship

GreenCloud and Infrastructure Cost Governance are complementary tools targeting different stakeholders at different points in an engagement.

| | Infrastructure Cost Governance | GreenCloud |
|---|---|---|
| Primary user | Engineering lead, CTO, GST consultant | PE investor, CFO, founder |
| Input type | Operational practices (wizard) | Financial figures (form) |
| Output type | Maturity score, remediation checklist | KPI dashboard, investor narrative |
| Engagement moment | Diligence intake, 100-day kickoff | IC package, board deck, sell-side prep |
| Language | Operational, technical | Financial, investor-grade |

**Cross-link:** Infrastructure Cost Governance results page links to GreenCloud with a contextual prompt — "Quantify the financial impact of this assessment." GreenCloud links back to Infrastructure Cost Governance with — "Assess the operational practices behind these numbers." Cross-link implementation deferred to refinement phase.

---

## 3. User Flow

```
[Input form]  →  [Live KPI dashboard]  →  [Generate analysis]  →  [AI narrative]
     │                   │
     │            Updates on every keystroke
     │
     └── Revenue, margin, spend, historical periods
```

The input form and KPI dashboard are co-present on the same view — a two-column layout with inputs on the left and live-updating KPIs and charts on the right. There is no submit step. The AI narrative is generated on demand via a single button.

---

## 4. Input Structure

### Section 1: Revenue
- **Current ARR or TTM Revenue** — required; drives all primary KPIs
- **Gross Margin (%)** — required; unlocks infra as % of gross profit KPI; default 70%
- **Customer count** — optional; unlocks per-customer infrastructure cost KPI

### Section 2: Infrastructure Spend
- **Current monthly cloud spend** — required; primary spend input
- **Total monthly infrastructure** (cloud + CDN + observability + hosting) — optional; unlocks blended infra burden KPI
- **Context** — optional dropdown (buy-side diligence / sell-side preparation / board presentation / 100-day plan / internal assessment); shapes AI narrative tone only, does not affect calculations

### Section 3: Historical Data
Toggle between two modes:

**Monthly mode** — up to N periods (user-addable rows), each with:
- Period label (free-form text; defaults to M-5 through M-0)
- Cloud spend
- Revenue (optional; unlocks % of revenue trend chart and efficiency ratio trend)

**Annual mode** — same structure with year labels; unlocks YoY growth rate KPI and infra spend vs revenue growth comparison chart.

Rows are user-addable and deletable. Period labels are free-form — the engine uses position, not date parsing.

---

## 5. KPI Computation Model

### Primary KPI
**Infrastructure as % of ARR / Revenue**
```
(monthly spend × 12) / ARR × 100
```
Color-coded against benchmark thresholds:
- < 10%: Efficient (green)
- 10–15%: Benchmark range (teal)
- 15–20%: Above benchmark (amber)
- > 20%: Value creation flag (red)

### Secondary KPIs (always computed when inputs available)
| KPI | Formula | Notes |
|-----|---------|-------|
| Annualized run rate | monthly × 12 | Baseline spend reference |
| Infra as % of gross profit | annual infra / (ARR × GM%) × 100 | More alarming than % ARR at low margins |
| Excess vs 12% benchmark | annual infra − (ARR × 0.12) | Dollar figure above or below midpoint benchmark |
| ARR efficiency ratio | ARR / annual infra | ARR generated per $1 of infrastructure spend |

### Optional KPIs (unlock when additional inputs provided)
| KPI | Requires | Formula |
|-----|---------|---------|
| Per-customer monthly infra cost | Customer count | monthly spend / customers |
| Blended infra burden | Total infra input | total monthly infra × 12 / ARR × 100 |
| MoM spend growth | 2+ monthly periods | (latest − previous) / previous × 100 |
| 12-month projected spend | MoM growth | Compound projection at current growth rate |
| Projected infra % ARR | 12-month projection | projected annual / ARR × 100 |
| YoY spend growth | 2+ annual periods | (latest − previous) / previous × 100 |

### Benchmark Reference
Static reference band displayed on results — not computed from inputs:

| Company profile | Typical range before intervention |
|----------------|----------------------------------|
| Pre-Series B / high-growth startup | 15–35 |
| Series B–C SaaS, scaling team | 30–55 |
| PE-backed portco, 2+ years post-acquisition | 45–70 |
| Enterprise with established FinOps practice | 65–90 |

Framing disclaimer: *"Ranges reflect illustrative patterns from GST diligence and value creation engagements. Individual results vary."*

### Cost Context Block
Static reference displayed on results — not computed:

> "For SaaS businesses, cloud infrastructure typically represents 8–15% of revenue at scale. Spend above 20% warrants structural review. Spend above 25% without a clear growth-phase justification is a value creation flag in any diligence or 100-day context."

---

## 6. Chart Suite

Charts render only when sufficient data points exist. All use Chart.js. No chart renders with placeholder or zero data.

| Chart | Requires | Description |
|-------|---------|-------------|
| Spend trajectory | 2+ historical spend periods | Bar chart of cloud spend per period; ARR overlaid as line on secondary axis when revenue data provided |
| Infra as % of revenue over time | 2+ periods with both spend and revenue | Line chart with 8% and 15% benchmark bands |
| YoY growth comparison | 2+ annual periods with spend | Bar chart comparing infra spend growth vs revenue growth side by side; most useful divergence signal |
| ARR efficiency ratio trend | 2+ periods with both spend and revenue | Line chart of ARR per $1 annual infra over time |

---

## 7. AI Narrative

Generated on demand. Streamed. Structured into four sections:

1. **Executive Summary** — primary financial finding in dollars and %, risk classification, valuation implication
2. **Risk Quantification** — three specific, dollar-quantified risks derived from the actual inputs
3. **Trend Interpretation** — trajectory analysis if historical data provided; if not, explains precisely what trend data would determine
4. **Priority Questions for Management** — four pointed questions derivable from the specific numbers, not generic cloud questions

**Hard rules for prompt:**
- No em dashes
- No bullet points
- No hedging language
- Reference dollar figures throughout
- Every claim grounded in the actual computed metrics
- Tone shaped by the Context dropdown selection

---

## 8. Success Criteria

- [ ] All primary and secondary KPIs compute correctly from inputs
- [ ] Optional KPIs appear only when their required inputs are present
- [ ] KPI colors update correctly at all threshold boundaries
- [ ] Charts render only with sufficient data; no empty or zero-data charts displayed
- [ ] Monthly and annual mode toggle correctly; row add/delete works without state loss
- [ ] Period labels are free-form and do not affect calculations
- [ ] AI narrative references actual computed figures, not generic observations
- [ ] No em dashes appear in AI output
- [ ] Context dropdown shapes narrative tone without affecting KPI calculations
- [ ] Cross-link placeholder to Infrastructure Cost Governance present in results view (implementation deferred)
- [ ] Print stylesheet produces clean output for PDF export
- [ ] Dark theme renders correctly across all components
- [ ] Mobile layout is usable with stacked input/KPI columns
