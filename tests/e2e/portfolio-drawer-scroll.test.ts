import { test, expect } from '@playwright/test';
import {
  FOOTER_GAP_PX,
  gotoPortfolio,
  openFilterDrawer,
  readRects,
  waitForDrawerGap,
} from './helpers/portfolio';

test.describe('Filter Drawer Background Scroll - MA Portfolio Page', () => {
  test.beforeEach(async ({ page }) => {
    await gotoPortfolio(page);
  });

  test('should allow background scrolling while filter drawer is open', async ({ page }) => {
    // 1. Record initial scroll position
    const initialScrollY = await page.evaluate(() => window.scrollY);

    // 2. Open the filter drawer
    await openFilterDrawer(page);

    // 3. Verify body overflow is NOT locked
    const bodyOverflow = await page.evaluate(() => document.body.style.overflow);
    expect(bodyOverflow).not.toBe('hidden');

    // 4. Scroll the page via mouse wheel
    await page.mouse.wheel(0, 300);

    // 5. Wait for scroll position to change
    await page.waitForFunction((initialY: number) => window.scrollY > initialY, initialScrollY, {
      timeout: 5000,
    });

    // 6. Verify the page actually scrolled
    const newScrollY = await page.evaluate(() => window.scrollY);
    expect(newScrollY).toBeGreaterThan(initialScrollY);

    // 7. Verify drawer is still open (scrolling didn't close it)
    const drawerStillOpen = await page.evaluate(() => {
      const drawer = document.querySelector('[data-testid="portfolio-filter-drawer"]');
      return drawer?.classList.contains('open');
    });
    expect(drawerStillOpen).toBe(true);
  });

  test('should close drawer via click outside (document-level handler)', async ({ page }) => {
    await openFilterDrawer(page);

    // Verify drawer is open
    const drawerOpen = await page.evaluate(() => {
      const drawer = document.querySelector('[data-testid="portfolio-filter-drawer"]');
      return drawer?.classList.contains('open');
    });
    expect(drawerOpen).toBe(true);

    // Click on an area outside the drawer (left side of viewport)
    await page.mouse.click(50, 300);

    // Wait for the drawer to close
    await page.waitForFunction(
      () => {
        const drawer = document.querySelector('[data-testid="portfolio-filter-drawer"]');
        return drawer && !drawer.classList.contains('open');
      },
      { timeout: 5000 }
    );

    // Verify drawer is closed
    const drawerClosed = await page.evaluate(() => {
      const drawer = document.querySelector('[data-testid="portfolio-filter-drawer"]');
      return !drawer?.classList.contains('open');
    });
    expect(drawerClosed).toBe(true);

    // Verify aria-expanded is false on the toggle
    const ariaExpanded = await page
      .locator('[data-testid="portfolio-filter-toggle"]')
      .getAttribute('aria-expanded');
    expect(ariaExpanded).toBe('false');
  });

  test('should close drawer via Escape key', async ({ page }) => {
    await openFilterDrawer(page);

    // Verify drawer is open
    const drawerOpen = await page.evaluate(() => {
      const drawer = document.querySelector('[data-testid="portfolio-filter-drawer"]');
      return drawer?.classList.contains('open');
    });
    expect(drawerOpen).toBe(true);

    // Press Escape
    await page.keyboard.press('Escape');

    // Wait for the drawer to close
    await page.waitForFunction(
      () => {
        const drawer = document.querySelector('[data-testid="portfolio-filter-drawer"]');
        return drawer && !drawer.classList.contains('open');
      },
      { timeout: 5000 }
    );

    // Verify drawer is closed
    const drawerClosed = await page.evaluate(() => {
      const drawer = document.querySelector('[data-testid="portfolio-filter-drawer"]');
      return !drawer?.classList.contains('open');
    });
    expect(drawerClosed).toBe(true);
  });
});

/**
 * Protects the "drawer bottom sits above the footer on scroll" fix:
 *   - Scroll/resize listener writes `drawer.style.bottom` in px so the
 *     drawer's bottom edge stays FOOTER_GAP_PX above the footer's top as the
 *     footer enters view (never flush, never behind).
 *   - `.filter-drawer { overflow: hidden }` + `.drawer-content { min-height: 0 }`
 *     close the flexbox min-height trap so chips can't leak below.
 *
 * FOOTER_GAP_PX, readRects and waitForDrawerGap live in ./helpers/portfolio so
 * the BL-137 narrow-width tests can use the same rAF-settle wait instead of
 * hand-rolling a second one.
 */
