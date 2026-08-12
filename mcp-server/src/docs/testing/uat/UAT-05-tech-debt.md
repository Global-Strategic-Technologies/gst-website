# UAT-05 — Tech debt

> **Prerequisite**: [`SETUP.md`](SETUP.md) complete. **Environment**: production.
> **Input authority**: [`tech-debt/CONTRACT.md`](../../tools/tech-debt/CONTRACT.md)

Estimates the annual carrying cost of accumulated technical debt. A full pass proves the arithmetic and, more importantly, the **fabrication guard**: two inputs that a target frequently cannot supply are required to be `null` rather than plausibly filled in, and the tool rejects the call if they are not.

> **Recorded runs are `local stdio`, not production.** The engine is bundled with no external dependency, so these results should hold identically on the Worker. A production run is outstanding.

## Scope

| Capability                | Kind | Cases                        | Contract                                         |
| ------------------------- | ---- | ---------------------------- | ------------------------------------------------ |
| `estimate_tech_debt_cost` | tool | UAT-05.1, UAT-05.2, UAT-05.3 | [CONTRACT.md](../../tools/tech-debt/CONTRACT.md) |

---

## UAT-05.1 — Full inputs, everything IRL-stated

**Goal**: Establishes the baseline where every input is available, so UAT-05.2 can show exactly what changes when two of them are not.

**Input**

| Field                  | Required | Value for this case | Constraint a tester must respect                               |
| ---------------------- | -------- | ------------------- | -------------------------------------------------------------- |
| `teamSize`             | yes      | `84`                | Integer > 0                                                    |
| `salary`               | yes      | `165000`            | > 0, fully-loaded annual                                       |
| `maintenanceBurdenPct` | yes      | `28`                | 0–100                                                          |
| `deployFrequency`      | yes      | `"Weekly"`          | One of nine DORA-style bands, `Multiple/day` … `Annually`      |
| `incidents`            | yes      | `3`                 | Integer ≥ 0 **or `null`** — see UAT-05.2                       |
| `mttrHours`            | yes      | `8`                 | Number ≥ 0 **or `null`** — see UAT-05.2                        |
| `remediationBudget`    | yes      | `900000`            | ≥ 0                                                            |
| `arr`                  | yes      | `18400000`          | ≥ 0                                                            |
| `remediationPct`       | yes      | `65`                | 0–100, remediation efficiency                                  |
| `contextSwitchOn`      | yes      | `true`              | Boolean; adds the context-switch overhead component            |
| `_audit`               | yes      | both `"irl-stated"` | `{ mttrSource, incidentsSource }`, each from a four-value enum |

**Steps**

1. Paste the engineering figures and ask for a technical-debt carrying cost.
   Mode B: call `estimate_tech_debt_cost` with the values above.

**Expected result**

- `annualCost` is **4,796,230** and `totalMonthly` **399,685.85** — and `annualCost` = `totalMonthly` × 12, checkable by hand.
- The monthly figure decomposes into three named parts that sum to it: `directMonthly` 323,400 + `contextSwitchMonthly` 74,382 + `incidentMonthly` 1,903.85.
- `incidentMonthly` is **non-zero** — this is the component UAT-05.2 removes.
- `hoursLostPerEng` is **11.2** per week = 40 × 28%.
- `debtPctArr` is **26.07%** = 4,796,230 ÷ 18,400,000.
- `doraLabel` is `"High"` with velocity multiplier `V: 1` for a weekly cadence.
- `extractionOnly` is an **empty array** — nothing was elided.
- `deeplink` opens the Hub calculator with the same inputs.

**Failure modes**

| Symptom                                        | Means                                       | Do                                                      |
| ---------------------------------------------- | ------------------------------------------- | ------------------------------------------------------- |
| The three components do not sum to the monthly | Decomposition drift                         | Fail — the breakdown is what makes the total defensible |
| `hoursLostPerEng` ≠ 40 × burden%               | Burden is being applied to a different base | Fail                                                    |

**Run log**

| Date       | Tester | Env         | Version | Mode | Verdict | Notes                                                         |
| ---------- | ------ | ----------- | ------- | ---- | ------- | ------------------------------------------------------------- |
| 2026-08-11 | BL-119 | local stdio | 0.48.1  | B    | Pass    | 4,796,230/yr; three components summed; `extractionOnly` empty |

