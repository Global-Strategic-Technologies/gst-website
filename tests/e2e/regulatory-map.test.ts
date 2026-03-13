import { test, expect } from '@playwright/test';

/**
 * Helper: click an SVG path element via dispatchEvent.
 * SVG paths inside a D3-managed <svg> intercept pointer events at the SVG level,
 * so Playwright's click() fails with "element intercepts pointer events".
 * We dispatch a native click event directly on the path element instead.
 */
async function clickSvgPath(page: import('@playwright/test').Page, selector: string): Promise<void> {
  await page.locator(selector).first().waitFor({ state: 'attached' });
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, selector);
}

test.describe('Regulatory Map E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/hub/tools/regulatory-map', { waitUntil: 'domcontentloaded' });
    // Wait for D3 to finish rendering paths
    await page.waitForFunction(() => document.querySelectorAll('.country-path').length > 0);
  });

  test.describe('1. Page Load & Initial State', () => {
    test('should load the page with map container visible', async ({ page }) => {
      await expect(page.locator('[data-testid="map-container"]')).toBeVisible();
      await expect(page.locator('#mapSvg')).toBeVisible();
    });

    test('should have compliance panel hidden initially', async ({ page }) => {
      const panel = page.locator('[data-testid="compliance-panel"]');
      await expect(panel).toBeHidden();
    });

    test('should display the CTA prompt', async ({ page }) => {
      const cta = page.locator('#mapCta');
      await expect(cta).toBeVisible();
      await expect(cta).toContainText('Select a highlighted region');
    });

    test('should display zoom controls', async ({ page }) => {
      await expect(page.locator('#zoomIn')).toBeVisible();
      await expect(page.locator('#zoomOut')).toBeVisible();
      await expect(page.locator('#zoomReset')).toBeVisible();
    });

    test('should display map legend', async ({ page }) => {
      const legend = page.locator('.map-legend');
      await expect(legend).toBeVisible();
      await expect(legend).toContainText('Regulation coverage');
      await expect(legend).toContainText('No data');
    });

    test('should have Back to The Workbench link', async ({ page }) => {
      const backLink = page.locator('a.back-link');
      await expect(backLink).toBeVisible();
      await expect(backLink).toContainText('Back to The Workbench');
      expect(await backLink.getAttribute('href')).toBe('/hub/tools');
    });

    test('should render highlighted countries with regulation data', async ({ page }) => {
      const activeCountries = page.locator('.country-path--active');
      const count = await activeCountries.count();
      expect(count).toBeGreaterThan(0);
    });
  });

  test.describe('2. Map Interaction — Country Selection', () => {
    test('should show compliance panel when clicking a highlighted country', async ({ page }) => {
      // Use Brazil (BRA) — large, easily identifiable country with LGPD
      await clickSvgPath(page, '[data-alpha3="BRA"].country-path--active');

      // Wait for panel to become visible (behavioral verification)
      const panel = page.locator('[data-testid="compliance-panel"]');
      await expect(panel).toBeVisible();

      // Verify panel has actual content, not just visibility
      const countryName = page.locator('#panelCountryName');
      await expect(countryName).toHaveText('Brazil');
    });

    test('should display regulation count and cards in panel', async ({ page }) => {
      await clickSvgPath(page, '[data-alpha3="BRA"].country-path--active');

      // Wait for panel content to render
      await page.waitForFunction(() => {
        const el = document.getElementById('panelRegCount');
        return el && el.textContent && el.textContent.includes('regulation');
      });

      const regCount = page.locator('#panelRegCount');
      await expect(regCount).toContainText('regulation');

      // Verify regulation cards rendered with actual content
      const cards = page.locator('.reg-card');
      const cardCount = await cards.count();
      expect(cardCount).toBeGreaterThan(0);

      const firstName = await cards.first().locator('.reg-card__name').textContent();
      expect(firstName).toBeTruthy();
      expect(firstName!.length).toBeGreaterThan(0);
    });

    test('should hide CTA prompt after selection', async ({ page }) => {
      // Verify CTA is visible before
      const cta = page.locator('#mapCta');
      await expect(cta).toBeVisible();

      await clickSvgPath(page, '[data-alpha3="BRA"].country-path--active');

      // CTA should be removed from DOM
      await page.waitForFunction(() => !document.getElementById('mapCta'));
      await expect(cta).toBeHidden();
    });

    test('should update panel when clicking a different country', async ({ page }) => {
      // Click Brazil first
      await clickSvgPath(page, '[data-alpha3="BRA"].country-path--active');
      await page.waitForFunction(() => {
        return document.getElementById('panelCountryName')?.textContent === 'Brazil';
      });

      // Click Germany (DEU) — GDPR
      await clickSvgPath(page, '[data-alpha3="DEU"].country-path--active');
      await page.waitForFunction(() => {
        return document.getElementById('panelCountryName')?.textContent === 'Germany';
      });

      const name = await page.locator('#panelCountryName').textContent();
      expect(name).toBe('Germany');
    });
  });

  test.describe('3. Map Interaction — US State Selection', () => {
    test('should show state-level regulation when clicking a highlighted US state', async ({ page }) => {
      // Use Texas (US-TX) — large state with TDPSA
      const texasSelector = '[data-state-code="US-TX"].state-path--active';
      const texasExists = await page.locator(texasSelector).count();

      if (texasExists > 0) {
        await clickSvgPath(page, texasSelector);

        const panel = page.locator('[data-testid="compliance-panel"]');
        await expect(panel).toBeVisible();

        // Wait for panel content
        await page.waitForFunction(() => {
          const el = document.getElementById('panelCountryName');
          return el && el.textContent && el.textContent.length > 0;
        });

        const name = await page.locator('#panelCountryName').textContent();
        expect(name).toBe('Texas');
      }
    });
  });

  test.describe('4. Zoom Controls', () => {
    test('should zoom in when clicking zoom in button', async ({ page }) => {
      const g = page.locator('#mapSvg g').first();
      const transformBefore = await g.getAttribute('transform');

      await page.locator('#zoomIn').click();

      // Wait for D3 transition to complete and transform to change
      await page.waitForFunction((before) => {
        const g = document.querySelector('#mapSvg g');
        return g && g.getAttribute('transform') !== before;
      }, transformBefore);

      const transformAfter = await g.getAttribute('transform');
      expect(transformAfter).not.toBe(transformBefore);
    });

    test('should reset zoom when clicking reset button', async ({ page }) => {
      // Zoom in first
      await page.locator('#zoomIn').click();
      await page.waitForFunction(() => {
        const g = document.querySelector('#mapSvg g');
        return g && g.getAttribute('transform') !== null;
      });

      // Reset
      await page.locator('#zoomReset').click();

      // Wait for reset transition — transform should become identity
      await page.waitForFunction(() => {
        const g = document.querySelector('#mapSvg g');
        const t = g?.getAttribute('transform') ?? '';
        return t === '' || t.includes('scale(1');
      });

      const transform = await page.locator('#mapSvg g').first().getAttribute('transform');
      expect(transform === null || transform === '' || transform.includes('scale(1')).toBeTruthy();
    });
  });

  test.describe('5. Navigation', () => {
    test('should navigate back to The Workbench', async ({ page }) => {
      await page.locator('a.back-link').click();
      await page.waitForURL('**/hub/tools');
      await expect(page).toHaveURL(/\/hub\/tools$/);
    });

    test('should have Regulatory Map card on Workbench page', async ({ page }) => {
      await page.goto('/hub/tools', { waitUntil: 'domcontentloaded' });
      const regMapLink = page.locator('a[href="/hub/tools/regulatory-map"]');
      await expect(regMapLink).toBeVisible();
    });
  });
});