test.describe('Filter Drawer Footer Gap - MA Portfolio Page', () => {
  test.beforeEach(async ({ page }) => {
    await gotoPortfolio(page);
  });

  test('drawer bottom keeps a gap above footer top as footer partially enters viewport', async ({
    page,
  }) => {
    await openFilterDrawer(page);

    // Scroll until footer is mid-viewport (partially visible).
    await page.evaluate(() => {
      const footer = document.querySelector('footer[role="contentinfo"]') as HTMLElement;
      const targetFooterTop = window.innerHeight * 0.6;
      const scrollTarget = footer.offsetTop - targetFooterTop;
      window.scrollTo(0, scrollTarget);
    });
    await waitForDrawerGap(page);

    const { drawerBottom, footerTop } = await readRects(page);
    expect(footerTop - drawerBottom).toBeGreaterThanOrEqual(FOOTER_GAP_PX - 2);
    expect(footerTop - drawerBottom).toBeLessThanOrEqual(FOOTER_GAP_PX + 2);
  });

  test('drawer clips all chip content above footer top when scrolled to page bottom', async ({
    page,
  }) => {
    await openFilterDrawer(page);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await waitForDrawerGap(page);

    const { drawerBottom, drawerLeft, drawerRight, footerTop } = await readRects(page);
    expect(footerTop - drawerBottom).toBeGreaterThanOrEqual(FOOTER_GAP_PX - 2);
    expect(footerTop - drawerBottom).toBeLessThanOrEqual(FOOTER_GAP_PX + 2);

    // Sample 3 horizontal points inside the gap + footer zone. No chip should
    // render here - both the overflow clip and the gap should keep chips
    // entirely above the drawer's painted bottom edge.
    const samples = [0.25, 0.5, 0.75].map((p) => drawerLeft + (drawerRight - drawerLeft) * p);
    const hits = await page.evaluate(
      ({ xs, ys }) =>
        xs.flatMap((x) =>
          ys.map((y) => {
            const el = document.elementFromPoint(x, y);
            return el?.closest('.filter-chip') ? 'chip' : 'not-chip';
          })
        ),
      { xs: samples, ys: [drawerBottom + 4, footerTop + 2] }
    );
    expect(hits.every((h) => h === 'not-chip')).toBe(true);
  });

  test('drawer recomputes gap after viewport resize', async ({ page }) => {
    await openFilterDrawer(page);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await waitForDrawerGap(page);

    // Shrink viewport. scrollY may not auto-update, so re-scroll to the bottom
    // so the footer is in view and the resize listener has something to measure.
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await waitForDrawerGap(page);

    const { drawerBottom, footerTop } = await readRects(page);
    expect(footerTop - drawerBottom).toBeGreaterThanOrEqual(FOOTER_GAP_PX - 2);
    expect(footerTop - drawerBottom).toBeLessThanOrEqual(FOOTER_GAP_PX + 2);
  });

  test('drawer internal scroll advances as page scroll shrinks the drawer', async ({ page }) => {
    await openFilterDrawer(page);

    // Drawer starts with internal scrollTop = 0 before any page scroll.
    const initialScroll = await page.evaluate(
      () => (document.querySelector('.drawer-content') as HTMLElement).scrollTop
    );
    expect(initialScroll).toBe(0);

    // Scroll the page to bottom so the drawer must shrink by the full
    // footer-visible height. The listener should advance drawerContent
    // scrollTop by the same amount so the chip list's bottom stays
    // anchored and no chip gets bisected at the shrinking clip boundary.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await waitForDrawerGap(page);

    const { scrollTop, clearance } = await page.evaluate(() => {
      const drawer = document.getElementById('filter-drawer') as HTMLElement;
      const content = drawer.querySelector('.drawer-content') as HTMLElement;
      // Resolved value rather than the inline style, so this stays correct if
      // the clearance is ever delivered some other way.
      return {
        scrollTop: content.scrollTop,
        clearance: parseFloat(getComputedStyle(drawer).bottom),
      };
    });

    // scrollTop must have advanced by at least the clearance amount (up to
    // drawerContent's own scrollMax - the browser clamps silently).
    expect(scrollTop).toBeGreaterThanOrEqual(Math.min(clearance, 1));
  });

  test('drawer keeps its gap above the footer at phone width too', async ({ page }) => {
    // A phone viewport, not a different drawer: the panel is the same 350px
    // side panel at every width (BL-137). What this covers is the short
    // viewport, where the footer occupies proportionally more of the screen and
    // the clearance the listener computes is correspondingly larger. The
    // viewport is set before navigation so the first render is the measured one.
    await page.setViewportSize({ width: 400, height: 700 });
    await gotoPortfolio(page);

    await openFilterDrawer(page);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await waitForDrawerGap(page);

    const { drawerBottom, footerTop } = await readRects(page);
    expect(footerTop - drawerBottom).toBeGreaterThanOrEqual(FOOTER_GAP_PX - 2);
    expect(footerTop - drawerBottom).toBeLessThanOrEqual(FOOTER_GAP_PX + 2);
  });
});
