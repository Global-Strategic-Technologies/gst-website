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

**Status**: Partially complete — existing palette documented in BRAND_GUIDELINES.md (March 23, 2026). Stakeholder decisions pending for extended palette.

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

**Status**: Complete — design system colors standardized across all files (March 23, 2026). Remaining hardcoded colors are domain-specific data visualization values (regulatory map industry/jurisdiction colors, FyiItem editor pick) or accepted exceptions (print styles, shadows/overlays).

**Problem**: The styles guide prohibits hardcoded colors, but the codebase uses them extensively. This breaks dark theme support and creates maintenance burden.

**Affected files** (sorted by severity):
| File | Violations | Notes |
|------|-----------|-------|
| `diligence-machine/index.astro` | 75 | 46 rgba + 29 hex; domain-specific colors, status indicators, floating action bar |
| `regulatory-map/index.astro` | 30+ | Industry/cyber colors, map fills |
| `infrastructure-cost-governance/index.astro` | 22+ | Maturity colors, radar chart, benchmark badge colors added in recent commits |
| `StickyControls.astro` | 20+ | Portfolio filter UI |
| `PortfolioHeader.astro` | 13+ | Portfolio header and controls |
| `PortfolioGrid.astro` | 13+ | Grid layout and cards |
| `ProjectModal.astro` | 11+ | Modal dialog |
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

**Status**: Complete — actionable spacing values replaced with variables (March 23, 2026). Remaining hardcoded values are micro-spacing exceptions (1-3px for badge padding, optical alignment) per documented convention.

**Problem**: The spacing scale (`--spacing-xs` through `--spacing-3xl`) covers 4px to 48px, but some components use hardcoded pixel values, often mixing hardcoded and variable spacing in the same rule.

**Common violations**:
- `padding: 2px var(--spacing-sm)` - Mixed hardcoded and variable
- `padding: 40px` - Should be `var(--spacing-3xl)` (48px) or composition
- `margin: 16px 0` - Should be `var(--spacing-lg) 0`
- `max-width: 420px` / `640px` / `700px` - Layout container widths (see also Init. 7)

**Affected files**:
| File | Violations | Notes |
|------|-----------|-------|
| `diligence-machine/index.astro` | 58 | Worst offender — hardcoded px/rem/em for padding, margin, gap, widths, min/max-height |
| `vdr-structure/index.astro` | 3 | Mixed patterns |
| `business-architectures/index.astro` | 3 | Mixed patterns |
| `regulatory-map/index.astro` | 2 | Mixed patterns |
| `infrastructure-cost-governance/index.astro` | 2 | Badge micro-spacing |

**Micro-spacing exception**: Values below `--spacing-xs` (4px) are acceptable for badge padding, border-radius fine-tuning, and optical alignment adjustments. These should use `2px` or `1px` directly since the spacing scale doesn't cover sub-4px values. See STYLES_GUIDE.md for the documented exception.

---

## 4. Diligence Machine Remediation

**Status**: Complete — hardcoded colors replaced with CSS variables, spacing remediated, redundant dark theme overrides removed (March 23, 2026)

**Problem**: The Diligence Machine was built before the current design system was fully established. Recent commits (EEAT signaling, collapse/expand cards, floating action bar, cross-linking CTAs) added significant new CSS that continued the hardcoded pattern. It now contains 75 hardcoded colors and 58 hardcoded spacing values.

**Domain-specific colors** (currently hardcoded):
- Authority Blue: `#5b7a9d` (6 instances)
- Methodology Brown: `#8c7a6b` (4 instances)
- Results Blue: `#7a9dbd` (1 instance)
- Results Tan: `#a89888` (1 instance)
- Positive indicator: `#4cba7a` (1 instance)
- Negative indicator: `#e06060` (3 instances)
- Negative dark: `#b22222` (4 instances)
- Warning: `#d4923a` (1 instance)
- Warning dark: `#b26622` (2 instances)
- Success: `#2e8b57` (2 instances)
- Brand teal rgba: 22 instances of `rgba(5, 205, 153, ...)` at varying opacities

**Recent additions** (unpushed commits):
- Floating action bar dark mode styles with hardcoded rgba backgrounds
- Collapse/expand card styles with hardcoded border colors and backgrounds
- N/A dismiss button states with hardcoded indicator colors
- Question numbering and card preview styles

**Positive pattern**: The `.delta-chevron` utility (extracted to `interactions.css`) was implemented correctly using CSS variables throughout — this is the target pattern for remediation.

