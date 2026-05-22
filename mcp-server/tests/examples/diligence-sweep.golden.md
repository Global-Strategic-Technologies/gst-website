---
promptName: gst_diligence_sweep
version: 0.0.2
recordedAt: 2026-05-22
model: claude-opus-4-7
---

# Worked example output for `gst_diligence_sweep`

Live-exercise transcript captured 2026-05-22 against the MedSig Health populated-IRL fixture ([`mcp-server/tests/fixtures/medsig-health-filled-irl.md`](../fixtures/medsig-health-filled-irl.md)). This recording supersedes the v0.0.1 V1 draft and is the source-of-truth shape the v0.0.2 body refinements were calibrated against.

## Input

```json
{
  "targetName": "MedSig Health",
  "filledIrl": "<verbatim content of mcp-server/tests/fixtures/medsig-health-filled-irl.md>",
  "transactionContext": "buy-side",
  "partnerLead": "Reid Peryam",
  "projectCodeName": "Cygnet"
}
```

## Tool calls observed (live-exercise)

The model fanned out across the full toolchain in parallel after extracting dimensions, with one self-correcting retry on the portfolio search:

1. **`compute_techpar`** (1 call) — engineering FTE 58, product personnel cost $2.4M, build/tooling $640k, annualized hosting from the 3-month average ($23.16M), infra headcount 8, capex $1.1M, avg salary $232k US.
2. **`assess_infrastructure_cost_governance`** (2 calls — the two-call pattern):
   - Call 1: empty answers → retrieve the 20-question schema across 6 domains.
   - Call 2: seeded with the IRL-confidently-extractable signals (FinOps lead Q4 2025, Datadog observability, multi-AZ EU isolation, capacity headroom, budget tracking). **16/20 unknowns triggered the low-confidence threshold** — score 5/100 / Reactive maturity.
3. **`generate_diligence_agenda`** (1 call) — 13 dimensions extracted literally per the v0.0.2 body's "do NOT default to `'unknown'`" rule. The model used `'unknown'` only for `transformationState` (inferential — cloud-native does not imply stable). 20 questions, 5 attention areas, 1 unknown in the output.
4. **`list_portfolio_facets`** + **`search_portfolio`** (3 calls total — one retry due to facet-name guess):
   - First `search_portfolio` call used theme `"Healthcare Tech"` → zero matches.
   - Self-correction: `list_portfolio_facets` returned canonical theme `"Healthcare"`.
   - Second `search_portfolio` succeeded — matched Atlas + Arrow (legacy-platform RCM peers) and Tempo (HealthTech HITRUST-in-progress compliance parallel).
   - **This retry is the empirical signal that drove the v0.0.2 Step 2 body refinement** — sweep now instructs the model to use literal theme names from `list_portfolio_facets` verbatim.
