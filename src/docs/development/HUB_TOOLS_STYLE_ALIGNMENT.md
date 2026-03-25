# Hub Tools Style Alignment

Visual design consistency audit and remediation plan for the five hub tool pages.

**Status**: Phases 1-2 complete, Phase 3 deferred
**Last Updated**: March 25, 2026

---

## Table of Contents

1. [Scope](#scope)
2. [Overall Consistency Score](#overall-consistency-score)
3. [Audit Findings](#audit-findings)
4. [Key Divergences](#key-divergences)
5. [Remediation Plan](#remediation-plan)

---

## Scope

Five live hub tools were audited for visual design consistency:

| Tool | Path | Shell Class | Max-Width |
|------|------|-------------|-----------|
| Regulatory Map | `hub/tools/regulatory-map` | None (custom layout) | Responsive, no fixed shell |
| Diligence Machine | `hub/tools/diligence-machine` | `.tool-shell--document` | 800px |
| Tech Debt Calculator | `hub/tools/tech-debt-calculator` | `.tool-shell--wide` | 760px |
| Infrastructure Cost Governance | `hub/tools/infrastructure-cost-governance` | `.tool-shell--narrow` | 660px |
| TechPar | `hub/tools/techpar` | `.techpar-shell` (custom) | 100% fluid |

---

## Overall Consistency Score

**~75% consistent** across the five tools.

| Category | Score | Summary |
|----------|-------|---------|
| Colors | 95% | Nearly all use CSS variables; only TDC footer has minor hardcoded rgba |
| Print Styles | 100% | All tools follow the documented `@media print` pattern |
| Responsive | 90% | Consistent breakpoints (768px, 480px); TechPar tab-bar z-index 11 vs header z-index 10 |
| Dark Theme | 85% | Consistent `:global(html.dark-theme)` pattern; ICG uses more explicit rgba overrides |
| Spacing | 80% | Variables used consistently, but padding combinations vary (sm/lg vs lg/xl vs custom) |
| Form Inputs | 75% | Border-radius varies (4px vs 8px); monospace vs sans-serif for numeric inputs |
| Typography | 70% | HubHeader consistent; section labels, button text, and custom font sizes diverge |
| Layout/Container | 60% | RegMap and TechPar don't use `.tool-shell`; four different max-widths |
| Buttons | 60% | No unified component; padding, font-size, border-radius, disabled states all differ |

---

## Audit Findings

### Layout & Container

- **Diligence Machine**: `.tool-shell--document` (800px)
- **Tech Debt Calculator**: `.tool-shell--wide` (760px)
- **ICG**: `.tool-shell--narrow` (660px)
- **TechPar**: Custom `.techpar-shell` (100% fluid) — does not use standard `.tool-shell`
- **Regulatory Map**: No shell class at all — custom responsive layout for the map

Content padding follows `.tool-content` from `global.css` (24px 16px desktop, 16px 12px mobile) in DM and ICG, but TDC uses custom 24px 32px and TechPar uses custom 24px 16px per panel.

### Color Usage

Colors are the strongest area of consistency. All tools use:

- `--color-primary` for active states, buttons, accents
- `--color-secondary` for warning badges (DM, ICG, TechPar)
- `--text-primary`, `--text-secondary`, `--text-muted`, `--text-faded` for text hierarchy
- `--bg-light-alt`, `--bg-light` for card/section backgrounds
- `--border-light` for borders (with dark theme overrides)
- `--accent-light-bg` / `--accent-light-bg-hover` for hover states

Tool-domain colors (`--hub-authority-blue`, `--dm-*`, `--icg-*`, `--techpar-*`) are appropriately scoped.

One minor issue: TDC footer uses `rgba(0,0,0,0.04)` / `rgba(0,0,0,0.2)` hardcoded instead of variables.

### Typography

| Element | Regulatory Map | Diligence Machine | Tech Debt Calculator | ICG | TechPar |
|---------|---|---|---|---|---|
| Page title | HubHeader | HubHeader | HubHeader | HubHeader | HubHeader |
| Section labels | Varies | `.step-title` (h2) | `.section-label` (uppercase, xs, bold, faded) | `.label` utility + uppercase | `.tp-sec-label` (uppercase, bold) |
| Authority line | N/A | `.dm-authority` (xs, semibold, uppercase) | `.tdc-authority` (xs, semibold, uppercase, faded) | `.icg-authority` (xs, semibold, uppercase, faded) | N/A |
| Button text | `.cta-button` inherited | `.cta-button` inherited | `--text-xs` | `.75rem` hardcoded | `--text-xs` |
| Primary value display | N/A | N/A | `clamp(2rem, 6vw, 3rem)` | N/A | N/A |

ICG and TechPar define custom font sizes (`.label-small` at 0.75rem, `.text-tiny`) not present in global typography utilities.

### Buttons

Each tool defines its own button classes with different visual properties:

| Property | DM | TDC | ICG | TechPar |
|----------|---|---|---|---|
| Class name | `.cta-button primary` | `.copy-link-btn`, `.deploy-btn` | `.icg-btn-primary` | `.tp-btn-next` |
| Padding | varies | `var(--spacing-xs) var(--spacing-sm)` | `var(--spacing-sm) var(--spacing-xl)` | `var(--spacing-sm)` varies |
| Font size | inherited | `--text-xs` | `.75rem` hardcoded | `--text-xs` |
| Border radius | varies | 4px | 8px | 8px |
| Disabled state | `opacity` + `cursor: not-allowed` | `opacity: 0.35` | `opacity: 0.35` | `disabled` attribute |

### Form Inputs

| Property | TDC | ICG | TechPar |
|----------|-----|-----|---------|
| Border | `--border-light` | `--border-light` | `--border-light` |
| Border radius | 4px | 8px | 8px |
| Font | Monospace (numeric) | Sans-serif (questions) | Monospace (currency/numbers) |
| Padding | `var(--spacing-xs) var(--spacing-sm)` | `var(--spacing-sm) var(--spacing-lg)` | varies |
| Focus state | border `--color-primary` | border `--color-primary` + background shift | border `--color-primary` |

### Dark Theme

All tools use `:global(html.dark-theme)` for dynamically injected content. Most rely on CSS variables that auto-switch. ICG is the outlier — it uses explicit rgba overrides (`rgba(5,205,153,0.03)`, `rgba(5,205,153,0.06)`) more heavily than the variable-first approach used by DM and TDC.

### Dynamic Content (`:global()` usage)

| Tool | Dynamic injection | `:global()` density |
|------|---|---|
| Diligence Machine | Questions, attention cards, topic sections, metadata | Heavy |
| ICG | Question cards, option buttons, rationale dropdowns, domain bars | Heavy |
| TechPar | KPI grid, scenario chips, recommendation list, category bars | Heavy |
| Regulatory Map | Timeline entries, regulation list items | Moderate |
| Tech Debt Calculator | Minimal — most content is template-based | Light |

TDC is the only tool that avoids dynamic injection almost entirely (all HTML in the Astro template).

### Print Styles

Fully consistent across all tools. All follow the documented pattern:
- Hide interactive elements (header, footer, actions, landing/wizard views)
- Show results view
- Prevent card page breaks
- Auto-expand collapsed sections
- Shell goes full-width with no border/radius
- Hardcoded colors acceptable per style guide (print on white paper)

### Responsive Design

Consistent use of desktop-first breakpoints at 768px and 480px. Grid layouts reduce columns appropriately. One minor issue: TechPar tab-bar uses `z-index: 11` while `.site-header` uses `z-index: 10` — could cause overlay if both are visible simultaneously.

---

## Key Divergences

Ranked by visual impact:

### 1. No unified button component

Each tool defines its own button classes with different padding, font-size, border-radius, and disabled states. This is the most visible inconsistency when navigating between tools.

**Affected tools**: All four interactive tools (DM, TDC, ICG, TechPar)

### 2. Authority line styled three different ways

DM (`.dm-authority`), TDC (`.tdc-authority`), and ICG (`.icg-authority`) all implement the same visual pattern — small uppercase label at the top of the tool — with slightly different CSS.

**Affected tools**: DM, TDC, ICG

### 3. Section labels use different class names and styles

Four different approaches to the same visual element: `.step-title`, `.section-label`, `.label` utility, `.tp-sec-label`.

**Affected tools**: All

### 4. Container width inconsistency

Four different max-widths (660, 760, 800, 100%) with two tools not using `.tool-shell` at all. Some of this is intentional (Regulatory Map is a full-width interactive map; TechPar needs fluid width for data tables), but the variance is worth evaluating.

**Affected tools**: All

### 5. Input border-radius mismatch

TDC uses 4px for inputs and sliders; ICG and TechPar use 8px. Small but noticeable when comparing tools.

**Affected tools**: TDC, ICG, TechPar

### 6. Custom font sizes not in global utilities

ICG and TechPar define `.label-small` (0.75rem) and `.text-tiny` locally. These should be promoted to global typography utilities if reused.

**Affected tools**: ICG, TechPar

---

## Remediation Plan

Ordered by priority (impact vs effort):

### Phase 1: Low-effort, high-impact

1. **Standardize input border-radius** to 8px across all tools
   - Files: `tech-debt-calculator/index.astro` (change 4px → 8px on inputs/sliders)

2. **Promote custom font sizes to global typography**
   - Add `.label-small` and `.text-tiny` to `src/styles/typography.css`
   - Update ICG and TechPar to use the global classes

3. **Unify authority line styling**
   - Create a shared `.tool-authority` class in `global.css`
   - Replace `.dm-authority`, `.tdc-authority`, `.icg-authority` with the shared class

### Phase 2: Medium-effort, high-impact

4. **Create unified hub tool button component**
   - Define `.hub-btn`, `.hub-btn--primary`, `.hub-btn--secondary` in `global.css`
   - Standardize: padding `var(--spacing-sm) var(--spacing-xl)`, font-size `var(--text-xs)`, border-radius 8px, disabled `opacity: 0.35; cursor: not-allowed`
   - Migrate tool-specific button classes incrementally

5. **Standardize section label classes**
   - Define `.tool-section-label` in `global.css` (uppercase, xs, bold, faded)
   - Replace tool-specific label classes

### Phase 3: Evaluate-then-act

6. **Container width rationalization**
   - Evaluate whether RegMap and TechPar can adopt `.tool-shell` variants
   - RegMap likely cannot (full-width map); TechPar may work with `.tool-shell--fluid`
   - Consider whether 660/760/800px can converge to fewer widths

7. **ICG dark theme rgba consolidation**
   - Extract ICG's rgba overrides into CSS variables in `variables.css`
   - Replace inline rgba values with the new variables

8. **TechPar z-index alignment**
   - Evaluate whether tab-bar z-index 11 causes issues with sticky header
   - Align to documented z-index scale if needed

---

## Related Documentation

- [STYLES_GUIDE.md](../styles/STYLES_GUIDE.md) — CSS conventions and hub tool patterns
- [VARIABLES_REFERENCE.md](../styles/VARIABLES_REFERENCE.md) — Complete design token catalog
- [TYPOGRAPHY_REFERENCE.md](../styles/TYPOGRAPHY_REFERENCE.md) — Typography utility classes
- [STYLES_REMEDIATION_ROADMAP.md](../styles/STYLES_REMEDIATION_ROADMAP.md) — Tracked style remediation initiatives
