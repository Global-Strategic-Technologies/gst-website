# CSS Styling Guide - GST Website

This guide establishes conventions, best practices, and patterns for all CSS styling work on the GST Website project.

---

## Table of Contents

1. [Design System Architecture](#design-system-architecture)
2. [CSS Variable Organization](#css-variable-organization)
3. [Component Styling](#component-styling)
4. [Dark Theme Implementation](#dark-theme-implementation)
5. [Responsive Design Patterns](#responsive-design-patterns)
6. [Common Anti-Patterns to Avoid](#common-anti-patterns-to-avoid)
7. [File Organization](#file-organization)
8. [Best Practices](#best-practices)

---

## Design System Architecture

The GST Website uses a **centralized CSS variable-based design system** as the single source of truth for all styling decisions.

### Core Design Tokens

**Colors**
- Primary Color: `--color-primary: #05cd99` (Teal)
- Primary Dark: `--color-primary-dark: #04a87a`
- Secondary Color: `--color-secondary: #CC8800` (Amber, light theme)
- Secondary Dark: `--color-secondary-dark: #FFAA33` (Amber, dark theme)

**Backgrounds**
- Light Theme: `--bg-light: #ffffff`, `--bg-light-alt: #f5f5f5`
- Dark Theme: `--bg-dark: #0a0a0a`, `--bg-dark-secondary: #1a1a1a`, `--bg-dark-tertiary: #141414`

**Text Colors**
- Light Theme: `--text-light-primary`, `--text-light-secondary`, `--text-light-muted`, `--text-light-faded`
- Dark Theme: `--text-dark-primary`, `--text-dark-secondary`, `--text-dark-muted`, `--text-dark-faded`

**Spacing Scale** (Base: 0.25rem)
- `--spacing-xs: 0.25rem` through `--spacing-3xl: 3rem`
- `--gap-tight: 0.5rem`, `--gap-normal: 0.75rem`, `--gap-wide: 1.5rem`, `--gap-extra-wide: 2rem`

**Typography**
- Font Family: `--font-family: 'Helvetica Neue', Arial, sans-serif`
- Font Weights: `--font-weight-normal: 400`, `--font-weight-semibold: 600`, `--font-weight-bold: 700`
- Text Sizes: `--text-xs` through `--text-2xl` (0.75rem to 1.5rem)

**Transitions**
- `--transition-fast: 0.2s ease-out`
- `--transition-normal: 0.25s cubic-bezier(0.4, 0, 0.2, 1)`
- `--transition-slow: 0.3s cubic-bezier(0.4, 0, 0.2, 1)`

**Shadows**
- `--shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.1)`
- `--shadow-md: 0 4px 12px rgba(0, 0, 0, 0.15)`
- `--shadow-lg: -4px 0 20px rgba(0, 0, 0, 0.15)`

### Design Philosophy

- **Tech Brutalist**: Clean, minimal design with bold typography and deliberate spacing
- **Dark Mode Native**: All components designed to work seamlessly in both light and dark themes
- **Accessibility First**: All interactive elements support keyboard navigation and screen readers
- **Performance Optimized**: CSS is organized to minimize file size and maximize cacheability

---

## CSS Variable Organization

### File Structure

CSS is organized into logical, focused files:

```
src/styles/
├── variables.css           # Design system tokens (colors, spacing, typography, transitions)
├── typography.css          # Semantic typography utilities (.heading-*, .text-*, .label-*, .nav-link, .button-text)
├── interactions.css        # Reusable interaction patterns (.interactive, .link-interactive, .control-hover, .focus-outline)
├── portfolio-controls.css  # Shared portfolio UI component styling
├── global.css             # Layout, page-level styles, responsive design, dark theme overrides
└── (component-scoped)     # Component-specific styles in Astro .astro files
```

### Variable Definition Strategy

**Root-level defaults** (`:root`)
- Define all light theme variables
- Define base color, spacing, typography values
- These establish the "happy path" for the majority of users

**Dark theme overrides** (`html.dark-theme`)
- Override only the variables that change for dark mode
- Use the same variable names - don't create separate dark/light variable sets
- This approach requires 50% fewer total variables

**Example**:
```css
:root {
  --bg-light: #ffffff;
  --filter-chip-bg: rgba(26, 26, 26, 0.05);
  --filter-chip-text: rgba(26, 26, 26, 0.7);
}

html.dark-theme {
  --bg-light: #0a0a0a;
  --filter-chip-bg: rgba(5, 205, 153, 0.1);
  --filter-chip-text: rgba(200, 200, 200, 0.8);
}
```

Components automatically inherit the correct values without conditional CSS:
```css
.filter-chip {
  background: var(--filter-chip-bg);  /* Switches with theme */
  color: var(--filter-chip-text);     /* Switches with theme */
}
```

---

## Component Styling

### Semantic Utility Classes

The project provides semantic, reusable utility classes that should be used instead of duplicating styles.

**Typography** (`typography.css`)
```css
.heading-xl, .heading-lg, .heading-md, .heading-sm
.text-base, .text-small, .text-tiny
.label, .label-small
.nav-link
.button-text, .button-text-lg
```

**Interactions** (`interactions.css`)
```css
.interactive                  /* Base interactive state */
.link-interactive            /* Link-specific states */
.control-hover, .control-active
.accent-light-bg, .accent-light-bg-hover
.focus-outline, .focus-outline-sm
```

### Adding New Component Styles

**For simple, single-use components:**
Use scoped styles in the Astro component:
```astro
---
export interface Props {
  title: string;
}
const { title } = Astro.props;
---

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

**For reusable component styles:**
Create a dedicated stylesheet in `src/styles/`:
```css
/* src/styles/my-component.css */
@import './variables.css';

.my-component {
  padding: var(--spacing-lg);
  background: var(--bg-light-alt);
  border: 2px solid var(--color-primary);
}

.my-component h2 {
  font-size: var(--text-lg);
  color: var(--text-light-primary);
  margin-bottom: var(--spacing-md);
}
```

Then import in the Astro component:
```astro
---
import '../../styles/my-component.css';
---
```

### Variable Usage Priority

**Always use variables in this order:**

1. **Design system variables first** (colors, spacing, typography, transitions)
   ```css
   color: var(--text-light-primary);  ✅ Good
   color: #1a1a1a;                     ❌ Bad - hardcoded
   ```

2. **Semantic typography utilities** for text styling
   ```html
   <h1 class="heading-xl">Title</h1>      ✅ Good
   <h1 style="font-size: 2.5rem; ...">   ❌ Bad - inline styles
   ```

3. **Semantic interaction utilities** for hover/focus states
   ```css
   .my-button:hover {
     background: var(--control-hover);   ✅ Good
   }
   .my-button:hover {
     background: #05cd99; color: white;  ❌ Bad - hardcoded
   }
   ```

---

## Dark Theme Implementation

### Single Variable Override Pattern

**Don't create separate variable names for light/dark:**
```css
/* ❌ BAD - Creates maintenance burden */
--text-light: #1a1a1a;
--text-dark: #f5f5f5;
```

**Instead, override a single variable name:**
```css
/* ✅ GOOD - Components don't need to know about theme */
:root {
  --text-color: #1a1a1a;
}

html.dark-theme {
  --text-color: #f5f5f5;
}

/* Component just uses --text-color */
.my-text {
  color: var(--text-color);
}
```

### Dark Theme Conversion Checklist

When adding a new component, ensure dark theme support by:

1. **Use variables for all colors**
   ```css
   background: var(--bg-light-alt);  ✅
   color: var(--text-light-primary); ✅
   border-color: var(--color-primary); ✅
   ```

2. **Add light theme defaults to `:root`** in `variables.css`
   ```css
   --my-component-bg: #ffffff;
   --my-component-text: #1a1a1a;
   ```

3. **Add dark theme overrides to `html.dark-theme`** in `variables.css`
   ```css
   --my-component-bg: #1a1a1a;
   --my-component-text: #f5f5f5;
   ```

4. **Test theme toggle** - Ensure all elements are visible in both themes

### Common Dark Theme Variables

**For new components, reuse these established variables:**

| Use Case | Light Variable | Dark Override |
|----------|---|---|
| Primary text | `--text-light-primary` | `--text-dark-primary` |
| Secondary text | `--text-light-secondary` | `--text-dark-secondary` |
| Muted text | `--text-light-muted` | `--text-dark-muted` |
| Background | `--bg-light` | `--bg-dark` |
| Alt background | `--bg-light-alt` | `--bg-dark-secondary` |
| Primary color | `--color-primary` | `--color-primary` (same) |
| Card background | `--bg-dark` (light) | `--bg-dark-secondary` (dark) |

---

## Responsive Design Patterns

### Breakpoints

The project uses these standard breakpoints:

```css
/* Mobile-first approach */
/* Base styles for mobile */

@media (min-width: 480px) {
  /* Small devices (tablets, landscape phones) */
}

@media (min-width: 768px) {
  /* Medium devices (tablets, small laptops) */
}

@media (min-width: 1024px) {
  /* Large devices (desktops) */
}
```

### Mobile-First Methodology

**Always start with mobile styles, then add larger breakpoint overrides:**

```css
/* ✅ GOOD - Mobile-first */
.card {
  width: 100%;
  padding: var(--spacing-md);
}

@media (min-width: 768px) {
  .card {
    width: 50%;
    padding: var(--spacing-lg);
  }
}
```

**Don't start with desktop and use max-width:**

```css
/* ❌ BAD - Desktop-first */
.card {
  width: 50%;
  padding: var(--spacing-lg);
}

@media (max-width: 768px) {
  .card {
    width: 100%;
    padding: var(--spacing-md);
  }
}
```

### Common Responsive Patterns

**Responsive Grid**
```css
.grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--gap-normal);
}

@media (min-width: 768px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--gap-wide);
  }
}

@media (min-width: 1024px) {
  .grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
```

**Responsive Font Sizes**
```css
.heading {
  font-size: var(--text-lg);
}

@media (min-width: 768px) {
  .heading {
    font-size: var(--text-xl);
  }
}
```

**Responsive Spacing**
```css
.section {
  padding: var(--spacing-md);
}

@media (min-width: 768px) {
  .section {
    padding: var(--spacing-lg);
  }
}
```

---

## Common Anti-Patterns to Avoid

### ❌ Anti-Pattern 1: Hardcoded Colors

**Problem**: Colors scattered throughout codebase make theme changes painful

```css
/* ❌ BAD */
.button { color: #05cd99; }
.link { color: #1a1a1a; }
.card { background: #ffffff; }
```

**Solution**: Use design system variables

```css
/* ✅ GOOD */
.button { color: var(--color-primary); }
.link { color: var(--text-light-primary); }
.card { background: var(--bg-light-alt); }
```

### ❌ Anti-Pattern 2: Duplicate Dark Theme Selectors

**Problem**: Creates 100+ lines of redundant `html.dark-theme` rules

```css
/* ❌ BAD - 100+ lines of duplication */
html.dark-theme .button { color: #05cd99; border-color: #05cd99; }
html.dark-theme .link { color: #f5f5f5; }
html.dark-theme .card { background: #1a1a1a; }
html.dark-theme .heading { color: #f5f5f5; }
/* ... 50+ more rules */
```

**Solution**: Use variable overrides in dark theme

```css
/* ✅ GOOD - Variables override automatically */
:root {
  --button-color: #05cd99;
  --text-color: #1a1a1a;
  --card-bg: #ffffff;
}

html.dark-theme {
  --button-color: #05cd99;  /* Same */
  --text-color: #f5f5f5;    /* Different */
  --card-bg: #1a1a1a;       /* Different */
}

/* All components use same selectors */
.button { color: var(--button-color); }
.link { color: var(--text-color); }
.card { background: var(--card-bg); }
```

### ❌ Anti-Pattern 3: Hardcoded Spacing Values

**Problem**: Non-standard spacing breaks design consistency

```css
/* ❌ BAD - Random spacing values */
.card { padding: 14px; margin: 23px; }
.section { padding: 48px; }
.button { padding: 0.6rem 1.2rem; }
```

**Solution**: Use the spacing scale from design variables

```css
/* ✅ GOOD - From --spacing-xs through --spacing-3xl */
.card { padding: var(--spacing-lg); margin: var(--spacing-md); }
.section { padding: var(--spacing-2xl); }
.button { padding: var(--spacing-sm) var(--spacing-lg); }
```

### ❌ Anti-Pattern 4: Hardcoded Font Sizes

**Problem**: Creates inconsistent typography hierarchy

```css
/* ❌ BAD - Inconsistent sizing */
.title { font-size: 32px; }
.heading { font-size: 1.8rem; }
.label { font-size: 0.813rem; }
```

**Solution**: Use semantic typography classes and variables

```css
/* ✅ GOOD - Use typography utilities */
<h1 class="heading-lg">Title</h1>
<h2 class="heading-md">Heading</h2>
<span class="label">Label</span>

/* Or use variables */
.custom-title { font-size: var(--text-xl); }
.custom-label { font-size: var(--text-xs); }
```

### ❌ Anti-Pattern 5: Inline Styles and !important

**Problem**: Defeats CSS cascade, makes maintenance difficult

```html
<!-- ❌ BAD -->
<div style="color: #1a1a1a; padding: 10px; background: white;">
  <p style="font-size: 14px !important;">Text</p>
</div>
```

**Solution**: Use component or utility classes

```html
<!-- ✅ GOOD -->
<div class="card">
  <p class="text-small">Text</p>
</div>
```

```css
.card {
  color: var(--text-light-primary);
  padding: var(--spacing-lg);
  background: var(--bg-light-alt);
}

.text-small {
  font-size: var(--text-sm);
}
```

### ❌ Anti-Pattern 6: Component-Specific Colors

**Problem**: Makes global theme changes impossible

```css
/* ❌ BAD - Component locked to specific color */
.portfolio-card {
  border-color: #05cd99;
  background: #0a0a0a;
}

.services-card {
  border-color: #1a1a1a;
  background: #ffffff;
}
```

**Solution**: Use design system colors

```css
/* ✅ GOOD - Uses design system */
.portfolio-card {
  border-color: var(--color-primary);
  background: var(--bg-dark);
}

.services-card {
  border-color: var(--border-light);
  background: var(--bg-light);
}
```

### ❌ Anti-Pattern 7: Mixing Scoped and Global Styles

**Problem**: Hard to track where styles come from, difficult to refactor

```astro
<!-- ❌ BAD - Mixing scoped and global -->
---
import './shared.css';
---

<div class="my-component">
  <h1>Title</h1>
</div>

<style>
  .my-component { /* Scoped */ }
  h1 { /* Scoped - but global in HTML */  }
</style>
```

**Solution**: Keep styles organized consistently

```astro
<!-- ✅ GOOD - Clear separation -->
---
import '../../styles/portfolio-controls.css';  /* Shared */
---

<div class="portfolio-controls">
  <h1 class="heading-lg">Title</h1>  <!-- Uses global utility -->
</div>

<style>
  .portfolio-controls { /* Component-specific only */ }
</style>
```

### ❌ Anti-Pattern 8: Unused CSS

**Problem**: File bloat, maintenance burden

```css
/* ❌ BAD - Dead code */
.old-button { color: blue; }  /* Never used */
.deprecated-style { ... }      /* Removed from markup */
.temporary-fix { ... }         /* Should be permanent or removed */
```

**Solution**: Delete unused styles, use version control to track history

```css
/* ✅ GOOD - Only active styles */
.button { color: var(--color-primary); }
```

---

## File Organization

### CSS File Ownership

| File | Purpose | Modify When |
|------|---------|---|
| `variables.css` | Design tokens | Adding/updating colors, spacing, typography standards |
| `typography.css` | Text utilities | Creating reusable text styles, heading scales |
| `interactions.css` | Interactive states | Adding focus/hover patterns, accessibility states |
| `portfolio-controls.css` | Portfolio UI | Updating portfolio-specific control styling |
| `global.css` | Page layout, dark theme | Layout structure, responsive design, theme-wide overrides |
| Component `.astro` | Component-specific | Single-use component styling |

### Import Order

Always import in this order to ensure proper cascade:

```astro
---
// 1. Shared styles first (highest priority for component)
import '../../styles/portfolio-controls.css';

// 2. Component logic
// ...
---
```

In stylesheets:

```css
/* 1. Design system foundation */
@import './variables.css';

/* 2. Utilities */
@import './typography.css';
@import './interactions.css';

/* 3. Component styles */
/* ... */
```

---

## Best Practices

### 1. Use Semantic Class Names

```css
/* ✅ GOOD - Intent is clear */
.filter-chip { }
.search-input { }
.clear-filters-button { }

/* ❌ BAD - Purpose unclear */
.item-blue { }
.box-1 { }
.btn-small { }
```

### 2. Comment Component Sections

```css
/* Dark Theme - Filters */
html.dark-theme .filter-chip { ... }
html.dark-theme .filter-button { ... }

/* Dark Theme - Services */
html.dark-theme .service-card { ... }
```

### 3. Group Related Properties

```css
/* ✅ GOOD - Logical grouping */
.card {
  /* Layout */
  display: flex;
  flex-direction: column;
  gap: var(--gap-normal);

  /* Styling */
  background: var(--bg-light-alt);
  border: 2px solid var(--color-primary);

  /* Spacing */
  padding: var(--spacing-lg);
  margin: var(--spacing-md);
}
```

### 4. Use Modern CSS Features

**CSS Grid** for 2D layouts
```css
.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: var(--gap-normal);
}
```

**CSS Variables** for dynamic values
```css
.theme-toggle {
  color: var(--theme-toggle-color);
  transition: color var(--transition-fast);
}
```

**Flexbox** for 1D layouts
```css
.nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--gap-normal);
}
```

### 5. Accessibility in CSS

**Maintain visible focus indicators**
```css
.interactive:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
```

**Don't use color alone to convey information**
```css
/* ✅ GOOD - Color + underline */
.link {
  color: var(--color-primary);
  border-bottom: 2px solid transparent;
}
.link:hover {
  border-bottom-color: var(--color-primary);
}

/* ❌ BAD - Color only */
.link { color: var(--color-primary); }
.link:hover { color: #04a87a; }
```

**Ensure sufficient contrast**
```css
/* ✅ GOOD - 4.5:1 contrast ratio minimum */
.text-primary { color: var(--text-light-primary); }  /* 95% -> 26% */

/* ❌ BAD - Poor contrast */
.text { color: #b0b0b0; background: #ffffff; }  /* ~2:1 */
```

### 6. Performance Optimization

**Minimize reflows with efficient selectors**
```css
/* ✅ GOOD - Direct selector */
.card { padding: var(--spacing-lg); }

/* ❌ BAD - Overly specific */
body > main > section > .cards > .card { padding: ... }
```

**Use CSS variables for dynamic theming** (no JavaScript style changes)
```css
/* ✅ GOOD - No paint/layout thrashing */
html.dark-theme {
  --bg-light: #0a0a0a;
  --text-light-primary: #f5f5f5;
}
```

### 7. Testing Dark Theme

Before committing style changes:

1. **Toggle theme** in browser DevTools
2. **Check all components** - text should be readable, borders visible
3. **Verify focus states** - outlines should be visible in both themes
4. **Test with accessibility tools** - ensure 4.5:1 contrast ratio

---

## Quick Reference: Design System Variables

### Most-Used Variables

```css
/* Colors */
--color-primary           /* Primary action color (#05cd99) */
--text-light-primary      /* Main text in light mode */
--text-dark-primary       /* Main text in dark mode */
--bg-light-alt            /* Secondary background in light mode */

/* Spacing */
--spacing-md              /* 0.75rem - standard padding */
--spacing-lg              /* 1rem - larger padding */
--gap-normal              /* 0.75rem - standard gap between items */

/* Typography */
--text-lg                 /* 1.1rem - large text */
--font-weight-bold        /* 700 - bold text */

/* Transitions */
--transition-fast         /* 0.2s - quick interaction feedback */
--transition-normal       /* 0.25s - standard animation */
```

### New Component Checklist

- [ ] Use variables for all colors
- [ ] Use spacing variables from scale
- [ ] Use typography utilities or variables
- [ ] Add light theme defaults to `:root` in variables.css
- [ ] Add dark theme overrides to `html.dark-theme` in variables.css
- [ ] Test in both light and dark modes
- [ ] Verify focus states are visible
- [ ] Check responsive behavior at breakpoints
- [ ] Run full test suite: `npm run test:all`

---

## Related Documentation

- [Variables Design System](./VARIABLES_REFERENCE.md) - Complete design token catalog
- [Typography System](./TYPOGRAPHY_REFERENCE.md) - Font sizes and text styles
- [Main Project Guide](./../CLAUDE.md) - Project overview and testing
- [Testing Guide](./../testing/TEST_STRATEGY.md) - E2E and unit testing patterns

---

**Last Updated**: March 11, 2026
**Document Version**: 1.1
**CSS Architecture**: Design System v3 (Phase 1-3 Consolidation Complete)
