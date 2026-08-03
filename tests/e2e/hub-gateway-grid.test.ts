/**
 * Hub gateway index layout — BL-105.
 *
 * `/hub/tools/` and `/hub/library/` used to render `.brutal-gateway-card` as a single
 * centred 600px column, because the card set `max-width: 600px; margin: 0 auto` on
 * itself. In a 1504px container that left 60% of every row empty and made
 * `/hub/tools/` ~4795px tall. `.brutal-gateway-grid` now owns the columns, following
 * PortfolioGrid's `.grid` / `.project-card` pairing.
 *
 * Assertions are RELATIONSHIPS, never pixel constants: the column width falls out of
 * `minmax(420px, 1fr)` against a container width, so a hardcoded 469 would rot the
 * first time a token or the container moves.
 */
import { test, expect } from '@playwright/test';

const ROUTES = ['/hub/tools/', '/hub/library/'] as const;

/** Cards sharing a rounded `top` are one visual row. */
async function rowShape(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>('.brutal-gateway-card')];
    const tops = cards.map((c) => Math.round(c.getBoundingClientRect().top));
    const firstRow = cards.filter((_, i) => tops[i] === tops[0]);
    const ctaBottoms = new Set(
      firstRow
        .map((c) => c.querySelector<HTMLElement>('.brutal-gateway-card__cta'))
        .filter((e): e is HTMLElement => e !== null)
        .map((e) => Math.round(e.getBoundingClientRect().bottom))
    );
    const first = cards[0];
    const cta = first.querySelector<HTMLElement>('.brutal-gateway-card__cta');
    const rects = cards.map((c) => c.getBoundingClientRect());
    const grid = document.querySelector<HTMLElement>('.brutal-gateway-grid')!;
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
    const rowSpan =
      firstRow.reduce((sum, c) => sum + c.getBoundingClientRect().width, 0) +
      gap * (firstRow.length - 1);
    return {
      total: cards.length,
      perRow: firstRow.length,
      cardWidth: Math.round(first.getBoundingClientRect().width),
      display: getComputedStyle(first).display,
      ctaWidth: cta ? Math.round(cta.getBoundingClientRect().width) : null,
      ctasBottomAligned: ctaBottoms.size <= 1,
      gridWidth: Math.round(grid.getBoundingClientRect().width),
      rowSpan: Math.round(rowSpan),
      distinctWidths: new Set(rects.map((r) => Math.round(r.width))).size,
      distinctLefts: new Set(rects.map((r) => Math.round(r.left))).size,
    };
  });
}

for (const route of ROUTES) {
  test.describe(`Gateway grid — ${route}`, () => {
    test('lays cards out in multiple columns on desktop', async ({ page }) => {
      await page.setViewportSize({ width: 1600, height: 900 });
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.locator('.brutal-gateway-card').first().waitFor();

      const s = await rowShape(page);
      expect(s.total, 'gateway cards render').toBeGreaterThan(1);
      expect(s.perRow, 'more than one card per row on desktop').toBeGreaterThan(1);

      // THE actual requirement: the row uses the full width available to it. Asserting
      // "card < 600px" would be wrong — at viewports where two columns fit, each card is
      // legitimately WIDER than the old 600px cap, which is the fix working, not failing.
      // toBeCloseTo, not toBe: rowSpan and gridWidth are independently rounded, and
      // webkit drifts ~0.016px on the sum. Safe today, but a half-pixel boundary is
      // not worth owning.
      expect(s.rowSpan, 'the row spans the whole grid, leaving no dead width').toBeCloseTo(
        s.gridWidth,
        0
      );

      // Grid rows stretch to equal height, so a ragged CTA is the failure mode that
      // makes the layout look broken. `flex-grow: 1` on the feature list prevents it.
      expect(s.ctasBottomAligned, 'CTAs bottom-align across the first row').toBe(true);

      // Flex blockifies the inline-block CTA; without `align-self: center` it would
      // stretch the full card width. A width-only check cannot see this.
      expect(s.ctaWidth, 'CTA stays shrink-to-fit, not stretched').toBeLessThan(s.cardWidth);
    });

    test('falls back to one capped column on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 480, height: 900 });
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.locator('.brutal-gateway-card').first().waitFor();

      const s = await rowShape(page);
      expect(s.perRow, 'single column below 768px').toBe(1);
      expect(s.cardWidth, 'card keeps its 600px cap').toBeLessThanOrEqual(600);

      // The 768px block must revert `display` too, or the flex alignment rules above
      // stay live on mobile — a card-width check alone would not notice.
      expect(s.display, 'card reverts to block below 768px').toBe('block');
    });

    /**
     * The single-column band is where this change nearly shipped a regression, and
     * neither of the tests above could see it: they sample `cards[0]` and assert an
     * upper bound, while the invariant that broke was UNIFORMITY.
     *
     * Auto inline margins on a grid item absorb free space before alignment, which
     * disables `justify-self: stretch` — so without an explicit `width: 100%` the
     * cards size shrink-to-fit and land at different widths and different left
     * edges. It only shows between ~600 and 768px, where the track is wider than
     * the 600px cap but the content is not; at 480 the behaviour coincides and
     * looks correct.
     */
    test('cards stay uniform in the single-column band', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 900 });
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.locator('.brutal-gateway-card').first().waitFor();

      const s = await rowShape(page);
      expect(s.distinctWidths, 'every card is the same width at 768px').toBe(1);
      expect(s.distinctLefts, 'every card shares one left edge at 768px').toBe(1);
    });
  });
}

test('the /brand specimen keeps an empty track, proving auto-fill', async ({ page }) => {
  // `auto-fit` would collapse the empty track and stretch the lone specimen card across
  // the whole row, hiding the column shape the specimen exists to demonstrate.
  // Relationship only: /brand's content column is narrower than the hub pages', so the
  // specimen's own width is not the same number and must not be asserted.
  //
  // The viewport is explicit and load-bearing. /brand's body is `.brand-layout`
  // (`280px 1fr`, capped at 1400px), NOT `.container`, so its content column is far
  // narrower than the hub pages'. At the project default of 1280 the grid is only 872px
  // — below the 888px two-track threshold — so the specimen legitimately occupies a
  // single full-width track and this assertion would fail for the right reason.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/brand/', { waitUntil: 'domcontentloaded' });
  const grid = page.locator('.brutal-gateway-grid');
  await grid.waitFor();

  const { gridWidth, cardWidth } = await grid.evaluate((el) => ({
    gridWidth: Math.round(el.getBoundingClientRect().width),
    cardWidth: Math.round(el.querySelector('.brutal-gateway-card')!.getBoundingClientRect().width),
  }));

  expect(cardWidth, 'specimen occupies one track, leaving at least one empty').toBeLessThan(
    gridWidth / 2
  );
});
