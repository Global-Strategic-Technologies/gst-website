# Typography Reference

All 14 semantic text utility classes defined in `src/styles/typography.css`. Dark theme colors switch automatically via `--text-*` variables.

---

## Brutalist Headings

Monospace, uppercase, bold. Used for all headings in the brutalist design system.

| Class                | Size               | Weight     | Transform | Spacing  | Line Height | Color            |
| -------------------- | ------------------ | ---------- | --------- | -------- | ----------- | ---------------- |
| `.brutal-heading-xl` | `2.5rem` (40px)    | Bold (700) | UPPERCASE | `0.04em` | 1.1         | `--text-primary` |
| `.brutal-heading-lg` | `2rem` (32px)      | Bold (700) | UPPERCASE | `0.04em` | 1.15        | `--text-primary` |
| `.brutal-heading-md` | `1.35rem` (21.6px) | Bold (700) | UPPERCASE | `0.06em` | 1.2         | `--text-primary` |
| `.brutal-heading-sm` | `1.1rem` (17.6px)  | Bold (700) | UPPERCASE | `0.06em` | 1.25        | `--text-primary` |

## Brutalist Body Text

Monospace, normal weight. Used for body text, descriptions, and metadata.

| Class                | Size                             | Weight       | Line Height | Color              | Usage                       |
| -------------------- | -------------------------------- | ------------ | ----------- | ------------------ | --------------------------- |
| `.brutal-text-base`  | `var(--text-base)` 1rem (16px)   | Normal (400) | 1.7         | `--text-secondary` | Main body text, paragraphs  |
| `.brutal-text-small` | `var(--text-sm)` 0.875rem (14px) | Normal (400) | 1.6         | `--text-secondary` | Secondary text, metadata    |
| `.brutal-text-tiny`  | `var(--text-xs)` 0.75rem (12px)  | Normal (400) | 1.5         | `--text-muted`     | Captions, hints, timestamps |

## Brutalist Labels

Monospace, uppercase, bold. Used for form labels, badges, section markers.

| Class                 | Size                            | Weight     | Transform | Spacing  | Color          | Usage                        |
| --------------------- | ------------------------------- | ---------- | --------- | -------- | -------------- | ---------------------------- |
| `.brutal-label`       | `var(--text-xs)` 0.75rem (12px) | Bold (700) | UPPERCASE | `0.12em` | `--text-muted` | Form labels, badges, tags    |
| `.brutal-label-small` | `0.65rem` (10.4px)              | Bold (700) | UPPERCASE | `0.08em` | `--text-muted` | Micro labels, version badges |

## Brutalist Data Display

Monospace, bold, primary-colored. Purpose-built for numeric readouts (KPIs, percentages, currency).

| Class             | Size                             | Weight     | Spacing   | Line Height | Color             | Usage                          |
| ----------------- | -------------------------------- | ---------- | --------- | ----------- | ----------------- | ------------------------------ |
| `.brutal-data`    | `var(--text-xl)` 1.25rem (20px)  | Bold (700) | `-0.02em` | 1           | `--color-primary` | KPI values, percentages        |
| `.brutal-data-sm` | `var(--text-sm)` 0.875rem (14px) | Bold (700) | `0`       | 1           | `--color-primary` | Small data values, table cells |

## Navigation

Uppercase, bold, in the pinned mono (inherits `--font-family`, which points at `--font-family-mono`).

| Class       | Size              | Weight     | Transform | Spacing | Color              |
| ----------- | ----------------- | ---------- | --------- | ------- | ------------------ |
| `.nav-link` | `0.9rem` (14.4px) | Bold (700) | UPPERCASE | `0.1em` | `--text-secondary` |

States: `:hover` and `.active` change color to `--color-primary` with `border-bottom`. `:focus` adds 2px primary outline.

## Button Text

Uppercase, bold, in the pinned mono (inherits `--font-family`, which points at `--font-family-mono`).

| Class             | Size               | Weight     | Transform | Spacing  |
| ----------------- | ------------------ | ---------- | --------- | -------- |
| `.button-text`    | `0.75rem` (12px)   | Bold (700) | UPPERCASE | `0.05em` |
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

| Class Group                               | Variable           | Light Value            | Dark Value                |
| ----------------------------------------- | ------------------ | ---------------------- | ------------------------- |
| `.brutal-heading-*`                       | `--text-primary`   | `rgba(26,26,26, 0.95)` | `rgba(245,245,245, 0.95)` |
| `.brutal-text-base`, `.brutal-text-small` | `--text-secondary` | `rgba(26,26,26, 0.7)`  | `rgba(200,200,200, 0.8)`  |
| `.brutal-text-tiny`, `.brutal-label*`     | `--text-muted`     | `rgba(26,26,26, 0.6)`  | `rgba(200,200,200, 0.6)`  |
| `.brutal-data*`                           | `--color-primary`  | `#05cd99`              | `#05cd99`                 |
| `.nav-link`                               | `--text-secondary` | `rgba(26,26,26, 0.7)`  | `rgba(200,200,200, 0.8)`  |

