# Site-Wide Brutalist Design Migration

Extend the brutalist design system — established during the [Hub Tools migration](./HUB_TOOLS_BRUTALIST_MIGRATION.md) — to all remaining marketing pages, site chrome, shared components, and content pages. The brutalist tokens and component classes live in `global.css`, `typography.css`, and `interactions.css`, rendered live on the [/brand](https://globalstrategic.tech/brand) reference page.

**Status**: In Progress (Stages 1-2 Complete)
**Priority**: High — brand cohesion + technical debt reduction
**Prerequisite**: Hub Tools Brutalist Migration (Complete)
**Last Updated**: April 2, 2026

---

## Motivation

The Hub Tools migration (Stages 1-5) brutalized all five tool pages into a cohesive design system. The remaining site — homepage, marketing pages, portfolio, radar, hub gateways, legal pages, and site chrome — still uses the original soft-UI styling: rounded corners, box shadows, sans-serif typography, and gradient fills. This creates a visual split between tool pages and everything else.

### Technical Debt Eliminated

| Debt Category | Current State | After Migration |
|---|---|---|
| **Hardcoded colors** | 12+ hex/rgba values outside variables (`#b26622`, `#d4923a`, `rgba(26,26,26,0.95)`) | All colors via CSS variables |
| **Inconsistent dark theme** | About, Services, Privacy, Terms pages have incomplete `:global(html.dark-theme)` overrides; hero text colors hardcoded in global.css | Standardized `rgba(255, 255, 255, 0.15)` borders; all colors via theme-aware variables |
| **Duplicate CSS** | ~1,200 lines of scoped CSS across 20+ components redefining spacing, typography, and hover states already available in the design system | Scoped CSS reduced to layout/positioning only |
| **Mixed typography** | Marketing pages use `.heading-*` / `.text-*` (sans-serif); tools use `.brutal-heading-*` / `.brutal-text-*` (monospace) | Single typographic voice site-wide |
| **Inconsistent border-radius** | 20+ instances of `4px` / `8px` radius on cards, badges, FAQ items | `border-radius: 0` everywhere |
| **Inconsistent box-shadow** | 15+ instances of `box-shadow` on cards, hover states, modals | Removed — structural borders replace depth cues |
| **Hardcoded transitions** | `0.2s` / `0.3s` in About, Services pages | `--transition-fast` / `--transition-normal` variables |
| **Missing print styles** | Portfolio, Radar, Hub gateways, Library pages have no `@media print` | Branded print output for all content pages |
| **No reusable hero/CTA classes** | Hero and CTA styles live in global.css as element selectors, not composable classes | `.brutal-hero`, `.brutal-cta` class families |

---

## Approach

Each stage migrates a logical group of related pages/components. Between stages, **pause for manual review** — verify visual quality, identify gaps where new brutalist classes are needed, and create those classes before proceeding.

### Principles (carried from Hub Tools migration)

1. **Dark theme borders**: `rgba(255, 255, 255, 0.15)` everywhere — not `var(--border-light)` which is invisible on dark backgrounds
2. **Propagate to global.css**: new reusable classes go in `global.css`, not in scoped `<style>` blocks. Remove redundant local overrides after propagating
3. **Back links**: keep as `.cta-button secondary` (page-level CTA, not tool control)
4. **`<select>` elements**: need explicit dark theme `background-color` on both select and `<option>` elements
5. **Print styles**: add branded header/footer (GST delta icon + title + generated date) to every content page
6. **Brand page specimens**: every brutalized control — whether a new `.brutal-*` class or an existing selector that received brutalist properties (monospace, structural borders, variable colors) — gets a rendered specimen on `/brand` (`src/pages/brand.astro`). This applies retroactively to completed stages
7. **Test updates**: grep `tests/` for every changed class name before committing

### Migration Order (simplest -> most complex)

| Stage | Scope | Scoped CSS | border-radius | box-shadow | Hardcoded Colors | Effort |
|-------|-------|-----------|--------------|-----------|-----------------|--------|
| 1 | ~~Site Chrome (Header, Footer, Breadcrumb, ThemeToggle)~~ | ~~48 lines~~ | ~~0~~ | ~~0~~ | ~~0~~ | ~~Complete~~ |
| 2 | ~~Shared Components (Hero, CTASection, StatsBar) + global.css marketing sections~~ | ~~0 scoped + ~200 global~~ | ~~0~~ | ~~0~~ | ~~3 (hero text)~~ | ~~Complete~~ |
| 3 | Legal & Error (Privacy, Terms, 404) | ~90 lines | 0 | 0 | 2 | Low |
| 4 | Homepage Sections (WhoWeSupport, WhatWeDo, WhyClientsTrustUs, EngagementFlow) | ~297 lines | 6 | 6 | 3 | Medium |
| 5 | About & Services Pages | ~344 lines | 6 | 3 | 4 | Medium-High |
| 6 | Hub Gateways & Library (hub/index, library/index, tools/index, VDR Structure, Business Architectures) | ~232 lines | 7 | 3 | 4 | Medium |
| 7 | Radar Feed (CategoryFilter, FyiItem, WireItem, RadarFeed, RadarHeader) | ~140+ lines | 2 | 0 | 4 | Medium |
| 8 | M&A Portfolio (PortfolioGrid, PortfolioHeader, PortfolioSummary, StickyControls, ProjectModal) | ~500+ lines | 0 | 3+ | 4+ | High |

---

## Stage 1: Site Chrome

**Files**: `src/components/Header.astro`, `src/components/Footer.astro`, `src/components/Breadcrumb.astro`, `src/components/ThemeToggle.astro`
**Why first**: These render on every page. Brutalizing site chrome establishes the visual frame before migrating page content. Low risk — minimal scoped CSS, already using design system variables.

### Global CSS Sections Affected

- **Header** (global.css ~lines 436-506): `.site-header`, nav links, logo, responsive rules
- **Footer** (global.css ~lines 966-1057): footer links, layout, responsive
- **Dark Theme Toggle** (global.css ~lines 1058-1090): switch UI

### Migration Tasks

| Task | Details |
|---|---|
| **Header typography** | Nav links → `.brutal-label` (monospace, uppercase). Logo text → monospace. Active link indicator → 2px hard underline (no gradient/glow) |
| **Header borders** | Replace `border-bottom: 4px solid var(--color-primary)` with `2px solid var(--color-primary)` (structural, not decorative) |
| **Footer typography** | All footer text → monospace. Link hover → primary-color underline reveal (`.brutal-link-interactive` pattern) |
| **Footer borders** | Top border → `2px solid var(--border-light)`. Dark theme → `rgba(255, 255, 255, 0.15)` |
| **Breadcrumb** | Already clean. Switch to `.brutal-text-small` for font, verify monospace rendering |
| **ThemeToggle** | Minimal changes — verify icon container has no radius, borders are structural |

### New Brutalist Classes Expected

None — site chrome should reuse existing `.brutal-label`, `.brutal-link-interactive`, `.brutal-text-small` classes.

### Pause Point Checklist

- [x] Header nav links render in monospace uppercase
- [x] Header active link uses hard underline (no gradient)
- [x] Footer text is monospace, links use primary-color underline reveal
- [x] Footer dark theme border at `rgba(255, 255, 255, 0.15)`
- [x] Breadcrumb text is monospace
- [x] Theme toggle has no border-radius
- [x] `npm run build` passes
- [x] `npm run test:run` passes
- [x] E2E tests checked for class selector changes
- [x] Visual review at desktop, 768px, 480px in both themes
- [x] Brutalized controls added to `/brand` page as specimens (nav links, footer links, breadcrumb, theme toggle)

### Additional Notes

- Logo (`a.logo`) explicitly preserved with `font-family: var(--font-family)` to shield from `nav a` monospace rule — logo styling deferred to a future decision
- 5 hardcoded color values replaced with CSS variables in footer/theme-toggle
- No new classes created; no test selectors changed

---

## Stage 2: Shared Components (Hero, CTA, StatsBar)

**Files**: `src/components/Hero.astro`, `src/components/CTASection.astro`, `src/components/StatsBar.astro`, `src/styles/global.css` (Hero section ~lines 571-680, Stats ~lines 749-781)
**Why second**: These components appear on multiple pages. Brutalizing them cascades the new design across the site without touching individual page files.

### Global CSS Sections to Migrate

**Hero** (global.css ~lines 571-680):
- Hardcoded `rgba(26, 26, 26, 0.95)` on hero h1 — replace with `var(--text-primary)`
- Hardcoded hero paragraph colors — replace with `var(--text-secondary)`
- Hero highlight spans use `var(--color-primary)` (keep)
- Hero `.cta-button` uses `font-family: monospace` (already brutalist — standardize to `.brutal-btn` class)
- Grid layout and responsive breakpoints (keep structure, remove any radius/shadow)

**Stats Bar** (global.css ~lines 749-781):
- Switch stat values to `.brutal-data` or monospace
- Switch stat labels to `.brutal-label`
- Remove any soft borders/shadows

**CTA Section**:
- No scoped CSS currently. Ensure CTA buttons use `.brutal-btn--primary`
- Section heading → `.brutal-heading-lg`

### New Brutalist Classes Expected

| Class | Purpose |
|---|---|
| `.brutal-hero` | Hero container — no radius, structural borders |
| `.brutal-hero__title` | Monospace hero h1 with theme-aware color variable |
| `.brutal-hero__subtitle` | Monospace subtitle, secondary text color |
| `.brutal-hero__description` | Monospace body text |
| `.brutal-hero__trustline` | Monospace small trust indicator |
| `.brutal-hero__actions` | Button container layout |

### Pause Point Checklist

- [x] Hero title renders in monospace uppercase
- [x] Hero text colors use variables (no hardcoded rgba)
- [x] Hero CTA buttons use `.brutal-btn` family (already monospace — no change needed)
- [x] Stats bar values use monospace
- [x] CTA section heading is monospace uppercase, buttons are brutalist
- [x] Dark theme fully functional with no hardcoded colors
- [x] All pages using Hero/CTA/StatsBar still render correctly
- [x] `npm run build` passes
- [x] `npm run test:run` passes
- [x] E2E tests checked for class/text selector changes
- [x] Visual review at desktop, 768px, 480px
- [x] Brutalized controls added to `/brand` page as specimens (hero title, hero description, trust line, stat values, stat labels, CTA heading, CTA description)

### Additional Notes

- 4 hardcoded `rgba(26,26,26,...)` values replaced with `var(--text-primary)` / `var(--text-secondary)`
- `rgba(26,26,26,0.85)` → `var(--text-secondary)` shifts opacity from 0.85 to 0.7 — intentional alignment to the standard text hierarchy
- `.cta-button` already had `font-family: monospace` — no change needed
- No new classes created; no class renames; no test selectors changed
- No scoped CSS in any of the 3 components (Hero, CTA, StatsBar) — all styles in global.css

---

## Stage 3: Legal & Error Pages

**Files**: `src/pages/privacy.astro`, `src/pages/terms.astro`, `src/pages/404.astro`
**Why third**: Simplest content pages. Nearly identical structure. Quick wins to expand brutalist coverage.

### Direct Swaps

| Current Pattern | Brutalist Replacement | Files |
|---|---|---|
| `rgba(5, 205, 153, 0.3)` hardcoded accent | `var(--color-primary)` with opacity via `color-mix()` or accent variable | Privacy, Terms |
| `rgba(245, 245, 245, 0.1)` dark override | `rgba(255, 255, 255, 0.15)` standardized | Privacy, Terms |
| `.heading-md` / `.text-base` | `.brutal-heading-md` / `.brutal-text-base` | Privacy, Terms |
| Section headings (h2, h3) | Monospace, uppercase | Privacy, Terms |

### 404 Page

Already uses only the Hero component — brutalized automatically by Stage 2. Verify the error message text renders correctly in monospace.

### Migration Tasks

| Task | Details |
|---|---|
| **Legal page typography** | All body text → `.brutal-text-base`. Headings → `.brutal-heading-md` / `.brutal-heading-sm`. Lists → monospace |
| **Legal page borders** | Section dividers → `2px solid var(--border-light)`. Dark theme → `rgba(255, 255, 255, 0.15)` |
| **Accent colors** | Replace hardcoded `rgba(5, 205, 153, 0.3)` with design system variable |
| **Print styles** | Add branded print header/footer for legal documents (useful for compliance printing) |

### Pause Point Checklist

- [ ] Privacy and Terms pages render in monospace
- [ ] No hardcoded color values remain
- [ ] Dark theme borders use standardized opacity
- [ ] 404 page renders correctly with brutalist Hero
- [ ] Print styles added for legal pages
- [ ] `npm run build` passes
- [ ] `npm run test:run` passes
- [ ] Visual review at desktop, 768px, 480px
- [ ] Brutalized controls added to `/brand` page as specimens (legal headings, legal body text, legal section dividers)

---

## Stage 4: Homepage Sections

**Files**: `src/components/WhoWeSupport.astro` (~59 lines CSS), `src/components/WhatWeDo.astro` (~59 lines CSS), `src/components/WhyClientsTrustUs.astro` (~60 lines CSS), `src/components/EngagementFlow.astro` (~119 lines CSS)
**Why fourth**: Homepage is the brand's front door. With site chrome and Hero already brutalized (Stages 1-2), these sections complete the homepage transformation.

### Direct Swaps

| Current Pattern | Brutalist Replacement | Components |
|---|---|---|
| `border-radius: 8px` | `border-radius: 0` | WhyClientsTrustUs, EngagementFlow |
| `box-shadow: 0 4px 12px rgba(...)` | Remove — use `2px solid var(--border-light)` | WhyClientsTrustUs, EngagementFlow |
| `.heading-md` / `.heading-lg` | `.brutal-heading-md` / `.brutal-heading-lg` | All 4 components |
| `.text-base` / `.text-small` | `.brutal-text-base` / `.brutal-text-small` | All 4 components |
| Gradient section backgrounds | Flat background with optional subtle border divider | WhoWeSupport, WhatWeDo |

### Migration Tasks

| Task | Details |
|---|---|
| **Section titles** | All → `.brutal-heading-lg` (monospace, uppercase) |
| **Body text** | All → `.brutal-text-base` (monospace) |
| **Cards** | Remove radius and shadow. Add `2px solid var(--border-light)` borders. Dark theme → `rgba(255, 255, 255, 0.15)` |
| **Delta bullets** | Keep SVG delta icon. Verify monospace label text |
| **Engagement flow steps** | Remove radius on step cards. Arrows → structural (hard lines, no soft curves) |
| **Trust indicators** | Square cards, hard borders, monospace stat values (`.brutal-data`) |
| **Hover states** | Replace shadow-lift with border-color change to `var(--color-primary)` (`.brutal-interactive` pattern) |
| **Section backgrounds** | Remove gradients. Use flat `transparent` or `var(--bg-light-alt)` with hard border dividers |

### New Brutalist Classes Expected

| Class | Purpose |
|---|---|
| `.brutal-section` | Reusable page section with hard border dividers, monospace headings |
| `.brutal-card` | Base card — no radius, 2px border, transparent bg, primary-border hover |
| `.brutal-card__title` | Monospace card heading |
| `.brutal-card__body` | Monospace card body text |

### Pause Point Checklist

- [ ] All homepage sections use monospace typography
- [ ] All cards have square corners, hard borders, no shadows
- [ ] Hover states use border-color change (not shadow lift)
- [ ] Section backgrounds are flat (no gradients)
- [ ] Delta bullet icons render correctly alongside monospace text
- [ ] Dark theme borders at `rgba(255, 255, 255, 0.15)`
- [ ] Trust indicator values use `.brutal-data` styling
- [ ] New classes added to `/brand` page as specimens
- [ ] `npm run build` passes
- [ ] `npm run test:run` passes
- [ ] E2E tests checked for class/text selector changes
- [ ] Visual review at desktop, 768px, 480px

---

## Stage 5: About & Services Pages

**Files**: `src/pages/about.astro` (~204 lines CSS), `src/pages/services.astro` (~140 lines CSS)
**Why fifth**: Highest concentration of technical debt — hardcoded colors, incomplete dark theme, border-radius, box-shadow, hardcoded transitions. Medium-high effort but high debt payoff.

### About Page Debt

| Issue | Location | Fix |
|---|---|---|
| 3x `border-radius` (4px, 8px) | Founder image, bio card | `border-radius: 0` |
| 1x `box-shadow` | Bio card | Remove → `2px solid var(--border-light)` |
| 2x hardcoded rgba colors | Section backgrounds | Replace with design system variables |
| Missing dark theme parity | Multiple rgba values without overrides | Add `:global(html.dark-theme)` for all borders/backgrounds |
| 2x hardcoded transitions (`0.3s`) | Hover states | `var(--transition-normal)` |

### Services Page Debt

| Issue | Location | Fix |
|---|---|---|
| 3x `border-radius` (8px) | Service cards, FAQ items | `border-radius: 0` |
| 2x `box-shadow` | Service cards, FAQ hover | Remove → structural borders |
| 2x hardcoded rgba colors | FAQ background | Replace with variables |
| FAQ accordion | Custom `<details>` styling | Map to `.brutal-faq` (created during RegMap Stage 2) |
| 2x hardcoded transitions (0.3s, 0.2s) | Card hover, FAQ toggle | `var(--transition-normal)` / `var(--transition-fast)` |

### Direct Swaps

| Current Pattern | Brutalist Replacement | Page |
|---|---|---|
| `.heading-lg` | `.brutal-heading-lg` | About, Services |
| `.heading-md` | `.brutal-heading-md` | About, Services |
| `.text-base` | `.brutal-text-base` | About, Services |
| Service card FAQ `<details>` | `.brutal-faq__item` / `.brutal-faq__question` / `.brutal-faq__answer` | Services |
| `transition: all 0.3s ease` | `transition: all var(--transition-normal)` | About, Services |

### Migration Tasks

| Task | Details |
|---|---|
| **Founder section** | Bio card → hard borders, no radius. Portrait image → square crop (no radius). Signature image → keep as-is (organic element) |
| **Service cards** | Remove radius and shadow. Add `2px solid var(--border-light)`. Hover → primary border (`.brutal-interactive`) |
| **FAQ accordion** | Reuse `.brutal-faq` family from RegMap migration. Remove custom radius/shadow |
| **Section backgrounds** | Replace rgba hardcodes with design system variables |
| **Dark theme** | Add missing overrides for all border-using elements |
| **Print styles** | Add branded print for About (founder bio) and Services (service catalog) |

### Global CSS Sections Affected

- **Services** (global.css ~lines 782-889): service cards, hover effects
- **About Section** (global.css ~lines 890-965): founder section, images, bio layout

### Pause Point Checklist

- [ ] Founder bio card has square corners, hard borders, no shadow
- [ ] Portrait image is square-cropped (no radius)
- [ ] Service cards use brutalist hover (border-color, not shadow)
- [ ] FAQ accordion uses `.brutal-faq` classes
- [ ] All hardcoded colors replaced with variables
- [ ] All transitions use design system variables
- [ ] Dark theme complete — no missing overrides
- [ ] Print styles added for both pages
- [ ] `npm run build` passes
- [ ] `npm run test:run` passes
- [ ] Visual review at desktop, 768px, 480px
- [ ] Brutalized controls added to `/brand` page as specimens (founder bio card, service cards, FAQ accordion)

---

## Stage 6: Hub Gateways & Library

**Files**: `src/pages/hub/index.astro` (~164 lines CSS), `src/pages/hub/library/index.astro` (~34 lines CSS), `src/pages/hub/tools/index.astro` (~34 lines CSS), `src/pages/hub/library/vdr-structure/index.astro`, `src/pages/hub/library/business-architectures/index.astro`, `src/components/hub/HubHeader.astro` (~24 lines CSS)
**Why sixth**: These gateway pages sit between the brutalized tools and the marketing site. They have moderate debt (border-radius, box-shadow) and will benefit from reusing classes created in earlier stages.

### Direct Swaps

| Current Pattern | Brutalist Replacement | Files |
|---|---|---|
| `border-radius: 8px` | `border-radius: 0` | hub/index (3), library/index (2), tools/index (2) |
| `box-shadow` | `2px solid var(--border-light)` | hub/index (3) |
| `.heading-md` / `.heading-lg` | `.brutal-heading-md` / `.brutal-heading-lg` | All |
| `.text-base` / `.text-small` | `.brutal-text-base` / `.brutal-text-small` | All |
| Tool/library link cards | `.brutal-card` (from Stage 4) or `.brutal-teaser-card` (existing) | hub/index, library/index, tools/index |

### Migration Tasks

| Task | Details |
|---|---|
| **Hub landing** | Tool/library cards → `.brutal-card` or `.brutal-teaser-card`. Remove shadows and radius. Hover → primary border |
| **HubHeader** | Already clean — verify monospace rendering, add `.brutal-heading-lg` to title |
| **Library index** | Document cards → square, hard borders. Category labels → `.brutal-label` |
| **Tools index** | Tool cards → match `.brutal-teaser-card` pattern from existing design system |
| **VDR Structure** | Content page — headings → `.brutal-heading-*`, body → `.brutal-text-base`, code blocks → hard borders |
| **Business Architectures** | Same treatment as VDR Structure |
| **Print styles** | Add for library content pages (useful reference documents) |

### New Brutalist Classes Expected

| Class | Purpose |
|---|---|
| `.brutal-content-page` | Document-style layout for library content — hard border sections, monospace headings, readable body |
| `.brutal-content-page__section` | Section with 2px top border divider |

### Pause Point Checklist

- [ ] Hub landing cards are square with hard borders
- [ ] Library and Tools index cards match brutalist pattern
- [ ] VDR Structure and Business Architectures use monospace headings
- [ ] HubHeader renders in monospace
- [ ] All border-radius removed
- [ ] All box-shadow removed
- [ ] Dark theme borders standardized
- [ ] Print styles for library content pages
- [ ] New classes added to `/brand` page
- [ ] `npm run build` passes
- [ ] `npm run test:run` passes
- [ ] Visual review at desktop, 768px, 480px

---

## Stage 7: Radar Feed

**Files**: `src/components/radar/CategoryFilter.astro` (~40 lines CSS), `src/components/radar/FyiItem.astro` (~100+ lines CSS), `src/components/radar/WireItem.astro`, `src/components/radar/RadarFeed.astro`, `src/components/radar/RadarFeedSkeleton.astro`, `src/components/radar/RadarHeader.astro`, `src/pages/hub/radar/index.astro`
**Why seventh**: Radar has the most prominent hardcoded color debt (`#b26622`, `#d4923a` for Editor's Pick badges) and is a frequently visited page. The feed item cards are the primary migration target.

### Critical Fixes

| Issue | Location | Fix |
|---|---|---|
| Hardcoded `#b26622` | FyiItem, PortfolioHeader (Editor's Pick badge bg) | Create `--color-editors-pick` variable in `variables.css` |
| Hardcoded `#d4923a` | FyiItem, PortfolioHeader (Editor's Pick badge hover) | Create `--color-editors-pick-hover` variable in `variables.css` |
| `border-radius` on badges | FyiItem (2 instances) | `border-radius: 0` |

### Direct Swaps

| Current Pattern | Brutalist Replacement | Files |
|---|---|---|
| `.heading-md` | `.brutal-heading-md` | RadarHeader (via HubHeader) |
| Category filter pills | `.brutal-filter-chip` (already exists) | CategoryFilter |
| `.text-base` / `.text-small` | `.brutal-text-base` / `.brutal-text-small` | FyiItem, WireItem |
| Feed item cards | `.brutal-card` (from Stage 4) | FyiItem, WireItem |
| Loading skeleton | `.brutal-skeleton` (exists in global.css) | RadarFeedSkeleton |

### Migration Tasks

| Task | Details |
|---|---|
| **CategoryFilter** | Verify current pills match `.brutal-filter-chip` — already variable-clean but needs monospace + no radius |
| **FyiItem** | Card → square corners, hard borders. Source badges → monospace `.brutal-label`. Editor's Pick → new variable color. Annotation text → `.brutal-text-base` |
| **WireItem** | Card → square corners, hard borders. Source/date → `.brutal-label-small` monospace |
| **RadarFeedSkeleton** | Pulse animation → match `.brutal-skeleton` pattern (existing) |
| **Editor's Pick variable** | Add `--color-editors-pick: #d4923a` and `--color-editors-pick-hover: #b26622` to `variables.css` (both themes) |
| **Print styles** | Add for radar feed — list format, hide filter chrome, branded header/footer |

### Pause Point Checklist

- [ ] Feed items have square corners, hard borders, monospace text
- [ ] Editor's Pick badges use CSS variable (no hardcoded hex)
- [ ] Category filter uses `.brutal-filter-chip`
- [ ] Loading skeleton matches brutalist pattern
- [ ] Dark theme borders standardized
- [ ] Print styles for radar feed
- [ ] `npm run build` passes
- [ ] `npm run test:run` passes
- [ ] E2E tests checked for class selector changes
- [ ] Visual review at desktop, 768px, 480px
- [ ] Brutalized controls added to `/brand` page as specimens (feed item cards, Editor's Pick badge, category filter chips)

---

## Stage 8: M&A Portfolio

**Files**: `src/components/portfolio/PortfolioGrid.astro` (~150+ lines CSS), `src/components/portfolio/PortfolioHeader.astro` (~340+ lines CSS), `src/components/PortfolioSummary.astro` (~22 lines CSS), `src/components/portfolio/StickyControls.astro` (~150+ lines CSS), `src/components/portfolio/ProjectModal.astro`, `src/pages/ma-portfolio.astro`, `src/styles/portfolio-controls.css`
**Why last**: Largest scope — 500+ lines of scoped CSS across 5 components, plus a dedicated CSS file. Complex interactive UI (filtering, sorting, modal) with the most hardcoded colors. Highest risk surface.

### Critical Fixes

| Issue | Location | Fix |
|---|---|---|
| Hardcoded `#b26622`, `#d4923a` | PortfolioHeader (Editor's Pick) | Use `--color-editors-pick` variable (created in Stage 7) |
| 4+ hardcoded rgba colors | PortfolioHeader section | Replace with design system variables |
| `box-shadow` on cards/modal | PortfolioGrid, ProjectModal | Remove → hard borders |
| `box-shadow` on header | PortfolioHeader | Remove → structural border |

### Direct Swaps

| Current Pattern | Brutalist Replacement | Components |
|---|---|---|
| `.heading-md` / `.heading-lg` | `.brutal-heading-md` / `.brutal-heading-lg` | PortfolioHeader, PortfolioSummary |
| `.text-base` / `.text-small` | `.brutal-text-base` / `.brutal-text-small` | All |
| `.label` / `.label-small` | `.brutal-label` / `.brutal-label-small` | Project cards, filters |
| Filter/sort controls | `.brutal-filter-chip` + `.brutal-segmented` (existing) | StickyControls |
| Portfolio summary gradient | Flat background or transparent | PortfolioSummary |

### Migration Tasks

| Task | Details |
|---|---|
| **PortfolioGrid** | Project cards → square corners, hard borders, monospace labels. Year badges → `.brutal-label`. ARR/stage metrics → `.brutal-data-sm`. Hover → primary border (not shadow lift) |
| **PortfolioHeader** | Remove shadow. Section title → `.brutal-heading-lg`. Stat values → `.brutal-data`. Replace hardcoded colors with variables |
| **PortfolioSummary** | Gradient → flat. Stats → `.brutal-data` + `.brutal-label` |
| **StickyControls** | Filter pills → `.brutal-filter-chip`. Sort toggle → `.brutal-segmented`. Search → `.brutal-search` (existing from RegMap). Sticky bar border → `2px solid var(--border-light)` |
| **ProjectModal** | Remove border-radius and box-shadow. Header → `.brutal-heading-md`. Close button → `.brutal-btn`. Detail labels → `.brutal-label`. Technology tags → `.brutal-filter-chip` (non-interactive variant) |
| **portfolio-controls.css** | Migrate to use brutalist variables/patterns. Consider merging into global.css if small enough |
| **Print styles** | Portfolio grid → clean card list. Modal detail → full-page print. Branded header/footer |

### New Brutalist Classes Expected

| Class | Purpose |
|---|---|
| `.brutal-project-card` | Portfolio project card — hard borders, monospace labels, primary-border hover |
| `.brutal-project-card__badge` | Year/stage badge — square, monospace, outlined |
| `.brutal-project-card__metric` | ARR/growth metric — `.brutal-data-sm` styling |
| `.brutal-modal` | Full-screen or overlay modal — hard borders, no radius, no shadow, 3px primary top border |
| `.brutal-modal__header` | Modal header with close button |
| `.brutal-modal__body` | Modal content area |
| `.brutal-tag` | Non-interactive chip for technology tags — square, outlined, monospace |

### Pause Point Checklist

- [ ] Project cards have square corners, hard borders, monospace labels
- [ ] Card hover uses primary border change (not shadow lift)
- [ ] Filter controls use `.brutal-filter-chip` and `.brutal-segmented`
- [ ] Search uses `.brutal-search`
- [ ] Modal has no border-radius, no box-shadow, hard borders
- [ ] All hardcoded colors replaced with variables
- [ ] Portfolio controls CSS uses design system tokens
- [ ] Dark theme borders standardized across all components
- [ ] Print styles for portfolio grid and modal detail
- [ ] New classes added to `/brand` page
- [ ] `npm run build` passes
- [ ] `npm run test:run` passes
- [ ] E2E tests checked for all class selector changes
- [ ] Visual review at desktop, 768px, 480px

---

## New Design System Classes Expected (All Stages)

Classes that will likely need to be created during migration and added to the shared stylesheets:

| Class | Created During | Destination |
|---|---|---|
| `.brutal-hero`, `.brutal-hero__title`, `__subtitle`, `__description`, `__trustline`, `__actions` | Stage 2 (Shared Components) | `global.css` |
| `.brutal-section` | Stage 4 (Homepage) | `global.css` |
| `.brutal-card`, `.brutal-card__title`, `__body` | Stage 4 (Homepage) | `global.css` |
| `.brutal-content-page`, `.brutal-content-page__section` | Stage 6 (Library) | `global.css` |
| `.brutal-project-card`, `__badge`, `__metric` | Stage 8 (Portfolio) | `global.css` |
| `.brutal-modal`, `__header`, `__body` | Stage 8 (Portfolio) | `global.css` |
| `.brutal-tag` | Stage 8 (Portfolio) | `global.css` |

### Variables to Add

| Variable | Value (Light) | Value (Dark) | Created During |
|---|---|---|---|
| `--color-editors-pick` | `#d4923a` | `#d4923a` | Stage 7 (Radar) |
| `--color-editors-pick-hover` | `#b26622` | `#b26622` | Stage 7 (Radar) |

Each new class should be added to the `/brand` page as a specimen after creation.

---

## Verification (per stage)

1. `npm run build` — no build errors
2. `npm run test:run` — all unit/integration tests pass
3. Visual review at desktop, 768px, and 480px in both themes
4. Print output check (where applicable)
5. E2E spot-check for migrated pages
6. All brutalized controls — new classes and modified existing selectors — added to `/brand` page as specimens
7. `grep tests/ OLD_CLASS_NAME` — no stale selectors in test files

---

## CSS Reduction Targets

| File | Current Lines | Target Reduction | Notes |
|---|---|---|---|
| `global.css` | ~5,329 | Net neutral (marketing sections shrink, new `.brutal-*` classes grow) | Refactored, not necessarily smaller |
| Scoped CSS (all pages/components) | ~1,200 | -800 to -1,000 | Move reusable patterns to global, keep only layout/positioning |
| `portfolio-controls.css` | 32 | -32 (merge into global.css) | Too small for separate file |

---

## Risk Mitigation

| Risk | Mitigation |
|---|---|
| Homepage visual regression | Stage 4 has the most visual impact — pause for manual review before proceeding |
| E2E test breakage | Grep for every changed class name in `tests/` before committing (per CLAUDE.md rule) |
| Overly austere marketing pages | Hero and CTA sections may need a "softer brutalist" treatment — frosted glass on hero, primary-color accent borders. Decide during Stage 2 review |
| Portfolio filter UX regression | StickyControls is heavily interactive — test all filter/sort combinations after migration |
| Print regression | Verify print output for each stage. Existing tool print styles are the reference standard |

---

## Related

- [Hub Tools Brutalist Migration](./HUB_TOOLS_BRUTALIST_MIGRATION.md) — Completed predecessor initiative (5 stages)
- [Hub Tools UX Unification](./HUB_TOOLS_UX_UNIFICATION.md) — UX divergence audit and consolidation roadmap
- [Styles Remediation Roadmap](../styles/STYLES_REMEDIATION_ROADMAP.md) — Design system evolution tracker
- [/brand](https://globalstrategic.tech/brand) — Live design system reference with all brutalist specimens
- [STYLES_GUIDE.md](../styles/STYLES_GUIDE.md) — CSS conventions and component patterns
- [VARIABLES_REFERENCE.md](../styles/VARIABLES_REFERENCE.md) — Design token catalog
- [BRAND_GUIDELINES.md](../styles/BRAND_GUIDELINES.md) — Brand decisions and color hierarchy
