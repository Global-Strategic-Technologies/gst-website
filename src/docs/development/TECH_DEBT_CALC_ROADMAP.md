# Tech Debt Cost Calculator — Improvement Roadmap

**Tool**: [/hub/tools/tech-debt-calculator](/hub/tools/tech-debt-calculator)
**Source**: [src/pages/hub/tools/tech-debt-calculator/index.astro](../../pages/hub/tools/tech-debt-calculator/index.astro)
**Engine**: [src/utils/tech-debt-engine.ts](../../utils/tech-debt-engine.ts)
**Tests**: [tests/unit/tech-debt-engine.test.ts](../../../tests/unit/tech-debt-engine.test.ts)
**Last Assessed**: March 2026

---

## Current State Summary

The calculator is a clean, dependency-free interactive tool built on a pure TypeScript engine (`tech-debt-engine.ts`) with full unit test coverage (38 tests). It supports two modes — Quick (direct labor only) and Deep Dive (adds incident cost, DORA velocity, ROI analysis) — and is designed for PE diligence conversations.

### Strengths

- Pure engine with 100% testable functions, zero framework dependencies
- Two-mode UX serves different audience depths effectively
- DORA velocity multiplier (`V`) is a credible, benchmark-backed differentiator
- Responsive at 768 / 480 / 360px breakpoints
- Good separation of concerns: engine, render loop, and DOM wiring are distinct layers

### Known Issues

| Category      | Issue                                                                                                              | Severity |
| ------------- | ------------------------------------------------------------------------------------------------------------------ | -------- |
| Calculation   | `monthlySavings` aliased directly from `totalMonthly` — assumes 100% debt resolution, no partial-remediation model | Medium   |
| Calculation   | Velocity multiplier `V` applied to direct labor only; incident cost ignores deployment frequency effects           | Medium   |
| Calculation   | `hoursLostPerEng` doesn't account for context-switching overhead multiplier                                        | Low      |
| UX            | No URL state persistence — refresh resets all inputs; results cannot be shared                                     | High     |
| UX            | No export path — no way to carry results into a slide deck or memo                                                 | High     |
| UX            | No scenario comparison — cannot contrast current vs. post-remediation state in one view                            | High     |
| UX            | Context panel narrative is mode-agnostic — doesn't reflect incident cost in deep mode                              | Low      |
| Styling       | Multiple hardcoded `rgba(5, 205, 153, …)` values — violates CSS variables standard                                 | Medium   |
| Styling       | Multiple hardcoded font sizes (`0.56rem`, `0.58rem`, `0.6rem`, `0.62rem`) — not from typography scale              | Medium   |
| Accessibility | Range inputs have no `aria-valuenow` updates on change                                                             | Medium   |
| Accessibility | Deploy frequency buttons have no `aria-pressed` state                                                              | Low      |
| Accessibility | Metrics bar has no live region — screen readers don't hear recalculations                                          | Medium   |
| Architecture  | `render()` is a 100-line monolith with no sub-renders; hard to unit-test DOM layer                                 | Low      |
| Architecture  | `el()` / `getInput()` helpers cast to non-null without null guards                                                 | Low      |
| Testing       | No integration tests covering the DOM/UI layer — only engine logic is tested                                       | Medium   |
| SEO           | No structured data (JSON-LD) for the tool page                                                                     | Low      |

---

## Roadmap

### Priority 1 — Shareable State & Export

**Effort: S–XS each | Impact: High**

The primary audience takes outputs into diligence conversations. Results currently evaporate on refresh — the single highest-friction gap for the use case.

**Initiatives:**

1. **URL-encoded state persistence**
   - Serialize `CalcState` into a URL search param (compact JSON or base64) on every `render()` call
   - Deserialize on mount before `initSliders()` and `render()`
   - Zero backend required; works with Astro SSG
   - Enables browser back/forward navigation through input states

2. **Copy link button**
   - Single-click button in the calculator footer copies the current URL (with encoded state) to clipboard
   - Visual confirmation (button text change, brief animation)

3. **Print stylesheet**
   - `@media print` CSS that collapses the inputs panel and expands outputs/context for a clean 1-page print-to-PDF
   - Already has a logical layout separation between `[data-calc-inputs]` and `[data-calc-outputs]`

