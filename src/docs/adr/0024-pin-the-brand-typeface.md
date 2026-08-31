# ADR-0024: Pin the brand typeface to one self-hosted variable mono, and collapse the sans onto it

- **Status**: Accepted (2026-08-29)
- **Source initiative**: BL-144. The design handoff that specified this was delivered out of band as a bundle (a README, a `.dc.html` decision record carrying a live drift comparison across nine candidate faces, and paste-ready reference CSS); it was never committed and was deleted once consumed, so this ADR and [TYPOGRAPHY_REFERENCE.md § The pinned mono](../styles/TYPOGRAPHY_REFERENCE.md) are the surviving record. The BACKLOG stanza was pruned on completion — recover it with `git log -- src/docs/development/BACKLOG.md`.

## Context

GST presents as a monospace brand and shipped no monospace font. `--font-family-mono` was declared as the bare generic `monospace`, so the typeface a visitor actually saw was chosen by their OS — Menlo on macOS, Consolas or Courier New on Windows, DejaVu Sans Mono on most Linux. 449 declarations resolve through that token: the whole `.brutal-*` vocabulary, tool chrome, the bench table, the print report header and every `/brand` specimen. `--font-family` had the same defect one degree milder — `'Helvetica Neue'` is absent off Apple hardware and silently became Arial.

Advance widths across those resolutions differ by ~9% (Consolas 550/1000 against Courier New's and Menlo's 600ish), which is roughly a whole character on a 35-character label. That would be survivable if everything reflowed. It does not: the announcement sash is a fixed 45° chord that **clips** rather than reflows, grid track floors are derived from a wire identifier's ink width, and tracked uppercase type is tuned by eye.

Two shipped defects in a single day (2026-08-29) had this one cause, which is what forced the decision:

- the sash's under-band subtext overflowed WebKit by 5.3px at the family's 0.1em tracking while Chromium and Firefox cleared it by under 1px;
- `/hub/mcp/docs/`'s workflow grid squeezed a wire identifier at 1280px on the Linux CI runner while passing on Windows, leaving CI red for a day.

Both were fixed by buying headroom — the right local call and the wrong global one, because headroom against an unknown face is a guess that has to be re-guessed at every new surface.

## Decision

**One face, self-hosted, named once.** `--font-family-mono` resolves to `'GST Mono'` — Geist Mono Variable (OFL 1.1, `vercel/geist-font` v1.7.2), subset to 367 codepoints and 25,952 bytes at `public/fonts/gst-mono-var-latin-v1.woff2`, weight axis 100–900 intact. Declared in `src/styles/fonts.css`, imported first from `global.css` so the faces precede every consumer including the print rules.

**Aliased, not named.** The family is `GST Mono`, never `Geist Mono`. 449 call sites go through the token, so a future face change is one `src` line rather than a repo-wide rename. `tests/integration/font-token-pin.test.ts` fails the build on a literal family name outside `variables.css` / `fonts.css`, on a `--font-family*` token that resolves to bare generics, on a third-party font origin, and on an mcp-server page whose mono stack leads with a generic.

**`font-display: swap` behind metric-matched fallbacks.** Two `local()`-only faces — `GST Mono Fallback` (Menlo/DejaVu at `size-adjust: 99.7%`) and `GST Mono Fallback WD` (Consolas at `109.1%`) — occupy the pinned face's box before the swap, so the swap changes glyph shapes and not one line break.

The vertical half of that took two attempts and is the trap worth recording: `ascent-override` **composes with** `size-adjust` rather than replacing it. Declaring the pinned face's own metrics (100.5% / 29.5%) on both faces read correctly and measured wrong — the Consolas fallback's line box came out at 108.4% of the pinned face's, a vertical reflow on swap. Each face therefore carries those figures **divided by its own `size-adjust`**, which measures 100.0% on both axes in Chromium and Firefox. WebKit applies `size-adjust` but ignores the overrides entirely and sits at 96.9%; that is a swap-window-only difference on the axis no fixed geometry here is sized against, and it cannot be corrected from CSS.

**The sans collapses onto the mono.** `--font-family: var(--font-family-mono)`. Nav links and button text were its only consumers and most visitors were already getting Arial by accident, so this removes a second family rather than choosing one.

**Rejected:**

- _A named system stack_ (`ui-monospace, SFMono-Regular, Menlo, Consolas, …`). Cheaper and zero bytes, but it does not pin anything — it only makes the per-platform face predictable, which still leaves three different advance widths and every fixed geometry tuned against one of them. Explicitly rejected by the product owner.
- _Static weight files._ The site uses five weights (400/500/600/700/900); five static cuts are ~52KB against the variable file's 26KB.
- _A third-party font origin_ (Google Fonts, jsDelivr). The CSP sends `font-src 'self'`; self-hosting keeps it that way and adds no origin to the critical path.
- _Preserving today's macOS rendering_ by re-tuning tracking back to the old ink widths. The ruling is a re-baseline: the pinned face is the new truth.

**Accepted with eyes open:** WebKit does not apply this face's weight axis — every weight paints identically there, while Chromium and Firefox vary correctly. It is the face, not the subset: the untouched upstream file and two independent rebuilds behave the same, and a control variable font (Inter) varies in the same engine. Upstream carries an open cluster of weight-axis bugs (`vercel/geist-font` #12, #65, #68, #90). Shipping the variable file alone was chosen over adding a static Bold cut, because nothing about **layout** depends on the axis — every glyph has the same 600/1000 advance at every weight — and a future upstream release may fix it for free.

## Consequences

**The engines now agree.** The sash's 35-character subtext measures 253.2 / 252.7 / 253.2px across Chromium, Firefox and WebKit, where it was 222 / 222 / 240. Its copy ceiling is one number — 37 characters — instead of three. The class of bug where CI is red on Linux and green on Windows for a text-fitting reason is gone.

