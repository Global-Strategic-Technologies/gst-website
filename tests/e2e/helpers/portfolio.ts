import { expect, type Page } from '@playwright/test';

/**
 * Gap the drawer keeps above the page footer, in px.
 *
 * Must match FOOTER_GAP_PX in PortfolioHeader.astro's scroll listener
 * (`initDrawerFooterClearance`). That duplication is real and is not removed by
 * living here — this is still a hand-synced copy of a source constant, just one
 * shared between the suites that assert on it instead of one per suite.
 */
export const FOOTER_GAP_PX = 16;

/**
 * Open the filter drawer and wait for its slide-in transition to complete.
 *
 * Uses evaluate to bypass WebKit hit-testing on the toggle button, then
 * waits for the drawer's CSS `right` property to settle (transition end).
 *
 * Two properties this relies on, stated because both are load-bearing and
 * neither is obvious from the assertion (BL-137):
 *
 * - **`right` is the property the drawer animates.** Open is `right: 0` at
 *   every width; closed is `-400px` on desktop and `-100%` at ≤768px. A future
 *   switch to `transform` would leave `right` at `0` in both states and this
 *   check would silently pass on a drawer that never opened.
 * - **`toBeVisible()` depends on the visibility step function.** The closed
 *   drawer is `visibility: hidden` so its controls stay out of the tab order;
 *   `visibility` is transitioned alongside `right`, and per spec it interpolates
 *   as a step function where any progress in (0,1) is `visible`. So the drawer
 *   becomes visible the instant `.open` lands rather than after 0.3s. Every
 *   drawer test in the repo goes through this gate.
 */
export async function openFilterDrawer(page: Page): Promise<void> {
  await page.evaluate(() => {
    (document.querySelector('[data-testid="portfolio-filter-toggle"]') as HTMLElement)?.click();
  });

  const drawer = page.locator('[data-testid="portfolio-filter-drawer"]');
  await expect(drawer).toBeVisible({ timeout: 5000 });

  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="portfolio-filter-drawer"]');
      if (!el || !el.classList.contains('open')) return false;
      const right = parseFloat(window.getComputedStyle(el).right);
      return right >= -1;
    },
    { timeout: 5000 }
  );
}

/** Read drawer + footer rects in the same paint frame (TEST_BEST_PRACTICES §22). */
export async function readRects(page: Page) {
  return page.evaluate(() => {
    const drawer = document.querySelector('[data-testid="portfolio-filter-drawer"]');
    const footer = document.querySelector('footer[role="contentinfo"]');
    if (!drawer || !footer) throw new Error('drawer or footer not found');
    const d = drawer.getBoundingClientRect();
    const f = footer.getBoundingClientRect();
    return { drawerBottom: d.bottom, drawerLeft: d.left, drawerRight: d.right, footerTop: f.top };
  });
}

/**
 * Wait for the scroll listener's rAF to settle the drawer above the footer
 * (TEST_BEST_PRACTICES §13 — never waitForTimeout for rAF / listener settle).
 */
export async function waitForDrawerGap(page: Page, gapPx: number = FOOTER_GAP_PX) {
  await page.waitForFunction(
    ({ gap }) => {
      const drawer = document.querySelector('[data-testid="portfolio-filter-drawer"]');
      const footer = document.querySelector('footer[role="contentinfo"]');
      if (!drawer || !footer) return false;
      const d = drawer.getBoundingClientRect();
      const f = footer.getBoundingClientRect();
      return f.top < window.innerHeight && Math.abs(f.top - d.bottom - gap) < 1;
    },
    { gap: gapPx },
    { timeout: 5000 }
  );
}
