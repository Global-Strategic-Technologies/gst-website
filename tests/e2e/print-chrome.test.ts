import { test, expect, type Page } from '@playwright/test';
import { waitForMapReady } from './helpers/regulatory-map';

/**
 * Print chrome and script-built messages that used to be styled by SCOPED
 * rules which never applied (2026-09-26 debt audit, C1/C2).
 *
 * The breadcrumb (BaseLayout), the HubHeader and its subtitle, and the
 * regulatory map's controls (MapVisualizer) are rendered by OTHER components,
 * so a page's scoped `.breadcrumb { display: none }` compiled to the page's cid
 * and matched nothing — the chrome printed on every report. The rules are now
 * `:global()`; `tests/unit/scoped-selector-foreign-element.test.ts` guards the
 * shape statically, and this file proves the computed result in a browser
 * (STYLES_GUIDE: "prove it with a rendered measurement, not a reading").
 *
 * Every hidden-in-print assertion is preceded by a visible-on-screen one for
 * the same element, so an element that is simply absent (or already hidden)
 * cannot make the print assertion pass vacuously.
 */

/** Assert each selector is visible on screen, then hidden once print media is emulated. */
async function expectHiddenOnlyInPrint(page: Page, selectors: string[]): Promise<void> {
  for (const sel of selectors) {
    await expect(page.locator(sel).first(), `${sel} should be visible on screen`).toBeVisible();
  }
  await page.emulateMedia({ media: 'print' });
  for (const sel of selectors) {
    await expect(page.locator(sel).first(), `${sel} should be hidden in print`).toBeHidden();
  }
}

test.describe('Print chrome on Hub tool reports', () => {
  test('tech-debt-calculator hides the breadcrumb and the hub header in print', async ({
    page,
  }) => {
    await page.goto('/hub/tools/tech-debt-calculator/', { waitUntil: 'domcontentloaded' });
    await expectHiddenOnlyInPrint(page, ['.breadcrumb', '.hub-header']);
  });

  test('techpar hides the breadcrumb and the hub-header subtitle in print, keeping the title', async ({
    page,
  }) => {
    await page.goto('/hub/tools/techpar/', { waitUntil: 'domcontentloaded' });
    await expectHiddenOnlyInPrint(page, ['.breadcrumb', '.hub-header__subtitle']);
    // Only the subtitle is chrome here; the page title still prints.
    await expect(page.locator('.hub-header h1')).toBeVisible();
  });

  test('regulatory-map hides the breadcrumb and the map controls in print, keeping the title', async ({
    page,
  }) => {
    await page.goto('/hub/tools/regulatory-map/', { waitUntil: 'domcontentloaded' });
    await waitForMapReady(page);
    await expectHiddenOnlyInPrint(page, ['.breadcrumb', '.map-controls']);
    // The regulatory map deliberately keeps its HubHeader in print.
    await expect(page.locator('.hub-header h1')).toBeVisible();
  });
});

test.describe('Portfolio no-results message', () => {
  test('a search that matches nothing shows a centred message', async ({ page }) => {
    await page.goto('/ma-portfolio/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => (window as any).__portfolioInitialized === true, {
      timeout: 5000,
    });

    await page.locator('#search-input-fixed').fill('zzzz-no-project-matches-this-zzzz');

    // Built by the search script (debounced), so it carries no scoped cid; its
    // rule now lives in src/styles/components/portfolio.css.
    const message = page.locator('.no-results-message');
    await expect(message).toBeVisible();
    await expect(message).toHaveCSS('text-align', 'center');
  });
});
