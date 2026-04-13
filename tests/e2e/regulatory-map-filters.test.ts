import { test, expect } from '@playwright/test';
import { clickSvgPath, waitForMapReady } from './helpers/regulatory-map';

test.describe('Regulatory Map — Category Filters', () => {
  test.beforeEach(async ({ page }) => {
    // domcontentloaded is reliable under parallel worker contention; networkidle
    // can time out when many workers share the same dev server.
    await page.goto('/hub/tools/regulatory-map', { waitUntil: 'domcontentloaded' });
    await waitForMapReady(page);
  });

  test('should have "All" filter active by default', async ({ page }) => {
    const allChip = page.locator('.brutal-filter-chip[data-category="all"]');
    await expect(allChip).toHaveClass(/brutal-filter-chip--active/);

    // Other chips should NOT be active
    const otherChips = page.locator('.brutal-filter-chip:not([data-category="all"])');
    for (const chip of await otherChips.all()) {
      await expect(chip).not.toHaveClass(/brutal-filter-chip--active/);
    }
  });

  test('should switch active filter when clicking a category chip', async ({ page }) => {
    const aiChip = page.locator('.brutal-filter-chip[data-category="ai-governance"]');
    const allChip = page.locator('.brutal-filter-chip[data-category="all"]');

    await page.evaluate(() =>
      (
        document.querySelector('.brutal-filter-chip[data-category="ai-governance"]') as HTMLElement
      )?.click()
    );

    // AI chip should now be active
    await expect(aiChip).toHaveClass(/brutal-filter-chip--active/);
    // "All" chip should be deactivated
    await expect(allChip).not.toHaveClass(/brutal-filter-chip--active/);
  });

  test('should update map highlighting when switching filters', async ({ page }) => {
    // Get initial count of highlighted countries with "All" filter
    const initialActiveCount = await page.locator('.country-path--active').count();
    expect(initialActiveCount).toBeGreaterThan(0);

    // Switch to AI Governance (fewer regulations than All)
    await page.evaluate(() =>
      (
        document.querySelector('.brutal-filter-chip[data-category="ai-governance"]') as HTMLElement
      )?.click()
    );

    // Wait for map to update — active count should change
    await page.waitForFunction((initialCount) => {
      return document.querySelectorAll('.country-path--active').length !== initialCount;
    }, initialActiveCount);

    const aiActiveCount = await page.locator('.country-path--active').count();
    // AI governance has fewer regulations than "All", so fewer highlighted countries
    expect(aiActiveCount).toBeLessThan(initialActiveCount);
    expect(aiActiveCount).toBeGreaterThan(0);
  });

  test('should restore all highlights when switching back to "All"', async ({ page }) => {
    // Get initial count
    const initialActiveCount = await page.locator('.country-path--active').count();

    // Switch away
    await page.evaluate(() =>
      (
        document.querySelector('.brutal-filter-chip[data-category="ai-governance"]') as HTMLElement
      )?.click()
    );
    await page.waitForFunction((initial) => {
      return document.querySelectorAll('.country-path--active').length !== initial;
    }, initialActiveCount);

    // Switch back to All
    await page.evaluate(() =>
      (document.querySelector('.brutal-filter-chip[data-category="all"]') as HTMLElement)?.click()
    );
    await page.waitForFunction((initial) => {
      return document.querySelectorAll('.country-path--active').length === initial;
    }, initialActiveCount);

    const restoredCount = await page.locator('.country-path--active').count();
    expect(restoredCount).toBe(initialActiveCount);
  });

  test('should deselect region when filter removes its regulations', async ({ page }) => {
    // Select Thailand (has data-privacy + cybersecurity, but NOT industry-compliance)
    await clickSvgPath(page, '[data-alpha3="THA"].country-path--active');

    const panel = page.locator('[data-testid="compliance-panel"]');
    await expect(panel).toBeVisible();
    await expect(page.locator('#panelCountryName')).toHaveText('Thailand');

    // Verify Thailand has regulation cards
    await page.waitForFunction(() => {
      return document.querySelectorAll('.brutal-reg-card').length > 0;
    });

    // Switch to Industry Compliance — Thailand has no industry-compliance regs
    await page.evaluate(() =>
      (
        document.querySelector(
          '.brutal-filter-chip[data-category="industry-compliance"]'
        ) as HTMLElement
      )?.click()
    );

    // Panel should be hidden because Thailand has no industry compliance regulations
    await expect(panel).toBeHidden();

    // Selected path highlight should be cleared
    const selectedPaths = await page.locator('.country-path--selected').count();
    expect(selectedPaths).toBe(0);
  });

  test('should keep region selected when filter still has its regulations', async ({ page }) => {
    // Select Germany (has both data-privacy GDPR and ai-governance EU AI Act)
    await clickSvgPath(page, '[data-alpha3="DEU"].country-path--active');

    const panel = page.locator('[data-testid="compliance-panel"]');
    await expect(panel).toBeVisible();
    await expect(page.locator('#panelCountryName')).toHaveText('Germany');

    // Switch to Data Privacy — Germany still has GDPR
    await page.evaluate(() =>
      (
        document.querySelector('.brutal-filter-chip[data-category="data-privacy"]') as HTMLElement
      )?.click()
    );

    // Panel should still be visible with Germany
    await expect(panel).toBeVisible();
    await expect(page.locator('#panelCountryName')).toHaveText('Germany');

    // Should still have regulation cards
    const cardCount = await page.locator('.brutal-reg-card').count();
    expect(cardCount).toBeGreaterThan(0);
  });

  test('should update panel regulation count when filter changes for selected region', async ({
    page,
  }) => {
    // Select Germany (has regulations in multiple categories)
    await clickSvgPath(page, '[data-alpha3="DEU"].country-path--active');

    await page.waitForFunction(() => {
      const el = document.getElementById('panelRegCount');
      return el && el.textContent && el.textContent.includes('regulation');
    });

    // Get card count with "All" filter
    const allCount = await page.locator('.brutal-reg-card').count();
    expect(allCount).toBeGreaterThan(0);

    // Switch to Data Privacy
    await page.evaluate(() =>
      (
        document.querySelector('.brutal-filter-chip[data-category="data-privacy"]') as HTMLElement
      )?.click()
    );

    // Wait for panel to re-render with filtered results
    await page.waitForFunction((prevCount) => {
      return document.querySelectorAll('.brutal-reg-card').length !== prevCount;
    }, allCount);

    // Data Privacy subset should have fewer cards than "All"
    const privacyCount = await page.locator('.brutal-reg-card').count();
    expect(privacyCount).toBeGreaterThan(0);
    expect(privacyCount).toBeLessThanOrEqual(allCount);
  });
});