4. **Plain-text export**
   - "Copy Summary" button formats a structured text block (annual cost, per-eng cost, burden level, payback) suitable for pasting into a memo or email
   - No canvas/image required — plain text covers the core workflow

---

### Priority 2 — Scenario Comparison Mode

**Effort: M | Impact: High**

The engine is already stateless and pure — comparison is a UI-only addition.

**Initiative:**

5. **Baseline snapshot & comparison overlay**
   - "Set as Baseline" button freezes current `CalcResult` in memory
   - Metrics bar gains delta indicators (↓ $X / ↓ N%) showing change from baseline
   - Allows modeling "what if we cut maint% from 50→25 after a $1M remediation" against the original state
   - Baseline cleared on mode switch or explicit "Clear Baseline" action

---

### Priority 3 — Calculation Model Improvements

**Effort: S each | Impact: Medium**

Strengthens the defensibility of outputs for diligence conversations.

**Initiatives:**

6. **Partial remediation efficiency slider**
   - Replace `monthlySavings = totalMonthly` alias with a `remediationEfficiency` slider (0–100%)
   - Represents expected debt reduction from the remediation budget — 100% is rarely realistic
   - Updates `monthlySavings = totalMonthly × (remediationEfficiency / 100)`
   - Payback period recalculates accordingly
   - Default: 70% (industry-typical outcome for focused remediation programs)

