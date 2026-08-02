import { expect, type Page } from '@playwright/test';

/**
 * Wait for the Radar page to be ready.
 *
 * The feed is a `server:defer` island, so `domcontentloaded` is NOT enough:
 * the shell (header, filter pills) is in the initial HTML, but the items
 * arrive later via a second request that Astro splices in with no event
 * fired. Waiting only on the shell — as this helper used to — leaves every
 * `hasRadarContent()` caller racing the island, which shows up as tests that
 * spuriously self-skip rather than as tests that fail. So we wait for the
 * island to have RESOLVED, in either direction: real items, or the empty
 * state it renders when the fetch yields nothing.
 *
 * There is NO seeded feed data. `tests/e2e/global-setup.ts` is an explicit
 * no-op, and `npm run radar:seed` populates only the local *stdio* MCP
 * snapshot, which the website never reads — the site fetches the Worker over
 * HTTP. So items appear only when `MCP_KEY_WEBSITE_RADAR` is bound and the
 * Worker responds; CI binds no such secret and renders the empty state.
 * That is why content-dependent assertions must branch on hasRadarContent().
 */
/**
 * Navigate to a Radar URL and wait for it to be usable.
 *
 * `waitUntil: 'domcontentloaded'` is load-bearing, not a micro-optimisation.
 * The default (`'load'`) waits for every subresource — which now includes the
 * island's own `/_server-islands/RadarFeed` request. Under Playwright's
 * default worker count that serialises against the dev server and times out
 * the navigation itself, turning dev-server contention into a navigation
 * failure that reads like a broken page. `waitForRadarReady` below then does
 * the waiting that actually matters, so nothing is lost.
 *
 * Always use this rather than a bare `page.goto` for Radar routes.
 */
export async function gotoRadar(page: Page, url = '/hub/radar/'): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitForRadarReady(page);
}

export async function waitForRadarReady(page: Page): Promise<void> {
  // Under parallel load, webkit takes longer; use explicit timeouts.
  await expect(page.locator('.hub-header')).toBeVisible({ timeout: 10000 });
  await page.waitForLoadState('domcontentloaded');
  // The island's own fetch is bounded at 5s (RadarFeed.astro), so 15s covers
  // it plus page overhead. A timeout here means the island never resolved —
  // which is a real failure, not a reason to raise this number.
  await page
    .locator('.fyi-item, .wire-item, .radar-empty')
    .first()
    .waitFor({ state: 'attached', timeout: 15000 });
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
 * Wait until the category filter has actually taken visual effect.
 *
 * Filtering is driven by `data-active-category` on `.radar-container` plus a
 * CSS rule, NOT by inline styles — so the visual change is decoupled from
 * whatever triggered it. TEST_BEST_PRACTICES.md anti-pattern #23 documents
 * CSS-driven `display` reading stale for several frames, especially in Firefox
 * under CI load, so asserting on `getVisibleItemCount` without this is a flake.
 *
 * Both entry points need it: a click (below) and a `?category=` deep-link,
 * where hydration sets the attribute at DOMContentLoaded but the island's
 * items arrive afterwards.
 */
export async function waitForCategoryFilterApplied(page: Page, category: string): Promise<void> {
  await page.waitForFunction(
    (cat) => {
      const scope = document.querySelector('.radar-container');
      if (!(scope instanceof HTMLElement) || scope.dataset.activeCategory !== cat) return false;

      // Settled when every non-matching item computes to display:none. With no
      // items rendered (CI's empty state) this is vacuously true, which is
      // correct — there is nothing to filter.
      if (cat === 'all') return true;
      return Array.from(document.querySelectorAll('[data-category]')).every((el) =>
        (el as HTMLElement).dataset.category === cat
          ? true
          : window.getComputedStyle(el as HTMLElement).display === 'none'
      );
    },
    category,
    { timeout: 5000 }
  );
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

  await expect(page.locator(`.filter-btn[data-filter="${category}"]`)).toHaveClass(/active/);
  await waitForCategoryFilterApplied(page, category);
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
