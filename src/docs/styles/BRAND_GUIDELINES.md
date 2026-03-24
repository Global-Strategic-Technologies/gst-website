# GST Brand Color & Style Guidelines

Documented brand palette and usage rules for the GST website. Items marked **TBD** require stakeholder design decisions.

---

## Brand Colors

### Primary Palette

| Role | Hex | Variable | Usage |
|------|-----|----------|-------|
| **Primary Teal** | `#05cd99` | `--color-primary` | Links, borders, buttons, active states, brand accent |
| **Primary Teal Dark** | `#04a87a` | `--color-primary-dark` | Hover/pressed states, emphasis |
| **Secondary Amber** | `#CC8800` (light) / `#FFAA33` (dark) | `--color-secondary` | Secondary accents, warnings, alternative highlights |

### Neutral Backgrounds

| Role | Hex | Variable | Usage |
|------|-----|----------|-------|
| **White** | `#ffffff` | `--bg-light` | Primary page background (light theme) |
| **Off-white** | `#f5f5f5` | `--bg-light-alt` | Secondary background — sections, cards |
| **Light gray** | `#eeeeee` | `--services-bg`, `--footer-bg` | Services section, footer |
| **Near black** | `#0a0a0a` | `--bg-dark` | Primary background (dark theme) |
| **Dark gray** | `#1a1a1a` | `--bg-dark-secondary` | Secondary dark background |
| **Dark charcoal** | `#141414` | `--bg-dark-tertiary` | Tertiary dark background |

### Text Colors

