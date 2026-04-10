import { expect, type Page } from '@playwright/test';

/**
 * Open the filter drawer and wait for its slide-in transition to complete.
 *
 * Uses evaluate to bypass WebKit hit-testing on the toggle button, then
 * waits for the drawer's CSS `right` property to settle (transition end).
 */
export async function openFilterDrawer(page: Page): Promise<void> {
  await page.evaluate(() => {
    (document.querySelector('[data-testid="portfolio-filter-toggle"]') as HTMLElement)?.click();
  });

  const drawer = page.locator('[data-testid="portfolio-filter-drawer"]');
  await expect(drawer).toBeVisible({ timeout: 5000 });

  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="portfolio-filter-drawer"]');
    if (!el || !el.classList.contains('open')) return false;
    const right = parseFloat(window.getComputedStyle(el).right);
    return right >= -1;
  }, { timeout: 5000 });
}
