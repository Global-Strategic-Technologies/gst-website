# ADR-0039: Ambient motion is a per-browser design setting, on for visitors by default

- **Status**: Accepted (2026-09-22). Amended 2026-09-25: public default and go-live (§ Amendment)
- **Source initiative**: BL-035 (Dynamic Visual Effects). The design prototypes are kept in [`prototypes/bl-035-hero-ambient-motion/`](../../../prototypes/bl-035-hero-ambient-motion/README.md) (six hero artboards plus the palette-panel section, from the design canvas).

## Context

BL-035 asked for subtle ambient motion in the homepage hero. The limits were:

- at most 15 animated elements
- CSS `transform`/`opacity` only, with no JS animation loop and no dependency
- `pointer-events: none` and `aria-hidden`
- `prefers-reduced-motion` switches it off
- the colour follows the palette
- Lighthouse mobile drops by no more than 2 points
- a stakeholder review before anything reaches production

Five candidate effects were drawn: Grid Pulse, Glow Shift, Scan Sweep, Data Rails and Delta Drift. The operator ruled that they are **independent toggles**: any number can be on at once, and there is no "Off" choice. They are configured from a new section of the palette panel, a design tool that is always visible on /brand and on any other page once popped out. The section appears wherever the panel does, and a **Motion** button on the panel's edge rail jumps to it. Without that button it started 1,364px down a panel showing 716px at 1440×900, below the colour swatches, where the operator could not find it.

A sixth, **Delta Arrows**, was added on 2026-09-23 at the operator's request, with no prototype artboard: clusters of brand deltas that shoot from the bottom-left corner to the top-right, pulsing in and out as they go.

Two things stood in the way.

- **The budget.** At full strength the six effects together are 43 animated elements.
- **Reach.** The operator then asked for a **scope**: the hero only, the whole homepage, or every page, with the wider two scrolling with the page and repeating every screen so a long page is as lively as a short one.
- **Persistence.** The panel's existing persisted state had the wrong lifetime. `palette-overrides` is wiped whenever the palette changes (`palette-manager.ts` § Theme Observer).

## Decision

**Settings live on `<html>`, applied before first paint, in the same way as the palette.**

- `localStorage['ambient-motion']` holds `{on, strength, pace, scope}`.
- BaseLayout's inline head script writes the settings onto `<html>`:
  - `data-ambient="glow rails"` names the layers that render
  - `data-ambient-layered` is set when two or more are on
  - `data-ambient-scope` is `hero`, `page` or `site`
  - `--ambient-<id>` (0–1) and `--ambient-pace` are inline custom properties
- From there, the built layer is driven entirely by CSS:
  - A layer not named in `data-ambient` is `display: none`, so it costs nothing.
- The model lives in [`src/scripts/ambient-motion.ts`](../../scripts/ambient-motion.ts).
  - The inline script repeats its key, ids, clamp ranges and default list, because it cannot import the module.
  - `tests/unit/ambient-motion.test.ts` executes that inline block in jsdom and requires the same result as `applySettings()`.
  - This is ADR-0038's pinning pattern, strengthened from comparing literals to comparing behaviour.
- The inline script clamps every number. An invalid custom property would make `opacity` fall back to 1, so a corrupt stored value would otherwise mean full strength.

