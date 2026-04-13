import type { Page } from '@playwright/test';

/**
 * Click the theme toggle via dispatchEvent.
 *
 * WebKit's hit-testing can fail on the toggle due to the footer's z-index: 0
 * stacking context + the large font-size creating an oversized bounding box.
 * dispatchEvent bypasses Playwright's coordinate-based click.
 */
export async function clickThemeToggle(page: Page): Promise<void> {
  await page.evaluate(() => {
    document
      .getElementById('themeToggle')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}
