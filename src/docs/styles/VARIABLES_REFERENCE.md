# CSS Variables Reference

Complete catalog of all CSS variables used in the GST Website design system. Use this as a reference when styling components.

---

## Color Variables

### Primary Colors

| Variable | Light Value | Dark Value | Usage |
|----------|---|---|---|
| `--color-primary` | `#05cd99` | `#05cd99` | Primary action color, links, borders, accents |
| `--color-primary-dark` | `#04a87a` | `#04a87a` | Darker shade for emphasis |
| `--color-secondary` | `#CC8800` | `#FFAA33` | Secondary accent color (amber) |
| `--color-secondary-dark` | `#FFAA33` | `#FFAA33` | Secondary color dark variant |

### Background Colors

| Variable | Light Value | Dark Value | Usage |
|----------|---|---|---|
| `--bg-light` | `#ffffff` | `#0a0a0a` | Primary background (site background) |
| `--bg-light-alt` | `#f5f5f5` | `#141414` | Secondary background (sections, cards) |
| `--bg-dark` | `#0a0a0a` | `#0a0a0a` | Dark background for components |
| `--bg-dark-secondary` | `#1a1a1a` | `#1a1a1a` | Secondary dark background |
| `--bg-dark-tertiary` | `#141414` | `#141414` | Tertiary dark background |

### Text Colors - Light Theme

| Variable | Value | Usage |
|----------|---|---|
| `--text-light-primary` | `rgba(26, 26, 26, 0.95)` | Primary text (headings, body) |
| `--text-light-secondary` | `rgba(26, 26, 26, 0.7)` | Secondary text (descriptions) |
| `--text-light-muted` | `rgba(26, 26, 26, 0.6)` | Muted text (labels, captions) |
| `--text-light-faded` | `rgba(26, 26, 26, 0.5)` | Faded text (disabled states) |

### Text Colors - Dark Theme

| Variable | Value | Usage |
|----------|---|---|
| `--text-dark-primary` | `rgba(245, 245, 245, 0.95)` | Primary text in dark mode |
| `--text-dark-secondary` | `rgba(200, 200, 200, 0.8)` | Secondary text in dark mode |
| `--text-dark-muted` | `rgba(200, 200, 200, 0.6)` | Muted text in dark mode |
| `--text-dark-faded` | `rgba(200, 200, 200, 0.5)` | Faded text in dark mode |

### Border & Accent Colors

| Variable | Light Value | Dark Value | Usage |
|----------|---|---|---|
| `--border-light` | `rgba(26, 26, 26, 0.1)` | `rgba(5, 205, 153, 0.2)` | Light borders |
| `--border-dark` | `rgba(5, 205, 153, 0.2)` | `rgba(5, 205, 153, 0.2)` | Dark borders |
| `--accent-light-bg` | `rgba(5, 205, 153, 0.08)` | `rgba(5, 205, 153, 0.1)` | Subtle accent backgrounds |
| `--accent-light-bg-hover` | `rgba(5, 205, 153, 0.15)` | `rgba(5, 205, 153, 0.15)` | Accent backgrounds on hover |
| `--accent-dark-bg` | `rgba(5, 205, 153, 0.1)` | `rgba(5, 205, 153, 0.1)` | Dark accent backgrounds |

### Component-Specific Colors

#### Filter UI Variables

| Variable | Light Value | Dark Value | Usage |
|----------|---|---|---|
| `--filter-chip-bg` | `rgba(26, 26, 26, 0.05)` | `rgba(5, 205, 153, 0.1)` | Filter chip background |
| `--filter-chip-bg-hover` | `rgba(26, 26, 26, 0.08)` | `rgba(5, 205, 153, 0.15)` | Filter chip hover background |
| `--filter-chip-border` | `rgba(26, 26, 26, 0.1)` | `rgba(5, 205, 153, 0.2)` | Filter chip border |
| `--filter-chip-text` | `rgba(26, 26, 26, 0.7)` | `rgba(200, 200, 200, 0.8)` | Filter chip text |
| `--filter-button-bg` | `rgba(26, 26, 26, 0.05)` | `rgba(5, 205, 153, 0.1)` | Filter button background |
| `--filter-button-bg-hover` | `rgba(26, 26, 26, 0.08)` | `rgba(5, 205, 153, 0.15)` | Filter button hover background |
| `--filter-button-border` | `rgba(26, 26, 26, 0.1)` | `rgba(5, 205, 153, 0.2)` | Filter button border |
| `--filter-button-text` | `rgba(26, 26, 26, 0.7)` | `rgba(200, 200, 200, 0.8)` | Filter button text |
| `--search-input-bg` | `rgba(26, 26, 26, 0.02)` | `rgba(5, 205, 153, 0.05)` | Search input background |
| `--search-input-border` | `rgba(26, 26, 26, 0.1)` | `rgba(5, 205, 153, 0.2)` | Search input border |
| `--search-input-focus-bg` | `var(--bg-light)` | `var(--bg-dark-secondary)` | Search input focused background |
| `--search-input-focus-shadow` | `rgba(5, 205, 153, 0.1)` | `rgba(5, 205, 153, 0.15)` | Search input focus shadow |
| `--search-input-text` | `rgba(26, 26, 26, 0.85)` | `rgba(245, 245, 245, 0.85)` | Search input text |
| `--search-input-placeholder` | `rgba(26, 26, 26, 0.5)` | `rgba(200, 200, 200, 0.5)` | Search input placeholder |
| `--clear-filters-text` | `rgba(26, 26, 26, 0.6)` | `rgba(200, 200, 200, 0.6)` | Clear filters button text |
| `--clear-filters-border` | `rgba(26, 26, 26, 0.1)` | `rgba(5, 205, 153, 0.2)` | Clear filters button border |

