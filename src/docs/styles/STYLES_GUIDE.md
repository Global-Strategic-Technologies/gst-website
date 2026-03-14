# CSS Styling Guide

Conventions, best practices, and patterns for all CSS work on the GST Website.

---

## Table of Contents

1. [Quick Start by Task](#quick-start-by-task)
2. [Design System Architecture](#design-system-architecture)
3. [File Organization](#file-organization)
4. [Component Styling](#component-styling)
5. [Dark Theme Implementation](#dark-theme-implementation)
6. [Responsive Design](#responsive-design)
7. [Anti-Patterns](#anti-patterns)
8. [New Component Checklist](#new-component-checklist)

---

## Quick Start by Task

**Adding a new component:**
1. Use CSS variables for all colors, spacing, and typography — see [VARIABLES_REFERENCE.md](./VARIABLES_REFERENCE.md)
2. Use typography utility classes — see [TYPOGRAPHY_REFERENCE.md](./TYPOGRAPHY_REFERENCE.md)
3. Test in both light and dark themes
4. Check responsive behavior at 768px and 480px breakpoints

**Styling text:** Pick a utility class from [TYPOGRAPHY_REFERENCE.md](./TYPOGRAPHY_REFERENCE.md) (`.heading-lg`, `.text-base`, `.label`, etc.). Dark theme colors switch automatically.

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
| Colors | `--color-primary`, `--bg-light`, `--text-light-primary` | 31 |
| Component colors | `--filter-chip-bg`, `--service-card-text`, `--footer-bg` | 31 |
| Misc colors | `--checkerboard-line`, `--theme-toggle-color` | 6 |
| Spacing | `--spacing-xs` through `--spacing-3xl` | 7 |
| Gaps | `--gap-tight` through `--gap-extra-wide` | 4 |
| Typography | `--font-family`, `--font-weight-*`, `--text-*` | 10 |
| Transitions | `--transition-fast`, `--transition-normal`, `--transition-slow` | 3 |
| Shadows | `--shadow-sm`, `--shadow-md`, `--shadow-lg` | 3 |
| **Total** | | **95** |

> Note: Dark theme defines 43 variable overrides, not new variables. 13 utility classes are defined across `variables.css`, `typography.css`, and `interactions.css`.

Full variable catalog: [VARIABLES_REFERENCE.md](./VARIABLES_REFERENCE.md)

---

## File Organization

```
src/styles/
├── variables.css           # Design tokens + utility classes (flex-center, text-label, etc.)
├── typography.css          # 11 semantic text utilities (.heading-*, .text-*, .label-*, .nav-link, .button-text-*)
├── interactions.css        # Interactive state patterns (.interactive, .link-interactive, .control-*, .focus-outline-*)
├── portfolio-controls.css  # Portfolio UI controls (.controls-wrapper)
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
| `portfolio-controls.css` | Updating portfolio-specific controls |
| `global.css` | Page layout, responsive rules, dark theme overrides for page-level components |
| Component `.astro` `<style>` | Single-use component-specific styling |

---

## Component Styling

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
    color: var(--text-light-primary);
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
2. **Typography utility classes** (`.heading-lg`, `.text-base`, `.label`) for text
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

**From `global.css`:**
- `.sr-only` — screen reader only (visually hidden)

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

1. Use existing variables wherever possible (`--bg-light-alt`, `--text-light-primary`, `--color-primary`)
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
| Primary text | `--text-light-primary` (auto-switches via dark theme override) |
| Secondary text | `--text-light-secondary` (auto-switches) |
| Muted text | `--text-light-muted` (auto-switches) |
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

## Anti-Patterns

### 1. Hardcoded Colors

```css
/* BAD */  .text { color: #1a1a1a; }
/* GOOD */ .text { color: var(--text-light-primary); }
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

### 4. Hardcoded Font Sizes

```css
/* BAD */  .title { font-size: 32px; }
/* GOOD */ <h1 class="heading-lg">Title</h1>
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

- [VARIABLES_REFERENCE.md](./VARIABLES_REFERENCE.md) — Complete design token catalog
- [TYPOGRAPHY_REFERENCE.md](./TYPOGRAPHY_REFERENCE.md) — Typography utility classes
- [FAVICON_AND_ICONS.md](../development/FAVICON_AND_ICONS.md) — PWA icon system

---

**Last Updated**: March 13, 2026
