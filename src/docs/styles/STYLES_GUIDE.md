# CSS Styling Guide

Conventions, best practices, and patterns for all CSS work on the GST Website.

---

## Table of Contents

1. [Quick Start by Task](#quick-start-by-task)
2. [Design System Architecture](#design-system-architecture)
3. [File Organization](#file-organization)
4. [Component Styling](#component-styling)
5. [Brand Assets in CSS](#brand-assets-in-css)
6. [Dark Theme Implementation](#dark-theme-implementation)
7. [Responsive Design](#responsive-design)
8. [Hub Tool Patterns](#hub-tool-patterns)
9. [Anti-Patterns](#anti-patterns)
10. [New Component Checklist](#new-component-checklist)

---

## Quick Start by Task

**Adding a new component:**
1. Use CSS variables for all colors, spacing, and typography — see [VARIABLES_REFERENCE.md](./VARIABLES_REFERENCE.md)
2. Use typography utility classes — see [TYPOGRAPHY_REFERENCE.md](./TYPOGRAPHY_REFERENCE.md)
3. Test in both light and dark themes
4. Check responsive behavior at 768px and 480px breakpoints

**Styling text:** Pick a utility class from [TYPOGRAPHY_REFERENCE.md](./TYPOGRAPHY_REFERENCE.md) (`.brutal-heading-lg`, `.brutal-text-base`, `.brutal-label`, etc.). Dark theme colors switch automatically.

**Need a specific color/spacing value:** Look it up in [VARIABLES_REFERENCE.md](./VARIABLES_REFERENCE.md). Use the variable, never a hardcoded value.

**Dark theme broken:** You almost certainly hardcoded a color. Replace it with `var(--variable-name)`.

---

## Design System Architecture

Centralized CSS variable-based design system. Single source of truth in `variables.css`.

### Design Philosophy

- **Tech Brutalist**: Clean, minimal design with bold typography and deliberate spacing
- **Dark Mode Native**: All components work seamlessly in both themes via CSS variables
- **Accessibility First**: Keyboard navigation, focus indicators, screen reader support
- **Performance**: Minimal CSS, no external font dependencies

### Core Tokens (Summary)

| Category | Examples | Count |
|----------|---------|-------|
| Colors (brand + text) | `--color-primary`, `--bg-light`, `--text-primary` | 35 |
| Primary opacity scale | `--color-primary-02` through `--color-primary-65` | 19 |
| Component colors | `--filter-chip-bg`, `--service-card-text`, `--footer-bg` | 31 |
| Tool-domain colors | `--hub-authority-blue`, `--dm-*`, `--icg-*`, `--techpar-*` | 33 |
| Misc colors | `--checkerboard-line`, `--theme-toggle-color` | 6 |
| Spacing | `--spacing-xs` through `--spacing-3xl` + `--spacing-2_5xl` | 8 |
| Gaps | `--gap-tight` through `--gap-extra-wide` | 4 |
| Typography | `--font-family`, `--font-weight-*`, `--text-*` | 10 |
| Transitions | `--transition-fast`, `--transition-normal`, `--transition-slow` | 3 |
| Shadows | `--shadow-sm`, `--shadow-md`, `--shadow-lg` | 3 |
| **Total** | | **153** |

> Note: Dark theme defines 85 variable overrides (including `--border-dark-subtle/default/prominent`), not new variables. 13 utility classes are defined across `variables.css`, `typography.css`, and `interactions.css`.

Full variable catalog: [VARIABLES_REFERENCE.md](./VARIABLES_REFERENCE.md)

---

## File Organization

```
src/styles/
├── variables.css           # Design tokens + utility classes (flex-center, text-label, etc.)
├── typography.css          # 11 semantic text utilities (.brutal-heading-*, .brutal-text-*, .brutal-label-*, .nav-link, .button-text-*)
├── interactions.css        # Interactive state patterns (.interactive, .link-interactive, .control-*, .focus-outline-*)
└── global.css             # Page layout, component styles, responsive rules, dark theme overrides
```

### Import Order

In stylesheets, always import in cascade order:

```css
@import './variables.css';    /* 1. Design tokens */
@import './typography.css';   /* 2. Typography utilities */
@import './interactions.css'; /* 3. Interaction utilities */
```

### CSS File Ownership

| File | Modify When |
|------|-------------|
| `variables.css` | Adding/updating design tokens or utility classes |
| `typography.css` | Adding reusable text styles |
| `interactions.css` | Adding focus/hover/active patterns |
| `global.css` | Page layout, responsive rules, dark theme overrides for page-level components |
| Component `.astro` `<style>` | Single-use component-specific styling |

---

## Astro-Specific Patterns

### Scoped vs. Global Styles — Decision Tree

| Scenario | Use |
|----------|-----|
| Design system tokens, resets, page layout | Global CSS in `src/styles/` |
| Single-component visual styles | Scoped `<style>` in the `.astro` file |
| Styling dynamically injected HTML (`innerHTML`) | `:global()` wrapper on the selector |
| Dark theme override for parent state | `:global(html.dark-theme)` prefix — but prefer CSS variables that auto-switch |
| Global keyframes or animations | `src/styles/global.css` |

### `class:list` — Conditional Classes

Use Astro's `class:list` directive for conditionally applying classes. Preferred over template literal concatenation for new code.

```astro
<!-- Preferred -->
<div class:list={['card', { active: isActive, highlighted: score > 90 }]}>

<!-- Avoid in new code -->
<div class={`card ${isActive ? 'active' : ''}`}>
```

### `define:vars` — JS-to-CSS Bridging

Use `define:vars` to pass frontmatter variables into scoped `<style>` blocks as CSS custom properties. Preferred over inline `style` attributes for dynamic values.

```astro
---
const accentColor = getThemeColor(category);
---
<style define:vars={{ accentColor }}>
  .card { border-left: 3px solid var(--accentColor); }
</style>
```

**Limitation**: `define:vars` makes the style tag inline (not bundled). Use sparingly for truly dynamic values, not for values that could be CSS variables.

### When `:global()` Is Necessary

`:global()` breaks Astro's scoping. Only use it when:

1. **Styling dynamically injected content** — Elements created via `innerHTML` in `<script>` blocks don't have Astro's scoping attributes:
   ```css
   :global(.question-card) { padding: var(--spacing-md); }
   ```

2. **Parent state selectors** — When a component's appearance depends on a class on `<html>` or a parent element:
   ```css
   :global(html.dark-theme) .my-card { background: var(--bg-dark-secondary); }
   ```

**Prefer CSS variables over `:global()`** when possible. If a value changes in dark theme, define a CSS variable with a dark override in `variables.css` rather than adding `:global(html.dark-theme)` selectors.

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

### Brand Assets in CSS

The GST delta icon (`/images/logo/gst-delta-icon-teal-stroke-thick.svg`) can be used as a CSS pseudo-element via the `mask-image` technique. This renders the SVG in any color without embedding an `<img>` tag, making it suitable for `::before`/`::after` decorators, list markers, and toggle indicators.

**Pattern: CSS mask with brand color**

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

**Guidelines:**
- Use `var(--color-primary)` as `background-color` to keep the icon on-brand
- Include `-webkit-` prefixes for Safari/iOS compatibility
- Use `mask-size: contain` so the icon scales to the element dimensions
- Adjust `width`/`height` to suit context (10px for inline text, 12-16px for standalone markers)

**Current usage:** ICG rationale "Why this matters" toggle trigger

**When to use instead of `<img>`:** When the icon appears in a CSS pseudo-element, needs to inherit or use CSS color values, or appears as a decorative detail rather than standalone content.

---

## Dark Theme Implementation

### How It Works

Variables are defined in `:root` (light theme defaults). The `html.dark-theme` selector overrides only the variables that change. Components use variables and get theme switching for free.

```css
/* variables.css */
:root {
  --filter-chip-bg: rgba(26, 26, 26, 0.05);
}

html.dark-theme {
  --filter-chip-bg: rgba(5, 205, 153, 0.1);
}

/* Component just references the variable */
.filter-chip {
  background: var(--filter-chip-bg);  /* Switches automatically */
}
```

### Adding Dark Theme Support to New Components

1. Use existing variables wherever possible (`--bg-light-alt`, `--text-primary`, `--color-primary`)
2. If you need a new component-specific variable, define both light and dark values in `variables.css`:
   ```css
   :root {
     --my-component-bg: #ffffff;
   }
   html.dark-theme {
     --my-component-bg: #1a1a1a;
   }
   ```
3. Toggle the theme in the browser and verify all elements are visible

### Common Dark Theme Variables for New Components

| Use Case | Variable |
|----------|----------|
| Primary text | `--text-primary` (auto-switches in dark theme) |
| Secondary text | `--text-secondary` (auto-switches) |
| Muted text | `--text-muted` (auto-switches) |
| Page background | `--bg-light` (auto-switches to `#0a0a0a`) |
| Alt background | `--bg-light-alt` (auto-switches to `#141414`) |
| Primary accent | `--color-primary` (same in both themes) |
| Borders | `--border-light` or `--color-primary` |

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

### Z-Index Scale

| Value | Usage |
|-------|-------|
| `0` | Checkerboard background (`body::before`) |
| `1` | Container, main content |
| `10` | Site header (sticky) |
| `1000` | Filter overlay, mockup labels |
| `1001` | Filter drawer (above overlay) |

---

## Hub Tool Patterns

Recurring patterns used across hub tools (ICG, TechPar, Tech Debt Calculator, Diligence Machine).

### Print Stylesheets

All hub tools include a `@media print` block in their scoped styles with a consistent structure:

```css
@media print {
  /* Hide interactive elements */
  .site-header, footer, .actions, [data-view="landing"], [data-view="wizard"] {
    display: none !important;
  }

  /* Show results */
  [data-view="results"] {
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
```

**Content wrapper**: Use `.brutal-tool-shell__content` inside the shell for automatic responsive padding:
```css
.brutal-tool-shell__content {
  padding: var(--spacing-xl) var(--spacing-lg);   /* Desktop */
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

For components that load content asynchronously (API calls, server islands), use the skeleton loading pattern. The `@keyframes pulse` animation is already defined in `global.css` (line 137).

**Canonical reference**: `src/components/radar/RadarFeedSkeleton.astro`

**Global classes** (defined in `global.css`):

| Class | Description |
|-------|-------------|
| `.skeleton-bar` | Rectangular placeholder bar (0.875rem height) |
| `.skeleton-bar--sm` | Smaller bar variant (0.625rem height) |
| `.skeleton-dot` | Circular placeholder (8px) |

All use `var(--accent-light-bg-hover)` for background color (auto-switches in dark theme) and the `pulse` animation.

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
  <path d="M32 8 L56 56 L8 56 Z" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="miter"/>
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
/* BAD */  .text { color: #1a1a1a; }
/* GOOD */ .text { color: var(--text-primary); }
```

Colors must use CSS variables so dark theme works automatically.

### 2. Duplicate Dark Theme Selectors

```css
/* BAD — 50+ manual overrides */
html.dark-theme .button { color: #05cd99; }
html.dark-theme .link { color: #f5f5f5; }

/* GOOD — override the variable, components inherit */
html.dark-theme { --button-color: #05cd99; --text-color: #f5f5f5; }
```

### 3. Hardcoded Spacing

```css
/* BAD */  .card { padding: 14px; margin: 23px; }
/* GOOD */ .card { padding: var(--spacing-lg); margin: var(--spacing-md); }
```

**Micro-spacing exception**: Values below `--spacing-xs` (4px) are acceptable for badge padding, border-radius fine-tuning, and optical alignment. Use `1px` or `2px` directly since the spacing scale does not cover sub-4px values. Example: `padding: 2px var(--spacing-sm)` is acceptable for compact badges.

### 4. Hardcoded Font Sizes

```css
/* BAD */  .title { font-size: 32px; }
/* GOOD */ <h1 class="brutal-heading-lg">Title</h1>
/* or */   .title { font-size: var(--text-xl); }
```

### 5. Inline Styles and `!important`

Defeats the cascade. Use component or utility classes instead.

### 6. Hardcoded Transitions

```css
/* BAD */  .card { transition: all 0.3s; }
/* GOOD */ .card { transition: all var(--transition-normal); }
```

### 7. Creating Unnecessary Variables

Check existing variables first. Don't create `--my-special-bg: #f5f5f5` when `--bg-light-alt` already exists.

### 8. Unused CSS

Delete dead styles. Version control has the history.

### 9. Hardcoded Primary Opacity

```css
/* BAD */  .tag { background: rgba(5, 205, 153, 0.1); }
/* GOOD */ .tag { background: var(--color-primary-10); }
/* BEST */ .tag { background: var(--accent-dark-bg); }  /* when a semantic alias exists */
```

Use `--color-primary-XX` opacity tokens (see [VARIABLES_REFERENCE — Opacity Scale](./VARIABLES_REFERENCE.md#primary-color-opacity-scale)). Prefer the semantic alias (`--accent-*-bg`, `--accent-border-*`) when one matches your intent.

### 10. Hardcoded Dark-Theme Borders

```css
/* BAD */  html.dark-theme .card { border: 1px solid rgba(255, 255, 255, 0.15); }
/* GOOD */ html.dark-theme .card { border: 1px solid var(--border-dark-default); }
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
- [ ] Responsive at 768px breakpoint
- [ ] Responsive at 480px breakpoint
- [ ] Focus states visible in both themes
- [ ] Run `npm run test:run` — no regressions

---

## Related Documentation

- **[/brand](https://globalstrategic.tech/brand)** — Live visual reference of the full design system: color swatches, typography specimens, spacing scale, and UI component library. Share this URL with designers, reviewers, or integration partners who don't have repo access.
- [BRAND_GUIDELINES.md](./BRAND_GUIDELINES.md) — Brand color palette, usage rules, and asset guidelines
- [VARIABLES_REFERENCE.md](./VARIABLES_REFERENCE.md) — Complete design token catalog
- [TYPOGRAPHY_REFERENCE.md](./TYPOGRAPHY_REFERENCE.md) — Typography utility classes
- [STYLES_REMEDIATION_ROADMAP.md](./STYLES_REMEDIATION_ROADMAP.md) — Tracked initiatives for closing convention gaps
- [FAVICON_AND_ICONS.md](../development/FAVICON_AND_ICONS.md) — PWA icon system

---

**Last Updated**: April 4, 2026
