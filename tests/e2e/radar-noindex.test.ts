/**
 * /hub/radar/ — indexability.
 *
 * The Radar is `noindex` by classification, not by accident: its feed is
 * replaced wholly every 6h and carries no per-item permalinks, so the URL is
 * a rotating window rather than a document an index can hold. See ADR-0012.
 *
 * That classification is what licenses the `server:defer` island on this page
 * — deferring primary content costs indexability only where indexability is
 * wanted. The two facts are asserted together in
 * `radar-page.test.ts` ("Crawler payload") so they cannot drift apart; this
 * file covers the served-tag half in isolation, matching the idiom in
 * `booking-confirmed.test.ts`.
 *
 * The unit test in `tests/unit/indexability.test.ts` can only see the prop in
 * source and the prefix in `sitemap-filter.ts`. Only this can prove the tag is
 * actually SERVED.
 */
import { test, expect } from '@playwright/test';

test.describe('Radar page indexability', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/hub/radar/', { waitUntil: 'domcontentloaded' });
  });

  test('should be excluded from the search index', async ({ page }) => {
    // `follow` is deliberate: the page leaves the index while its outbound
    // links — every item in the feed points at a third-party source — still
    // pass equity.
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
  });

  test('should still render its shell content', async ({ page }) => {
    // Guards the other direction: a page that 404s or renders blank would also
    // "not be indexed", and the assertion above alone cannot tell the
    // difference. Asserts on the SHELL (header + filter pills), not the feed —
    // the feed is islanded and CI binds no MCP_KEY_WEBSITE_RADAR, so items
    // never render here. Feed behaviour is covered in radar-page.test.ts.
    await expect(page.locator('.hub-header')).toBeVisible();
    await expect(page.locator('.filter-btn[data-filter="all"]')).toBeVisible();
  });
});
