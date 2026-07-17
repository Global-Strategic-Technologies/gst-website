---
tool: compute_techpar
version: v1
lastAuthored: 2026-04-28
schema: src/schemas/techpar.ts
enumParity:
  - tableHeading: '`mode`'
    schemaExport: src/schemas/techpar.ts#MODE_VALUES
  - tableHeading: '`capexView`'
    schemaExport: src/schemas/techpar.ts#CAPEX_VIEW_VALUES
---

# Input Contract: `compute_techpar`

> **Tool**: `compute_techpar` — computes the TechPar benchmark for a target company's technology cost ratio. Wraps the website's pure `compute` engine.
>
> **Sources of truth** (the contract cites these; it does not duplicate them):
>
> - **Validation**: [`src/schemas/techpar.ts`](../../../../../src/schemas/techpar.ts) — `TechParInputsSchema`, `StageSchema`, `ModeSchema`, `CapExViewSchema`
> - **Stage configurations & benchmarks**: [`src/data/techpar/stages.ts`](../../../../../src/data/techpar/stages.ts) — `STAGES` map (per-stage zones, benchmarks, frame, note)
> - **Engine logic**: [`src/utils/techpar-engine.ts`](../../../../../src/utils/techpar-engine.ts) — `compute` (lines ~210–365), `getZone` (lines 100–110), `computeGap` / `computeUnderGap` (lines 167–192)
>
> **Used by prompts** (BL-031.75): [`gst_target_quick_look`](../../../prompts/target-quick-look.ts) (first-look brief — combines TechPar with ICG + Tech Debt + regulatory exposure). The `infraHosting` monthly-vs-annual unit mismatch flagged during V2 verification was resolved under BL-031.95 (renamed to `infraHostingAnnual`; engine no longer multiplies by 12; all six money fields share annual units).
>
> **Version**: `v1` | **Last authored**: 2026-04-28
>
> **Registry**: see [`../contracts/README.md`](../README.md).

---

## Field overview

14 inputs. All required and validated by Zod; the engine returns `null` when `arr` or `infraHostingAnnual` is zero — the MCP wrapper surfaces this as an `isError` response with the message `TechPar requires both 'arr' and 'infraHostingAnnual' to be greater than zero.`

| Field                | Type       | Notes                                                                                  |
| -------------------- | ---------- | -------------------------------------------------------------------------------------- |
| `arr`                | number ≥ 0 | Annual recurring revenue, in dollars                                                   |
| `stage`              | enum       | One of 5 growth stages                                                                 |
| `mode`               | enum       | `quick` (use `rdOpEx` directly) or `deepdive` (sum `engCost + prodCost + toolingCost`) |
| `capexView`          | enum       | `cash` (include CapEx in totals) or `gaap` (exclude CapEx)                             |
| `growthRate`         | number     | Annual revenue growth rate (%); drives 36-month projection                             |
| `exitMultiple`       | number ≥ 0 | Exit multiple used to translate cumulative gap → exit value                            |
| `infraHostingAnnual` | number ≥ 0 | Annual infrastructure / cloud hosting cost (dollars)                                   |
| `infraPersonnel`     | number ≥ 0 | Annual infra personnel cost (dollars)                                                  |
| `rdOpEx`             | number ≥ 0 | R&D OpEx — used in `quick` mode                                                        |
| `rdCapEx`            | number ≥ 0 | R&D CapEx (capitalized R&D)                                                            |
| `engFTE`             | number ≥ 0 | Engineering full-time-equivalent count                                                 |
| `engCost`            | number ≥ 0 | Annual engineering personnel cost — `deepdive` only                                    |
| `prodCost`           | number ≥ 0 | Annual product personnel cost — `deepdive` only                                        |
| `toolingCost`        | number ≥ 0 | Annual tooling cost — `deepdive` only                                                  |

---

## Per-field detail

### `arr`, `stage`, `growthRate`, `exitMultiple`

