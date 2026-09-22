# ADR-0039: Hero ambient motion is a per-browser design setting, off for visitors

- **Status**: Accepted (2026-09-22)
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

Five candidate effects were drawn: Grid Pulse, Glow Shift, Scan Sweep, Data Rails and Delta Drift. The operator ruled that they are **independent toggles**: any number can be on at once, and there is no "Off" choice. They are configured from a new section of the palette panel, **on /brand only**, where the panel is already a design tool.

Two things stood in the way.

- **The budget.** At full strength the five effects together are 37 elements.
- **Persistence.** The panel's existing persisted state had the wrong lifetime. `palette-overrides` is wiped whenever the palette changes (`palette-manager.ts` § Theme Observer).

## Decision

**Settings live on `<html>`, applied before first paint, in the same way as the palette.**

- `localStorage['ambient-motion']` holds `{on, strength, pace}`.
- BaseLayout's inline head script writes the settings onto `<html>`:
  - `data-ambient="glow rails"` names the layers that render
  - `data-ambient-layered` is set when two or more are on
  - `--ambient-<id>` (0–1) and `--ambient-pace` are inline custom properties
- From there, `AmbientEffect.astro` is driven entirely by CSS:
  - A layer not named in `data-ambient` is `display: none`, so it costs nothing.
- The model lives in [`src/scripts/ambient-motion.ts`](../../scripts/ambient-motion.ts).
  - The inline script repeats its key, ids, clamp ranges and default list, because it cannot import the module.
  - `tests/unit/ambient-motion.test.ts` executes that inline block in jsdom and requires the same result as `applySettings()`.
  - This is ADR-0038's pinning pattern, strengthened from comparing literals to comparing behaviour.
- The inline script clamps every number. An invalid custom property would make `opacity` fall back to 1, so a corrupt stored value would otherwise mean full strength.

**The key is separate from `palette-overrides`**, so a palette change never resets motion, and the two Reset buttons never clear each other.

**Visitors see nothing.** `DEFAULT_SETTINGS.on` and the inline script's fallback are both `[]`, and a unit test pins them equal. Only a browser that opted in from /brand shows motion, on its homepage (`/`, `/es/`, `/pt/`) and on the live /brand preview. This is what keeps BL-035's stakeholder-review gate honest while the effects are fully built. Shipping a public default is a change to those two literals.

**The budget is kept by thinning, not by limiting how many effects can be selected.**

- One effect alone shows its full table (at most 14 elements).
- With two or more on, or at ≤768px, each effect keeps only its non-`solo` elements. Together they make the prototype's Combined subset: 2 + 4 + 1 + 4 + 3 = 14.
- The tables live in [`src/data/ambient-effects.ts`](../../data/ambient-effects.ts), and `tests/unit/ambient-effect-budget.test.ts` counts them.

**Reduced motion hides the layer** (`display: none`), whatever is stored. It is not merely paused.

**The homepage fills a `backdrop` slot on `Hero`**, rather than `Hero` taking a prop. Only the page that uses the layer imports it, so its stylesheet is not loaded on About, Services, Hub or the error pages. With a prop, `Hero` itself would have imported it, and every Hero page would have linked the CSS.

**Rejected:**

- **Capping the selection at one or two effects.** The operator asked for free multi-select. Thinning keeps the budget without taking any choice away.
- **Storing motion inside `palette-overrides`.** A palette change would silently switch motion off.
- **A JS-driven layer that renders only the selected effects.** A static layer that CSS reveals needs no script on the homepage and cannot flash.
- **Showing the section in the popped-out panel on every page.** Out of scope by operator decision. The /brand preview makes the effect visible without leaving the design tool.
- **Pausing, rather than hiding, under reduced motion.** A frozen mid-cycle frame is an arbitrary image, and hiding the layer satisfies "disables all motion entirely" unambiguously.

## Consequences

- **Measured** on 2026-09-22 with Lighthouse mobile, performance only, median of 3, against static builds served identically:
  - master: 93
  - this change, visitor default: 93
  - all five on (scratch build): 93

  FCP, LCP and TBT are unchanged, and CLS is 0. With all five on, a 3-second CDP sample shows no main-thread layout and no more style recalcs than a still page, so the effects stay on the compositor.

- **Code that cites this ADR:** `src/scripts/ambient-motion.ts`, `src/data/ambient-effects.ts`, `src/components/AmbientEffect.astro`, `src/components/brand/AmbientMotionControls.astro`, the inline block in `src/layouts/BaseLayout.astro`, `src/components/brand/PalettePanel.astro` (the section wrapper), `src/page-templates/HomePage.astro`.
- **Docs:** [BRAND_GUIDELINES.md § Ambient Motion](../styles/BRAND_GUIDELINES.md#ambient-motion-hero).
- **Design sync:** `.design-sync/extract-chrome.mjs` strips `.ambient` from the published Hero card, and `.design-sync/NOTES.md` records why.
- **The chips are `.brutal-filter-chip`** from `filter.css`, which only `brand.astro` imports. Rendering the section anywhere else needs that import too.
- **Revisit when:**
  - A public default is wanted: flip the two pinned literals, then re-measure Lighthouse on `/`.
  - An effect is added: extend `EFFECT_IDS`, both default maps, and the tables, and keep the budget test green.
