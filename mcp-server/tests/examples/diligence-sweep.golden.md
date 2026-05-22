---
promptName: gst_diligence_sweep
version: 0.0.1
recordedAt: 2026-05-22
model: claude-opus-4-7
---

# Worked example output for `gst_diligence_sweep`

V1 draft recording. To be replaced with a live-exercise capture in Claude Desktop against the MedSig Health populated-IRL fixture ([`mcp-server/tests/fixtures/medsig-health-filled-irl.md`](../fixtures/medsig-health-filled-irl.md)) before the BL-032.6 demo Scenario 7 runs live.

## Input — Trial (a) one-shot mode (full arg set)

```json
{
  "targetName": "MedSig Health",
  "filledIrl": "<verbatim content of mcp-server/tests/fixtures/medsig-health-filled-irl.md>",
  "transactionContext": "buy-side",
  "partnerLead": "Reid Peryam",
  "projectCodeName": "Cygnet"
}
```

A representative high-fidelity buy-side intake: target name + complete IRL + transaction posture + partner attribution + engagement code name. Designed to exercise the maximal-platform-sweep path — every Hub tool fires, dossier composes the unified nine-section artifact.

## Input — Trial (b) interactive mode

Empty payload. Model recognized the empty input and asked the user verbatim:

> Paste the populated Information Request List your target returned (all 10 sections, in markdown). If you can also share the target name, the engagement context (sell-side / buy-side / value-creation), the partner lead, and an engagement code name, I'll tailor the dossier — but only the filled IRL is required to run the sweep.

Once the user pasted the populated IRL, the model produced the same nine-section dossier as Trial (a) but with generic attribution.

## Expanded prompt body

Three messages: (1) the rendered text body — one-shot branch when `filledIrl` is provided, interactive branch otherwise; (2) the embedded `gst://library/information-request-list` Resource carrying the canonical IRL article body (for taxonomy reference when the user's reply doesn't preserve the section structure); (3) the embedded `gst://library/vdr-structure` Resource (for VDR-folder labels used verbatim in Section (I) — Synthesis follow-up document requests).

## Tool calls observed (Trial (a))

The one-shot branch instructs the model to fire each tool in numbered Steps 1-7 before composing the dossier (Step 8). Expected tool-call sequence:

1. `generate_diligence_agenda` — 1 call with 13 dimensions extracted from IRL Section 00, 01, 02, 04, 05/09 (no `'unknown'` defaults; the IRL is filled).
2. `list_portfolio_facets` → `search_portfolio` — facets first to enumerate filterable dimensions, then targeted search with productType + growthStage + geographies. 2-3 calls total. 3-5 comparable code-named engagements returned.
3. `list_regulation_facets` → `search_regulations` — facets first, then one search per framework named in IRL Section 09. For MedSig: HIPAA, GDPR, BDSG (DE), CNIL (FR), CCPA. 5-6 calls total.
4. `compute_techpar` — 1 call using engineering FTE (58), product personnel cost ($2.4M), tooling cost ($640k), hosting + infra (annualized $23M), infra headcount (8), capex ($1.1M), avg salary ($232k US).
5. `assess_infrastructure_cost_governance` — 1 call using hosting model, spend trajectory, FinOps headcount (1 hire 2025-Q4), tagging coverage (inferred from technical-debt assessment notes).
6. `estimate_tech_debt_cost` — 1 call using maintenance burden (22%), deployment frequency (multiple/day), incidents trend (declining), MTTR (P0 2.4h, P1 7.8h), remediation budget ($1.8M FY26), team size (58), salary ($232k US).
7. `search_radar` — 1-2 calls for "European healthcare IT" and "RCM" segments per IRL Section 00 + 01.

## Model output (Trial (a)) — expected shape

A unified nine-section dossier:

- **(A) Target snapshot** — 1 paragraph profile pulled from IRL Section 00 + 01. Includes the customer-concentration flag (largest 7.2% of ARR) and the EU-expansion context (Berlin office hired 2025-Q3).
- **(B) Diligence agenda** — agenda topics + attention areas from `generate_diligence_agenda`. The "Open Diligence Wizard" deeplink closes the section.
- **(C) Architecture + paradigm assessment** — 2-3 paragraphs from `compute_techpar`. Includes a per-driver decomposition of R&D OpEx with the unit-economics question on the table (infrastructure spend growing 1.3x faster than revenue per the 24-month series).
- **(D) ICG assessment** — maturity scoring + 3-5 prioritized recommendations from `assess_infrastructure_cost_governance`. The mid-tier-maturity-with-recent-FinOps-hire signal is a natural anchor.
- **(E) Technical debt assessment** — annualized carry cost + payback projection from `estimate_tech_debt_cost`. Flags the denial-appeals legacy service (FY26-Q3 rewrite already budgeted at $1.8M).
- **(F) Regulatory exposure** — one subsection per framework with verbatim article citations. Cross-border-transfer review flagging the strict US/EU regional isolation (no cross-border PHI replication per IRL Section 09) — a defensible posture for buyers.
- **(G) Comparable engagements** — 3-5 matched code-named engagements with relevance lines. The Hub deeplink closes the section.
- **(H) Market signal** — 2-3 bullets from `search_radar` on European healthcare IT + US RCM market timing.
- **(I) Synthesis + recommendation** — handoff-memo voice attributed to **Reid Peryam** (or "the GST team" in Trial (b)). 3-5 sentences integrating the above. Project label **Cygnet** (Trial (a)) or **MedSig Health** (Trial (b)). Closes with 5-7 VDR follow-up documents using verbatim labels from `gst://library/vdr-structure`.

## Senior-consultant sign-off

To be captured during a live-exercise pass before the BL-032.6 demo Scenario 7 dry-run. Two open questions for the consultant to answer:

1. Does the nine-section dossier read as a single coherent partner-level document, or as a stitched-together set of tool outputs? If the latter, the synthesis Step (8) directive needs sharpening.
2. Is the cross-referencing between sections (e.g., (E) Tech Debt → (G) Comparable engagements) load-bearing, or noise? Tighten if it dilutes the partner read.

The recorded output above will be **overwritten** with the actual Claude Desktop transcript once the live-exercise step completes. Until then this draft documents the expected shape of the deliverable.
