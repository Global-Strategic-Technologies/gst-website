# Typography Reference

All 14 semantic text utility classes defined in `src/styles/typography.css`. Dark theme colors switch automatically via `--text-*` variables.

---

## Brutalist Headings

Monospace, uppercase, bold. Used for all headings in the brutalist design system.

| Class | Size | Weight | Transform | Spacing | Line Height | Color |
|-------|------|--------|-----------|---------|-------------|-------|
| `.brutal-heading-xl` | `2.5rem` (40px) | Bold (700) | UPPERCASE | `0.04em` | 1.1 | `--text-primary` |
| `.brutal-heading-lg` | `2rem` (32px) | Bold (700) | UPPERCASE | `0.04em` | 1.15 | `--text-primary` |
| `.brutal-heading-md` | `1.35rem` (21.6px) | Bold (700) | UPPERCASE | `0.06em` | 1.2 | `--text-primary` |
| `.brutal-heading-sm` | `1.1rem` (17.6px) | Bold (700) | UPPERCASE | `0.06em` | 1.25 | `--text-primary` |

## Brutalist Body Text

Monospace, normal weight. Used for body text, descriptions, and metadata.

| Class | Size | Weight | Line Height | Color | Usage |
|-------|------|--------|-------------|-------|-------|
| `.brutal-text-base` | `var(--text-base)` 1rem (16px) | Normal (400) | 1.7 | `--text-secondary` | Main body text, paragraphs |
| `.brutal-text-small` | `var(--text-sm)` 0.875rem (14px) | Normal (400) | 1.6 | `--text-secondary` | Secondary text, metadata |
| `.brutal-text-tiny` | `var(--text-xs)` 0.75rem (12px) | Normal (400) | 1.5 | `--text-muted` | Captions, hints, timestamps |

## Brutalist Labels

Monospace, uppercase, bold. Used for form labels, badges, section markers.

| Class | Size | Weight | Transform | Spacing | Color | Usage |
|-------|------|--------|-----------|---------|-------|-------|
| `.brutal-label` | `var(--text-xs)` 0.75rem (12px) | Bold (700) | UPPERCASE | `0.12em` | `--text-muted` | Form labels, badges, tags |
| `.brutal-label-small` | `0.65rem` (10.4px) | Bold (700) | UPPERCASE | `0.08em` | `--text-muted` | Micro labels, version badges |

## Brutalist Data Display

Monospace, bold, primary-colored. Purpose-built for numeric readouts (KPIs, percentages, currency).

| Class | Size | Weight | Spacing | Line Height | Color | Usage |
|-------|------|--------|---------|-------------|-------|-------|
| `.brutal-data` | `var(--text-xl)` 1.25rem (20px) | Bold (700) | `-0.02em` | 1 | `--color-primary` | KPI values, percentages |
| `.brutal-data-sm` | `var(--text-sm)` 0.875rem (14px) | Bold (700) | `0` | 1 | `--color-primary` | Small data values, table cells |

## Navigation

Sans-serif (inherits `--font-family`), uppercase, bold.

| Class | Size | Weight | Transform | Spacing | Color |
|-------|------|--------|-----------|---------|-------|
| `.nav-link` | `0.9rem` (14.4px) | Bold (700) | UPPERCASE | `0.1em` | `--text-secondary` |

States: `:hover` and `.active` change color to `--color-primary` with `border-bottom`. `:focus` adds 2px primary outline.

## Button Text

Sans-serif (inherits `--font-family`), uppercase, bold.

| Class | Size | Weight | Transform | Spacing |
|-------|------|--------|-----------|---------|
| `.button-text` | `0.75rem` (12px) | Bold (700) | UPPERCASE | `0.05em` |
| `.button-text-lg` | `0.95rem` (15.2px) | Bold (700) | UPPERCASE | `0.08em` |

---

## Text Size Token Scale

The `--text-*` CSS custom properties defined in `variables.css`:

```
--text-2xs    0.65rem   (10.4px)   Micro labels, fine print
--text-xs     0.75rem   (12px)     Labels, captions, badges
--text-sm     0.875rem  (14px)     Secondary text, metadata
--text-base   1rem      (16px)     Body text
--text-lg     1.1rem    (17.6px)   Emphasized body
--text-xl     1.25rem   (20px)     Section headings, data display
--text-2xl    1.5rem    (24px)     Page sub-headings
--text-3xl    2rem      (32px)     Page-level headings
```

Utility classes reference these tokens where possible. Brutalist heading sizes (`2.5rem`, `1.35rem`) are intentionally outside the scale for display-level typography.

---

## Dark Theme Behavior

All utilities use theme-agnostic `--text-*` variables that auto-switch in dark theme:

| Class Group | Variable | Light Value | Dark Value |
|-------------|----------|-------------|------------|
| `.brutal-heading-*` | `--text-primary` | `rgba(26,26,26, 0.95)` | `rgba(245,245,245, 0.95)` |
| `.brutal-text-base`, `.brutal-text-small` | `--text-secondary` | `rgba(26,26,26, 0.7)` | `rgba(200,200,200, 0.8)` |
| `.brutal-text-tiny`, `.brutal-label*` | `--text-muted` | `rgba(26,26,26, 0.6)` | `rgba(200,200,200, 0.6)` |
| `.brutal-data*` | `--color-primary` | `#05cd99` | `#05cd99` |
| `.nav-link` | `--text-secondary` | `rgba(26,26,26, 0.7)` | `rgba(200,200,200, 0.8)` |

No dark theme overrides needed for text colors — the variables handle theme switching automatically.

---

## Usage Rules

1. **Use utility classes** instead of hardcoding font sizes. For values not covered by a utility class, use `var(--text-*)` tokens.
2. **Don't create new text utilities** without checking if existing ones work.
3. **Font family**: Brutalist utilities use `monospace`. Navigation and button text inherit `--font-family` ('Helvetica Neue', Arial, sans-serif).
4. **Responsive**: Utilities work at all screen sizes. If responsive adjustments are needed, add them in component-specific styles using `var(--text-*)` tokens.

---

## Related Documentation

- **[/brand](https://globalstrategic.tech/brand)** — Live typography specimens with computed sizes, weights, and line-heights
- [BRAND_GUIDELINES.md](./BRAND_GUIDELINES.md) — Brand typography and font family guidelines
- [STYLES_GUIDE.md](./STYLES_GUIDE.md) — CSS conventions and component patterns
- [VARIABLES_REFERENCE.md](./VARIABLES_REFERENCE.md) — Complete design token catalog

---

**Last Updated**: April 5, 2026
**Source**: `src/styles/typography.css` (175 lines)
