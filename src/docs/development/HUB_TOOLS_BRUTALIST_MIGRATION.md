# Hub Tools — Brutalist Design Migration

Migrate all five hub tools from their current soft-UI styling (rounded corners, box shadows, filled backgrounds) to the brutalist design system (no radius, monospace typography, structural borders, primary-color accents). The brutalist design tokens and component classes are defined in `global.css`, `typography.css`, and `interactions.css`, and rendered live on the [/brand](https://globalstrategic.tech/brand) reference page.

**Status**: In progress — Stage 1 (TDC) complete, paused for review
**Priority**: High — brand cohesion
**Last Updated**: March 28, 2026

---

## Approach

Each stage migrates one tool. Between stages, **pause for manual review** — verify visual quality, identify gaps where new brutalist classes are needed, and create those classes before proceeding.

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

### Pause Point

After completing Stage 1:
- [ ] All TDC controls render in brutalist style
- [ ] Dark theme is correct — borders visible at `rgba(255, 255, 255, 0.15)`
- [ ] Slider thumb is square, track is flat
- [ ] Results use `.brutal-data` for numeric values
- [ ] Print output still clean
- [ ] Identify any new brutalist classes created that should be added to `/brand` page
- [ ] `npm run test:run` passes
- [ ] Visual review at desktop, 768px, 480px

---

## Stage 2: Regulatory Map

**File**: `src/pages/hub/tools/regulatory-map/index.astro`
**Why second**: Medium complexity, already uses `.filter-chip` and `.heading-*` from the design system, no form inputs or wizard flows. Primarily a data visualization tool.

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
| **Search** | `.search-input-wrapper`, `.search-input`, `.search-icon`, `.search-clear-btn`, `.search-results`, `.search-result-item` | Search dropdown with category badges — may reuse `.brutal-filter-chip` for category indicators |
| **Map layout** | `.map-wrapper`, `.map-layout`, `.map-legend`, `.map-cta` | Full-width map container — not a `.tool-shell` pattern. Brutalist treatment: hard borders, no radius on legend box |
| **Legend** | `.legend-item`, `.legend-swatch`, `.legend-label` | Color dots with labels — brutalist: square swatches, monospace labels |
| **Timeline** | `.timeline-section`, `.timeline-scroll`, `.timeline-entry`, `.timeline-dot`, `.timeline-year-label`, `.timeline-today` | Horizontal scrollable timeline — brutalist: hard line, square dots, monospace dates |
| **FAQ** | `.faq-section`, `.faq-item`, `.faq-question`, `.faq-answer` | Native `<details>` accordion — map to `.tool-methodology` pattern or brutalist details variant |
| **Bottom sheet** | `.bottom-sheet-overlay` | Mobile panel overlay — brutalist: hard border, no rounded corners, primary top-border accent |

### Pause Point

After completing Stage 2:
- [ ] Filter chips are square, outlined, monospace
- [ ] Search input has no radius, monospace placeholder
- [ ] Timeline dots are square, legend swatches are square
- [ ] FAQ uses brutalist collapsible pattern
- [ ] Map legend and overlays have no rounded corners
- [ ] Add print styles (currently missing from RegMap)
- [ ] Identify new brutalist classes for `/brand` page
- [ ] `npm run test:run` passes
- [ ] Visual review at desktop, 768px, 480px

---

## Stage 3: Infrastructure Cost Governance

**File**: `src/pages/hub/tools/infrastructure-cost-governance/index.astro`
**Why third**: Medium-high complexity with multi-view layout (landing → wizard → results), but already uses `.tool-shell`, `.tool-action-bar`, and typography classes from the design system.

### Direct Swaps

| Current Class | Brutalist Class | Count |
|---|---|---|
| `.tool-shell.tool-shell--narrow` | `.brutal-tool-shell.brutal-tool-shell--narrow` | 1 |
| `.tool-action-bar` | `.tool-action-bar` (keep, add `.brutal-btn` inside) | 2 |
| `.label` | `.brutal-label` | 1 |
| `.text-small` / `.text-tiny` | `.brutal-text-small` / `.brutal-text-tiny` | 2 |
| `.hub-btn--primary` / `--secondary` | `.brutal-btn--primary` / `--secondary` | buttons |

### New Brutalist Classes Needed

| Pattern | Classes | Notes |
|---|---|---|
| **Landing callout** | `.landing-callout`, `.landing-callout__title` | Info box — brutalist: hard border, primary left-border accent, monospace title |
| **Stage cards** | `.icg-stage-card`, `.icg-stage-card--active` | Selection cards — map to `.brutal-option-card` |
| **Progress bar** | `.icg-progress`, `.icg-progress__track`, `.icg-progress__fill`, `.icg-progress__label` | Linear progress — brutalist: hard edges, primary fill, monospace label |
| **Domain header** | `.icg-domain-header`, `.icg-domain-label`, `.icg-domain-name`, `.icg-domain-desc` | Section header — brutalist: monospace label, primary bottom-border divider |
| **Question cards** | `.icg-question-card`, `.icg-opt-btn`, `.icg-opt-btn.selected` | Assessment questions — map to `.brutal-option-card--compact` |
| **Score display** | `.icg-score-display`, `.icg-score-level`, `.icg-gauge`, `.icg-radar` | Results visualization — brutalist: `.brutal-data` for scores, hard borders on gauge |
| **Recommendations** | `.icg-rec-card`, `.icg-rec-badge`, `.icg-rec-na` | Already have `.brutal-rec-card` — verify compatibility |
| **Snapshots** | `.icg-snapshot-manager`, `.icg-snapshot-label-input`, `.icg-snapshot-clear` | Persistence UI — brutalist: monospace inputs, hard borders, outlined buttons |
| **Stats tiles** | `.stat-tile`, `.stat-tile__value`, `.stat-tile__label` | Landing stats — may map to `.stats-bar` pattern or create `.brutal-stat-tile` |
| **Resume prompt** | `.icg-resume-prompt` | Session restore — brutalist: hard border, monospace text |

### Pause Point

After completing Stage 3:
- [ ] Landing view has brutalist callout, stage cards, and stats
- [ ] Assessment questions use brutalist option cards
- [ ] Progress bar has hard edges and monospace label
- [ ] Results scores use `.brutal-data` typography
- [ ] Recommendation cards match `.brutal-rec-card` pattern
- [ ] Snapshot manager inputs have no radius
- [ ] 31 dark theme `:global()` overrides migrated to CSS variables
- [ ] Identify new brutalist classes for `/brand` page
- [ ] `npm run test:run` passes
- [ ] Visual review at desktop, 768px, 480px

---

## Stage 4: Diligence Machine

**File**: `src/pages/hub/tools/diligence-machine/index.astro`
**Why fourth**: Complex multi-step wizard + document generation output. The wizard UI has good design system alignment (`.option-card`, `.hub-btn`, `.cta-button`), but the generated document output is highly custom.

### Direct Swaps

| Current Class | Brutalist Class | Count |
|---|---|---|
| `.hub-btn` / `--secondary` | `.brutal-btn` / `--secondary` | 4 |
| `.cta-button.primary` / `.secondary` | `.brutal-btn--primary` / `--secondary` | 3 |
| `.option-card` | `.brutal-option-card` | 3 |
| `.option-card.selected` | `.brutal-option-card--selected` | state |
| `.tool-authority` | `.brutal-tool-shell__authority` | 1 |

### New Brutalist Classes Needed

| Pattern | Classes | Notes |
|---|---|---|
| **Wizard progress** | `.wizard-progress`, `.progress-segment`, `.progress-number`, `.progress-label` | Already have brand-page specimens — promote to production brutalist classes if not already done |
| **Mobile progress** | `.wizard-progress-mobile`, `.progress-dot`, `.progress-mobile-*` | Same as above |
| **Step layout** | `.step-title`, `.step-subtitle`, `.step-note`, `.wizard-step`, `.wizard-nav` | Step typography — use `.brutal-heading-md` for title, `.brutal-text-base` for subtitle |
| **Compound fields** | `.compound-fields-grid`, `.compound-field-section`, `.field-section-label`, `.field-options-grid` | Grouped option sets — monospace labels, hard border dividers |
| **Document output** | `.doc-page`, `.doc-header`, `.doc-title`, `.doc-meta-*`, `.doc-toc`, `.doc-topics`, `.doc-divider`, `.doc-footer` | Generated document — brutalist treatment: monospace headings, hard borders between sections, primary-color dividers |
| **Document questions** | `.doc-question`, `.doc-q-header`, `.doc-q-text`, `.doc-q-badges`, `.doc-q-priority`, `.doc-q-rationale` | Question cards — map to `.brutal-rec-card` pattern with priority badges |
| **Attention cards** | `.doc-attention-card`, `.doc-attention-header`, `.doc-attention-desc` | Already have `.brutal-attention-card` — verify compatibility |
| **Action bar** | `.doc-action-bar`, `.doc-action-btn` | Document toolbar — use `.brutal-btn` for action buttons |
| **N/A button** | `.dm-na-btn` | Map to `.brutal-rec-card__na` or create shared `.na-btn` |

### Pause Point

After completing Stage 4:
- [ ] Wizard option cards are brutalist (square, no shadow, primary-fill on select)
- [ ] Progress bar uses brand delta triangles with brutalist styling
- [ ] Step titles use `.brutal-heading-md`, subtitles use `.brutal-text-base`
- [ ] Generated document has monospace headings and hard dividers
- [ ] Question cards match `.brutal-rec-card` pattern
- [ ] Attention cards match `.brutal-attention-card` pattern
- [ ] 27 dark theme `:global()` overrides migrated to CSS variables
- [ ] Identify new brutalist classes for `/brand` page
- [ ] `npm run test:run` passes
- [ ] Visual review at desktop, 768px, 480px

---

## Stage 5: TechPar

**File**: `src/pages/hub/tools/techpar/index.astro`
**Why last**: Largest scope — 137 custom classes with zero current design system reuse. Tab-based navigation, financial data tables, chart visualizations, scenario comparisons. This is a full redesign surface.

### Direct Swaps

None — TechPar uses zero shared design system classes. Every control is custom `.tp-*` prefixed.

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
| **KPI display** | `.tp-kpi-hero`, `.tp-kpi-hero__num`, `.tp-kpi-hero__lbl`, `.tp-kpi-grid` | Use `.brutal-data` for hero value, `.brutal-label` for labels |
| **Benchmark visuals** | `.tp-bench-wrap`, `.tp-bench-track`, `.tp-bench-fill`, `.tp-bench-lbls` | Zone indicator bar — brutalist: hard edges on fill, monospace labels, no rounded track |
| **Delta indicators** | `.tp-delta`, `.tp-delta--improve`, `.tp-delta--worsen` | Change direction — brutalist: monospace with hard color (no soft tints) |
| **Signal cards** | `.tp-signal`, `.tp-signal__stage`, `.tp-signal__zone`, `.tp-signal__head`, `.tp-signal__body` | Advisory cards — map to `.brutal-attention-card` pattern |
| **Category sections** | `.tp-cat-section`, `.tp-cat-head`, `.tp-cat-dot`, `.tp-cat-row` | Expandable cost categories — map to `.tool-methodology` or `.brutal-rec-card` |
| **Charts** | `.tp-traj-chart-wrap`, `.tp-traj-legend`, `.tp-traj-dot` | Chart.js container — brutalist: hard border container, monospace legend, square dots |
| **Scenarios** | `.tp-scenario-list`, `.tp-scenario-compare`, `.tp-scenario-chip` | Comparison UI — map to `.brutal-filter-chip` for chips, hard border containers |
| **Buttons** | `.tp-btn-share`, `.tp-btn-next`, `.tp-btn-back` | Replace with `.brutal-btn--primary` / `--secondary` |
| **Empty states** | `.tp-empty`, `.tp-empty__sym`, `.tp-empty__msg`, `.tp-empty__cta` | No data state — brutalist: monospace text, outlined container |
| **Onboarding** | `.tp-onboarding`, `.tp-onboarding__trigger`, `.tp-onboarding__body` | Collapsible help — map to `.tool-methodology` |
| **Historical data** | `.tp-historical`, `.tp-historical__trigger`, `.tp-historical__body` | Expandable section — same as onboarding |

### Pause Point

After completing Stage 5:
- [ ] Tab bar has monospace labels, hard underline, no rounded corners
- [ ] All input fields have no radius, monospace labels
- [ ] Stage cards match `.brutal-option-card`
- [ ] KPI hero uses `.brutal-data` for the primary number
- [ ] Benchmark bar has hard edges
- [ ] Delta indicators use hard colors (no soft tints)
- [ ] All `.tp-btn-*` replaced with `.brutal-btn`
- [ ] Charts wrapped in hard-border container
- [ ] New brutalist classes (tab bar, segmented controls, field inputs) added to `/brand` page
- [ ] `npm run test:run` passes
- [ ] Visual review at desktop, 768px, 480px

---

## New Design System Classes Expected

Classes that will likely need to be created during migration and added to the shared stylesheets:

| Class | Created During | Destination |
|---|---|---|
| `.brutal-tab-bar`, `.brutal-tab` | Stage 5 (TechPar) | `global.css` |
| `.brutal-segmented`, `.brutal-seg__btn` | Stage 5 (TechPar) | `global.css` |
| `.brutal-field`, `.brutal-field__label`, `.brutal-field__input` | Stage 5 (TechPar) | `global.css` |
| `.brutal-progress-bar`, `.brutal-progress__track`, `.brutal-progress__fill` | Stage 3 (ICG) | `global.css` |
| `.brutal-stat-tile` | Stage 3 (ICG) | `global.css` |
| `.brutal-search-input`, `.brutal-search-results` | Stage 2 (RegMap) | `global.css` |
| `.brutal-timeline-entry`, `.brutal-timeline-dot` | Stage 2 (RegMap) | `global.css` |
| `.brutal-result-display`, `.brutal-result-value` | Stage 1 (TDC) | `global.css` |

Each new class should be added to the `/brand` page as a specimen after creation.

---

## Verification (per stage)

1. `npm run build` — no build errors
2. `npm run test:run` — all unit/integration tests pass
3. Visual review at desktop, 768px, and 480px in both themes
4. Print output check (where applicable)
5. E2E spot-check for the migrated tool
6. New brutalist classes documented on `/brand` page

---

## Related

- [/brand](https://globalstrategic.tech/brand) — Live design system reference with all brutalist specimens
- [HUB_TOOLS_UX_UNIFICATION.md](./HUB_TOOLS_UX_UNIFICATION.md) — UX divergence audit and consolidation roadmap
- [STYLES_GUIDE.md](../styles/STYLES_GUIDE.md) — CSS conventions and component patterns
- [VARIABLES_REFERENCE.md](../styles/VARIABLES_REFERENCE.md) — Design token catalog
