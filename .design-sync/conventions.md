# GST — read this first

**This is a CSS design system, not a React component library.** The generated
notes below are boilerplate and overstate what ships: the only exports on
`window.GST` are ten `*Specimen` **galleries** — documentation that draws
every variant of a class family at once. **Never render a `*Specimen` inside a
design**; copy the markup it shows. There are **no importable UI components**:
GST's real components are Astro (`.astro`) files, which have no React runtime
to bundle.

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

- **Brand** — `--color-primary` (teal `#05cd99`), `--color-secondary`, `--color-tertiary`, `-dark` variants; `--color-primary-rgb` (triplet for `rgba()`)
- **Primary tints** — `--color-primary-02` … `--color-primary-65` (opacity scale)
- **Status** — `--color-success`, `--color-warning`, `--color-error`, `--color-info`
- **Semantic hub** — `--color-authority` (institutional blue-grey, + `-rgb`/`-bg`), `--color-distinguish` (violet, differentiation), `--color-subdued` (warm neutral, + `-rgb`/`-bg`), `--hub-authority-blue`, `--color-editors-pick` (+ `-hover`)
- **Text** — `--text-primary`, `--text-secondary`, `--text-muted`
- **Surfaces** — `--bg-light`, `--bg-light-alt`, `--surface-*-bg` (faint/subtle/muted/panel/overlay/tint/veil/sheen/neutral/input)
- **Dark literals** — `--bg-dark`, `--bg-dark-secondary`, `--bg-dark-tertiary`, `--text-dark-primary/-secondary/-muted`, `--text-light-primary/-secondary/-muted` — the raw ends of a `light-dark()` pair; use inside `light-dark()` when a token has no theme-aware form
- **Borders** — `--border-light`, `--border-hairline`, `--border-dark`, `--border-dark-subtle/-default/-prominent`
- **Accents** — `--accent-light-bg` (+ `-hover`), `--accent-dark-bg`, `--accent-tint-bg`, `--accent-subtle-bg`, `--accent-wash-bg`, `--accent-faint-bg`, `--accent-border-light/-medium`
- **Spacing** — `--spacing-xs` … `--spacing-3xl` (plus `--spacing-2_5xl`), `--gap-tight/-normal/-wide/-extra-wide`
- **Type scale** — `--text-2xs` … `--text-3xl`, `--font-weight-normal/-semibold/-bold`, `--font-family`, `--font-family-mono`
- **Motion** — `--transition-fast`, `--transition-normal`, `--transition-slow`
- **Elevation** — `--shadow-sm/-md/-lg`, `--frost-highlight`, `--frost-edge`, `--scrim-15` … `--scrim-60`
- **Layering** — `--z-negative`, `--z-base`, `--z-raised`, `--z-sticky`, `--z-dropdown`, `--z-overlay`, `--z-modal`, `--z-modal-overlay`, `--z-skip-nav`
- **Touch** — `--touch-target-min` (44px, AAA), `--touch-target-min-aa` (24px floor)
- **Announcement sash** — `--sash-bg` (always `--color-primary`), `--sash-ink` (re-pointed per palette in `palettes.css` for the four whose light-theme primary is a dark hue). `__badge` simply swaps the two; the borders and the hover mix `--sash-bg` toward `--bg-dark` (68% / 82%) with `color-mix()`. Nothing in the family is a literal colour, so it follows every palette and both themes with no extra CSS
- **Dataviz scales** — **Use these for any chart, gauge or scoring band — never invent chart colours.** TechPar: `--techpar-zone-*` (healthy/elevated/critical/underinvest/ahead/above, each + `-bg`), `--techpar-category-*` (infra/personnel/rd-opex/rd-capex), `--techpar-kpi-positive/-negative/-warn`, `--techpar-chart-*` (band/ahead/above/under `-fill`/`-border`, `revenue-line`). ICG: `--icg-maturity-reactive/-aware/-strategic/-optimizing`, `--icg-radar-grid/-label`. Diligence Machine: `--dm-positive/-negative/-success/-warning`, `--dm-results-blue/-tan`, `--dm-methodology-brown`. Regulatory map: `--regmap-category-industry/-cyber`

