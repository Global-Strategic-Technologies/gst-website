# CSS Variables Reference

Complete catalog of all CSS custom properties defined in `src/styles/variables.css`. Use this when styling components.

**Source of truth**: `src/styles/variables.css` — 134 variables in `:root`, 78 dark theme overrides in `html.dark-theme`.

---

## Primary Colors

| Variable | Value | Usage |
|----------|-------|-------|
| `--color-primary` | `#05cd99` | Primary accent — links, borders, buttons, active states |
| `--color-primary-dark` | `#04a87a` | Darker shade for emphasis |
| `--color-secondary` | `#CC8800` (light) / `#FFAA33` (dark) | Secondary accent (amber) |
| `--color-secondary-dark` | `#FFAA33` | Secondary dark variant |

## Backgrounds

| Variable | Light | Dark | Usage |
|----------|-------|------|-------|
| `--bg-light` | `#ffffff` | `#0a0a0a` | Primary page background |
| `--bg-light-alt` | `#f5f5f5` | `#141414` | Secondary background (sections, cards) |
| `--bg-dark` | `#0a0a0a` | `#0a0a0a` | Dark component backgrounds |
| `--bg-dark-secondary` | `#1a1a1a` | `#1a1a1a` | Secondary dark background |
| `--bg-dark-tertiary` | `#141414` | `#141414` | Tertiary dark background |

## Text Colors

### Theme-Agnostic Aliases (preferred)

Use these in all new code. They auto-switch in dark theme.

| Variable | Light Value | Dark Value | Usage |
|----------|------------|------------|-------|
| `--text-primary` | `rgba(26,26,26, 0.95)` | `rgba(245,245,245, 0.95)` | Headings, primary text |
| `--text-secondary` | `rgba(26,26,26, 0.7)` | `rgba(200,200,200, 0.8)` | Body text, descriptions |
| `--text-muted` | `rgba(26,26,26, 0.6)` | `rgba(200,200,200, 0.6)` | Labels, captions |
| `--text-faded` | `rgba(26,26,26, 0.5)` | `rgba(200,200,200, 0.5)` | Disabled, placeholders |

> Components reference `--text-primary` etc. and get dark values automatically. No dark theme overrides needed for text colors.

### Legacy Theme-Specific Variables (still available)

| Variable | Value | When to use |
|----------|-------|-------------|
| `--text-light-primary` | `rgba(26,26,26, 0.95)` | Force light-theme text color regardless of active theme |
| `--text-light-secondary` | `rgba(26,26,26, 0.7)` | Force light-theme text color |
| `--text-light-muted` | `rgba(26,26,26, 0.6)` | Force light-theme text color |
| `--text-light-faded` | `rgba(26,26,26, 0.5)` | Force light-theme text color |
| `--text-dark-primary` | `rgba(245,245,245, 0.95)` | Force dark-theme text color (e.g., text on dark card) |
| `--text-dark-secondary` | `rgba(200,200,200, 0.8)` | Force dark-theme text color |
| `--text-dark-muted` | `rgba(200,200,200, 0.6)` | Force dark-theme text color |
| `--text-dark-faded` | `rgba(200,200,200, 0.5)` | Force dark-theme text color |

> `--text-light-*` also auto-switch in dark theme (legacy behavior). Prefer `--text-*` for clarity.

## Borders & Accents

| Variable | Light | Dark | Usage |
|----------|-------|------|-------|
| `--border-light` | `rgba(26,26,26, 0.1)` | — | Subtle borders (light theme) |
| `--border-dark` | `rgba(5,205,153, 0.2)` | — | Teal borders (dark theme) |
| `--accent-light-bg` | `rgba(5,205,153, 0.08)` | — | Subtle accent background |
| `--accent-light-bg-hover` | `rgba(5,205,153, 0.15)` | — | Accent background on hover |
| `--accent-dark-bg` | `rgba(5,205,153, 0.1)` | — | Dark accent background |

## Spacing Scale

| Variable | Value | Pixels (at 16px base) |
|----------|-------|-----------------------|
| `--spacing-xs` | `0.25rem` | 4px |
| `--spacing-sm` | `0.5rem` | 8px |
| `--spacing-md` | `0.75rem` | 12px |
| `--spacing-lg` | `1rem` | 16px |
| `--spacing-xl` | `1.5rem` | 24px |
| `--spacing-2xl` | `2rem` | 32px |
| `--spacing-2_5xl` | `2.5rem` | 40px |
| `--spacing-3xl` | `3rem` | 48px |

## Gap Variables

