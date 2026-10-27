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

test.describe('Printing from a dark theme', () => {
  // Paper has no dark theme: with the dark tokens, report text printed near-white
  // on the white page (src/scripts/print-theme.ts). Playwright's print emulation
  // fires no print events, so the test dispatches them as the browser does.
  const luminance = (rgb: string): number => {
    const [r, g, b] = rgb
      .match(/\d+(\.\d+)?/g)!
      .slice(0, 3)
      .map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };

  test('a Diligence Machine agenda prints in readable ink, and the theme comes back', async ({
    page,
  }) => {
    // Monolith (palette 1): its dark-theme primary, the question ink, is pure white.
    await page.addInitScript(() => {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, '0');
      const today = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      localStorage.setItem('theme', 'dark');
      localStorage.setItem('theme-date', today);
      localStorage.setItem('palette', '1');
      localStorage.setItem('palette-date', today);
    });
    await page.goto(
      '/hub/tools/diligence-machine/?tt=carve-out&pt=b2b-saas&ta=hybrid-legacy&hc=51-200' +
        '&rr=25-100m&gs=mature&ca=5-10yr&ge=us&bm=services-led&si=high&ts=stable&ds=high&om=hybrid',
      { waitUntil: 'load' }
    );
    await expect(
      page.locator('[data-testid="wizard-container"][data-restored="true"]')
    ).toBeVisible();
    await page.locator('[data-testid="btn-generate"]').click();
    const question = page.locator('.doc-q-text').first();
    await expect(question).toBeVisible();
    await expect(page.locator('html')).toHaveClass(/dark-theme/);
    // On screen, the dark theme's question ink is near-white.
    const ink = () => question.evaluate((el) => getComputedStyle(el).color);
    expect(luminance(await ink())).toBeGreaterThan(0.85);

    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await page.emulateMedia({ media: 'print' });
    // On paper it is the light theme's ink (Monolith grey), not white on white.
    expect(luminance(await ink())).toBeLessThan(0.7);

    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await page.emulateMedia({ media: 'screen' });
    await expect(page.locator('html')).toHaveClass(/dark-theme/);
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