**Only a browser that opted in loads any of it** (2026-09-23; this reverses the rejection of a script-built layer, below. Since the 2026-09-25 amendment every browser is opted in by default, and only one that switched motion off, or prefers reduced motion, loads none of it). Built as static markup and CSS, the feature cost every visitor about 8 KB gzipped per page (the hidden tile template, the panel's Motion section, the background script and 1.9 KB of render-blocking CSS) and pushed first paint back about 150ms, for motion almost nobody sees.

- **Placeholders.** [`AmbientEffect.astro`](../../components/AmbientEffect.astro) (the hero's `backdrop` slot and the /brand stage) and [`AmbientPage.astro`](../../components/AmbientPage.astro) (first child of `<main>`) render empty boxes. Their scoped styles keep only what must hold before any script runs: the effect box fills its parent and never takes part in layout, reduced motion hides it, and the page layer is hidden.
- **The loader** ([`src/scripts/ambient/loader.ts`](../../scripts/ambient/loader.ts)) is bundled into `palette-manager.ts`, which every page already loads; a standalone module could not be inlined, since Astro refuses to inline a script that has a dynamic import. It reads the attributes the head script set and imports the runtime only when motion is on, reduced motion is off, and the page has something the chosen scope would draw (Hero scope on a page with no hero layer loads nothing). It publishes its decision as `<html data-ambient-loader="off|deferred|loading|loaded|skipped">`, which the E2E suite waits on.
- **It starts after the page has loaded.** A stored choice is imported after `load` and an idle moment, so motion never competes with the page's first render, and the layer fades in (`--transition-slow`). A choice made live in the panel loads at once.
- **The runtime** ([`src/scripts/ambient/runtime.ts`](../../scripts/ambient/runtime.ts)) builds the layers from the tables ([`build.ts`](../../scripts/ambient/build.ts), with a DOM copy of `DeltaIcon` that a unit test pins to the component) and runs the page background.
- **Its CSS is a string.** `ambient.css` and `controls.css` are imported with `?inline` and inserted as `<style>` elements. Astro attaches a plainly imported CSS module to every page that owns the importing script, walking dynamic importers too, which would ship the sheet to every visitor; E2E runs on the dev server and could not see that, so `tests/unit/ambient-lazy-css-guard.test.ts` enforces it. Moving the rules out of scoped blocks was verified by a computed-style snapshot of all 1,182 effect and control elements, before and after: the only difference is the new fade.
- **The Motion controls are built on the panel's first open** ([`controls.ts`](../../scripts/ambient/controls.ts), from `palette-manager.ts`). The section's wrapper, heading and hint stay in `PalettePanel.astro`, since the rail's Motion button jumps there; the jump waits for the controls before it focuses the first chip.

**The key is separate from `palette-overrides`**, so a palette change never resets motion, and the two Reset buttons never clear each other.

**Visitors saw nothing, until the 2026-09-25 amendment below.** `DEFAULT_SETTINGS.on` and the inline script's fallback were both `[]`, and a unit test pins them equal. Only a browser that opted in from the palette panel showed motion, on its homepage (`/`, `/es/`, `/pt/`) and on the live /brand preview. That kept BL-035's stakeholder-review gate honest while the effects were fully built, and shipping a public default was a change to those two literals.

**The budget is kept by thinning, not by limiting how many effects can be selected.**

- One effect alone shows its full table (at most 14 elements).
- With two or more on, or at ≤768px, each effect keeps only its non-`solo` elements. The first five make the prototype's Combined subset, 2 + 4 + 1 + 4 + 3 = 14; Delta Arrows adds 2, for **16**.
- **The ceiling is 16, not BL-035's 15.** The operator raised it on 2026-09-23, choosing two layered volleys (16, and ≤32 running in the wider scopes) over staying at 14 by trading a Grid Pulse cell for one volley, or allowing one extra volley (15 / 30).
- **A Delta Arrows volley is one animated element.** It carries 2–4 deltas, but a single animation moves and pulses the whole cluster, so the browser runs one animation, not one per arrow.
- The tables live in [`src/data/ambient-effects.ts`](../../data/ambient-effects.ts), and `tests/unit/ambient-effect-budget.test.ts` counts them.

**Delta Arrows fly the layer's own diagonal, with no script.** The arrows layer is a size container (`container-type: size`; it is `absolute; inset: 0`, so its size never depends on its contents). Each volley's keyframes translate it in `cqw`/`cqh`, which keeps every flight line parallel to that layer's bottom-left → top-right diagonal in the hero, the /brand preview stage and each page-background tile alike. An inner element turns the up-pointing delta onto that line with `rotate: calc(90deg - atan2(100cqh, 100cqw))`. It is a separate element because the individual `rotate` property composes with `transform`, so on the moving element it would turn the travel too. The deltas keep the brand geometry, the `DeltaIcon` outline with its stroke and aspect ratio (operator ruling, 2026-09-23). A first cut drew them filled and narrowed to 60% width so they read as arrowheads on a shallow diagonal; the operator ruled the shape must stay the brand delta. A browser without both container units and `atan2()` shows no arrows rather than frozen or mis-aimed ones.

**Reduced motion hides the layer** (`display: none`), whatever is stored. It is not merely paused.

**The homepage fills a `backdrop` slot on `Hero`** for the hero layer's placeholder. That layer is the homepage's alone, so no other Hero page renders it.

**Scope is cumulative.** In every scope the homepage hero keeps its own layer. _Homepage_ (`page`) and _Every page_ (`site`) add a background behind everything else, in `AmbientPage.astro`'s placeholder, run by the runtime:

- **Placement.** BaseLayout renders it as the first child of `<main>`. `main` is already a stacking context (`position: relative; z-index: 1`), so the layer's `z-index: -1` paints above the body's checkerboard and below every section, with no new stacking rules. The header and footer sit outside `main`, and opaque sections (hero bands, CTA boxes, portfolio cards) hide it, as a background should. It is visible over 64–100% of most pages; the portfolio, whose cards fill it, is the exception at 25%.
- **It starts below the page's `.hero`.** The homepage hero already has its own layer, and other heroes' opaque bands would hide a background anyway, so nothing runs under a hero.
- **It scrolls with the page, one tile per screen.** The layer is a stack of empty `100lvh` spacers. An IntersectionObserver (`rootMargin: -1px`) puts a clone of a tile (`buildTile()`: the thinned set, glows kept inside the tile) into a spacer while it is on screen and removes it when it leaves. An off-screen tile contains nothing, so a 41-screen page costs what a 3-screen one does.
- **Budget: ≤16 in view, ≤32 running.** At most two `lvh` spacers can meet the viewport, so where two tiles meet on screen both run. This relaxes BL-035's cap from per-page to per-screen. The operator chose it after being offered a strict ≤15-running alternative at half the density; it was ≤14 / ≤28 until Delta Arrows raised the layered set to 16. At the top of the homepage the hero layer is the second region: tiles start below the hero, so the hero and at most one tile share the screen. Layers that scroll away stop (see Consequences). The one exception is /brand in _Every page_ scope, where the 320px preview stage adds its 16 while it is on screen. It is a design-tool page, and the exception is accepted.

**Rejected:**

- **Capping the selection at one or two effects.** The operator asked for free multi-select. Thinning keeps the budget without taking any choice away.
- **Storing motion inside `palette-overrides`.** A palette change would silently switch motion off.
- ~~**A JS-driven layer that renders only the selected effects.**~~ Rejected at first because a static layer needs no script and cannot flash; **reversed on 2026-09-23** (see "Only a browser that opted in loads any of it"). The script runs only for browsers that opted in, and arriving after load with a fade is now the intent, not a flash.
- **Moving the section to the top of the panel** instead of adding a rail button. It would be easy to find, but it pushes the colour editor down for every palette task.
- **Limiting the section to /brand.** The first cut did, and that left the controls missing on the homepage, the one page whose hero moves.
- **A background fixed to the screen.** Cheaper and constant, but the operator chose one that scrolls with the page.
- **One set spread down the whole page.** Strictly 15 elements, but sparse: about 5 per screen on the homepage, and nearly empty on /brand, which is 41 screens tall.
- **Tiles pre-rendered on the server.** Every page would carry every tile's markup, about 90 KB of HTML.
- **Hiding off-screen tiles with CSS.** `content-visibility` does not guarantee that animations stop, and a hidden tile still costs its DOM. Adding and removing the clone does both.
- **Pausing, rather than hiding, under reduced motion.** A frozen mid-cycle frame is an arbitrary image, and hiding the layer satisfies "disables all motion entirely" unambiguously.

## Consequences

- **Measured** 2026-09-23, after the lazy-loading change: Lighthouse mobile, performance only, median of 3, on static builds served identically. Master was measured earlier the same day and not re-run.

  |          | master | visitor default | Every page, all six on |
  | -------- | ------ | --------------- | ---------------------- |
  | `/`      | 93     | 93              | 93                     |
  | `/about` | 89     | 89              | 89                     |
  - Against the build just before the change, the visitor default on `/` went from 91–92 to 93, first paint from 2.48–2.63s to 2.41s and LCP from 2.86s to 2.71s. The all-six column matches because the effect now arrives after `load`, outside what Lighthouse scores.
  - What a visitor who never opts in downloads fell by 6.2–6.3 KB gzipped per page (7.5 KB on /brand), counting the loader's 0.6 KB. An opted-in browser fetches the runtime (2.6 KB) and builder (1.7 KB) after `load`, and the controls (3.0 KB) on the panel's first open.
  - CLS is 0 throughout. The page layer is `visibility: hidden` until the script has placed it below the hero; before that fix, its jump measured CLS 0.62, and an E2E test now holds CLS at 0.
  - A CDP sample at a tile boundary on /brand, all six on (32 running), shows no main-thread layout, no style recalculation and an idle main thread: the container-unit transforms stay on the compositor.
  - Scrolling whole pages at 412 and 1280px, the most ambient animations running at once was 32 (/, /about, /services and /brand, the preview stage aside).

- **The page's own layers stop off screen while the background is active.** The homepage hero's layer and /brand's preview stage get `data-offscreen` from the runtime when they scroll away. Without that, either one kept running out of sight and the total reached 42.
- **Code that cites this ADR:** `src/scripts/ambient-motion.ts`, `src/data/ambient-effects.ts`, `src/scripts/ambient/` (loader, runtime, build, controls and their CSS), `src/components/AmbientEffect.astro` and `src/components/AmbientPage.astro` (the placeholders), the inline block in `src/layouts/BaseLayout.astro`, `src/components/brand/PalettePanel.astro` (the section wrapper, the mount and the rail button), `src/scripts/palette-manager.ts` (the loader, the lazy controls and the jump), `src/page-templates/HomePage.astro`.
- **Docs:** [BRAND_GUIDELINES.md § Ambient Motion](../styles/BRAND_GUIDELINES.md#ambient-motion).
- **Design sync:** `.design-sync/extract-chrome.mjs` strips `.ambient` from the published Hero card, and `.design-sync/NOTES.md` records why.
- **The section's shared controls come from `form.css`, which loads site-wide:** the toggles are `.brutal-choice-btn` and the sliders `.brutal-slider*`, not `.brutal-filter-chip`, whose `filter.css` is split out to four pages. Its own rules (`controls.css`) arrive with the controls and are anchored on `.ambient-controls`, so they never depend on load order against `form.css`.
- **The Motion button** (a delta with two speed strokes) lives on the panel's edge rail. It is lit by `html[data-ambient]` with no script, so it reports the selection even under reduced motion, where the layer itself is hidden. On a phone it sits in the open sheet's header, so it jumps past the swatches but does not help anyone open the sheet.
- **Revisit when:**
  - An effect is added: extend `EFFECT_IDS`, both default maps, and the tables, and keep the budget test green.

## Amendment — 2026-09-25: public default and go-live

The operator chose the settings every visitor sees, which closed BL-035's stakeholder-review gate (the stanza is pruned from the backlog):

- **All six effects on**, strengths Grid Pulse 15, Glow Shift 40, Scan Sweep 5, Data Rails 20, Delta Drift 30 and Delta Arrows 45.
- **Scope Every page**, pace 110.

The two pinned literals changed together (`DEFAULT_SETTINGS` and `DEFAULT_STRENGTH` in `ambient-motion.ts`, and their copies in BaseLayout's inline block). The inline fallback scope had been `scopes[0]`, which was right only while Hero was the default. It is now its own `defaultScope` literal, pinned to `DEFAULT_SETTINGS.scope` by the unit test instead of by list order.

- **Opting out is remembered.** A browser that switches every effect off stores `{"on":[]}` and stays still. **Reset motion** removes the stored choice, so it returns that browser to the public default rather than to "nothing on". Reduced motion still hides every layer, whatever is stored.
- **Measured** 2026-09-25: Lighthouse mobile, performance only, median of 3, on the static builds of this branch and `master`, served identically and run interleaved. The branch's fresh profile gets the public default and that day's rotated look ([ADR-0040](0040-daily-look-rotation.md): palette 4, dark).

  |          | master | public default |
  | -------- | ------ | -------------- |
  | `/`      | 93     | 92             |
  | `/about` | 89     | 88             |
  - Inside the 2-point limit on both. First paint moved from 2.33s to 2.40–2.41s, and LCP from 2.71s to 2.86s on `/` and from 3.30s to 3.45s on `/about`. CLS is 0 on both builds.
  - Every visitor now fetches the runtime (2.6 KB) and builder (1.7 KB) after `load`; the deferred start keeps them off the first render.

- **E2E** runs under a baseline storage state that switches motion off (`tests/e2e/helpers/storage-baseline.ts`), so specs stay independent of the default. The default itself is tested in `tests/e2e/ambient-motion.test.ts` § the public default, with an axe scan on `/` while it runs.
- **Revisit when** the defaults change. Change both pinned literals together and re-measure `/`.
