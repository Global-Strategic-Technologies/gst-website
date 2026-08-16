# GST — read this first

**This is a CSS design system, not a React component library.** The generated
notes below are boilerplate and overstate what ships: `window.GST` is an **empty
object** and there are **no importable components**. GST's real components are
Astro (`.astro`) files, which have no React runtime to bundle.

What you get is the complete GST stylesheet — tokens, typography, palettes, and
the full `.brutal-*` component class vocabulary. **Build with ordinary JSX
elements and style them with the classes and tokens below.** Never invent a class
name: if a pattern has no class here, compose it from tokens in your own CSS.

## Setup

Link the one stylesheet (it carries everything):

```html
<link rel="stylesheet" href="styles.css" />
```

Theme and palette are classes on the **`<html>` element, never `<body>`**:

- `html.dark-theme` — dark mode. It sets `color-scheme: dark`, which is what
  makes every `light-dark()` token resolve to its dark value. Tokens switch
  automatically; you write no dark-mode CSS. Verified against this bundle:
  `--text-primary` `#1a1a1a`→`#f5f5f5`, `--bg-light` `#fff`→`#0a0a0a`,
  `--bg-light-alt` `#f5f5f5`→`#141414`.

  **It only works on the root element.** Putting `.dark-theme` or
  `color-scheme: dark` on a nested `<div>` does nothing — the tokens are declared
  on `:root`, so a subtree cannot opt in. There is no "dark section" of an
  otherwise light page.

  **Two tokens deliberately do NOT switch**: `--color-primary` (the teal is
  identical in both themes) and `--border-light` (light-only — in dark use
  `--border-dark-subtle` / `--border-dark-default` / `--border-dark-prominent`,
  or `light-dark()` inline). A `--border-light` border on a dark surface is
  invisible.

- `html.palette-0` … `html.palette-5` — six alternative brand palettes that
  re-point `--color-primary` and friends. Any UI built from tokens follows them
  for free; any hardcoded color does not.

## The idiom

Two rules cover almost everything:

1. **Every color, space, font-size, radius, and transition comes from a
   `var(--token)`.** Hardcoded values are a lint error in this repo, and they
   break dark mode and all six palettes.
2. **Reach for a `.brutal-*` class before writing CSS.** Style your own layout
   glue with tokens.

### Token families (real names — use these verbatim)

| Family        | Tokens                                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| Brand         | `--color-primary` (teal `#05cd99`), `--color-secondary`, `--color-tertiary`, `-dark` variants                     |
| Primary tints | `--color-primary-02` … `--color-primary-65` (opacity scale)                                                       |
| Status        | `--color-success`, `--color-warning`, `--color-error`, `--color-info`                                             |
| Text          | `--text-primary`, `--text-secondary`, `--text-muted`                                                              |
| Surfaces      | `--bg-light`, `--bg-light-alt`, `--surface-*-bg` (faint/subtle/muted/panel/overlay/tint/veil/sheen/neutral/input) |
| Borders       | `--border-light`, `--border-hairline`, `--border-dark-subtle/-default/-prominent`                                 |
| Accents       | `--accent-light-bg`, `--accent-dark-bg`, `--accent-tint-bg`, `--accent-border-light/-medium`                      |
| Spacing       | `--spacing-xs` … `--spacing-3xl` (plus `--spacing-2_5xl`), `--gap-tight/-normal/-wide/-extra-wide`                |
| Type scale    | `--text-2xs` … `--text-3xl`, `--font-weight-normal/-semibold/-bold`, `--font-family`, `--font-family-mono`        |
| Motion        | `--transition-fast`, `--transition-normal`, `--transition-slow`                                                   |
| Elevation     | `--shadow-sm/-md/-lg`, `--frost-highlight`, `--frost-edge`, `--scrim-15` … `--scrim-60`                           |
| Layering      | `--z-base`, `--z-sticky`, `--z-dropdown`, `--z-overlay`, `--z-modal`, `--z-modal-overlay`, `--z-skip-nav`         |
| Touch         | `--touch-target-min` (44px, AAA), `--touch-target-min-aa` (24px floor)                                            |

Need a tint with no token? Use `color-mix(in srgb, var(--color-success) 12%, transparent)` —
it stays correct across themes and palettes. Never a frozen `rgba()`.

### Class families (real names)

