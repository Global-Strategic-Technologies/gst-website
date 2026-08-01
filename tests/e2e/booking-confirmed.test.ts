/**
 * /booking-confirmed/ — indexability.
 *
 * This is the one URL whose sitemap status actually changed in the
 * indexability work: `sitemap-0.xml` went from 20 entries to 19 when this
 * page was excluded. `/brand` and `/colors` were already excluded, and
 * `@astrojs/sitemap` drops `/404` and `/500` itself before any user filter
 * runs — so this page is the only one where the pairing is load-bearing
 * rather than belt-and-braces.
 *
 * It is also a post-conversion page with no search intent it could satisfy,
 * which is why it is `noindex` rather than merely unlinked.
 */
import { test, expect } from '@playwright/test';

test.describe('Booking Confirmed page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/booking-confirmed/', { waitUntil: 'domcontentloaded' });
  });

  test('should be excluded from the search index', async ({ page }) => {
    // `follow` is deliberate: the page leaves the index while its outbound
    // links still pass equity. Asserts the tag is SERVED — the unit test can
    // only see the prop in source, not what the layout ultimately renders.
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
  });

  test('should still render its confirmation content', async ({ page }) => {
    // Guards the other direction: a page that 404s or renders blank would
    // also "not be indexed", and the assertion above alone cannot tell the
    // difference.
    await expect(page.locator('h1')).toHaveText(/Booking Confirmed/i);
  });
});
