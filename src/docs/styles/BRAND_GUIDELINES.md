# GST Brand Color & Style Guidelines

Complete brand palette, usage rules, and asset guidelines for the GST website.

---

## Brand Colors

### Primary Palette

| Role                  | Hex                                  | Variable               | Usage                                                |
| --------------------- | ------------------------------------ | ---------------------- | ---------------------------------------------------- |
| **Primary Teal**      | `#05cd99`                            | `--color-primary`      | Links, borders, buttons, active states, brand accent |
| **Primary Teal Dark** | `#04a87a`                            | `--color-primary-dark` | Hover/pressed states, emphasis                       |
| **Secondary Amber**   | `#CC8800` (light) / `#FFAA33` (dark) | `--color-secondary`    | Secondary accents, warnings, alternative highlights  |

### Neutral Backgrounds

| Role              | Hex       | Variable                       | Usage                                  |
| ----------------- | --------- | ------------------------------ | -------------------------------------- |
| **White**         | `#ffffff` | `--bg-light`                   | Primary page background (light theme)  |
| **Off-white**     | `#f5f5f5` | `--bg-light-alt`               | Secondary background — sections, cards |
| **Light gray**    | `#eeeeee` | `--services-bg`, `--footer-bg` | Services section, footer               |
| **Near black**    | `#0a0a0a` | `--bg-dark`                    | Primary background (dark theme)        |
| **Dark gray**     | `#1a1a1a` | `--bg-dark-secondary`          | Secondary dark background              |
| **Dark charcoal** | `#141414` | `--bg-dark-tertiary`           | Tertiary dark background               |

### Text Colors

