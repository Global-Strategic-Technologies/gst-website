import type { Page } from '@playwright/test';

/**
 * Click an SVG path element via dispatchEvent.
 *
 * SVG paths inside a D3-managed `<svg>` intercept pointer events at the SVG
 * level, so Playwright's `click()` fails with "element intercepts pointer
 * events". dispatchEvent bypasses coordinate-based hit-testing.
 */
export async function clickSvgPath(page: Page, selector: string): Promise<void> {
  await page.locator(selector).first().waitFor({ state: 'attached' });
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, selector);
}

/**
 * Wait for D3 map paths to finish rendering.
 *
 * Polls until at least one `.country-path` element exists in the DOM,
 * indicating D3 has completed its initial SVG render.
 */
export async function waitForMapReady(page: Page): Promise<void> {
  // Wait for D3 to render country paths AND for at least one to be active
  // (regulations loaded and applied). Under parallel load, D3 init takes longer.
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.country-path').length > 0 &&
      document.querySelectorAll('.country-path--active').length > 0,
    { timeout: 15000 }
  );
}
