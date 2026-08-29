/**
 * StatsBar — the value must fit its own cell, at every width, on BOTH pages
 * that render it.
 *
 * The regression this exists for: `.stat-value` was a fixed `3.5rem` with two
 * viewport breakpoints, sized once against a narrow face at one width. Six
 * characters (`$2.8B+`, the longest value a real page passes) then hung 65px
 * outside its cell at a 900px viewport, 15px at 375px, and 14px on the `/brand`
 * specimen at 1280px — the page whose entire job is to show the component
 * rendering correctly. Nothing caught any of it: the component has no unit test
 * that can lay out text, and no E2E asserted its geometry.
 *
 * The fix was to key the steps on the CONTAINER rather than the viewport,
 * because this component is rendered at two different widths for the same
 * viewport. That makes `/brand` the important case rather than an afterthought:
 * its specimen frame is narrower than the real page's container at every
 * desktop width, so a viewport-keyed rule is right on one page and wrong on the
 * other by construction.
 *
 * Asserted as the OUTCOME (the text fits the box it is painted in), not the
 * mechanism (which threshold fired), so a future re-tune that solves it
 * differently still passes.
 */
import { test, expect, type Page } from '@playwright/test';

/** Both renderings: the real page, and the specimen frame that got it wrong. */
const ROUTES = ['/ma-portfolio/', '/brand/'] as const;

/**
 * Widths that straddle the container thresholds (1063 / 672 / 384 container,
 * i.e. ~1159 / ~768 / ~480 viewport on the real page) and sample inside each
 * resulting tier. The two failures that motivated this were at 900 and 1280 —
 * neither a breakpoint, both mid-tier, which is the point.
 */
const WIDTHS = [1440, 1280, 1160, 1100, 900, 800, 769, 660, 540, 480, 420, 375, 320] as const;

async function statValueFits(page: Page, route: string, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(route);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => {
    const el = document.querySelector('.stat-value');
    return !!el && getComputedStyle(el).fontFamily.includes('GST Mono');
  });

  return page.evaluate(() => {
    const values = [...document.querySelectorAll<HTMLElement>('.stat-value')];
    if (values.length === 0) return null;
    // scrollWidth clamps to clientWidth, so it can only report overflow, never
    // headroom — which is all this needs, and it is the honest measure of "the
    // glyphs are wider than the box painting them".
    return values
      .map((el) => ({
        text: (el.textContent ?? '').trim(),
        overflow: el.scrollWidth - el.clientWidth,
      }))
      .sort((a, b) => b.overflow - a.overflow)[0];
  });
}

test.describe('StatsBar value fit', () => {
  for (const route of ROUTES) {
    for (const width of WIDTHS) {
      test(`${route} at ${width}px keeps every stat value inside its cell`, async ({ page }) => {
        const worst = await statValueFits(page, route, width);
        expect(worst, `${route} renders a StatsBar to measure`).not.toBeNull();
        expect(
          worst!.overflow,
          `"${worst!.text}" is wider than the cell painting it`
        ).toBeLessThanOrEqual(0);
      });
    }
  }

  test('the label fits too — it wraps, so its longest word is the constraint', async ({ page }) => {
    // `Client Engagements` wraps, but `Engagements` cannot: at 0.15em tracking
    // it sat 3px outside a 320px cell, which is why the narrow tier steps the
    // tracking down rather than the size.
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/ma-portfolio/');
    await page.evaluate(() => document.fonts.ready);

    const worst = await page.evaluate(() => {
      const labels = [...document.querySelectorAll<HTMLElement>('.stat-label')];
      return labels
        .map((el) => ({
          text: (el.textContent ?? '').trim(),
          overflow: el.scrollWidth - el.clientWidth,
        }))
        .sort((a, b) => b.overflow - a.overflow)[0];
    });
    expect(worst).toBeTruthy();
    expect(worst!.overflow, `"${worst!.text}" overflows its cell`).toBeLessThanOrEqual(0);
  });

  test('the grid halves rather than letting the type overflow', async ({ page }) => {
    // The mechanism, asserted once: four columns are only honest above a
    // 1064px container. This is the rule the outcome tests above depend on, and
    // a container query is easy to break silently (it keys on an ancestor's
    // size, so an unrelated layout change can move it).
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/ma-portfolio/');
    await page.evaluate(() => document.fonts.ready);
    const wide = await page.evaluate(
      () =>
        getComputedStyle(document.querySelector('.stats-grid')!).gridTemplateColumns.split(' ')
          .length
    );
    expect(wide, 'four columns at 1440px').toBe(4);

    await page.setViewportSize({ width: 1000, height: 900 });
    await page.waitForTimeout(150);
    const narrow = await page.evaluate(
      () =>
        getComputedStyle(document.querySelector('.stats-grid')!).gridTemplateColumns.split(' ')
          .length
    );
    expect(narrow, 'two columns once the container drops below 1064px').toBe(2);
  });
});
