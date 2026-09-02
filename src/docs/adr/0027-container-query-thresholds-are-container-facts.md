# ADR-0027: Container-query thresholds are container facts, not converted viewport tiers

- **Status**: Accepted (2026-09-01)
- **Source initiative**: none — implemented directly, while fixing a footer regression that could not be fixed without repairing the gutter cascade underneath it.

## Context

`.container`'s responsive gutter ladder was declared in
[`src/styles/components/buttons.css`](../../styles/components/buttons.css) and had **never
applied**. That sheet is `@import`ed at [`global.css:13`](../../styles/global.css), and
global.css declares its own `.container { padding: 0 3rem }` afterwards at equal specificity
(0,1,0), with no cascade layers anywhere in `src/styles`. Source order decided it. The site
paid a flat 96px gutter at every width — 30% of a 320px phone — while
[`.design-sync/conventions.md`](../../../.design-sync/conventions.md) published the ladder to
claude.ai/design as though it were live, so the design agent had been building against a
gutter production did not have.

[`StatsBar.astro`](../../components/StatsBar.astro) had recorded the shadowing in a CAUTION
that ended: _"Anyone repairing buttons.css must re-derive these three thresholds."_ It is the
codebase's only `@container` user, switching at `1094px` / `672px` / `384px`, and the two
lower numbers were documented as "the old 768/480 viewport tiers expressed as container
widths, since `.container` costs a constant 96px of padding."

Repairing the cascade invalidates that sentence, because the gutter is no longer a constant:

| viewport | gutter     | container           |
| -------- | ---------- | ------------------- |
| ≤480     | 2 × 1rem   | `vw − 32` → 288…448 |
| 481–768  | 2 × 1.5rem | `vw − 48` → 433…720 |
| ≥769     | 2 × 3rem   | `vw − 96` → 673…∞   |

**The mapping is discontinuous.** A viewport of 480 yields a 448px container; 481 yields
433px. 768 yields 720px; 769 yields 673px. So container widths 433–448 and 673–720 each occur
in _two_ disjoint viewport bands, and a wider viewport can produce a narrower container.

## Decision

**All three thresholds stay at 1094 / 672 / 384, and they are documented as container facts
rather than converted viewport tiers.** No container number can express a viewport tier across
a discontinuity, so the old framing is not merely stale — it is unrepresentable.

Leaving them produces only tier _upgrades_. Measured 2026-09-01 on both renderings, before and
after, at fourteen widths including every discontinuity edge:

| viewport              | container before → after                      | `.stat-value` before → after |
| --------------------- | --------------------------------------------- | ---------------------------- |
| 320 / 360 / 416       | 224 / 264 / 320 → 288 / 328 / 384             | 24px → 24px                  |
| **417**               | 321 → 385                                     | **24px → 40px (up)**         |
| **480**               | 384 → 448                                     | **24px → 40px (up)**         |
| 481 / 511 / 512 / 720 | 385 / 415 / 416 / 624 → 433 / 463 / 464 / 672 | 40px → 40px                  |
| **721**               | 625 → 673                                     | **40px → 56px (up)**         |
| **768**               | 672 → 720                                     | **40px → 56px (up)**         |
| 769 / 816 / 817       | unchanged                                     | 56px → 56px                  |

**Rejected: re-tiering to 720 / 448** to keep the thresholds aligned with the 768/480
breakpoints. Both halves fail, and they fail on _different_ routes:

- `672 → 720` would capture viewports 769–816, whose container width does not change at all
  (673–720 before and after). Pure downgrade, bought for nothing.
- `384 → 448` would drag viewports 481–496 into the 1.5rem tier where they render 2.5rem
  today, even though their container _grew_ from 385–400 to 433–448. Type shrinking as room
  grows is the exact failure the thresholds exist to prevent.

An intermediate `384 → 432` avoids both but buys only a tidier narrative, at the cost of
moving a tier boundary that nothing required moving.

**Also corrected: which rendering is insulated.** The re-derivation was first argued on the
premise that `/brand`'s specimen is not inside a page `.container` and therefore could not
move. **That premise is false** — measured, the specimen sits in an ordinary page `.container`
and takes the same gutter, so at ≤768px both routes get `viewport − gutter` and step tiers at
identical widths. The two renderings diverge only at **≥769px**, where `/brand`'s layout goes
two-column and the specimen drops to a 361px box while the page holds 673px. That is where the
container queries earn their place; it is a desktop phenomenon, and gutters do not move there.

## Consequences

- **A threshold in `StatsBar.astro` may not be re-derived from a viewport number.** Derive it
  from the container width the tier must serve, and check both renderings — the specimen frame
  can be narrower than any viewport at desktop widths.
- **The viewport widths at which tiers step have moved**, without any threshold moving:
  small→middle from 480/481 to **416/417**, middle→top from 768/769 to **720/721**.
  [`stats-bar-fit.test.ts`](../../../tests/e2e/stats-bar-fit.test.ts) names all four in `EDGES`;
  its 4px sweep from 320 lands on 416 and 720 but would miss 417 and 721.
- **Historical viewport figures in comments are annotated, not rewritten.** The 481–511
  overflow band, the sash's 512/440/486 measurements, and the header's ~330/~345 thresholds
  were all true when measured against the flat gutter. Rewriting them into today's mapping
  would assert that something overflowed at a width where it never did.
- **Several fit justifications became conservative rather than exact** — the CTA's
  `--spacing-md`, the tech-debt calculator's `--text-2xs` slider label, the regulatory map's
  legend wrap, `StatsBar`'s 0.06em label tracking, `PortfolioHeader`'s 540px stack, and the
  header's ≤400px gap-tightening. Each declaration is kept and its comment now says why it is
  kept, rather than asserting a fit constraint the measurement no longer supports.
- **The design system was re-synced on 2026-09-01**, and this change is why the trigger
  fires twice over. `CLAUDE_DESIGN_SYNC.md` names "the four docs under `src/docs/styles/`" as
  a re-sync trigger and two of them are edited here; separately, `global.css` is in the
  published bundle's `ROOTS`, so `.container`'s exported gutter behaviour changes for the
  first time. `.design-sync/conventions.md:157` has been telling the design agent the ladder
  was real all along — the re-sync is what finally makes the published system true rather
  than aspirational. Ran `npm run build` → `build-css.mjs` → `resync.mjs` →
  `extract-chrome.mjs --check` (19/19 cards, dark twins resolve dark), then uploaded the
  styling closure, both edited guideline docs and all 19 chrome cards. **Any future change
  to the gutter ladder carries the same obligation.**
- **Accepted trade-off:** tablet gutters halve (48 → 24px per side) at 481–768px and phone
  gutters drop 48 → 16px. That is the published ladder applying for the first time, and it is
  a real visual change on every page in those bands.
- **Revisit triggers:** any change to `.container`'s gutter ladder (re-derive both routes and
  re-run the sweep); a second `@container` user (this ADR is the argument for deriving its
  thresholds from container widths rather than converting breakpoints); introducing CSS
  cascade layers, which would change how a shadowing like the original one is even possible.

**Cited by:** `src/components/StatsBar.astro`, `src/docs/styles/STYLES_GUIDE.md § Container
queries`, `tests/e2e/stats-bar-fit.test.ts`, `src/styles/global.css`.