Need a tint with no token? Use `color-mix(in srgb, var(--color-success) 12%, transparent)` —
it stays correct across themes and palettes. Never a frozen `rgba()`.

### Class families (real names)

- **Typography** — `.brutal-heading-xl/-lg/-md/-sm`, `.brutal-text-base/-small/-tiny`, `.brutal-label`, `.brutal-label-small`, `.brutal-data`, `.brutal-data-sm`, `.brutal-content-label`
- **Buttons** — `.brutal-btn` + `--primary` / `--secondary` / `--full` / `--copied` (transient copy-feedback state); `.cta-button`; `.brutal-choice-btn` (+ `--selected`/`--unsure`); `.brutal-na-btn`
- **Cards** — `.brutal-option-card` (+ `--selected`/`--selected-outline`/`--unsure`/`--compact`, in `.options-grid`), `.brutal-trust-card`, `.brutal-gateway-card` (+ `.brutal-gateway-grid`), `.brutal-teaser-card`, `.brutal-rec-card`, `.brutal-attention-card` (+ `--medium`/`--high`), `.brutal-project-card`, `.brutal-faq` (+ `--lg`) — **there is no generic `.brutal-card`**
- **Containers** — `.container` (page width), `.brutal-tool-shell` + `--narrow`/`--wide`/`--document`/`--fluid`, with `.brutal-tool-shell__content` inside for responsive padding; `.brutal-panel`; hero text uses `.brutal-hero__title` / `.brutal-hero__description` / `.brutal-hero__trustline` (no bare `.brutal-hero`)
- **Hub-tool chrome** — `.tool-action-bar` (+ `--center`/`--end`/`--bordered`/`--frosted`/`--stack`), `.tool-tab-bar` + `.tool-tab` (+ `--active`), `.tool-wizard-progress` + `.tool-wizard-step` (+ `--completed`/`--active`/`--reachable`), `.tool-wizard-progress-mobile` + `.tool-wizard-dot`, `.tool-methodology` (+ `--delta`), `.tool-bench-note` — see ToolChromeSpecimen
- **Navigation** — `.brutal-breadcrumb`, `.brutal-tab-bar` + `.brutal-tab` (+ `--active`/`--done`), `.brutal-search`, `.skip-nav`; `.toc` (owned by the `TableOfContents` component — its `__heading/__list/__sublist/__layer/__separator/__chevron` classes ship, but the runtime that builds sublists and sets `is-active` does not)
- **Announcement sash** — `.brutal-sash-corner` (the clipping corner box) wrapping `.brutal-sash` (the rotated band, which is itself the link) and, optionally, `.brutal-sash-under` (a smaller sibling subtext band below it); corner variant `--card`; `.brutal-sash--flat` is **documentation only** — the unrotated band, so a gallery can show it in a row. Rendered in production by `Sash.astro` off an announcement registry. It has no card of its own and is NOT in the `SiteHeader` slice — see the reference markup at the end of this file
- **Data** — `.brutal-bench-table`, `.brutal-stat-tile`, `.brutal-callout` (+ `--warning`), `.brutal-progress-bar`, `.editors-pick-tag`; `.brutal-stat__value/__label` and `.brutal-cta__title/__description` are mono-font **modifiers only** (no block, no size — pair with your own layout)
- **Forms** — `.brutal-input`, `.brutal-field`, `.brutal-slider`, `.brutal-segmented` (+ `--sm`/`--wide`), `.brutal-filter-chip` (+ `--active`), `.brutal-filter-chips`, `.brutal-filter-drawer`
- **Frosted glass** — `.brutal-frosted` (3px), `--heavy` (6px), `--blur-only` (1.5px), `--overlay` (6px + a 92%-opaque surface, for sheets/drawers)
- **Skeletons** — `.brutal-skeleton-bar` (+ `--sm`), `.brutal-skeleton-dot`
- **Utilities** — `.flex-center`, `.flex-between`, `.text-uppercase`, `.text-label`, `.interactive`, `.link-interactive`, `.focus-outline`, `.focus-outline-sm`, `.sr-only`, `.no-print`, `.delta-chevron`, `.bullet-icon`
- **State classes** — JS toggles these on a block; the CSS keys on them: `.is-collapsed` (hides a card body / TOC list, un-rotates its `.delta-chevron`), `.is-dismissed` (fades a rec/attention card), `.is-active` (current TOC link)

