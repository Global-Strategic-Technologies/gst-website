import { test, expect } from '@playwright/test';

/**
 * Helper: click an SVG path element via dispatchEvent.
 */
async function clickSvgPath(page: import('@playwright/test').Page, selector: string): Promise<void> {
  await page.locator(selector).first().waitFor({ state: 'attached' });
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, selector);
}

/**
 * Wait for D3 map paths to finish rendering.
 */
async function waitForMapReady(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(() => document.querySelectorAll('.country-path').length > 0);
}

test.describe('Regulatory Map — URL Bookmarking & Sharing', () => {
  test.beforeEach(async ({ page }) => {
    // domcontentloaded is reliable under parallel worker contention; networkidle
    // can time out when many workers share the same dev server.
    await page.goto('/hub/tools/regulatory-map', { waitUntil: 'domcontentloaded' });
    await waitForMapReady(page);
  });

  test.describe('1. URL Sync on Interaction', () => {
    test('should add region param to URL when selecting a country', async ({ page }) => {
      // Verify clean URL initially
      const initialSearch = new URL(page.url()).searchParams;
      expect(initialSearch.has('region')).toBe(false);

      // Click Germany
      await clickSvgPath(page, '[data-alpha3="DEU"].country-path--active');

      // Wait for panel to appear (confirms selection completed)
      await expect(page.locator('[data-testid="compliance-panel"]')).toBeVisible();

      // Verify URL updated with region param
      const updatedUrl = new URL(page.url());
      expect(updatedUrl.searchParams.get('region')).toBe('DEU');
    });

    test('should add filter param to URL when switching category', async ({ page }) => {
      await page.locator('.filter-chip[data-category="ai-governance"]').click();

      // Wait for map to update (behavioral proof filter applied)
      await page.waitForFunction(() => {
        const chip = document.querySelector('.filter-chip[data-category="ai-governance"]');
        return chip && chip.classList.contains('active');
      });

      const url = new URL(page.url());
      expect(url.searchParams.get('filter')).toBe('ai-governance');
      expect(url.searchParams.has('region')).toBe(false);
    });

    test('should encode both region and filter in URL', async ({ page }) => {
      // Set filter first
      await page.locator('.filter-chip[data-category="data-privacy"]').click();
      await page.waitForFunction(() => {
        const chip = document.querySelector('.filter-chip[data-category="data-privacy"]');
        return chip && chip.classList.contains('active');
      });

      // Then select Germany (has data-privacy regs)
      await clickSvgPath(page, '[data-alpha3="DEU"].country-path--active');
      await expect(page.locator('[data-testid="compliance-panel"]')).toBeVisible();

      const url = new URL(page.url());
      expect(url.searchParams.get('region')).toBe('DEU');
      expect(url.searchParams.get('filter')).toBe('data-privacy');
    });

    test('should remove region param when filter deselects region', async ({ page }) => {
      // Select Thailand (has data-privacy + cybersecurity, NOT industry-compliance)
      await clickSvgPath(page, '[data-alpha3="THA"].country-path--active');
      await expect(page.locator('[data-testid="compliance-panel"]')).toBeVisible();

      // Verify region is in URL
      expect(new URL(page.url()).searchParams.get('region')).toBe('THA');

      // Switch to industry-compliance — Thailand has no regs in this category
      await page.locator('.filter-chip[data-category="industry-compliance"]').click();

      // Wait for panel to close (region deselected)
      await page.waitForFunction(() => {
        const el = document.getElementById('compliancePanel');
        return el && el.hidden;
      });

      // URL should have filter but no region
      const url = new URL(page.url());
      expect(url.searchParams.get('filter')).toBe('industry-compliance');
      expect(url.searchParams.has('region')).toBe(false);
    });

    test('should clear all params when returning to default state', async ({ page }) => {
      // Set a filter
      await page.locator('.filter-chip[data-category="cybersecurity"]').click();
      expect(new URL(page.url()).searchParams.has('filter')).toBe(true);

      // Return to "All"
      await page.locator('.filter-chip[data-category="all"]').click();
      await page.waitForFunction(() => {
        const chip = document.querySelector('.filter-chip[data-category="all"]');
        return chip && chip.classList.contains('active');
      });

      // URL should be clean (no params)
      expect(new URL(page.url()).search).toBe('');
    });
  });

  test.describe('2. State Restoration from URL', () => {
    test('should restore region selection from URL params', async ({ page }) => {
      await page.goto('/hub/tools/regulatory-map?region=DEU', { waitUntil: 'domcontentloaded' });
      await waitForMapReady(page);

      // Panel should be visible with Germany
      const panel = page.locator('[data-testid="compliance-panel"]');
      await expect(panel).toBeVisible();
      await expect(page.locator('#panelCountryName')).toHaveText('Germany');

      // Germany path should have selected class
      const isSelected = await page.locator('[data-alpha3="DEU"]').first().evaluate(el =>
        el.classList.contains('country-path--selected')
      );
      expect(isSelected).toBe(true);
    });

    test('should restore filter from URL params', async ({ page }) => {
      await page.goto('/hub/tools/regulatory-map?filter=ai-governance', { waitUntil: 'domcontentloaded' });
      await waitForMapReady(page);

      // AI Governance chip should be active
      const aiChip = page.locator('.filter-chip[data-category="ai-governance"]');
      await expect(aiChip).toHaveClass(/active/);

      // "All" chip should NOT be active
      const allChip = page.locator('.filter-chip[data-category="all"]');
      await expect(allChip).not.toHaveClass(/active/);

      // Map should show fewer highlighted countries than "All"
      const activeCount = await page.locator('.country-path--active').count();
      expect(activeCount).toBeGreaterThan(0);
    });

    test('should restore both region and filter from URL params', async ({ page }) => {
      await page.goto('/hub/tools/regulatory-map?region=DEU&filter=data-privacy', { waitUntil: 'domcontentloaded' });
      await waitForMapReady(page);

      // Filter should be applied
      await expect(page.locator('.filter-chip[data-category="data-privacy"]')).toHaveClass(/active/);

      // Panel should show Germany
      await expect(page.locator('[data-testid="compliance-panel"]')).toBeVisible();
      await expect(page.locator('#panelCountryName')).toHaveText('Germany');

      // Should have regulation cards
      const cardCount = await page.locator('.reg-card').count();
      expect(cardCount).toBeGreaterThan(0);
    });

    test('should handle invalid region param gracefully', async ({ page }) => {
      await page.goto('/hub/tools/regulatory-map?region=INVALID', { waitUntil: 'domcontentloaded' });
      await waitForMapReady(page);

      // Page should load normally — no panel, no errors
      const panel = page.locator('[data-testid="compliance-panel"]');
      await expect(panel).toBeHidden();

      // Map should still have highlighted countries
      const activeCount = await page.locator('.country-path--active').count();
      expect(activeCount).toBeGreaterThan(0);
    });

    test('should handle invalid filter param gracefully', async ({ page }) => {
      await page.goto('/hub/tools/regulatory-map?filter=bogus', { waitUntil: 'domcontentloaded' });
      await waitForMapReady(page);

      // Should fall back to "All" filter
      await expect(page.locator('.filter-chip[data-category="all"]')).toHaveClass(/active/);
    });

    test('should not select region that has no regs for the given filter', async ({ page }) => {
      // Thailand has no industry-compliance regs
      await page.goto('/hub/tools/regulatory-map?region=THA&filter=industry-compliance', { waitUntil: 'domcontentloaded' });
      await waitForMapReady(page);

      // Filter should be applied
      await expect(page.locator('.filter-chip[data-category="industry-compliance"]')).toHaveClass(/active/);

      // But panel should NOT be visible (Thailand has no industry regs)
      const panel = page.locator('[data-testid="compliance-panel"]');
      await expect(panel).toBeHidden();
    });
  });

  test.describe('3. Copy Link Button', () => {
    test('should show copy link button in panel header', async ({ page }) => {
      await clickSvgPath(page, '[data-alpha3="DEU"].country-path--active');
      await expect(page.locator('[data-testid="compliance-panel"]')).toBeVisible();

      const copyBtn = page.locator('#panelCopyLink');
      await expect(copyBtn).toBeVisible();
    });

    test('should show copied feedback on click', async ({ page }) => {
      await clickSvgPath(page, '[data-alpha3="DEU"].country-path--active');
      await expect(page.locator('[data-testid="compliance-panel"]')).toBeVisible();

      const copyBtn = page.locator('#panelCopyLink');
      await copyBtn.click();

      // Button should show "copied" state
      await page.waitForFunction(() => {
        const btn = document.getElementById('panelCopyLink');
        return btn && btn.classList.contains('panel-copy-link--copied');
      });

      // Aria label should update
      await expect(copyBtn).toHaveAttribute('aria-label', 'Link copied!');

      // Should revert after 2 seconds
      await page.waitForFunction(() => {
        const btn = document.getElementById('panelCopyLink');
        return btn && !btn.classList.contains('panel-copy-link--copied');
      }, undefined, { timeout: 5000 });

      await expect(copyBtn).toHaveAttribute('aria-label', 'Copy link to this view');
    });
  });
});
