---
tool: estimate_tech_debt_cost
version: v1
lastAuthored: 2026-04-28
schema: src/schemas/tech-debt.ts
enumParity:
  - tableHeading: '`deployFrequency`'
    schemaExport: src/schemas/tech-debt.ts#DEPLOY_FREQUENCY_VALUES
---

# Input Contract: `estimate_tech_debt_cost`

> **Tool**: `estimate_tech_debt_cost` — estimates the carrying cost of accumulated technical debt for a target organization. Wraps `calculateFromRawInputs` — the raw-value entry point that bypasses the website wizard's slider domain.
>
> **Sources of truth** (the contract cites these; it does not duplicate them):
>
> - **Validation**: [`src/schemas/tech-debt.ts`](../../../../../src/schemas/tech-debt.ts) — `TechDebtInputsSchema`, `DEPLOY_FREQUENCY_VALUES` tuple
> - **Engine logic**: [`src/utils/tech-debt-engine.ts`](../../../../../src/utils/tech-debt-engine.ts) — `calculateFromRawInputs` (lines ~88–120), `DEPLOY_OPTIONS` (lines 10–20), `RawTechDebtInputs` interface
> - **Burden classification (output context)**: [`src/utils/tech-debt-engine.ts`](../../../../../src/utils/tech-debt-engine.ts) — `burdenClassify` (lines 205–211), `contextNote` (lines 225–235)
>
> **Used by prompts** (BL-031.75): [`gst_target_quick_look`](../../../prompts/target-quick-look.ts) (first-look brief — Tech Debt range section reports `annualCost`, `debtPctArr`, `paybackMonths`, DORA tier; the prompt body instructs the model to synthesize raw inputs from `productType + stage` norms biased toward conservative midpoints when uncertain). The tool's `deeplink` opens the calculator with sliders pre-positioned to reproduce the supplied raw inputs (subject to slider-granularity quantization — see BL-034 cleanup item).
>
> **Version**: `v1` | **Last authored**: 2026-04-28
>
> **Registry**: see [`../contracts/README.md`](../README.md).

---

## Field overview

10 raw business-meaningful inputs. The MCP tool deliberately **does not** accept the website wizard's slider positions (`teamSizePos`, `salaryPos`, etc.) — those are a UI concern that has no business in an agent-facing schema. Both surfaces produce identical output for equivalent inputs (verified by parity test).

| Field                  | Type     | Range     | Notes                                                             |
| ---------------------- | -------- | --------- | ----------------------------------------------------------------- |
| `teamSize`             | int      | > 0       | Engineering headcount                                             |
| `salary`               | number   | > 0       | Average annual fully-loaded engineering salary (dollars)          |
| `maintenanceBurdenPct` | number   | 0–100     | % of engineering capacity consumed by maintenance / debt          |
| `deployFrequency`      | enum (9) | see below | Deployment cadence — drives DORA-aligned velocity multiplier      |
| `incidents`            | int      | ≥ 0       | Production incidents per month                                    |
| `mttrHours`            | number   | ≥ 0       | Mean time to recovery, hours per incident                         |
| `remediationBudget`    | number   | ≥ 0       | Capital available for debt-paydown (dollars)                      |
| `arr`                  | number   | ≥ 0       | Annual recurring revenue (dollars) — used to compute `debtPctArr` |
| `remediationPct`       | number   | 0–100     | Expected reduction in debt cost from a remediation effort         |
| `contextSwitchOn`      | boolean  | —         | Whether to model the 23% context-switch overhead surcharge        |

---

## `deployFrequency` valid values

Each label maps to a DORA-aligned `doraLabel` and a velocity multiplier `V` that scales the maintenance cost. The label-to-multiplier table is canonical in `DEPLOY_OPTIONS`:

| Label          | DORA   | V    | Interpretation                            |
| -------------- | ------ | ---- | ----------------------------------------- |
| `Multiple/day` | Elite  | 0.8  | Pipeline so smooth maintenance is cheaper |
| `Daily`        | Elite  | 0.9  |                                           |
| `Weekly`       | High   | 1.0  | Baseline                                  |
| `Bi-weekly`    | High   | 1.1  |                                           |
| `Three-week`   | Medium | 1.25 |                                           |
| `Monthly`      | Medium | 1.45 |                                           |
| `Quarterly+`   | Low    | 1.7  |                                           |
| `Bi-annually`  | Low    | 2.0  |                                           |
| `Annually`     | Low    | 2.4  | Slowest cadence — friction compounds      |