7. **Context-switch overhead multiplier (Deep Dive)**
   - Optional toggle in Deep Dive: "Apply context-switch tax"
   - Adds ~23% overhead to direct labor cost (based on Gerald Weinberg's research: each task-switch costs ~20% productivity)
   - Displayed as a separate line item in the breakdown, not baked into the base formula
   - Keeps the model transparent and auditable

8. **Currency selector**
   - Dropdown: USD / EUR / GBP / CAD / AUD
   - Applies a static multiplier to all formatted outputs (no new math — `fmt()` and `fmtShort()` gain a currency param)
   - Salary range floor/ceiling labels update to match currency
   - Serves non-US PE firms reviewing international portfolio companies

---

### Priority 4 — Accessibility & CSS Standards Hardening

**Effort: S | Impact: Medium**

Fixes violations against the project's own CSS standards (see [STYLES_GUIDE.md](../styles/STYLES_GUIDE.md)) and WCAG 2.1 AA gaps.

**Initiatives:**

9. **Range input ARIA attributes**
   - Add `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, `aria-valuetext` to all `<input type="range">` elements
   - `aria-valuenow` and `aria-valuetext` updated in `render()` on each recalculation
   - `aria-valuetext` should use the same formatted strings already computed (e.g., "8 engineers", "$150K salary")

10. **Deploy button ARIA state**
    - Add `aria-pressed` attribute to each deploy frequency button
    - Updated in `render()` to reflect `state.deployIdx`

11. **Metrics bar live region**
    - Wrap `[data-calc-metrics-bar]` (or its primary row) in `role="status" aria-live="polite" aria-atomic="false"`
    - Screen readers will announce recalculation results without interrupting user input

12. **CSS variables migration**
    - Replace all hardcoded `rgba(5, 205, 153, …)` values with `var(--color-primary-rgb)` or equivalent project tokens
    - Replace bare font-size literals (`0.56rem`, `0.58rem`, `0.6rem`, `0.62rem`) with nearest typography scale variables or introduce named micro-label tokens
    - Reference: [VARIABLES_REFERENCE.md](../styles/VARIABLES_REFERENCE.md)

---

### Priority 5 — Executive Summary Mode (Third Tab)

**Effort: M | Impact: High**

Completes the audience spectrum: Quick (napkin), Deep Dive (analyst), Executive Summary (board/memo).

**Initiative:**

13. **Industry archetype presets + narrative output**
    - Third tab alongside Quick / Deep Dive
    - No sliders — presents 4–5 pre-configured archetypes:
      - SaaS Series A (8 eng, $130K, 45% maint, weekly deploys)
      - SaaS Series C (35 eng, $160K, 35% maint, daily deploys)
      - PE Portfolio Co. (20 eng, $140K, 55% maint, monthly deploys)
      - Enterprise ISV (80 eng, $155K, 60% maint, quarterly deploys)
    - Selecting an archetype populates `state` and renders a 3–4 sentence executive narrative paragraph
    - Narrative templates live in the engine layer as pure functions (testable)
    - "Customize" button transitions to Deep Dive with the archetype values pre-loaded

---

### Priority 6 — Workbench Integration

**Effort: S | Impact: High**

Surfaces the calculator in context where PE users are already working.

**Initiative:**

14. **Diligence Machine cross-link**
    - When the Diligence Machine output flags a "high technical debt risk" signal, render a CTA card linking to the Tech Debt Calculator
    - Pre-populate URL state based on inputs already collected in the Diligence Machine (team size, maturity level)
    - Navigation/UX change only — no new data infrastructure

---

### Priority 7 — Architecture & Testing

**Effort: M | Impact: Low (quality/maintainability)**

Reduces future maintenance risk and enables DOM-layer testing.

**Initiatives:**

15. **Decompose `render()` into sub-functions**
    - Extract `renderMetricsBar()`, `renderContextPanel()`, `renderPayback()`, `renderSliderDisplays()`
    - Each sub-function takes `CalcResult` and `CalcState` as params — no implicit state access
    - Makes each rendering concern independently testable

16. **DOM integration tests**
    - Add Vitest + JSDOM tests covering:
      - Mode switch (Quick → Deep Dive): confirm deep-only elements become visible, detail row opacity changes
      - Slider input event → metric element text content update
      - Deploy button click → DORA message update and `aria-pressed` state
      - URL state round-trip: encode state → navigate to URL → verify inputs initialize correctly

17. **JSON-LD structured data**
    - Add `SoftwareApplication` schema to the page `<head>` via `BaseLayout` slot
    - Properties: `name`, `description`, `applicationCategory: "BusinessApplication"`, `operatingSystem: "Web"`
    - Low discoverability value but zero runtime cost

---

## Effort / Impact Summary

| #   | Initiative                            | Effort | Impact | Priority |
| --- | ------------------------------------- | ------ | ------ | -------- |
| 1   | URL-encoded state persistence         | S      | High   | P1       |
| 2   | Copy link button                      | XS     | High   | P1       |
| 3   | Print stylesheet                      | XS     | Medium | P1       |
| 4   | Plain-text export                     | XS     | High   | P1       |
| 5   | Baseline snapshot & comparison        | M      | High   | P2       |
| 6   | Partial remediation efficiency slider | S      | Medium | P3       |
| 7   | Context-switch overhead toggle        | S      | Medium | P3       |
| 8   | Currency selector                     | XS     | Medium | P3       |
| 9   | Range input ARIA attributes           | S      | Medium | P4       |
| 10  | Deploy button ARIA state              | XS     | Medium | P4       |
| 11  | Metrics bar live region               | XS     | Medium | P4       |
| 12  | CSS variables migration               | S      | Medium | P4       |
| 13  | Executive Summary mode                | M      | High   | P5       |
| 14  | Diligence Machine cross-link          | S      | High   | P6       |
| 15  | Decompose `render()`                  | M      | Low    | P7       |
| 16  | DOM integration tests                 | M      | Low    | P7       |
| 17  | JSON-LD structured data               | XS     | Low    | P7       |

**Highest-ROI cluster**: P1 (initiatives 1–4) — minimal code changes, maximum impact for the PE diligence workflow.

---

## Implementation Notes

- All P1 initiatives can be implemented entirely within `index.astro` — no new files required
- URL state encoding should use `URLSearchParams` + `btoa`/`atob` to stay within the existing no-dependency constraint
- Currency selector (P3-8) requires only a `fmtCurrency(n, currency)` wrapper in `tech-debt-engine.ts` — the engine math is currency-agnostic
- Executive Summary narratives (P5-13) should be pure functions added to `tech-debt-engine.ts` so they are unit-testable
- All CSS changes in P4 must be verified in both light and dark theme before committing

---

_Last updated: March 2026_
