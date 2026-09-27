import { test, expect, devices } from '@playwright/test';
import { openFilterDrawer } from './helpers/portfolio';

// Run these tests with mobile viewport
test.use({ ...devices['iPhone 12'] });

test.describe('Mobile Navigation Journey', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ma-portfolio/', { waitUntil: 'domcontentloaded' });
  });

  test('should have touchable buttons on mobile', async ({ page }) => {
    // Visible buttons only. The page legitimately carries hidden <button>s
    // ahead of the first visible one — the first-visit language band renders
    // one hidden band per live locale and reveals at most one (BL-153) — and
    // `button` alone resolved to a hidden band button and failed (CI, 2026-09-05).
    const buttons = page.locator('button:visible');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);

    // First visible button should be enabled
    const firstButton = buttons.first();
    await expect(firstButton).toBeVisible();
    await expect(firstButton).toBeEnabled();
  });

  test('should allow scrolling portfolio on mobile', async ({ page }) => {
    // Scroll down
    await page.evaluate(() => window.scrollBy(0, 300));

    // Get scroll position
    const scrollPos = await page.evaluate(() => window.scrollY);
    expect(scrollPos).toBeGreaterThan(0);

    // Should be able to scroll back up
    await page.evaluate(() => window.scrollBy(0, -300));

    const newScrollPos = await page.evaluate(() => window.scrollY);
    expect(newScrollPos).toBeLessThan(scrollPos);
  });

  test('should display search box on mobile', async ({ page }) => {
    // Search input should be visible
    const searchInput = page.locator('[data-testid="portfolio-search-input"]');
    await expect(searchInput).toBeVisible();

    const box = await searchInput.boundingBox();
    expect(box).toBeTruthy();
  });

  test('should open filter drawer on mobile', async ({ page }) => {
    // Wait for portfolio to be fully initialized
    await page.waitForFunction(() => (window as any).__portfolioInitialized === true, {
      timeout: 5000,
    });

    await openFilterDrawer(page);

    // Drawer should be visible and transition complete
    const drawer = page.locator('[data-testid="portfolio-filter-drawer"]');
    await expect(drawer).toBeVisible();
  });

  test('should allow typing in search on mobile', async ({ page }) => {
    // Wait for portfolio to be fully initialized
    await page.waitForFunction(() => (window as any).__portfolioInitialized === true, {
      timeout: 5000,
    });

    // Focus search input
    const searchInput = page.locator('[data-testid="portfolio-search-input"]');
    await expect(searchInput).toBeVisible();

    // Clear and type — use evaluate to focus + fill for cross-browser reliability
    await page.evaluate(() => {
      const input = document.querySelector(
        '[data-testid="portfolio-search-input"]'
      ) as HTMLInputElement;
      if (input) {
        input.focus();
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await searchInput.fill('fintech');

    // Value should update
    const value = await searchInput.inputValue();
    expect(value).toContain('fintech');
  });

  test('should allow project card click on mobile', async ({ page }) => {
    // Find first project card
    const card = page.locator('[data-testid="project-card"]').first();
    await expect(card).toBeVisible();

    // Click card — use evaluate to bypass WebKit hit-testing on mobile
    await page.evaluate(() => {
      (document.querySelector('[data-testid="project-card"]') as HTMLElement)?.click();
    });

    // Modal should open
    const modal = page.locator('[data-testid="project-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });
  });

  test('should display modal full width on mobile', async ({ page }) => {
    // Open modal — use evaluate for WebKit mobile
    const card = page.locator('[data-testid="project-card"]').first();
    await expect(card).toBeVisible();
    await page.evaluate(() => {
      (document.querySelector('[data-testid="project-card"]') as HTMLElement)?.click();
    });

    const modal = page.locator('[data-testid="project-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    const box = await modal.boundingBox();
    const viewport = page.viewportSize();

    // Modal should take up most of viewport width
    expect(box).toBeTruthy();
    if (box && viewport) {
      expect(box.width / viewport.width).toBeGreaterThan(0.7);
    }
  });

  test('should close modal easily on mobile', async ({ page }) => {
    // Open modal — use evaluate for WebKit mobile
    const card = page.locator('[data-testid="project-card"]').first();
    await expect(card).toBeVisible();
    await page.evaluate(() => {
      (document.querySelector('[data-testid="project-card"]') as HTMLElement)?.click();
    });

    const modal = page.locator('[data-testid="project-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Close button should be accessible
    const closeBtn = page.locator('[data-testid="project-modal-close"]');
    await expect(closeBtn).toBeVisible();

    const closeBox = await closeBtn.boundingBox();
    expect(closeBox).toBeTruthy();

    // Should be large enough to tap
    if (closeBox) {
      expect(closeBox.height).toBeGreaterThan(30);
    }
  });

  test('should handle vertical scrolling in modal on mobile', async ({ page }) => {
    // Open modal — use evaluate for WebKit mobile
    const card = page.locator('[data-testid="project-card"]').first();
    await expect(card).toBeVisible();
    await page.evaluate(() => {
      (document.querySelector('[data-testid="project-card"]') as HTMLElement)?.click();
    });

    const modal = page.locator('[data-testid="project-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // What prevents clipping on mobile is the CONTRACT: the dialog fits inside
    // the viewport and scrolls vertically. That's asserted unconditionally.
    // Whether the first project's content overflows depends on which entry
    // happens to be first (new entries are prepended), so the actual scroll
    // is exercised only when there is something to scroll.
    const box = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="project-modal"]') as HTMLElement;
      return {
        overflowY: getComputedStyle(el).overflowY,
        height: el.getBoundingClientRect().height,
        viewport: window.innerHeight,
        overflows: el.scrollHeight > el.clientHeight,
      };
    });
    expect(['auto', 'scroll']).toContain(box.overflowY);
    expect(box.height).toBeLessThanOrEqual(box.viewport);

    if (box.overflows) {
      const scrolled = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="project-modal"]') as HTMLElement;
        el.scrollTop = 100;
        return el.scrollTop;
      });
      expect(scrolled).toBeGreaterThan(0);
    }
  });

  test('should have readable text on mobile', async ({ page }) => {
    // Check font size is reasonable on project cards
    const card = page.locator('[data-testid="project-card"]').first();
    await expect(card).toBeVisible();

    const fontSize = await card.evaluate((el) => {
      return window.getComputedStyle(el).fontSize;
    });

    // Font should be at least 12px
    const size = parseInt(fontSize);
    expect(size).toBeGreaterThanOrEqual(12);
  });

  test('should allow clicking theme filter chips on mobile', async ({ page }) => {
    // Wait for initialization
    await page.waitForFunction(() => (window as any).__portfolioInitialized === true, {
      timeout: 5000,
    });

    await openFilterDrawer(page);

    // Click a theme filter — use evaluate to bypass hit-testing on mobile
    const themeChip = page.locator('[data-testid="filter-chip-theme-finance"]');
    await expect(themeChip).toBeVisible();
    await page.evaluate(() => {
      (document.querySelector('[data-testid="filter-chip-theme-finance"]') as HTMLElement)?.click();
    });

    // Wait for async state update before asserting
    await page.waitForFunction(() => {
      const chip = document.querySelector('[data-testid="filter-chip-theme-finance"]');
      return chip?.classList.contains('active');
    });

    // Verify it's now active
    await expect(themeChip).toHaveClass(/active/);

    // All Themes should no longer be active
    const allThemesChip = page.locator('[data-testid="filter-chip-theme-all"]');
    await expect(allThemesChip).not.toHaveClass(/active/);
  });

  test('should allow clicking engagement filter chips on mobile', async ({ page }) => {
    // Wait for initialization
    await page.waitForFunction(() => (window as any).__portfolioInitialized === true, {
      timeout: 5000,
    });

    await openFilterDrawer(page);

    // Click an engagement filter — use evaluate for WebKit mobile
    const engagementChip = page.locator('[data-testid="filter-chip-engagement-buy-side"]');
    await expect(engagementChip).toBeVisible();
    await page.evaluate(() => {
      (
        document.querySelector('[data-testid="filter-chip-engagement-buy-side"]') as HTMLElement
      )?.click();
    });

    // Verify it's now active
    await expect(engagementChip).toHaveClass(/active/);

    // All Types should no longer be active
    const allTypesChip = page.locator('[data-testid="filter-chip-engagement-all"]');
    await expect(allTypesChip).not.toHaveClass(/active/);
  });

  test('should update page after applying filter on mobile', async ({ page }) => {
    // Wait for initialization
    await page.waitForFunction(() => (window as any).__portfolioInitialized === true, {
      timeout: 5000,
    });

    // Get initial project count
    const initialCards = page.locator('[data-testid="project-card"]');
    const initialCount = await initialCards.count();
    expect(initialCount).toBeGreaterThan(0);

    await openFilterDrawer(page);

    // Apply a filter — use evaluate for WebKit mobile
    await page.evaluate(() => {
      (
        document.querySelector('[data-testid="filter-chip-engagement-buy-side"]') as HTMLElement
      )?.click();
    });

    // Close drawer — use evaluate for WebKit mobile
    await page.evaluate(() => {
      (document.querySelector('[data-testid="portfolio-drawer-close"]') as HTMLElement)?.click();
    });

    // Wait for drawer slide-out transition to complete
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-testid="portfolio-filter-drawer"]');
        if (!el) return true;
        const right = window.getComputedStyle(el).right;
        return right !== '0px';
      },
      { timeout: 5000 }
    );

    // Grid should still be visible and interactive
    const gridCards = page.locator('[data-testid="project-card"]');
    const gridCardCount = await gridCards.count();
    expect(gridCardCount).toBeGreaterThan(0);

    // Verify filter state was applied
    const filterState = await page.evaluate(
      () => (window as any).portfolioState?.filters?.engagement
    );
    expect(filterState).toBe('Buy-Side');
  });

  test('should allow clearing filters on mobile', async ({ page }) => {
    // Wait for initialization
    await page.waitForFunction(() => (window as any).__portfolioInitialized === true, {
      timeout: 5000,
    });

    await openFilterDrawer(page);

    // Apply multiple filters — use evaluate for WebKit mobile
    const buySideChip = page.locator('[data-testid="filter-chip-engagement-buy-side"]');
    const financeChip = page.locator('[data-testid="filter-chip-theme-finance"]');

    await page.evaluate(() => {
      (
        document.querySelector('[data-testid="filter-chip-engagement-buy-side"]') as HTMLElement
      )?.click();
    });
    await expect(buySideChip).toHaveClass(/active/);

    await page.evaluate(() => {
      (document.querySelector('[data-testid="filter-chip-theme-finance"]') as HTMLElement)?.click();
    });
    await expect(financeChip).toHaveClass(/active/);

    // Click Clear All Filters — use evaluate for WebKit mobile
    await page.evaluate(() => {
      (document.querySelector('[data-testid="clear-filters-button"]') as HTMLElement)?.click();
    });

    // Wait for filters to reset — "All Engagements" chip should become active
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-testid="filter-chip-engagement-all"]');
        return el && el.classList.contains('active');
      },
      { timeout: 5000 }
    );

    // Filters should be reset to "All"
    const allEngagementsChip = page.locator('[data-testid="filter-chip-engagement-all"]');
    const allThemesChip = page.locator('[data-testid="filter-chip-theme-all"]');

    await expect(allEngagementsChip).toHaveClass(/active/);
    await expect(allThemesChip).toHaveClass(/active/);
    await expect(buySideChip).not.toHaveClass(/active/);
    await expect(financeChip).not.toHaveClass(/active/);
  });
});
