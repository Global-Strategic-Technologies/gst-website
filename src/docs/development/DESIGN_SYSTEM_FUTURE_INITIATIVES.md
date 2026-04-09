# Design System — Future Initiatives

Tracked initiatives identified during the design system maturity assessment (April 2026) that were deferred from the Design System Completeness Initiative (archived — see git history for commit `b111e64`). Each is independent and can be executed in any order.

**Status**: Initiatives 1–5 Complete, Documentation Updated
**Created**: April 5, 2026
**Completed**: April 5, 2026

### Completion Summary (Initiatives 1–5)

| # | Initiative | Commits | Key Outcome |
|---|-----------|---------|-------------|
| 1 | Primary Color Opacity Scale | 1 | 19 `--color-primary-XX` tokens, ~50 hardcoded replacements across 5 files |
| 2 | Dark Border Variable | 1 | 3 `--border-dark-*` tokens, 132 replacements across 18 files |
| 3 | Accessibility Section | 1 | Brand page section: focus states, contrast tables, touch targets, keyboard nav, ARIA, semantic HTML |
| 4 | Responsive Behavior Demos | 1 | Brand page section with iframe demos at 1200/768/480px + `/brand/responsive-frame` route |
| 5 | Component State Documentation | 1 | Brand page section: forced-state specimens for buttons, fields, option cards, choice buttons |
| 6 | Documentation Updates | 2 | VARIABLES_REFERENCE, STYLES_GUIDE, BRAND_GUIDELINES updated with new tokens and sections |

---

## Table of Contents

