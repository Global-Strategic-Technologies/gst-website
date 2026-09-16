# ADR-0035: Status colours are fills; text uses ink tokens; brand teal is exempt

- **Status**: Accepted (2026-09-16)
- **Source initiative**: PR #489 (BL-116 orphan-class guard) — the contrast defects surfaced while unblocking it. No separate design doc; the plan and its three review rounds are summarised here.

## Context

PR #489 imported `map.css` on the MCP trial page so its credential panel stopped rendering unstyled. That gave `.brutal-panel` an **opaque** background, and two trial E2E tests began failing on serious axe `color-contrast` violations.

The import did not cause them. `body` paints the site's checkerboard as a background **image** (`src/styles/global.css`), and axe-core reports contrast as **INCOMPLETE** — never as a violation — when no opaque ancestor background resolves. Most of the site's text sits directly over that image, so the accessibility suite had been passing over failures it could not measure. Proven both ways on the trial page: with the import, 7 violations and 0 incomplete for the affected nodes; without it, 0 violations and the same nodes all incomplete.

Measured (WCAG AA: 4.5:1 text, 3:1 large text and non-text UI):

| Colour used as text                                                                 | on `#ffffff` | note                                                |
| ----------------------------------------------------------------------------------- | ------------ | --------------------------------------------------- |
| `--color-primary` `#05cd99`                                                         | 2.06         | 1.88 on `#f5f5f5`; fails the 3:1 non-text bar too   |
| `.brutal-btn--primary` teal on its 15% tint                                         | 1.82         | a PR-blocking node                                  |
| `--color-primary-dark` `#04a87a`                                                    | 3.05         | was used as ink in 6 places — a false fix           |
| `--color-secondary` / `--color-warning`                                             | 2.96         | secondary coloured every link at rest               |
| success 4.25 · authority 4.45 · distinguish 4.23 · subdued 4.11 · editors-pick 4.36 | fail         |                                                     |
| `--color-error` `#d93636`                                                           | 4.63         | but 4.25 on `#f5f5f5`, the surface it often sits on |
| `--color-tertiary` `#02724f`                                                        | 5.96         | the one existing ink; equals primary in dark theme  |

Palettes were worse (warning `#eab308` 1.92, secondary `#84cc16` 1.98, distinguish `#06b6d4` 2.43).

One further node was a timing artefact, not a colour: muted text measured 4.17:1 while the trial page's `.state-block` fade animation ran, and 5.40:1 once settled.

## Decision

**Status and secondary colours are FILL and BORDER colours; text uses a darker, theme-aware ink. Brand teal (`--color-primary`) is exempt: its text, icons and focus rings stay teal.**

1. **Brand teal keeps its own colour as text, icons and focus rings.** A first cut routed all 182 primary-ink declarations and every focus ring to `--color-tertiary` (#02724f, 5.96:1). Rendered, that read as forest green replacing the brand teal on the hero, delta icons and theme toggle, and the owner rejected it as a brand regression. Teal text is therefore accepted below AA (2.06:1 on white). No `--color-primary-ink` exists; a darker teal would carry the same objection. Where a teal-on-tint control blocked CI, the fix is local: the MCP trial page's "Copy key" button uses teal as the FILL with dark text, and its test scans after hover and copied feedback settle.
2. **Eight ink tokens are added**: `--color-{secondary,warning,success,error,authority,distinguish,subdued,editors-pick}-ink`. Secondary and warning stay separate although both are `#cc8800` by default; they diverge in every alternative palette.
3. **Light values are measured, not derived by formula.** Each clears **≥ 4.75:1 on `#f5f5f5`** (the darker light surface, with margin) and **≥ 4.5:1 on its own 12% tint** (the chip case), in all six palettes. Three first candidates missed the margin and were re-derived rather than accepted (palette-2 lime 4.69, palette-4 success 4.60, palette-5 success 4.98).
4. **Dark halves copy the base token's dark literal verbatim.** Per spec, `light-dark()` could nest a `var()`, but LightningCSS lowers `light-dark()` against this repo's browserslist targets into `var(--lightningcss-light, A) var(--lightningcss-dark, B)` helper pairs switched by `html.dark-theme`, so the copied literal is the reliable form. The palette dark blocks alias each `--altN-*-ink` to its base. Result: the swap is a no-op in dark theme for every palette. If the browserslist floor ever drops lowering, the literals can become `var()`s.
5. **Wiring is four layers**: the token in `variables.css`; per-palette light values in `palettes.css :root`; seven `--color-X-ink: var(--altN-color-X-ink)` mapping lines in each `html.palette-N` block (palette-0 maps only authority/distinguish/subdued); and the dark aliases. `--color-editors-pick-ink` is **root-only**, like its base, which no palette re-points.
6. **Focus rings stay `--color-primary`.**
7. **Runtime emitters split fill from ink.** Where one value painted both text and a fill, an ink is added beside it rather than repointing it: `getMaturityLevel()` returns `ink` beside `color` (ICG gauge and bars keep `color`); TechPar gains `zoneInkVar()` beside `zoneColorVar()` (bars, chart lines and legend strokes keep the zone colour). Tech-debt's `burdenClassify` only colours text, so it changed at source. In every emitter the teal branch stays `--color-primary`.

**Rejected alternatives**

- **`color-mix(in oklab, var(--color-X) N%, black)`** — one declaration per token and palette-following for free, but a fixed percentage cannot guarantee a ratio across hues (amber, lime and cyan need very different darkening), so it cannot promise AA.
- **A "≥ 3:1 against the base token" criterion**, in the original plan. Every measured candidate failed it (1.53–2.00) because an ink never sits on its base, only on a tint of it — which the tint bar already covers. Enforcing it would drive inks so dark they stop reading as their hue.
- **A rendered site-wide contrast probe** as the before/after instrument. It was built and abandoned: class-toggled theme switches repeatedly produced mixed states (dark text over stale light surfaces) that no validation strategy made trustworthy, while every case examined showed the site itself correct. Token values are guarded without a browser instead.

**Deliberate exceptions** — three `/brand` ColorSpecimens chips keep the base status tokens, because they demonstrate those tokens.

**Deferred** — dark-theme contrast is unmeasured: every axe scan runs in light theme. Filed as [BL-162](../development/BACKLOG.md#bl-162-dark-theme-contrast-is-never-scanned). The ink tokens do not change dark theme, so this decision does not make it worse.

## Consequences

- Cited by: `src/styles/variables.css` and `src/styles/palettes.css` (token comments), `src/styles/global.css` (link ink, `.skip-nav`), `src/utils/icg-engine.ts`, `src/utils/techpar-engine.ts`, `src/utils/techpar/chart.ts`, `src/utils/tech-debt-engine.ts`.
- Guarded by `tests/integration/ink-token-contrast.test.ts`: both bars in all six palettes, resolved through each palette's own alias chain (so a forgotten mapping fails rather than silently inheriting the default); per-palette mapping completeness; editors-pick root-only; and each ink's dark literal equal to its base's. Proven by mutation.
- `tests/e2e/helpers/a11y.ts` now waits for fonts and finite animations before scanning, filtering by `effect.getTiming().iterations` — `Animation` has no `iterations` property, and every animation running on the sampled routes was infinite.
- **Authoring rule**: a new text colour from the brand/status family uses its `-ink` token; brand teal text uses `--color-primary`. Fills, borders, chart strokes and specimen swatches keep the base token.
- Revisit if: the checkerboard becomes an opaque colour (axe could then police this directly), the browserslist floor stops lowering `light-dark()`, or a palette is added (it needs all seven mappings, which the guard enforces).
