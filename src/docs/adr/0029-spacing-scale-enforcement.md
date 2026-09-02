# ADR-0029: The spacing scale is enforced by two instruments, and sixteen off-scale values are admitted with reasons

**Status**: Accepted 2026-09-02

## Context

[ADR-0028](0028-extended-spacing-scale.md) completed the 4px ramp and swept six files, but it closed
with the scale enforced **only where it had been swept**: `tests/integration/spacing-token-floor.test.ts`
was scoped to those six files, and nothing linted spacing at all. That asymmetry is the whole
finding of BL-148 — `.stylelintrc.json` makes a hardcoded **color** a build error while
`padding: 1.5rem` passes every check the repo runs. It is why **321 rem spacing literals accumulated
across 38 files with CI green**, and why a swept file could re-rot the day after.

The stanza also recorded the trap that makes this more than a config edit. Adding `padding`/`margin`/
`gap` to the existing `scale-unlimited/declaration-strict-value` rule is a **silent no-op**: its
`ignoreValues` carries `/^-?[0-9.]+(px|rem|em|%)?,?$/`, which matches any bare number-plus-unit, and
the pattern sits in **both** the base block and the `**/*.astro` override.

Measured at `7068fba4` with the guard's own parser over 108 files: **231 rem uses in spacing
properties across 35 files** (reproducing ADR-0028's figure exactly), of which **176 are on-scale**,
**53 are off-scale sites** over **16 distinct values**, and 2 sit inside `calc()`.

## Decision

**1. Two instruments, with different reach and one referee.**

|                    | `declaration-property-value-disallowed-list` (stylelint)    | `spacing-token-floor.test.ts` (vitest) |
| ------------------ | ----------------------------------------------------------- | -------------------------------------- |
| fires at           | editor, pre-commit, CI lint                                 | `npm run test:run`                     |
| sees               | `<style>` blocks **and inline `style=` attributes**         | `<style>` blocks only                  |
| knows the scale by | a hardcoded list, bound to `variables.css` by a parity test | parsing `variables.css` directly       |
| `calc()`           | exempts the whole declaration                               | exempts **per shorthand part**         |
| misses             | `.5rem`, `1.50rem` (its value list is literal)              | inline `style=` attributes             |
| corpus             | whatever `lint:css` globs                                   | 108 files, `src/` minus `src/docs`     |

Neither sees a negative value or an uppercase unit (both key on the same `(?<![\w.-])` lookbehind);
`src/` has none of either. The guard's `src/docs` exclusion is matched by **path**, never by name —
matching the name also excluded `src/pages/hub/mcp/docs/`, a live route, and that silent hole
already produced one wrong measurement before it was closed.

The vitest guard is the **referee**: it derives the scale, owns the residual table, and judges
calc-ness per part. stylelint is deliberately coarser there — `padding: 1.25rem calc(…)` passes lint
and fails the guard — because that divergence can only ever produce a **false negative**, never a
false positive. A rule that flags a correct declaration would teach contributors to disable it.

**2. The disallowed-list is a different rule, not an extension of the strict-value one.** That is
what defuses the `ignoreValues` trap rather than fighting it: the core rule has no `ignoreValues` of
its own. It is declared in both config blocks, matching the color rule's shape.

**3. Sixteen off-scale values are admitted, all kept, none snapped.** ADR-0028's standing rule is
that snapping a value to the nearest token **moves pixels** and needs rendered evidence, not
arithmetic — the same prohibition that keeps BL-094 deferred. Every admitted value below is kept for
a reason that survives inspection, and **two** of them are **derived constants** whose relationship
to a sibling declaration would break if either half moved: `0.875rem` where it positions the search
icon, and `2.25rem`, the padding that clears it. (The two values inside `calc()` are derived
constants too, but they are a separate class — exempt by ADR-0028's ruling and therefore not among
the sixteen. Counting them here is what once made this sentence say "three".)

**4. Ten declarations stay half-tokenized, and that is accepted.** Where a declaration mixes an
on-scale and an off-scale value — `padding: 4rem 1.5rem` becoming `padding: 4rem var(--spacing-xl)` —
the result spells one concept two ways. **ADR-0028's Context names exactly that as the complaint
that started it.** It escaped by _adding tokens_ so nothing stayed half-spelled; that escape does not
exist here, because `4rem`/`5rem` are above the ramp by ruling and ADR-0028's admission rule
("a step the ramp is missing, not a value a component happens to want") forbids minting tokens for
them. Half-spelled is the honest end state, and it is preferable to either alternative: minting
`--spacing-4` would break the admission rule, and leaving the on-scale halves literal would forfeit
the enforcement this ADR exists to establish.

**5. Positioning offsets are spacing steps for this purpose.** Twelve `top/right/bottom/left` and
eight `outline-offset: 0.25rem` declarations are tokenized along with the box model, inheriting the
guard's existing `SPACING_PROPS` list. Value-identity guarantees the pixel does not move; it does
**not** by itself say the token is the right _name_. The ruling is that it is: these offsets are
tuned against the same 4px ramp as the padding beside them, and splitting the property list would
mean maintaining two definitions of "spacing" in two instruments.

## Accepted residuals

Kept, with the reason each is not a token. Cited by **value and file**, not line number — ADR-0028's
convention, for the reason it gives.

### Above the ramp — the scale does not reach these

| Value  | px  | Sites                                                                      | Why it stays                                                                                                                              |
| ------ | --- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `5rem` | 80  | `about.astro`, `global.css`, three Hub library pages, IRL generator        | **Already ruled by ADR-0028.** 80px is above the ramp's 48px top; snapping 80→48 is exactly the pixel-moving operation that ADR forbids.  |
| `4rem` | 64  | `CTABox.astro`, `CTASection.astro`, `PortfolioGrid.astro`, `global.css` ×2 | Inherits the `5rem` ruling verbatim — 64px is likewise above the top, and the gap from 48 to 64 is larger than any step the ramp defines. |

### Below the ramp — micro-spacing

| Value       | px  | Sites                              | Why it stays                                                                                                                                                                                                                                                                  |
| ----------- | --- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0.125rem`  | 2   | `cards.css`                        | **Already ruled by ADR-0028** — substantively the STYLES_GUIDE §3 badge case, in rem rather than the px the exception is written in.                                                                                                                                          |
| `0.0625rem` | 1   | `sash.css` (`.brutal-sash__badge`) | The 1px half of the same exception, on a rotated ribbon badge whose geometry is measured across twelve palette × theme combinations. Pairs with `0.3125rem` below.                                                                                                            |
| `0.15rem`   | 2.4 | `brand.astro`                      | **Does not shelter under §3**, and needs saying: that exception authorises "`1px` or `2px` directly", and 2.4px is neither. It is kept because the ramp's floor is 4px, so there is no token below it to snap to — not because the exception covers it. Pairs with `0.45rem`. |

### Between steps — moving them moves pixels

| Value       | px   | Sites                                                                                    | Why it stays                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------- | ---- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0.3125rem` | 5    | `sash.css`                                                                               | Between `xs` (4) and `sm` (8). The horizontal half of the sash badge's `1px 5px`; snapping alone would distort a chip tuned against its ribbon.                                                                                                                                                                                                                                                                                                                                     |
| `0.35rem`   | 5.6  | `PortfolioGrid.astro`, `ProjectModal.astro`, `brand.astro`                               | Between `xs` and `sm`. Appears three times as the vertical half of a badge padding whose horizontal half differs per site — a family, not one value to snap.                                                                                                                                                                                                                                                                                                                        |
| `0.375rem`  | 6    | `Footer.astro`, `filter.css`, `sash.css`, `RadarFeedSkeleton.astro` ×2, `WireItem.astro` | ADR-0028 ruled `Footer.astro`'s: 6px sits between `xs` and `sm`. **The boundary call BL-148 asked for**: STYLES_GUIDE § _Skeleton Loading Placeholders_ names `0.375rem`, and it **does** cover `RadarFeedSkeleton.astro` — that is the component the exception was written about. It does **not** cover `filter.css`, `sash.css` or `WireItem.astro`, which keep it on the between-steps reason instead.                                                                           |
| `0.4375rem` | 7    | `sash.css`                                                                               | Between `xs` and `sm`, one px below `sm`.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `0.45rem`   | 7.2  | `brand.astro`                                                                            | Between `xs` and `sm`. Partner of `0.15rem` in one declaration — rule them together.                                                                                                                                                                                                                                                                                                                                                                                                |
| `0.625rem`  | 10   | `FilterDrawer.astro`, `PortfolioHeader.astro`, `StickyControls.astro`, `filter.css`      | Between `sm` (8) and `md` (12). The vertical half of the search-input padding family.                                                                                                                                                                                                                                                                                                                                                                                               |
| `0.65rem`   | 10.4 | `PortfolioHeader.astro`, `ProjectModal.astro`, `brand.astro`                             | Between `sm` and `md`, and 0.4px from `0.625rem` — near-neighbours that are **not** the same value. Snapping either would silently merge two families.                                                                                                                                                                                                                                                                                                                              |
| `0.875rem`  | 14   | `StickyControls.astro` (`left:` only)                                                    | **A derived constant, and the only `0.875rem` site that is one**: it positions the search icon — see the geometry below.                                                                                                                                                                                                                                                                                                                                                            |
| `0.875rem`  | 14   | `PortfolioHeader.astro`, `filter.css`, `portfolio.css`, `sash.css`                       | Between `md` (12) and `lg` (16) — ordinary padding, kept on the between-steps reason alone. Split from the row above because `filter.css:43` invites the wrong reading: its `0.875rem` is the search input's **right** padding, sitting in the same shorthand whose `2.25rem` left padding **is** part of the icon geometry. One value, two unrelated jobs.                                                                                                                         |
| `1.275rem`  | 20.4 | `Header.astro`                                                                           | Between `1_25` (20) and `xl` (24), 0.4px above a token. **Measured rather than assumed**: the sticky header renders **74.78px** tall, not the 80px that `mcp-guide.css`'s `scroll-margin-top: 80px` might suggest — so the tempting "this value makes the header exactly 80px" derivation is **false**, and a future reader should not re-derive it. Kept because it moves the site's most-visible element for no stated gain; the 80px scroll anchor clears the header either way. |
| `1.65rem`   | 26.4 | IRL generator ×2                                                                         | Between `xl` (24) and `1_75` (28). An indent aligning "add custom request" and the custom list against the question rows above them; snapping would misalign a column, not resize a gap.                                                                                                                                                                                                                                                                                            |
| `2.25rem`   | 36   | `StickyControls.astro`, `filter.css`                                                     | Between `2xl` (32) and `2_5xl` (40). **A derived constant** — see below.                                                                                                                                                                                                                                                                                                                                                                                                            |

### The search-input geometry, verified

`StickyControls.astro` places `.search-icon` at `left: 0.875rem` (14px) with `width: 18px`, so the
icon's right edge lands at 32px; `.search-input`'s `padding-left: 2.25rem` (36px) clears it by 4px.
`filter.css` carries the same `2.25rem` for the same input. **Snapping either value breaks the
clearance** — `0.875rem`→`md` (12px) or `2.25rem`→`2xl` (32px) would put text under the icon. This is
the clearest case in the set of a literal that is arithmetic rather than a chosen step.

### Inside `calc()` — invisible by ruling

`0.85rem` (`Footer.astro`) and `1.6rem` (`CategoryFilter.astro`) sit inside `calc()` expressions.
ADR-0028's ruling stands: a value inside a calc is a **derived constant, not a chosen spacing step**,
and substituting a token there would break an arithmetic derivation rather than move a pixel. Both
instruments exempt them, and the guard has a dedicated test asserting it does not descend into
`calc()` — so this is by design, not oversight.

## What neither instrument governs

Five off-scale literals live in inline `style=` attributes, all of them in `BrandUILibrary.astro`
(`0.35rem` ×2, `0.125rem` ×2, `0.6rem`). `ColorSpecimens.astro` has none — its five inline literals
were all on-scale and are swept. stylelint parses inline attributes, but the disallowed-list names only
**on-scale** values, so an off-scale literal there is flagged by nothing; the vitest guard extracts
`<style>` blocks and cannot see them at all. The 41 **on-scale** inline literals in those two files
are swept and are held by stylelint alone. This gap is recorded rather than closed: the `/brand`
specimen replicas carry inline styles deliberately, because Astro's scoping cannot reach them.

## Consequences

- **The scale is now enforced everywhere it is written**, in two places that disagree only where the
  disagreement is safe. A contributor writing `padding: 1.5rem` fails at lint; one writing it inside
  a `calc()` shorthand part fails at test.
- **The residual table is the standing record.** Its liveness case fails when an admitted value stops
  matching a real declaration, so a ruling cannot rot into a comment that guards nothing.
- **`STYLES_REMEDIATION_ROADMAP.md` §3 closes.** Its "227 in the 32 files it did not touch" is
  absorbed; what remains is this table plus the px tail, which is a separate stanza.
- **The px tail is not closed.** **46** px literals with an exact token remain — `4px` ×22, `8px`
  ×12, `12px` ×7, `16px` ×3, `28px` ×1, `40px` ×1 — counted positive-only, non-calc, inline
  attributes included. They are deliberately out of scope because deciding where the documented
  1–3px micro-spacing exception ends is its own ruling, and `4px` sits exactly on that boundary.
  An earlier draft said "~55" by summing signed and unsigned sites; **there is no negative spacing
  token**, so the 26 negative px values (`-8px` ×5, `-4px` ×4, …) can never be substituted and are
  not part of this tail.
- **Neither instrument sees a negative value or an uppercase unit.** Both key on a `(?<![\w.-])`
  lookbehind, so `margin-top: -1.5rem` and `padding: 1.5REM` pass. `src/` has zero of either today,
  and a negative is genuinely un-substitutable — but this is a scope hole, not a ruling, and it is
  the one that produced the "~55" error above. stylelint is additionally literal where the guard is
  numeric: `.5rem` and `1.50rem` are caught by the guard and not by the rule. Every one of these can
  only ever be a false negative.
- **BL-094 is untouched and stays deferred.** `font-size` is excluded from both instruments by type.
  ADR-0028 was explicit that it does not pre-judge the type-scale sweep, and neither does this.
- **No design-sync re-run is required, but not because the sweep misses published surfaces** — it
  does not. `extract-chrome.mjs` names `Header.astro`, `Hero.astro` and `CTASection.astro` as slice
  sources, and because the extractor clones the matched element and collects `cidsIn(el)`, scoped CSS
  from `HeaderNavLinks.astro`, `HeaderLogo.astro` and `ThemeToggleButton.astro` reaches a slice too.
  The published CSS therefore changes. A re-sync is unnecessary because every substitution is
  value-identical and every token referenced was already published in the ADR-0028 sync.
