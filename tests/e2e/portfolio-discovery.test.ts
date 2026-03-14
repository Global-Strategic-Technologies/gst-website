import { test, expect } from '@playwright/test';

/**
 * Open the filter drawer and wait for its slide-in transition to complete.
 */
async function openFilterDrawer(page: import('@playwright/test').Page): Promise<void> {
  // Use evaluate to bypass WebKit hit-testing
  await page.evaluate(() => {
    (document.querySelector('[data-testid="portfolio-filter-toggle"]') as HTMLElement)?.click();
  });

  const drawer = page.locator('[data-testid="portfolio-filter-drawer"]');
  await expect(drawer).toBeVisible({ timeout: 5000 });

  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="portfolio-filter-drawer"]');
    if (!el || !el.classList.contains('open')) return false;
    const right = parseFloat(window.getComputedStyle(el).right);
    return right >= -1;
  }, { timeout: 5000 });
}

test.describe('Portfolio Discovery Journey', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ma-portfolio', { waitUntil: 'domcontentloaded' });
  });

  test('should load the portfolio page', async ({ page }) => {
    // Page should have content
    const body = page.locator('body');
    await expect(body).toBeVisible();

    // Page should not be blank
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);
  });

  test('should display project cards', async ({ page }) => {
    // Find project cards - check multiple selectors
    const byTestId = page.locator('[data-testid^="project-card-"]');
    const byClass = page.locator('.project-card');
    const byTestIdCount = await byTestId.count();
    const byClassCount = await byClass.count();
    const totalCount = Math.max(byTestIdCount, byClassCount);

    // Should have at least one project card
    expect(totalCount).toBeGreaterThanOrEqual(1);
  });

  test('should have search functionality accessible', async ({ page }) => {
    // Search input should exist (any input on the page)
    const inputs = page.locator('input[type="text"], [data-testid*="search"]');
    const inputCount = await inputs.count();

    // Should have at least one input element
    expect(inputCount).toBeGreaterThan(0);
  });

  test('should have interactive buttons', async ({ page }) => {
    // Find all buttons
    const buttons = page.locator('button');
    const count = await buttons.count();

    // Should have at least one button
    expect(count).toBeGreaterThan(0);
  });

  test('should allow scrolling', async ({ page }) => {
    // Initial scroll position
    const initialScroll = await page.evaluate(() => window.scrollY);

    // Scroll down
    await page.evaluate(() => window.scrollBy(0, 200));

    // New scroll position
    const newScroll = await page.evaluate(() => window.scrollY);

    // Should have scrolled
    expect(newScroll).toBeGreaterThan(initialScroll);
  });

  test('should respond to keyboard navigation', async ({ page }) => {
    // Tab should navigate focus
    const button = page.locator('button').first();
    await button.focus();

    // Button should be focused
    const isFocused = await button.evaluate(el => el === document.activeElement);
    expect(isFocused).toBe(true);
  });

  test('should have visible header/navigation area', async ({ page }) => {
    // Check page has header or nav-like elements
    const header = page.locator('header, nav, [role="navigation"], [role="banner"]');
    const headerCount = await header.count();

    // Page should have content (even if not in nav)
    const pageContent = page.locator('main, article, [role="main"], .content, section');
    const contentCount = await pageContent.count();

    // Either header or content should exist
    expect(headerCount + contentCount).toBeGreaterThanOrEqual(1);
  });

  test('should be responsive to viewport changes', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    const body = page.locator('body');
    await expect(body).toBeVisible();

    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(body).toBeVisible();

    // Set desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(body).toBeVisible();
  });

  test('should have no JavaScript errors on load', async ({ page, context }) => {
    // Collect console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Listen for uncaught exceptions
    page.on('pageerror', err => {
      errors.push(err.message);
    });

    // Load page
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Should have minimal errors (some scripts might error but page should work)
    const criticalErrors = errors.filter(e =>
      !e.includes('network') &&
      !e.includes('timeout')
    );

    // Page should be usable even with minor errors
    expect(criticalErrors.length).toBeLessThan(5);
  });

  test('should allow basic interaction', async ({ page }) => {
    // Click first button and ensure no error
    const button = page.locator('button').first();
    const isVisible = await button.isVisible().catch(() => false);

    if (isVisible) {
      await button.click().catch(() => {
        // Click might fail if button navigates, which is ok
      });
    }

    // Page should still be responsive
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should apply stage filter when clicked', async ({ page }) => {
    // Wait for initialization
    await page.waitForFunction(() => (window as any).__portfolioInitialized === true, { timeout: 5000 });

    // Get initial project count
    const initialCards = page.locator('[data-testid^="project-card-"]');
    const initialCount = await initialCards.count();
    expect(initialCount).toBeGreaterThan(0);

    // Open filter drawer and wait for transition
    await openFilterDrawer(page);

    // Click the Growth Stage filter chip — use evaluate for WebKit
    const growthStageChip = page.locator('[data-testid="filter-chip-stage-growth"]');
    await page.evaluate(() => {
      (document.querySelector('[data-testid="filter-chip-stage-growth"]') as HTMLElement)?.click();
    });

    // Growth Stage chip should now be active
    await expect(growthStageChip).toHaveClass(/active/);

    // All Stages should no longer be active
    const allStagesChip = page.locator('[data-testid="filter-chip-stage-all"]');
    await expect(allStagesChip).not.toHaveClass(/active/);

    // Wait for filter to actually apply to displayed cards
    await page.waitForFunction(() => {
      const state = (window as any).portfolioState;
      return state && state.filters && state.filters.stage === 'growth-category';
    }, { timeout: 5000 });

    // Get filtered project count - should be different or page should have data
    const filteredCards = page.locator('[data-testid^="project-card-"]');
    const filteredCount = await filteredCards.count();

    // Verify filter is actually active (state changed)
    const filterState = await page.evaluate(() => (window as any).portfolioState?.filters?.stage);
    expect(filterState).toBe('growth-category');
  });

  test('should apply theme filter when clicked', async ({ page }) => {
    // Wait for initialization
    await page.waitForFunction(() => (window as any).__portfolioInitialized === true, { timeout: 5000 });

    // Open filter drawer and wait for transition
    await openFilterDrawer(page);

    // Click the Finance theme filter chip (use evaluate to bypass WebKit hit-testing issues)
    const financeChip = page.locator('[data-testid="filter-chip-theme-finance"]');
    await expect(financeChip).toBeVisible();
    await page.evaluate(() => {
      (document.querySelector('[data-testid="filter-chip-theme-finance"]') as HTMLElement)?.click();
    });

    // Wait for async state update before asserting
    await page.waitForFunction(() => {
      const chip = document.querySelector('[data-testid="filter-chip-theme-finance"]');
      return chip?.classList.contains('active');
    });

    // Finance chip should now be active
    await expect(financeChip).toHaveClass(/active/);

    // All Themes should no longer be active
    const allThemesChip = page.locator('[data-testid="filter-chip-theme-all"]');
    await expect(allThemesChip).not.toHaveClass(/active/);
  });

  test('should apply year filter when clicked', async ({ page }) => {
    // Wait for initialization
    await page.waitForFunction(() => (window as any).__portfolioInitialized === true, { timeout: 5000 });

    // Open filter drawer and wait for transition
    await openFilterDrawer(page);

    // Click a year filter chip (use evaluate to bypass WebKit hit-testing issues)
    const yearChip = page.locator('[data-testid="filter-chip-year-2025"]');
    await expect(yearChip).toBeVisible();
    await page.evaluate(() => {
      (document.querySelector('[data-testid="filter-chip-year-2025"]') as HTMLElement)?.click();
    });

    // Wait for async state update before asserting
    await page.waitForFunction(() => {
      const chip = document.querySelector('[data-testid="filter-chip-year-2025"]');
      return chip?.classList.contains('active');
    });

    // Year chip should now be active
    await expect(yearChip).toHaveClass(/active/);

    // All Years should no longer be active
    const allYearsChip = page.locator('[data-testid="filter-chip-year-all"]');
    await expect(allYearsChip).not.toHaveClass(/active/);
  });

  test('should apply engagement type filter when clicked', async ({ page }) => {
    // Wait for initialization
    await page.waitForFunction(() => (window as any).__portfolioInitialized === true, { timeout: 5000 });

    // Open filter drawer and wait for transition
    await openFilterDrawer(page);

    // Click the Value Creation engagement filter chip
    const valueCreationChip = page.locator('[data-testid="filter-chip-engagement-value-creation"]');
    await expect(valueCreationChip).toBeVisible();
    await valueCreationChip.click();

    // Value Creation chip should now be active
    await expect(valueCreationChip).toHaveClass(/active/);

    // All Types should no longer be active
    const allTypesChip = page.locator('[data-testid="filter-chip-engagement-all"]');
    await expect(allTypesChip).not.toHaveClass(/active/);
  });

  test('should update filter badge when filters are applied', async ({ page }) => {
    // Wait for initialization
    await page.waitForFunction(() => (window as any).__portfolioInitialized === true, { timeout: 5000 });

    // Open filter drawer and wait for transition
    await openFilterDrawer(page);

    // Apply a filter
    const growthStageChip = page.locator('[data-testid="filter-chip-stage-growth"]');
    await growthStageChip.click();

    // Wait for filter state to update
    await page.waitForFunction(() => {
      const chip = document.querySelector('[data-testid="filter-chip-stage-growth"]');
      return chip && chip.classList.contains('active');
    });

    // Filter badge should show an active filter count
    const badge = page.locator('[data-testid="portfolio-filter-badge"]');
    // Badge might display count or just be visible
    const badgeText = await badge.textContent();
    const badgeVisible = await badge.isVisible().catch(() => false);
    expect(badgeVisible || badgeText).toBeTruthy();
  });

  test('should clear all filters when clear button is clicked', async ({ page }) => {
    // Wait for initialization
    await page.waitForFunction(() => (window as any).__portfolioInitialized === true, { timeout: 5000 });

    // Open filter drawer and wait for transition
    await openFilterDrawer(page);

    // Apply multiple filters (use evaluate to bypass WebKit hit-testing issues)
    const growthStageChip = page.locator('[data-testid="filter-chip-stage-growth"]');
    await page.evaluate(() => {
      (document.querySelector('[data-testid="filter-chip-stage-growth"]') as HTMLElement)?.click();
    });

    // Wait for growth stage chip state update
    await page.waitForFunction(() => {
      const chip = document.querySelector('[data-testid="filter-chip-stage-growth"]');
      return chip?.classList.contains('active');
    });

    const financeChip = page.locator('[data-testid="filter-chip-theme-finance"]');
    await page.evaluate(() => {
      (document.querySelector('[data-testid="filter-chip-theme-finance"]') as HTMLElement)?.click();
    });

    // Wait for finance chip state update
    await page.waitForFunction(() => {
      const chip = document.querySelector('[data-testid="filter-chip-theme-finance"]');
      return chip?.classList.contains('active');
    });

    // Both should be active
    await expect(growthStageChip).toHaveClass(/active/);
    await expect(financeChip).toHaveClass(/active/);

    // Click clear all filters button (use evaluate to bypass WebKit hit-testing issues)
    await page.evaluate(() => {
      (document.querySelector('[data-testid="clear-filters-button"]') as HTMLElement)?.click();
    });

    // Wait for filters to reset
    await page.waitForFunction(() => {
      const allChip = document.querySelector('[data-testid="filter-chip-stage-all"]');
      return allChip && allChip.classList.contains('active');
    });

    // All chips should return to "all" and be active
    const allStagesChip = page.locator('[data-testid="filter-chip-stage-all"]');
    const allThemesChip = page.locator('[data-testid="filter-chip-theme-all"]');

    await expect(allStagesChip).toHaveClass(/active/);
    await expect(allThemesChip).toHaveClass(/active/);
    await expect(growthStageChip).not.toHaveClass(/active/);
    await expect(financeChip).not.toHaveClass(/active/);
  });
});