Text colors use opacity-based rgba values for consistent contrast against backgrounds. See [VARIABLES_REFERENCE.md](./VARIABLES_REFERENCE.md#text-colors) for full values.

| Role | Light Theme | Dark Theme |
|------|-------------|------------|
| Primary | `rgba(26,26,26, 0.95)` | `rgba(245,245,245, 0.95)` |
| Secondary | `rgba(26,26,26, 0.7)` | `rgba(200,200,200, 0.8)` |
| Muted | `rgba(26,26,26, 0.6)` | `rgba(200,200,200, 0.6)` |
| Faded | `rgba(26,26,26, 0.5)` | `rgba(200,200,200, 0.5)` |

---

## Typography

| Property | Value |
|----------|-------|
| **Font family** | Helvetica Neue, Arial, sans-serif |
| **Normal weight** | 400 |
| **Semibold weight** | 600 |
| **Bold weight** | 700 |

See [TYPOGRAPHY_REFERENCE.md](./TYPOGRAPHY_REFERENCE.md) for the full set of semantic text utility classes.

---

## Brand Asset: Delta Icon

The GST delta triangle icon is the primary brand mark. It appears as:
- Navigation logo element
- Collapse/expand toggle indicator (`.delta-chevron` in `interactions.css`)
- CSS pseudo-element decorator via mask-image technique

**SVG source**: `/images/logo/gst-delta-icon-teal-stroke-thick.svg`

**Usage rules**:
- Always render in `--color-primary` (teal) or `currentColor` — never in off-brand colors
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

| Theme | Value | Variable |
|-------|-------|----------|
| Light | `#5b7a9d` | `--hub-authority-blue` |
| Dark | `#7a9dbd` | `--hub-authority-blue` |

Used for authority/expertise-themed elements across hub tools.

### Diligence Machine Domain Colors

See [VARIABLES_REFERENCE.md — Diligence Machine Domain Colors](./VARIABLES_REFERENCE.md#diligence-machine-domain-colors).

### ICG Maturity Colors

See [VARIABLES_REFERENCE.md — ICG Maturity Colors](./VARIABLES_REFERENCE.md#icg-maturity-colors).

### TechPar Zone & Chart Colors

See [VARIABLES_REFERENCE.md — TechPar Variables](./VARIABLES_REFERENCE.md#techpar-variables).

---

## Accessibility

- **Contrast**: All text/background combinations should meet WCAG 2.1 AA contrast ratios (4.5:1 for normal text, 3:1 for large text)
- **Focus indicators**: 2px solid `--color-primary` outline via `.focus-outline` utility
- **Color alone**: Never use color as the sole indicator of state — always pair with text, icons, or patterns

---

## Requirements & Recommendations — Pending Stakeholder Review

Five areas need design decisions to complete the brand guidelines. Each section below documents the gap, provides a concrete recommendation based on current codebase patterns, and identifies what a stakeholder must decide.

---

### R1. Semantic Color System

**Gap**: Status colors (success, warning, error) exist as tool-specific variables (`--dm-success`, `--dm-warning`, `--icg-maturity-reactive`) but no shared cross-tool semantic convention exists. A new tool would need to pick its own status colors.

**Recommendation**: Formalize shared semantic colors derived from what's already in use across the codebase:

| Semantic Role | Recommended Value (light / dark) | Derived From | Proposed Variable |
|---|---|---|---|
| Success | `#2e8b57` / `#3da868` | `--dm-success` | `--color-success` |
| Warning | `#CC8800` / `#FFAA33` | `--color-secondary` | `--color-warning` |
| Error | `#d93636` / `#e05050` | `--techpar-kpi-negative` | `--color-error` |
| Info | `#05cd99` | `--color-primary` | `--color-info` (alias) |

These values are already battle-tested across TechPar, ICG, and the Diligence Machine. Formalizing them as shared variables would allow tool-specific variables (`--dm-success`, `--icg-maturity-*`) to reference them, ensuring consistency.

**Stakeholder decisions needed**:
- [ ] Approve or adjust the 4 semantic color values
- [ ] Decide whether Warning should reuse the secondary amber (`#CC8800`) or use a distinct orange to avoid conflation with the secondary accent

---

### R2. Color Usage Hierarchy

**Gap**: No formal rules for when to use brand colors vs. neutral vs. semantic colors. Developers must infer intent from existing patterns.

**Recommendation**: Document a usage hierarchy based on established practice:

| Priority | Color Family | When to Use | Examples |
|----------|-------------|-------------|---------|
| 1 | **Primary teal** (`--color-primary`) | Interactive elements, brand accents, data highlights | Links, buttons, focus rings, active states, hover borders |
| 2 | **Secondary amber** (`--color-secondary`) | Secondary emphasis, alternative highlights | Warning badges, secondary CTAs, TechPar zone indicators |
| 3 | **Semantic** (`--color-success/warning/error/info`) | Status indicators, validation, alerts | Form errors, maturity levels, success confirmations |
| 4 | **Neutrals** (`--text-*`, `--bg-*`, `--border-*`) | Body content, backgrounds, borders | Default for all non-interactive, non-status content |
| 5 | **Domain** (`--hub-*`, `--dm-*`, `--icg-*`, `--techpar-*`) | Tool-specific contexts only | Never used outside their owning tool |

**Rules**:
- Primary teal is the only color for primary CTAs — never use secondary amber or semantic colors for the primary action
- Semantic colors are always paired with text or an icon — never rely on color alone (accessibility requirement)
- Domain colors are scoped to their tool and must not leak into shared components

**Stakeholder decisions needed**:
- [ ] Confirm the hierarchy
- [ ] Identify any contexts where secondary amber should be restricted (e.g., industries where amber implies regulatory caution)
- [ ] Decide if domain colors should ever be promoted to shared semantic colors (e.g., should Authority Blue become a shared "professional/trust" semantic?)

---

### R3. Color Contrast Compliance

**Gap**: No WCAG accessibility audit has been performed on the design system's color pairings. Two potential issues identified during remediation:

| Pairing | Estimated Ratio | WCAG AA Threshold | Status |
|---------|----------------|-------------------|--------|
| `--text-faded` on `--bg-light-alt` | ~2.5:1 | 4.5:1 (normal text) | Fails |
| `--text-faded` on `--bg-light` | ~3.2:1 | 4.5:1 (normal text) | Fails |
| `--filter-chip-text` on `--filter-chip-bg` | ~4.0:1 | 4.5:1 (normal text) | Borderline |
| `--text-muted` on `--bg-light` | ~5.7:1 | 4.5:1 | Passes |
| `--text-secondary` on `--bg-light` | ~8.1:1 | 4.5:1 | Passes |
| `--text-primary` on `--bg-light` | ~15.4:1 | 4.5:1 | Passes |

**Recommendation**:
1. Run a formal automated contrast audit (axe-core or Chrome Lighthouse) against both themes
2. For `--text-faded`: increase opacity from `0.5` to `0.6` — this reaches ~3.8:1 on white backgrounds, passing AA for large text (3:1) and approaching normal text compliance. Alternatively, restrict `--text-faded` to decorative/placeholder use only and document the limitation.
3. Document minimum contrast requirements in this file:
   - Normal text (< 18px or < 14px bold): **4.5:1**
   - Large text (≥ 18px or ≥ 14px bold): **3:1**
   - Non-text UI elements (borders, icons, focus indicators): **3:1**

**Stakeholder decisions needed**:
- [ ] Approve the `--text-faded` opacity increase (0.5 → 0.6), or accept the current value with a documented limitation (large text / decorative only)
- [ ] Approve budget for a full WCAG audit (manual review of all pages in both themes), or accept the automated-only approach

---

### R4. Data Visualization Color Standards

**Gap**: Each hub tool chose its own chart/visualization colors independently. No shared palette exists for multi-series charts. The regulatory map uses 2 hardcoded category colors (`#6c63ff` industry, `#e74c3c` cybersecurity) without CSS variables.

**Current data viz colors in use**:

| Tool | Colors | CVD-Safe? | Standardized? |
|------|--------|-----------|---------------|
| TechPar | Teal band, blue ahead, amber under, red above | Yes (tested) | Yes (CSS vars) |
| ICG | Red → orange → green → teal maturity scale | Standard traffic light | Yes (CSS vars) |
| Diligence Machine | Authority blue, methodology brown | Distinct hue families | Yes (CSS vars) |
| Regulatory Map | Purple-blue `#6c63ff`, red `#e74c3c` | Adequate separation | No (hardcoded) |

**Recommendation**:
1. Approve the existing tool-specific palettes as the canonical data visualization colors — they are already in production and tested
2. Formalize regulatory map category colors as CSS variables (`--regmap-category-industry: #6c63ff`, `--regmap-category-cyber: #e74c3c`) with dark theme overrides
3. For future multi-series charts, document a recommended CVD-safe sequence (max 6 colors):
   - Teal (`--color-primary`), Blue (`--hub-authority-blue`), Amber (`--color-secondary`), Red (`--color-error`), Purple (`#6c63ff`), Brown (`--dm-methodology-brown`)
4. Rule: always pair color with a secondary differentiator (pattern fill, label, position, shape) for color-blind accessibility

**Stakeholder decisions needed**:
- [ ] Approve existing tool palettes as canonical
- [ ] Decide whether regulatory map colors should become CSS variables (recommendation: yes) or remain hardcoded (only used in one place)
- [ ] Approve the recommended 6-color CVD-safe sequence for future charts

---

### R5. Brand Asset Usage Rules

**Gap**: The delta icon is documented in STYLES_GUIDE.md as a CSS technique but lacks formal usage rules (minimum size, clearance, prohibited uses).

**Current usage** (derived from codebase):
- Navigation logo element (top-left, ~2rem height)
- Collapse/expand toggle indicator (`.delta-chevron` in `interactions.css`, 10-12px)
- CSS pseudo-element decorator via mask-image technique
- Print header branding (Unicode delta `\0394`)

**Recommendation**:

| Rule | Value | Basis |
|------|-------|-------|
| Minimum size (inline) | 10px | Current `.delta-chevron` usage |
| Minimum size (standalone) | 16px | Clearance for visual recognition |
| Approved colors | `--color-primary` (teal) or `currentColor` | Current implementation |
| Minimum clearance | `--spacing-sm` (8px) when standalone | Standard padding convention |
| Prohibited | Distortion, off-brand colors, background fill, rotation beyond chevron toggle | Best practice |

**Placement guidelines**:
- **Navigation**: Top-left in the logo wrapper. Always paired with "GST" text.
- **Toggles**: Inline-end position within collapsible headers. Rotates 0°↔180° via `.delta-chevron`.
- **Decorative**: As `::before`/`::after` pseudo-elements via CSS mask-image. Teal only.
- **Print**: Unicode delta character `\0394` in document headers.

**Stakeholder decisions needed**:
- [ ] Approve minimum sizes and clearance values
- [ ] Identify additional brand assets beyond the delta icon that need documentation (e.g., full logo lockup, wordmark)
- [ ] Decide if the delta icon may be used by third parties (partner pages, press kits) and under what conditions

---

## Related Documentation

- [STYLES_GUIDE.md](./STYLES_GUIDE.md) — CSS conventions, component patterns
- [VARIABLES_REFERENCE.md](./VARIABLES_REFERENCE.md) — Complete design token catalog
- [TYPOGRAPHY_REFERENCE.md](./TYPOGRAPHY_REFERENCE.md) — Typography utility classes
- [STYLES_REMEDIATION_ROADMAP.md](./STYLES_REMEDIATION_ROADMAP.md) — Tracked remediation initiatives

---

**Created**: March 23, 2026
**Last Updated**: March 24, 2026
**Status**: Requirements defined — 5 areas with concrete recommendations awaiting stakeholder review
