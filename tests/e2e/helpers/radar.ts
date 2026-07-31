import { expect, type Page } from '@playwright/test';

/**
 * Wait for the Radar page to be ready.
 *
 * The Radar page is SSR and the feed is rendered INLINE (not a `server:defer`
 * island), so all HTML — including feed items — is delivered complete by the
 * server. By the time page.goto() resolves, the DOM is ready; we just confirm
 * the expected structure exists.
 *
 * There is NO seeded feed data. `tests/e2e/global-setup.ts` is an explicit
 * no-op, and `npm run radar:seed` populates only the local *stdio* MCP
 * snapshot, which the website never reads — the site fetches the Worker over
 * HTTP. So items appear only when `MCP_KEY_WEBSITE_RADAR` is bound and the
 * Worker responds; CI binds no such secret and renders the empty state.
 * That is why content-dependent assertions must branch on hasRadarContent().
 * (This docstring previously claimed setup seeded a dev cache and content was
 * "always available" — both died with BL-032.8 Phase B.)
 */
export async function waitForRadarReady(page: Page): Promise<void> {
  // SSR page delivers full HTML — confirm header and content area rendered.
  // Under parallel load, webkit takes longer; use explicit timeout.
  await expect(page.locator('.hub-header')).toBeVisible({ timeout: 10000 });
  await page.waitForLoadState('domcontentloaded');
}

/**
 * Check whether the Radar page has any content (FYI or wire).
 * Returns true if at least one content item exists; false if only the fallback.
 */
export async function hasRadarContent(page: Page): Promise<boolean> {
  const fyiCount = await page.locator('.fyi-item').count();
  const wireCount = await page.locator('.wire-item').count();
  return fyiCount > 0 || wireCount > 0;
}

/**
 * Click a category filter button and wait for the DOM to update.
 * Uses page.evaluate() for WebKit stability.
 */
export async function clickCategoryFilter(page: Page, category: string): Promise<void> {
  await page.evaluate((cat) => {
    const btn = document.querySelector(`.filter-btn[data-filter="${cat}"]`);
    if (!btn) throw new Error(`Filter button not found: ${cat}`);
    (btn as HTMLElement).click();
  }, category);

  // Wait for the click handler to process
  await page.waitForFunction(
    (cat) => {
      const btn = document.querySelector(`.filter-btn[data-filter="${cat}"]`);
      return btn?.classList.contains('active');
    },
    category,
    { timeout: 2000 }
  );
}

/**
 * Get visible item count for items matching a data-category value.
 * Items hidden by the category filter (display: none) are excluded.
 */
export async function getVisibleItemCount(page: Page, category?: string): Promise<number> {
  return page.evaluate((cat) => {
    const selector = cat ? `[data-category="${cat}"]` : '[data-category]';
    const items = document.querySelectorAll(selector);
    let count = 0;
    items.forEach((el) => {
      if (window.getComputedStyle(el as HTMLElement).display !== 'none') {
        count++;
      }
    });
    return count;
  }, category);
}
