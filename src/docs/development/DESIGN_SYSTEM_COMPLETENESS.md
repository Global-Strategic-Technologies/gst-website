# Design System Completeness Initiative

Close the gap between documented design system conventions and actual implementation across the GST website. Two workstreams: font-size standardization and brand page component coverage.

**Status**: Planned
**Priority**: Medium — design system maturity
**Created**: April 5, 2026

---

## Table of Contents

1. [Motivation](#1-motivation)
2. [Workstream A: Font-Size Standardization](#2-workstream-a-font-size-standardization)
3. [Workstream B: Brand Page Component Coverage](#3-workstream-b-brand-page-component-coverage)
4. [Commit Sequence](#4-commit-sequence)
5. [Verification](#5-verification)
6. [Deferred Initiatives](#6-deferred-initiatives)

---

## 1. Motivation

The design system remediation roadmap (`STYLES_REMEDIATION_ROADMAP.md`) completed 12 initiatives addressing hardcoded colors, spacing, legacy classes, and documentation. Two significant gaps remain:

1. **152 hardcoded font-sizes** in application code that don't use the `--text-*` token scale — concentrated in portfolio components, about page, and services page. These break font consistency and make global typography changes impossible.

2. **~20 missing components** on the brand page — `.brutal-*` classes that are defined in `global.css` and used in production but have no visual specimen on `/brand`. This makes the brand page incomplete as a living design system reference.

A strategic assessment also evaluated extracting the design system into a standalone npm package. **Recommendation: defer extraction.** The system has a single consumer, is still maturing, and the current single-import architecture through `BaseLayout.astro` is already clean and extraction-ready. Re-evaluate when a second consumer (client portal, dashboard, microsite) exists.

---

## 2. Workstream A: Font-Size Standardization

### 2A. Token Scale Extension

The current `--text-*` scale in `variables.css`:

| Token | Value | Usage |
|-------|-------|-------|
| `--text-xs` | 0.75rem (12px) | Labels, captions, metadata |
| `--text-sm` | 0.875rem (14px) | Body small, descriptions |
| `--text-base` | 1rem (16px) | Body text |
| `--text-lg` | 1.1rem (17.6px) | Emphasized body |
| `--text-xl` | 1.25rem (20px) | Section headings |
| `--text-2xl` | 1.5rem (24px) | Page sub-headings |

**Gaps identified:**
- `0.65rem` used 3+ times (metric labels, fine print) — below `--text-xs`
- `1.75rem`–`2rem` used 5+ times (page headings, modal titles) — above `--text-2xl`

**New tokens to add:**

| Token | Value | Rationale |
|-------|-------|-----------|
| `--text-2xs` | 0.65rem (10.4px) | Sub-caption metric labels and fine print |
| `--text-3xl` | 2rem (32px) | Page-level headings (about, portfolio summary) |

### 2B. Rounding Decisions

Values within ±0.1rem of a token snap to the nearest token. Specific mappings:

| Hardcoded Value | → Token | Gap |
|----------------|---------|-----|
| 0.65rem | `--text-2xs` | New token |
| 0.7rem | `--text-xs` | -0.05rem |
| 0.8rem, 0.8125rem | `--text-sm` | -0.075rem / -0.0625rem |
| 0.85rem, 0.9rem, 0.9375rem, 0.95rem | `--text-sm` | ±0.075rem max |
| 1.02rem, 1.05rem | `--text-base` | +0.05rem max |
| 1.125rem, 1.15rem | `--text-lg` | +0.05rem max |
| 1.2rem | `--text-xl` | -0.05rem |
| 1.28rem, 1.3rem, 1.35rem | `--text-xl` | +0.1rem max |
| 1.4rem | `--text-2xl` | -0.1rem |
| 1.75rem, 1.8rem, 2rem | `--text-3xl` | New token covers all |

### 2C. File-Level Impact

| File | Replacements | Notes |
|------|-------------|-------|
| `src/components/portfolio/PortfolioGrid.astro` | ~21 | Largest single file. Cards, metrics, badges, responsive breakpoints. |
| `src/pages/about.astro` | ~26 | Section headings, card text, founder bio. Many breakpoint variants. |
| `src/components/portfolio/ProjectModal.astro` | ~14 | Modal title, labels, tags, responsive. |
| `src/pages/services.astro` | ~14 | Service cards, audience cards, responsive. |
| `src/components/portfolio/PortfolioHeader.astro` | ~8 | Portfolio title, labels. |
| `src/components/portfolio/StickyControls.astro` | ~8 | Control text, labels, responsive. |
| `src/components/EngagementFlow.astro` | ~6 | Step labels, responsive variants. |
| `src/components/PortfolioSummary.astro` | ~5 | Title, metric labels, subtitle. |
| `src/pages/hub/index.astro` | ~4 | Category text, descriptions. |
| `src/pages/brand.astro` | ~8 | Self-referential specimens (should use own tokens). |
| `src/components/Footer.astro` | ~1 | Footer link size. |

**Total: ~115 replacements across 11 files.**

### 2D. Exclusions (Documented Exceptions)

These hardcoded font-sizes are intentionally excluded:

- **SVG/chart text** (px/pt units in data visualizations) — TechPar, ICG, Diligence Machine, Regulatory Map chart SVGs. These use pixel values for precise rendering within SVG viewBoxes.
- **Print stylesheet overrides** — Hardcoded sizes in `@media print` blocks for PDF output optimization.
- **SwatchControlStyles.astro** — Design system internal component with pixel-level control over color picker UI.
- **Brand page design specimens** — Sizes used to demonstrate the typography scale itself (e.g., showing "this is 14px" as a specimen).

---

## 3. Workstream B: Brand Page Component Coverage

### 3A. Current State

The brand page demonstrates 161 of 237 `.brutal-*` classes. The 76 missing classes break down as:
- **8 missing top-level components** (no specimen at all)
- **~12 missing variants** of components that are partially shown
- **~56 sub-element classes** (e.g., `__header`, `__label`) that are implicitly covered by their parent component specimen

### 3B. Missing Top-Level Components

| Component | Defined In | Usages | Description |
|-----------|-----------|--------|-------------|
| `.brutal-bottom-sheet` | global.css:4398 | 13+ | Slide-up overlay panel for mobile map controls |
| `.brutal-choice-btn` | global.css:2394 | 7+ | Diligence machine question choice buttons |
| `.brutal-content-label` | global.css:2898 | 3+ | Content section labels |
| `.brutal-input` | global.css:2282 | 1+ | Standalone text input |
| `.brutal-map-container` | global.css:4112 | 3+ | SVG map wrapper |
| `.brutal-map-hint` | global.css:4221 | 6+ | Instructional hint overlay on map |
| `.brutal-map-tap-bar` | global.css:4157 | 6+ | Mobile bottom bar for map selection |
| `.brutal-quick-zoom` | global.css:4196 | 5+ | Map zoom control buttons |

### 3C. Missing Variants of Shown Components

| Variant | Parent | Usages | Description |
|---------|--------|--------|-------------|
| `.brutal-faq--lg` | brutal-faq | 3 | Larger FAQ item variant |
| `.brutal-frosted--heavy` | brutal-frosted | 4 | Strong frosted glass effect |
| `.brutal-frosted--blur-only` | brutal-frosted | 1 | Blur without tint |
| `.brutal-frosted--overlay` | brutal-frosted | 3 | Full overlay frost |
| `.brutal-option-card--compact` | brutal-option-card | 4 | Compact card variant |
| `.brutal-option-card--selected-outline` | brutal-option-card | 12 | Outline-only selected state |
| `.brutal-search__result` | brutal-search | 7+ | Search dropdown result items |
| `.brutal-search__no-results` | brutal-search | 1 | Empty state message |
| `.brutal-segmented--wide` | brutal-segmented | 0 | Full-width segmented control |
| `.brutal-panel__copy` | brutal-panel | 5+ | Copy-to-clipboard button |
| `.brutal-reg-card__summary` | brutal-reg-card | 1 | Regulation summary text |

### 3D. Specimen Pattern

Each new component follows the established brand page pattern:

```html
<h4 class="brutal-label brand-subgroup-title">Component Name</h4>
<div class="brand-component-row">
  <div class="brand-component-item [brand-component-item--full]">
    <!-- Live HTML demo using actual .brutal-* classes -->
    <code class="brand-code">.class-name — description, modifiers, states</code>
  </div>
</div>
```

- Simple components: ~15–20 lines
- Components with state variants: ~25–40 lines (show default + active/selected side-by-side)
- Interactive components: add `data-demo-*` attributes + JS in script block

---

## 4. Commit Sequence

| # | Commit | Scope |
|---|--------|-------|
| 1 | `docs(design-system): add design system completeness initiative plan` | This document |
| 2 | `feat(design-system): extend text token scale with --text-2xs and --text-3xl` | variables.css |
| 3 | `refactor(portfolio): replace hardcoded font-sizes with text tokens` | PortfolioGrid, ProjectModal, PortfolioHeader, StickyControls, PortfolioSummary |
| 4 | `refactor(about): replace hardcoded font-sizes with text tokens` | about.astro |
| 5 | `refactor(services): replace hardcoded font-sizes with text tokens` | services.astro |
| 6 | `refactor(engagement-flow): replace hardcoded font-sizes with text tokens` | EngagementFlow.astro |
| 7 | `refactor(hub): replace hardcoded font-sizes with text tokens` | hub/index.astro, Footer.astro |
| 8 | `feat(brand): add missing component specimens to UI library` | brand.astro |
| 9 | `docs(design-system): sync typography reference with current token scale` | TYPOGRAPHY_REFERENCE.md |

---

## 5. Verification

### Per-Commit Checks
- `npm run build` — clean, no errors
- `npm run test:run` — all unit/integration tests pass
- Grep `tests/` for any changed strings (per CLAUDE.md directive #8)

### Post-Initiative Checks
- Brand page: all new specimens render correctly in light and dark themes
- Font-size diff: visual spot-check at 1440px, 768px, 480px for each remediated page
- No regressions in responsive layouts (cards, grids, modals)
- Token coverage: grep for remaining hardcoded `font-size:` values — only documented exceptions should remain

---

## 6. Deferred Initiatives

These were identified in the design system maturity assessment but are out of scope for this initiative:

| Initiative | Reason for Deferral |
|-----------|-------------------|
| **Package extraction** | Single consumer, system still maturing. Re-evaluate when second project needs design tokens. |
| **Primary color opacity scale** | Useful but lower impact than font-size standardization. Track in remediation roadmap. |
| **Dark border variable** | Replace 47 instances of `rgba(255,255,255,0.15)`. Track in remediation roadmap. |
| **Accessibility section** | Largest qualitative gap (focus states, contrast ratios, ARIA). Separate initiative. |
| **Responsive behavior demos** | Brand page feature. Lower priority than component coverage. |
| **Component state documentation** | Show all states (error, disabled, loading) per component. Incremental addition. |
| **global.css split** | Prep for future extraction — split into tokens.css + components.css + layout.css. Only needed if extraction becomes likely. |

---

## Related Documentation

- [STYLES_REMEDIATION_ROADMAP.md](../styles/STYLES_REMEDIATION_ROADMAP.md) — Previous 12 completed initiatives
- [VARIABLES_REFERENCE.md](../styles/VARIABLES_REFERENCE.md) — Design token catalog
- [TYPOGRAPHY_REFERENCE.md](../styles/TYPOGRAPHY_REFERENCE.md) — Typography utility classes
- [BRAND_GUIDELINES.md](../styles/BRAND_GUIDELINES.md) — Brand color palette and usage rules
- [STYLES_GUIDE.md](../styles/STYLES_GUIDE.md) — CSS conventions and patterns

---

**Created**: April 5, 2026
