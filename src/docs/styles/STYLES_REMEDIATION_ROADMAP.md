# CSS Styles Remediation Roadmap

Tracked initiatives to close the gap between documented conventions and actual implementation. Each initiative is independent and can be executed in any order.

---

## Table of Contents

1. [Brand Color and Style Guidelines](#1-brand-color-and-style-guidelines)
1A. [Brand Guidelines Completion](#1a-brand-guidelines-completion) *(complete)*
2. [Hardcoded Color Remediation](#2-hardcoded-color-remediation)
3. [Hardcoded Spacing Remediation](#3-hardcoded-spacing-remediation)
4. [Diligence Machine Remediation](#4-diligence-machine-remediation)
5. [TechPar Style Deviations](#5-techpar-style-deviations)
6. [ICG Color Standardization](#6-icg-color-standardization)
7. [Standardized Tool Shell Container](#7-standardized-tool-shell-container)
8. [Dynamic Content Loading Pattern](#8-dynamic-content-loading-pattern)
9. [Theme-Agnostic Text Variable Refactor](#9-theme-agnostic-text-variable-refactor)
10. [Reusable Skeleton CSS Classes](#10-reusable-skeleton-css-classes)
11. [Astro CSS Alignment & Tooling](#11-astro-css-alignment--tooling)

---

## 1. Brand Color and Style Guidelines

**Status**: Complete — existing palette documented, all 5 requirement areas finalized in Init 1A (March 24, 2026).

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

## 1A. Brand Guidelines Completion

**Status**: Complete (March 24, 2026)

**Delivered**:
1. **Semantic color system** — added `--color-success`, `--color-warning`, `--color-error`, `--color-info` with dark theme overrides
2. **Color usage hierarchy** — 5-tier priority documented in BRAND_GUIDELINES.md and STYLES_GUIDE.md
3. **WCAG contrast fix** — `--text-faded` opacity increased from 0.5 to 0.6; contrast thresholds documented
4. **Data visualization standards** — regulatory map colors migrated to `--regmap-category-industry`/`--regmap-category-cyber` variables; CVD-safe sequence documented
5. **Brand asset usage rules** — delta icon sizing, clearance, and placement guidelines finalized

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

## Completion Summary

11 initiatives tracked. 10 fully complete, 1 awaiting stakeholder review (Init 1A).

| Initiative | Status | Date | Notes |
|-----------|--------|------|-------|
| 1. Brand Guidelines | Requirements Defined | Mar 24 | Palette documented; 5 areas with recommendations awaiting stakeholder review (see Init 1A) |
| 1A. Guidelines Completion | Awaiting Review | Mar 24 | Semantic colors, usage rules, contrast audit, data viz, brand assets |
| 2. Hardcoded Colors | Complete | Mar 23 | Design system colors standardized; data viz colors preserved as exceptions |
| 3. Hardcoded Spacing | Complete | Mar 23 | Actionable values replaced; micro-spacing (1-3px) documented as exceptions |
| 4. Diligence Machine | Complete | Mar 23 | 75+ color + spacing replacements; 6 redundant dark overrides removed |
| 5. TechPar Docs | Complete | Mar 23 | 35 variables documented in VARIABLES_REFERENCE.md |
| 6. ICG Colors | Complete | Mar 23 | Engine, radar chart, and template standardized with CSS variables |
| 7. Tool Shell | Complete | Mar 23 | `.tool-shell` class created; ICG + Tech Debt Calculator migrated |
| 8. Skeleton Loading | Complete | Mar 23 | Pattern documented; classes extracted in Init 10 |
| 9. Text Variable Refactor | Complete | Mar 24 | `--text-*` aliases added; 335 refs migrated; ~200 lines of redundant dark overrides removed |
| 10. Skeleton CSS Classes | Complete | Mar 24 | `.skeleton-bar`, `.skeleton-bar--sm`, `.skeleton-dot` extracted to global.css |
| 11. Astro CSS Alignment | Complete | Mar 24 | Stylelint added; Astro CSS patterns documented; `:global()` reduced 631→577 |

**Key outcomes**:
- 22 new shared CSS variables defined (`--hub-authority-blue`, `--dm-*`, `--icg-*`, `--text-*` aliases, `--spacing-2_5xl`)
- ~200 lines of redundant dark theme CSS eliminated via theme-agnostic text variables
- Standardized `.tool-shell` container with 4 width modifiers
- Reusable skeleton loading classes with automatic dark theme support
- All documentation (VARIABLES_REFERENCE, TYPOGRAPHY_REFERENCE, STYLES_GUIDE, BRAND_GUIDELINES) updated

---

### 9. Theme-Agnostic Text Variable Refactor

**Status**: Complete — --text-* aliases added, 335 references migrated, ~200 lines of redundant dark theme overrides removed (March 24, 2026)

**Problem**: The design system uses paired text variables — `--text-light-primary` for light theme and `--text-dark-primary` for dark theme. Components reference the light variant, then every dark theme context requires a manual `html.dark-theme` override to swap to the dark variant. The Diligence Machine alone has ~25 such overrides; the pattern repeats across portfolio components, regulatory map, and other tools.

**Root cause**: The variable naming convention is theme-specific (`--text-light-*` / `--text-dark-*`) rather than theme-agnostic. The background and accent variables (e.g., `--bg-light`, `--border-light`) already auto-switch via `html.dark-theme` overrides in `variables.css`, but text variables require manual swapping at the component level because components reference the `-light-` variant directly.

**Proposed approach**:
1. Introduce theme-agnostic aliases in `variables.css`:
   ```css
   :root {
     --text-primary: var(--text-light-primary);
     --text-secondary: var(--text-light-secondary);
     --text-muted: var(--text-light-muted);
     --text-faded: var(--text-light-faded);
   }
   html.dark-theme {
     --text-primary: var(--text-dark-primary);
     --text-secondary: var(--text-dark-secondary);
     --text-muted: var(--text-dark-muted);
     --text-faded: var(--text-dark-faded);
   }
   ```
2. Migrate components from `--text-light-*` → `--text-*`
3. Remove now-redundant `html.dark-theme` overrides from each component
4. Keep `--text-light-*` and `--text-dark-*` available for the rare case where a component needs to force a specific theme's value regardless of context

**Impact**: Eliminates an estimated 60-80 dark theme override rules across the codebase. Reduces CSS volume, simplifies new component authoring, and prevents the recurring pattern of forgetting a dark theme text swap.

**Files affected**:
- `src/styles/variables.css` — Add aliases + dark overrides
- `src/styles/typography.css` — Update utility class definitions
- `src/pages/hub/tools/diligence-machine/index.astro` — ~25 dark overrides removable
- `src/components/portfolio/*.astro` — ~15 dark overrides removable
- `src/pages/hub/tools/regulatory-map/index.astro` — ~8 dark overrides removable
- `src/pages/hub/tools/infrastructure-cost-governance/index.astro` — ~5 dark overrides removable
- All other components that reference `--text-light-*` or `--text-dark-*`

**Documentation to update**: VARIABLES_REFERENCE.md, STYLES_GUIDE.md (dark theme section), TYPOGRAPHY_REFERENCE.md

**Estimated scope**: Large — touches every component, but each replacement is mechanical (find `--text-light-*` → `--text-*`, delete redundant dark override)

---

### 10. Reusable Skeleton CSS Classes

**Status**: Complete — .skeleton-bar, .skeleton-bar--sm, .skeleton-dot extracted to global.css; RadarFeedSkeleton refactored to use shared classes (March 24, 2026)

**Problem**: The skeleton loading pattern is documented (Init 8) but the CSS lives only inside `RadarFeedSkeleton.astro` as scoped styles. If another component needs skeleton loading (e.g., a hub tool with async data, a server island), the CSS must be duplicated.

**Proposed approach**:
1. Extract reusable classes into `src/styles/global.css` (or a new `skeleton.css`):
   ```css
   .skeleton-bar {
     height: 0.875rem;
     background: rgba(5, 205, 153, 0.15);
     border-radius: 4px;
     animation: pulse 2s ease-in-out infinite;
   }
   .skeleton-dot {
     width: 8px;
     height: 8px;
     border-radius: 50%;
     background: rgba(5, 205, 153, 0.15);
     animation: pulse 2s ease-in-out infinite;
   }
   .skeleton-text {
     height: 0.625rem;
     background: rgba(5, 205, 153, 0.15);
     border-radius: 4px;
     animation: pulse 2s ease-in-out infinite;
   }
   ```
2. Refactor `RadarFeedSkeleton.astro` to use the shared classes instead of scoped styles
3. Document in STYLES_GUIDE.md

**Trigger**: Implement when a second component needs skeleton loading. Until then, the scoped approach in RadarFeedSkeleton is sufficient.

**Estimated scope**: Small

---

### 11. Astro CSS Alignment & Tooling

**Status**: Complete — 11A (Stylelint), 11B (Astro CSS docs), 11C (:global() audit) all done (March 24, 2026)

**Problem**: The project had no CSS linting and no documentation of Astro-specific CSS patterns (`class:list`, `define:vars`, `:global()` decision guidance). Style convention violations were only caught during manual review.

**Context**: Research using Context7 (Astro docs) confirmed the project's CSS architecture (scoped styles, global CSS in layout, CSS variables) is well-aligned with Astro's recommendations. No framework or preprocessor changes needed. Three improvements identified.

**Completed**:

**11A. Stylelint Integration** — Added `stylelint` + `stylelint-config-standard` with project-specific rules. Enforces no duplicate selectors, no duplicate properties, no named colors. Run via `npm run lint:css`. Config adapted to accept project conventions (rgba notation, vendor prefixes, `:global()` pseudo-class).

**11B. Astro CSS Best Practices Documentation** — Added "Astro-Specific Patterns" section to STYLES_GUIDE.md covering: scoped vs. global decision tree, `class:list` for conditional classes, `define:vars` for JS→CSS bridging, when `:global()` is necessary vs. avoidable, CSS linting reference.

**Planned**:

**11C. `:global()` Audit & Reduction** — Audited all 631 instances across 29 files. Categorized as:
- **Category A** (~500): Dynamic content (innerHTML, set:html, D3) — necessary, kept
- **Category B** (~75): Dark theme overrides for non-text properties (borders, backgrounds) — necessary, kept
- **Category E** (1): Unnecessary `:global(header)` in ma-portfolio — removed (known bug)
- **Redundant dark overrides** (54): Text/bg overrides made unnecessary by CSS variables — removed

Result: 631 → 577 instances (-54). Remaining instances are all justified (dynamic content or non-auto-switching dark theme properties).

**Not pursued** (evaluated and rejected):
- Tailwind CSS — would create parallel styling paradigm alongside established CSS variables
- Sass/Less — CSS variables cover the use cases; adds dependency without proportional benefit
- CSS nesting — would introduce second formatting convention; keep flat selectors for consistency

---

## Related Documentation

- [STYLES_GUIDE.md](./STYLES_GUIDE.md) - Current CSS conventions and patterns
- [VARIABLES_REFERENCE.md](./VARIABLES_REFERENCE.md) - Design token catalog
- [TYPOGRAPHY_REFERENCE.md](./TYPOGRAPHY_REFERENCE.md) - Typography utility classes
- [BRAND_GUIDELINES.md](./BRAND_GUIDELINES.md) - Brand color palette and usage rules

---

**Created**: March 21, 2026
**Last Updated**: March 24, 2026
