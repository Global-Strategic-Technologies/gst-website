/**
 * Site chrome from phone widths to the desktop threshold — the header row, the
 * footer row and the page's own content must stay inside the viewport.
 *
 * The regression this exists for: `.footer-links` is a four-link flex row that
 * could neither wrap nor shrink (a flex item's default `min-width: auto`), so
 * it pushed its sibling ThemeToggle past the right edge and EVERY page scrolled
 * sideways below ~376px — ~392px in WebKit, whose mono metrics run wider. The
 * toggle, not the nav, was the widest box on the page. The header row had the
 * same shape at a smaller scale, overflowing below ~330px (~345 WebKit).
 *
 * Those four engine-split figures are PRE-BL-144 history. The mono face is now
 * pinned and its fallbacks are width-matched exactly (fonts.css), so the same
 * string measures the same on all three engines and a WebKit-specific width no
 * longer exists. Kept as the record of what was measured, not as live numbers.
 *
 * Both are geometry that only a browser can settle, and neither had coverage:
 * the a11y sweep runs at desktop width, and the per-page suites assert content,
 * not layout. The assertions here are deliberately about the OUTCOME (nothing
 * leaves the screen) rather than the mechanism (which row wrapped), so a future
 * fix that solves it differently still passes.
 *
 * ONE EXCEPTION TO THAT, ADDED DELIBERATELY: the footer row's LINE COUNT. The
 * outcome-only rule is what let a second regression through — BL-144's face pin
 * widened the four labels by 16.2px, the row wrapped to two lines on a 430px
 * phone, and every assertion here still passed, because wrapping satisfies
 * "nothing leaves the screen". A single-row footer is a design requirement, not
 * a mechanism, so it gets its own assertion below.
 */
import { test, expect, type Page } from '@playwright/test';

/**
 * Wait until the header's own scoped CSS has actually applied.
 *
 * These tests measure layout, and the dev server Playwright runs against injects
 * styles through the client runtime — so under parallel load a page can be
 * measured in the brief window before its CSS lands, where an unstyled document
 * overflows at 320px for reasons that have nothing to do with the code under
 * test. `display: flex` on the nav comes from Header.astro's scoped block and is
 * never the browser default for a `<nav>`, so it is proof the styles arrived.
 */
async function waitForStyles(page: Page) {
  await page.waitForFunction(() => {
    const nav = document.querySelector('.site-header nav');
    return !!nav && getComputedStyle(nav).display === 'flex';
  });
}

/**
 * The same wait, for the footer's own styles — the header's arriving says
 * nothing about a different component's, and these tests measure the footer.
 */
async function waitForFooterStyles(page: Page) {
  await page.waitForFunction(() => {
    const top = document.querySelector('footer .footer-top');
    return !!top && getComputedStyle(top).display === 'flex';
  });
}

/**
 * The same wait again, for FooterLinks' own scoped block.
 *
 * `waitForFooterStyles` proves Footer.astro's styles arrived, which says nothing
 * about the child component's — and the assertions below depend on rules that
 * live only in FooterLinks' `@media (max-width: 480px)` block. `flex-wrap: wrap`
 * is set in no other `.footer-links` rule and is not a default, so it is proof
 * that specific block applied. It stays `wrap` through the whole 360–480 sweep.
 */
async function waitForFooterLinkStyles(page: Page) {
  await page.waitForFunction(() => {
    const row = document.querySelector('footer .footer-links');
    return !!row && getComputedStyle(row).flexWrap === 'wrap';
  });

  // And on the FACE, not just the rules. Every number this file asserts about
  // the footer is a font-metric budget off GST Mono's 0.6em advance, so a page
  // measured mid-swap against a fallback is measuring a different budget. This
  // is the regression's own mechanism: BL-144 changed the advance and that is
  // what moved the row. stats-bar-fit does the same pair for the same reason.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => {
    const link = document.querySelector('footer .footer-links a');
    return !!link && getComputedStyle(link).fontFamily.includes('GST Mono');
  });
}

/**
 * 320 is the narrowest width the site is expected to survive; 360/375/390 are
 * current phones, and 430 is the widest one (iPhone Pro Max) — added after a
 * regression that was visible ONLY there, because every width this file sampled
 * wrapped the footer either way.
 *
 * BL-144 then found /ma-portfolio/ scrolling sideways at EVERY width from 481
 * to 959 — by 210px at 540 — with nothing to catch it. That band was uncovered
 * from both ends: this file stopped at 390 and the axe sweep runs desktop-only,
 * so a whole class of layout was checked at phone widths and at 1280 and
 * nowhere in between. 960 is sampled deliberately: it is the first width that
 * was clean, so it pins the top of that band with evidence rather than leaving
 * it inferred.
 */
const PHONE_WIDTHS = [320, 360, 375, 390, 430] as const;