`.brutal-btn`, `.brutal-choice-btn`, `.brutal-search`, `.brutal-segmented`,
`.brutal-option-card`, `.brutal-tool-shell` and `.tool-tab-bar` already carry the
frosted-glass treatment (`backdrop-filter`, inset highlight) — don't re-add it, on any
of them. On `.brutal-segmented` the frost is on the container; the segments stay
transparent and `--active` stays a solid fill so the selected state reads. Nesting a
frosted surface inside another double-blurs — one pane owns the glass.

**Not documented on purpose** (page one-offs, fine to ignore): the regulatory-map
families `.brutal-timeline-*`, `.brutal-map-*`, `.brutal-quick-zoom`, `.brutal-reg-card`,
`.brutal-legend`,
`.brutal-bottom-sheet`; `.legal-page-*`; the `/brand`-only demo boxes `.brutal-shadow`,
`.brutal-skeleton-demo`, `.brutal-transition`, `.brutal-interactive`, `.brutal-link-interactive`,
`.brutal-focus-outline`. If you see one in `styles.css`, that is why it is not here.

### BEM sub-elements (these are not optional)

Most families style their **children** via `__` sub-elements. Using the block class
alone renders unstyled content — the specimen cards show every one of these in place:

- **`.brutal-stat-tile`** — `__value`, `__label`
- **`.brutal-progress-bar`** — `__track`, `__fill` (set `width` inline), `__label`
- **`.brutal-callout`** — `__title` (then body text as a bare sibling)
- **`.brutal-rec-card`** — `__body`, `__title`, `__desc`, `__badge` (+ `--high`/`--effort`), `__na`, `__text` (title row of a collapsible card)
- **`.brutal-attention-card`** — `__header`, `__title`, `__desc`
- **`.brutal-gateway-card`** — `__header` (wraps an `<h2>`), `__features` (a `<ul>`), then either `__cta` (paired with `cta-button`) or `__badge` (status pill)
- **`.brutal-teaser-card`** — `__header` (wraps an `<h2>`), `__features` (a `<ul>`), `__badge`, `__cta` (also a `.brutal-btn`)
- **`.brutal-option-card`** — `__label` (may wrap an `__icon` delta), `__description`; a `<button>` — grid it with `.options-grid`
- **`.brutal-project-card`** — `__header` › `__title`, `__industry`, `__year`; `__metrics` › `__value` (+ `--arr`); `__summary`; `__tags` › `__tag` (+ `--theme`); `__cta`
- **`.brutal-faq`** — `__item` (a `<details>`), `__question` (its `<summary>`), `__answer`
- **`.brutal-field`** — `__label` (NOT `.brutal-label-small`), `__input` (NOT `.brutal-input` — the field variant is full-width and larger), `__req`, `__hint` (+ `--warn`); adorned inputs wrap in `__input-wrap` with `__prefix` / `__suffix` and `__input--has-prefix` / `--has-suffix`
- **`.brutal-slider`** — `__header` › `__label`, `__value`; `__input` (an `<input type="range">`); `__hints` › `__direct` (an `<input type="number">`); `__clamp-msg`
- **`.brutal-segmented`** — `__btn` (+ `__btn--active`)
- **`.brutal-filter-drawer`** — `__header` › `__title`, `__close`; `__content` › `__clear`, `__section` › `__label` + `.brutal-filter-chips`
- **`.brutal-search`** — `__icon`, `__input`, `__clear`; results are a **sibling** `__results` › `__result` (+ `--active`) › `__result-name`, `__result-meta` › `__category` (+ `--privacy`/`--ai`/`--industry`/`--cyber`); `__no-results`
- **`.brutal-breadcrumb`** — `__list` (an `<ol>`) › `__item` › link + `__sep`; the current crumb is `<span aria-current="page">` — that attribute is what styles it
- **`.brutal-sash`** — `__label`, `__badge` (a chip inverting the two sash tokens, so it cannot lose contrast against the band), `__detail` (drops at 768px). The band element carries the href itself; there is no separate link child. `.brutal-sash-under` is a SIBLING block, not a `__` element: the optional subtext band below the main one (page scale + desktop only, drops at 768px with `__detail`), inverting the same two tokens — that inversion is its only colorway; the family's color-mix derivations fail AA as text backgrounds and must not be used as under-band fills
- **`.brutal-bench-table`** — rows of two `<td>`s; `__active` on the highlighted `<tr>`; `__label` (+ `--score`/`--stage`) pills inside the first cell
- **`.brutal-panel`** — `__header` › `__title`, `__copy` (+ `--copied`), `__count`
- **`.brutal-tab-bar`** — `.brutal-tab` › `__label`, optional `__icon`, `__badge` (+ `--on`)
- **`.tool-tab-bar`** — `.tool-tab` › `__label`, optional `__icon`
- **`.tool-wizard-progress`** — `.tool-wizard-step` › `__icon` (64×64 delta svg containing a `<text>` with `__number`), `__label`
- **`.tool-methodology`** — `__trigger` (the `<summary>`, direct child), `__body` › `__heading`, `__updated`, `__author` › `__author-name`, `__author-sep`, `__author-link`
- **`.brutal-tool-shell`** — `__content`, `__authority`, `__section-label`