1. [Primary Color Opacity Scale](#1-primary-color-opacity-scale)
2. [Dark Border Variable](#2-dark-border-variable)
3. [Accessibility Section](#3-accessibility-section)
4. [Responsive Behavior Demos](#4-responsive-behavior-demos)
5. [Component State Documentation](#5-component-state-documentation)
6. [Package Extraction](#6-package-extraction)
7. [global.css Split](#7-globalcss-split)

---

## 1. Primary Color Opacity Scale

**Status**: Complete (April 5, 2026)
**Priority**: Medium
**Effort**: Small

**Problem**: `rgba(5, 205, 153, 0.xx)` appears ~30+ times across the codebase at varying opacities (5%, 8%, 10%, 12%, 15%, 20%, 30%). Each is a manual calculation from the primary color hex. Changing the primary color requires updating every instance.

**Scope**:
- Define opacity-variant tokens in `variables.css`:
  ```css
  --color-primary-5: rgba(var(--color-primary-rgb), 0.05);
  --color-primary-8: rgba(var(--color-primary-rgb), 0.08);
  --color-primary-10: rgba(var(--color-primary-rgb), 0.10);
  --color-primary-15: rgba(var(--color-primary-rgb), 0.15);
  --color-primary-20: rgba(var(--color-primary-rgb), 0.20);
  --color-primary-30: rgba(var(--color-primary-rgb), 0.30);
  ```
- Replace hardcoded `rgba(5, 205, 153, ...)` instances with the appropriate token
- Add dark theme overrides if opacity levels differ

**Depends on**: `--color-primary-rgb` already exists (added in Init 12).

**Files affected**: diligence-machine, ICG, TechPar, portfolio components, skeleton loading.

---

## 2. Dark Border Variable

**Status**: Complete (April 5, 2026)
**Priority**: Medium
**Effort**: Small

**Problem**: `rgba(255, 255, 255, 0.15)` appears 47 times as the dark-theme border color. This pattern is correct and consistent, but it's hardcoded in every file rather than referenced from a single token.

**Scope**:
- Define `--border-dark-subtle: rgba(255, 255, 255, 0.15)` in `variables.css` (under `html.dark-theme`)
- Replace all 47 instances across scoped `<style>` blocks
- Document in VARIABLES_REFERENCE.md

**Files affected**: diligence-machine (20+), TechPar (10+), ICG (5+), regulatory-map (5+), portfolio components (5+).

---

## 3. Accessibility Section

**Status**: Complete (April 5, 2026)
**Priority**: High
**Effort**: Large

**Problem**: The brand page has zero accessibility documentation. This is the largest qualitative gap in the design system reference. BRAND_GUIDELINES.md documents contrast requirements, but the brand page doesn't demonstrate them visually.

**Scope**:
- Add an "Accessibility" section to the brand page with:
  - Focus state demonstrations for all interactive components (buttons, inputs, links, cards)
  - WCAG contrast ratio examples for all color-on-background pairings (AA/AAA pass/fail)
  - Minimum touch target size guidance (44x44px per WCAG 2.5.5)
  - Keyboard navigation patterns (tab order, focus trapping for modals, arrow keys for tabs)
  - ARIA pattern examples (live regions, labels, descriptions)
  - Semantic HTML patterns (heading hierarchy, landmark roles)
- Optionally: add an interactive contrast checker tool

**Note**: This is the highest-priority deferred initiative from a compliance perspective.

---

## 4. Responsive Behavior Demos

**Status**: Complete (April 5, 2026)
**Priority**: Low
**Effort**: Medium

**Problem**: The brand page shows no responsive behavior. Components are rendered at desktop width only. Developers can't see how grids collapse, text scales, or panels reflow at 768px and 480px.

**Scope**:
- Add viewport-responsive demonstrations for key component categories
- Options: embedded iframes at fixed widths, screenshot pairs, or a viewport resize toggle
- Cover: swatch grids, card layouts, tab bars, tool shells, form controls

---

## 5. Component State Documentation

**Status**: Complete (April 5, 2026)
**Priority**: Medium
**Effort**: Medium-Large

**Problem**: Most brand page specimens show only the default state. Components like buttons, inputs, cards, and form fields have multiple states (hover, active, focus, disabled, error, loading) that aren't demonstrated.

**Scope**:
- For each component on the brand page, add state variant specimens
- Priority components: `.brutal-btn` (disabled, loading), `.brutal-field` (error, disabled, readonly), `.brutal-option-card` (all selection states), `.brutal-choice-btn` (hover, focus)
- Use inline styles or `data-demo-*` JS to show states side-by-side

---

## 6. Package Extraction

**Status**: Deferred indefinitely
**Priority**: N/A (no current need)
**Effort**: Large

**Problem**: The design system could theoretically be extracted into a standalone npm package for reuse across multiple projects.

**Current assessment** (April 2026):
- Single consumer (GST website only)
- Design system still maturing (completeness initiative just finished)
- No monorepo infrastructure exists
- Current architecture is already clean (single import through BaseLayout)
- Extraction would add build complexity with zero present-day benefit

**Re-evaluate when**:
- A second project needs the same design language (client portal, dashboard, microsite)
- The design system stabilizes to where changes are infrequent
- The team grows beyond one person and versioned releases would aid coordination

---

## 7. global.css Split

**Status**: Deferred (extraction prep)
**Priority**: Low
**Effort**: Medium

**Problem**: `global.css` (5,465 lines) mixes design tokens, component classes, and application-specific layout styles in a single file. If package extraction becomes likely, this should be split.

**Proposed split**:
- `tokens.css` — CSS custom properties, reset styles, root declarations
- `components.css` — all `.brutal-*` reusable component classes
- `layout.css` — application-specific page layouts (`.site-header`, `.container`, page-specific grids)

**Trigger**: Only needed if Initiative 6 (Package Extraction) becomes active.

---

## Related Documentation

- [DESIGN_SYSTEM_COMPLETENESS.md](./DESIGN_SYSTEM_COMPLETENESS.md) — Completed initiative (parent of these deferred items)
- [STYLES_REMEDIATION_ROADMAP.md](../styles/STYLES_REMEDIATION_ROADMAP.md) — Previous 12 completed remediation initiatives
- [VARIABLES_REFERENCE.md](../styles/VARIABLES_REFERENCE.md) — Design token catalog
- [STYLES_GUIDE.md](../styles/STYLES_GUIDE.md) — CSS conventions and patterns

---

**Created**: April 5, 2026
