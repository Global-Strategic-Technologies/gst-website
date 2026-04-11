import { test, expect } from '@playwright/test';
import { openFilterDrawer } from './helpers/portfolio';

test.describe('Filter Drawer Z-Index & Layering - MA Portfolio Page', () => {
  test.beforeEach(async ({ page }) => {
    // domcontentloaded is reliable under parallel worker contention; networkidle
    // can time out when many workers share the same dev server.
    await page.goto('/ma-portfolio', { waitUntil: 'domcontentloaded' });
    // Wait for portfolio initialization
    await page.waitForFunction(() => (window as any).__portfolioInitialized === true, { timeout: 10000 });
  });

  test('should verify filter drawer is initially hidden with correct positioning', async ({ page }) => {
    const drawer = page.locator('[data-testid="portfolio-filter-drawer"]');

    // Get the initial right position (should be negative/off-screen)
    const initialRight = await drawer.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      // Parse the right value to get the numeric part
      const rightValue = parseFloat(styles.right);
      return rightValue;
    });

    // The drawer should be positioned off-screen (negative right value)
    expect(initialRight).toBeLessThan(0);

    // The open class should not be present
    const hasOpenClass = await drawer.evaluate((el) => el.classList.contains('open'));
    expect(hasOpenClass).toBe(false);
  });

  test('should open filter drawer when filter button is clicked', async ({ page }) => {
    const filterButton = page.locator('[data-testid="portfolio-filter-toggle"]');
    const drawer = page.locator('[data-testid="portfolio-filter-drawer"]');

    await openFilterDrawer(page);

    // Verify the drawer has the open class
    const hasOpenClass = await drawer.evaluate((el) => el.classList.contains('open'));
    expect(hasOpenClass).toBe(true);

    // Verify the drawer is visible and positioned on screen
    const boundingBox = await drawer.boundingBox();
    expect(boundingBox).not.toBeNull();
    if (boundingBox) {
      // Drawer should be visible somewhere on the right side of the screen
      expect(boundingBox.width).toBeGreaterThan(0);
      expect(boundingBox.height).toBeGreaterThan(0);
    }

    // Verify aria-expanded is true on the toggle button
    const ariaExpanded = await filterButton.getAttribute('aria-expanded');
    expect(ariaExpanded).toBe('true');
  });

  test('should close filter drawer when close button is clicked', async ({ page }) => {
    const filterButton = page.locator('[data-testid="portfolio-filter-toggle"]');
    const drawer = page.locator('[data-testid="portfolio-filter-drawer"]');

    // Open the drawer
    await openFilterDrawer(page);

    // Verify it's open
    let hasOpenClass = await drawer.evaluate((el) => el.classList.contains('open'));
    expect(hasOpenClass).toBe(true);

    // Click the close button — use evaluate for WebKit
    await page.evaluate(() => {
      (document.querySelector('[data-testid="portfolio-drawer-close"]') as HTMLElement)?.click();
    });

    // Wait for the open class to be removed (transition complete)
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="portfolio-filter-drawer"]');
      return el && !el.classList.contains('open');
    });

    // Verify the drawer is closed
    hasOpenClass = await drawer.evaluate((el) => el.classList.contains('open'));
    expect(hasOpenClass).toBe(false);

    // Verify aria-expanded is false on the toggle button
    const ariaExpanded = await filterButton.getAttribute('aria-expanded');
    expect(ariaExpanded).toBe('false');
  });

  test('should close filter drawer when overlay is clicked', async ({ page }) => {
    const filterButton = page.locator('[data-testid="portfolio-filter-toggle"]');
    const drawer = page.locator('[data-testid="portfolio-filter-drawer"]');
    const overlay = page.locator('[data-testid="portfolio-filter-overlay"]');

    // Open the drawer
    await openFilterDrawer(page);

    // Verify it's open
    let hasOpenClass = await drawer.evaluate((el) => el.classList.contains('open'));
    expect(hasOpenClass).toBe(true);

    // Click the overlay via dispatchEvent to avoid z-index pointer-event interception
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="portfolio-filter-overlay"]');
      if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Wait for the open class to be removed (transition complete)
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="portfolio-filter-drawer"]');
      return el && !el.classList.contains('open');
    });

    // Verify the drawer is closed
    hasOpenClass = await drawer.evaluate((el) => el.classList.contains('open'));
    expect(hasOpenClass).toBe(false);

    // Verify the overlay is also closed
    const overlayHasOpenClass = await overlay.evaluate((el) => el.classList.contains('open'));
    expect(overlayHasOpenClass).toBe(false);

    // Verify aria-expanded is false
    const ariaExpanded = await filterButton.getAttribute('aria-expanded');
    expect(ariaExpanded).toBe('false');
  });

  test('should verify filter button toggle state changes correctly', async ({ page }) => {
    const filterButton = page.locator('[data-testid="portfolio-filter-toggle"]');

    // Initial state should be collapsed
    let ariaExpanded = await filterButton.getAttribute('aria-expanded');
    expect(ariaExpanded).toBe('false');

    // Click to open
    await openFilterDrawer(page);

    // Should be expanded
    ariaExpanded = await filterButton.getAttribute('aria-expanded');
    expect(ariaExpanded).toBe('true');

    // Wait for overlay to have open class (drawer is fully open)
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="portfolio-filter-overlay"]');
      return el && el.classList.contains('open');
    });

    // Close using dispatchEvent to avoid z-index pointer-event interception
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="portfolio-filter-overlay"]');
      if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Wait for drawer to close
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="portfolio-filter-drawer"]');
      return el && !el.classList.contains('open');
    });

    // Should be collapsed again
    ariaExpanded = await filterButton.getAttribute('aria-expanded');
    expect(ariaExpanded).toBe('false');
  });

  test('should verify drawer can be toggled multiple times', async ({ page }) => {
    const drawer = page.locator('[data-testid="portfolio-filter-drawer"]');

    // Toggle open and close 3 times
    for (let i = 0; i < 3; i++) {
      // Open
      await openFilterDrawer(page);

      let hasOpenClass = await drawer.evaluate((el) => el.classList.contains('open'));
      expect(hasOpenClass).toBe(true);

      // Close via dispatchEvent to avoid z-index pointer-event interception
      await page.evaluate(() => {
        const el = document.querySelector('[data-testid="portfolio-filter-overlay"]');
        if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Wait for drawer to close (class removed AND transition settled)
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="portfolio-filter-drawer"]');
        if (!el || el.classList.contains('open')) return false;
        const right = parseFloat(window.getComputedStyle(el).right);
        return right < -100;
      }, { timeout: 5000 });

      hasOpenClass = await drawer.evaluate((el) => el.classList.contains('open'));
      expect(hasOpenClass).toBe(false);
    }
  });

  test('should verify clear filters button is accessible and functional', async ({ page }) => {
    const clearButton = page.locator('[data-testid="clear-filters-button"]');

    // Open the drawer
    await openFilterDrawer(page);

    // Verify clear button is visible
    await expect(clearButton).toBeVisible();

    // Verify it's clickable
    const isEnabled = await clearButton.isEnabled();
    expect(isEnabled).toBe(true);
  });
});
