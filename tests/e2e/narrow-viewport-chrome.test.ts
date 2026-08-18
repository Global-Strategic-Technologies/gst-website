/**
 * Site chrome at phone widths — the header row and the footer row must stay
 * inside the viewport.
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

/** 320 is the narrowest width the site is expected to survive; 360/375/390 are current phones. */
const WIDTHS = [320, 360, 375, 390] as const;

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
  for (const width of WIDTHS) {
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

  for (const width of WIDTHS) {
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