#### Section & Component Variables

| Variable | Light Value | Dark Value | Usage |
|----------|---|---|---|
| `--services-bg` | `#eeeeee` | `var(--bg-dark-tertiary)` | Services section background |
| `--footer-bg` | `#eeeeee` | `var(--bg-dark-tertiary)` | Footer section background |
| `--footer-text` | `rgba(26, 26, 26, 0.85)` | `rgba(153, 153, 153, 0.85)` | Footer text color |
| `--footer-border` | `rgba(26, 26, 26, 0.1)` | `rgba(153, 153, 153, 0.15)` | Footer border color |
| `--cta-box-bg` | `var(--bg-light)` | `var(--bg-dark-secondary)` | CTA box background |
| `--cta-box-text` | `rgba(26, 26, 26, 0.85)` | `rgba(200, 200, 200, 0.8)` | CTA box text color |
| `--service-card-bg` | `var(--bg-dark)` | `var(--bg-dark-secondary)` | Service card background |
| `--service-card-heading` | `var(--bg-light)` | `var(--bg-light)` | Service card heading color |
| `--service-card-text` | `#b0b0b0` | `#d0d0d0` | Service card body text |
| `--service-card-border` | `var(--bg-dark-secondary)` | `#2a2a2a` | Service card border |
| `--filter-drawer-bg` | `var(--bg-light)` | `var(--bg-dark-secondary)` | Filter drawer background |
| `--stat-item-border` | `var(--color-primary)` | `rgba(5, 205, 153, 0.2)` | Stats item border |
| `--about-image-bg` | `var(--bg-dark-tertiary)` | `var(--bg-dark-secondary)` | About image background |
| `--about-image-border` | `var(--bg-dark-secondary)` | `#2a2a2a` | About image border |
| `--about-image-text` | `#404040` | `#808080` | About image text/placeholder |

#### Miscellaneous Variables

| Variable | Light Value | Dark Value | Usage |
|----------|---|---|---|
| `--checkerboard-line` | `rgba(0, 0, 0, 0.08)` | `rgba(255, 255, 255, 0.08)` | Grid background lines |
| `--theme-toggle-color` | `rgba(74, 74, 74, 0.8)` | `rgba(200, 200, 200, 0.8)` | Theme toggle button color |

---

## Spacing Variables

### Spacing Scale

All spacing values follow a consistent scale based on 0.25rem (4px):

| Variable | Value | Usage |
|----------|---|---|
| `--spacing-xs` | `0.25rem` | Extra-small padding/margins |
| `--spacing-sm` | `0.5rem` | Small padding/margins |
| `--spacing-md` | `0.75rem` | Standard padding/margins |
| `--spacing-lg` | `1rem` | Large padding/margins |
| `--spacing-xl` | `1.5rem` | Extra-large padding/margins |
| `--spacing-2xl` | `2rem` | Large section spacing |
| `--spacing-3xl` | `3rem` | Extra-large section spacing |

### Gap Variables

Used for flexbox/grid gaps:

| Variable | Value | Usage |
|----------|---|---|
| `--gap-tight` | `0.5rem` | Small gaps between items |
| `--gap-normal` | `0.75rem` | Standard gaps between items |
| `--gap-wide` | `1.5rem` | Wide gaps between items |
| `--gap-extra-wide` | `2rem` | Extra-wide gaps between items |

---

## Typography Variables

### Font Family

| Variable | Value |
|----------|---|
| `--font-family` | `'Helvetica Neue', Arial, sans-serif` |

### Font Weights

| Variable | Value | Usage |
|----------|---|---|
| `--font-weight-normal` | `400` | Body text, regular weight |
| `--font-weight-semibold` | `600` | Subheadings, emphasis |
| `--font-weight-bold` | `700` | Headings, strong emphasis |

### Text Sizes

| Variable | Value | Usage |
|----------|---|---|
| `--text-xs` | `0.75rem` | Labels, badges |
| `--text-sm` | `0.875rem` | Small text, captions |
| `--text-base` | `1rem` | Body text |
| `--text-lg` | `1.1rem` | Large text, subheadings |
| `--text-xl` | `1.25rem` | Larger headings |
| `--text-2xl` | `1.5rem` | Large headings |

