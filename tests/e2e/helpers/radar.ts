import { Page, expect } from '@playwright/test';

/**
 * Wait for the Radar page to be ready.
 *
 * The Radar page is SSR — all HTML is delivered complete by the server.
 * By the time page.goto() resolves, the DOM is ready. We just need to
 * confirm the expected structure exists (header or fallback section).
 *
 * Note: Mock Inoreader data is seeded into the dev cache by the Playwright
 * global setup (tests/e2e/global-setup.ts). The Astro dev server reads
 * this cache during SSR, so content is always available during E2E runs.
 */
export async function waitForRadarReady(page: Page): Promise<void> {
  // SSR page delivers full HTML — just confirm the radar structure rendered
  await expect(page.locator('.radar-header')).toBeVisible();
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
 * Check whether the page has Inoreader-sourced content (FYI or wire).
 * Use this for tests that depend on live API data (category filtering, etc.).
 */
export async function hasInoreaderContent(page: Page): Promise<boolean> {
  const fyiCount = await page.locator('.fyi-item').count();
  const wireCount = await page.locator('.wire-item').count();
  return fyiCount > 0 || wireCount > 0;
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
