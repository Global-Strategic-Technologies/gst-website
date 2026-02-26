import { Page, expect } from '@playwright/test';

/**
 * Wait for the Radar page to be ready.
 *
 * The Radar page is SSR — all HTML is delivered complete by the server.
 * By the time page.goto() resolves, the DOM is ready. We just need to
 * confirm the expected structure exists (header or fallback section).
 */
export async function waitForRadarReady(page: Page): Promise<void> {
  // SSR page delivers full HTML — just confirm the radar structure rendered
  await expect(page.locator('.radar-header')).toBeVisible();
}

/**
 * Check whether the Radar page has any content (signals, featured, or stream).
 * Returns true if at least one content item exists; false if only the fallback.
 */
export async function hasRadarContent(page: Page): Promise<boolean> {
  const signalCount = await page.locator('.signal-card').count();
  const featuredCount = await page.locator('.featured-item').count();
  const streamCount = await page.locator('.stream-item').count();
  return signalCount > 0 || featuredCount > 0 || streamCount > 0;
}

/**
 * Check whether the page has Inoreader-sourced content (featured or stream).
 * Use this for tests that depend on live API data (category filtering, etc.).
 */
export async function hasInoreaderContent(page: Page): Promise<boolean> {
  const featuredCount = await page.locator('.featured-item').count();
  const streamCount = await page.locator('.stream-item').count();
  return featuredCount > 0 || streamCount > 0;
}

/**
 * Click a category filter button and wait for the DOM to update.
 * Uses page.evaluate() for WebKit stability.
 */
export async function clickCategoryFilter(
  page: Page,
  category: string,
): Promise<void> {
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
    { timeout: 2000 },
  );
}

/**
 * Get visible item count for items matching a data-category value.
 * Items hidden by the category filter (display: none) are excluded.
 */
export async function getVisibleItemCount(
  page: Page,
  category?: string,
): Promise<number> {
  return page.evaluate((cat) => {
    const selector = cat
      ? `[data-category="${cat}"]`
      : '[data-category]';
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
