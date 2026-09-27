import type { Page } from '@playwright/test';

/**
 * Setup analytics mocking for a Playwright page
 * - Blocks real GA network requests to Google
 * - Records all gtag calls for verification
 * - Prevents external calls during test execution
 *
 * Events land in `window.gtagEvents` as `{ eventName, eventData, timestamp }`.
 * Read them with `page.waitForFunction` on that array, then `page.evaluate`.
 * The recorder lives in the page context, so call this again after every
 * `page.goto()` (TEST_BEST_PRACTICES anti-pattern 19).
 */
export async function setupAnalyticsMocking(page: Page): Promise<void> {
  // Block real GA requests to Google
  await page.route('**/googletagmanager.com/**', (route) => {
    route.abort();
  });

  await page.route('**/google-analytics.com/**', (route) => {
    route.abort();
  });

  // Initialize event recording
  await page.evaluateHandle(() => {
    (window as any).gtagEvents = [];
    (window as any).gtagCalls = [];

    // Store reference to original gtag
    const originalGtag = (window as any).gtag;

    // Override gtag to record calls
    (window as any).gtag = function (...args: any[]) {
      (window as any).gtagCalls.push({
        timestamp: new Date().toISOString(),
        args: JSON.parse(JSON.stringify(args)),
      });

      if (args[0] === 'event') {
        (window as any).gtagEvents.push({
          eventName: args[1],
          eventData: args[2] || {},
          timestamp: new Date().toISOString(),
        });
      }

      if (typeof originalGtag === 'function') {
        return originalGtag.apply(this, args as any);
      }
    };
  });
}