**The headroom bought by the two BL-144 defects is kept, and is no longer a guess.** The sash's 220px corner box and `JobCard`'s 18.5rem track floor were both derived against the widest face any engine resolved the generic to; the pinned face's advance _is_ that widest case, so both figures are now exact rather than speculative. Neither was given back.

**A re-baseline pass shipped with the pin.** The face is ~9% wider than what Windows Chromium previously resolved, which exposed six fitting failures — four of them pre-existing and independent of the pin:

| Surface                               | What moved                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StatsBar.astro`                      | Steps now key on the **container**, not the viewport, because the component renders at two different widths for one viewport (`/ma-portfolio/` vs the `/brand` specimen frame). Four columns require a 1064px container; below that the grid halves. This band was broken before the pin — at a 900px viewport the value hung 65px outside its cell.                                                              |
| `JobCard.astro`                       | `minmax(0, 1fr)` at ≤768 (a bare `1fr` floored the track at the nowrap wire id's min-content and blew the grid past the viewport by 57px at 320); below 768 the id wraps, which is a documented reversal — see below.                                                                                                                                                                                             |
| `PortfolioHeader.astro`               | A hard `min-width` on the search box, and a stack threshold at 480 where the nowrap page title needs 540, left `/ma-portfolio/` scrolling sideways at **every width from 481 to 959** — 210px at 540. Pre-existing; on Windows Chromium the pin moved the clean threshold from ~900 to ~960, which is how it was finally seen — the engine matters here, since each resolved the old generic to a different face. |
| `mcp-primitive-summary` (`/hub/mcp/`) | `auto-fit` against the longest label's intrinsic width instead of three fixed columns.                                                                                                                                                                                                                                                                                                                            |
| `.cta-button` (≤480)                  | Tighter padding and `--text-sm`: the 20-character function-style labels fitted the old face with 0.4px to spare.                                                                                                                                                                                                                                                                                                  |
| `.legal-page-body`                    | `overflow-wrap: anywhere` — the contact address is 269px of unbreakable mono against 205px at 320px.                                                                                                                                                                                                                                                                                                              |

**The guard found more than review did, and then found more again when it was widened.** Its first version caught `CompositeLogo.astro`'s SVG wordmark (`font-family="monospace"` as a presentation attribute — the live logo rendered in an OS-chosen face) and two hardcoded copies of the old sans stack in `filter.css`. Neither came from reading the diff. But that first version knew only the `font-family:` spelling, so it reported a clean sweep it had not done: widening it to Chart.js's `family:` key and the `font:` shorthand then found four stale `'Helvetica Neue', Arial, sans-serif` fallbacks in `src/utils/techpar/chart.ts` and the Worker shell's own `system-ui` body. A guard's regex is part of its scope, and a narrow one is indistinguishable from a passing one.

**A reversal worth recording, because the first fix was worse than the defect.** Below 768px the longest wire id (266px of ink against 224px of usable width at 320) cannot stay on one line at full size. `JobCard`'s doctrine forbids splitting or shrinking it, so it was first given `overflow: auto` — which makes it a scroll container, which axe rates `scrollable-region-focusable`, **serious**, a severity this repo carries none of. The usual remedy (`tabindex="0"`) would have put a tab stop inside a link on every step. So the doctrine yields at that tier and the id wraps: below 768 a step is a full-width block, and the "reads as two steps" failure the doctrine guards against is a property of the side-by-side desktop layout. None of this was visible to CI, because the a11y sweep is desktop-only.

**Container queries entered the codebase here, with one trap.** `StatsBar` is the first user and the reason is narrow: it is rendered at two widths for one viewport. A container query cannot consult its own contents, so `container-type: inline-size` on an element whose width is content-derived resolves to **zero** — which collapsed the `/brand` specimen to 0px tracks, since `.brand-component-item` is a flex column with `align-items: flex-start`. The specimen wrapper now takes `align-self: stretch`, the same "give it a definite containing block" fix brand.astro already documents for the CTA specimen.

**Worker-served HTML resolves the fallbacks, never a generic.** `mcp-server/` is a separate origin and cannot fetch the site's font, so `html-shell.ts` exports `MONO_FALLBACK_FACES` / `MONO_STACK` and inlines the `local()` faces. The percentages are duplicated across the workspace boundary, and that duplication IS enforced: the website guard parses both files and fails when the `size-adjust` values diverge, while `html-shell-font.test.ts` on the server side asserts the faces reach the served markup rather than merely existing as a constant.

**Two rows of the handoff's re-baseline checklist were vacuous and are recorded as such:** the repo has no visual snapshot suite to re-take (so no CI font environment to pin), and no `ch` units anywhere.

**The font filename carries a version.** `/fonts/*` is served `immutable` for a year, so an unhashed name would put a re-cut permanently out of reach of returning visitors. The shipped file is `gst-mono-var-latin-v1.woff2` and the re-cut recipe says to bump the suffix.

**Revisit triggers:** an upstream Geist release that fixes the weight axis in WebKit (drop the caveat); a second family ever being genuinely needed (this ADR is what to argue against); any new fixed-geometry surface sized against mono text — derive its floor from the pinned face's 600/1000 advance rather than measuring on one machine.

**Cited by:** `src/styles/fonts.css`, `src/styles/variables.css`, `src/docs/styles/TYPOGRAPHY_REFERENCE.md § The pinned mono` (the maintained reference, including the re-cut recipe), `BRAND_GUIDELINES.md`, `VARIABLES_REFERENCE.md`, `.design-sync/conventions.md`, `tests/integration/font-token-pin.test.ts`.
