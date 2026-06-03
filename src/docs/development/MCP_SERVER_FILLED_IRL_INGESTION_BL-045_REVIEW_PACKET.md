# BL-045 PR B — Senior-consultant review packet

> **Purpose**: hand this file to the reviewer so they can complete the BLOCKING 36-cell sign-off without re-deriving the review surface from the design doc.
>
> **PR under review**: [#212](https://github.com/Global-Strategic-Technologies/gst-website/pull/212) — `feature/bl-045-pr-b-irl-ingestion`
>
> **Design doc**: [MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md](MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md)
>
> **Reviewer deliverable**: the 36-cell sign-off table in § Axis 2 below, filled in and posted as a PR review comment.
>
> **Estimated reviewer time**: 4-6 hours total. Can be split: Axes 1 + 3 + 5 (~1.5 hrs) are reviewable against the current rename commit; Axes 2 + 4 (~3-4 hrs) require the body-rewrite + fixture commits to land first. The PR description lists what's done vs pending.

---

## Five review axes

The reviewer's task has five axes. For each: the question the reviewer is answering, the specific artifacts to read, and the deliverable.

### Axis 1 — Rule fidelity post-rename

**Question to answer**: do the six extracted rule constants preserve the original sweep's domain meaning, and do they read correctly when interpolated into the renamed prompt's body?

| Artifact                                                                                                                    | What to read                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [mcp-server/src/prompts/extraction-rules.ts](../../../mcp-server/src/prompts/extraction-rules.ts)                           | The 6 named constants (`UNKNOWN_PROPAGATION_RULE`, `EU_AI_ACT_CONDITIONAL_TRIGGER`, `NIS2_CONDITIONAL_TRIGGER`, `ENG_COST_DEDUP_RULE`, `ICG_SEEDING_RULES`, `MTTR_P1_RULE`) — each is a verbatim block of rule prose |
| [mcp-server/src/docs/library/irl-tool-input-mapping.md](../../../mcp-server/src/docs/library/irl-tool-input-mapping.md)     | The SOP these constants derive from — the human-readable rule documentation                                                                                                                                          |
| [mcp-server/src/prompts/irl-ingestion.ts](../../../mcp-server/src/prompts/irl-ingestion.ts) (lines 134, 138, 140, 142, 144) | The five orchestration shells the constants interpolate into                                                                                                                                                         |
| Diff: `git show 176419e..HEAD -- mcp-server/src/prompts/diligence-sweep.ts mcp-server/src/prompts/irl-ingestion.ts`         | Confirm structural-only changes; no rule meaning shifted                                                                                                                                                             |

**Deliverable**: ✅ / ❌ per constant. If ❌, cite the SOP sentence the constant fails to preserve.

| Constant                        | Sign-off |
| ------------------------------- | -------- |
| `UNKNOWN_PROPAGATION_RULE`      |          |
| `EU_AI_ACT_CONDITIONAL_TRIGGER` |          |
| `NIS2_CONDITIONAL_TRIGGER`      |          |
| `ENG_COST_DEDUP_RULE`           |          |
| `ICG_SEEDING_RULES`             |          |
| `MTTR_P1_RULE`                  |          |

---

### Axis 2 — Inclusion-gate appropriateness (the 9×4 matrix) — **BLOCKING**

**Question to answer**: for each of 36 cells, does the gate predicate plus the scenario voice cue produce the dossier section the partner would actually want?

| Artifact                                                                                                                       | What to read                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| [BL-045 design doc § Tool inclusion gates](MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md#tool-inclusion-gates)                     | The 9 gate predicates with rationale                                                                           |
| [BL-045 design doc § Decisions row "transactionContext is advisory only"](MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md#decisions) | Confirms gates do NOT branch on scenario; per-scenario weighting lives in synthesis directives, not gate logic |
| `mcp-server/tests/fixtures/medsig-health-filled-irl.md` (exists)                                                               | The buy-side fixture — exercises all 9 gates passing                                                           |
| `mcp-server/tests/fixtures/<TBD>-sell-or-vc-filled-irl.md` (**pending — lands in PR B**)                                       | Sell-side / value-creation framing — exercises voice-cue divergence                                            |
| `mcp-server/tests/fixtures/sparse-partial-filled-irl.md` (**pending — lands in PR B**)                                         | Sections 00–02 filled, 03–09 silent — exercises multiple gate elisions simultaneously                          |
| The renamed prompt body (**pending — post body-rewrite commits**)                                                              | The 9 gate predicates as numbered lines for the model to evaluate                                              |

**Deliverable — the 36-cell sign-off table**. For each cell: ✅ (gate + voice cue produce the right section), ❌ (recalibration needed — explain), or 🟡 (acceptable with note).

|                                         | buy-side | sell-side | value-creation | unknown |
| --------------------------------------- | -------- | --------- | -------------- | ------- |
| `generate_diligence_agenda`             |          |           |                |         |
| `compute_techpar`                       |          |           |                |         |
| `assess_infrastructure_cost_governance` |          |           |                |         |
| `estimate_tech_debt_cost`               |          |           |                |         |
| `search_regulations`                    |          |           |                |         |
| `search_portfolio`                      |          |           |                |         |
| `search_radar`                          |          |           |                |         |
| `list_portfolio_facets`                 |          |           |                |         |
| `list_regulation_facets`                |          |           |                |         |

**Note on cells flagged ❌**: per CLAUDE.md § 4a (no deferred tech debt), recalibration needed before PR B merges — not as a follow-up ticket. If a cell needs more than a one-line adjustment, this is the moment to flag it.

---

### Axis 3 — Voice-cue completeness

**Question to answer**: does each of the four `transactionContext` cues give the model meaningful posture for that engagement type?

| Artifact                                                                                                      | What to read                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [mcp-server/src/prompts/irl-ingestion.ts:128-137](../../../mcp-server/src/prompts/irl-ingestion.ts#L128)      | Current 4 voice cues (carried forward from sweep v0.0.5 — PR B will expand)                                                                         |
| [BL-045 design doc § Decisions row "Scenario reframing"](MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md#decisions) | The expanded voice-cue specification (value-creation 100-day plan, sell-side defensible story, buy-side risk-confirmation, unknown universal voice) |
| BL-045 design doc § Senior-consultant review gate axis 3                                                      | Specific calibration questions                                                                                                                      |

**Specific questions per cue**:

- **value-creation**: does the cue say enough that the dossier centers the 100-day plan?
- **sell-side**: does the cue sharpen the defensible story (positioning before buyers see the data room)?
- **buy-side**: does the cue weigh risks against the deal thesis (whether pre-LOI or LOI-stage)?
- **unknown**: does the cue read as universal — neither buy-side-coded nor sell-side-coded?

**Deliverable**:

| Cue              | Sign-off |
| ---------------- | -------- |
| `buy-side`       |          |
| `sell-side`      |          |
| `value-creation` |          |
| `unknown`        |          |

---

### Axis 4 — Wrong-IRL detector calibration

**Question to answer**: does the structural-ratio detector (15% / 40% thresholds) correctly warn on unfilled IRLs without false-positiving on legitimately partial IRLs?

| Artifact                                                                                                                                                                                                      | What to read                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [BL-045 design doc § Acceptance Criteria — "Wrong-IRL detector"](MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md#acceptance-criteria)                                                                               | Detector spec: <15% halts, 15-40% proceeds with partial-IRL flag, >40% proceeds normally |
| **Test against 3 fixtures (calibration matrix)**:                                                                                                                                                             |                                                                                          |
| · `mcp-server/tests/fixtures/medsig-health-filled-irl.md` (exists)                                                                                                                                            | ~90% fill — **must proceed normally**                                                    |
| · `mcp-server/tests/fixtures/sparse-partial-filled-irl.md` (**pending — lands in PR B**)                                                                                                                      | ~25% fill — **must proceed with partial-IRL flag**                                       |
| · An **unfilled request IRL** (paste the raw BL-043 article skeleton from [src/data/library/information-request-list/article.md](../../data/library/information-request-list/article.md) into Claude Desktop) | <15% fill — **must halt with "confirm" message**                                         |
| The renamed prompt body's pre-flight paragraph (**pending — post body-rewrite commit**)                                                                                                                       | The detector directive prose                                                             |

**Deliverable**:

| Fixture                    | Expected behavior             | Actual behavior | ✅ / ❌ |
| -------------------------- | ----------------------------- | --------------- | ------- |
| MedSig (filled, ~90%)      | proceed normally              |                 |         |
| sparse-partial (~25%)      | proceed with partial-IRL flag |                 |         |
| BL-043 raw skeleton (<15%) | halt with "confirm"           |                 |         |

If any cell is ❌, recommend a threshold adjustment with rationale.

---

### Axis 5 — Naming + framing

**Question to answer**: is `gst_irl_ingestion` the right verb and does the description correctly signal a scenario-neutral surface?

| Artifact                                                                                                       | What to read                                                      |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [mcp-server/src/prompts/irl-ingestion.ts:215-220](../../../mcp-server/src/prompts/irl-ingestion.ts#L215)       | New name + new description                                        |
| [BL-045 design doc § Business value framing](MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md#business-value-framing) | Layer 1 scenario-reach claim — the rename's primary justification |

**Specific questions**:

- Is `irl_ingestion` the right verb (vs. `irl_intake`, `irl_processing`, `irl_workup`, etc.)? Does it correctly imply "consume + structure" rather than "merely receive"?
- Does the description's "engagement dossier" framing (vs. "diligence dossier") read as truly scenario-neutral? Any buy-side-coded language remaining?
- Does the prompt name fight the actual surface in any way that would make a sell-side / value-creation partner hesitant to invoke it?

**Deliverable**:

| Item                                                 | Sign-off | If ❌ — recommended change |
| ---------------------------------------------------- | -------- | -------------------------- |
| Name (`gst_irl_ingestion`)                           |          |                            |
| Description (scenario-neutrality)                    |          |                            |
| Authorial-intent line (line 138 of irl-ingestion.ts) |          |                            |

---

## What's in the repo today vs. pending

| Status                                | Artifact                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ Mergeable today                    | extraction-rules.ts (6 constants), renamed prompt source (rename commit), description, args (mode/verbosity/forceTools), hash baselines, manifest hash                                                                                                                                                                          |
| 🚧 Pending in PR B (~5 more sessions) | Body rewrite (3 builders, wrong-IRL detector, 9 gate predicates, meta JSON fence, JSON-fence-per-section, provenance footer, gap list, tool-error degradation, expanded voice cues), 2 new fixtures, 3 goldens, ~50 new unit tests, BL-032.75 instrumentation hooks, SOP-as-Resource promotion, 15-doc rename sweep, 0.4.0 bump |

**Reviewer can start now on Axes 1, 3, 5**. Block on Axes 2 + 4 until the body rewrite + fixtures land — the PR description will track the gate.

---

## How to deliver the sign-off

1. **Copy-paste each axis's deliverable table into a single PR review comment on [#212](https://github.com/Global-Strategic-Technologies/gst-website/pull/212).**
2. **Title the comment**: "BL-045 PR B senior-consultant sign-off — \<your name\> — \<date\>".
3. **If any cell is ❌**: flag in the comment; engineering addresses before PR B merges (per CLAUDE.md § 4a — no deferred tech debt).
4. **PR description acceptance criteria**: "Senior-consultant content review of the renamed prompt's body, the inclusion gates, the wrong-IRL detector paragraph, and the per-scenario voice cues **before** PR B merges."

---

## Reference

- **Design doc (central artifact)**: [MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md](MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md)
- **PR**: https://github.com/Global-Strategic-Technologies/gst-website/pull/212
- **BL-032.6 OpenClaw handover** (the original sweep's design rationale): [MCP_SERVER_OPENCLAW_HANDOVER_BL-032_6.md](MCP_SERVER_OPENCLAW_HANDOVER_BL-032_6.md)
- **BL-043 IRL canonical article** (the artifact this prompt consumes): [MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md](MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md)
- **BL-031.75 prompt-maturity bar** (the discipline this PR upholds): [MCP_SERVER_PROMPTS_BL-031_75.md](MCP_SERVER_PROMPTS_BL-031_75.md)

---

**Last updated**: 2026-06-01 (created at PR B draft open)
