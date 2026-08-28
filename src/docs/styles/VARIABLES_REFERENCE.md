# CSS Variables Reference

Complete catalog of all CSS custom properties defined in `src/styles/variables.css`. Use this when styling components.

**Source of truth**: `src/styles/variables.css`. This reference is kept in exact parity with it by `tests/integration/docs-variables-sync.test.ts` (run via `npm run test:docs`) — every `:root` token must be documented here, and every documented token must exist there.

**What dark theme does and does not touch.** `html.dark-theme` sets `color-scheme: dark`, which is what makes every `light-dark()` token resolve to its dark value — the block itself carries only `color-scheme` and the RGB-triplet overrides (see [Adding New Variables](#adding-new-variables)). Surfaces and text switch that way: `--text-primary`, `--bg-light`, `--bg-light-alt`. **Two tokens do not.** `--color-primary` holds the same teal in both themes — it is the brand constant, and the **alternative palettes**, not the theme, are what re-point it, so never author a dark variant of it. `--border-light` has no dark counterpart value; dark borders come from the `--border-dark-subtle` / `--border-dark-default` / `--border-dark-prominent` scale, normally paired as `light-dark(var(--border-light), var(--border-dark-default))` — a bare `--border-light` on a dark surface is invisible. (`--color-secondary` and `--color-tertiary` are different again: they genuinely carry per-theme values, listed below.) Verify with `node .design-sync/dark-probe.mjs`, which prints exactly which tokens switch.

---

## Primary Colors

| Variable                     | Value                                | Usage                                                   |
| ---------------------------- | ------------------------------------ | ------------------------------------------------------- |
| `--color-primary`            | `#05cd99`                            | Primary accent — links, borders, buttons, active states |
| `--color-primary-rgb`        | `5, 205, 153`                        | Base RGB triplet — used by the opacity scale below      |
| `--color-primary-dark`       | `#04a87a`                            | Darker shade for emphasis                               |
| `--color-secondary`          | `#CC8800` (light) / `#FFAA33` (dark) | Secondary accent (amber)                                |
| `--color-secondary-dark`     | `#ffaa33`                            | Secondary dark variant                                  |
| `--color-tertiary`           | `#02724f` (light) / `#05cd99` (dark) | Tertiary accent (deep teal)                             |
| `--color-tertiary-dark`      | `#01633f` (light) / `#04a87a` (dark) | Tertiary dark variant                                   |
| `--color-editors-pick`       | `#b26622` (light) / `#d4923a` (dark) | Editor's Pick accent                                    |
| `--color-editors-pick-hover` | `#d4923a` (light) / `#b26622` (dark) | Editor's Pick hover state (inverted)                    |

## Primary Color Opacity Scale

Raw opacity tokens built from `--color-primary-rgb`. Use these instead of hardcoded `rgba(5, 205, 153, ...)`.

| Variable             | Opacity | Common Use                            |
| -------------------- | ------- | ------------------------------------- |
| `--color-primary-02` | 2%      | Ultra-subtle backgrounds              |
| `--color-primary-03` | 3%      | Wash backgrounds                      |
| `--color-primary-04` | 4%      | Faint backgrounds                     |
| `--color-primary-05` | 5%      | Dark-theme input backgrounds          |
| `--color-primary-06` | 6%      | Tint backgrounds                      |
| `--color-primary-08` | 8%      | Light accent backgrounds              |
| `--color-primary-10` | 10%     | Tags, chip backgrounds, focus shadows |
| `--color-primary-12` | 12%     | Slider thumb shadows                  |
| `--color-primary-13` | 13%     | Dark-theme chart fills                |
| `--color-primary-15` | 15%     | Hover backgrounds, card shadows       |
| `--color-primary-18` | 18%     | Slider hover shadows                  |
| `--color-primary-20` | 20%     | Borders, chip borders                 |
| `--color-primary-25` | 25%     | Light accent borders                  |
| `--color-primary-30` | 30%     | Medium accent borders                 |
| `--color-primary-45` | 45%     | Map region fills, chart borders       |
| `--color-primary-50` | 50%     | Map hover fills, chart borders        |
| `--color-primary-55` | 55%     | Dark-theme highlighted regions        |
| `--color-primary-60` | 60%     | Selected regions                      |
| `--color-primary-65` | 65%     | Dark-theme selected regions           |

> **Semantic aliases** (`--accent-subtle-bg`, `--accent-light-bg`, etc.) reference these tokens. Prefer the semantic name when it matches your intent; use the raw token when no semantic alias exists.

## Semantic Colors

Shared status colors for cross-tool consistency. See [BRAND_GUIDELINES.md — Semantic Color System](./BRAND_GUIDELINES.md#semantic-color-system).

| Variable          | Light                  | Dark                   | Usage                                    |
| ----------------- | ---------------------- | ---------------------- | ---------------------------------------- |
| `--color-success` | `#2e8b57`              | `#3da868`              | Positive outcomes, passing states        |
| `--color-warning` | `#CC8800`              | `#FFAA33`              | Caution indicators, borderline states    |
| `--color-error`   | `#d93636`              | `#e05050`              | Failures, negative KPIs, critical alerts |
| `--color-info`    | `var(--color-primary)` | `var(--color-primary)` | Informational highlights (alias)         |

## Backgrounds

| Variable              | Light     | Dark      | Usage                                  |
| --------------------- | --------- | --------- | -------------------------------------- |
| `--bg-light`          | `#ffffff` | `#0a0a0a` | Primary page background                |
| `--bg-light-alt`      | `#f5f5f5` | `#141414` | Secondary background (sections, cards) |
| `--bg-dark`           | `#0a0a0a` | `#0a0a0a` | Dark component backgrounds             |
| `--bg-dark-secondary` | `#1a1a1a` | `#1a1a1a` | Secondary dark background              |
| `--bg-dark-tertiary`  | `#141414` | `#141414` | Tertiary dark background               |

## Text Colors

### Theme-Agnostic Aliases (preferred)

Use these in all new code. They auto-switch in dark theme.

| Variable           | Light Value              | Dark Value                  | Usage                                                                                                                                              |
| ------------------ | ------------------------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--text-primary`   | `rgba(26, 26, 26, 0.95)` | `rgba(245, 245, 245, 0.95)` | Headings, primary text                                                                                                                             |
| `--text-secondary` | `rgba(26, 26, 26, 0.7)`  | `rgba(200, 200, 200, 0.8)`  | Body text, descriptions                                                                                                                            |
| `--text-muted`     | `rgba(26, 26, 26, 0.65)` | `rgba(200, 200, 200, 0.6)`  | Labels, captions, disabled states, placeholders (large text only — see [contrast requirements](./BRAND_GUIDELINES.md#color-contrast-requirements)) |

> Components reference `--text-primary` etc. and get dark values automatically. No dark theme overrides needed for text colors.

### Legacy Theme-Specific Variables (still available)

| Variable                 | Value                       | When to use                                             |
| ------------------------ | --------------------------- | ------------------------------------------------------- |
| `--text-light-primary`   | `rgba(26, 26, 26, 0.95)`    | Force light-theme text color regardless of active theme |
| `--text-light-secondary` | `rgba(26, 26, 26, 0.7)`     | Force light-theme text color                            |
| `--text-light-muted`     | `rgba(26, 26, 26, 0.65)`    | Force light-theme text color                            |
| `--text-dark-primary`    | `rgba(245, 245, 245, 0.95)` | Force dark-theme text color (e.g., text on dark card)   |
| `--text-dark-secondary`  | `rgba(200, 200, 200, 0.8)`  | Force dark-theme text color                             |
| `--text-dark-muted`      | `rgba(200, 200, 200, 0.6)`  | Force dark-theme text color                             |

> `--text-light-*` and `--text-dark-*` are static per-theme constants — they do **not** switch with the active theme. Prefer the `--text-*` aliases for anything theme-aware.

## Borders & Accents

| Variable                  | Value                                                           | Usage                                                                 |
| ------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------- |
| `--border-light`          | `rgba(26, 26, 26, 0.1)`                                         | Subtle borders (light theme)                                          |
| `--border-dark`           | `var(--color-primary-20)`                                       | Teal borders (dark theme)                                             |
| `--border-hairline`       | `light-dark(rgba(26, 26, 26, 0.12), rgba(255, 255, 255, 0.08))` | Neutral theme-switched hairline — sub-pixel SVG strokes, 1px dividers |
| `--accent-subtle-bg`      | `var(--color-primary-02)` / `03` dark                           | Ultra-subtle accent fill                                              |
| `--accent-wash-bg`        | `var(--color-primary-03)` / `04` dark                           | Wash-level accent fill                                                |
| `--accent-faint-bg`       | `var(--color-primary-04)` / `05` dark                           | Faint accent fill                                                     |
| `--accent-tint-bg`        | `var(--color-primary-06)` / `08` dark                           | Tint-level accent fill                                                |
| `--accent-light-bg`       | `var(--color-primary-08)`                                       | Light accent background                                               |
| `--accent-light-bg-hover` | `var(--color-primary-15)`                                       | Accent background on hover                                            |
| `--accent-dark-bg`        | `var(--color-primary-10)`                                       | Darker accent background                                              |
| `--accent-border-light`   | `var(--color-primary-25)`                                       | Subtle accent borders                                                 |
| `--accent-border-medium`  | `var(--color-primary-30)`                                       | Medium accent borders                                                 |

### Dark Border Scale (dark theme only)

| Variable                  | Value                       | Usage                                     |
| ------------------------- | --------------------------- | ----------------------------------------- |
| `--border-dark-subtle`    | `rgba(255, 255, 255, 0.1)`  | Subtle separators, inset shadows          |
| `--border-dark-default`   | `rgba(255, 255, 255, 0.15)` | Standard dark-theme borders (most common) |
| `--border-dark-prominent` | `rgba(255, 255, 255, 0.2)`  | Emphasized borders, hover states          |

## Neutral Surface Tints

Theme-switched wash backgrounds for layered surfaces. Distinct from the `--accent-*-bg` family above, which is primary-derived and shifts with the palette; these are neutral and do not. Ordered lightest → heaviest.

| Variable               | Value                                                              | Usage                                             |
| ---------------------- | ------------------------------------------------------------------ | ------------------------------------------------- |
| `--surface-faint-bg`   | `light-dark(rgba(0, 0, 0, 0.005), rgba(255, 255, 255, 0.005))`     | Barely-there tool shell / bench section wash      |
| `--surface-subtle-bg`  | `light-dark(rgba(0, 0, 0, 0.02), rgba(200, 220, 255, 0.03))`       | Card and form-control resting background          |
| `--surface-sheen-bg`   | `light-dark(transparent, rgba(200, 220, 255, 0.03))`               | Blur-only frosted sheen (no light-theme tint)     |
| `--surface-input-bg`   | `light-dark(transparent, rgba(255, 255, 255, 0.04))`               | Text input interior                               |
| `--surface-tint-bg`    | `light-dark(rgba(26, 26, 26, 0.05), rgba(255, 255, 255, 0.05))`    | Map/panel inset regions                           |
| `--surface-neutral-bg` | `light-dark(rgba(26, 26, 26, 0.08), rgba(255, 255, 255, 0.06))`    | Map graticule fills, neutral chart surfaces       |
| `--surface-muted-bg`   | `light-dark(rgba(200, 200, 200, 0.08), rgba(200, 200, 200, 0.04))` | Disabled / de-emphasized card states              |
| `--surface-veil-bg`    | `light-dark(rgba(255, 255, 255, 0.75), rgba(20, 20, 20, 0.6))`     | Heavy frosted glass (`.brutal-frosted--heavy`)    |
| `--surface-panel-bg`   | `light-dark(rgba(255, 255, 255, 0.85), rgba(10, 10, 10, 0.85))`    | Sticky tool action bars                           |
| `--surface-overlay-bg` | `light-dark(rgba(245, 245, 245, 0.92), rgba(20, 20, 20, 0.92))`    | Modal/panel overlays (`.brutal-frosted--overlay`) |

### Frosted-Glass Edge Treatment

The inset highlight + hairline edge pair applied to every frosted surface — see [STYLES_GUIDE.md § Frosted Glass](./STYLES_GUIDE.md).

| Variable            | Value                                                              | Usage                               |
| ------------------- | ------------------------------------------------------------------ | ----------------------------------- |
| `--frost-highlight` | `light-dark(rgba(255, 255, 255, 0.12), var(--border-dark-subtle))` | `inset 0 1px 0` wet-glass highlight |
| `--frost-edge`      | `light-dark(rgba(0, 0, 0, 0.04), rgba(255, 255, 255, 0.05))`       | `0 0 0 1px` hairline edge           |

### Scrims

Neutral black at fixed alpha, for modal backdrops, drawer shadows and inset depth. Deliberately **not** theme-switched — a scrim is black in both themes. Named by alpha, mirroring the `--color-primary-NN` opacity scale.

| Variable          | Value                      | Usage                                       |
| ----------------- | -------------------------- | ------------------------------------------- |
| `--scrim-15`      | `rgba(0, 0, 0, 0.15)`      | Light-theme drawer shadow                   |
| `--scrim-20`      | `rgba(0, 0, 0, 0.2)`       | Inset input depth (dark theme)              |
| `--scrim-30`      | `rgba(0, 0, 0, 0.3)`       | Filter overlay backdrop                     |
| `--scrim-40`      | `rgba(0, 0, 0, 0.4)`       | Dark-theme drawer/panel shadow, panel scrim |
| `--scrim-50`      | `rgba(0, 0, 0, 0.5)`       | Modal backdrop                              |
| `--scrim-60`      | `rgba(0, 0, 0, 0.6)`       | Heavy modal backdrop                        |
| `--panel-grip-bg` | `rgba(128, 128, 128, 0.4)` | Palette-panel drag handle                   |

## Spacing Scale

| Variable          | Value     | Pixels (at 16px base) |
| ----------------- | --------- | --------------------- |
| `--spacing-xs`    | `0.25rem` | 4px                   |
| `--spacing-sm`    | `0.5rem`  | 8px                   |
| `--spacing-md`    | `0.75rem` | 12px                  |
| `--spacing-lg`    | `1rem`    | 16px                  |
| `--spacing-xl`    | `1.5rem`  | 24px                  |
| `--spacing-2xl`   | `2rem`    | 32px                  |
| `--spacing-2_5xl` | `2.5rem`  | 40px                  |
| `--spacing-3xl`   | `3rem`    | 48px                  |

## Touch Targets

| Variable                | Value  | Usage                                                                                                                                                                                                                   |
| ----------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--touch-target-min`    | `44px` | WCAG 2.5.5 (AAA) minimum for interactive controls. A floor, not a fixed size — components may sit above it; page-local overrides must never resolve below it.                                                           |
| `--touch-target-min-aa` | `24px` | WCAG 2.5.8 (AA) minimum, for controls the ruling leaves at AA rather than AAA — the palette rail tabs and the swatch editor's sliders. Enforced by axe's `target-size` on every scanned route, not by the source guard. |

## Gap Variables

| Variable           | Value     | Usage                    |
| ------------------ | --------- | ------------------------ |
| `--gap-tight`      | `0.5rem`  | Small gaps between items |
| `--gap-normal`     | `0.75rem` | Standard gaps            |
| `--gap-wide`       | `1.5rem`  | Wide gaps                |
| `--gap-extra-wide` | `2rem`    | Extra-wide gaps          |

## Typography

| Variable                 | Value                                 |
| ------------------------ | ------------------------------------- |
| `--font-family`          | `'Helvetica Neue', Arial, sans-serif` |
| `--font-family-mono`     | `monospace`                           |
| `--font-weight-normal`   | `400`                                 |
| `--font-weight-semibold` | `600`                                 |
| `--font-weight-bold`     | `700`                                 |
| `--text-2xs`             | `0.65rem` (10.4px)                    |
| `--text-xs`              | `0.75rem` (12px)                      |
| `--text-sm`              | `0.875rem` (14px)                     |
| `--text-base`            | `1rem` (16px)                         |
| `--text-lg`              | `1.1rem` (17.6px)                     |
| `--text-xl`              | `1.25rem` (20px)                      |
| `--text-2xl`             | `1.5rem` (24px)                       |
| `--text-3xl`             | `2rem` (32px)                         |

## Transitions

| Variable              | Value                                | Usage                 |
| --------------------- | ------------------------------------ | --------------------- |
| `--transition-fast`   | `0.2s ease-out`                      | Hover, focus feedback |
| `--transition-normal` | `0.25s cubic-bezier(0.4, 0, 0.2, 1)` | Standard animations   |
| `--transition-slow`   | `0.3s cubic-bezier(0.4, 0, 0.2, 1)`  | Drawers, modals       |

## Shadows

| Variable      | Value                             | Usage                    |
| ------------- | --------------------------------- | ------------------------ |
| `--shadow-sm` | `0 2px 8px rgba(0, 0, 0, 0.1)`    | Subtle elevation         |
| `--shadow-md` | `0 4px 12px rgba(0, 0, 0, 0.15)`  | Medium elevation         |
| `--shadow-lg` | `-4px 0 20px rgba(0, 0, 0, 0.15)` | Large elevation (drawer) |

## Z-Index Scale

Canonical stacking tiers — use these instead of raw numeric `z-index` values. Higher value → higher in the stack. Tool-internal layers (map annotations, chart overlays) may use direct values for contextual reasons; prefer the variables otherwise.

| Variable               | Value   | Usage                                           |
| ---------------------- | ------- | ----------------------------------------------- |
| `--z-negative`         | `-1`    | Behind content (`body::before` background grid) |
| `--z-base`             | `1`     | Normal content stacking                         |
| `--z-raised`           | `5`     | Tool content layers (maps, charts)              |
| `--z-sticky`           | `10`    | Sticky headers, dropdowns anchored to content   |
| `--z-dropdown`         | `20`    | Floating menus, dropdowns                       |
| `--z-palette-panel`    | `30`    | Palette panel (`brand.astro`)                   |
| `--z-overlay`          | `50`    | General overlays                                |
| `--z-compliance-panel` | `60`    | Regulatory map compliance panel                 |
| `--z-modal`            | `1000`  | Modal base                                      |
| `--z-modal-overlay`    | `1001`  | Modal backdrop                                  |
| `--z-skip-nav`         | `10000` | Skip-nav link (top of page)                     |

---

## Component-Specific Variables

These variables exist for page sections and UI components that need distinct light/dark values.

### Section Backgrounds

| Variable             | Light             | Dark                       |
| -------------------- | ----------------- | -------------------------- |
| `--services-bg`      | `#eeeeee`         | `var(--bg-dark-tertiary)`  |
| `--footer-bg`        | `#eeeeee`         | `var(--bg-dark-tertiary)`  |
| `--cta-box-bg`       | `var(--bg-light)` | `var(--bg-dark-secondary)` |
| `--service-card-bg`  | `var(--bg-dark)`  | `var(--bg-dark-secondary)` |
| `--filter-drawer-bg` | `var(--bg-light)` | `var(--bg-dark-secondary)` |

### Filter UI

| Variable                      | Light                     | Dark                       |
| ----------------------------- | ------------------------- | -------------------------- |
| `--filter-chip-bg`            | `rgba(26,26,26, 0.05)`    | `var(--color-primary-10)`  |
| `--filter-chip-bg-hover`      | `rgba(26,26,26, 0.08)`    | `var(--color-primary-15)`  |
| `--filter-chip-bg-active`     | `#02724f`                 | `#05cd99`                  |
| `--filter-chip-border`        | `rgba(26,26,26, 0.1)`     | `var(--color-primary-20)`  |
| `--filter-chip-text`          | `rgba(26,26,26, 0.7)`     | `rgba(200,200,200, 0.8)`   |
| `--filter-chip-text-active`   | `#ffffff`                 | `#0a0a0a`                  |
| `--filter-button-bg`          | `rgba(26,26,26, 0.05)`    | `var(--color-primary-10)`  |
| `--filter-button-bg-hover`    | `rgba(26,26,26, 0.08)`    | `var(--color-primary-15)`  |
| `--filter-button-border`      | `rgba(26,26,26, 0.1)`     | `var(--color-primary-20)`  |
| `--filter-button-text`        | `rgba(26,26,26, 0.7)`     | `rgba(200,200,200, 0.8)`   |
| `--search-input-bg`           | `rgba(26,26,26, 0.02)`    | `var(--color-primary-05)`  |
| `--search-input-border`       | `rgba(26,26,26, 0.1)`     | `var(--color-primary-20)`  |
| `--search-input-focus-bg`     | `var(--bg-light)`         | `var(--bg-dark-secondary)` |
| `--search-input-focus-shadow` | `var(--color-primary-10)` | `var(--color-primary-15)`  |
| `--search-input-text`         | `rgba(26,26,26, 0.85)`    | `rgba(245,245,245, 0.85)`  |
| `--search-input-placeholder`  | `rgba(26,26,26, 0.5)`     | `rgba(200,200,200, 0.5)`   |
| `--clear-filters-text`        | `rgba(26,26,26, 0.6)`     | `rgba(200,200,200, 0.6)`   |
| `--clear-filters-border`      | `rgba(26,26,26, 0.1)`     | `var(--color-primary-20)`  |

### Section Text & Borders

| Variable                 | Light                      | Dark                       |
| ------------------------ | -------------------------- | -------------------------- |
| `--service-card-text`    | `#b0b0b0`                  | `#d0d0d0`                  |
| `--service-card-heading` | `var(--bg-light)`          | `var(--bg-light)`          |
| `--service-card-border`  | `var(--bg-dark-secondary)` | `#2a2a2a`                  |
| `--footer-text`          | `rgba(26,26,26, 0.85)`     | `rgba(153,153,153, 0.85)`  |
| `--footer-border`        | `rgba(26,26,26, 0.1)`      | `rgba(153,153,153, 0.15)`  |
| `--cta-box-text`         | `rgba(26,26,26, 0.85)`     | `rgba(200,200,200, 0.8)`   |
| `--stat-item-border`     | `var(--color-primary)`     | `var(--color-primary-20)`  |
| `--about-image-bg`       | `var(--bg-dark-tertiary)`  | `var(--bg-dark-secondary)` |
| `--about-image-border`   | `var(--bg-dark-secondary)` | `#2a2a2a`                  |
| `--about-image-text`     | `#404040`                  | `#808080`                  |

### Announcement Sash

The two tokens `.brutal-sash` reads (`src/styles/components/sash.css`). Everything else the band draws — borders, hover, the inverted `__badge` chip — is derived from these with `color-mix()`, so the sash follows all six palettes and both themes with no extra CSS.

| Variable     | Value                  | Usage                                           |
| ------------ | ---------------------- | ----------------------------------------------- |
| `--sash-bg`  | `var(--color-primary)` | The band. Colour is never a variant of the sash |
| `--sash-ink` | `var(--bg-dark)`       | The label, and the inverted badge's background  |

`--sash-ink` is re-pointed in `palettes.css` for `palette-1`, `-2`, `-3` and `-5`, whose light-theme primary is a dark saturated hue: those get `light-dark(var(--text-dark-primary), var(--bg-dark))`. Note the token names read backwards — `--text-dark-primary` is the LIGHT ink, i.e. text _for_ dark surfaces. `palette-0` and `palette-4` inherit the `:root` value deliberately.

### Miscellaneous

| Variable               | Light                 | Dark                       |
| ---------------------- | --------------------- | -------------------------- |
| `--checkerboard-line`  | `rgba(0,0,0, 0.032)`  | `rgba(255,255,255, 0.032)` |
| `--theme-toggle-color` | `rgba(74,74,74, 0.8)` | `rgba(200,200,200, 0.8)`   |

---

## Expanded Palette Tokens

Purpose-named base tokens that all tool-domain variables (TechPar, Diligence Machine, ICG, Regulatory Map) derive from. The `-rgb` triplets are the only tokens still overridden in `html.dark-theme` — RGB triplets are not `<color>` values, so `light-dark()` cannot express them.

| Variable                | Light                       | Dark                        | Usage                                                            |
| ----------------------- | --------------------------- | --------------------------- | ---------------------------------------------------------------- |
| `--color-authority`     | `#5b7a9d`                   | `#7a9dbd`                   | Authority/expertise accent (institutional credibility)           |
| `--color-authority-rgb` | `91, 122, 157`              | `122, 157, 189`             | RGB triplet for `rgba()` usage (dark value in `html.dark-theme`) |
| `--color-authority-bg`  | `rgba(91, 122, 157, 0.1)`   | `rgba(122, 157, 189, 0.1)`  | Authority theme background                                       |
| `--color-distinguish`   | `#8b5cf6`                   | `#a78bfa`                   | Differentiation accent                                           |
| `--color-subdued`       | `#8c7a6b`                   | `#a89888`                   | Muted neutral accent                                             |
| `--color-subdued-rgb`   | `140, 122, 107`             | `168, 152, 136`             | RGB triplet for `rgba()` usage (dark value in `html.dark-theme`) |
| `--color-subdued-bg`    | `rgba(140, 122, 107, 0.04)` | `rgba(168, 152, 136, 0.06)` | Subdued theme background                                         |

---

## TechPar Variables

Domain-specific variables for the TechPar tool, defined in `variables.css`. Zone, category, and KPI tokens derive from the core semantic tokens via `var(...)`; background and chart tokens carry their own `light-dark()` values.

### Zone Colors

| Variable                        | Light                     | Dark                       | Usage                              |
| ------------------------------- | ------------------------- | -------------------------- | ---------------------------------- |
| `--techpar-zone-underinvest`    | `var(--color-warning)`    | _(inherits)_               | Under-investment zone label/border |
| `--techpar-zone-underinvest-bg` | `rgba(204, 136, 0, 0.08)` | `rgba(255, 170, 51, 0.09)` | Under-investment zone background   |
| `--techpar-zone-ahead`          | `var(--color-success)`    | _(inherits)_               | Ahead-of-peers zone label/border   |
| `--techpar-zone-ahead-bg`       | `rgba(46, 168, 78, 0.08)` | `rgba(46, 168, 78, 0.09)`  | Ahead zone background              |
| `--techpar-zone-healthy`        | `var(--color-primary)`    | _(inherits)_               | Healthy zone label/border          |
| `--techpar-zone-healthy-bg`     | `var(--accent-light-bg)`  | _(inherits)_               | Healthy zone background            |
| `--techpar-zone-above`          | `var(--color-warning)`    | _(inherits)_               | Above-average zone label/border    |
| `--techpar-zone-above-bg`       | `rgba(204, 136, 0, 0.08)` | `rgba(255, 170, 51, 0.09)` | Above-average zone background      |
| `--techpar-zone-elevated`       | `var(--color-error)`      | _(inherits)_               | Elevated risk zone label/border    |
| `--techpar-zone-elevated-bg`    | `rgba(217, 54, 54, 0.08)` | `rgba(224, 80, 80, 0.09)`  | Elevated risk zone background      |
| `--techpar-zone-critical`       | `var(--color-error)`      | _(inherits)_               | Critical risk zone label/border    |
| `--techpar-zone-critical-bg`    | `rgba(184, 46, 46, 0.08)` | `rgba(224, 80, 80, 0.09)`  | Critical risk zone background      |

### Category Colors

| Variable                       | Light                      | Dark         | Usage                         |
| ------------------------------ | -------------------------- | ------------ | ----------------------------- |
| `--techpar-category-infra`     | `var(--color-primary)`     | _(inherits)_ | Infrastructure spend category |
| `--techpar-category-personnel` | `var(--color-authority)`   | _(inherits)_ | Personnel spend category      |
| `--techpar-category-rd-opex`   | `var(--color-distinguish)` | _(inherits)_ | R&D OpEx spend category       |
| `--techpar-category-rd-capex`  | `var(--color-secondary)`   | _(inherits)_ | R&D CapEx spend category      |

### Chart Colors

| Variable                       | Light                      | Dark                       | Usage                                   |
| ------------------------------ | -------------------------- | -------------------------- | --------------------------------------- |
| `--techpar-chart-band-fill`    | `var(--color-primary-15)`  | `var(--color-primary-13)`  | Healthy band fill                       |
| `--techpar-chart-band-border`  | `var(--color-primary-50)`  | `var(--color-primary-45)`  | Healthy band border                     |
| `--techpar-chart-ahead-fill`   | `rgba(33, 118, 174, 0.10)` | `rgba(56, 152, 214, 0.11)` | Ahead zone chart fill (blue — CVD-safe) |
| `--techpar-chart-ahead-border` | `rgba(33, 118, 174, 0.5)`  | `rgba(56, 152, 214, 0.5)`  | Ahead zone chart border                 |
| `--techpar-chart-under-fill`   | `rgba(224, 123, 0, 0.12)`  | `rgba(255, 140, 0, 0.12)`  | Under-investment chart fill (amber)     |
| `--techpar-chart-under-border` | `rgba(224, 123, 0, 0.55)`  | `rgba(255, 140, 0, 0.55)`  | Under-investment chart border           |
| `--techpar-chart-above-fill`   | `rgba(217, 54, 54, 0.10)`  | `rgba(240, 70, 70, 0.12)`  | Above-average chart fill (red)          |
| `--techpar-chart-above-border` | `rgba(217, 54, 54, 0.45)`  | `rgba(240, 70, 70, 0.50)`  | Above-average chart border              |
| `--techpar-chart-revenue-line` | `rgba(26, 26, 26, 0.55)`   | `rgba(200, 200, 200, 0.6)` | Revenue reference line                  |

### KPI Colors

| Variable                 | Light                  | Dark         | Usage                  |
| ------------------------ | ---------------------- | ------------ | ---------------------- |
| `--techpar-kpi-positive` | `var(--color-primary)` | _(inherits)_ | Positive KPI indicator |
| `--techpar-kpi-warn`     | `var(--color-warning)` | _(inherits)_ | Warning KPI indicator  |
| `--techpar-kpi-negative` | `var(--color-error)`   | _(inherits)_ | Negative KPI indicator |

---

## Shared Hub Tool Variables

Cross-tool semantic colors shared by multiple hub tools.

### Shared Colors

| Variable               | Light                    | Dark         | Usage                                      |
| ---------------------- | ------------------------ | ------------ | ------------------------------------------ |
| `--hub-authority-blue` | `var(--color-authority)` | _(inherits)_ | Authority/expertise theme color (DM + ICG) |

> Background variant: use `--color-authority-bg` (see [Expanded Palette Tokens](#expanded-palette-tokens)).

### Diligence Machine Domain Colors

| Variable                 | Light                     | Dark                     | Usage                         |
| ------------------------ | ------------------------- | ------------------------ | ----------------------------- |
| `--dm-methodology-brown` | `var(--color-subdued)`    | _(inherits)_             | Methodology theme color       |
| `--dm-results-blue`      | `var(--color-authority)`  | _(inherits)_             | Results theme accent          |
| `--dm-results-tan`       | `var(--color-subdued)`    | _(inherits)_             | Results theme secondary       |
| `--dm-positive`          | `var(--color-success)`    | _(inherits)_             | Positive indicator            |
| `--dm-negative`          | `var(--color-error)`      | _(inherits)_             | Negative/red flag indicator   |
| `--dm-negative-dark`     | `var(--color-error)`      | _(inherits)_             | Strong negative indicator     |
| `--dm-negative-dark-bg`  | `rgba(178, 34, 34, 0.06)` | `rgba(178, 34, 34, 0.1)` | Negative indicator background |
| `--dm-warning`           | `var(--color-warning)`    | _(inherits)_             | Warning indicator             |
| `--dm-warning-dark`      | `var(--color-warning)`    | _(inherits)_             | Strong warning indicator      |
| `--dm-success`           | `var(--color-success)`    | _(inherits)_             | Success indicator             |

### ICG Maturity Colors

| Variable                    | Light                  | Dark         | Usage                           |
| --------------------------- | ---------------------- | ------------ | ------------------------------- |
| `--icg-maturity-reactive`   | `var(--color-error)`   | _(inherits)_ | Reactive maturity level         |
| `--icg-maturity-aware`      | `var(--color-warning)` | _(inherits)_ | Aware maturity level            |
| `--icg-maturity-optimizing` | `var(--color-success)` | _(inherits)_ | Optimizing maturity level       |
| `--icg-maturity-strategic`  | `var(--color-primary)` | _(inherits)_ | Strategic maturity level (teal) |
| `--icg-radar-grid`          | `var(--text-muted)`    | _(inherits)_ | Radar chart grid lines          |
| `--icg-radar-label`         | `var(--text-muted)`    | _(inherits)_ | Radar chart axis labels         |

### Regulatory Map Category Colors

| Variable                     | Light                      | Dark         | Usage                             |
| ---------------------------- | -------------------------- | ------------ | --------------------------------- |
| `--regmap-category-industry` | `var(--color-distinguish)` | _(inherits)_ | Industry regulation category      |
| `--regmap-category-cyber`    | `var(--color-error)`       | _(inherits)_ | Cybersecurity regulation category |

---

## Quick Lookup by Purpose

| I need...               | Use                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------- |
| Primary text color      | `--text-primary`                                                                      |
| Secondary/body text     | `--text-secondary`                                                                    |
| Muted/label text        | `--text-muted`                                                                        |
| Page background         | `--bg-light`                                                                          |
| Card/section background | `--bg-light-alt`                                                                      |
| Primary accent          | `--color-primary`                                                                     |
| Borders (light)         | `--border-light` or `--color-primary`                                                 |
| Borders (dark theme)    | `--border-dark-default` (standard), `--border-dark-subtle`, `--border-dark-prominent` |
| Primary tint/glow       | `--color-primary-XX` (opacity scale) or `--accent-*-bg` (semantic)                    |
| Padding/margin          | `--spacing-sm` through `--spacing-3xl`                                                |
| Flex/grid gaps          | `--gap-tight` through `--gap-extra-wide`                                              |
| Stacking order          | `--z-base` through `--z-skip-nav` (Z-Index Scale)                                     |
| Quick interaction       | `--transition-fast`                                                                   |
| Standard animation      | `--transition-normal`                                                                 |
| Elevation               | `--shadow-sm`, `--shadow-md`, `--shadow-lg`                                           |

---

## Alternative Palette Variables (`palettes.css`)

Six alternative color palettes override the core tokens when applied to `<html>`. Defined in `src/styles/palettes.css`.

### Palette Alt-Color Definitions

Each palette defines light and dark theme variants for 6 core colors + 3 expanded tokens:

| Variable Pattern            | Description                        |
| --------------------------- | ---------------------------------- |
| `--altN-color-primary`      | Primary brand accent for palette N |
| `--altN-color-primary-dark` | Hover/pressed variant              |
| `--altN-color-secondary`    | Secondary emphasis                 |
| `--altN-color-success`      | Positive outcomes                  |
| `--altN-color-warning`      | Caution indicators                 |
| `--altN-color-error`        | Errors/critical states             |
| `--altN-color-authority`    | Institutional credibility accent   |
| `--altN-color-distinguish`  | Differentiation accent             |
| `--altN-color-subdued`      | Muted neutral                      |

Where N = 0–5. Palette 0 only overrides the 3 expanded tokens (production palette keeps core colors from `variables.css`). Palettes 1–5 override all 9 tokens plus derived accent/border/opacity scales.

### Palette Override Classes

Applied to `<html>` (like `dark-theme`):

```css
html.palette-1 {
  --color-primary: var(--alt1-color-primary); /* ... */
}
```

Also overrides `--color-primary-rgb`, `--border-dark`, `--accent-light-bg`, `--accent-light-bg-hover`, `--accent-border-light`, `--accent-border-medium`, and `--stat-item-border`.

### Tool Derivation

`html[class*="palette-"]` maps expanded tokens to all tool-domain variables (TechPar zones, DM domains, ICG maturity, RegMap categories) so tool pages automatically inherit palette changes.

---

## Adding New Variables

1. Check if an existing variable already covers your need
2. Add the token to `:root` in `variables.css` — use `light-dark(lightValue, darkValue)` for anything theme-dependent (the `html.dark-theme` block only carries `color-scheme` and the RGB-triplet overrides that `light-dark()` cannot express)
3. Use semantic names: `--component-property` (e.g., `--filter-chip-bg`)
4. Update this reference file — `npm run test:docs` fails until the new token is documented here

---

## Related Documentation

- **[/brand](https://globalstrategic.tech/brand)** — Live rendered swatches for every variable below, with computed hex values and dark theme comparison
- [BRAND_GUIDELINES.md](./BRAND_GUIDELINES.md) — Brand color palette, usage rules, and asset guidelines
- [STYLES_GUIDE.md](./STYLES_GUIDE.md) — CSS conventions and component patterns
- [TYPOGRAPHY_REFERENCE.md](./TYPOGRAPHY_REFERENCE.md) — Typography utility classes

---

**Last Updated**: July 28, 2026
**Parity**: every `:root` token in `variables.css` ↔ every table row here — machine-enforced by `tests/integration/docs-variables-sync.test.ts` (`npm run test:docs`); token counts are deliberately not stated (the test, not this footer, is the referee)