No dark theme overrides needed for text colors — the variables handle theme switching automatically.

---

## Usage Rules

1. **Use utility classes** instead of hardcoding font sizes. For values not covered by a utility class, use `var(--text-*)` tokens.
2. **Don't create new text utilities** without checking if existing ones work.
3. **Font family**: everything resolves to one family. `--font-family-mono` is the pinned `GST Mono`, and `--font-family` points at it — so navigation and button text are the same face as the brutalist utilities, not a second one. Never name a family in a stylesheet; `tests/integration/font-token-pin.test.ts` fails the build on a literal family outside `variables.css` / `fonts.css`.
4. **Responsive**: Utilities work at all screen sizes. If responsive adjustments are needed, add them in component-specific styles using `var(--text-*)` tokens.

---

## The pinned mono

Every text surface on the site resolves to one family, declared in
`src/styles/fonts.css` and reached only through `var(--font-family-mono)`.

|                |                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| **Face**       | Geist Mono Variable, weight axis 100–900                                                              |
| **Licence**    | OFL 1.1 — shipped at `public/fonts/GEIST-MONO-OFL.txt`                                                |
| **Upstream**   | `vercel/geist-font` v1.7.2, `GeistMono[wght].ttf`                                                     |
| **Shipped as** | `public/fonts/gst-mono-var-latin.woff2` — 25,952 bytes, 367 codepoints                                |
| **Alias**      | `GST Mono`. Nothing in the repo names the real face; a change is one `src` line                       |
| **Fallbacks**  | `GST Mono Fallback` (Menlo/DejaVu, `size-adjust: 99.7%`), `GST Mono Fallback WD` (Consolas, `109.1%`) |
| **Metrics**    | upem 1000, uniform 600/1000 advance at every weight, hhea 1005 / −295 / 0                             |

**Why it is pinned.** The token was the bare generic `monospace`, so the face
was the visitor's OS's choice — and advance widths across the plausible
resolutions differ by ~9%. Fixed geometry was sized against one of them: the
sash's 45° chord clips rather than reflows, a grid floor was derived from a wire
identifier's ink width, and a CTA label fitted its button with 0.4px to spare.
Pinning the face made the three engines agree: the sash's 35-character subtext
now measures 253.2 / 252.7 / 253.2px where it was 222 / 222 / 240.

**Known and accepted:** WebKit does not apply this face's weight axis — every
weight paints identically there, while Chromium and Firefox vary correctly. It
is the face, not the subset (the untouched upstream file and two independent
rebuilds behave the same, and a control variable font varies in the same
engine); upstream carries an open cluster of weight-axis bugs
(`vercel/geist-font` #12, #65, #68, #90). Shipping the variable file alone is a
deliberate decision — nothing about layout depends on it, because the advance is
uniform across the axis.

### Re-cutting the subset

Do not hand-edit the `unicode-range` in `fonts.css`: it is written to match the
shipped file's coverage exactly. To change coverage, re-cut and update both.

```bash
# fonttools + brotli in a throwaway venv; nothing needs installing globally
python -m venv fontenv && ./fontenv/bin/pip install fonttools brotli

./fontenv/bin/python -m fontTools.subset 'GeistMono[wght].ttf' \
  --output-file=public/fonts/gst-mono-var-latin.woff2 \
  --flavor=woff2 \
  --unicodes="U+0000-00FF,U+0131,U+2000-206F,U+20AC,U+2190-2199,U+2212,U+221A,U+2248,U+2264-2265,U+25A0-25FF,U+2500-257F" \
  --drop-tables+=DSIG --no-hinting
```

Two notes on that range, both learned the hard way:

- **`U+2500-257F` (box drawing) is load-bearing.** The TableOfContents tree and
  the `/brand` rules draw ~16,000 of those characters; in a fallback face they
  misalign against the mono grid.
- **Do not pass `--layout-features='kern,liga,tnum,zero'`.** This face has none
  of those four features, so the flag would drop `ccmp`, `mark`, `mkmk` and
  `locl` (which it does have, and needs) while keeping nothing. Tabular figures
  come free: every glyph has the same advance.

Δ (U+0394), ⓘ (U+24D8) and ⚠ (U+26A0) are deliberately outside the range —
Geist Mono has no glyph for them at all, so they fall through to the
metric-matched fallback per-glyph, which is correct.

---

## Related Documentation

- **[/brand](https://globalstrategic.tech/brand)** — Live typography specimens with computed sizes, weights, and line-heights
- [BRAND_GUIDELINES.md](./BRAND_GUIDELINES.md) — Brand typography and font family guidelines
- [STYLES_GUIDE.md](./STYLES_GUIDE.md) — CSS conventions and component patterns
- [VARIABLES_REFERENCE.md](./VARIABLES_REFERENCE.md) — Complete design token catalog

---

**Last Updated**: April 5, 2026
**Source**: `src/styles/typography.css` (175 lines)
