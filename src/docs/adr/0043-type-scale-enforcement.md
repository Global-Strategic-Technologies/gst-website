# ADR-0043: The type scale is enforced, and a size off the ladder is a role-named token

- **Status**: Accepted 2026-09-30
- **Source initiative**: BL-094 (stanza pruned 2026-09-30; its full text is recoverable from the BACKLOG wave entry's pre-prune revision)

## Context

`font-size` was the last design-token family the lint did not enforce. The allow-list rule
(`declaration-property-value-allowed-list`, admitting only `var()` and the CSS-wide keywords) had
run at **warning** since 2026-07-28, when the byte-equal literals were tokenized and the rest were
deferred: unlike a colour or spacing substitution, snapping a size changes rendered type, and
[ADR-0028](0028-extended-spacing-scale.md) had already ruled that moving pixels needs rendered
evidence rather than arithmetic.

Re-measured on 2026-09-30, **129 findings across 27 files** remained (the stanza's 150 was stale):

| Class                                                          | Count |
| -------------------------------------------------------------- | ----- |
| Inside `@media print` — 11 already `pt`, 25 `px`, 2 `rem`      | 38    |
| `em` relative to the parent (`code` at 0.9em, glyphs at 0.6em) | 5     |
| `0.6rem` ×9 and `0.7rem` ×16 — the small cluster               | 25    |
| Above the 32px top of the ladder, plus `1.35rem` and `1.75rem` | 23    |
| `14px`, identical to `--text-sm`                               | 1     |
| Near misses, 0.4–1.6px from an existing step                   | 37    |

The operator supplied the missing ruling on 2026-09-30.

## Decision

**1. The small cluster gets two tokens and renders unchanged.** `--text-3xs: 0.6rem` extends the
ladder downward. `0.7rem` falls between `--text-2xs` (0.65rem) and `--text-xs` (0.75rem), so it is
`--text-size-compact` (below). Rejected: snapping `0.7rem` either way. 11.2px sits exactly halfway
between 10.4px and 12px, it is the size of `.brutal-btn`, `.brutal-input` and the filter and map
chips, and either direction moves every control on the site by 0.8px for no design reason.

**2. Display sizes get a ladder, and one-offs get named tokens; nothing renders differently.**
`--text-4xl: 2.5rem`, `--text-5xl: 3rem` and `--text-6xl: 3.5rem` extend the ladder upward. Rejected:
snapping to `--text-3xl`, which would shrink the hero from 96px to 32px. Also rejected: exempting
sizes of 1.75rem and up from the rule, which leaves display type untokenized and the rule porous.

**3. The naming rule.** T-shirt names form the ladder. A size that falls **between** two steps, or
that one component owns, is role-named under **`--text-size-*`**:

- Between steps: `--text-size-compact` (0.7rem), `--text-size-heading-md` (1.35rem, `.brutal-heading-md`),
  `--text-size-title` (1.75rem: the modal, legal `h2` and CTA-title sizes).
- One-offs, **not for reuse**: `--text-size-hero` (6rem), `--text-size-hero-sm` (2.25rem, Hero at
  ≤480), `--text-size-kpi-hero` (4.5rem, TechPar), `--text-size-toggle-glyph` (5rem — the theme-toggle
  glyph deliberately overflows its 44px hit box), `--text-size-legal-title` (2.75rem, legal `h1` at ≥480).
  They exist so the rule can be an error without an exemption list. They are published to
  claude.ai/design with the rest of the tokens, and `conventions.md` marks them as component-owned.

The `--text-size-` prefix is not decoration. `--text-*` already holds the **colour** tokens
(`--text-primary`, `--text-secondary`, `--text-muted`, `--text-light-*`, `--text-dark-*`), and
`--text-title` or `--text-hero` would read just as well as a colour. Both `color: var(--text-title)`
and `font-size: var(--text-primary)` pass every lint rule, because each rule accepts any `var()`.
`tests/integration/font-size-token-floor.test.ts` closes that hole mechanically (see Consequences).

**4. Print sizes are written in `pt`, and `pt` is allowed.** Paper has physical units, so the 25
`px` and 2 `rem` print declarations become their exact `pt` equivalents (1px = 0.75pt by CSS
definition; 12px → 9pt, 13px → 9.75pt, 1.4rem → 16.8pt). The allow-list admits `/^[0-9.]+pt$/`.
Because that admits `pt` everywhere, the floor test fails a `pt` font-size outside `@media print`.
One caveat is accepted: `rem` → `pt` is exact only at the default 16px root. A reader who raises
their browser's default font size scales `rem` but not `pt`. Nothing in `src/` overrides the root
size, and print is the one medium where a fixed physical size is correct.

**5. `em` is allowed.** The five `em` sizes exist to follow their parent (inline `code` at 0.9em of
the surrounding text; disclosure glyphs at 0.6em of their trigger). A `rem` token would break that.
The allow-list admits `/^[0-9.]+em$/`; the leading `[0-9.]+` makes a `rem` literal unmatchable.

**6. Near misses snap to the nearest ladder step, and a tie rounds up.** Only the t-shirt ladder is a snap target. A `--text-size-*` token never is: it holds a size that was kept, not one to round towards. That is why `1.4rem` (22.4px) goes to `--text-2xl` although `--text-size-heading-md` (21.6px) is nearer, and why `1.3rem` goes to `--text-xl`. These are the only declarations
whose rendered size changes. Two are exact ties once the new tiers exist: `0.8125rem` (13px, 1px
from both 12px and 14px) and `10px` (0.4px from both 9.6px and 10.4px). Both round **up**, the
legibility-safe direction; `0.8125rem` is the search-input and search-result text. Its one visible
cost, regulatory-map result names wrapping in a fixed-width dropdown, was accepted by the operator
(see Evidence).

| From                 | To            | Delta         | Where                                                           |
| -------------------- | ------------- | ------------- | --------------------------------------------------------------- |
| `9px` (on screen)    | `--text-3xs`  | +0.6px        | PalettePanel mobile labels, swatch slider labels                |
| `10px`               | `--text-2xs`  | +0.4px (tie)  | TechPar KPI labels and sub-labels                               |
| `0.8rem`             | `--text-xs`   | −0.8px        | TOC sub-items, `.filter-chip`, timeline names, DM ≤480 labels   |
| `0.8125rem`          | `--text-sm`   | +1px (tie)    | `.search-input`, `.brutal-search__input/__result/__no-results`  |
| `0.85rem`, `0.9rem`  | `--text-sm`   | +0.4 / −0.4px | legal "updated" line, library labels, TechPar chip and baseline |
| `0.95rem`, `1.05rem` | `--text-base` | +0.8 / −0.8px | `.cta-button` (site-wide), library-page headings                |
| `1.15rem`            | `--text-lg`   | −0.8px        | gateway-card `h3` at ≤768                                       |
| `1.28rem`, `1.3rem`  | `--text-xl`   | −0.5 / −0.8px | gateway-card `h3`, `/brand` SVG specimen                        |
| `1.4rem`             | `--text-2xl`  | +1.6px        | `/brand` hover-card specimen                                    |

The `/brand` `.cta-button` specimen drops its inline `0.85rem` so it shows the live button.

**7. The rule is an error.** Both config blocks set `severity: "error"`.
`tests/integration/font-size-lint-rule.test.ts` proves by mutation that it fires in `.css`, in an
`.astro` `<style>` and in an inline `style=`, that `var()`, `pt` and `em` pass, and that `0.9rem`
and `13px` fail.

The allow-list's `/var[(]/` is unanchored, so any value containing a `var()` passes. That covers
`calc(var(--text-sm) + 2px)`, `clamp(1rem, 2vw, var(--text-xl))` and the fallback in
`var(--text-sm, 13px)`, and the rule never checks the `font` shorthand at all.
`font-size-token-floor.test.ts` closes this: once every plain `var(--token)` is removed from a
`font-size` or `font` value, no `rem` or `px` length may remain. Anchoring the pattern instead would
reject the legitimate `clamp(var(--text-3xl), 6vw, var(--text-5xl))`.

**Out of scope, deliberately.** `src/scripts/infrastructure-cost-governance/logic.ts` writes
`font-size:54px/12px/10px` into generated SVG `<text>`, and `CompositeLogo.astro` uses the
`font-size="68"` presentation attribute. Both are SVG user units scaled by a `viewBox`, not CSS
type, and a `rem` token would change what they mean. stylelint lints neither `.ts` nor presentation
attributes.

## Evidence

ADR-0028 asks for rendered evidence before anything is snapped. The instrument was a scripted
Playwright capture of the computed `font-size` of every element, and of its `::before` and
`::after`, served from production builds (`npm run build`, then a static server). It covered:

- **Every page the build emits**: 52 pages plus `/colors/`. That one is a meta-refresh stub for
  `/brand#colors`, so it was dropped: its element count depended on when the refresh landed, and
  `/brand/` is captured directly.
- **Three widths**: 1280, 768 and 480, with palette 0, light theme and ambient motion pinned.
- **Eleven driven states**, since load-time capture cannot see them: a generated Diligence Machine
  agenda, TechPar with inputs, a baseline and a saved scenario, the Tech Debt Calculator and ICG
  results, regulatory-map search, no-results and the country panel (the two-tap bottom sheet at ≤768),
  the portfolio filter drawer and no-results, and `/hub/mcp/docs/` search and no-results.
- **Print emulation** for the five states that print.

The first route list was derived from the axe suite's `PAGES` plus the localized routes, and it
missed the `/hub/library/*` articles. Switching to "every page the build emits" fixed that.

Before the instrument counted as evidence, it had to pass three checks:

1. **Known-present cases.** Fifteen had to be found in the master capture, including a 9px print
   `.doc-footer`, the ICG `::before` in print, the TechPar KPI labels and the 13px search rows.
2. **Noise.** Two independent master captures had to agree exactly: 0 differences across 207 captures.
3. **Mutation.** The lint-rule test was run against the old config, where it failed 8 times on
   severity and on the not-yet-admitted `pt` and `em`, then passed once the config was flipped. A
   `font-size: 13px` planted in `toc.css` made `npm run lint:css` exit 2.

| Step                                  | Changed element captures vs master                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------------------- |
| Tokenize, including print px/rem → pt | **0**, with no structural difference in any capture                                       |
| Near-miss snaps                       | Only the elements the snapped selectors match, and the descendants that inherit from them |

The snap diff contains no other class. Its largest rows:

- The palette pop-out labels at ≤768, 9px → 9.6px, on every page.
- `.cta-button` in all its variants, 15.2px → 16px.
- The gateway-card headings, 20.8/18.4px → 20/17.6px.
- The search and filter text.
- The `/hub/library/*` headings.

A screenshot and geometry review of master against the branch followed. It covered every surface
above at three widths, in light and dark, and measured every changed element's height, width, line
count and clipping. It found:

- **No new horizontal overflow on any route.**
- **No `.cta-button` wraps**, including the longest es and pt labels ("Comience una prueba gratuita
  de 3 días" at 433px). Button height is +1.2 to +2px at 1280 and 768. At ≤480 buttons are
  unchanged, because a mobile rule already sets them to `--text-sm`.
- **One trade-off, accepted by the operator on 2026-09-30.** Regulatory-map search results are the
  13px tie that rounded up to 14px. In the 480px-wide dropdown, 5 of 15 result names now wrap to two
  lines, so about one fewer row shows before the 320px scroll cap. Nothing clips. The operator chose
  legibility and one uniform tie-break over density.
- **Headings that now wrap less.** Several library and gateway-card headings drop a line, such as
  "Desde código" and "LAYER 4: ORGANIZATIONAL ARCHITECTURE" at 480.
- **A ≤480 `h3` step-down that collapses.** On business-architectures, `.arch-subheading` (1.05rem)
  and its 0.95rem override at ≤480 both snapped to `--text-base`, so that `h3` is now the same size
  as the `h2`. The `h2` keeps its uppercase, bordered treatment. The override, now identical to its
  base, was deleted.

## Consequences

- **Files that cite this ADR:** `src/styles/variables.css` (the Text Sizes block),
  [TYPOGRAPHY_REFERENCE.md § Type-scale ruling](../styles/TYPOGRAPHY_REFERENCE.md#type-scale-ruling),
  [VARIABLES_REFERENCE.md § Typography](../styles/VARIABLES_REFERENCE.md#typography),
  [STYLES_GUIDE.md § 1b](../styles/STYLES_GUIDE.md), [DEVELOPER_TOOLING.md § stylelint](../development/DEVELOPER_TOOLING.md),
  `.design-sync/conventions.md`, and the two tests named above.
- **A new size needs a token, not an exemption.** If a design needs a size no token has, add it
  under the naming rule, with a `VARIABLES_REFERENCE.md` row (the parity guard requires one) and a
  `/brand` specimen if it is a ladder or in-between step.
- **Design sync.** New tokens are a re-sync trigger ([CLAUDE_DESIGN_SYNC.md](../development/CLAUDE_DESIGN_SYNC.md)).
- **Supersedes** the deferral recorded in ADR-0028 § 5 and § _Why this was safe_ and in ADR-0029
  § 3; each carries a dated note pointing here.