5. **`list_regulation_facets`** + **`search_regulations`** (5 calls for data-privacy across US + EU jurisdictions). Surfaced GDPR, CCPA/CPRA, Texas TDPSA (no-revenue-threshold), Germany BDSG augmentation. The v0.0.1 body did NOT instruct the model to add an EU AI Act search despite MedSig deploying an XGBoost denial-prediction model + OpenAI claims-AI co-pilot in the EU — **gap surfaced in the synthesis as "EU AI Act is the under-covered second thread"**, which drove the v0.0.2 Step 3 conditional.
6. **`search_radar`** (1 call, `pe-ma` category) — no direct healthcare-RCM M&A signal in the current window. Two adjacent reads surfaced: McKinsey "next era of healthcare is personal" (mRNA + AI + personalization) and Franklin Templeton "AI threatens enterprise software" (moat-erosion read directly relevant to MedSig's OpenAI-dependent claims-AI co-pilot).

### Open-in-Hub deeplink coverage gap (v0.0.1 vs v0.0.2)

The v0.0.1 prompt body only instructed the model to surface the `deeplink` URL for two sections of the dossier — (B) Diligence agenda (from `generate_diligence_agenda`) and (G) Comparable engagements (from `search_portfolio`). The live-exercise output reflected this: the TechPar, ICG, Tech Debt, Regulatory, and Radar sections rendered as read-only analysis with no bridge back to the corresponding Hub surface where the partner could refine inputs, share state-pre-populated URLs, or export PDFs.

**This is the dossier's bridge to the interactive Hub** — every underlying tool returns a `deeplink` URL that opens its Hub surface with state pre-populated:

| Tool                                    | Deeplink target                                                  |
| --------------------------------------- | ---------------------------------------------------------------- |
| `compute_techpar`                       | TechPar wizard with inputs pre-populated                         |
| `assess_infrastructure_cost_governance` | ICG wizard with answers pre-populated                            |
| `estimate_tech_debt_cost`               | Tech Debt Calculator with sliders pre-positioned                 |
| `search_regulations`                    | Regulatory Map filtered to region + category (one per framework) |
| `search_portfolio`                      | Portfolio view with filter chips active                          |
| `search_radar`                          | Radar feed filtered to category                                  |
| `generate_diligence_agenda`             | Diligence Wizard pre-populated                                   |

**v0.0.2 closes the gap**: Steps 3-7 now each instruct the model to capture the `deeplink` field from the tool response, and every dossier section (C/D/E/F/G/H) that pulled from a tool must close with the corresponding "Open in Hub" link. The voice-and-format directives now state explicitly that the deeplinks "are the bridge between the Claude Desktop dossier and the partner-refinable Hub surface; without them the dossier is read-only."

## Headline findings (synthesis output, abridged)

- **(C) Architecture + paradigm assessment** — TechPar zone `critical` with hosting at **51% of ARR** (vs 8-18% benchmark band). $23.16M annualized hosting against $45.2M ARR. This becomes the **central thesis of the deal either way** — framed as a pre-LOI question, not a deal-killer, because the IRL leaves enough hosting-cost composition ambiguity (EU one-time capex blend, non-AWS line items, PHI-compliance premium, claims-volume amplifier vs benchmark calibration) that the 51% number deserves structural interrogation before being underwritten.
- **(D) ICG assessment** — score 5/100 / Reactive maturity. The dossier reframes this as **signal-from-silence**: 16/20 unknowns at $23M annual spend is itself the diligence finding. The new FinOps lead (hired Q4 2025) is the right interlocutor for a 90-min confirmatory inquiry.
- **(E) Technical debt assessment** — landed naturally on the denial-appeals legacy service (FY26-Q3 rewrite already budgeted at $1.8M); annualized carry against the 22% maintenance burden.
- **(F) Regulatory exposure** — full data-privacy surface across HIPAA, GDPR, BDSG, CNIL, UAVG, LOPDGDD, CCPA, TDPSA. **EU AI Act flagged as under-covered** in the IRL itself — XGBoost + OpenAI in EU customers likely Annex III high-risk; the IRL Section 09 was silent on this.
- **(G) Comparable engagements** — Atlas (RCM, $67M ARR, FACS/Caché legacy) and Arrow (RCM, .NET/FoxPro/VB.NET) are the strongest industry analogs. **The synthesis inverts the usual frame**: the precedent set is legacy-platform / cost-efficient RCM; MedSig is modern-cloud-native / cost-inefficient at similar scale. Tempo (HITRUST in-progress HealthTech) is the closer technical analog.
- **(H) Market signal** — no direct RCM M&A radar signal; recommend a separate competitive-landscape sweep on Waystar / Change / R1 / Experian before the IC presentation if Cygnet advances.
- **(I) Synthesis** — pre-LOI Cygnet brief (attributed to Reid Peryam) framing the TechPar 51%-of-ARR hosting flag as the central thesis with the ICG signal-from-silence and EU AI Act exposure as second-order threads. Closed with VDR follow-up requests using verbatim labels from `gst://library/vdr-structure`.

## IRL accuracy flag surfaced by the sweep

The sweep correctly identified that **IRL Section 09 cited "Netherlands Wbp"** — a framework repealed in 2018 and replaced by UAVG when GDPR took effect. The flag was raised back to Daniel Park in the synthesis section's open-questions block. **Fixed in the fixture file and demo-script copies in lockstep with this golden recording** — the fixture now reads "Netherlands UAVG (the Dutch GDPR implementation that replaced Wbp in 2018)".

## Senior-consultant review (BL-032.6 Step 5.5 sign-off)

**Reviewed**: 2026-05-22 against the live-exercise transcript above.

**Verdict**: ship. The dossier reads as a single coherent partner-level document, not a stitched-together set of tool outputs. The cross-references between sections are load-bearing:

- **(C) → (D)** — TechPar surfacing the 51%-of-ARR flag and ICG immediately following with the 16/20 unknowns is the most-load-bearing cross-reference in the dossier. The two findings are mutually reinforcing: the TechPar number is what makes the FinOps governance gap consequential.
- **(C) → (G)** — the comparable-engagement inversion (Atlas/Arrow legacy-but-efficient vs MedSig modern-but-inefficient) is what gives the TechPar flag its partner-decision shape. Without the precedent contrast, the 51% number reads as a single data point; with it, it reads as a structural anomaly worth interrogating.
- **(F) cross-reference back to (E) tech debt** — the denial-prediction ML model and OpenAI claims-AI co-pilot are simultaneously a tech-debt line item (the legacy denial-appeals service has them as a dependency) AND a regulatory-exposure line item (EU AI Act). The synthesis surfaces both threads without forcing the reader to chase them.

**What would have made this a "stitched-together set of tool outputs"** (failure mode the prompt body explicitly guards against): if the dossier had reported the TechPar critical-zone result, the ICG Reactive maturity score, and the regulatory framework list as three independent factoids. It did not — the synthesis weaves them into one story.

**One area to watch in future trials**: the EU AI Act conditional (v0.0.2 Step 3 refinement) needs a second live exercise against an IRL that does NOT have EU geography to confirm the conditional fires correctly (i.e., the model doesn't add EU AI Act when the conditional shouldn't trigger). The current MedSig fixture is biased toward the EU-positive case.

**Approver**: Reid Peryam (live-exercise partner) — 2026-05-22.