/**
 * The phone widths plus the tablet-to-small-laptop band, which only the
 * page-overflow sweep needs: the toggle and nav assertions below are about a
 * phone-width regression and stay there, so the added widths buy coverage
 * without tripling this file's runtime.
 *
 * The band straddles the breakpoints the site actually uses (480, 512, 540,
 * 768) and samples inside each resulting tier, because these failures scale
 * with a tier's own floors rather than appearing at its boundaries — at 540 the
 * overflow was 210px, decaying to 24px by 900.
 *
 * Sorted, because it spreads PHONE_WIDTHS: 430 would otherwise land before 420
 * and the list would stop reading as a ladder.
 */
// 1025 and 1100 sit just above PortfolioHeader's 1024 stack tier, where the
// nowrap title and the shrinkable search/filter block share one row and the
// row is at its tightest; the sweep otherwise stopped at 960.
const OVERFLOW_WIDTHS = [
  ...PHONE_WIDTHS,
  420,
  481,
  540,
  660,
  720,
  769,
  840,
  900,
  960,
  1025,
  1100,
].sort((a, b) => a - b);

/**
 * Routes whose chrome is the whole site's chrome, plus the two that carry the
 * heavier furniture — a StatsBar grid and a filter drawer — since both were
 * where the remaining overflow actually lived.
 */
const ROUTES = [
  '/',
  '/services/',
  '/about/',
  '/hub/',
  '/ma-portfolio/',
  '/hub/tools/regulatory-map/',
] as const;

