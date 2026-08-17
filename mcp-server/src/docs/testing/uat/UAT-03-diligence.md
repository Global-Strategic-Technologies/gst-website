# UAT-03 — Diligence agenda

> **Prerequisite**: [`SETUP.md`](SETUP.md) complete. **Environment**: production.
> **Input authority**: [`diligence/CONTRACT.md`](../../tools/diligence/CONTRACT.md)

One tool with the widest input surface in the server: thirteen dimensions describing a target, each of which gates a different slice of the question set. A full pass proves the two behaviours that make it safe to use on a real deal — that **`unknown` is a supported answer rather than a failure**, and that the calibration audit **rejects a call rather than guessing** when provenance is malformed.

> **Verified in production** (cycle 4, 2026-08-12, `0.48.2`). All three cases passed against the Worker; the earlier `local stdio` rows are kept for provenance.

## Scope

| Capability                  | Kind | Cases                        | Contract                                         |
| --------------------------- | ---- | ---------------------------- | ------------------------------------------------ |
| `generate_diligence_agenda` | tool | UAT-03.1, UAT-03.2, UAT-03.3 | [CONTRACT.md](../../tools/diligence/CONTRACT.md) |

---

## UAT-03.1 — The low-context case: all thirteen dimensions `unknown`

**Goal**: Proves the tool produces a usable wide agenda when nothing is known about the target — the case a partner hits on day one of a deal, and the one where a tool that demanded complete input would be useless.

**Input**

All thirteen dimensions set to `"unknown"`, `geographies: ["unknown"]`, and an `_audit` entry per dimension.

| Field         | Required | Value for this case                                  | Constraint a tester must respect                                                                                                     |
| ------------- | -------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 13 dimensions | yes      | `"unknown"`                                          | `geographies` is an array and needs `["unknown"]`, not `"unknown"`                                                                   |
| `_audit`      | yes      | one entry per dimension, each `tier: "3"`            | **`unknown` requires `tier: "3"`, and `tier: "3"` requires `unknown`** — the coupling is bidirectional and rejected either way round |
| citations     | yes      | `"Section -- — partner-supplied form input — <why>"` | ≥ 20 characters after the em-dash                                                                                                    |

Three dimensions need an extra sub-field: `headcount.scope`, `growthStage.velocityEvidence`, `revenueRange.nativeCurrency`.

**Steps**

1. Open a fresh thread.
2. Paste: _A founder just approached us about a possible deal. I have no details yet — draft me a diligence agenda I can take into a first call._
   Mode B: call `generate_diligence_agenda` with all dimensions `"unknown"` and the `_audit` block above.

**Expected result**

- The call **succeeds**. It does not refuse, and it does not ask for more information first.
- `unknownDimensionCount` is **13**.
- `metadata.totalQuestions` is **20**, grouped into four topics: Architecture, Operations & Delivery, Carve-out / Integration, and Security, Compliance & Governance.
- `attentionAreas` holds **28** entries — the widest the engine produces. Compare against UAT-03.2.
- **Questions gated on specific values still appear.** Carve-out questions (`ci-01`, `ci-02`, `ci-07`) surface despite `transactionType: "unknown"`, and self-managed-infrastructure questions (`arch-05`, `arch-06`) surface despite `techArchetype: "unknown"`. This is the design: `unknown` is non-eliminating, so the agenda widens rather than narrowing on a guess. A tester who reads this as a bug has the semantics backwards.
- `triggerMap` names the dimension behind each question, so a partner can see which answers would remove it.

**Failure modes**

| Symptom                                       | Means                                                                     | Do                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| The model asks for details instead of calling | Addendum missing, or the model is over-interpreting the sparse prompt     | Re-check [`SETUP.md` § 2](SETUP.md); the tool documents this case explicitly |
| A tier/value coupling rejection               | An `unknown` dimension carries tier 1 or 2, or a known one carries tier 3 | Fix the tier; not a defect                                                   |
| `unknownDimensionCount` below 13              | A dimension was silently defaulted                                        | Fail — the count is the honesty signal                                       |

**Run log**

| Date       | Tester | Env         | Version | Mode | Verdict | Notes                                                                                                                                                                                                                  |
| ---------- | ------ | ----------- | ------- | ---- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-11 | BL-119 | local stdio | 0.48.1  | B    | Pass    | 13 unknowns, 20 questions, 28 attention areas, carve-out surfaced                                                                                                                                                      |
| 2026-08-12 | Cowork | prod        | 0.48.2  | B    | Pass    | First production run. 13 unknowns, 20 questions in 4 topics, 28 attention areas; carve-out (`ci-01`/`ci-02`/`ci-07`) and self-managed-infra questions surfaced despite `unknown` — non-eliminating semantics confirmed |

---

## UAT-03.2 — A fully specified target

**Goal**: Proves that supplying real values narrows the agenda to what is relevant. This is the case that shows the thirteen dimensions are doing work, and the pair with UAT-03.1 is what makes either meaningful.

**Input**

A EUR-denominated EU healthcare SaaS target: `full-acquisition`, `b2b-saas`, `modern-cloud-native`, `51-200`, `5-25m`, `scaling`, `5-10yr`, `["eu"]`, `productized-platform`, `moderate`, `stable`, `high`, `product-aligned-teams`.

