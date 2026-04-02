# Hub Tools — Brutalist Design Migration

Migrate all five hub tools from their current soft-UI styling (rounded corners, box shadows, filled backgrounds) to the brutalist design system (no radius, monospace typography, structural borders, primary-color accents). The brutalist design tokens and component classes are defined in `global.css`, `typography.css`, and `interactions.css`, and rendered live on the [/brand](https://globalstrategic.tech/brand) reference page.

**Status**: Complete — all 5 stages finished
**Priority**: High — brand cohesion
**Last Updated**: April 2, 2026

---

## Approach

Each stage migrates one tool. Between stages, **pause for manual review** — verify visual quality, identify gaps where new brutalist classes are needed, and create those classes before proceeding.

### Principles

1. **Dark theme borders**: `rgba(255, 255, 255, 0.15)` everywhere — not `var(--border-light)` which is invisible on dark backgrounds
2. **Propagate to global.css**: new reusable classes go in `global.css`, not in scoped `<style>` blocks
3. **Back links**: keep as `.cta-button secondary` (page-level CTA, not tool control)
4. **`<select>` elements**: need explicit dark theme `background-color` on both select and `<option>` elements
5. **Brand page specimens**: every brutalized control — whether a new `.brutal-*` class or an existing selector modified with brutalist properties — gets a rendered specimen on `/brand` (`src/pages/brand.astro`). This applies retroactively to completed stages

**Migration order** (simplest → most complex):

| Stage | Tool | Scoped CSS | Direct Swaps | New Classes Needed | Effort |
|-------|------|-----------|-------------|-------------------|--------|
| 1 | Tech Debt Calculator | 627 lines | 8 classes | ~45 | Medium |
| 2 | Regulatory Map | 825 lines | 5 classes | ~49 | Medium |
| 3 | Infrastructure Cost Governance | 1,243 lines | 7 classes | ~57 | Medium-High |
| 4 | Diligence Machine | 1,870 lines | 7 classes | ~57 | Medium-High |
| 5 | TechPar | 1,688 lines | 0 classes | ~137 | Very High |

---

## Stage 1: Tech Debt Calculator

**File**: `src/pages/hub/tools/tech-debt-calculator/index.astro`
**Why first**: Smallest CSS footprint, already uses shared `.hub-btn` and `.tool-shell` classes, linear single-page layout with no wizard or multi-view complexity.

### Direct Swaps (brutalist equivalents exist)

| Current Class | Brutalist Class | Count |
|---|---|---|
| `.hub-btn` | `.brutal-btn` | 3 |
| `.hub-btn--secondary` | `.brutal-btn--secondary` | 3 |
| `.tool-shell.tool-shell--wide` | `.brutal-tool-shell.brutal-tool-shell--wide` | 1 |
| `.tool-authority` | `.brutal-tool-shell__authority` | 1 |
| `.tool-section-label` | `.brutal-tool-shell__section-label` | 5 |
| `.cta-button` | `.brutal-btn--primary` | 1 |
| `.heading-md` | `.brutal-heading-md` | section titles |
| `.text-base` / `.text-small` | `.brutal-text-base` / `.brutal-text-small` | body text |

### New Brutalist Classes Needed

| Pattern | Classes | Notes |
|---|---|---|
| **Slider** | `.calc-slider`, `.slider-row`, `.slider-header`, `.slider-label`, `.slider-value`, `.slider-hints`, `.hint-input` | Already have `.brutal-slider` — verify TDC's slider markup is compatible or adapt |
| **Results display** | `.result-primary`, `.result-cost-value`, `.result-cost-label`, `.result-cost-sub`, `.result-grid`, `.result-stat`, `.result-stat-value`, `.result-stat-label`, `.result-stat-range` | Large monospace numeric readout — use `.brutal-data` for values |
| **Deploy buttons** | `.deploy-grid`, `.deploy-btn` | 3-column grid of selectable buttons — map to `.brutal-option-card--compact` or create `.brutal-deploy-btn` |
| **Advanced panel** | `.advanced-panel`, `.advanced-toggle`, `.toggle-icon` | Collapsible section — map to `.tool-methodology` or create brutalist variant |
| **Footer controls** | `.calc-footer__controls`, `.currency-select`, `.copy-link-btn` | Action bar — map to `.tool-action-bar` with `.brutal-btn` |

### Completion Summary

Stage 1 completed March 29, 2026.

**Direct swaps applied:**
- `.tool-shell.tool-shell--wide` → `.brutal-tool-shell.brutal-tool-shell--wide`
- `.tool-authority` → `.brutal-tool-shell__authority`
- `.tool-section-label` → `.brutal-tool-shell__section-label` (5 instances)
- `.hub-btn--secondary` → `.brutal-btn--secondary` (3 export buttons)
- Back link kept as `.cta-button secondary` (intentional — page-level CTA, not tool control)

**Scoped CSS brutalized:**
- Slider: square 16px thumb, 2px flat track, no radius, no glow
- Hint inputs: dashed border (editability affordance), hover → solid + primary, cursor: text
- Deploy buttons: no radius, monospace uppercase, primary-fill active state (inverts on select)
- Results: monospace labels/values, 2px hard borders, primary-color hero value, 3px primary top-border
- Advanced toggle: monospace, smaller font
- Currency select: no radius, monospace, transparent bg, 2px border matching `.brutal-btn`
- Footer: transparent bg, monospace, hard borders

**Dark theme fixes:**
- All borders at `rgba(255, 255, 255, 0.15)` — slider track, hint inputs, deploy buttons, result stats, section dividers, footer
- Currency select: transparent bg with dark theme option elements
- Fixes propagated to global.css: `.hint-input` (dashed + hover + dark), `.calc-slider` (dark track), `.brutal-slider__direct` (aligned)

**Print stylesheet overhauled:**
- Branded report header (GST delta icon + title + generated date)
- Footer with generation URL + methodology disclaimer
- Always shows advanced results regardless of panel state
- 2-column metrics grid, `break-inside: avoid` on results
- Context note visible with left-border accent
- Cost value prints dark for readability
- `@page` margins for cleaner edge spacing

**Not done (by design):**
- Results values use local `.result-cost-value` (monospace) not shared `.brutal-data` — the clamp font-size pattern is TDC-specific
- No new reusable brutalist classes created — TDC reused existing design system classes
- Responsive verification deferred to visual review

**Pause point checklist:**
- [x] All TDC controls render in brutalist style
- [x] Dark theme is correct — borders visible at `rgba(255, 255, 255, 0.15)`
- [x] Slider thumb is square, track is flat
- [x] Results use monospace throughout (local classes, not `.brutal-data`)
- [x] Print output overhauled — branded, professional
- [x] Fixes propagated to global.css (`.hint-input`, `.calc-slider`, `.brutal-slider__direct`)
- [x] `npm run test:run` passes (857/857)
- [x] Visual review at 768px, 480px

---

## Stage 2: Regulatory Map

**File**: `src/pages/hub/tools/regulatory-map/index.astro`
**Why second**: Medium complexity, already uses `.filter-chip` and `.heading-*` from the design system, no form inputs or wizard flows. Primarily a data visualization tool.
**Status**: Complete

### Lessons from Stage 1

Apply these patterns learned during TDC migration:
- **Dark theme borders**: use `rgba(255, 255, 255, 0.15)` for visible borders, not `var(--border-light)` which is invisible on dark backgrounds. Add `:global(html.dark-theme)` overrides for every border-using element.
- **Propagate fixes**: any CSS fix to a shared class (`.filter-chip`, `.search-input`, etc.) should go in `global.css`, not stay local. Remove redundant local overrides after propagating.
- **`<select>` elements**: need explicit dark theme `background-color` on both the select and its `<option>` elements — OS native styling overrides CSS variables.
- **Back links**: keep as `.cta-button secondary` (page-level CTA), don't brutalize.
- **Print styles**: RegMap currently has **no print styles** — this stage should add them.

### Available Brutalist Classes

These already exist in the design system and can be used directly:
- `.brutal-filter-chip` / `--active` — square, outlined, monospace, primary-fill active (in `global.css`)
- `.brutal-heading-md` / `--lg` — monospace uppercase headings (in `typography.css`)
- `.brutal-btn--secondary` — for any action buttons (in `global.css`)
- `.brutal-breadcrumb` — monospace uppercase breadcrumb (in `global.css`, created during Stage 1)

### Direct Swaps

| Current Class | Brutalist Class | Count |
|---|---|---|
| `.heading-md` / `.heading-lg` | `.brutal-heading-md` / `.brutal-heading-lg` | 2 |
| `.filter-chip` | `.brutal-filter-chip` | 5 |
| `.filter-chip.active` | `.brutal-filter-chip--active` | state |
| `.cta-button` | `.brutal-btn` | 1 |

### New Brutalist Classes Needed

| Pattern | Classes | Notes |
|---|---|---|
| **Search** | `.search-input-wrapper`, `.search-input`, `.search-icon`, `.search-clear-btn`, `.search-results`, `.search-result-item` | Search dropdown with category badges — may reuse `.brutal-filter-chip` for category indicators. Apply: no radius, monospace, dashed border (like `.hint-input` pattern from Stage 1). |
| **Map layout** | `.map-wrapper`, `.map-layout`, `.map-legend`, `.map-cta` | Full-width map container — not a `.tool-shell` pattern. Brutalist treatment: hard borders, no radius on legend box. |
| **Legend** | `.legend-item`, `.legend-swatch`, `.legend-label` | Color dots with labels — brutalist: square swatches, monospace labels. |
| **Timeline** | `.timeline-section`, `.timeline-scroll`, `.timeline-entry`, `.timeline-dot`, `.timeline-year-label`, `.timeline-today` | Horizontal scrollable timeline — brutalist: hard line, square dots, monospace dates. |
| **FAQ** | `.faq-section`, `.faq-item`, `.faq-question`, `.faq-answer` | Native `<details>` accordion — map to `.tool-methodology` pattern or create dedicated brutalist variant. |
| **Bottom sheet** | `.bottom-sheet-overlay` | Mobile panel overlay — brutalist: hard border, no rounded corners, primary top-border accent. |
| **Compliance panel** | `.compliance-panel`, `.panel-header`, `.reg-card` | Detail panel for selected region — brutalist: hard borders, monospace labels, no radius. |

### Print Styles (New)

RegMap is the only tool without `@media print`. Stage 2 should add:
- Hide map interaction chrome (filters, search, bottom sheet)
- Show compliance panel content if a region is selected
- Branded header/footer (same pattern as TDC)
- Timeline readable in print (horizontal → vertical?)

### Completion Summary

Stage 2 completed March 30, 2026.

**Existing brutalist classes swapped in:**
- `.filter-chip` → `.brutal-filter-chip` (5 buttons, including per-category active states)
- `.heading-md` → `.brutal-heading-md` (timeline heading)
- `.heading-lg` → `.brutal-heading-lg` (FAQ heading)
- Added `.brutal-filter-chip--all/--privacy/--ai/--industry/--cyber` category variants to global.css
- Back link kept as `.cta-button secondary` (per Stage 1 lesson)

**New brutalist classes created in global.css + brand.astro specimens:**
- `.brutal-search` + `__input`, `__icon`, `__clear`, `__results`, `__result`, `__category`, `__no-results`
- `.brutal-legend` + `__item`, `__swatch`, `__label`
- `.brutal-map-cta` + `__icon`, `__text`
- `.brutal-timeline-dot` + `--{category}`, `--upcoming`
- `.brutal-timeline-entry` + `--active`, `--{category}`, `--upcoming`, `__name`, `__date`
- `.brutal-timeline-year`, `.brutal-timeline-today` + `__label`
- `.brutal-faq` + `__item`, `__question`, `__answer`
- `.brutal-map-container`, `.brutal-map-control`, `.brutal-map-tooltip`
- `.brutal-map-tap-bar` + `__name`, `__action`
- `.brutal-quick-zoom`, `.brutal-map-hint`
- `.brutal-panel` + `__header`, `__title`, `__count`, `__copy`, `--sheet-open`
- `.brutal-reg-card` + `__name`, `__date`, `__summary`, `__scope`, `__requirements`, `__penalties`
- `.brutal-bottom-sheet` + `__handle`, `__handle-bar`, `__overlay`

**Scoped CSS changes:**
- Removed ~500 lines of old scoped CSS replaced by global.css definitions
- Kept only layout/positioning overrides specific to RegMap (horizontal timeline scroll, legend positioning, CTA absolute positioning, mobile breakpoints)
- Removed `@keyframes ctaPulse` and `@keyframes dotPulse` (brutalist: no animations)
- Removed all backdrop-filter, box-shadow, border-radius

**Dark theme:**
- All dark borders standardized to `rgba(255, 255, 255, 0.15)` in global.css definitions
- No scoped `rgba(245, 245, 245, 0.1)` overrides remain

**Print stylesheet added:**
- Branded report header (GST delta icon + title + generated date)
- Footer with generation URL + legal disclaimer
- Hides interactive chrome (filters, zoom, CTA, overlay, nav)
- Static layout for compliance panel, timeline, FAQ
- `break-inside: avoid` on reg-cards and FAQ items
- `@page { margin: 1.5cm }`

**E2E tests updated:**
- All 6 test files (5 E2E + 1 unit) verified
- Unit test: no changes (data validation only)
- 5 E2E tests: updated all class-based selectors to `.brutal-*` equivalents
- Tests use `data-testid` for structural checks (unchanged), class selectors only for visual state

### Pause Point

- [x] Filter chips are square, outlined, monospace (`.brutal-filter-chip`)
- [x] Search input has no radius, monospace placeholder (`.brutal-search`)
- [x] Timeline dots are square, legend swatches are square (`.brutal-timeline-dot`, `.brutal-legend__swatch`)
- [x] FAQ uses brutalist collapsible pattern (`.brutal-faq__item`)
- [x] Map legend and overlays have no rounded corners
- [x] Print styles added (branded header/footer, clean layout)
- [x] Dark theme borders all visible at 0.15 opacity
- [x] New brutalist classes created in global.css (not left as local overrides)
- [x] New brutalist classes added to `/brand` page (7 specimen groups)
- [x] `npm run build` passes
- [x] `npm run test:run` passes (857/857)
- [x] E2E tests updated and passing (all 6 RegMap test files)
- [x] Mobile UX optimized (CTA hidden, legend static, quick-zoom replaces +/−/reset)
- [x] Bottom sheet scroll lock and drag-dismiss fixed
- [x] Delta icon in `--color-secondary` (gold) for CTA — new brand convention documented
- [x] `.brutal-faq__item` frosted glass effect matches `.brutal-tool-shell`
- [x] Dark theme SVG fills standardized to `rgba(255, 255, 255, ...)`
- [x] Visual review at desktop, 768px, 480px

---

## Stage 3: Infrastructure Cost Governance

**File**: `src/pages/hub/tools/infrastructure-cost-governance/index.astro`
**Why third**: Medium-high complexity with multi-view layout (landing → wizard → results), but already uses `.tool-shell`, `.tool-action-bar`, and typography classes from the design system.
**Status**: Complete

### Lessons from Stages 1 & 2

Applied these patterns during ICG migration:
- **Dark theme borders**: `rgba(255, 255, 255, 0.15)` everywhere — replaced all `var(--accent-light-bg-hover)` and `var(--accent-dark-bg)` dark overrides
- **Propagate to global.css**: new reusable classes (progress bar, stat tile, callout) created in global.css, not scoped
- **Back links**: kept as `.cta-button secondary` (per Stage 1 lesson)
- **Recommendation cards**: mapped directly to existing `.brutal-rec-card` family — no new rec classes needed
- **Benchmark table**: mapped to existing `.brutal-bench-table` family

### Direct Swaps Applied

| Current Class | Brutalist Class | Count |
|---|---|---|
| `.tool-shell.tool-shell--narrow` | `.brutal-tool-shell.brutal-tool-shell--narrow` | 1 |
| `.hub-btn.hub-btn--primary` | `.brutal-btn.brutal-btn--primary` | 6 |
| `.hub-btn.hub-btn--secondary` | `.brutal-btn.brutal-btn--secondary` | 14 |
| `.hub-btn--full` | `.brutal-btn--full` | 1 |
| `.label` | `.brutal-label` | 2 |
| `.heading-md` | `.brutal-heading-md` | 2 |
| `.text-small` | `.brutal-text-small` | 5 |
| `.text-tiny` | `.brutal-text-tiny` | 4 |
| `.tool-section-label` | `.brutal-tool-shell__section-label` | 5 (+ JS injected) |
| `.tool-bench-table` | `.brutal-bench-table` | 1 |
| `bench-label--score/stage` | `.brutal-bench-table__label--score/stage` | 2 (JS) |
| `icg-rec-card` / badges / na | `.brutal-rec-card` family | all (JS) |

### New Brutalist Classes Created in global.css

| Class | Purpose |
|---|---|
| `.brutal-tool-shell--narrow` | 660px narrow shell variant |
| `.brutal-progress-bar` + `__track`, `__fill`, `__label` | Hard-edged progress bar, no radius, monospace label |
| `.brutal-stat-tile` + `__value`, `__label` | Hard-bordered stat tiles, monospace values |
| `.brutal-callout` + `__title`, `--warning` | Reusable callout with left-border accent, monospace |

### Scoped CSS Changes

- Removed ~400 lines of old scoped CSS replaced by global.css definitions
- Landing callout, resume prompt, quick wins, cost context, foundational warning all use `.brutal-callout`
- Stat tiles use `.brutal-stat-tile`; progress bar uses `.brutal-progress-bar`
- Stage cards brutalized in-place: no radius, monospace uppercase, primary-fill active state
- Question cards: no radius, 2px borders, monospace text, primary-fill selected buttons
- Option buttons: removed `box-shadow: inset`, use `background: var(--color-primary)` on select
- Domain bars: removed track/fill radius
- Cards: no radius, 2px borders, transparent background
- Snapshot label input: no radius, monospace, 2px border
- Foundational badge: no radius, outlined with primary border instead of bg fill

### Dark Theme

- All dark borders standardized to `rgba(255, 255, 255, 0.15)`
- Removed all `var(--accent-light-bg-hover)`, `var(--accent-dark-bg)`, `var(--accent-wash-bg)`, `var(--accent-tint-bg)`, `var(--accent-subtle-bg)` overrides
- Transparent backgrounds throughout (brutalist: no bg fills)

### Print Styles

- Updated rec-card references from `icg-rec-card` → `brutal-rec-card`
- Added `font-family: monospace` and `text-transform: uppercase` to print header
- Existing print layout (branded header, footer, break-inside avoidance) preserved

### E2E Tests Updated

- `.stat-tile` → `.brutal-stat-tile` (1 selector)
- All other tests use `data-*` attributes — no changes needed
- Unit tests (1,026 lines, pure functions) — no changes needed

### Brand Page Specimens Added

- `.brutal-progress-bar` — track with 66% fill and monospace label
- `.brutal-stat-tile` — 3-tile row matching ICG landing stats
- `.brutal-callout` — default (primary accent) + `--warning` (gold accent) variants
- Updated narrow shell specimen from inline `max-width` to `.brutal-tool-shell--narrow`

### Completion Summary

Stage 3 completed March 30, 2026.

### Pause Point

- [x] Landing view has brutalist callout, stage cards, and stats
- [x] Assessment questions use brutalist option buttons (primary-fill on select)
- [x] Progress bar has hard edges and monospace label (`.brutal-progress-bar`)
- [x] Recommendation cards match `.brutal-rec-card` pattern
- [x] Snapshot manager inputs have no radius, monospace
- [x] All dark theme overrides use `rgba(255, 255, 255, 0.15)`
- [x] New brutalist classes created in global.css (progress bar, stat tile, callout, --narrow shell)
- [x] New specimens added to `/brand` page (3 component groups + warning variant)
- [x] `npm run build` passes
- [x] `npm run test:run` passes (857/857)
- [x] E2E test selectors updated
- [x] Visual review at desktop, 768px, 480px

---

## Stage 4: Diligence Machine

**File**: `src/pages/hub/tools/diligence-machine/index.astro`
**Why fourth**: Complex multi-step wizard + document generation output. The wizard UI has good design system alignment (`.option-card`, `.hub-btn`, `.cta-button`), but the generated document output is highly custom.
**Status**: Complete

### Direct Swaps Applied

| Current Class | Brutalist Class | Count |
|---|---|---|
| `.hub-btn` / `--secondary` | `.brutal-btn` / `--secondary` | 4 |
| `.cta-button.primary` / `.secondary` | `.brutal-btn--primary` / `--secondary` | 3 |
| `.option-card` | `.brutal-option-card` | 3 (+ ~12 JS querySelector + ~8 classList calls) |
| `.option-card.selected` | `.brutal-option-card--selected` | state |
| `.tool-authority` | `.brutal-tool-shell__authority` | 1 |
| `.back-link` | `.brutal-btn brutal-btn--secondary back-link` | 1 |
| `.cta-button doc-meta-cta-button` | `.brutal-btn brutal-btn--primary/--secondary doc-meta-cta-button` | 2 |

### Completion Summary

Stage 4 completed March 31, 2026.

**Scoped CSS changes:**
- Deleted ~70 lines of `.option-card` CSS (replaced by global `.brutal-option-card`)
- All `border-radius` removed (option cards, doc-page, attention cards, question cards, priority/exit-impact badges, trigger tags, red-flag indicators, NA buttons — 14+ selectors)
- All `box-shadow` removed (doc-page, action bar, option cards)
- Monospace typography applied to 16+ selectors: progress labels, step titles, field labels, doc title, brand name, generation date, meta labels/values, TOC links, topic titles/numbers/audience, question numbers, priority/exit-impact badges, trigger tags, footer brand/disclaimer, NA buttons, attention titles

**Dark theme standardized:**
- `rgba(255, 255, 255, 0.3)` → `rgba(255, 255, 255, 0.15)` (progress bar, mobile dots)
- `rgba(200, 200, 200, *)` → `transparent` / `rgba(255, 255, 255, 0.06)` (NA buttons)
- doc-page: removed box-shadow, border set to `rgba(255, 255, 255, 0.15)`
- Action bar: simplified to background + border override only

**Print styles updated:**
- `.tool-authority` → `.brutal-tool-shell__authority` in print hide list
- Remaining `border-radius: 1px` → `0` in print badge rules

**E2E tests updated:**
- `.option-card.selected` → `.brutal-option-card.brutal-option-card--selected` (2 selectors)

**Not done (by design):**
- `.doc-attention-card` kept as page-specific (has relevance colors, divider sub-element different from `.brutal-attention-card`)
- `.doc-question` kept as page-specific (has priority colors, exit-impact badges, red-flag signals)
- Wizard progress, mobile progress, step layout kept as page-specific scoped styles
- No new reusable brutalist classes created — DM reused existing design system classes
- Document output section brutalized in place (too specialized for global promotion)

### Pause Point

- [x] Wizard option cards are brutalist (square, no shadow, primary-fill on select)
- [x] Progress bar uses brand delta triangles with brutalist styling (monospace labels)
- [x] Step titles have monospace, uppercase treatment
- [x] Generated document has monospace headings and hard dividers
- [x] All border-radius removed throughout
- [x] All box-shadow removed throughout
- [x] Dark theme borders standardized to `rgba(255, 255, 255, 0.15)`
- [x] `npm run test:run` passes (857/857)
- [x] E2E test selectors updated
- [x] Visual review at desktop, 768px, 480px

---

## Stage 5: TechPar

**File**: `src/pages/hub/tools/techpar/index.astro`
**Why last**: Largest scope — 137 custom classes with zero current design system reuse. Tab-based navigation, financial data tables, chart visualizations, scenario comparisons. This is a full redesign surface.
**Status**: Complete

### Direct Swaps Applied

| Current Class | Brutalist Class | Count |
|---|---|---|
| `cta-button primary` | `.brutal-btn.brutal-btn--primary` | 3 |
| `cta-button secondary` | `.brutal-btn.brutal-btn--secondary` | 3 |
| `tool-section-label` | `.brutal-tool-shell__section-label` | 10 |
| `heading-md` | `.brutal-heading-md` | 4 |
| `label-small` / `label` | `.brutal-label-small` / `.brutal-label` | ~12 |
| `text-tiny` / `text-small` / `text-base` | `.brutal-text-tiny` / `.brutal-text-small` / `.brutal-text-base` | ~25 |
| `tool-bench-table` | `.brutal-bench-table` | 1 |
| `heading-sm` | `.brutal-heading-sm` | 1 |

### New Brutalist Classes Needed

| Pattern | Classes | Notes |
|---|---|---|
| **Tab bar** | `.tp-tab-bar`, `.tp-tab`, `.tp-tab--active`, `.tp-tab--done`, `.tp-tab__icon`, `.tp-tab__label`, `.tp-tab__badge` | No brutalist tab component exists yet — create `.brutal-tab-bar` / `.brutal-tab` with monospace labels, hard underline indicator, no rounded corners |
| **Toolbar** | `.tp-toolbar`, `.tp-toolbar__reset` | Map to `.tool-action-bar` with `.brutal-btn` |
| **Panels** | `.tp-panel`, `.tp-panel--active`, `.tp-panel__header`, `.tp-panel__title`, `.tp-panel__sub` | View switching — brutalist: monospace titles, primary border dividers |
| **Fields** | `.tp-field`, `.tp-field__label`, `.tp-field__req`, `.tp-hint`, `.tp-input-wrap`, `.tp-input-pre`, `.tp-input-suf` | Form inputs — create `.brutal-field` with monospace label, hard border input, no radius |
| **Stage cards** | `.tp-stage-card`, `.tp-stage-card--active` | Map to `.brutal-option-card` |
| **ARR chips** | `.tp-arr-chip`, `.tp-arr-chip--active` | Quick-select chips — map to `.brutal-filter-chip` |
| **Segmented controls** | `.tp-seg`, `.tp-seg__btn`, `.tp-seg__btn--active` | Toggle buttons — create `.brutal-segmented` with hard borders, primary-fill active |
| **KPI hero** | `.tp-kpi-hero`, `.tp-kpi-hero__num`, `.tp-kpi-hero__lbl`, `.tp-kpi-hero__basis`, `.tp-kpi-hero__zone-row` | Use `.brutal-data` for hero value, `.brutal-label` for labels. **Apply frosted glass** (`.brutal-tool-shell` pattern) — this is a prominent data panel that sits over page content |
| **KPI grid** | `.tp-kpi-grid`, `.tp-kpi-cell`, `.tp-kpi-cell--highlight`, `.tp-kpi-lbl`, `.tp-kpi-val`, `.tp-kpi-sub` | Secondary metrics grid — **apply frosted glass** to cells. Monospace values, hard borders, no radius |
| **Signal card** | `.tp-signal`, `.tp-signal__stage`, `.tp-signal__zone`, `.tp-signal__head`, `.tp-signal__body`, `.tp-signal__div`, `.tp-sig-met` | Advisory card with zone-colored header — **apply frosted glass**. Map to `.brutal-attention-card` pattern |
| **Recommendations** | `.tp-recs`, `.tp-recs__title`, `.tp-recs__list` | Action items panel — **apply frosted glass**. Monospace title, hard borders |
| **Benchmark table** | `.tp-bench-table-wrap`, `.tool-bench-table`, `.bench-row--active`, `.tool-bench-note` | Stage comparison table — **apply frosted glass** to wrapper. Map to `.brutal-bench-table` |
| **Benchmark visuals** | `.tp-bench-wrap`, `.tp-bench-track`, `.tp-bench-fill`, `.tp-bench-lbls` | Zone indicator bar — brutalist: hard edges on fill, monospace labels, no rounded track |
| **Delta indicators** | `.tp-delta`, `.tp-delta--improve`, `.tp-delta--worsen` | Change direction — brutalist: monospace with hard color (no soft tints) |
| **Category sections** | `.tp-cat-section`, `.tp-cat-head`, `.tp-cat-dot`, `.tp-cat-row` | Expandable cost categories — map to `.tool-methodology` or `.brutal-rec-card` |
| **Charts** | `.tp-traj-chart-wrap`, `.tp-traj-legend`, `.tp-traj-dot` | Chart.js container — brutalist: hard border container, monospace legend, square dots |
| **Scenarios** | `.tp-scenario-list`, `.tp-scenario-compare`, `.tp-scenario-chip` | Comparison UI — map to `.brutal-filter-chip` for chips, hard border containers |
| **Buttons** | `.tp-btn-share`, `.tp-btn-next`, `.tp-btn-back` | Replace with `.brutal-btn--primary` / `--secondary` |
| **Empty states** | `.tp-empty`, `.tp-empty__sym`, `.tp-empty__msg`, `.tp-empty__cta` | No data state — brutalist: monospace text, outlined container |
| **Onboarding** | `.tp-onboarding`, `.tp-onboarding__trigger`, `.tp-onboarding__body` | Collapsible help — map to `.tool-methodology` |
| **Historical data** | `.tp-historical`, `.tp-historical__trigger`, `.tp-historical__body` | Expandable section — same as onboarding |

### Completion Summary

Stage 5 completed April 1, 2026.

**Approach:** Kept all `.tp-*` class names in place — brutalized the scoped CSS rather than renaming. This meant zero changes to `techpar-ui.ts` (53 classList operations) and zero E2E test changes.

**New brutalist classes created in global.css:**
- `.brutal-tab-bar` / `.brutal-tab` / `--active` / `--done` / `__icon` / `__label` / `__badge` / `__badge--on` — tab navigation with monospace labels, hard underline, square badge
- `.brutal-segmented` / `__btn` / `--active` / `--sm` / `--wide` — inline toggle with primary-fill active
- `.brutal-field` / `__label` / `__req` / `__input` — form field wrapper with monospace label, dashed input

**Frosted glass applied (backdrop-filter: blur(3px)) to 5 panels:**
- `.tp-kpi-hero` — primary KPI display, 3px primary top border
- `.tp-signal` — signal card, 3px primary left border
- `.tp-kpi-grid :global(.tp-kpi-cell)` — each KPI cell
- `.tp-recs` — recommendations, 3px primary top border
- `.tp-bench-table-wrap` — benchmark reference table

**Scoped CSS changes:**
- All `border-radius` removed (12 instances: tab badge, cat dot, zone dot, inputs, bench track/fill, traj dot, legend swatches)
- All `var(--bg-light-alt)` backgrounds → `transparent` (brutalist: no bg fills)
- All `1px solid` borders → `2px solid` (structural borders)
- Monospace typography applied to ~40 selectors: tabs, toolbar, inputs, chips, stage cards, segmented controls, baseline controls, delta, cross-link, empty CTAs, KPI labels/values, signal metrics, category names, scenario chips/table, trajectory legend, deepdive prompt, historical labels/inputs, history add
- All borders changed from `var(--text-muted)` → `var(--border-light)` (consistent token)

**Dark theme added:**
- 35+ `:global(html.dark-theme)` overrides with `rgba(255, 255, 255, 0.15)` borders
- Frosted glass panels: `rgba(255, 255, 255, 0.005)` background in dark mode
- Accent borders preserved (primary left/top borders, zone colors)

**Print styles updated:**
- Header/footer: monospace, uppercase, letter-spacing
- Footer separator: 2px border
- KPI hero: disabled backdrop-filter for print
- Signal card: 2px border with 3px primary left accent

**E2E tests:** Zero changes — all `.tp-*` class names preserved

**Brand page specimens added:**
- `.brutal-tab-bar` — 4 tabs showing active, done, badge, and default states
- `.brutal-segmented` — default (320px) and `--sm` (180px) variants
- `.brutal-field` — label with required marker and dashed-border input

### Pause Point

- [x] Tab bar has monospace labels, hard underline, no rounded corners
- [x] All input fields have no radius, monospace labels
- [x] Stage cards use primary-fill active state (inverted), 2px borders
- [x] KPI hero, KPI grid, signal card, recommendations, and benchmark table use frosted glass
- [x] Benchmark bar has hard edges (no border-radius)
- [x] Delta indicators use hard colors (monospace, no soft tints)
- [x] All `.tp-btn-*` replaced with `.brutal-btn`
- [x] Charts wrapped in hard-border container
- [x] New brutalist classes (tab bar, segmented controls, field inputs) added to `/brand` page
- [x] `npm run test:run` passes
- [x] Visual review at desktop, 768px, 480px

---

## New Design System Classes Expected

Classes that will likely need to be created during migration and added to the shared stylesheets:

| Class | Created During | Destination |
|---|---|---|
| `.brutal-tab-bar`, `.brutal-tab` | Stage 5 (TechPar) ✅ | `global.css` |
| `.brutal-segmented`, `.brutal-segmented__btn` | Stage 5 (TechPar) ✅ | `global.css` |
| `.brutal-field`, `.brutal-field__label`, `.brutal-field__input` | Stage 5 (TechPar) ✅ | `global.css` |
| `.brutal-progress-bar`, `.brutal-progress-bar__track`, `.brutal-progress-bar__fill`, `.brutal-progress-bar__label` | Stage 3 (ICG) ✅ | `global.css` |
| `.brutal-stat-tile`, `.brutal-stat-tile__value`, `.brutal-stat-tile__label` | Stage 3 (ICG) ✅ | `global.css` |
| `.brutal-callout`, `.brutal-callout__title`, `.brutal-callout--warning` | Stage 3 (ICG) ✅ | `global.css` |
| `.brutal-tool-shell--narrow` | Stage 3 (ICG) ✅ | `global.css` |
| `.brutal-search`, `.brutal-search__*` | Stage 2 (RegMap) ✅ | `global.css` |
| `.brutal-legend`, `.brutal-legend__*` | Stage 2 (RegMap) ✅ | `global.css` |
| `.brutal-map-cta`, `.brutal-map-cta__*` | Stage 2 (RegMap) ✅ | `global.css` |
| `.brutal-timeline-entry`, `.brutal-timeline-dot`, `.brutal-timeline-*` | Stage 2 (RegMap) ✅ | `global.css` |
| `.brutal-faq`, `.brutal-faq__*` | Stage 2 (RegMap) ✅ | `global.css` |
| `.brutal-map-container`, `.brutal-map-control`, `.brutal-map-tooltip`, `.brutal-map-tap-bar`, `.brutal-quick-zoom`, `.brutal-map-hint` | Stage 2 (RegMap) ✅ | `global.css` |
| `.brutal-panel`, `.brutal-panel__*`, `.brutal-reg-card`, `.brutal-reg-card__*`, `.brutal-bottom-sheet*` | Stage 2 (RegMap) ✅ | `global.css` |
| `.brutal-result-display`, `.brutal-result-value` | Stage 1 (TDC) | `global.css` |

Each new class — and every existing selector that received brutalist properties — should be added to the `/brand` page as a specimen.

---

## Verification (per stage)

1. `npm run build` — no build errors
2. `npm run test:run` — all unit/integration tests pass
3. Visual review at desktop, 768px, and 480px in both themes
4. Print output check (where applicable)
5. E2E spot-check for the migrated tool
6. All brutalized controls — new classes and modified existing selectors — added to `/brand` page as specimens

---

## Related

- [/brand](https://globalstrategic.tech/brand) — Live design system reference with all brutalist specimens
- [HUB_TOOLS_UX_UNIFICATION.md](./HUB_TOOLS_UX_UNIFICATION.md) — UX divergence audit and consolidation roadmap
- [STYLES_GUIDE.md](../styles/STYLES_GUIDE.md) — CSS conventions and component patterns
- [VARIABLES_REFERENCE.md](../styles/VARIABLES_REFERENCE.md) — Design token catalog
