# Typography Reference

All 11 semantic text utility classes defined in `src/styles/typography.css`. Dark theme colors switch automatically.

---

## Headings

| Class | Size | Weight | Color | Usage |
|-------|------|--------|-------|-------|
| `.heading-xl` | `2.5rem` (40px) | Bold (700) | `--text-light-primary` | Page titles, hero headlines |
| `.heading-lg` | `2rem` (32px) | Bold (700) | `--text-light-primary` | Section titles |
| `.heading-md` | `1.35rem` (21.6px) | Semibold (600) | `--text-light-primary` | Card/subsection titles |
| `.heading-sm` | `1.1rem` (17.6px) | Semibold (600) | `--text-light-primary` | Small headings, table headers |

## Body Text

| Class | Size | Weight | Color | Usage |
|-------|------|--------|-------|-------|
| `.text-base` | `1rem` (16px) | Normal (400) | `--text-light-secondary` | Main body text, paragraphs |
| `.text-small` | `0.875rem` (14px) | Normal (400) | `--text-light-secondary` | Secondary text, metadata |
| `.text-tiny` | `0.75rem` (12px) | Normal (400) | `--text-light-muted` | Captions, hints, timestamps |

## Labels

| Class | Size | Weight | Transform | Spacing | Color | Usage |
|-------|------|--------|-----------|---------|-------|-------|
| `.label` | `0.75rem` (12px) | Bold (700) | UPPERCASE | `0.1em` | `--text-light-muted` | Form labels, badges, tags |
| `.label-small` | `0.65rem` (10.4px) | Bold (700) | UPPERCASE | `0.05em` | `--text-light-muted` | Micro labels, version badges |

## Navigation

| Class | Size | Weight | Transform | Spacing | Color |
|-------|------|--------|-----------|---------|-------|
| `.nav-link` | `0.9rem` (14.4px) | Bold (700) | UPPERCASE | `0.1em` | `--text-light-secondary` |

States: `:hover` and `.active` change color to `--color-primary` with underline. `:focus` adds 2px primary outline.

## Button Text

| Class | Size | Weight | Transform | Spacing |
|-------|------|--------|-----------|---------|
| `.button-text` | `0.75rem` (12px) | Bold (700) | UPPERCASE | `0.05em` |
| `.button-text-lg` | `0.95rem` (15.2px) | Bold (700) | UPPERCASE | `0.08em` |

Both inherit `--font-family`.

---

## Dark Theme Behavior

All utilities use theme-agnostic `--text-*` variables that auto-switch in dark theme:

| Class Group | Variable | Light Value | Dark Value |
|-------------|----------|-------------|------------|
| `.heading-*` | `--text-primary` | `rgba(26,26,26, 0.95)` | `rgba(245,245,245, 0.95)` |
| `.text-base`, `.text-small` | `--text-secondary` | `rgba(26,26,26, 0.7)` | `rgba(200,200,200, 0.8)` |
| `.text-tiny`, `.label`, `.label-small` | `--text-muted` | `rgba(26,26,26, 0.6)` | `rgba(200,200,200, 0.6)` |
| `.nav-link` | `--text-secondary` | `rgba(26,26,26, 0.7)` | `rgba(200,200,200, 0.8)` |

No dark theme overrides needed — the variables handle theme switching automatically.

---

## Size Scale (Quick Reference)

```
2.5rem   .heading-xl         Page titles
2rem     .heading-lg         Section titles
1.35rem  .heading-md         Card titles
1.1rem   .heading-sm         Subsection titles
1rem     .text-base          Body text
0.95rem  .button-text-lg     Large buttons
0.9rem   .nav-link           Navigation
0.875rem .text-small         Secondary text
0.75rem  .text-tiny          Captions
0.75rem  .label              Labels/badges
0.75rem  .button-text        Small buttons
0.65rem  .label-small        Micro labels
```

---

## Usage Rules

1. **Use utility classes** instead of hardcoding font sizes
2. **Don't create new text utilities** without checking if existing ones work
3. **Font family**: Entire site uses `--font-family` ('Helvetica Neue', Arial, sans-serif). Override only if component explicitly requires a different font.
4. **Responsive**: Utilities work at all screen sizes. If responsive adjustments are needed, add them in component-specific styles.

---

**Last Updated**: March 24, 2026
**Source**: `src/styles/typography.css` (128 lines)
