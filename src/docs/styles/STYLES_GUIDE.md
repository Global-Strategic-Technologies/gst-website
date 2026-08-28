# CSS Styling Guide

Conventions, best practices, and patterns for all CSS work on the GST Website.

---

## Table of Contents

1. [Quick Start by Task](#quick-start-by-task)
2. [In-repo Control Examples](#in-repo-control-examples)
3. [Design System Architecture](#design-system-architecture)
4. [File Organization](#file-organization)
5. [Component Styling](#component-styling)
6. [Brand Delta Icon](#brand-delta-icon)
7. [Dark Theme Implementation](#dark-theme-implementation)
8. [Responsive Design](#responsive-design)
9. [Hub Tool Patterns](#hub-tool-patterns)
10. [Anti-Patterns](#anti-patterns)
11. [New Component Checklist](#new-component-checklist)

---

## Quick Start by Task

**Adding a new component:**

1. Use CSS variables for all colors, spacing, and typography — see [VARIABLES_REFERENCE.md](./VARIABLES_REFERENCE.md)
2. Use typography utility classes — see [TYPOGRAPHY_REFERENCE.md](./TYPOGRAPHY_REFERENCE.md)
3. Test in both light and dark themes and all 6 palettes
4. Check responsive behavior at 768px and 480px breakpoints

**Styling text:** Pick a utility class from [TYPOGRAPHY_REFERENCE.md](./TYPOGRAPHY_REFERENCE.md) (`.brutal-heading-lg`, `.brutal-text-base`, `.brutal-label`, etc.). Dark theme colors switch automatically.

**Need a specific color/spacing value:** Look it up in [VARIABLES_REFERENCE.md](./VARIABLES_REFERENCE.md). Use the variable, never a hardcoded value.

**Dark theme broken:** You almost certainly hardcoded a color. Replace it with `var(--variable-name)`.

---

## In-repo Control Examples

**The brand page is the living control-example surface for this design system — start there before building anything visual.** It renders real tokens and real component classes at runtime and reacts to the theme toggle and all six palettes, so what you see is what the system currently produces, not a static mockup.

- **Page**: [src/pages/brand.astro](../../pages/brand.astro) — composition, section layout, and the specimen styling
- **Specimen components**: [src/components/brand/](../../components/brand/) — color swatches with live token values (`BrandColors`, `ColorSpecimens`), the typography/spacing/transition ladders (`BrandTypography`), real production component specimens and state matrices (`BrandComponents`, `BrandUILibrary`), accessibility patterns (`BrandAccessibility`), and the palette editor (`PalettePanel`)
- **How to use them**: when building a new component or page, find the nearest specimen and copy its classes and token usage — do not restyle from scratch. If a pattern you need has no specimen, that's a signal to check [VARIABLES_REFERENCE.md](./VARIABLES_REFERENCE.md) and the component CSS modules before inventing anything new
- **Verifying palette/theme behavior**: open `/brand` in `npm run dev`, use the PalettePanel (always visible there; pop-out makes it available on every page) to switch themes and palettes live — see [BRAND_GUIDELINES.md](./BRAND_GUIDELINES.md) § Alternative Palette System
- The rendered page at [globalstrategic.tech/brand](https://globalstrategic.tech/brand) is the shareable form of the same surface for reviewers without repo access

### How a specimen relates to what ships

Because you are told to copy from these specimens, a specimen that has drifted from production
teaches the wrong thing — which is worse than having no specimen. Every specimen must therefore use
one of three mechanisms, in this order of preference (BL-095):

1. **Render the real component.** Structurally cannot drift. The default, and what to do for anything
   renderable in isolation — `Breadcrumb`, `StatsBar`, `WireItem`, `TableOfContents`, `DeltaIcon`,
   `CompositeLogo`, `HeaderLogo`, `HeaderNavLinks`, `ThemeToggleButton`, `FooterLinks` and `CTABox`
   are live components on `/brand`, not copies of them. **A singleton shell does not exempt its
   contents**: when a component cannot render twice only because of its wrapper (`Header`'s
   `role="banner"` + sticky shell, `ThemeToggle`'s `#themeToggle` + bound script, `CTASection`'s
   `id="contact"`), extract the presentational inner into its own component — the wrapper keeps the
   id/script/landmark, the inner carries the markup and scoped styles, and `/brand` renders the inner
   (BL-095 AC-2). Demo-facing props on such inners follow one rule: passing the override keeps links
   in-page AND drops any analytics handler, so a specimen click never emits a real tracking event
   (see `HeaderNavLinks.astro`'s docblock for why the production branch is literal markup, not a
   data model).
2. **Converged replica — the FINAL classification for the portfolio family** (`ProjectModal`,
   `PortfolioHeader`, `StickyControls`, `FilterDrawer`), not a deferral: they own the portfolio
   filter/modal runtime (dozens of singleton ids and bound handlers), and no presentational inner
   exists to extract without surgery on working production code that would only improve
   documentation. Their end state is a converged replica + a source comment naming the file to keep
   in sync with. Guard rule: a parity test (in `tests/e2e/brand-page.test.ts` § "Site chrome
   specimens match production") compares computed styles against the live component **on the same
   page** when it renders there, never against literal values; when nothing renders the component on
   `/brand` — the portfolio family's case — a cross-page guard against a stable production route is
   the fallback where one exists (the `.project-card` guard is the model), and the sync comment is
   the floor.
3. **Plain CSS class, no component.** Most `.brutal-*` specimens: the class lives in
   `src/styles/components/*.css` with no `.astro` component behind it, so writing the markup *is*
   rendering the real thing. Nothing to converge on.

Two standing rulings from the BL-095 closeout (2026-08-08):

- **`/brand` embeds cards, never full `<section>`s.** `WhyClientsTrustUs` / `EngagementFlow` /
  `WhoWeSupport` / `WhatWeDo` are isolation-safe but each renders a whole section whose heading
  would pollute the `/brand` TOC (built from `h3[id]`), and the specimen slot wants one card. Their
  card specimens stay replicas under mechanism 2/3; if one measurably drifts, the remedy is a
  card-level presentational extraction (mechanism 1's pattern), not embedding the section.
- **No components are created solely so `/brand` can render them.** The service card, founder bio,
  hub gateway card and legal typography specimens replicate `pages/*.astro` markup; they convert
  opportunistically when those pages are componentized for their own reasons, never as standalone
  specimen work.

Two things that make replicas drift silently, both of which have happened:

- **Astro `<style>` is scoped**, so a production component's styles never reach a replica of it on
  another page. That is why replicas carry inline styles, and why they diverge unnoticed.
- **Read the media queries, not just the base rule.** `.footer-links` is `gap: 0.75rem` at the top of
  `FooterLinks.astro` and `gap: 2rem` under `@media (min-width: 768px)` — the desktop value is the one
  a desktop specimen had to match, and missing it is how the old replica drifted.

---

## Design System Architecture

Centralized CSS variable-based design system. Single source of truth in `variables.css`.

### Design Philosophy

- **Tech Brutalist**: Clean, minimal design with bold typography and deliberate spacing
- **Dark Mode Native**: All components work seamlessly in both themes via CSS variables
- **Accessibility First**: Keyboard navigation, focus indicators, screen reader support
- **Performance**: Minimal CSS, no external font dependencies

### Core Tokens (Summary)

| Category              | Examples                                                        | Count   |
| --------------------- | --------------------------------------------------------------- | ------- |
| Colors (brand + text) | `--color-primary`, `--bg-light`, `--text-primary`               | 35      |
| Primary opacity scale | `--color-primary-02` through `--color-primary-65`               | 19      |
| Component colors      | `--filter-chip-bg`, `--service-card-text`, `--footer-bg`        | 31      |
| Tool-domain colors    | `--hub-authority-blue`, `--dm-*`, `--icg-*`, `--techpar-*`      | 33      |
| Misc colors           | `--checkerboard-line`, `--theme-toggle-color`                   | 6       |
| Spacing               | `--spacing-xs` through `--spacing-3xl` + `--spacing-2_5xl`      | 8       |
| Gaps                  | `--gap-tight` through `--gap-extra-wide`                        | 4       |
| Typography            | `--font-family`, `--font-weight-*`, `--text-*`                  | 10      |
| Transitions           | `--transition-fast`, `--transition-normal`, `--transition-slow` | 3       |
| Shadows               | `--shadow-sm`, `--shadow-md`, `--shadow-lg`                     | 3       |
| **Total**             |                                                                 | **160** |

> Note: Dark theme variables use `light-dark()` in `:root` — only `color-scheme: dark` and 2 RGB triplets remain in the `html.dark-theme` block. 13 utility classes are defined across `variables.css`, `typography.css`, and `interactions.css`.

Full variable catalog: [VARIABLES_REFERENCE.md](./VARIABLES_REFERENCE.md)

---

## File Organization

```
src/styles/
├── variables.css           # Design tokens + utility classes (flex-center, text-label, etc.)
├── palettes.css            # Alternative color palette definitions (6 palettes, light + dark theme)
├── typography.css          # 11 semantic text utilities (.brutal-heading-*, .brutal-text-*, .brutal-label-*, .nav-link, .button-text-*)
├── interactions.css        # Interactive state patterns (.interactive, .link-interactive, .control-*, .focus-outline-*)
├── global.css              # Page layout, utilities, responsive rules — imports component modules below
└── components/             # Extracted component-specific styles (from global.css)
    ├── tool-ui.css          # Tool bench notes, action bars, methodology panels
    ├── tool-shell.css       # .brutal-tool-shell container and variants
    ├── skeleton.css         # Skeleton loading placeholders + @keyframes
    ├── buttons.css          # .cta-button + .brutal-btn variants
    ├── filter.css           # Filter chips, search input, filter drawer, brutal search
    ├── breadcrumb.css       # .brutal-breadcrumb
    ├── progress.css         # .brutal-progress-bar
    ├── tiles.css            # .brutal-stat-tile, .brutal-callout
    ├── table.css            # .brutal-bench-table
    ├── cards.css            # Option cards, trust cards, teaser cards, rec cards, attention cards, FAQ, gateway cards
    ├── form.css             # Input, choice buttons, tab bar, segmented controls, fields, sliders
    ├── sash.css             # .brutal-sash + .brutal-sash-corner (announcement sash)
    ├── portfolio.css        # .brutal-project-card
    └── map.css              # Legend, timeline, map controls, panel, reg cards
```

### Import Order

In stylesheets, always import in cascade order:

```css
@import './variables.css'; /* 1. Design tokens */
@import './typography.css'; /* 2. Typography utilities */
@import './interactions.css'; /* 3. Interaction utilities */
@import './palettes.css'; /* 4. Palette overrides (must follow variables.css) */
```

### CSS File Ownership

| File                         | Modify When                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `variables.css`              | Adding/updating design tokens or utility classes                              |
| `palettes.css`               | Adding/updating alternative color palette definitions                         |
| `typography.css`             | Adding reusable text styles                                                   |
| `interactions.css`           | Adding focus/hover/active patterns                                            |
| `global.css`                 | Page layout, utilities, responsive rules — imports `components/*.css` modules |
| `components/*.css`           | Individual component styles (extracted from global.css for maintainability)   |
| Component `.astro` `<style>` | Single-use component-specific styling                                         |

---

## Astro-Specific Patterns

### Scoped vs. Global Styles — Decision Tree

| Scenario                                            | Use                                                                           |
| --------------------------------------------------- | ----------------------------------------------------------------------------- |
| Design system tokens, resets, page layout           | Global CSS in `src/styles/`                                                   |
| Single-component visual styles                      | Scoped `<style>` in the `.astro` file                                         |
| **Styling an element a _child_ component renders**  | **Shared module in `src/styles/components/` — see below**                     |
| Styling dynamically injected HTML (`innerHTML`)     | `:global()` wrapper on the selector                                           |
| Dark theme color switching                          | `light-dark(light, dark)` inline — preferred over `:global(html.dark-theme)`  |
| Dark theme non-color overrides (opacity, etc.)      | `:global(html.dark-theme)` prefix — only for properties that aren't colors    |
| Global keyframes or animations                      | `src/styles/global.css`                                                       |

#### The scoped-rule / foreign-element trap

Astro scopes by **attribute**, not by nesting: a rule written in `Parent.astro` compiles to
`.thing[data-astro-cid-PARENT]`, and an element rendered by `<Child />` carries the **child's**
cid. So a parent styling a child's element produces a rule that matches nothing — no error, no
warning, no unstyled flash. It simply never applies, and the element quietly keeps whatever the
base rule gave it.

This is not the `/brand` replica drift documented above, and `:global()` is not the fix. It is
also **not** caught by an orphan-class scan, because the class does exist and does have rules —
they just carry a cid the element will never have.

**Worked example (BL-139).** `.portfolio-filter-drawer`'s entire mobile treatment — roughly 270
lines across `PortfolioHeader.astro` and `StickyControls.astro` — targeted an element rendered by
`FilterDrawer.astro`. None of it had ever applied: at 375px the drawer computed
`width: 350px; border-left: 2px` — the desktop side panel — on a route that had shipped a "mobile
drawer" for its whole life. Two comments reading _"Drawer styles moved to FilterDrawer.astro"_
recorded a move whose declarations were left behind.

**Remedy order** — put the rule where it *applies*, not where the markup used to be:

1. If the element is rendered by a child, and the styling is positional or shared, move it to a
   `src/styles/components/*.css` module. A plain stylesheet cannot fall into this trap at all.
2. If it genuinely belongs to one component, move it into **that** component's scoped block.
3. Reach for `:global()` only for markup that has no component to own it — the `innerHTML` case
   above.

**But first ask whether the rule should apply at all.** Dead CSS has usually been dead for a
long time, and nobody has been missing it. BL-139's rules turned out to be the wrong design once
rendered — full-bleed, the drawer covered the page header and the control that opened it — so
they were **deleted, not relocated**. Reviving a rule is a product decision wearing a bug's
clothing: render it before you assume the original author was right.

**Prove it with a rendered measurement, not a reading.** Authored CSS looks identical whether it
applies or not, so the only evidence that a relocation worked is a computed style from a real
browser. That is why the BL-139 tests assert `getComputedStyle` values at each breakpoint.

**Check the browserslist floor before reaching for a newer CSS feature.** `package.json` declares
`Safari >= 14`, and LightningCSS down-levels *some* constructs (`light-dark()`) while emitting
others verbatim with no fallback — viewport units among them. An unsupported unit is therefore
dropped silently at runtime rather than polyfilled at build time, taking its whole declaration
with it.

### `class:list` — Conditional Classes

Use Astro's `class:list` directive for conditionally applying classes. Preferred over template literal concatenation for new code.

```astro
<!-- Preferred -->
<div class:list={['card', { active: isActive, highlighted: score > 90 }]}>
  <!-- Avoid in new code -->
  <div class={`card ${isActive ? 'active' : ''}`}></div>
</div>
```

### `define:vars` — JS-to-CSS Bridging

Use `define:vars` to pass frontmatter variables into scoped `<style>` blocks as CSS custom properties. Preferred over inline `style` attributes for dynamic values.

```astro
---
const accentColor = getThemeColor(category);
---

<style define:vars={{ accentColor }}>
  .card {
    border-left: 3px solid var(--accentColor);
  }
</style>
```

**Limitation**: `define:vars` makes the style tag inline (not bundled). Use sparingly for truly dynamic values, not for values that could be CSS variables.

### When `:global()` Is Necessary

`:global()` breaks Astro's scoping. Only use it when:

1. **Styling dynamically injected content** — Elements created via `innerHTML` in `<script>` blocks don't have Astro's scoping attributes:

   ```css
   :global(.question-card) {
     padding: var(--spacing-md);
   }
   ```

2. **Parent state selectors** — When a component's appearance depends on a class on `<html>` or a parent element:
   ```css
   :global(html.dark-theme) .my-card {
     background: var(--bg-dark-secondary);
   }
   ```

**Prefer `light-dark()` over `:global(html.dark-theme)`** for color properties. Use `light-dark(light-value, dark-value)` inline or define a CSS variable with `light-dark()` in `variables.css`. Reserve `:global(html.dark-theme)` only for non-color properties (opacity, display, backdrop-filter).

### CSS Linting

The project uses [Stylelint](https://stylelint.io/) to enforce CSS conventions:

```bash
npm run lint:css    # Lint src/styles/*.css
```

Rules enforce: no duplicate selectors, no duplicate properties, no named colors. See `.stylelintrc.json` for full configuration.

---

## Component Styling

### Color Selection Quick-Reference

When choosing a color, follow this priority: **Primary teal → Secondary amber → Semantic → Neutrals → Domain**. See [BRAND_GUIDELINES.md — Color Usage Hierarchy](./BRAND_GUIDELINES.md#color-usage-hierarchy) for the full table and rules.

- Interactive elements / brand accents → `--color-primary`
- Status indicators (success/warning/error/info) → `--color-success`, `--color-warning`, `--color-error`, `--color-info`
- Body content, backgrounds, borders → `--text-*`, `--bg-*`, `--border-*`
- Tool-specific only → `--hub-*`, `--dm-*`, `--icg-*`, `--techpar-*`, `--regmap-*`

### Scoped styles (single-use components)

```astro
<div class="custom-card">
  <h2>{title}</h2>
  <slot />
</div>

<style>
  .custom-card {
    padding: var(--spacing-lg);
    background: var(--bg-light-alt);
    border: 2px solid var(--color-primary);
  }

  .custom-card h2 {
    font-size: var(--text-lg);
    color: var(--text-primary);
    margin-bottom: var(--spacing-md);
  }
</style>
```

### Shared styles (reusable components)

Create a stylesheet in `src/styles/`, import it in the component:

```astro
---
import '../../styles/my-component.css';
---
```

### Card grids: the grid owns the columns, the card owns itself

A card must **not** set `max-width` / `margin: 0 auto` on itself. That is page positioning
living on a component, and it silently defeats any layout the card is later dropped into —
`.brutal-gateway-card` carried `max-width: 600px` and so rendered as one centred column in a
1504px container, wasting 60% of every row on both hub gateway indexes (BL-105).

**Exception — centered reading measures.** A prose/CTA box that IS a single centered reading
measure (`.cta-box` in `CTABox.astro`) legitimately carries `max-width` + `margin: 0 auto`:
it is never dropped into a grid, and the cap is its typography, not page positioning. The
ban is on grid *cards* positioning themselves.

The established pairing — `.grid` (`PortfolioGrid.astro`) with `.project-card` (`cards.css`),
and `.brutal-gateway-grid` / `.brutal-gateway-card` (both `cards.css`):

```css
.my-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(<floor>, 1fr));
  gap: var(--spacing-…);
}
@media (max-width: 768px) {
  .my-grid {
    grid-template-columns: 1fr;
  }
}
```

`auto-fill` with a floor beats fixed column counts: `.container` is a flat `max-width: 1600px`
with no responsive override, so `repeat(3, 1fr)` yields 368px cards at a 1280 viewport and
283px at 1025 — narrower than the same card on a phone. The 768px `1fr` override is also what
stops the `minmax()` floor forcing horizontal scroll on small screens; do not remove it.
And `auto-fill`, not `auto-fit`: `auto-fit` collapses empty tracks, so a sparsely-populated
grid (the `/brand` specimens sit alone in theirs) stretches its lone card across the whole
row and documents a width nothing renders. The specimen documents the grid's *behaviour* —
equal-height rows, bottom-aligned CTA, a surviving empty track — never a width; `/brand`'s
content column is narrower than `.container` by design, so no number there is "the" card width.

**Two traps when the cards become flex children for equal-height rows:**

- Bottom-align the CTA with `flex-grow: 1` on the element above it, **not** `margin-top: auto`
  on the CTA. The tallest card in each row resolves an auto margin to 0 and silently loses the
  gap above its CTA.
- `inline-block` children (CTAs, badges) are blockified by flex and stretch to the full card
  width under the default `align-items: stretch`. Give those items `align-self: center` — not
  `align-items: center` on the card, which shrink-wraps the content list too.

And one trap in the **single-column fallback**, which is where BL-105 nearly shipped a regression:

- Centring a capped card with `margin-inline: auto` needs an explicit `width: 100%` alongside it.
  Auto inline margins on a **grid item** absorb the free space before alignment runs, which
  disables the default `justify-self: stretch` — the card then sizes shrink-to-fit instead of
  filling the track and being clamped by `max-width`. It only shows between the cap and the
  breakpoint (600–768px here), so a check at 480px sees nothing wrong. Assert **uniformity**
  across all cards, not one card's upper bound.

### Variable Usage Priority

1. **Design system variables** for colors, spacing, typography, transitions
2. **Typography utility classes** (`.brutal-heading-lg`, `.brutal-text-base`, `.brutal-label`) for text
3. **Interaction utility classes** (`.interactive`, `.focus-outline`) for hover/focus states

### Available Utility Classes

**From `variables.css`:**

- `.flex-center` — centered flexbox
- `.flex-between` — space-between flexbox
- `.text-uppercase` — uppercase + letter-spacing
- `.text-label` — label styling (xs, bold, uppercase, muted)
- `.interactive-element` — transition + primary color on hover
- `.interactive-focus` — 2px primary outline

**From `interactions.css`:**

- `.interactive` — transition + primary hover + focus-visible outline
- `.link-interactive` — link with underline animation
- `.control-hover` / `.control-active` — button state classes
- `.accent-light-bg` / `.accent-light-bg-hover` — accent backgrounds
- `.focus-outline` / `.focus-outline-sm` — focus ring utilities
- `.delta-chevron` — collapse/expand toggle indicator using the brand delta triangle

**From `global.css`:**

- `.sr-only` — screen reader only (visually hidden)

### Brand Delta Icon

The GST delta icon is available in two forms:

**1. Component (preferred): `DeltaIcon.astro`**

```astro
---
import DeltaIcon from '../components/DeltaIcon.astro';
---

<DeltaIcon size={14} class="bullet-icon" />
```

Renders an inline SVG with `stroke="currentColor"`, so the icon inherits color from its parent CSS. Responds automatically to palette switching and dark theme. Used site-wide for bullet points (`.bullet-icon`), the header logo (`.delta-icon`), theme toggle, chevron indicators, and TOC markers.

**2. CSS mask-image (for pseudo-elements only)**

```css
.my-element::before {
  content: '';
  display: inline-block;
  width: 10px;
  height: 10px;
  background-color: var(--color-primary);
  mask-image: url('/images/logo/gst-delta-icon-teal-stroke-thick.svg');
  mask-size: contain;
  mask-repeat: no-repeat;
  -webkit-mask-image: url('/images/logo/gst-delta-icon-teal-stroke-thick.svg');
  -webkit-mask-size: contain;
  -webkit-mask-repeat: no-repeat;
}
```

Use this pattern only for `::before`/`::after` pseudo-elements where an Astro component can't be used. Inherits color via `background-color`.

**Guidelines:**

- Always prefer `DeltaIcon.astro` over `<img>` tags — `<img>` cannot inherit CSS colors
- `.bullet-icon` and `.delta-icon` classes include `color: var(--color-primary)` for palette awareness
- The static SVG file (`public/images/logo/gst-delta-icon-teal-stroke-thick.svg`) has hardcoded teal — keep it for favicon, RSS, and external contexts only

---

## Dark Theme Implementation

### How It Works

The theme system uses CSS `light-dark()` function — a single declaration handles both themes. LightningCSS compiles `light-dark()` to `--lightningcss-light`/`--lightningcss-dark` variable tricks for full browser support. The `html.dark-theme` class sets `color-scheme: dark` which triggers `light-dark()` to resolve to the second (dark) value.

```css
/* variables.css — single declaration, both themes */
:root {
  color-scheme: light;
  --filter-chip-bg: light-dark(rgba(26, 26, 26, 0.05), rgba(5, 205, 153, 0.1));
}

html.dark-theme {
  color-scheme: dark;
}

/* Component just references the variable — switches automatically */
.filter-chip {
  background: var(--filter-chip-bg);
}
```

### Preferred: `light-dark()` (for all color properties)

Use `light-dark(light-value, dark-value)` directly in base rules. Works for `color`, `background`, `border-color`, `fill`, `stroke`, `box-shadow` (color parts), and any property accepting a `<color>` value.

```css
/* In variables.css */
--my-bg: light-dark(#ffffff, #1a1a1a);

/* In scoped component styles */
.my-card {
  border-color: light-dark(var(--border-light), var(--border-dark-default));
}
```

### Fallback: `html.dark-theme` selector (non-color properties only)

`light-dark()` only works for `<color>` values. For non-color properties (`opacity`, `backdrop-filter`, `display`, `font-weight`, `transform`), use the `:global(html.dark-theme)` selector:

```css
/* Cannot use light-dark() for opacity */
:global(html.dark-theme) .overlay {
  opacity: 0.8;
}
```

### Adding Dark Theme Support to New Components

1. Use existing variables wherever possible — most already auto-switch via `light-dark()`:

| Use Case        | Variable                                                    |
| --------------- | ----------------------------------------------------------- |
| Primary text    | `--text-primary` (auto-switches via `light-dark()`)         |
| Secondary text  | `--text-secondary` (auto-switches)                          |
| Muted text      | `--text-muted` (auto-switches)                              |
| Page background | `--bg-light` (auto-switches: `#ffffff` / `#0a0a0a`)        |
| Alt background  | `--bg-light-alt` (auto-switches: `#f5f5f5` / `#141414`)    |
| Primary accent  | `--color-primary` (same in both themes)                     |
| Borders         | `--border-light` (light only) or use `light-dark()` inline  |
| Dark borders    | `--border-dark-default` (dark-specific constant)            |

2. If you need a new theme-switching value, use `light-dark()` in `variables.css`:
   ```css
   :root {
     --my-component-bg: light-dark(#ffffff, #1a1a1a);
   }
   ```
3. For inline theme-switching in scoped styles (no new variable needed):
   ```css
   .my-card {
     background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
   }
   ```
4. Toggle the theme in the browser and verify all elements are visible

---

## Responsive Design

### Breakpoints

The project uses a **desktop-first** approach with `max-width` breakpoints:

```css
/* Desktop (default) — no media query needed */

@media (max-width: 768px) {
  /* Tablet and below */
}

@media (max-width: 480px) {
  /* Mobile */
}
```

Additional breakpoints used sparingly:

- `@media (min-width: 768px)` — desktop-only styles (used in some components)
- `@media (min-width: 480px) and (max-width: 767px)` — tablet-only range
- `@media print` — print stylesheet
- `540px` / `512px` — the announcement sash only ([sash.css](../../styles/components/sash.css) + the reserve in [HeaderNavLinks.astro](../../components/HeaderNavLinks.astro)). These are not general breakpoints and nothing else should adopt them: a sash tier switches at the width where its **nav reserve fits**, measured on all three engines, and below 512px nothing fits, so the sash hides and the reserve goes to 0. The two files must switch at the same three numbers or a sash page gains a horizontal scrollbar.

### Touch Targets

**Two floors, and the difference is a ruling, not a preference.** The guarded component families clear **44×44px** (WCAG 2.5.5, AAA) via `--touch-target-min`; everywhere else the bar is **24×24px** (2.5.8, AA) via `--touch-target-min-aa`. Never a raw `44px` or `24px` — see [BRAND_GUIDELINES § Accessibility](./BRAND_GUIDELINES.md#accessibility) for which controls sit where and why the AAA sweep was scoped back. The AA floor is enforced by axe's `target-size` on every route `accessibility.test.ts` scans, so dropping below it fails CI.

```css
.my-control {
  min-height: var(--touch-target-min);
}
```

It is a **floor, not a fixed size**. Components may sit above it where the design calls for it — the ICG wizard nav uses 48px, the diligence-machine document action uses 52px — and those stay as they are. What must never happen is a page-local rule resolving *below* it: `.brutal-choice-btn--unsure` (36px) and a techpar mobile action bar (40px) both did exactly that, silently out-specifying the base rule. [touch-target-floor.test.ts](../../../tests/integration/touch-target-floor.test.ts) fails on any `min-height`, `min-width`, `height` or `width` resolving under the token on a guarded selector, including inside Astro `<style>` blocks. It scans declarations that exist, so it catches a bad override — it cannot tell you a component has no floor at all, which is the shape that let `.brutal-btn` sit at 33px in the first place. That gap is covered by the rendered-geometry sweep in [brand-page.test.ts](../../../tests/e2e/brand-page.test.ts) § Touch targets.

Use **`min-height`, not `min-width`**, unless the control is a fixed-size icon button: a `min-width` sweep clips `.brutal-segmented` (`max-width: 320px; overflow: hidden`) and stops the radar pills wrapping.

Beware `display` overrides on a button that inherits the floor: swapping `inline-flex` for `inline-block` drops `align-items: center`, leaving the label top-aligned above dead space.

Canonical statement and the documented exception live in [BRAND_GUIDELINES.md § Accessibility](./BRAND_GUIDELINES.md).

### Z-Index Scale

Use the canonical `--z-*` tokens from [variables.css](../../styles/variables.css) — **never raw numeric z-index values** (the token block's own comment mandates this). Tool-internal layers (map annotations, chart overlays) may use direct values for contextual reasons; prefer tokens otherwise.

| Token                  | Value   | Usage                                        |
| ---------------------- | ------- | -------------------------------------------- |
| `--z-negative`         | `-1`    | `body::before` background grid               |
| `--z-base`             | `1`     | Normal content stacking                      |
| `--z-raised`           | `5`     | Tool content layers (maps, charts)           |
| `--z-sticky`           | `10`    | Sticky headers, dropdowns anchored to content |
| `--z-dropdown`         | `20`    | Floating menus, dropdowns                    |
| `--z-palette-panel`    | `30`    | Palette panel (brand.astro)                  |
| `--z-overlay`          | `50`    | General overlays                             |
| `--z-compliance-panel` | `60`    | Regulatory-map compliance panel              |
| `--z-modal`            | `1000`  | Modal base                                   |
| `--z-modal-overlay`    | `1001`  | Modal backdrop                               |
| `--z-skip-nav`         | `10000` | Skip-nav link (top of page)                  |

---

## Frosted Glass

Seven component families carry the treatment **by default** — `.brutal-btn`,
`.brutal-choice-btn`, `.brutal-search`, `.brutal-segmented`, `.brutal-option-card`,
`.brutal-tool-shell`, and `.tool-tab-bar`. (`.tool-action-bar--frosted` is a deliberate
opt-in variant, not a default.) Don't re-apply a `.brutal-frosted*` utility on top of
any of them; it double-blurs.

**One pane owns the glass.** A frosted surface nested inside another frosted surface
blurs an already-blurred backdrop, so the child stays transparent and the container
carries the treatment. Two consequences of that rule, both live in the codebase: on
`.brutal-segmented` the frost sits on the **container** and the segments stay
transparent — with `--active` keeping a **solid** fill, because that fill is the only
signal saying which segment is selected and a translucent wash over the container's own
glass would leave it barely distinguishable from its inactive neighbour; and on the
`/hub/mcp/docs/` workflow cards the frost is on `.mdoc-flow`, not on the `.mdoc-step`
links inside it.

All `.brutal-btn` buttons include a frosted-glass aesthetic by default:

```css
.brutal-btn {
  backdrop-filter: blur(2px);
  box-shadow:
    inset 0 1px 0 var(--frost-highlight),
    /* wet-glass highlight */ 0 0 0 1px var(--frost-edge); /* hairline edge */
}
```

The `--frost-highlight` / `--frost-edge` pair carries the theme-switched values (see [VARIABLES_REFERENCE.md](./VARIABLES_REFERENCE.md)); use the tokens rather than re-typing the rgba pair on each frosted surface.

> **Do NOT manually write `-webkit-backdrop-filter`** (or any other vendor-prefixed property).
> LightningCSS, wired to the project's [browserslist config](../../../package.json) via
> [astro.config.mjs](../../../astro.config.mjs), automatically adds vendor prefixes based on
> the browser target set at build time. Manually writing both forms caused a production
> regression in Phase 3 where LightningCSS deduplicated the pair and shipped only the
> webkit version, breaking frosted glass for Firefox users. See
> [DEVELOPER_TOOLING.md § Browser support](../development/DEVELOPER_TOOLING.md) for details.

- **Primary buttons** use semi-transparent `rgba(5, 205, 153, 0.15)` background instead of solid teal
- **Secondary buttons** use `rgba(0, 0, 0, 0.02)` tint instead of fully transparent
- Dark theme adjusts opacity and uses `--border-dark-subtle` for the inset highlight

Additional frosted-glass utilities in `global.css`:

| Class                        | Blur               | Use Case                          |
| ---------------------------- | ------------------ | --------------------------------- |
| `.brutal-frosted`            | 3px                | Standard containers, action bars  |
| `.brutal-frosted--heavy`     | 6px                | Drawers, sticky bars over content |
| `.brutal-frosted--blur-only` | 1.5px              | Subtle wet-glass sheen            |
| `.brutal-frosted--overlay`   | 6px + 92% opacity  | Modal/panel overlays              |

---

## Hub Tool Patterns

Recurring patterns used across hub tools (ICG, TechPar, Tech Debt Calculator, Diligence Machine).

### Print Stylesheets

All hub tools include a `@media print` block in their scoped styles with a consistent structure:

```css
@media print {
  /* Hide interactive elements */
  .site-header,
  footer,
  .actions,
  [data-view='landing'],
  [data-view='wizard'] {
    display: none !important;
  }

  /* Show results */
  [data-view='results'] {
    display: block !important;
  }

  /* Prevent card breaks */
  .card {
    break-inside: avoid;
    border: 1px solid #ddd;
  }

  /* Auto-expand collapsibles */
  .collapsed .desc {
    max-height: none !important;
    opacity: 1 !important;
  }

  /* Shell goes full-width */
  .brutal-tool-shell {
    max-width: 100%;
  }
}
```

**Convention**: Hardcoded colors (e.g., `#ddd`, `#333`) are acceptable in print styles since print always renders on white paper. CSS variables that resolve to dark theme values would produce invisible content in print.

### `:global()` for Dynamically Injected Content

Hub tools render content via `innerHTML` at runtime (questions, recommendations, chart elements). Astro scopes `<style>` selectors to statically-rendered elements, so dynamically injected HTML requires `:global()`:

```css
/* Static element — scoped selector works */
.wizard-content {
  padding: var(--spacing-xl) var(--spacing-lg);
}

/* Dynamic element — must use :global() */
:global(.question-card) {
  padding: var(--spacing-md) var(--spacing-lg);
  border: 1px solid var(--border-light);
}

/* Dark theme override for dynamic element */
:global(html.dark-theme .question-card) {
  border-color: rgba(5, 205, 153, 0.12);
}
```

**When to use**: Any CSS targeting elements created via `innerHTML`, `insertAdjacentHTML`, or similar DOM APIs in a `<script>` block.

### Tool Shell Container

Hub tools use the standardized `.brutal-tool-shell` class defined in `global.css`. This provides a centered, themed container with consistent border-radius, background, and responsive padding.

```css
/* Base: 700px centered container */
.brutal-tool-shell { max-width: 700px; margin: 0 auto; ... }

/* Width modifiers */
.brutal-tool-shell--narrow   { max-width: 660px; }  /* ICG */
.brutal-tool-shell--wide     { max-width: 760px; }  /* Tech Debt Calculator */
.brutal-tool-shell--document { max-width: 800px; }  /* Diligence Machine */
.brutal-tool-shell--fluid    { max-width: 100%; }   /* TechPar */
```

**Content wrapper**: Use `.brutal-tool-shell__content` inside the shell for automatic responsive padding:

```css
.brutal-tool-shell__content {
  padding: var(--spacing-xl) var(--spacing-lg); /* Desktop */
}
/* Automatically reduces to var(--spacing-lg) var(--spacing-md) at 480px */
```

**HTML template**:

```html
<section class="tool-section">
  <div class="container">
    <HubHeader title="..." subtitle="..." />
    <div class="brutal-tool-shell brutal-tool-shell--narrow">
      <div class="brutal-tool-shell__content">
        <!-- Tool-specific content -->
      </div>
    </div>
  </div>
</section>
```

**Print**: Shell expands to full width with no border or radius.

### Skeleton Loading Placeholders

For components that load content asynchronously, use the skeleton loading pattern. The `@keyframes pulse` animation and the classes below are defined in [`src/styles/components/skeleton.css`](../../styles/components/skeleton.css).

**Canonical reference**: the live specimens on [`/brand`](../../pages/brand.astro) — see `src/components/brand/BrandComponents.astro`, which is the in-repo control example for this pattern.

> Do **not** reach for a skeleton to defer a page's primary content **on a page you want indexed**. Crawlers run JS on a deferred queue and judge the shell, so the page gets rated on whatever the skeleton is standing in for. `/hub/radar` is the exception that proves the rule rather than a violation of it: its feed _is_ deferred behind a skeleton, and that is fine precisely because the page is `noindex` — a rotating feed with no per-item permalinks is not an indexable page type. See [ADR-0012](../adr/0012-rotating-feeds-are-noindex.md) and [RADAR.md § Why the feed is a server island](../hub/RADAR.md). If you are deferring primary content on an indexable page, you have the wrong tool.

**Global classes** — two families, and they are not interchangeable.

Brutalist (current design system; what new work should use):

| Class                      | Description                                   |
| -------------------------- | --------------------------------------------- |
| `.brutal-skeleton-bar`     | Rectangular placeholder bar (0.875rem height) |
| `.brutal-skeleton-bar--sm` | Smaller bar variant (0.625rem height)         |
| `.brutal-skeleton-dot`     | Square placeholder (8px, `border-radius: 0`)  |

These are outlined, not filled: `background: transparent` with a `1px solid var(--color-primary)` border, animated with the stepped `brutal-blink`. `RadarFeedSkeleton.astro` is the in-repo consumer.

Legacy (soft/filled, retained for existing callers):

| Class               | Description                                   |
| ------------------- | --------------------------------------------- |
| `.skeleton-bar`     | Rectangular placeholder bar (0.875rem height) |
| `.skeleton-bar--sm` | Smaller bar variant (0.625rem height)         |
| `.skeleton-dot`     | Circular placeholder (8px)                    |

These use `var(--accent-light-bg-hover)` for background color (auto-switches in dark theme) and the smooth `pulse` animation.

```html
<!-- Example: text block skeleton -->
<div class="skeleton-bar" style="width: 80%"></div>
<div class="skeleton-bar skeleton-bar--sm" style="width: 40%; animation-delay: 0.3s"></div>
```

**Convention**:

- Vary bar widths via inline `style` to suggest natural content variation
- Add `aria-hidden="true"` to the skeleton container
- Stagger animation delays on consecutive elements (e.g., `animation-delay: 0.3s`)

**Content swap pattern**:

1. Render the skeleton as the default visible state
2. Set `aria-hidden="true"` on the skeleton wrapper so screen readers skip it
3. When real content loads (via client-side JS), hide the skeleton and show the content
4. Example: `skeletonEl.style.display = 'none'; contentEl.style.display = 'block';`

**Micro-spacing exception**: Skeleton element heights (`0.875rem`, `0.625rem`, `0.375rem`) approximate text line heights and are not layout spacing — these are acceptable as hardcoded rem values since the spacing scale is not designed for visual approximation of text dimensions.

### Delta Chevron — Collapse/Expand Indicator

The `.delta-chevron` utility (defined in `interactions.css`) provides a collapse/expand toggle indicator using the brand delta triangle SVG. It points down when expanded and up when collapsed, rotating via CSS transition.

**HTML:**

```html
<svg class="delta-chevron" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path
    d="M32 12 L52 52 L12 52 Z"
    fill="none"
    stroke="currentColor"
    stroke-width="6"
    stroke-linejoin="miter"
  />
</svg>
```

**Behavior:**

- Default state (expanded): triangle points down (`rotate(180deg)`), teal (`--color-primary`)
- When a parent has `.is-collapsed`: triangle points up (`rotate(0deg)`), muted color
- Color transitions smoothly between states via `var(--transition-fast)`
- Dark theme collapsed color handled automatically via `var(--text-dark-muted)`

**Convention:**

- Place the SVG as the last child inside the collapsible header/title row
- Toggle `.is-collapsed` on the card/container element, not the chevron itself
- In print styles, hide with `:global(.delta-chevron) { display: none !important; }`

**Current usage**: ICG recommendations (`infrastructure-cost-governance`), Diligence Machine attention cards and questions (`diligence-machine`)

---

## Anti-Patterns

### 1. Hardcoded Colors

```css
/* BAD */
.text {
  color: #1a1a1a;
}
/* GOOD */
.text {
  color: var(--text-primary);
}
```

Colors must use CSS variables so dark theme works automatically.

> **This is mechanically enforced.** Since July 28, 2026 a hardcoded color is a stylelint **error** — it fails `npm run lint:css`, the pre-commit hook, and CI. The rule covers `/color$/`, `fill`, `stroke`, `box-shadow`, `text-shadow`, and the color slot of `border`/`background`/`outline` shorthands. Any value that references a token passes, including `light-dark(var(--a), var(--b))`, `color-mix(in srgb, var(--x) 12%, transparent)` and `rgba(var(--rgb), .5)`. Mechanics: [DEVELOPER_TOOLING.md § stylelint configuration notes](../development/DEVELOPER_TOOLING.md).
>
> **Need a tint that has no token?** Reach for `color-mix(in srgb, var(--color-success) 12%, transparent)` before minting one — it stays correct across themes and all six palettes, which a frozen `rgba(46, 139, 87, 0.12)` does not. For neutral washes use the `--surface-*-bg` family; for modal/drawer backdrops use `--scrim-15…60`; for frosted edges use `--frost-highlight`/`--frost-edge`.
>
> **Two documented exceptions**, both legal because custom-property declarations are never checked by the rule:
>
> 1. **`@media print` blocks** keep literal `#000`/`#fff`/`#ccc` — paper has no theme. Wrap the block in `/* stylelint-disable scale-unlimited/declaration-strict-value -- print output is deliberately literal */ … /* stylelint-enable … */` with that justification.
> 2. **Channel-specific affordances** — the R/G/B slider controls in `SwatchControlStyles.astro` must stay red/green/blue regardless of palette. Declare such colors once as component-local custom properties; never repeat the literal inline.

### 1b. Off-Scale Font Sizes

```css
/* BAD */
.label {
  font-size: 13px;
}
/* GOOD */
.label {
  font-size: var(--text-sm);
}
```

Font sizes come from the `--text-*` scale. This is enforced at **warning** severity (not error) while 150 pre-existing off-scale literals are worked through — see [STYLES_REMEDIATION_ROADMAP.md § 14](./STYLES_REMEDIATION_ROADMAP.md) and BL-094. **New code should produce no new warnings.** Do not bulk-snap existing off-scale values to the nearest token: that changes rendered type, and the repo has no visual-regression coverage to catch a layout break.

### 2. Duplicate Dark Theme Selectors

```css
/* BAD — 50+ manual overrides */
html.dark-theme .button {
  color: #05cd99;
}
html.dark-theme .link {
  color: #f5f5f5;
}

/* GOOD — override the variable, components inherit */
html.dark-theme {
  --button-color: #05cd99;
  --text-color: #f5f5f5;
}
```

### 3. Hardcoded Spacing

```css
/* BAD */
.card {
  padding: 14px;
  margin: 23px;
}
/* GOOD */
.card {
  padding: var(--spacing-lg);
  margin: var(--spacing-md);
}
```

**Micro-spacing exception**: Values below `--spacing-xs` (4px) are acceptable for badge padding, border-radius fine-tuning, and optical alignment. Use `1px` or `2px` directly since the spacing scale does not cover sub-4px values. Example: `padding: 2px var(--spacing-sm)` is acceptable for compact badges.

### 4. Hardcoded Font Sizes

```css
/* BAD */
.title {
  font-size: 32px;
}
/* GOOD */
<h1 class="brutal-heading-lg">Title</h1>
/* or */   .title {
  font-size: var(--text-xl);
}
```

### 5. Inline Styles and `!important`

Defeats the cascade. Use component or utility classes instead.

### 6. Hardcoded Transitions

```css
/* BAD */
.card {
  transition: all 0.3s;
}
/* GOOD */
.card {
  transition: all var(--transition-normal);
}
```

### 7. Creating Unnecessary Variables

Check existing variables first. Don't create `--my-special-bg: #f5f5f5` when `--bg-light-alt` already exists.

### 8. Unused CSS

Delete dead styles. Version control has the history.

### 9. Hardcoded Primary Opacity

```css
/* BAD */
.tag {
  background: rgba(5, 205, 153, 0.1);
}
/* GOOD */
.tag {
  background: var(--color-primary-10);
}
/* BEST */
.tag {
  background: var(--accent-dark-bg);
} /* when a semantic alias exists */
```

Use `--color-primary-XX` opacity tokens (see [VARIABLES_REFERENCE — Opacity Scale](./VARIABLES_REFERENCE.md#primary-color-opacity-scale)). Prefer the semantic alias (`--accent-*-bg`, `--accent-border-*`) when one matches your intent.

### 10. Hardcoded Dark-Theme Borders

```css
/* BAD */
html.dark-theme .card {
  border: 1px solid rgba(255, 255, 255, 0.15);
}
/* GOOD */
html.dark-theme .card {
  border: 1px solid var(--border-dark-default);
}
```

Three tiers: `--border-dark-subtle` (0.10), `--border-dark-default` (0.15), `--border-dark-prominent` (0.20).

---

## New Component Checklist

- [ ] All colors use CSS variables (never hardcoded hex/rgba)
- [ ] All spacing uses `--spacing-*` or `--gap-*` variables
- [ ] Typography uses utility classes or `--text-*` / `--font-weight-*` variables
- [ ] Transitions use `--transition-*` variables
- [ ] If new component-specific variables needed: added to both `:root` and `html.dark-theme` in `variables.css`
- [ ] Tested in light theme
- [ ] Tested in dark theme
- [ ] Tested in all 6 palettes (PalettePanel pop-out — see [BRAND_GUIDELINES.md](./BRAND_GUIDELINES.md) § Alternative Palette System)
- [ ] Responsive at 768px breakpoint
- [ ] Responsive at 480px breakpoint
- [ ] Focus states visible in both themes
- [ ] Run `npm run test:run` — no regressions

---

## Related Documentation

- **[In-repo Control Examples](#in-repo-control-examples)** (top of this guide) — `src/pages/brand.astro` + `src/components/brand/`, the living specimens to copy from when building
- **[/brand](https://globalstrategic.tech/brand)** — the same surface rendered live; share this URL with designers, reviewers, or integration partners who don't have repo access
- [BRAND_GUIDELINES.md](./BRAND_GUIDELINES.md) — Brand color palette, usage rules, and asset guidelines
- [VARIABLES_REFERENCE.md](./VARIABLES_REFERENCE.md) — Complete design token catalog
- [TYPOGRAPHY_REFERENCE.md](./TYPOGRAPHY_REFERENCE.md) — Typography utility classes
- [STYLES_REMEDIATION_ROADMAP.md](./STYLES_REMEDIATION_ROADMAP.md) — Tracked initiatives for closing convention gaps
- [CLAUDE_DESIGN_SYNC.md](../development/CLAUDE_DESIGN_SYNC.md) — This design system is published to claude.ai/design. **Renaming a `.brutal-*` class or a token requires a re-sync** — the published copy names classes explicitly and goes stale silently
- [Development Backlog](../development/BACKLOG.md) — All open development initiatives

---

**Last Updated**: July 28, 2026 (in-repo control examples section; z-index token scale; frosted `--heavy` blur corrected to match code; 6-palette checklist item)