| Variable | Value | Usage |
|----------|-------|-------|
| `--gap-tight` | `0.5rem` | Small gaps between items |
| `--gap-normal` | `0.75rem` | Standard gaps |
| `--gap-wide` | `1.5rem` | Wide gaps |
| `--gap-extra-wide` | `2rem` | Extra-wide gaps |

## Typography

| Variable | Value |
|----------|-------|
| `--font-family` | `'Helvetica Neue', Arial, sans-serif` |
| `--font-weight-normal` | `400` |
| `--font-weight-semibold` | `600` |
| `--font-weight-bold` | `700` |
| `--text-xs` | `0.75rem` (12px) |
| `--text-sm` | `0.875rem` (14px) |
| `--text-base` | `1rem` (16px) |
| `--text-lg` | `1.1rem` (17.6px) |
| `--text-xl` | `1.25rem` (20px) |
| `--text-2xl` | `1.5rem` (24px) |

## Transitions

| Variable | Value | Usage |
|----------|-------|-------|
| `--transition-fast` | `0.2s ease-out` | Hover, focus feedback |
| `--transition-normal` | `0.25s cubic-bezier(0.4, 0, 0.2, 1)` | Standard animations |
| `--transition-slow` | `0.3s cubic-bezier(0.4, 0, 0.2, 1)` | Drawers, modals |

## Shadows

| Variable | Value | Usage |
|----------|-------|-------|
| `--shadow-sm` | `0 2px 8px rgba(0,0,0, 0.1)` | Subtle elevation |
| `--shadow-md` | `0 4px 12px rgba(0,0,0, 0.15)` | Medium elevation |
| `--shadow-lg` | `-4px 0 20px rgba(0,0,0, 0.15)` | Large elevation (drawer) |

---

## Component-Specific Variables

These variables exist for page sections and UI components that need distinct light/dark values.

### Section Backgrounds

| Variable | Light | Dark |
|----------|-------|------|
| `--services-bg` | `#eeeeee` | `var(--bg-dark-tertiary)` |
| `--footer-bg` | `#eeeeee` | `var(--bg-dark-tertiary)` |
| `--cta-box-bg` | `var(--bg-light)` | `var(--bg-dark-secondary)` |
| `--service-card-bg` | `var(--bg-dark)` | `var(--bg-dark-secondary)` |
| `--filter-drawer-bg` | `var(--bg-light)` | `var(--bg-dark-secondary)` |

### Filter UI

| Variable | Light | Dark |
|----------|-------|------|
| `--filter-chip-bg` | `rgba(26,26,26, 0.05)` | `rgba(5,205,153, 0.1)` |
| `--filter-chip-bg-hover` | `rgba(26,26,26, 0.08)` | `rgba(5,205,153, 0.15)` |
| `--filter-chip-border` | `rgba(26,26,26, 0.1)` | `rgba(5,205,153, 0.2)` |
| `--filter-chip-text` | `rgba(26,26,26, 0.7)` | `rgba(200,200,200, 0.8)` |
| `--filter-button-bg` | `rgba(26,26,26, 0.05)` | `rgba(5,205,153, 0.1)` |
| `--filter-button-bg-hover` | `rgba(26,26,26, 0.08)` | `rgba(5,205,153, 0.15)` |
| `--filter-button-border` | `rgba(26,26,26, 0.1)` | `rgba(5,205,153, 0.2)` |
| `--filter-button-text` | `rgba(26,26,26, 0.7)` | `rgba(200,200,200, 0.8)` |
| `--search-input-bg` | `rgba(26,26,26, 0.02)` | `rgba(5,205,153, 0.05)` |
| `--search-input-border` | `rgba(26,26,26, 0.1)` | `rgba(5,205,153, 0.2)` |
| `--search-input-focus-bg` | `var(--bg-light)` | `var(--bg-dark-secondary)` |
| `--search-input-focus-shadow` | `rgba(5,205,153, 0.1)` | `rgba(5,205,153, 0.15)` |
| `--search-input-text` | `rgba(26,26,26, 0.85)` | `rgba(245,245,245, 0.85)` |
| `--search-input-placeholder` | `rgba(26,26,26, 0.5)` | `rgba(200,200,200, 0.5)` |
| `--clear-filters-text` | `rgba(26,26,26, 0.6)` | `rgba(200,200,200, 0.6)` |
| `--clear-filters-border` | `rgba(26,26,26, 0.1)` | `rgba(5,205,153, 0.2)` |

### Section Text & Borders

