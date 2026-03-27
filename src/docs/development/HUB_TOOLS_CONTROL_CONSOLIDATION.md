# Hub Tools — Control Consolidation Roadmap

Identifies reusable UI controls and patterns across the five hub tools that are currently implemented independently. Consolidating these improves consistency, reduces maintenance surface, and ensures UX cohesion as tools evolve.

**Status**: Complete — all 6 items implemented across Phases A-C
**Depends on**: Hub Tools Style Alignment Phases 1-2 (completed, `feature/style-redesign` branch)
**Last Updated**: March 26, 2026

---

## Table of Contents

1. [Benchmark Table Dual Markers](#1-benchmark-table-dual-markers)
2. [Copy-to-Clipboard Utility](#2-copy-to-clipboard-utility)
3. [Benchmark Table Styling](#3-benchmark-table-styling)
4. [Export Action Bar](#4-export-action-bar)
5. [Collapsible Sections](#5-collapsible-sections)
6. [Dark Theme Variable Migration](#6-dark-theme-variable-migration)
7. [Future Candidates](#7-future-candidates)

---

## 1. Benchmark Table Dual Markers

**Tools**: TechPar
**Priority**: Low — UX polish
**Effort**: Small

### Problem

ICG's benchmark table uses two inline badge markers — **"Your stage"** and **"Your range"** — so users see both their selected stage and where their actual score falls. TechPar's benchmark table only highlights the stage row (`.tp-btbl--active`) with no indicator for where the computed cost ratio lands relative to other stages' ranges.

### Reference

ICG injects badges into the first `<td>` of matching rows:

```html
<td>PE-backed portco, 2+ years post-acquisition
  <span class="icg-bench-label icg-bench-label--score">Your range</span>
</td>
```

CSS classes: `.icg-bench-label` (pill base), `--stage` (primary tint), `--score` (accent tint).
JS: iterates rows, compares score against `data-bench` range attribute, toggles classes and injects spans.

### Implementation

1. Add `data-bench="60-100"` attributes to TechPar table rows
2. Add CSS: `.tp-btbl-label` (pill), `--stage` (primary), `--ratio` (zone-colored), `.tp-btbl--in-range`
3. Extend `techpar-ui.ts` ~line 892: parse ranges, toggle `.tp-btbl--in-range`, inject badge spans
4. Clear badges before each re-render to avoid duplicates

**Edge cases**: both badges on same row when ratio is healthy; no ratio badge when outside all ranges; overlapping ranges use first match.

### Files

| File | Change |
|------|--------|
| `src/pages/hub/tools/techpar/index.astro` | `data-bench` attributes; 4 CSS classes |
| `src/utils/techpar-ui.ts` | Range matching + badge injection (~line 892) |

---

## 2. Copy-to-Clipboard Utility

**Tools**: DM, TDC, ICG, TechPar (4 of 5)
**Priority**: High — most duplicated logic
**Effort**: Small

### Problem

Each tool implements its own copy-to-clipboard with slightly different feedback patterns:

| Tool | Function | Feedback |
|------|----------|----------|
| DM | `copyToClipboard()` inline | Text → "Copied!" + 2s reset |
| TDC | Inline handler | Text swap + timeout |
| ICG | `data-action="copy"` handler | Text swap + timeout |
| TechPar | `copyLink()` / `copySummary()` in `techpar-ui.ts` | Text swap + class toggle (`tp-btn-share--copied`) |

### Implementation

Extract a shared utility:

```
src/utils/copy-feedback.ts

export function copyWithFeedback(
  text: string,
  button: HTMLElement,
  options?: { label?: string; duration?: number }
): Promise<void>
```

Handles: `navigator.clipboard.writeText`, save/restore original text, add/remove `--copied` class, configurable reset duration (default 2s).

### Files

| File | Change |
|------|--------|
| `src/utils/copy-feedback.ts` | New shared utility |
| 4 tool pages + `techpar-ui.ts` | Replace inline implementations with import |

---

## 3. Benchmark Table Styling

**Tools**: TechPar, ICG
**Priority**: Medium
**Effort**: Small

### Problem

Both tools have nearly identical benchmark reference tables — two-column layout with stage name + range, active row highlighting, and a disclaimer note — but use independent CSS:

| Property | TechPar (`.tp-btbl`) | ICG (`.icg-benchmark-table`) |
|----------|----------------------|------------------------------|
| Structure | `<table>` + `<tbody data-bench-tbl>` | `<table>` + `<tbody data-benchmark-body>` |
| Row attr | `data-bench-row="seed"` | `data-stage-row="pre-series-b"` |
| Active class | `.tp-btbl--active` | `.icg-bench-active` |
| Disclaimer | `.tp-bench-disc` | `.icg-benchmark-note` |

### Implementation

Add to `global.css` (alongside `.tool-authority`, `.tool-section-label`):

- `.tool-benchmark-table` — base table: collapse, full-width
- `.tool-benchmark-table td` — padding, font-size, border-bottom
- `.tool-benchmark-table .bench-row--active td` — accent background, primary color on value column
- `.tool-benchmark-note` — muted disclaimer text

Migrate both tools to use shared classes with tool-specific overrides where needed.

### Files

| File | Change |
|------|--------|
| `src/styles/global.css` | Add `.tool-benchmark-table` family |
| `src/pages/hub/tools/techpar/index.astro` | Replace `.tp-btbl` with shared + scoped overrides |
| `src/pages/hub/tools/infrastructure-cost-governance/index.astro` | Replace `.icg-benchmark-table` with shared + scoped overrides |

---

## 4. Export Action Bar

**Tools**: DM, TDC, ICG, TechPar (4 of 5)
**Priority**: Medium
**Effort**: Medium

### Problem

All interactive tools offer export actions (copy link, copy summary, print/PDF, JSON download, email) but implement the action bar container and button grouping independently:

| Tool | Container | Actions |
|------|-----------|---------|
| DM | `.doc-action-bar` (sticky toolbar) | Go back, Copy, Print, Start over |
| TDC | `.calc-footer__controls` | Currency select, Export PDF, Copy Summary, Copy Link |
| ICG | `.icg-actions` (flex row) | Copy summary, Copy link, JSON, Print, Email, Compare, Review, Start over |
| TechPar | `.tp-nav-row__actions` | Export PDF, Copy summary, Copy link |

### Implementation

1. Add `.tool-actions` container class to `global.css` — flex row, gap, responsive stacking at 480px
2. Standardize action grouping: primary nav (back/next) separate from utility actions (copy/export/print)
3. All actions already use `data-action` attributes — no handler changes needed, just CSS consolidation

This is a **CSS-only** change — standardize the container, not the handler logic.

### Files

| File | Change |
|------|--------|
| `src/styles/global.css` | Add `.tool-actions` container class |
| 4 tool pages | Replace tool-specific action bar classes with shared + scoped overrides |

---

## 5. Collapsible Sections

**Tools**: TechPar, TDC, RegMap, ICG
**Priority**: Medium
**Effort**: Small

### Problem

Four tools use expandable sections with different implementations:

| Tool | Element | Trigger |
|------|---------|---------|
| TechPar | `<details class="tp-onboarding">` / `<details class="tp-historical">` | Native `<summary>` |
| TDC | `<div data-advanced-panel class="is-hidden">` | `<button data-advanced-toggle>` |
| RegMap | `<details class="faq-item">` | Native `<summary class="faq-question">` |
| ICG | Rationale dropdowns | JS toggle |

TechPar and RegMap use native `<details>`/`<summary>` (accessible, SEO-friendly). TDC uses a custom JS toggle. Both approaches have similar visual treatment: a trigger element, collapsible body, and open/close transition.

### Implementation

1. Add `.tool-collapsible` base class to `global.css` for consistent styling of `<details>` elements
2. Add `.tool-collapsible__trigger` for `<summary>` styling (cursor, padding, chevron indicator)
3. Reuse the existing `.delta-chevron` / `.is-collapsed` pattern from `interactions.css`
4. Migrate TDC's custom toggle to native `<details>` if feasible (better a11y)

### Files

| File | Change |
|------|--------|
| `src/styles/global.css` | Add `.tool-collapsible` family |
| Tool pages using collapsibles | Replace tool-specific classes with shared |

---

## 6. Dark Theme Variable Migration

**Tools**: Regulatory Map (primary), ICG (partial — deferred from style alignment Phase 3)
**Priority**: Medium
**Effort**: Medium

### Problem

Most tools rely on CSS variables that auto-switch in dark theme. Two outliers use explicit `:global(html.dark-theme)` overrides with hardcoded values:

- **Regulatory Map**: 15+ dark theme selectors (lines 1558-1593) with hardcoded backgrounds and borders
- **ICG**: 21 inline `rgba(5, 205, 153, ...)` values for dark theme tints

### Implementation

1. Audit both files for hardcoded color values in dark theme blocks
2. Map each to an existing CSS variable or define new scoped variables in `variables.css`
3. Replace `:global(html.dark-theme)` overrides with variable-first approach where possible
4. Keep `:global()` only for properties that genuinely differ by theme and have no variable equivalent

### Files

| File | Change |
|------|--------|
| `src/pages/hub/tools/regulatory-map/index.astro` | Replace ~15 hardcoded dark overrides |
| `src/pages/hub/tools/infrastructure-cost-governance/index.astro` | Replace ~21 rgba values with variables |
| `src/styles/variables.css` | Add any new variables needed |

---

## 7. Future Candidates

Lower-priority patterns worth tracking but not yet warranting dedicated implementation plans:

### Progress / Wizard Step Indicators

DM uses a segmented progress bar (`role="progressbar"` + `.progress-segment`). TechPar uses a text label ("Step 1 of 4"). ICG has implicit progress. If a new tool needs wizard steps, extract DM's pattern into a shared `ToolProgress.astro` component rather than reimplementing.

### Zone / Tier Color Mapping

TechPar, ICG, and DM all map scores to colored zones or tiers (green/amber/red, high/medium/low). Each defines its own color mapping logic. A shared `src/utils/zone-colors.ts` utility could standardize the mapping pattern, though the zone definitions themselves are domain-specific.

### Dual-Bound Range Inputs

TDC pairs `<input type="range">` with `<input type="number">` for bidirectional input. If another tool needs this pattern, extract into a `RangeInput.astro` component with a controller utility.

### View State Management

DM, ICG, and TechPar all implement multi-view toggling (landing → wizard → results) with `is-hidden` class toggling. The pattern is similar but the view structures differ enough that a shared abstraction may be premature. Monitor for a third tool that needs this before extracting.

### Container Width Rationalization

Four different max-widths (660, 760, 800, 100%) with two tools not using `.tool-shell` at all. Current widths are intentional: RegMap needs full-width for the interactive map, TechPar needs fluid width for data tables, DM at 800px accommodates readable document output, TDC at 760px and ICG at 660px reflect content density differences. Revisit only if design requests convergence or a new tool needs a width not currently offered.

### TechPar Tab-Bar Z-Index

TechPar's tab-bar uses `z-index: 11` while `.site-header` uses `z-index: 10`. The tab-bar is intentionally sticky below the header. No observed conflict in practice, but if the z-index scale is formalized in `STYLES_GUIDE.md`, this should be documented there.

---

## Suggested Execution Order

| Phase | Items | Rationale |
|-------|-------|-----------|
| A | 2 (copy utility), 3 (benchmark table CSS) | Smallest scope, highest reuse, no visual change risk |
| B | 1 (TechPar markers), 4 (export action bar) | Feature + CSS consolidation, moderate scope |
| C | 5 (collapsibles), 6 (dark theme variables) | Broader refactoring, needs visual regression checks |

---

## Related

- Hub Tools Style Alignment — visual consistency audit and Phases 1-2 remediation (completed, removed after close-out)
- [STYLES_GUIDE.md](../styles/STYLES_GUIDE.md) — CSS conventions and hub tool patterns
- [VARIABLES_REFERENCE.md](../styles/VARIABLES_REFERENCE.md) — design token catalog
