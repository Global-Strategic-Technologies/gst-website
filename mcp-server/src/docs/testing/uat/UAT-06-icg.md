# UAT-06 — Infrastructure Cost Governance

> **Prerequisite**: [`SETUP.md`](SETUP.md) complete. **Environment**: production.
> **Input authority**: [`icg/CONTRACT.md`](../../tools/icg/CONTRACT.md)

Scores a target's cloud cost-governance maturity across six domains and returns prioritised recommendations. A full pass proves two things: that the framework's **taxonomy is discoverable** rather than something a model recites, and that the tool distinguishes a **confirmed gap** from an **assumed** one.

> **Recorded runs are `local stdio`, not production.** The engine is bundled with no external dependency, so these results should hold identically on the Worker. A production run is outstanding.

## Scope

| Capability                              | Kind | Cases              | Contract                                   |
| --------------------------------------- | ---- | ------------------ | ------------------------------------------ |
| `assess_infrastructure_cost_governance` | tool | UAT-06.1, UAT-06.2 | [CONTRACT.md](../../tools/icg/CONTRACT.md) |

---

## UAT-06.1 — Structure discovery with an empty answer map

**Goal**: Proves the canonical six domains can be obtained from the server, so a description of the framework never has to come from a model's memory. Soak testing has produced fabricated domain names when it did — this call is the documented remedy.

**Input**

| Field          | Required | Value for this case | Constraint a tester must respect                            |
| -------------- | -------- | ------------------- | ----------------------------------------------------------- |
| `answers`      | yes      | `{}`                | An empty object is valid and is the intended discovery call |
| `companyStage` | no       | _omitted_           | Omit it for discovery                                       |

**Steps**

1. Open a fresh thread.
2. Paste: _What does the GST infrastructure cost governance framework cover?_
   Mode B: call `assess_infrastructure_cost_governance` with `{ "answers": {} }`.

**Expected result**

- The call succeeds; an empty `answers` map is not an error.
- `domainScores` holds exactly **6** entries, whose `name` values are the canonical taxonomy — use them verbatim:

  | ID   | Domain                            | Max | Foundational |
  | ---- | --------------------------------- | --- | ------------ |
  | `d1` | Visibility and Tagging            | 9   | yes          |
  | `d2` | Account Structure and Attribution | 12  | yes          |
  | `d3` | Right-Sizing and Utilization      | 9   | no           |
  | `d4` | Lifecycle and Waste               | 9   | no           |
  | `d5` | Architectural Efficiency          | 9   | no           |
  | `d6` | Governance and Alerting           | 12  | no           |

- `totalQuestions` is **20**; `answeredCount` is **0**.
- `overallScore` is 0 and `maturityLevel` is `"Reactive"` — the floor, not an error.
- `showFoundationalFlag` is `true`, because both foundational domains sit below threshold at zero.
- **Every** recommendation carries `triggerQuestionAnswered: false`. With no answers supplied the engine defaulted each trigger to 0, and the flag says so — these are assumed gaps, not confirmed ones. A summary that presents them as findings is misreporting.

**Failure modes**

| Symptom                                           | Means                                                              | Do                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| The model describes the framework without calling | Addendum missing — the documented failure this case guards against | Re-check [`SETUP.md` § 2](SETUP.md); compare the names it gave against the table above |
| Fewer or differently-named domains                | Taxonomy drift                                                     | Fail — these names are cited verbatim in client deliverables                           |
| An empty `answers` map errors                     | Discovery path broken                                              | Fail — this is a supported call                                                        |

**Run log**

| Date       | Tester | Env         | Version | Mode | Verdict | Notes                                                                  |
| ---------- | ------ | ----------- | ------- | ---- | ------- | ---------------------------------------------------------------------- |
| 2026-08-11 | BL-119 | local stdio | 0.48.1  | B    | Pass    | 6 canonical domains, 20 questions, all `triggerQuestionAnswered:false` |

---

## UAT-06.2 — A scored assessment with two "Not sure" answers

**Goal**: Proves scoring, the "Not sure" penalty, stage mapping, and — the observation that matters most — that answering the questions flips every recommendation from assumed to confirmed.

**Input**

| Field          | Required | Value for this case | Constraint a tester must respect                                                                       |
| -------------- | -------- | ------------------- | ------------------------------------------------------------------------------------------------------ |
| `answers`      | yes      | all 20 question IDs | Values are integers **−1 to 3**. `-1` means "Not sure" and is penalised, not skipped                   |
| `companyStage` | no       | `"series-b"`        | Canonical (`seed`…`enterprise`) or ICG-native (`pre-series-b`, `series-bc`, `pe-backed`, `enterprise`) |

Question IDs follow `q<domain>_<n>`: `q1_1`–`q1_3`, `q2_1`–`q2_4`, `q3_1`–`q3_3`, `q4_1`–`q4_3`, `q5_1`–`q5_3`, `q6_1`–`q6_4`. Use `q3_3: -1` and `q5_2: -1` for the two "Not sure" answers.

**Steps**

1. Answer all twenty and ask for the assessment at Series B.
   Mode B: call with the full `answers` map and `companyStage: "series-b"`.

**Expected result**

- `overallScore` is **47** and `maturityLevel` is `"Aware"` — the second of four bands (`Reactive`, `Aware`, `Optimizing`, `Strategic`).
- `answeredCount` is **20** and `skippedCount` is **2** — the two `-1` answers count as answered **and** as skipped. They are not silently dropped.
- The two domains carrying a `-1` report `skippedCount: 1` each (`d3`, `d5`) and score lowest at 22%.
- `showFoundationalFlag` is now **`false`**: both foundational domains (`d1`, `d2`) reached 67%, clearing the threshold that flagged them in UAT-06.1.
- Recommendations drop from 27 to **12** — answering a question at or above its threshold retires its recommendation.
- **Every** surviving recommendation now carries `triggerQuestionAnswered: true`. Contrast with UAT-06.1: this is the field that separates "we confirmed this gap" from "we assumed it".
- `stageContext` reports `native: "series-bc"` with `canonical: ["series-b", "series-c"]` — ICG collapses B and C, and says so.
- Recommendations are ordered impact-then-effort: `high`/`quick-win` first, `low`/`project` last.

**Failure modes**

| Symptom                                         | Means                                                     | Do                                                             |
| ----------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| `skippedCount` is 0 with `-1` answers present   | The "Not sure" penalty is not being applied               | Fail — the score is inflated                                   |
| `triggerQuestionAnswered` still `false`         | Confirmed and assumed gaps are indistinguishable          | **Fail — escalate.** A deliverable cannot separate them either |
| `stageContext` absent when a stage was supplied | The collapse is happening silently                        | Fail — the mapping must be visible                             |
| An unknown question ID passed silently          | Check `unknownAnswerKeys` in the response — it lists them | Not a defect; fix the key                                      |

**Run log**

| Date       | Tester | Env         | Version | Mode | Verdict | Notes                                                                              |
| ---------- | ------ | ----------- | ------- | ---- | ------- | ---------------------------------------------------------------------------------- |
| 2026-08-11 | BL-119 | local stdio | 0.48.1  | B    | Pass    | 47 "Aware", 2 skipped, 12 recs all `triggerQuestionAnswered:true`, stage collapsed |

---

_Last updated: 2026-08-11 (BL-119 — initial authoring; both cases executed against local stdio 0.48.1)_
