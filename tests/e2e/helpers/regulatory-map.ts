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
 * Wait for the regulatory map to complete two-phase initialization:
 * Phase A (geometry rendered) + Phase B (regulation data applied).
 * The page sets data-map-ready="true" on #mapContainer after Phase B.
 */
export async function waitForMapReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.getElementById('mapContainer')?.getAttribute('data-map-ready') === 'true',
    undefined,
    { timeout: 15000 }
  );
}