| Field                                         | Required | Constraint a tester must respect                                                                                                                                       |
| --------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_audit.<dim>.tier`                           | yes      | `"1"` or `"2"` for any known value. Tier 1 additionally requires the enum value to appear as a **literal token** in the citation excerpt — use tier 2 when it does not |
| `_audit.revenueRange.nativeCurrency`          | yes      | If not `USD`, `currencyConversion` becomes required — see UAT-03.3                                                                                                     |
| `_audit.dataSensitivity.piiCategoriesPresent` | yes      | Array, min 1; `["none"]` when the target handles no PII                                                                                                                |

**Steps**

1. Paste a target description with all thirteen attributes stated, and ask for a diligence agenda.
   Mode B: call with the values above and tier-2 citations.

**Expected result**

- `unknownDimensionCount` is **0**.
- `metadata.totalQuestions` is still **20** — the question count is not the discriminator.
- `attentionAreas` collapses from 28 to **4**: Cross-Border Data Compliance, AI Commodity Risk, Sensitive Data Breach Liability, and Data Classification Maturity Gap. **This is the observation that proves the dimensions work.** A tester comparing only question counts between 03.1 and 03.2 will conclude, wrongly, that the inputs had no effect.
- Geography-gated content appears: `sec-05` (GDPR) and `sec-17` (EU AI Act), both attributed to `Geography` in the `triggerMap`.
- `dataSensitivity: "high"` surfaces `sec-18` (data classification framework), attributed to `Data Sensitivity`.
- Carve-out questions from 03.1 are **gone**; the `full-acquisition` value eliminated them.
- `deeplink` carries all thirteen values as query parameters.

**Failure modes**

| Symptom                           | Means                                          | Do                                                   |
| --------------------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| Attention areas stay at 28        | Dimensions are not filtering                   | Fail — this is the case's whole purpose              |
| A tier-1 literal-token rejection  | Citation excerpt lacks the enum value verbatim | Downgrade to tier 2 or fix the excerpt; not a defect |
| Carve-out questions still present | `transactionType` not applied                  | Fail                                                 |

**Run log**

| Date       | Tester | Env         | Version | Mode | Verdict | Notes                                                                                                                                                                                   |
| ---------- | ------ | ----------- | ------- | ---- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-11 | BL-119 | local stdio | 0.48.1  | B    | Pass    | 0 unknowns, 20 questions, attention areas 28 → 4, GDPR + AI Act surfaced                                                                                                                |
| 2026-08-12 | Cowork | prod        | 0.48.2  | B    | Pass    | First production run. 0 unknowns, still 20 questions — count is NOT the discriminator. Attention areas collapsed 28 → 4, exactly the four the case names; carve-out-only questions gone |

---

## UAT-03.3 — The calibration audit rejects rather than guesses

**Goal**: Proves the audit blocks a call whose provenance is incomplete, and returns a directive precise enough to fix it in one retry. This is what stops a plausible-but-unfounded agenda reaching a partner.

**Input**

Repeat UAT-03.2 but declare `_audit.revenueRange.nativeCurrency: "EUR"` **without** supplying `currencyConversion`.

**Steps**

1. Issue the call with the omission above.

**Expected result**

- The call is **rejected**, not silently accepted with an assumed rate.
- The error opens with a retry-discipline preamble instructing that **every** listed issue be fixed in a **single** retry, and explains why: partial fixes re-trigger the remaining issues and waste calls.
- Each issue carries a rule ID (here `BL-045-CURRENCY-CONVERSION-REQUIRED`), the offending path (`_audit.revenueRange.currencyConversion`), and a `Fix:` line naming the exact correction.
- The message includes a worked example with real numbers, so the shape is unambiguous.
- Supplying `currencyConversion: { nativeAmountMillions, usdRate, convertedUsdMillions }` makes the identical call succeed.

**Why this matters**: revenue drives the bracket, and the bracket gates questions. An unconverted EUR figure would land in a bracket the target does not belong to, and every downstream question would be wrong in a way nobody could see.

**Failure modes**

| Symptom                                    | Means                                               | Do                                                     |
| ------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------ |
| The call **succeeds** with EUR and no rate | The currency guard is not firing                    | **Fail — escalate.** Bracket assignment is now unsound |
| The error names one issue but more exist   | Partial reporting; the retry loop will not converge | Fail — the preamble promises a complete list           |

**Run log**

| Date       | Tester | Env         | Version | Mode | Verdict | Notes                                                                                                                                              |
| ---------- | ------ | ----------- | ------- | ---- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-11 | BL-119 | local stdio | 0.48.1  | B    | Pass    | Rejected with `BL-045-CURRENCY-CONVERSION-REQUIRED` + worked example                                                                               |
| 2026-08-12 | Cowork | prod        | 0.48.2  | B    | Pass    | First production run. Rejected with `BL-045-CURRENCY-CONVERSION-REQUIRED`, the retry-discipline preamble, the offending path, and a worked example |

---

_Last updated: 2026-08-11 (BL-119 — initial authoring; all three cases executed against local stdio 0.48.1)_