| Purpose       | Classes                                                                                                                                                                                                                                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typography    | `.brutal-heading-xl/-lg/-md/-sm`, `.brutal-text-base/-small/-tiny`, `.brutal-label`, `.brutal-label-small`, `.brutal-data`, `.brutal-data-sm`                                                                                                                                                            |
| Buttons       | `.brutal-btn` + `--primary` / `--secondary` / `--full`; `.cta-button`; `.brutal-choice-btn`                                                                                                                                                                                                              |
| Cards         | `.brutal-option-card`, `.brutal-trust-card`, `.brutal-gateway-card` (+ `.brutal-gateway-grid`), `.brutal-rec-card`, `.brutal-attention-card` (+ `--medium`/`--high`), `.brutal-project-card` — **there is no generic `.brutal-card`**                                                                    |
| Containers    | `.container` (page width), `.brutal-tool-shell` + `--narrow`/`--wide`/`--document`/`--fluid`, with `.brutal-tool-shell__content` inside for responsive padding; `.brutal-panel`; hero text uses `.brutal-hero__title` / `.brutal-hero__description` / `.brutal-hero__trustline` (no bare `.brutal-hero`) |
| Data          | `.brutal-bench-table`, `.brutal-stat-tile`, `.brutal-callout` (+ `--warning`), `.brutal-progress-bar`, `.brutal-breadcrumb`                                                                                                                                                                              |
| Forms         | `.brutal-input`, `.brutal-field`, `.brutal-search`, `.brutal-segmented` (+ `--sm`/`--wide`), `.brutal-filter-chip` (+ `--active`), `.brutal-filter-chips`                                                                                                                                                |
| Frosted glass | `.brutal-frosted` (3px), `--heavy` (6px), `--blur-only` (1.5px), `--overlay` (12px)                                                                                                                                                                                                                      |
| Skeletons     | `.brutal-skeleton-bar` (+ `--sm`), `.brutal-skeleton-dot`                                                                                                                                                                                                                                                |
| Utilities     | `.flex-center`, `.flex-between`, `.text-uppercase`, `.text-label`, `.interactive`, `.link-interactive`, `.focus-outline`, `.focus-outline-sm`, `.sr-only`, `.delta-chevron`                                                                                                                              |

`.brutal-btn` already carries the frosted-glass treatment (`backdrop-filter`, inset
highlight) — don't re-add it.

### BEM sub-elements (these are not optional)

Most families style their **children** via `__` sub-elements. Using the block class
alone renders unstyled content — the specimen cards show every one of these in place:

| Block                    | Required children                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `.brutal-stat-tile`      | `__value`, `__label`                                                                      |
| `.brutal-progress-bar`   | `__track`, `__fill` (set `width` inline), `__label`                                       |
| `.brutal-callout`        | `__title` (then body text as a bare sibling)                                              |
| `.brutal-rec-card`       | `__body`, `__title`, `__desc`, `__badge` (+ `--high`/`--effort`), `__na`                  |
| `.brutal-attention-card` | `__header`, `__title`, `__desc`                                                           |
| `.brutal-gateway-card`   | `__header` (wraps an `<h2>`), `__features` (a `<ul>`), `__cta` (paired with `cta-button`) |
| `.brutal-field`          | `__label` (NOT `.brutal-label-small`)                                                     |
| `.brutal-segmented`      | `__btn` (+ `__btn--active`)                                                               |
| `.brutal-tool-shell`     | `__content`, `__authority`, `__section-label`                                             |

Gateway cards pair the block with `.brutal-frosted` and sit inside
`.brutal-gateway-grid`.

### Layout conventions

- **Desktop-first.** Base rules are desktop; override at `@media (max-width: 768px)`
  then `@media (max-width: 480px)`.
- **Grids own columns; cards own themselves.** Never put `max-width` or
  `margin: 0 auto` on a card. Use
  `grid-template-columns: repeat(auto-fill, minmax(<floor>, 1fr))` and collapse to
  `1fr` at 768px.
- **Interactive controls** get `min-height: var(--touch-target-min)`.

### Brand delta

The GST mark is a triangle, always `stroke="currentColor"` so it follows theme and
palette. Inline it — the `.delta-chevron` utility animates it as a collapse toggle:

```jsx
<svg className="delta-chevron" viewBox="0 0 64 64" fill="none">
  <path
    d="M32 12 L52 52 L12 52 Z"
    fill="none"
    stroke="currentColor"
    stroke-width="6"
    stroke-linejoin="miter"
  />
</svg>
```

## Where the truth lives

- `styles.css` → `_ds_bundle.css` — the entire shipped system. **Read it** to
  confirm a class or token before using it.
- `guidelines/src/docs/styles/` — `VARIABLES_REFERENCE.md` (full token catalog),
  `STYLES_GUIDE.md` (conventions + anti-patterns), `BRAND_GUIDELINES.md` (color
  hierarchy, palettes), `TYPOGRAPHY_REFERENCE.md`.

## Idiomatic example

```jsx
<section className="container">
  <h2 className="brutal-heading-lg">Portfolio</h2>
  <p className="brutal-text-base">Technical diligence across the deal lifecycle.</p>

  <div className="brutal-gateway-grid">
    <article className="brutal-gateway-card brutal-frosted">
      <div className="brutal-gateway-card__header">
        <h2>Tech Debt Calculator</h2>
      </div>
      <ul className="brutal-gateway-card__features">
        <li>Quantify remediation cost before you sign</li>
        <li>Executive-ready output in minutes</li>
      </ul>
      <a href="#" className="cta-button brutal-gateway-card__cta">
        Open tool
      </a>
    </article>
  </div>

  <div style={{ display: 'flex', gap: 'var(--gap-normal)', marginTop: 'var(--spacing-xl)' }}>
    <div className="brutal-stat-tile">
      <span className="brutal-data">42</span>
      <span className="brutal-label-small">Engagements</span>
    </div>
  </div>
</section>
```

Note the layout glue: flex and gaps written inline, but every _value_ is a token.

---