Gateway cards pair the block with `.brutal-frosted` and sit inside
`.brutal-gateway-grid`.

### Layout conventions

- **Desktop-first.** Base rules are desktop; override at `@media (max-width: 768px)`
  then `@media (max-width: 480px)`. Some page layouts add a 1024px tablet tier for
  multi-column collapses; the system's own classes only use 768 and 480.
- **`.container`** is `max-width: 1600px; margin: 0 auto; padding: 0 3rem` — 1.5rem at
  768px, 1rem at 480px. Put it inside a `<section>`, not the other way round.
- **Grids own columns; cards own themselves.** Never put `max-width` or
  `margin: 0 auto` on a card. Use
  `grid-template-columns: repeat(auto-fill, minmax(<floor>, 1fr))` and collapse to
  `1fr` at 768px.
- **Interactive controls** get `min-height: var(--touch-target-min)`.

### Rules the CSS assumes but never states

- **No border radius.** Everything is square — `border-radius: 0` (the only exceptions
  are the skeleton bar's 4px and the skeleton dot). Do not round a corner.
- **Elevation is borders, not shadows.** Weight comes from `2px`/`3px` borders and a
  primary-colour edge (top or left rule); `--shadow-*` are hairline definition, never a
  blurred drop shadow. Hover/active states change border colour, text colour and
  background — never `transform: scale()`, never blur.
- **Focus ring recipe**: `outline: 2px solid var(--color-primary); outline-offset: 2px`
  on `:focus-visible` (offset `0.25rem` on links, `-2px` on tabs). Never `outline: none`
  without a replacement.
- **Type is monospace and tracked.** Labels and headings use `--font-family-mono`,
  uppercase, with letter-spacing `0.04em` (heading-xl/lg), `0.06em` (heading-md/sm,
  field labels), `0.1em` (small labels), `0.12em` (`.brutal-label`). Body copy is
  `1.7`/`1.6`/`1.5` line-height for base/small/tiny. There is no medium weight token — normal, semibold or bold.
- **Motion is minimal.** The only animations in the system are the skeleton pulse and
  the delta-chevron rotation; everything else is a `--transition-*` on colour/border.
  The system ships **no** global `prefers-reduced-motion` rule — if you add motion,
  wrap it in `@media (prefers-reduced-motion: reduce)` yourself.
- **Icons are inline SVG in `currentColor`.** No icon font, no `<img>` icons — see
  "Brand delta" below; other glyphs (search, close, link) are 14–16px stroke SVGs.
- **The sash's geometry moves in threes.** `.brutal-sash-corner`'s size, the band's `top`
  and the band's `width` are one set: the band is centred on the 45° chord of its box, so
  changing one without the others slides it off the corner. The pairs are 200/50/260
  (desktop), 170/42/220 (≤768), 140/34/190 (≤540) and 104/26/150 (`--card`). The
  responsive steps key on `.brutal-sash-corner:not(.brutal-sash-corner--card)`, so the page
  scale steps down and `--card` is fixed at every width. Below 512px the page
  sash is not rendered at all — the header nav, which
  reserves a matching corner for it, has no room left to yield. The optional
  `.brutal-sash-under` adds a desktop-only fourth: top 79 / left −40 / width 300 — the
  negative `left` centres it on its OWN visible chord so the corner clips both ends
  symmetrically — and in production its presence conditionally widens the nav's desktop
  corner reserve; it has no smaller tiers (it drops at 768px with `__detail`).

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

## Site chrome — rendered production markup

The classes above are the **content-level** vocabulary. The site's chrome — header,
hero, footer, the home-page sections, CTA band, stats bar, breadcrumb, hub landing —
is styled by Astro-scoped rules that live in `styles.css` **nowhere**: they are keyed on
`data-astro-cid-*` attributes and ship only with their component. So those pieces are
published as **cards extracted from the production build**, under
`components/chrome/<Name>/`:

`SiteHeader`, `Hero`, `WhoWeSupport`, `WhatWeDo`, `WhyClientsTrustUs`, `CtaSection`,
`SiteFooter` (each also as a `…Dark` twin), `Breadcrumb`, `StatsBar`, `EngagementFlow`,
`HubToolsLanding`, `TableOfContents`.

To build a GST **page** rather than a card: `read_file("components/chrome/<Name>/<Name>.prompt.md")`,
copy the markup **and** the CSS block it carries, and keep the `data-astro-cid-*`
attributes exactly — the rules key on them. Everything else those pieces need (tokens,
`.brutal-*` classes) comes from `styles.css`. Hydrated behaviour (theme toggle, menus,
scroll-spy) is not included. Nothing in these cards is hand-authored: they are slices of
the built site, re-extracted on every sync.

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
      <div className="brutal-stat-tile__value">42</div>
      <div className="brutal-stat-tile__label">Engagements</div>
    </div>
  </div>
</section>
```

Note the layout glue: flex and gaps written inline, but every _value_ is a token.

### Announcement sash — the one family with no card

Every other family is either drawn by a `*Specimen` gallery or sliced into
`components/chrome/`. The sash is neither: `BaseLayout.astro` renders it as a
`<body>`-level sibling **before** `<Header/>`, so the `header.site-header` slice cannot
contain it, and it has a real component behind it (`Sash.astro`), which rules a specimen
out. So this is its reference markup, transcribed from the built home page rather than
written by hand — `class` → `className` and the analytics hook dropped, nothing else
changed:

```jsx
<div className="brutal-sash-corner">
  <a
    className="brutal-sash"
    href="/hub/mcp/"
    aria-label="New: GST MCP — automate analysis, free pilot tier — open the linked page"
  >
    <span className="brutal-sash__badge">New</span>
    <span className="brutal-sash__label">GST MCP</span>
  </a>
  <span className="brutal-sash-under" aria-hidden="true">
    Automate analysis | Free pilot tier
  </span>
</div>
```

Both bands' copy runs against strict, measured width budgets (`Sash.astro` documents
them: ~16 characters across the main band's segments with a badge, ≤ 36 on the
under-band). The under-band is aria-hidden — its text is composed into the `<a>`'s
aria-label instead (spelled out above so the pipe is not spoken as "vertical line").
A `__detail` segment (rule-separated, after the label) also exists on the main band;
the live entry currently uses none — do not pad the label out when one is present.

The corner box must be a child of whatever the sash overlays — `<body>` in production —
and that element needs `position: relative` unless it is the page itself. When the sash is
decorative inside a card that is already a link, swap the `<a>` for a
`<span aria-hidden="true">`; that is what `--card` is for.

---
