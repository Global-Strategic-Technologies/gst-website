/**
 * The frosted treatment, asserted where it is consumed.
 *
 * Companion to `tests/integration/frost-token-floor.test.ts`, which reads the
 * stylesheets. This file reads the browser, and the division is deliberate: the
 * static guard cannot see whether a rule actually reaches an element, and this
 * one cannot see whether a token's alpha is high enough to notice.
 *
 * NOT a generic "no frosted element inside another frosted element" sweep,
 * which is the shape this looked like it wanted. Nested frost is sanctioned
 * throughout the design system — a frosted `.brutal-btn` sits inside a frosted
 * `.brutal-tool-shell` on every hub tool, and `/ma-portfolio` deliberately
 * layers `.brutal-frosted--heavy` over `.brutal-frosted` — so that rule would
 * fail on the system's own idiom rather than on a defect. "One pane owns the
 * glass" governs container-shaped frost only.
 *
 * Each family is checked ONLY on routes that render it. A cross-product would
 * be six empty cells out of sixteen, and an empty locator asserts nothing —
 * hence the per-pair probe count below.
 */
import { test, expect } from '@playwright/test';

/** Which of the frosted selectors each route actually renders. */
const ROUTES: { path: string; selectors: string[] }[] = [
  {
    path: '/hub/mcp/',
    selectors: [
      '.brutal-trust-card',
      '.brutal-stat-tile',
      '.brutal-callout',
      '.brutal-faq__item',
      // Page-scoped rather than a shared family, so the stylesheet guard cannot
      // see it — and it is one of the surfaces this change was reported for.
      '.mcp-block--cta',
    ],
  },
  {
    path: '/brand',
    selectors: ['.brutal-trust-card', '.brutal-stat-tile', '.brutal-callout', '.brutal-faq__item'],
  },
  { path: '/services/', selectors: ['.brutal-faq__item'] },
  { path: '/hub/', selectors: ['.brutal-faq__item'] },
];

test.describe('Frosted glass — the treatment reaches the element', () => {
  for (const { path, selectors } of ROUTES) {
    for (const selector of selectors) {
      test(`${selector} is frosted on ${path}`, async ({ page }) => {
        await page.goto(path);
        await page.waitForSelector('h1');

        const read = await page.locator(selector).evaluateAll((els) =>
          els.map((el) => {
            const s = getComputedStyle(el) as CSSStyleDeclaration & {
              webkitBackdropFilter?: string;
            };
            return {
              // Both spellings: LightningCSS ships the `-webkit-` twin for the
              // browserslist target, and an engine that does not recognize the
              // unprefixed property returns '' rather than 'none' — which would
              // pass a naive `!== 'none'` check while meaning the opposite.
              standard: s.backdropFilter,
              prefixed: s.webkitBackdropFilter,
              shadow: s.boxShadow,
            };
          })
        );

        // Per (route, selector). One global count would be satisfied by
        // /hub/mcp/ alone.
        expect(read.length, `${selector} renders nowhere on ${path}`).toBeGreaterThan(0);

        for (const { standard, prefixed, shadow } of read) {
          const filter = standard || prefixed;
          expect(
            filter,
            `neither backdrop-filter spelling is recognized on ${selector} — an ` +
              `unrecognized property reads as '' and would pass a !== 'none' check`
          ).toBeTruthy();
          expect(filter, `${selector} lost its backdrop-filter on ${path}`).not.toBe('none');
          // The declaration that actually carries the treatment on a flat page.
          expect(shadow, `${selector} lost the frost edge on ${path}`).not.toBe('none');
        }
      });
    }
  }

  test('no disclosure co-applies the frosted utility any more', async ({ page }) => {
    // Three call sites hand-applied `.brutal-frosted` before the base rule
    // carried frost. Left in place they would double-blur, and the double is
    // invisible in a screenshot — so it is asserted rather than eyeballed.
    for (const path of ['/services/', '/hub/', '/hub/tools/regulatory-map/']) {
      await page.goto(path);
      await page.waitForSelector('h1');
      const doubled = await page
        .locator('.brutal-faq__item')
        .evaluateAll((els) => els.filter((el) => el.classList.contains('brutal-frosted')).length);
      const total = await page.locator('.brutal-faq__item').count();
      expect(total, `no disclosure found on ${path}`).toBeGreaterThan(0);
      expect(doubled, `a disclosure still co-applies .brutal-frosted on ${path}`).toBe(0);
    }
  });
});
