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
 * Both are geometry that only a browser can settle, and neither had coverage:
 * the a11y sweep runs at desktop width, and the per-page suites assert content,
 * not layout. The assertions here are deliberately about the OUTCOME (nothing
 * leaves the screen) rather than the mechanism (which row wrapped), so a future
 * fix that solves it differently still passes.
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
 * 320 is the narrowest width the site is expected to survive; 360/375/390 are
 * current phones.
 *
 * BL-144 then found /ma-portfolio/ scrolling sideways at EVERY width from 481
 * to 959 — by 210px at 540 — with nothing to catch it. That band was uncovered
 * from both ends: this file stopped at 390 and the axe sweep runs desktop-only,
 * so a whole class of layout was checked at phone widths and at 1280 and
 * nowhere in between. 960 is sampled deliberately: it is the first width that
 * was clean, so it pins the top of that band with evidence rather than leaving
 * it inferred.
 */
const PHONE_WIDTHS = [320, 360, 375, 390] as const;

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
 */
const OVERFLOW_WIDTHS = [...PHONE_WIDTHS, 420, 481, 540, 660, 720, 769, 840, 900, 960] as const;

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

      const links = page.locator('.site-header nav ul a');
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
});