- **`arr`** — required > 0 for the engine to return a non-null result. Drives every percentage-of-revenue calculation.
- **`stage`** — `seed` | `series_a` | `series_bc` | `pe` | `enterprise`. Selects the per-stage benchmark band from `STAGES`. Each stage publishes its own zones (`underinvest` / `lo` / `hi` / `above` / `critical` thresholds) and per-category benchmark ranges.

  **Canonical stage adapter (BL-031.87)**: the MCP wrapper accepts `stage` as either a canonical funding-stage value (preferred — `seed` | `series-a` | `series-b` | `series-c` | `pe` | `enterprise` from [`src/data/common/funding-stages.ts`](../../../../../src/data/common/funding-stages.ts)) or one of the five TechPar-native values listed above (backward-compat). Translation happens via [`TECHPAR_STAGE_ADAPTER`](../../../../../src/data/common/stage-adapters.ts) before the engine is invoked. TechPar's native enum collapses canonical series-b + series-c into `series_bc` — reflecting the benchmark dataset's granularity. The MCP response includes a `stageContext: { native, canonical }` field where `canonical` is array-valued, exposing the lossy collapse honestly (`series_bc` → `['series-b', 'series-c']`). Engine and benchmark dataset untouched. See [`mcp-server/src/docs/tools/README.md` § Cross-tool concept glossary](../README.md#funding-stage--canonical-layer--adapter-bl-03187-shipped) for the full canonical mapping table; see [ADR-0001](../../../../../src/docs/adr/0001-stage-taxonomy-adapter.md) for pattern-choice rationale.

- **`growthRate`** — annual percentage. Used in the 36-month projection (`computeGap` / `computeUnderGap`) to model revenue compounding monthly. Affects `gap.cumulative36` and `gap.underinvestGap`.
- **`exitMultiple`** — multiplier applied to `gap.cumulative36` to compute `gap.exitValue`. Convention: 12× as the SaaS default.

### `mode`

`quick` uses the `rdOpEx` field directly. `deepdive` synthesizes R&D OpEx as `engCost + prodCost + toolingCost`, ignoring the raw `rdOpEx` value.

| ID         | Behavior                                                   |
| ---------- | ---------------------------------------------------------- |
| `quick`    | Uses the `rdOpEx` field directly                           |
| `deepdive` | Synthesizes R&D OpEx as `engCost + prodCost + toolingCost` |

### `capexView`

`cash` includes `rdCapEx` in `total`. `gaap` excludes it (matches GAAP-style accounting view). Affects `total`, `totalTechPct`, and the `zone` classification but not the per-category KPIs.

| ID     | Behavior                                        |
| ------ | ----------------------------------------------- |
| `cash` | Includes `rdCapEx` in `total`                   |
| `gaap` | Excludes `rdCapEx` (GAAP-style accounting view) |

### Cost fields

- **`infraHostingAnnual`, `infraPersonnel`, `rdOpEx`, `rdCapEx`, `engCost`, `prodCost`, `toolingCost`** are all **annual** dollars (BL-031.95 normalized this; pre-BL-031.95 callers passed `infraHosting` as monthly with × 12 inside the engine).
- **`engFTE`** is a headcount integer used to compute `revenuePerEngineer = arr / engFTE`.

---

## Output shape (return value)

`TechParResult`:

```ts
{
  total: number,                 // annual tech cost — currently selected basis (cash or gaap)
  totalCash: number,             // annual tech cost on a cash basis
  totalGAAP: number,             // annual tech cost on a GAAP basis
  totalTechPct: number,          // total / arr × 100
  zone: 'underinvest' | 'ahead' | 'healthy' | 'above' | 'elevated' | 'critical',
  stageConfig: StageConfig,      // the selected stage's full config (label, zones, benchmarks)
  categories: CategoryKPI[],     // per-category breakdown (Infra hosting, Infra personnel, R&D OpEx, R&D CapEx)
  kpis: { annualTechCost, infraHostingPct, infraPersonnelPct, rdOpExPct, rdCapExPct, rdCapExOfRD, blendedInfra, revenuePerEngineer, engPctOfRD, prodPctOfRD },
  gap: { cumulative36, exitValue, underinvestGap, annualAdvantage, annualExcess }
}
```

**`zone` classification** (per `getZone`):

| Zone          | Condition                            | Meaning                                               |
| ------------- | ------------------------------------ | ----------------------------------------------------- |
| `underinvest` | `pct < zones.underinvest`            | Spending suspiciously low — suggests under-investment |
| `ahead`       | `zones.underinvest ≤ pct < zones.lo` | Below benchmark band but plausibly efficient          |
| `healthy`     | `zones.lo ≤ pct ≤ zones.hi`          | Within stage benchmark band                           |
| `above`       | `zones.hi < pct < zones.above`       | Slightly elevated relative to benchmark               |
| `elevated`    | `zones.above ≤ pct < zones.critical` | Materially above benchmark — investigation warranted  |
| `critical`    | `pct ≥ zones.critical`               | Significant overspend — direct EBITDA drag            |

Per-category zones use the same logic against the per-category benchmarks in `stageConfig.benchmarks` rather than the stage-level zones.

---

## Hidden semantics

- **`compute` returns `null`** if `arr === 0` or `infraHostingAnnual === 0`. The MCP wrapper converts this to a structured error, never a stack trace. The website wizard handles the null state by showing a "fill in revenue / infra hosting" placeholder.
- **R&D CapEx benchmark derivation**: the per-category R&D CapEx benchmark is computed at runtime as `(rdOpEx + rdCapEx) × stageConfig.benchmarks.rdCapExOfRD / 100 / arr × 100`. The "of R&D" semantics aren't user-facing in the input — the consumer just sees the resulting % range — but they explain why the R&D CapEx benchmark depends on actual R&D spend rather than ARR alone.
- **Mode switching does not zero unused fields** — sending all of `rdOpEx`, `engCost`, `prodCost`, `toolingCost` is fine. The engine ignores `rdOpEx` in `deepdive` and ignores `engCost/prodCost/toolingCost` in `quick`. Submitting both is harmless.

---

## Related

- Tool wrapper: [`mcp-server/src/tools/techpar.ts`](../../../tools/techpar.ts)
- Live website: <https://globalstrategic.tech/hub/tools/techpar>
- Architecture: [ADR-0004 — Resources surface](../../../../../src/docs/adr/0004-hub-surface-resources-import-restriction.md) · [`ARCHITECTURE.md`](../../ARCHITECTURE.md)
