# Brand Guidelines Completion — Implementation Handover

**Initiative**: Init 1A from [STYLES_REMEDIATION_ROADMAP.md](../styles/STYLES_REMEDIATION_ROADMAP.md#1a-brand-guidelines-completion)
**Status**: Requirements defined — ready for implementation
**Estimated Effort**: 2-4 hours (decisions + implementation + verification)
**Outcome**: A complete brand guidelines document with no remaining TBD items, plus 4-6 new CSS variables in the design system

---

## Background

The GST website's CSS design system underwent a comprehensive remediation (Init 1-11) that standardized 134 CSS variables, eliminated ~250 lines of redundant dark theme overrides, added stylelint, and documented all conventions. However, the brand guidelines remain incomplete — five areas have concrete recommendations but no stakeholder approval.

This document centralizes everything needed to close Init 1A: the current state, what needs deciding, the specific implementation for each decision, and how to verify the result.

---

## Current Brand Identity (Established)

These are already implemented and documented in [BRAND_GUIDELINES.md](../styles/BRAND_GUIDELINES.md).

### Company Name
- **Legal**: Global Strategic Technologies LLC
- **Standard**: Global Strategic Technologies
- **Abbreviation**: GST
- **Prohibited**: "Global Strategic Technology" (singular), "Global Strategic Tech"
- **Reference**: [BRAND_GUIDELINES.md — Company Name](../styles/BRAND_GUIDELINES.md#company-name), [BRAND_VOICE.md](../branding/BRAND_VOICE.md)

### Color Palette
| Role | Light | Dark | Variable |
|------|-------|------|----------|
| Primary (teal) | `#05cd99` | `#05cd99` | `--color-primary` |
| Primary dark | `#04a87a` | `#04a87a` | `--color-primary-dark` |
| Secondary (amber) | `#CC8800` | `#FFAA33` | `--color-secondary` |

### Typography
- Font: Helvetica Neue, Arial, sans-serif
- Weights: 400 (normal), 600 (semibold), 700 (bold)
- 11 utility classes: `.heading-xl` through `.label-small`
- **Reference**: [TYPOGRAPHY_REFERENCE.md](../styles/TYPOGRAPHY_REFERENCE.md)

### Brand Asset
- Delta triangle icon: `/images/logo/gst-delta-icon-teal-stroke-thick.svg`
- Used in navigation, collapse/expand toggles, CSS decorators, print headers
- **Reference**: [STYLES_GUIDE.md — Brand Assets in CSS](../styles/STYLES_GUIDE.md#brand-assets-in-css)

### Design System
- 134 CSS variables in `:root`, 78 dark theme overrides
- Theme-agnostic text aliases (`--text-primary/secondary/muted/faded`)
- Auto-switching dark theme via `html.dark-theme` class
- **Reference**: [VARIABLES_REFERENCE.md](../styles/VARIABLES_REFERENCE.md)

---

## What Needs To Be Completed

Five requirement areas, each with a recommendation and decision checkboxes. The full analysis with rationale is in [BRAND_GUIDELINES.md — Requirements & Recommendations](../styles/BRAND_GUIDELINES.md#requirements--recommendations--pending-stakeholder-review).

### R1. Semantic Color System

**Decision**: Approve 4 shared semantic color variables.

| Variable | Light | Dark | Derived From |
|----------|-------|------|-------------|
| `--color-success` | `#2e8b57` | `#3da868` | `--dm-success` (Diligence Machine) |
| `--color-warning` | `#CC8800` | `#FFAA33` | `--color-secondary` (existing amber) |
| `--color-error` | `#d93636` | `#e05050` | `--techpar-kpi-negative` (TechPar) |
| `--color-info` | `#05cd99` | `#05cd99` | `--color-primary` (alias) |

**Open question**: Should `--color-warning` reuse the secondary amber, or use a distinct orange to avoid conflation?

**Implementation when approved**:
1. Add 4 variables + dark overrides to `src/styles/variables.css` (after the `--color-secondary-dark` line)
2. Document in [VARIABLES_REFERENCE.md](../styles/VARIABLES_REFERENCE.md) under a new "Semantic Colors" section
3. Optionally refactor tool-specific variables to reference the shared ones (e.g., `--dm-success: var(--color-success)`)

### R2. Color Usage Hierarchy

**Decision**: Confirm a 5-tier priority for color selection.

| Priority | Family | When to Use |
|----------|--------|-------------|
| 1 | Primary teal | Interactive elements, brand accents, primary CTAs |
| 2 | Secondary amber | Secondary emphasis, warnings, alternative highlights |
| 3 | Semantic | Status indicators, validation, alerts |
| 4 | Neutrals | Body content, backgrounds, borders |
| 5 | Domain | Tool-specific only, never in shared components |

**Open questions**:
- Any contexts where secondary amber should be restricted?
- Should Authority Blue (`--hub-authority-blue`) be promoted to a shared semantic "trust/professional" color?

**Implementation when approved**:
1. Add the hierarchy table to [BRAND_GUIDELINES.md](../styles/BRAND_GUIDELINES.md) as a permanent section (replacing the R2 requirement)
2. Add a quick-reference to [STYLES_GUIDE.md](../styles/STYLES_GUIDE.md) in the "Component Styling" section

### R3. Color Contrast Compliance

**Decision**: Fix or accept `--text-faded` contrast issue.

| Pairing | Current Ratio | WCAG AA (normal) | WCAG AA (large) |
|---------|--------------|-------------------|-----------------|
| `--text-faded` on `--bg-light-alt` | ~2.5:1 | Fails (4.5:1) | Fails (3:1) |
| `--text-faded` on `--bg-light` | ~3.2:1 | Fails (4.5:1) | Passes (3:1) |
| `--filter-chip-text` on `--filter-chip-bg` | ~4.0:1 | Borderline | Passes |

**Option A** (recommended): Increase `--text-faded` opacity from `0.5` to `0.6`. Reaches ~3.8:1 on white, passing AA for large text.
**Option B**: Document that `--text-faded` is restricted to large text (≥18px) and decorative/placeholder use only.

**Implementation when approved**:
1. If Option A: change `--text-faded` value in `src/styles/variables.css` line 21 (`rgba(26,26,26, 0.5)` → `rgba(26,26,26, 0.6)`) and dark equivalent at line 27
2. Run automated contrast audit (Chrome Lighthouse or axe-core) on both themes
3. Document minimum contrast thresholds in [BRAND_GUIDELINES.md](../styles/BRAND_GUIDELINES.md)
4. Browse the live site to visually verify placeholder/disabled text hasn't become too prominent

### R4. Data Visualization Color Standards

**Decision**: Approve existing palettes and a CVD-safe sequence for future charts.

**Current tool palettes** (all in production):

| Tool | Palette | Status |
|------|---------|--------|
| TechPar | Teal, blue (CVD-safe), amber, red | Standardized as CSS vars |
| ICG | Red→orange→green→teal maturity | Standardized as CSS vars |
| Diligence Machine | Authority blue, methodology brown | Standardized as CSS vars |
| Regulatory Map | Purple-blue `#6c63ff`, red `#e74c3c` | **Hardcoded** — needs variables |

**Recommended CVD-safe sequence** for future multi-series charts (max 6):
1. Teal (`--color-primary`)
2. Blue (`--hub-authority-blue`)
3. Amber (`--color-secondary`)
4. Red (`--color-error`)
5. Purple (`#6c63ff`)
6. Brown (`--dm-methodology-brown`)

**Implementation when approved**:
1. Add `--regmap-category-industry: #6c63ff` and `--regmap-category-cyber: #e74c3c` (+ dark overrides) to `src/styles/variables.css`
2. Replace hardcoded values in `src/pages/hub/tools/regulatory-map/index.astro`
3. Document the approved palettes and CVD-safe sequence in [BRAND_GUIDELINES.md](../styles/BRAND_GUIDELINES.md)
4. Browse the Regulatory Map tool at `/hub/tools/regulatory-map` in both themes to verify colors render correctly after variable migration

### R5. Brand Asset Usage Rules

**Decision**: Approve delta icon sizing, clearance, and prohibited uses.

| Rule | Recommended Value |
|------|-------------------|
| Minimum size (inline) | 10px |
| Minimum size (standalone) | 16px |
| Approved colors | `--color-primary` or `currentColor` |
| Minimum clearance (standalone) | `--spacing-sm` (8px) |
| Prohibited | Distortion, off-brand colors, background fill |

**Open question**: Are there additional brand assets beyond the delta icon (full logo lockup, wordmark) that need rules?

**Implementation when approved**:
1. Finalize the rules table in [BRAND_GUIDELINES.md](../styles/BRAND_GUIDELINES.md) (replace the R5 requirement section with the approved rules)
2. Browse the site header and hub tool collapse/expand toggles to verify current usage meets the approved minimums

---

## Implementation Sequence

After all 5 decisions are made:

1. **CSS variables** (~15 min): Add semantic colors + regmap variables to `variables.css`
2. **Opacity fix** (~5 min): Adjust `--text-faded` if Option A approved
3. **Regmap migration** (~15 min): Replace hardcoded colors in regulatory-map
4. **Documentation** (~30 min): Finalize all 5 sections in BRAND_GUIDELINES.md, update VARIABLES_REFERENCE.md
5. **Verification** (~30 min): Run tests, contrast audit, visual check both themes
6. **Roadmap update** (~5 min): Mark Init 1A as "Complete" in STYLES_REMEDIATION_ROADMAP.md

## Verification Checklist

- [ ] `npm run test:run` — all 852+ tests pass
- [ ] `npm run lint:css` — no stylelint violations
- [ ] Automated contrast audit (Lighthouse or axe-core) in both light and dark themes
- [ ] Visual check: all pages at desktop, 768px, 480px in both themes
- [ ] Specifically verify: Regulatory Map colors, placeholder/disabled text visibility, filter chip readability
- [ ] `grep -ri "color-success\|color-warning\|color-error\|color-info" src/styles/variables.css` confirms new variables exist

---

## Key Files

| File | Role |
|------|------|
| `src/styles/variables.css` | Add new CSS variables here |
| `src/docs/styles/BRAND_GUIDELINES.md` | Finalize requirement sections into permanent guidelines |
| `src/docs/styles/VARIABLES_REFERENCE.md` | Document new variables |
| `src/docs/styles/STYLES_GUIDE.md` | Add color usage hierarchy quick-reference |
| `src/docs/styles/STYLES_REMEDIATION_ROADMAP.md` | Mark Init 1A complete |
| `src/pages/hub/tools/regulatory-map/index.astro` | Migrate hardcoded regmap colors to variables |
| `src/docs/branding/BRAND_VOICE.md` | Existing brand voice conventions (no changes needed) |

---

## Reference Documentation

- [BRAND_GUIDELINES.md](../styles/BRAND_GUIDELINES.md) — Full requirements with rationale and decision checkboxes
- [VARIABLES_REFERENCE.md](../styles/VARIABLES_REFERENCE.md) — Complete 134-variable design token catalog
- [TYPOGRAPHY_REFERENCE.md](../styles/TYPOGRAPHY_REFERENCE.md) — 11 typography utility classes
- [STYLES_GUIDE.md](../styles/STYLES_GUIDE.md) — CSS conventions, Astro patterns, component checklist
- [STYLES_REMEDIATION_ROADMAP.md](../styles/STYLES_REMEDIATION_ROADMAP.md) — Full initiative tracking (Init 1-11)
- [BRAND_VOICE.md](../branding/BRAND_VOICE.md) — Company name, voice rules, anti-patterns

---

**Created**: March 24, 2026
