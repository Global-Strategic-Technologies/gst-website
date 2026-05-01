---
promptName: gst_target_quick_look
version: 0.0.1
recordedAt: 2026-05-01
model: claude-opus-4-7
---

# Worked example output for `gst_target_quick_look`

V2 sign-off recording. Senior-consultant verdict: signed off after the post-fix re-run. The first run surfaced three architectural defects in the MCP layer that this prompt depends on (deep-link landing pages, region-code case mismatch, ICG schema-ID enumeration). All three closed in-branch.

## Input

```json
{
  "targetName": "Helios Health",
  "productType": "b2b-saas",
  "arr": 25000000,
  "stage": "Scaling Growth",
  "hqJurisdiction": "us-ca"
}
```

## Expanded prompt body

Single text message instructing the model to invoke all four orchestrated tools (`assess_infrastructure_cost_governance`, `compute_techpar`, `estimate_tech_debt_cost`, `search_regulations`) and frame the output as a digestible 5-section quick-look brief with Open-in-Hub deep-links. Embeds the schema-canonical 20 ICG question IDs (`q1_1`, `q1_2`, `q1_3`, `q2_1`–`q2_4`, `q3_1`–`q3_3`, `q4_1`–`q4_3`, `q5_1`–`q5_3`, `q6_1`–`q6_4`) by domain so the model uses them verbatim instead of inventing flat IDs that the engine silently ignores.

## Model output

Five-section quick-look brief for Helios Health (b2b-saas, ARR $25M, Scaling Growth, US-CA):

1. **Header** — Helios Health | b2b-saas | ARR $25M | Scaling Growth | HQ US-CA.
2. **Cost-governance read (ICG)** — overall score + maturity level + top 2-3 quick-win recommendations from `getRecommendations`. Lead-line low-confidence note when ≥10 of 20 answers were `-1`. "Assumptions / unknowns" subsection lists every `-1` answer by schema-canonical ID.
3. **Unit-economics (TechPar)** — zone label + 1-line interpretation (with degenerate-result disclosure when cost inputs are unsupplied).
4. **Tech-debt range** — annualCost, debtPctArr, paybackMonths, DORA tier.
5. **Regulatory exposure** — frameworks named for `us-ca` (CCPA/CPRA, SB 942) plus federal HIPAA overlay (model correctly inferred from "Health" in target name). Three "Open in Hub" deep-links restoring state byte-identically: ICG → `currentStep: 7` (results view), Tech Debt → all 10 inputs slider-restored, Reg Map → `?region=US-CA&filter=data-privacy` page-canonical case. TechPar deferred-deep-link disclosure note ("tracked under BL-031.95") emitted as designed.

## Verification notes

The pre-fix first run produced an excellent-looking deliverable that was silently degraded by:

1. **ICG deep-link landed on intro, not results** — `tools/icg.ts:57` set `currentStep: 0`. Closed by `buildResultsState()` helper in commit `b9a4c3a`.
2. **Reg Map deep-link case mismatch** — page expects uppercase alpha-3 / ISO 3166-2 (`USA`, `US-CA`) but MCP emitted lowercase alpha-2 (`us`, `us-ca`). Closed by `jurisdictionToRegion()` helper in commit `e4fe98d`.
3. **ICG schema IDs not enumerated** — model invented flat `q1`–`q20` IDs the engine silently ignored. Closed by enumerating all 20 schema-canonical IDs in the body in commit `9aaa541` (with comment cleanup in `38cffab`).

Post-fix re-run produced this output. The deliverable is auditable because (a) the deep-links open in their populated states, and (b) the "Assumptions / unknowns" list names IDs the engine actually accepted.