---

## Transition Variables

Animation and transition durations:

| Variable | Value | Usage |
|----------|---|---|
| `--transition-fast` | `0.2s ease-out` | Quick interactions (hover, focus) |
| `--transition-normal` | `0.25s cubic-bezier(0.4, 0, 0.2, 1)` | Standard animations |
| `--transition-slow` | `0.3s cubic-bezier(0.4, 0, 0.2, 1)` | Slower animations (modals) |

---

## Shadow Variables

Elevation and depth effects:

| Variable | Value | Usage |
|----------|---|---|
| `--shadow-sm` | `0 2px 8px rgba(0, 0, 0, 0.1)` | Subtle elevation |
| `--shadow-md` | `0 4px 12px rgba(0, 0, 0, 0.15)` | Medium elevation |
| `--shadow-lg` | `-4px 0 20px rgba(0, 0, 0, 0.15)` | Large elevation (drawer) |

---

## Usage Examples

### Example 1: Creating a Card Component

```css
.my-card {
  /* Use background variable - switches with theme */
  background: var(--bg-light-alt);

  /* Use spacing variables for consistency */
  padding: var(--spacing-lg);
  margin-bottom: var(--spacing-md);

  /* Use text color variable */
  color: var(--text-light-primary);

  /* Use color variables for borders */
  border: 2px solid var(--color-primary);

  /* Use transition variable */
  transition: all var(--transition-normal);
}

.my-card:hover {
  /* Colors automatically follow theme */
  background: var(--bg-light);
  border-color: var(--color-primary-dark);
}
```

### Example 2: Responsive Button

```css
.button {
  padding: var(--spacing-sm) var(--spacing-lg);
  font-size: var(--text-base);
  color: var(--bg-light);
  background: var(--color-primary);
  border: none;
  font-weight: var(--font-weight-bold);
  transition: all var(--transition-fast);
}

@media (min-width: 768px) {
  .button {
    padding: var(--spacing-md) var(--spacing-xl);
    font-size: var(--text-lg);
  }
}
```

### Example 3: Dark Theme Automatic Switching

Light theme (default):
```css
:root {
  --filter-text: rgba(26, 26, 26, 0.7);
  --filter-bg: rgba(26, 26, 26, 0.05);
}

.filter { color: var(--filter-text); background: var(--filter-bg); }
/* Result: Dark text on light background */
```

Dark theme (automatic override):
```css
html.dark-theme {
  --filter-text: rgba(200, 200, 200, 0.8);
  --filter-bg: rgba(5, 205, 153, 0.1);
}

/* Same CSS selector, automatically gets dark theme values */
.filter { color: var(--filter-text); background: var(--filter-bg); }
/* Result: Light text on dark background */
```

---

## Adding New Variables

When adding a new component that needs styling:

1. **Check if existing variables apply**
   - Can you use `--bg-light-alt` instead of creating new background?
   - Can you use `--text-light-primary` instead of creating new text color?

2. **If creating new variables, add both light and dark**
   ```css
   :root {
     --my-component-bg: #ffffff;
     --my-component-text: #1a1a1a;
   }

   html.dark-theme {
     --my-component-bg: #1a1a1a;
     --my-component-text: #f5f5f5;
   }
   ```

3. **Use semantic names**
   ```css
   /* ✅ GOOD */
   --filter-chip-bg
   --service-card-text
   --footer-border

   /* ❌ BAD */
   --bg-1
   --text-light
   --color-1
   ```

4. **Document the variable** in this file

---

## Variable Lookup Table

Quick lookup by purpose:

### "I need to style text"
- Primary text: `--text-light-primary`
- Secondary text: `--text-light-secondary`
- Muted text: `--text-light-muted`
- Label/small text: `--text-xs`, `--text-sm`

### "I need a background color"
- Primary background: `--bg-light`
- Secondary background: `--bg-light-alt`
- Dark card background: `--bg-dark`
- Component-specific: `--service-card-bg`, `--filter-drawer-bg`

### "I need spacing"
- Padding/margin: `--spacing-sm` through `--spacing-3xl`
- Gaps between items: `--gap-tight` through `--gap-extra-wide`

### "I need to emphasize something"
- Primary color: `--color-primary`
- Darker shade: `--color-primary-dark`

### "I need a border"
- Light border: `--border-light`
- Dark border: `--border-dark`
- Primary accent: Use `--color-primary`

### "I need animation"
- Quick response: `--transition-fast`
- Standard animation: `--transition-normal`
- Slower animation: `--transition-slow`

### "I need elevation/depth"
- Subtle shadow: `--shadow-sm`
- Medium shadow: `--shadow-md`
- Strong shadow: `--shadow-lg`

---

**Last Updated**: March 11, 2026
**Total Variables**: 85+
**Theme Coverage**: 100% (all variables have light and dark values)
