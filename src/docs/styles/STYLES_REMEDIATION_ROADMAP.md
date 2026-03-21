# CSS Styles Remediation Roadmap

Tracked initiatives to close the gap between documented conventions and actual implementation. Each initiative is independent and can be executed in any order.

---

## Table of Contents

1. [Brand Color and Style Guidelines](#1-brand-color-and-style-guidelines)
2. [Hardcoded Color Remediation](#2-hardcoded-color-remediation)
3. [Hardcoded Spacing Remediation](#3-hardcoded-spacing-remediation)
4. [Diligence Machine Remediation](#4-diligence-machine-remediation)
5. [TechPar Style Deviations](#5-techpar-style-deviations)
6. [ICG Color Standardization](#6-icg-color-standardization)
7. [Standardized Tool Shell Container](#7-standardized-tool-shell-container)
8. [Dynamic Content Loading Pattern](#8-dynamic-content-loading-pattern)

---

## 1. Brand Color and Style Guidelines

**Status**: Not formalized

**Problem**: GST uses `#05cd99` as its primary brand teal, but there is no formal brand color palette, no documented secondary/tertiary colors, and no guidelines for when to use brand colors vs. neutral/semantic colors. The delta icon is used as a brand asset but its usage rules are informal.

**Scope**:
- Define the complete GST brand color palette (primary, secondary, accent, neutrals, semantic)
- Document approved color usage contexts (headings, accents, interactive elements, backgrounds)
- Establish rules for brand asset usage (delta icon, logo, color pairings)
- Define color contrast requirements for accessibility compliance
- Document approved color combinations for data visualization (charts, gauges, status indicators)

**Files to create**:
- `src/docs/styles/BRAND_GUIDELINES.md` - Brand color palette, usage rules, and asset guidelines

**Depends on**: Design decision from stakeholder

---

## 2. Hardcoded Color Remediation

**Status**: 78+ violations across 14 files

**Problem**: The styles guide prohibits hardcoded colors, but the codebase uses them extensively. This breaks dark theme support and creates maintenance burden.

**Affected files** (sorted by severity):
| File | Violations | Notes |
|------|-----------|-------|
| `diligence-machine/index.astro` | 50+ | Domain-specific colors, status indicators |
| `regulatory-map/index.astro` | 30+ | Industry/cyber colors, map fills |
| `StickyControls.astro` | 20+ | Portfolio filter UI |
| `PortfolioHeader.astro` | 13+ | Portfolio header and controls |
| `PortfolioGrid.astro` | 13+ | Grid layout and cards |
| `ProjectModal.astro` | 11+ | Modal dialog |
| `infrastructure-cost-governance/index.astro` | 10+ | Maturity colors, radar chart |
| `MapVisualizer.astro` | 6 | Map visualization |
| `FyiItem.astro` | 4 | Radar FYI items |
| `privacy.astro` | 2 | Legal page accents |
| `terms.astro` | 2 | Legal page accents |
| `Footer.astro` | 2 | Footer links |
| `tech-debt-calculator/index.astro` | 1 | Print styles |
| `techpar/index.astro` | 1 | Print styles |

**Approach**:
1. Audit each file and categorize colors as: brand primary, semantic (success/warning/error), component-specific, or print-only
2. For brand/semantic colors: replace with existing CSS variables
3. For component-specific colors: define new variables in `variables.css` with dark theme overrides
4. For print-only colors: document as an accepted exception (print always renders on white)

**Depends on**: Initiative 1 (brand guidelines) should ideally be completed first to inform variable naming

---

## 3. Hardcoded Spacing Remediation

**Status**: 40+ violations, concentrated in older components

**Problem**: The spacing scale (`--spacing-xs` through `--spacing-3xl`) covers 4px to 48px, but some components use hardcoded pixel values, often mixing hardcoded and variable spacing in the same rule.

**Common violations**:
- `padding: 2px var(--spacing-sm)` - Mixed hardcoded and variable
- `padding: 40px` - Should be `var(--spacing-3xl)` (48px) or composition
- `margin: 16px 0` - Should be `var(--spacing-lg) 0`

**Affected files**:
| File | Violations | Notes |
|------|-----------|-------|
| `diligence-machine/index.astro` | 10+ | Worst offender |
| `vdr-structure/index.astro` | 3 | Mixed patterns |
| `business-architectures/index.astro` | 3 | Mixed patterns |
| `regulatory-map/index.astro` | 2 | Mixed patterns |
| `infrastructure-cost-governance/index.astro` | 2 | Badge micro-spacing |

**Micro-spacing exception**: Values below `--spacing-xs` (4px) are acceptable for badge padding, border-radius fine-tuning, and optical alignment adjustments. These should use `2px` or `1px` directly since the spacing scale doesn't cover sub-4px values. See STYLES_GUIDE.md for the documented exception.

---

## 4. Diligence Machine Remediation

**Status**: Largest single source of style violations

**Problem**: The Diligence Machine was built before the current design system was fully established. It contains 50+ hardcoded colors, 10+ hardcoded spacing values, and domain-specific color schemes that are not part of the design system.

**Domain-specific colors** (currently hardcoded):
- Authority Blue: `#5b7a9d`
- Methodology Brown: `#8c7a6b`
- Results Blue: `#7a9dbd`
- Results Tan: `#a89888`
- Positive indicator: `#4cba7a`
- Negative indicator: `#e06060`
- Warning: `#d4923a`
- Success: `#2e8b57`

**Approach**:
1. Define Diligence Machine domain colors as CSS variables in `variables.css`
2. Add dark theme overrides for each
3. Replace all hardcoded values in `diligence-machine/index.astro`
4. Replace hardcoded spacing with scale variables
5. Test in both themes at all breakpoints

**Estimated scope**: Large - 60+ individual replacements across ~2,800 lines of CSS

---

## 5. TechPar Style Deviations

**Status**: Partially integrated, partially divergent

**Problem**: TechPar has its own color palette defined in `variables.css` (lines 116-150) for zone colors, category colors, and chart colors. These are properly implemented as CSS variables with dark theme overrides, but they are not documented in VARIABLES_REFERENCE.md.

**TechPar-specific variables** (already in `variables.css` but undocumented):
- Zone colors: `--techpar-zone-underinvest`, `--techpar-zone-ahead`, `--techpar-zone-healthy`, `--techpar-zone-elevated`, `--techpar-zone-critical`
- Zone backgrounds: `--techpar-zone-*-bg`
- Category colors: `--techpar-category-infra`, `--techpar-category-personnel`, `--techpar-category-rd-opex`, `--techpar-category-rd-capex`
- Chart colors: `--techpar-chart-band-fill`, `--techpar-chart-ahead-*`, `--techpar-chart-under-*`, `--techpar-chart-above-*`
- KPI colors: `--techpar-kpi-healthy`, `--techpar-kpi-warning`, `--techpar-kpi-concern`, `--techpar-kpi-critical`

**Additional issue**: `techpar/index.astro` uses `color: #333 !important` in print styles (line 2394)

**Approach**:
1. Document existing TechPar variables in VARIABLES_REFERENCE.md
2. Remediate the single `!important` print override
3. Verify all TechPar chart colors reference variables, not hardcoded values

**Estimated scope**: Small - mostly documentation

---

## 6. ICG Color Standardization

**Status**: Functional but not integrated into design system

**Problem**: The Infrastructure Cost Governance tool uses hardcoded colors for maturity levels and data visualization that should eventually become semantic design system variables.

**Colors used** (currently hardcoded in `icg-engine.ts`):
- Reactive: `#E24B4A` (red)
- Aware: `#EF9F27` (orange)
- Optimizing: `#639922` (green)
- Strategic: `var(--color-primary)` (teal - the only one using a variable)

**Colors used in radar chart** (hardcoded in `index.astro`):
- Grid lines: `#999`
- Labels: `#666`
- Data fill/stroke: `#05cd99`

**Approach**:
1. Define maturity level colors as CSS variables (e.g., `--icg-maturity-reactive`, `--icg-maturity-aware`)
2. Add dark theme overrides
3. Update `icg-engine.ts` to return variable names instead of hex values
4. Update `radarChartSVG()` to use resolved CSS variables (with print-safe fallbacks)

**Depends on**: Initiative 1 (brand guidelines) to determine if these should be generic semantic colors (reusable across tools) or ICG-specific

**Estimated scope**: Medium - engine changes + CSS variable definitions + template updates

---

## 7. Standardized Tool Shell Container

**Status**: Pattern exists but is not standardized

**Problem**: Each hub tool implements its own container shell with slightly different max-widths and styling:

| Tool | Class | Max-Width | Border | Overflow |
|------|-------|-----------|--------|----------|
| ICG | `.icg-shell` | 660px | 1px solid | hidden |
| TechPar | `.tp-panel` | 680px | none | visible |
| Tech Debt Calculator | (section-level) | 760px | none | visible |
| Diligence Machine | (section-level) | 700px | none | visible |

**Approach**:
1. Create a standardized `.tool-shell` class in `global.css` or a new `tool-shell.css`
2. Define a canonical max-width (recommendation: 700px as the median)
3. Include: `max-width`, `margin: 0 auto`, `border-radius`, `overflow`, padding pattern
4. Allow per-tool overrides via modifier classes (e.g., `.tool-shell--narrow` for 660px)
5. Include the content wrapper padding pattern: `var(--spacing-xl) var(--spacing-lg)` desktop, `var(--spacing-lg) var(--spacing-md)` mobile
6. Migrate each tool to use the shared class

**Template structure**:
```html
<section class="tool-section">
  <div class="container">
    <HubHeader title="..." subtitle="..." />
    <div class="tool-shell">
      <p class="tool-authority">...</p>
      <div class="tool-content">
        <!-- Tool-specific content -->
      </div>
    </div>
    <a href="/hub/tools" class="cta-button secondary">Return to Tools</a>
  </div>
</section>
```

**Estimated scope**: Medium - create shared CSS, migrate 4-5 tools, verify no regressions

---

## 8. Dynamic Content Loading Pattern

**Status**: Implemented in Radar, not standardized

**Problem**: The Radar page uses a skeleton loading pattern (`RadarFeedSkeleton.astro`) while waiting for API content to load. This pattern is not documented or available for reuse by other components that may need async data loading.

**Current implementation**:
- `src/components/radar/RadarFeedSkeleton.astro` - Pulsing placeholder bars
- `@keyframes pulse` defined in `global.css` (line 137) - Shared animation
- Skeleton mimics the wire-item layout with animated bars at varying widths

**Pattern components**:
1. **Skeleton component**: Renders placeholder shapes matching the expected content layout
2. **Pulse animation**: `@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }` (already global)
3. **Skeleton elements**: Bars with `background: rgba(5, 205, 153, 0.15)`, `border-radius: 4px`, varied widths
4. **Visibility**: `aria-hidden="true"` on skeleton, swapped with real content on load

**Standardization approach**:
1. Document the skeleton loading pattern in STYLES_GUIDE.md
2. Extract reusable skeleton CSS classes into a shared stylesheet or `global.css`:
   - `.skeleton-bar` - Base animated bar (configurable height/width)
   - `.skeleton-dot` - Circular placeholder
   - `.skeleton-text` - Text-line placeholder
3. Define color convention: use `rgba(5, 205, 153, 0.15)` (primary teal at 15% opacity) for all skeleton elements
4. Document the swap pattern: skeleton visible by default, hidden when real content mounts

**Note**: The Radar skeleton currently uses hardcoded colors (`rgba(5, 205, 153, 0.15)`) and spacing (`0.375rem`, `0.875rem`, `0.625rem`) rather than design system variables. This should be remediated as part of standardization.

**Estimated scope**: Small-Medium - documentation + optional CSS extraction

---

## Priority Ranking

| Priority | Initiative | Impact | Effort |
|----------|-----------|--------|--------|
| 1 | Brand Guidelines (Init. 1) | High | Medium |
| 2 | Tool Shell Container (Init. 7) | High | Medium |
| 3 | Diligence Machine (Init. 4) | High | Large |
| 4 | Hardcoded Colors (Init. 2) | High | Large |
| 5 | Dynamic Loading Pattern (Init. 8) | Medium | Small |
| 6 | TechPar Documentation (Init. 5) | Medium | Small |
| 7 | Hardcoded Spacing (Init. 3) | Medium | Medium |
| 8 | ICG Color Standardization (Init. 6) | Low | Medium |

---

## Related Documentation

- [STYLES_GUIDE.md](./STYLES_GUIDE.md) - Current CSS conventions and patterns
- [VARIABLES_REFERENCE.md](./VARIABLES_REFERENCE.md) - Design token catalog
- [TYPOGRAPHY_REFERENCE.md](./TYPOGRAPHY_REFERENCE.md) - Typography utility classes

---

**Created**: March 21, 2026
