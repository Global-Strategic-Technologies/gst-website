/**
 * Hover must change the FILL, never the ink — on every anchor that paints
 * itself a solid brand background.
 *
 * The cascade hole this exists for is site-wide and silent. `global.css` sets
 *
 *   a       { color: var(--color-secondary) }
 *   a:hover { color: var(--color-primary) }
 *
 * at specificity (0,1,1), which out-ranks any single-class rule at (0,1,0). So
 * a component that sets its own `color` on a bare class and never restates it
 * under `:hover` loses its ink the moment a pointer touches it — and because
 * `--color-primary` is also `--sash-bg` and the fill of every component below,
 * what it loses it to is EXACTLY THE COLOUR IT IS PAINTED ON. The label does
 * not shift hue; it disappears. `sash.css` is `@import`ed from `global.css`, so
 * source order cannot save any of them.
 *
 * Three live instances shipped before anyone noticed, and the reason nobody did
 * is instructive: each is a state you have to be IN to see (hovered, focused,
 * or the active half of a two-state control), and the /brand gallery's frozen
 * specimens are `<span>`s, which `a:hover` cannot match. The gallery built to
 * catch exactly this could not.
 *
 * Asserted as equality of computed colour rather than as a contrast ratio or a
 * pinned hex, so it follows every palette and both themes. The tempting form —
 * "hover colour ≠ hover background" — is TRUE on the broken state (a fill is
 * usually a darkened mix of the leaked ink) and would guard nothing.
 */
import { test, expect, type Page } from '@playwright/test';

/**
 * Each case names an anchor that paints a solid brand fill, and how to bring it
 * into a hoverable state. `--sash-bg` is never re-pointed per palette
 * (palettes.css), so the default palette is the case that matters; the sash
 * suite covers the re-pointed palettes for its own bands.
 */
const CASES = [
  {
    name: 'skip-nav (the WCAG 2.4.1 bypass link)',
    route: '/',
    selector: '.skip-nav',
    // Off-screen until focused (`top: -100%`). The real interaction is
    // tab-then-click: a keyboard user reveals it, then a pointer lands on it.
    // Focused programmatically rather than with Tab, because WebKit ships with
    // "press Tab to highlight each item" OFF and skips links entirely — Tab
    // there leaves the link off-screen and hover() times out reaching it.
    // `.skip-nav:focus` is what moves it, and every engine sets :focus here.
    reveal: async (page: Page) => {
      await page.locator('.skip-nav').focus();
    },
  },
  {
    name: 'the active lens button on the capability reference',
    route: '/hub/mcp/docs/',
    // Applied at RUNTIME (src/utils/mcp-docs.ts) — the class never appears in
    // markup, which is why a markup-only audit misses it.
    selector: 'a.brutal-segmented__btn--active',
    reveal: async () => {},
  },
] as const;

test.describe('Hover ink invariance', () => {
  for (const testCase of CASES) {
    test(`${testCase.name} keeps its ink on hover`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(testCase.route);

      // Measure the SETTLED colour. `.brutal-segmented__btn` transitions
      // `color`, so sampling straight after hover() catches an animation frame
      // — the first run of this guard read rgba(13,13,13,0.93) mid-fade and
      // reported a difference that was real but not the one being asserted.
      // Suppressing transitions is the instrument, not a workaround: the
      // property under test is the END state the cascade produces.
      await page.addStyleTag({
        content: '*, *::before, *::after { transition: none !important; }',
      });
      await testCase.reveal(page);

      const node = page.locator(testCase.selector).first();
      await expect(node, 'the case still exists to be checked').toHaveCount(1);

      const rest = await node.evaluate((el) => getComputedStyle(el).color);
      await node.hover();
      const hovered = await node.evaluate((el) => ({
        color: getComputedStyle(el).color,
        background: getComputedStyle(el).backgroundColor,
      }));

      expect(hovered.color, `${testCase.selector}: ink must not move on hover`).toBe(rest);
      // The consequence, stated separately so a failure says WHY it matters:
      // the leak lands the ink on its own fill.
      expect(
        hovered.color,
        `${testCase.selector}: ink must not become the fill it sits on`
      ).not.toBe(hovered.background);
    });
  }
});
