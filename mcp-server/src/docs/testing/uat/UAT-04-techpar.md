# UAT-04 — TechPar

> **Prerequisite**: [`SETUP.md`](SETUP.md) complete. **Environment**: production.
> **Input authority**: [`techpar/CONTRACT.md`](../../tools/techpar/CONTRACT.md)

Benchmarks a target's technology spend against stage-specific peer ranges. A full pass proves the arithmetic is checkable by hand — which matters more here than anywhere else in the suite, because the output is a number a partner will put in front of an investment committee.

> **Recorded runs are `local stdio`, not production.** The engine is bundled with no external dependency, so these results should hold identically on the Worker. A production run is outstanding.

## Scope

| Capability        | Kind | Cases              | Contract                                       |
| ----------------- | ---- | ------------------ | ---------------------------------------------- |
| `compute_techpar` | tool | UAT-04.1, UAT-04.2 | [CONTRACT.md](../../tools/techpar/CONTRACT.md) |

---

## UAT-04.1 — Quick-mode benchmark with hand-checkable arithmetic

**Goal**: Proves every headline figure can be re-derived from the inputs with a calculator, so a partner can defend the number rather than cite it.

**Input**

| Field                                  | Required | Value for this case | Constraint a tester must respect                                               |
| -------------------------------------- | -------- | ------------------- | ------------------------------------------------------------------------------ |
| `arr`                                  | yes      | `18400000`          | Must be **> 0** or the engine returns nothing                                  |
| `stage`                                | yes      | `"series-b"`        | Canonical or native; canonical is preferred                                    |
| `mode`                                 | yes      | `"quick"`           | `quick` uses `rdOpEx`; `deepdive` synthesises it from three sub-fields         |
| `capexView`                            | yes      | `"cash"`            | `cash` includes `rdCapEx` in the total; `gaap` excludes it                     |
| `growthRate`                           | yes      | `31`                | Percent; may be negative                                                       |
| `exitMultiple`                         | yes      | `12`                | 12× is the SaaS default convention                                             |
| `infraHostingAnnual`                   | yes      | `732000`            | Must be **> 0**. **Annual** dollars — the field was renamed from a monthly one |
| `infraPersonnel`                       | yes      | `640000`            | Annual dollars                                                                 |
| `rdOpEx`                               | yes      | `4100000`           | Annual dollars                                                                 |
| `rdCapEx`                              | yes      | `450000`            | Annual dollars                                                                 |
| `engFTE`                               | yes      | `84`                | Drives `revenuePerEngineer`; `null` result if 0                                |
| `engCost` / `prodCost` / `toolingCost` | yes      | `0`                 | Required by the schema even in `quick` mode, where they are ignored            |
| `_audit`                               | yes      | see below           | `monetaryBasis` plus provenance for the five monetary fields                   |

`_audit.monetaryBasis` declares the currency for **all** monetary inputs at once; a non-USD currency requires `conversionRate`. Each monetary field needs an `annualizationSource` from the named enum — ad-hoc annualisation is not accepted, which is the guard against a monthly figure silently entering an annual field.

**Steps**

1. Paste the target's financials and ask for a TechPar benchmark.
   Mode B: call `compute_techpar` with the values above.

**Expected result**

Every one of these is checkable by hand:

- `totalCash` is **5,922,000** = 732,000 + 640,000 + 4,100,000 + 450,000.
- `totalGAAP` is **5,472,000** = `totalCash` − `rdCapEx`. The delta is exactly the CapEx figure, which is what `capexView` selects between.
- `totalTechPct` is **32.18%** = 5,922,000 ÷ 18,400,000.
- `zone` is **`ahead`**, because 32.18 falls below the Series B–C `lo` threshold of 35.
- `revenuePerEngineer` is **219,047.62** = 18,400,000 ÷ 84.
- `rdCapExOfRD` is **9.89%** — CapEx as a share of total R&D, not of ARR. Two similarly-named ratios with different denominators; reading the wrong one is the easiest mistake here.
- Per-category zones differ from the blended zone: `infraHosting` is `underinvest` (3.98% against an 8–18% band) while `infraPersonnel` is `healthy` (3.48% against 2–6%). A single blended verdict would have hidden both.
- `stageContext` reports `native: "series_bc"` with `canonical: ["series-b", "series-c"]` — TechPar collapses B and C into one cohort, and says so rather than pretending the input survived intact.
- `gap.underinvestGap` is populated (~2.37M) while `gap.cumulative36` and `annualExcess` are 0, consistent with an `ahead` verdict.

**Failure modes**

| Symptom                                | Means                                            | Do                                                                       |
| -------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| Null or empty result                   | `arr` or `infraHostingAnnual` is 0               | Both must be > 0; not a defect                                           |
| `totalTechPct` roughly 12× expected    | A monthly figure was passed into an annual field | Check `annualizationSource`; this is the error the audit exists to catch |
| `totalCash` == `totalGAAP`             | `capexView` is not being applied                 | Fail — the two views must differ by `rdCapEx`                            |
| Audit rejection naming `monetaryBasis` | Non-USD currency without `conversionRate`        | Supply the rate; not a defect                                            |

**Run log**

| Date       | Tester | Env         | Version | Mode | Verdict | Notes                                                                        |
| ---------- | ------ | ----------- | ------- | ---- | ------- | ---------------------------------------------------------------------------- |
| 2026-08-11 | BL-119 | local stdio | 0.48.1  | B    | Pass    | 32.18% / `ahead`; totals, per-engineer and GAAP delta all re-derived by hand |

---

## UAT-04.2 — Deep-dive mode changes the R&D basis

**Goal**: Proves `deepdive` genuinely re-bases R&D from the three component costs rather than treating them as decoration, and that the audit demands provenance for them.

**Input**

Repeat UAT-04.1 with `mode: "deepdive"`, supplying real `engCost`, `prodCost` and `toolingCost`, and adding an `_audit` entry for each. Deliberately set them so their sum differs from UAT-04.1's `rdOpEx`.

**Expected result**

- R&D OpEx is computed as `engCost + prodCost + toolingCost`. The `rdOpEx` field is **ignored**, not averaged in.
- `totalTechPct` and `zone` move accordingly if the sum differs from the quick-mode figure.
- `kpis.engPctOfRD` and `prodPctOfRD` are populated — both are `null` in quick mode, which is the quickest way to confirm which mode actually ran.
- Omitting the `_audit` entry for any of the three is rejected; they are required in `deepdive` and must be absent-tolerant only in `quick`.

**Failure modes**

| Symptom                            | Means                                     | Do                                                      |
| ---------------------------------- | ----------------------------------------- | ------------------------------------------------------- |
| `engPctOfRD` is `null` in deepdive | Mode did not take effect                  | Fail                                                    |
| Result identical to quick mode     | The three sub-fields are not being summed | Fail, unless they happen to sum to `rdOpEx` — vary them |
| Audit rejection naming `engCost`   | Missing deepdive provenance               | Supply it; not a defect                                 |

**Run log**

| Date | Tester | Env | Version | Mode | Verdict | Notes |
| ---- | ------ | --- | ------- | ---- | ------- | ----- |
|      |        |     |         |      |         |       |

---

_Last updated: 2026-08-11 (BL-119 — initial authoring; 04.1 executed against local stdio 0.48.1)_