| Variable | Light | Dark |
|----------|-------|------|
| `--service-card-text` | `#b0b0b0` | `#d0d0d0` |
| `--service-card-heading` | `var(--bg-light)` | `var(--bg-light)` |
| `--service-card-border` | `var(--bg-dark-secondary)` | `#2a2a2a` |
| `--footer-text` | `rgba(26,26,26, 0.85)` | `rgba(153,153,153, 0.85)` |
| `--footer-border` | `rgba(26,26,26, 0.1)` | `rgba(153,153,153, 0.15)` |
| `--cta-box-text` | `rgba(26,26,26, 0.85)` | `rgba(200,200,200, 0.8)` |
| `--stat-item-border` | `var(--color-primary)` | `rgba(5,205,153, 0.2)` |
| `--about-image-bg` | `var(--bg-dark-tertiary)` | `var(--bg-dark-secondary)` |
| `--about-image-border` | `var(--bg-dark-secondary)` | `#2a2a2a` |
| `--about-image-text` | `#404040` | `#808080` |

### Miscellaneous

| Variable | Light | Dark |
|----------|-------|------|
| `--checkerboard-line` | `rgba(0,0,0, 0.08)` | `rgba(255,255,255, 0.08)` |
| `--theme-toggle-color` | `rgba(74,74,74, 0.8)` | `rgba(200,200,200, 0.8)` |

---

## TechPar Variables

Domain-specific variables for the TechPar tool. Defined in `variables.css` lines 116-150 with dark theme overrides at lines 204-229.

### Zone Colors

| Variable | Light | Dark | Usage |
|----------|-------|------|-------|
| `--techpar-zone-underinvest` | `#CC8800` | `#FFAA33` | Under-investment zone label/border |
| `--techpar-zone-underinvest-bg` | `rgba(204, 136, 0, 0.08)` | `rgba(255, 170, 51, 0.09)` | Under-investment zone background |
| `--techpar-zone-ahead` | `#2ea84e` | `#2ea84e` | Ahead-of-peers zone label/border |
| `--techpar-zone-ahead-bg` | `rgba(46, 168, 78, 0.08)` | `rgba(46, 168, 78, 0.09)` | Ahead zone background |
| `--techpar-zone-healthy` | `var(--color-primary)` | _(inherits)_ | Healthy zone label/border |
| `--techpar-zone-healthy-bg` | `var(--accent-light-bg)` | _(inherits)_ | Healthy zone background |
| `--techpar-zone-above` | `#CC8800` | `#FFAA33` | Above-average zone label/border |
| `--techpar-zone-above-bg` | `rgba(204, 136, 0, 0.08)` | `rgba(255, 170, 51, 0.09)` | Above-average zone background |
| `--techpar-zone-elevated` | `#d93636` | `#e05050` | Elevated risk zone label/border |
| `--techpar-zone-elevated-bg` | `rgba(217, 54, 54, 0.08)` | `rgba(224, 80, 80, 0.09)` | Elevated risk zone background |
| `--techpar-zone-critical` | `#b82e2e` | `#e05050` | Critical risk zone label/border |
| `--techpar-zone-critical-bg` | `rgba(184, 46, 46, 0.08)` | `rgba(224, 80, 80, 0.09)` | Critical risk zone background |

### Category Colors

| Variable | Light | Dark | Usage |
|----------|-------|------|-------|
| `--techpar-category-infra` | `var(--color-primary)` | _(inherits)_ | Infrastructure spend category |
| `--techpar-category-personnel` | `#3b82f6` | _(no override)_ | Personnel spend category |
| `--techpar-category-rd-opex` | `#8b5cf6` | _(no override)_ | R&D OpEx spend category |
| `--techpar-category-rd-capex` | `var(--color-secondary)` | _(inherits)_ | R&D CapEx spend category |

### Chart Colors

| Variable | Light | Dark | Usage |
|----------|-------|------|-------|
| `--techpar-chart-band-fill` | `rgba(5, 205, 153, 0.15)` | `rgba(5, 205, 153, 0.13)` | Healthy band fill |
| `--techpar-chart-band-border` | `rgba(5, 205, 153, 0.5)` | `rgba(5, 205, 153, 0.45)` | Healthy band border |
| `--techpar-chart-ahead-fill` | `rgba(33, 118, 174, 0.10)` | `rgba(56, 152, 214, 0.11)` | Ahead zone chart fill (blue — CVD-safe) |
| `--techpar-chart-ahead-border` | `rgba(33, 118, 174, 0.5)` | `rgba(56, 152, 214, 0.5)` | Ahead zone chart border |
| `--techpar-chart-under-fill` | `rgba(224, 123, 0, 0.12)` | `rgba(255, 140, 0, 0.12)` | Under-investment chart fill (amber) |
| `--techpar-chart-under-border` | `rgba(224, 123, 0, 0.55)` | `rgba(255, 140, 0, 0.55)` | Under-investment chart border |
| `--techpar-chart-above-fill` | `rgba(217, 54, 54, 0.10)` | `rgba(240, 70, 70, 0.12)` | Above-average chart fill (red) |
| `--techpar-chart-above-border` | `rgba(217, 54, 54, 0.45)` | `rgba(240, 70, 70, 0.50)` | Above-average chart border |
| `--techpar-chart-revenue-line` | `rgba(26, 26, 26, 0.55)` | `rgba(200, 200, 200, 0.6)` | Revenue reference line |