Text colors use opacity-based rgba values for consistent contrast against backgrounds. See [VARIABLES_REFERENCE.md](./VARIABLES_REFERENCE.md#text-colors) for full values.

| Role      | Light Theme            | Dark Theme                |
| --------- | ---------------------- | ------------------------- |
| Primary   | `rgba(26,26,26, 0.95)` | `rgba(245,245,245, 0.95)` |
| Secondary | `rgba(26,26,26, 0.7)`  | `rgba(200,200,200, 0.8)`  |
| Muted     | `rgba(26,26,26, 0.6)`  | `rgba(200,200,200, 0.6)`  |
| Faded     | `rgba(26,26,26, 0.5)`  | `rgba(200,200,200, 0.5)`  |

---

## Typography

| Property            | Value                             |
| ------------------- | --------------------------------- |
| **Font family**     | Helvetica Neue, Arial, sans-serif |
| **Normal weight**   | 400                               |
| **Semibold weight** | 600                               |
| **Bold weight**     | 700                               |

See [TYPOGRAPHY_REFERENCE.md](./TYPOGRAPHY_REFERENCE.md) for the full set of semantic text utility classes.

---

## Brand Asset: Delta Icon

The GST delta triangle icon is the primary brand mark. It appears as:

- Navigation logo element
- Collapse/expand toggle indicator (`.delta-chevron` in `interactions.css`)
- CSS pseudo-element decorator via mask-image technique
- **Attention/action indicator** in `--color-secondary` (gold) — signals user interaction points

**SVG source**: `/images/logo/gst-delta-icon-teal-stroke-thick.svg`

**Usage rules**:

- Render in `--color-primary` (teal) for branding and decoration
- Render in `--color-secondary` (gold) to signal attention or required user action (e.g., CTAs, interactive prompts)
- Use `currentColor` for stroke when the parent element controls color contextually
- Use the stroke variant for inline/decorative uses
- Scale proportionally; do not distort aspect ratio
- See [STYLES_GUIDE.md — Brand Assets in CSS](./STYLES_GUIDE.md#brand-assets-in-css) for the CSS mask-image pattern

---

## Design Grid

- **Checkerboard pattern**: 50px grid, rendered via `body::before` with `--checkerboard-line` color
- Light theme: `rgba(0,0,0, 0.08)` — subtle dark lines on white
- Dark theme: `rgba(255,255,255, 0.08)` — subtle light lines on dark

---

## Domain Color Families

These colors are tool-specific, not brand-level. They are defined as CSS variables for consistency and dark theme support but are not part of the core brand palette.

### Authority Blue (Shared: Diligence Machine + ICG)

| Theme | Value     | Variable               |
| ----- | --------- | ---------------------- |
| Light | `#5b7a9d` | `--hub-authority-blue` |
| Dark  | `#7a9dbd` | `--hub-authority-blue` |

Used for authority/expertise-themed elements across hub tools.

### Diligence Machine Domain Colors

See [VARIABLES_REFERENCE.md — Diligence Machine Domain Colors](./VARIABLES_REFERENCE.md#diligence-machine-domain-colors).

### ICG Maturity Colors

See [VARIABLES_REFERENCE.md — ICG Maturity Colors](./VARIABLES_REFERENCE.md#icg-maturity-colors).

### TechPar Zone & Chart Colors

See [VARIABLES_REFERENCE.md — TechPar Variables](./VARIABLES_REFERENCE.md#techpar-variables).

---

## Company Name

**Legal name**: Global Strategic Technologies LLC

**Approved references**:

- "Global Strategic Technologies" — full company name
- "GST" — abbreviation, acceptable in all contexts

**Prohibited**:

- "Global Strategic Technology" (singular) — this is incorrect and has been a recurring bug
- "Global Strategic Tech" — informal abbreviation, not approved
- Mixing the full name and "GST" on the same page without establishing the full name first

The company name must appear correctly in all user-facing content: page titles, meta tags, alt text, social sharing images, legal pages, and documentation.

### Name Usage by Context

| Context            | Use                               | Don't Use                                           |
| ------------------ | --------------------------------- | --------------------------------------------------- |
| Marketing copy     | GST                               | Global Strategic Technology / Global Strategic Tech |
| Page titles & meta | GST                               | Global Strategic Technologies                       |
| Legal documents    | Global Strategic Technologies LLC | GST alone                                           |

---

## Brand Voice

### Declarative statements — use GST as subject

> GST helps technology-focused investors scale with confidence.
> GST bridges the gap between technical architecture and business impact.
> GST quantifies what's under the hood so you can price risk accurately.

### CTAs and conversational copy — use we/us/our

> Let's discuss your next challenge.
> Connect with us to explore how GST's experience can help.
> Schedule a confidential consultation to discuss your objectives.

### Founder bio (About page) — third-person

> Reid Peryam is an architect and advisor...
> He works with leadership teams across industries...
> Reid founded GST to address a persistent gap...

### Legal pages — first-person plural (standard)

Privacy and Terms pages use "we," "us," "our" per legal convention.

### Voice Quick Reference

| Voice      | Where                                      | Example                    |
| ---------- | ------------------------------------------ | -------------------------- |
| GST + verb | Hero, section intros, service descriptions | "GST delivers..."          |
| we/our     | CTAs, warm/conversational moments          | "Let's discuss..."         |
| he/Reid    | Founder biography                          | "Reid founded GST..."      |
| GST's      | Possessive references                      | "GST's recommendations..." |

### Voice Anti-Patterns

- Don't use "I" or "my" outside of direct quotes
- Don't mix "Global Strategic Technology" and "GST" on the same page
- Don't use "we" for declarative capability statements — use "GST"
- Don't use the full legal entity name outside legal documents

---

## Accessibility

- **Contrast**: All text/background combinations should meet WCAG 2.1 AA contrast ratios (4.5:1 for normal text, 3:1 for large text)
- **Focus indicators**: 2px solid `--color-primary` outline with 2px offset via `.interactive-focus` utility or `:focus-visible` on `.brutal-*` components
- **Color alone**: Never use color as the sole indicator of state — always pair with text, icons, or patterns
- **Touch targets**: 44x44px minimum per WCAG 2.5.5 — all `.brutal-btn` and `.brutal-choice-btn` components meet this
- **Keyboard navigation**: All interactive components are focusable via Tab; modals trap focus; tab bars support arrow keys
- **Live reference**: The [/brand page — Accessibility section](https://globalstrategic.tech/brand#accessibility) demonstrates focus states, contrast ratios, touch targets, keyboard patterns, ARIA usage, and semantic HTML structure

---

## Semantic Color System

Shared status colors for use across all tools and components. Derived from battle-tested values in TechPar, ICG, and Diligence Machine.

| Variable          | Light     | Dark      | Usage                                                               |
| ----------------- | --------- | --------- | ------------------------------------------------------------------- |
| `--color-success` | `#2e8b57` | `#3da868` | Positive outcomes, passing states                                   |
| `--color-warning` | `#CC8800` | `#FFAA33` | Caution indicators, borderline states (aliases `--color-secondary`) |
| `--color-error`   | `#d93636` | `#e05050` | Failures, negative KPIs, critical alerts                            |
| `--color-info`    | `#05cd99` | `#05cd99` | Informational highlights (aliases `--color-primary`)                |

Tool-specific status variables (e.g. `--dm-success`, `--techpar-kpi-negative`) may reference these shared values for consistency, but existing tool palettes remain valid within their own scope.

---

## Alternative Palette System

Six color palettes are defined in `src/styles/palettes.css`, enabling stakeholders to preview the entire site in alternative brand directions. The active palette is applied as a class on `<html>` (e.g., `html.palette-1`), mirroring the dark-theme pattern, and persisted via `localStorage('palette')`.

| ID  | Name                     | Primary           | Secondary         | Character                               |
| --- | ------------------------ | ----------------- | ----------------- | --------------------------------------- |
| 0   | **Current** (production) | Teal `#05cd99`    | Amber `#CC8800`   | The baseline                            |
| 1   | **Steel Authority**      | Cobalt `#1e40af`  | Magenta `#db2777` | PE gravitas with an unexpected edge     |
| 2   | **Indigo Signal**        | Violet `#7c3aed`  | Lime `#84cc16`    | Breaks every finance-blue convention    |
| 3   | **Copper Forge**         | Rust `#b45309`    | Cyan `#0891b2`    | Industrial heat meets cold precision    |
| 4   | **Jade Edge**            | Emerald `#059669` | Rose `#f43f5e`    | Current teal pushed to its boldest form |
| 5   | **Shadow Garden**        | Forest `#166534`  | Violet `#a855f7`  | Terminal in an old-growth forest        |

Each palette overrides the 9 core tokens (`--color-primary`, `--color-primary-dark`, `--color-secondary`, `--color-success`, `--color-warning`, `--color-error`, `--color-authority`, `--color-distinguish`, `--color-subdued`) plus derived accent/border/opacity scales. All tool-domain colors cascade automatically.

**How to preview:** Open the PalettePanel on the `/brand` page (right-edge tab bar). Click the middle delta icon to "pop out" the panel to all pages.

**Important:** Palette 0 is the production palette. Alternative palettes are for stakeholder review only — they are not deployed to production.

---

## Color Usage Hierarchy

When choosing a color, follow this priority order:

| Priority | Color Family                                                             | When to Use                                          | Examples                                                  |
| -------- | ------------------------------------------------------------------------ | ---------------------------------------------------- | --------------------------------------------------------- |
| 1        | **Primary teal** (`--color-primary`)                                     | Interactive elements, brand accents, data highlights | Links, buttons, focus rings, active states, hover borders |
| 2        | **Secondary amber** (`--color-secondary`)                                | Secondary emphasis, alternative highlights           | Warning badges, secondary CTAs, TechPar zone indicators   |
| 3        | **Semantic** (`--color-success/warning/error/info`)                      | Status indicators, validation, alerts                | Form errors, maturity levels, success confirmations       |
| 4        | **Neutrals** (`--text-*`, `--bg-*`, `--border-*`)                        | Body content, backgrounds, borders                   | Default for all non-interactive, non-status content       |
| 5        | **Domain** (`--hub-*`, `--dm-*`, `--icg-*`, `--techpar-*`, `--regmap-*`) | Tool-specific contexts only                          | Never used outside their owning tool                      |

**Rules**:

- Primary teal is the only color for primary CTAs — never use secondary amber or semantic colors for the primary action
- Semantic colors must always be paired with text or an icon — never rely on color alone (accessibility requirement)
- Domain colors are scoped to their tool and must not leak into shared components

---

## Color Contrast Requirements

All text and UI element pairings must meet WCAG 2.1 AA contrast minimums:

| Element Type                                            | Minimum Contrast Ratio |
| ------------------------------------------------------- | ---------------------- |
| Normal text (< 18px or < 14px bold)                     | 4.5:1                  |
| Large text (≥ 18px or ≥ 14px bold)                      | 3:1                    |
| Non-text UI elements (borders, icons, focus indicators) | 3:1                    |

**`--text-faded` usage**: Opacity set to `0.6` for both themes, yielding ~3.8:1 on white and passing AA for large text. Restrict `--text-faded` to large text (≥ 18px), placeholder text, and decorative/disabled elements. For normal-sized body text, use `--text-muted` or higher.

---

## Data Visualization Color Standards

### Approved Tool Palettes

| Tool              | Palette                                       | Variables                                               |
| ----------------- | --------------------------------------------- | ------------------------------------------------------- |
| TechPar           | Teal band, blue ahead, amber under, red above | `--techpar-chart-*`, `--techpar-zone-*`                 |
| ICG               | Red → orange → green → teal maturity scale    | `--icg-maturity-*`                                      |
| Diligence Machine | Authority blue, methodology brown             | `--hub-authority-blue`, `--dm-methodology-brown`        |
| Regulatory Map    | Purple-blue industry, red cybersecurity       | `--regmap-category-industry`, `--regmap-category-cyber` |

### CVD-Safe Sequence for Future Charts

For multi-series charts (max 6 colors), use this sequence for adequate color vision deficiency separation:

1. Teal — `--color-primary`
2. Blue — `--hub-authority-blue`
3. Amber — `--color-secondary`
4. Red — `--color-error`
5. Purple — `--regmap-category-industry`
6. Brown — `--dm-methodology-brown`

**Rule**: Always pair color with a secondary differentiator (pattern fill, label, position, shape) for color-blind accessibility.

---

## Brand Asset: Delta Icon — Usage Rules

| Rule                           | Value                                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Minimum size (inline)          | 10px                                                                                                      |
| Minimum size (standalone)      | 16px                                                                                                      |
| Approved colors                | `--color-primary` (teal) for branding, `--color-secondary` (gold) for attention/action, or `currentColor` |
| Minimum clearance (standalone) | `--spacing-sm` (8px)                                                                                      |
| Prohibited                     | Distortion, unapproved colors, background fill, rotation beyond chevron toggle                            |

### Placement Guidelines

- **Navigation**: Top-left in the logo wrapper. Always paired with "GST" text.
- **Toggles**: Inline-end position within collapsible headers. Rotates 0°↔180° via `.delta-chevron`.
- **Decorative**: As `::before`/`::after` pseudo-elements via CSS mask-image. Teal only.
- **Attention / CTA**: Inline-start position paired with instructional text. Gold (`--color-secondary`) to signal user action. Used in `.brutal-map-cta` and similar interactive prompts.
- **Print**: Unicode delta character `\0394` in document headers.

---

## Related Documentation

- **[/brand](https://globalstrategic.tech/brand)** — Live rendered brand reference page with color swatches, typography specimens, and UI component library. Shareable with external stakeholders without repo access.
- [STYLES_GUIDE.md](./STYLES_GUIDE.md) — CSS conventions, component patterns
- [VARIABLES_REFERENCE.md](./VARIABLES_REFERENCE.md) — Complete design token catalog
- [TYPOGRAPHY_REFERENCE.md](./TYPOGRAPHY_REFERENCE.md) — Typography utility classes
- [STYLES_REMEDIATION_ROADMAP.md](./STYLES_REMEDIATION_ROADMAP.md) — Tracked remediation initiatives

---

**Created**: March 23, 2026
**Last Updated**: April 5, 2026
**Status**: Complete — all requirements finalized
