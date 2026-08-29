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
 *
 * TWO LATER CORRECTIONS, both from this file failing in CI while passing here:
 *
 *  1. It SAMPLED thirteen widths and missed a 30px band. Viewports 481-510
 *     overflowed by up to 15px — the 2.5rem tier inheriting 2rem side padding
 *     down to a 384px container — and the sample steps 480 -> 540 straight over
 *     it. Sampling a continuous space cannot show where the edges are, so this
 *     now sweeps, and the sweep is what found that band.
 *  2. It asserted `overflow <= 0`, which passed on 0.39px of margin. At a
 *     1160px viewport the four-column band's interior was 202px against
 *     201.61px of ink; `scrollWidth` rounds 201.61 to 202, so the two tie here
 *     and Linux rasterizes fractionally wider and fails. A sub-pixel pass is not
 *     a pass. It now measures true ink width against the interior and demands a
 *     real floor, the same correction `announcement-sash.test.ts` made for the
 *     same reason.
 */
import { test, expect, type Page } from '@playwright/test';

/** Both renderings: the real page, and the specimen frame that got it wrong. */
const ROUTES = ['/ma-portfolio/', '/brand/'] as const;

/**
 * NOT `>= 0`. 0.39px of clearance is what shipped a red CI check while this
 * file passed locally — see correction 2 above. The floor also has to absorb
 * the widest realistic fallback: generic `monospace` on Linux is DejaVu at
 * 602/1000, 0.7px wider over six characters than the pinned face.
 */
const MIN_INK_MARGIN = 4;

/**
 * Swept, not sampled. 4px steps across the whole supported range, plus every
 * tier edge and its immediate neighbours named explicitly — a threshold is
 * exactly where a step is most likely to land just past the defect.
 */
const SWEEP_STEP = 4;
const EDGES = [320, 480, 481, 510, 511, 512, 767, 768, 769, 1159, 1160, 1189, 1190, 1191, 1500];
const WIDTHS = [
  ...new Set([
    ...Array.from(
      { length: Math.ceil((1500 - 320) / SWEEP_STEP) + 1 },
      (_, i) => 320 + i * SWEEP_STEP
    ),
    ...EDGES,
  ]),
].sort((a, b) => a - b);

/**
 * True ink width against the box painting it, at every width, in ONE page load
 * per route — `scrollWidth` clamps to `clientWidth`, so it can report overflow
 * but never headroom, and headroom is the whole question here.
 */
async function sweepInkMargin(page: Page, route: string, widths: number[]) {
  await page.goto(route);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => {
    const el = document.querySelector('.stat-value');
    return !!el && getComputedStyle(el).fontFamily.includes('GST Mono');
  });

  const worst: { width: number; text: string; margin: number }[] = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    const row = await page.evaluate(() => {
      const cells: { text: string; margin: number }[] = [];

      // Values are single-token and never wrap: the whole string is the
      // constraint, measured as ink rather than as a clamped scrollWidth.
      for (const el of document.querySelectorAll<HTMLElement>('.stat-value')) {
        const range = document.createRange();
        range.selectNodeContents(el);
        cells.push({
          text: (el.textContent ?? '').trim(),
          margin: el.clientWidth - range.getBoundingClientRect().width,
        });
      }

      // Labels DO wrap, so the constraint is the longest unbreakable word —
      // `Client Engagements` fits by wrapping while `Engagements` cannot.
      for (const el of document.querySelectorAll<HTMLElement>('.stat-label')) {
        const cs = getComputedStyle(el);
        const probe = document.createElement('span');
        probe.style.cssText = 'white-space:pre;position:absolute;visibility:hidden';
        probe.style.font = cs.font;
        probe.style.letterSpacing = cs.letterSpacing;
        document.body.appendChild(probe);
        let widest = { text: '', width: 0 };
        for (const w of (el.textContent ?? '').trim().split(/\s+/)) {
          probe.textContent = w;
          const width = probe.getBoundingClientRect().width;
          if (width > widest.width) widest = { text: w, width };
        }
        probe.remove();
        cells.push({ text: widest.text, margin: el.clientWidth - widest.width });
      }

      return cells.length ? cells.sort((a, b) => a.margin - b.margin)[0] : null;
    });
    if (row) worst.push({ width, ...row });
  }
  return worst;
}

test.describe('StatsBar value fit', () => {
  for (const route of ROUTES) {
    test(`${route} keeps every stat value AND label clear of its cell at every width`, async ({
      page,
    }) => {
      test.slow();
      const measured = await sweepInkMargin(page, route, WIDTHS);
      expect(measured.length, `${route} renders a StatsBar to measure`).toBe(WIDTHS.length);

      const tight = measured
        .filter((m) => m.margin < MIN_INK_MARGIN)
        .sort((a, b) => a.margin - b.margin);
      expect(
        tight,
        tight.length
          ? `${tight.length} width(s) below the ${MIN_INK_MARGIN}px floor; worst: ` +
              tight
                .slice(0, 6)
                .map((m) => `${m.width}px "${m.text}" ${m.margin.toFixed(2)}px`)
                .join(', ')
          : ''
      ).toEqual([]);
    });
  }

  // The standalone 320px label test that used to sit here is gone: labels are
  // now measured by the sweep above, at every width rather than at the one that
  // was known to be tightest. `Client Engagements` wraps, `Engagements` cannot,
  // and the narrow tier steps the TRACKING down rather than the size — which is
  // the rule the sweep re-proves continuously.

  test('the grid halves rather than letting the type overflow', async ({ page }) => {
    // The mechanism, asserted once: four columns are only honest above a
    // 1095px container (1191px viewport here) — the width at which a 3.5rem
    // six-character value clears its cell by the margin above, rather than by
    // the 0.39px the first cut settled for. This is the rule the outcome tests
    // depend on, and a container query is easy to break silently (it keys on an
    // ancestor's size, so an unrelated layout change can move it).
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