test.describe('Site chrome at phone widths', () => {
  for (const width of OVERFLOW_WIDTHS) {
    for (const route of ROUTES) {
      test(`${route} at ${width}px has no horizontal overflow`, async ({ page }) => {
        await page.setViewportSize({ width, height: 700 });
        await page.goto(route);
        await waitForStyles(page);

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        expect(overflow, 'the page must not scroll sideways').toBeLessThanOrEqual(1);
      });
    }
  }

  for (const width of PHONE_WIDTHS) {
    test(`at ${width}px the footer theme toggle stays on screen`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 });
      await page.goto('/services/');
      await waitForFooterStyles(page);

      // The exact element the regression pushed off-screen. Asserted by its own
      // box, not by the document's scroll width, so it cannot be masked by
      // something else on the page happening to be wider.
      const box = await page.locator('footer .theme-toggle').boundingBox();
      expect(box, 'the toggle must render').not.toBeNull();
      expect(box!.x, 'left edge on screen').toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, 'right edge on screen').toBeLessThanOrEqual(width);
    });

    test(`at ${width}px all four nav links stay on screen`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 });
      await page.goto('/services/');
      await waitForStyles(page);

      // The four PRIMARY links. The fifth <li>, the language switcher
      // (BL-153), renders only while ≥2 locales are live and carries its own
      // <a>s inside a menu; it is excluded here and asserted separately below.
      const links = page.locator('.site-header nav ul > li:not(.lang-switch) a');
      await expect(links).toHaveCount(4);

      for (let i = 0; i < 4; i++) {
        const link = links.nth(i);
        const label = (await link.textContent())?.trim() ?? `link ${i}`;
        await expect(link, `${label} is visible`).toBeVisible();
        const box = await link.boundingBox();
        expect(box!.x, `${label} left edge`).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width, `${label} right edge`).toBeLessThanOrEqual(width);
      }
    });
  }

  /**
   * The footer link row is a SINGLE row on every phone from 360px up.
   *
   * This is the assertion the rest of this file lacked. "Nothing leaves the
   * screen" is satisfied by a wrapped row, so when BL-144's face pin widened the
   * four labels by 16.2px and the row went to two lines on a 430px phone, every
   * test here still passed.
   *
   * SHAPE. One test with an in-page resize loop rather than 13 tests, following
   * stats-bar-fit.test.ts. The 10px step is not where the value is: the
   * constraint is monotonic in width and no footer rule changes between 360 and
   * 479, so the step only guards against a discontinuity nobody expects. The
   * value is the CLEARANCE FLOOR asserted at 360 — the tight end, and the
   * narrowest width any current phone reports.
   *
   * WHAT CLEARANCE MEASURES. `footer .footer-links` carries `flex: 1` inside a
   * `space-between` parent, so its box IS the space available to the row, and
   * (row box right − last anchor right) is exactly the slack the budget in
   * FooterLinks.astro predicts: 15.8px at 360. Do NOT measure against the
   * viewport instead — that folds in the 53.6px ThemeToggle and the 16px
   * `.footer-top` gap, and the number stops meaning anything.
   *
   * BOTH NUMBERS MOVED ON 2026-09-01, and the reason is on the record rather
   * than absorbed. The prediction was 23.8px and the floor was 16. FooterLinks
   * then took a `padding-left: var(--spacing-sm)` — an 8px optical inset,
   * because the live gutter ladder pays 1rem at this tier where the pre-ADR-0027
   * gutter paid a flat 3rem — and that padding sits inside `flex: 1`, so it
   * comes out of this exact slack. Re-derived to 15.8; measured 15.78, with the
   * one-row threshold at 345px exactly (344 wraps). Chromium, 2026-09-01.
   *
   * The previous revision of this comment said that a run landing materially
   * under 23.8 means the budget is wrong and "gets investigated rather than
   * this number lowered." That was investigated, and the escape clause does not
   * apply: the drop is a declared 8px, the re-derivation predicted it to within
   * 0.02px, and the 53.6px toggle box is exonerated rather than implicated. It
   * was the prime suspect precisely because it was the one derived term nobody
   * had measured; it has since been measured at 53.59375, so it is now a fact
   * rather than an assumption and the paragraph no longer rests on "an error
   * there would not land this close twice." The rule still stands for an
   * UNEXPLAINED drop.
   *
   * 10 rather than the predicted 15.8, and the arithmetic behind that choice
   * matters more than the value. The floor could not stay at 16: measured
   * clearance is 15.78, the assertion is `>=`, so 16 does not pass narrowly —
   * it FAILS by 0.22px. (An earlier revision of this comment said 16 "would
   * have passed by 0.78px". That was true of the 7px inset it was written for
   * — measured 16.78 there, so 16 really did pass by 0.78 — and it was carried
   * across the change to the 8px token without being re-derived. Corrected
   * rather than deleted, because the mistake is the one this file keeps
   * catching: a number that was true one revision ago.)
   *
   * So the choice was never 16-or-lower, it was how far below 15.78 to sit.
   * An intermediate 12 was rejected: 15.78 − 12 = 3.78px of headroom, under the
   * 4px rasterization floor this repo uses elsewhere, which concedes the
   * principle by a pixel rather than applying it. The principle is
   * `stats-bar-fit.test.ts` correction 2 — this repo shipping a red CI check on
   * 0.39px of margin that held locally and lost to Linux rasterization.
   *
   * 10 keeps 5.78px of headroom, comfortably clear of that floor, and still
   * fails on any regression costing more than ~5.8px — one extra character in a
   * label is 7.8px at this tier, so the guard keeps its teeth.
   */
  test('the footer link row stays on one line from 360px up', async ({ page }) => {
    test.slow();

    // Size the viewport BEFORE the first load: the gate below proves
    // FooterLinks' `@media (max-width: 480px)` block applied, so it can only
    // pass inside that range — at Playwright's default 1280px it never would.
    await page.setViewportSize({ width: 360, height: 700 });
    await page.goto('/services/');

    const MIN_CLEARANCE = 10;
    const measured: { width: number; rows: number; clearance: number }[] = [];

    for (let width = 360; width <= 480; width += 10) {
      await page.setViewportSize({ width, height: 700 });
      // Width-dependent, so the wait tracks each resize. The style gate alone
      // is a no-op after the first iteration — `flex-wrap` never changes across
      // this band, so it would pass instantly whether or not layout had settled.
      await page.waitForFunction((w) => document.documentElement.clientWidth === w, width);
      await waitForFooterLinkStyles(page);

      const sample = await page.evaluate(() => {
        const row = document.querySelector('footer .footer-links');
        if (!row) return null;
        const anchors = [...row.querySelectorAll('a')];
        if (anchors.length === 0) return null;
        const last = anchors[anchors.length - 1].getBoundingClientRect();
        return {
          count: anchors.length,
          rows: new Set(anchors.map((a) => Math.round(a.getBoundingClientRect().top))).size,
          clearance: row.getBoundingClientRect().right - last.right,
        };
      });

      expect(sample, `the footer link row must render at ${width}px`).not.toBeNull();
      // The guard probes something: four links, not an empty set that would make
      // every assertion below vacuously true.
      expect(sample!.count, `four footer links at ${width}px`).toBe(4);
      measured.push({ width, rows: sample!.rows, clearance: sample!.clearance });
    }

    expect(measured.length, 'the sweep measured every width').toBe(13);

    for (const { width, rows } of measured) {
      expect(rows, `the footer link row is one line at ${width}px`).toBe(1);
    }

    const tightest = measured[0];
    expect(tightest.width).toBe(360);
    expect(
      tightest.clearance,
      `the row clears its box by at least ${MIN_CLEARANCE}px at 360px (derived: 15.8px)`
    ).toBeGreaterThanOrEqual(MIN_CLEARANCE);
  });

  /**
   * 320px is the deliberate exception, asserted rather than left to chance.
   *
   * The row genuinely cannot fit one line there — 218.4px of space against
   * 210.6px of glyph leaves 7.8px for three gaps — so it wraps, and that is the
   * designed behaviour rather than a defect. Asserted as an upper bound, not
   * `=== 2`: this file asserts outcomes, not mechanisms, and a future change
   * that legitimately gets 320px onto one line must not fail here.
   */
  test('at 320px the footer link row wraps rather than overflowing', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/services/');
    await waitForFooterLinkStyles(page);

    const sample = await page.evaluate(() => {
      const anchors = [...document.querySelectorAll('footer .footer-links a')];
      return {
        count: anchors.length,
        rows: new Set(anchors.map((a) => Math.round(a.getBoundingClientRect().top))).size,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });

    expect(sample.count, 'four footer links').toBe(4);
    expect(sample.rows, 'at most two rows').toBeLessThanOrEqual(2);
    expect(sample.overflow, 'and still nothing off-screen').toBeLessThanOrEqual(1);
  });
});