**Approach**:
1. Define Diligence Machine domain colors as CSS variables in `variables.css`
2. Add dark theme overrides for each
3. Replace all hardcoded values in `diligence-machine/index.astro`
4. Replace hardcoded spacing with scale variables
5. Test in both themes at all breakpoints

**Estimated scope**: Large - 133 individual replacements across ~3,500 lines of CSS

---

## 5. TechPar Style Deviations

**Status**: Complete — variables documented in VARIABLES_REFERENCE.md (March 23, 2026)

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

**Status**: Complete — maturity colors, radar chart, and template colors standardized with CSS variables (March 23, 2026)

**Problem**: The Infrastructure Cost Governance tool uses hardcoded colors for maturity levels and data visualization that should eventually become semantic design system variables. Recent commits (benchmark table redesign, recommendation badge borders) introduced additional hardcoded colors.

**Colors used** (currently hardcoded in `icg-engine.ts`):
- Reactive: `#E24B4A` (red)
- Aware: `#EF9F27` (orange)
- Optimizing: `#639922` (green)
- Strategic: `var(--color-primary)` (teal - the only one using a variable)

**Colors used in radar chart** (hardcoded in `index.astro`):
- Grid lines: `#999`
- Labels: `#666`
- Data fill/stroke: `#05cd99`

**Colors added in recent commits** (benchmark table and badges):
- Score badge: `rgba(5, 205, 153, 0.12)` background
- Stage badge text: `#5b7a9d` (light), `#7a9dbd` (dark) — same blue family as Diligence Machine
- Stage badge background: `rgba(91, 122, 157, 0.1)`
- Active row highlight: `rgba(5, 205, 153, 0.04)` and `0.08`
- Badge border dark theme: `rgba(200, 200, 200, 0.1)`

**Note**: The stage badge blue (`#5b7a9d` / `#7a9dbd`) is the same "Authority Blue" used in the Diligence Machine, suggesting this should be a shared semantic variable rather than tool-specific.

**Approach**:
1. Define maturity level colors as CSS variables (e.g., `--icg-maturity-reactive`, `--icg-maturity-aware`)
2. Add dark theme overrides
3. Update `icg-engine.ts` to return variable names instead of hex values
4. Update `radarChartSVG()` to use resolved CSS variables (with print-safe fallbacks)
5. Evaluate shared semantic colors with Diligence Machine (Authority Blue, badge backgrounds)

**Depends on**: Initiative 1 (brand guidelines) to determine if these should be generic semantic colors (reusable across tools) or ICG-specific

**Estimated scope**: Medium-Large - engine changes + CSS variable definitions + template updates + shared color evaluation

---

## 7. Standardized Tool Shell Container

**Status**: Complete — `.tool-shell` class defined in global.css, migrated ICG + Tech Debt Calculator (March 23, 2026). TechPar and Diligence Machine use structurally different patterns (fluid/width-only) and are documented exceptions.

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

**Status**: Documented — pattern standardized in STYLES_GUIDE.md (March 23, 2026)

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
| 8 | ICG Color Standardization (Init. 6) | Medium | Medium-Large |

**Note on Init. 4 + Init. 6**: The Diligence Machine and ICG now share the same "Authority Blue" color family (`#5b7a9d` / `#7a9dbd`). Remediating these together would allow defining shared semantic variables once rather than duplicating across tools.

---

## Positive Patterns in Recent Commits

The following patterns from recent work demonstrate the target approach for remediation:

- **`.delta-chevron` utility** (`interactions.css`): Extracted as a shared component using only CSS variables (`--color-primary`, `--text-light-muted`, `--text-dark-muted`, `--transition-fast`). No hardcoded colors. This is the reference pattern for new interactive components.
- **ICG benchmark table spacing**: New cell padding uses `var(--spacing-sm) var(--spacing-md)` and row gap uses `var(--spacing-xs)` — correct variable usage throughout.
- **ICG recommendation badge borders**: Uses `var(--border-light)` for light theme — correct semantic variable usage.

These demonstrate that the conventions are being followed in new utility code even while legacy patterns persist in existing component styles.

---

## Related Documentation

- [STYLES_GUIDE.md](./STYLES_GUIDE.md) - Current CSS conventions and patterns
- [VARIABLES_REFERENCE.md](./VARIABLES_REFERENCE.md) - Design token catalog
- [TYPOGRAPHY_REFERENCE.md](./TYPOGRAPHY_REFERENCE.md) - Typography utility classes

---

**Created**: March 21, 2026
**Last Updated**: March 23, 2026