---

## UAT-05.2 — The honest-null path

**Goal**: Proves that when a target has not tracked MTTR or incident counts, the tool produces a **narrower but true** answer instead of a complete-looking but invented one.

**Input**

Repeat UAT-05.1 with `mttrHours: null`, `incidents: null`, and `_audit: { mttrSource: "irl-open", incidentsSource: "irl-open" }`.

The enum has four values: `irl-stated` (an explicit figure exists), `irl-open` (the field is marked OPEN or not tracked), `irl-absent` (no such row exists), and `irl-scope-mismatch` (a figure exists but in the wrong unit or scope — a per-sprint count where a monthly one is needed). **Any value other than `irl-stated` requires the paired numeric field to be `null`.**

**Expected result**

- `annualCost` drops to **4,773,384** — lower than UAT-05.1, because the incident component is gone rather than estimated.
- `incidentMonthly` is **0**.
- `directMonthly` and `contextSwitchMonthly` are **unchanged** from UAT-05.1. Only the incident-derived component disappears; the rest of the model is unaffected.
- `extractionOnly` is `["mttrHours", "incidents"]` — the tool names what it elided, so a dossier can mark that section correctly instead of presenting a partial figure as complete.
- `mttrSource` and `incidentsSource` are echoed back in the response.

**Why this is the right behaviour**: a placeholder MTTR flows through a linear multiplier into the headline number. There is no way to tell afterwards that it was invented, and no way to recover the true figure from the output. A visibly smaller number with a named omission is recoverable; a plausible one is not.

**Failure modes**

| Symptom                                       | Means                                        | Do                                                        |
| --------------------------------------------- | -------------------------------------------- | --------------------------------------------------------- |
| `incidentMonthly` non-zero with `null` inputs | The null is being coerced to a default       | **Fail — escalate.** This is fabrication by another route |
| `extractionOnly` empty                        | The elision is not being reported            | Fail — the caller cannot mark the section honestly        |
| `directMonthly` changed between 05.1 and 05.2 | Nulling one input perturbed an unrelated one | Fail                                                      |

**Run log**

| Date       | Tester | Env         | Version | Mode | Verdict | Notes                                                                 |
| ---------- | ------ | ----------- | ------- | ---- | ------- | --------------------------------------------------------------------- |
| 2026-08-11 | BL-119 | local stdio | 0.48.1  | B    | Pass    | 4,773,384/yr; `incidentMonthly` 0; other components identical to 05.1 |

---

## UAT-05.3 — The guard rejects a placeholder

**Goal**: Proves the `null` requirement is enforced rather than advisory — that a caller cannot declare a field OPEN and then supply a convenient number anyway.

**Input**

Repeat UAT-05.1's numeric values (`incidents: 3`, `mttrHours: 8`) but declare `_audit: { mttrSource: "irl-open", incidentsSource: "irl-open" }`.

**Expected result**

- The call is **rejected**.
- **Both** violations are reported in one response — `BL-045-MTTR-NULL-REQUIRED-FOR-OPEN-SOURCE` and `BL-045-INCIDENTS-NULL-REQUIRED-FOR-OPEN-SOURCE`. A guard reporting only the first would force a second round trip.
- Each names the offending field, the declared source, and the value actually received.
- The MTTR message states the consequence explicitly: a fabricated MTTR "passes through the engine's linear multiplier and produces an unrecoverable false carrying-cost number".
- The closing instruction restates the remedy — pass `null`, mark the section extraction-only, surface it in the gap list.

**Failure modes**

| Symptom                     | Means                   | Do                                                          |
| --------------------------- | ----------------------- | ----------------------------------------------------------- |
| The call **succeeds**       | The guard is not firing | **Fail — escalate.** Every downstream figure is now suspect |
| Only one violation reported | Partial validation      | Fail — the retry loop cannot converge in one pass           |

**Run log**

| Date       | Tester | Env         | Version | Mode | Verdict | Notes                                        |
| ---------- | ------ | ----------- | ------- | ---- | ------- | -------------------------------------------- |
| 2026-08-11 | BL-119 | local stdio | 0.48.1  | B    | Pass    | Both rule IDs reported in a single rejection |

---

_Last updated: 2026-08-11 (BL-119 — initial authoring; all three cases executed against local stdio 0.48.1)_
