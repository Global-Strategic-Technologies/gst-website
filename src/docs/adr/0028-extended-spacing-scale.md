# ADR-0028: The extended spacing group completes a 4px ramp, and its members are named by value

**Status**: Accepted 2026-09-02

## Context

The spacing scale in `src/styles/variables.css` is a 4px ramp with two steps missing. In px:

```
4, 8, 12, 16,  · , 24,  · , 32, 40, 48
```

`20px` and `28px` had no token. They were nonetheless load-bearing: `1.25rem` and `1.75rem` appeared in **14 declarations across 6 files**, two rungs of a card ladder (`2.5 → 1.75 → 1.5 → 1.25` as breakpoints narrow) that `src/styles/components/mcp-guide.css:370-371` names when opting out of it. Two rungs of that ladder were tokens; two could not be, because no token existed.

This surfaced as a smaller complaint — `src/pages/services.astro` mixing `var(--spacing-xl)` and raw `1.5rem` — where tokenizing only the values that _had_ tokens would have left the file spelling one concept two ways.

A pre-existing group, `/* Spacing — Extended */`, already held one off-ladder member (`--spacing-2_5xl`), but it arrived incidentally in `7a831efc` (the original shared-variables commit) with no stated admission rule and no naming rule.

## Decision

**1. Add `--spacing-1_25` (20px) and `--spacing-1_75` (28px).** With them the ramp is uniform 4px from 4 through 32, coarsening to 8px steps only above 32 (`32 → 40 → 48`). The step sequence becomes `4,4,4,4,4,4,4,8,8`.

**2. The admission rule for the extended group is that arithmetic.** A value qualifies when it is a step the ramp is missing — not when a component happens to want it. This is deliberately narrower than "a value used often enough": `5rem` (80px) is used in six files and does **not** qualify, because it is above the ramp's top rather than inside a gap.

**3. Members are named by value, with no ordinal claim** — `--spacing-1_25`, `--spacing-1_75` — matching `--scrim-15 … --scrim-60` and `--color-primary-02 … --color-primary-65`.

Rejected: `--spacing-1_25xl`, extrapolating from `--spacing-2_5xl`. That reading ("numeric prefix = rem value") holds only from `2xl` up; `xs/sm/md/lg/xl` are t-shirt sizes and `xl` is 1.5rem. `2_5xl` stays monotone between `2xl` and `3xl`, but `1_25xl` would end in `xl` while sorting _below_ `--spacing-xl` — a false ordinal no other family here carries.

**4. `--spacing-2_5xl` is not renamed.** It predates the rule and would not be chosen today, but the tokens are published to claude.ai/design, where a rename produces silently unstyled output rather than a loud failure. The group is therefore deliberately non-uniform in naming, and `variables.css` says so at the declaration.

**5. `--text-xl` is also `1.25rem`.** A spacing token and a type token now share a value. They are not duplicates and must not be "deduped" — they move for different reasons, and a future type-scale change (BL-094) must not drag the spacing ramp with it.

## Why this was safe, where the type-scale sweep is not

BL-094 defers the analogous off-scale _font-size_ sweep because snapping a size to the nearest token **changes rendered type**, and the repo has no visual-regression coverage to catch a mistake. `STYLES_GUIDE.md` § _1b. Off-Scale Font Sizes_ states the prohibition. (Cited by SECTION, not line: this branch already had five such citations rot when a commit grew a paragraph above them — see `a09b5905`.)

This is the opposite operation. The new tokens hold the **exact** values already in the CSS, so all 90 substitutions are value-identical and no pixel moves. That property is what made a sweep this size reviewable at all, and it rests on a measured fact: all `--spacing-*` declarations live at `variables.css:130-136` and `:347-349`, `palettes.css` declares none, `html.dark-theme` carries only `color-scheme` and two RGB triplets, and nothing shadows a spacing token in any media query, container query or component sheet. So a `var()` substitution cannot resolve differently in any theme, palette or breakpoint.

That section prohibits **snapping**, not tokenizing. The distinction is the whole basis of this ADR.

## Accepted residuals