### KPI Colors

| Variable | Light | Dark | Usage |
|----------|-------|------|-------|
| `--techpar-kpi-positive` | `var(--color-primary)` | _(inherits)_ | Positive KPI indicator |
| `--techpar-kpi-warn` | `#CC8800` | `#FFAA33` | Warning KPI indicator |
| `--techpar-kpi-negative` | `#d93636` | `#e05050` | Negative KPI indicator |

---

## Shared Hub Tool Variables

Cross-tool semantic colors shared by multiple hub tools.

### Shared Colors

| Variable | Light | Dark | Usage |
|----------|-------|------|-------|
| `--hub-authority-blue` | `#5b7a9d` | `#7a9dbd` | Authority/expertise theme color (DM + ICG) |
| `--hub-authority-blue-bg` | `rgba(91, 122, 157, 0.1)` | `rgba(122, 157, 189, 0.1)` | Authority theme background |

### Diligence Machine Domain Colors

| Variable | Light | Dark | Usage |
|----------|-------|------|-------|
| `--dm-methodology-brown` | `#8c7a6b` | `#a89888` | Methodology theme color |
| `--dm-methodology-brown-bg` | `rgba(140, 122, 107, 0.04)` | `rgba(140, 122, 107, 0.06)` | Methodology theme background |
| `--dm-results-blue` | `#7a9dbd` | `#9dbde0` | Results theme accent |
| `--dm-results-tan` | `#a89888` | `#c0b0a0` | Results theme secondary |
| `--dm-positive` | `#4cba7a` | `#4cba7a` | Positive indicator |
| `--dm-negative` | `#e06060` | `#e06060` | Negative/red flag indicator |
| `--dm-negative-dark` | `#b22222` | `#b22222` | Strong negative indicator |
| `--dm-negative-dark-bg` | `rgba(178, 34, 34, 0.06)` | `rgba(178, 34, 34, 0.1)` | Negative indicator background |
| `--dm-warning` | `#d4923a` | `#d4923a` | Warning indicator |
| `--dm-warning-dark` | `#b26622` | `#b26622` | Strong warning indicator |
| `--dm-success` | `#2e8b57` | `#3da868` | Success indicator |

### ICG Maturity Colors

| Variable | Light | Dark | Usage |
|----------|-------|------|-------|
| `--icg-maturity-reactive` | `#E24B4A` | `#e86060` | Reactive maturity level (red) |
| `--icg-maturity-aware` | `#EF9F27` | `#f5b040` | Aware maturity level (orange) |
| `--icg-maturity-optimizing` | `#639922` | `#78b830` | Optimizing maturity level (green) |
| `--icg-maturity-strategic` | `var(--color-primary)` | _(inherits)_ | Strategic maturity level (teal) |
| `--icg-radar-grid` | `#999` | `#666` | Radar chart grid lines |
| `--icg-radar-label` | `#666` | `#999` | Radar chart axis labels |

---

## Quick Lookup by Purpose

| I need... | Use |
|-----------|-----|
| Primary text color | `--text-primary` |
| Secondary/body text | `--text-secondary` |
| Muted/label text | `--text-muted` |
| Page background | `--bg-light` |
| Card/section background | `--bg-light-alt` |
| Primary accent | `--color-primary` |
| Borders | `--border-light` or `--color-primary` |
| Padding/margin | `--spacing-sm` through `--spacing-3xl` |
| Flex/grid gaps | `--gap-tight` through `--gap-extra-wide` |
| Quick interaction | `--transition-fast` |
| Standard animation | `--transition-normal` |
| Elevation | `--shadow-sm`, `--shadow-md`, `--shadow-lg` |

---

## Adding New Variables

1. Check if an existing variable already covers your need
2. Add both `:root` (light) and `html.dark-theme` (dark) values in `variables.css`
3. Use semantic names: `--component-property` (e.g., `--filter-chip-bg`)
4. Update this reference file

---

**Last Updated**: March 24, 2026
**Total Variables**: 134 (`:root`) + 78 dark theme overrides