A schema/engine drift test (`tech-debt.test.ts`) asserts these labels stay in sync between `DEPLOY_FREQUENCY_VALUES` (Zod) and `DEPLOY_OPTIONS` (engine). Adding a new cadence requires updating both.

---

## Per-field detail

### Cost-driving inputs

- **`teamSize`** — direct multiplier on `directMonthly`. Doubling team size doubles the carrying cost.
- **`salary`** — the per-engineer fully-loaded salary; drives both `directMonthly` (proportionally) and `incidentMonthly` (via `hourlyRate = salary / 2080`).
- **`maintenanceBurdenPct`** — the headline input. The cost-of-debt formula is `teamSize × (salary/12) × (maintenanceBurdenPct/100) × V`. A 25% burden translates to a quarter of engineering capacity going to debt servicing.

### `incidents`, `mttrHours`

Combine to produce `incidentMonthly = incidents × mttrHours × hourlyRate`. Independent of the maintenance burden — incident time is overhead the team pays beyond the steady-state burden.

### `contextSwitchOn`

When `true`, adds `contextSwitchMonthly = directMonthly × 0.23` (the 23% overhead surcharge). Reflects the multiplier of context-switching observed in studies of fragmented engineering work.

### `remediationBudget`, `remediationPct`, `arr`

These three drive the **post-remediation** outputs:

- `monthlySavings = totalMonthly × (remediationPct / 100)` — savings if the remediation is executed at the configured efficiency.
- `paybackMonths = remediationBudget / monthlySavings` — payback period for the remediation budget.
- `debtPctArr = annualCost / arr × 100` — debt cost as % of revenue (a common deal-discussion framing).

**`arr` is allowed to be zero** — when zero, `debtPctArr` is reported as `0` rather than infinity. The engine handles the divide-by-zero defensively.

---

## Output shape (return value)

```ts
{
  totalMonthly: number,           // directMonthly + contextSwitchMonthly + incidentMonthly
  annualCost: number,             // totalMonthly × 12
  hoursLostPerEng: number,        // 40 × maintenanceBurdenPct/100
  costPerEng: number,             // totalMonthly / teamSize
  directMonthly: number,
  contextSwitchMonthly: number,
  incidentMonthly: number,
  V: number,                      // velocity multiplier from deployFrequency
  doraLabel: string,              // DORA tier from deployFrequency
  debtPctArr: number,             // annualCost / arr × 100 (0 if arr === 0)
  paybackMonths: number,          // Infinity if remediationPct === 0
  monthlySavings: number          // totalMonthly × remediationPct/100
}
```

---

## Hidden semantics

- **The website's slider helpers are intentionally bypassed.** `posToTeamSize` / `posToSalary` / `posTobudget` / `posToArr` produce specific quantization (round to nearest 5K for salary, round to nearest 1K for budget, etc.) that is a wizard-UX concern. The MCP tool accepts arbitrary raw values and lets the agent pick precision. Both entry points produce identical results for equivalent inputs; the test suite enforces this.
- **`paybackMonths === Infinity`** when `remediationPct` is zero (no expected savings). The MCP wrapper does not reformat this — consumers should treat `Infinity` as "remediation produces no payback" rather than as an error.
- **DORA labels are advisory**, not gating. The engine accepts any of the 9 cadence labels and returns the matching `V` and `doraLabel`. Cadence does not change the input set or output set — it only scales the cost.

---

## Related

- Tool wrapper: [`mcp-server/src/tools/tech-debt.ts`](../../../tools/tech-debt.ts)
- Live website: <https://globalstrategic.tech/hub/tools/tech-debt-calculator>
- Architecture: [ADR-0004 — Resources surface](../../../../../src/docs/adr/0004-hub-surface-resources-import-restriction.md) · [`ARCHITECTURE.md`](../../ARCHITECTURE.md)