Four off-scale **rem** spacing values remain in the six swept files, each kept deliberately. (Those files also keep blessed _px_ micro-spacing — `cards.css:351,544` `padding: 2px var(--spacing-sm)`, `:445,465` `1px`, `:107,741` `outline-offset: 2px` — which is exactly the `STYLES_GUIDE.md` § _3. Hardcoded Spacing_ form and is not in scope here.)

| Value      | Site              | Why it stays                                                                                                                                                                                                                                                                                         |
| ---------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0.125rem` | `cards.css:223`   | Substantively the `STYLES_GUIDE.md` § _3. Hardcoded Spacing_ badge case. That exception is written in **px** (`1px`/`2px`); this declaration is rem, and converting would break value-identity under a non-16px root — so the unit diverges from the exception on purpose.                           |
| `0.85rem`  | `Footer.astro:42` | Not a chosen step: a derived constant inside `calc((0.85rem - var(--touch-target-min)) / 2)`, computing the 13.6px margin box derived in the comment at `:32-40`. Substituting a token would break an arithmetic derivation, not merely move a pixel.                                                |
| `5rem`     | `about.astro:158` | 80px sits **above** the ramp's 48px top, so the scale does not reach it. Six source files use `5rem` un-tokenized — this one, `global.css:402`, and four Hub pages — so it is an established value, not a local accident. Snapping 80px→48px is exactly the pixel-moving operation this ADR forbids. |
| `0.375rem` | `Footer.astro:62` | 6px sits between `xs` (4px) and `sm` (8px); moving it moves pixels. `STYLES_GUIDE.md` § _Skeleton Loading Placeholders_ also names `0.375rem`, but that exception is about approximating text height and does not cover this one.                                                                    |

**`tests/integration/spacing-token-floor.test.ts` enforces three of the four.** The guard does not descend into `calc()`, because a value inside one is a derived constant rather than a chosen spacing step — so `Footer.astro:42` is invisible to it **by design, not by oversight**. Its residual set is the three non-calc entries, asserted at exactly that cardinality.

## Consequences

- **The scale is enforced where it was swept, and only there.** The guard is scoped to the six files this cleared. Nothing lints spacing tokens repo-wide — `.stylelintrc.json`'s strict-value rule covers only the color families (`font-size` is governed separately, by a `declaration-property-value-allowed-list` at warning severity), and its `ignoreValues` carries `/^-?[0-9.]+(px|rem|em|%)?,?$/`, which matches any bare number-plus-unit, so adding `padding`/`margin`/`gap` to that rule would be a silent no-op. That, and the **227 rem spacing literals in the 32 files this sweep did not touch**, are **BL-148**. (Repo-wide the figure is 231 across 35 at HEAD, which includes the four residuals above; 321 across 38 before the sweep. Measured across `src/` with the guard's property list and the shared `css-parse` helpers — not the guard itself, which is scoped to six files.)
- **The design system must be re-synced.** `.design-sync/conventions.md:68` now names all three extended tokens, but publishing is a separate operator action; until it runs, claude.ai/design does not know these two exist. Additions go stale rather than breaking, since the design-sync guard is one-directional (docs→src) — which is exactly why nothing fails loudly.
- **`STYLES_GUIDE.md`'s token census lost its Count column** in the same change. It claimed a Total of 160 over rows summing to 152, against a `:root` holding 218, and nothing guarded it. `VARIABLES_REFERENCE.md` had already ruled that counts are not stated and the parity test is the referee.
- **`STYLES_REMEDIATION_ROADMAP.md` §3 was corrected**, not rewritten: its March 2026 "Complete" was true of _pixel_ spacing and of the micro-spacing exception it documents; it was false in implying nothing else remained. rem literals were never in that pass.

## Superseded in part by ADR-0029 (2026-09-02)

The first consequence above — "the scale is enforced where it was swept, and only there", with its
227-literal count — describes the state this ADR closed in, not the state today.
[ADR-0029](0029-spacing-scale-enforcement.md) absorbed those literals, widened the guard repo-wide
and added the lint rule (via a different rule, which is how it evades the `ignoreValues` trap named
above). The count stands as the historical figure; do not edit it. Every other consequence, the
accepted-residual table, and the value-identity argument that made a sweep this size reviewable all
remain in force, and ADR-0029 rests on them.
