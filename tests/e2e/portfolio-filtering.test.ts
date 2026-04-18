import { test, expect } from '@playwright/test';
import { openFilterDrawer } from './helpers/portfolio';

test.describe('Portfolio Filtering - DOM Integration Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ma-portfolio', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => (window as any).__portfolioInitialized === true, {
      timeout: 5000,
    });
  });

  test('should initialize with "All Engagements" filter active', async ({ page }) => {
    await openFilterDrawer(page);

    const allEngagementsChip = page.locator('[data-testid="filter-chip-engagement-all"]');
    await expect(allEngagementsChip).toHaveClass(/active/);
  });

  test('should initialize with "All Themes" filter active', async ({ page }) => {
    await openFilterDrawer(page);

    const allThemesChip = page.locator('[data-testid="filter-chip-theme-all"]');
    await expect(allThemesChip).toHaveClass(/active/);
  });

  test('should activate engagement category filter when clicked', async ({ page }) => {
    await openFilterDrawer(page);

    const buySideChip = page.locator('[data-testid="filter-chip-engagement-buy-side"]');
    await buySideChip.click();

    await expect(buySideChip).toHaveClass(/active/);

    const allEngagementsChip = page.locator('[data-testid="filter-chip-engagement-all"]');
    await expect(allEngagementsChip).not.toHaveClass(/active/);
  });

  test('should activate theme filter when clicked', async ({ page }) => {
    await openFilterDrawer(page);

    const educationChip = page.locator('[data-testid="filter-chip-theme-education"]');
    await educationChip.click();

    await expect(educationChip).toHaveClass(/active/);

    const allThemesChip = page.locator('[data-testid="filter-chip-theme-all"]');
    await expect(allThemesChip).not.toHaveClass(/active/);
  });

  test('should only allow one engagement filter active at a time', async ({ page }) => {
    await openFilterDrawer(page);

    const buySideChip = page.locator('[data-testid="filter-chip-engagement-buy-side"]');
    await page.evaluate(() => {
      (
        document.querySelector('[data-testid="filter-chip-engagement-buy-side"]') as HTMLElement
      )?.click();
    });
    await page.waitForFunction(() => {
      const chip = document.querySelector('[data-testid="filter-chip-engagement-buy-side"]');
      return chip?.classList.contains('active');
    });
    await expect(buySideChip).toHaveClass(/active/);

    const sellSideChip = page.locator('[data-testid="filter-chip-engagement-sell-side"]');
    await page.evaluate(() => {
      (
        document.querySelector('[data-testid="filter-chip-engagement-sell-side"]') as HTMLElement
      )?.click();
    });
    await page.waitForFunction(() => {
      const chip = document.querySelector('[data-testid="filter-chip-engagement-sell-side"]');
      return chip?.classList.contains('active');
    });

    await expect(sellSideChip).toHaveClass(/active/);
    await expect(buySideChip).not.toHaveClass(/active/);
  });

  test('should reset to "All" filter when clicking "All Engagements"', async ({ page }) => {
    await openFilterDrawer(page);

    const buySideChip = page.locator('[data-testid="filter-chip-engagement-buy-side"]');
    await page.evaluate(() => {
      (
        document.querySelector('[data-testid="filter-chip-engagement-buy-side"]') as HTMLElement
      )?.click();
    });
    await page.waitForFunction(() => {
      const chip = document.querySelector('[data-testid="filter-chip-engagement-buy-side"]');
      return chip?.classList.contains('active');
    });
    await expect(buySideChip).toHaveClass(/active/);

    const allEngagementsChip = page.locator('[data-testid="filter-chip-engagement-all"]');
    await page.evaluate(() => {
      (
        document.querySelector('[data-testid="filter-chip-engagement-all"]') as HTMLElement
      )?.click();
    });
    await page.waitForFunction(() => {
      const chip = document.querySelector('[data-testid="filter-chip-engagement-all"]');
      return chip?.classList.contains('active');
    });

    await expect(allEngagementsChip).toHaveClass(/active/);
    await expect(buySideChip).not.toHaveClass(/active/);
  });

  test('should clear all filters and reset to defaults', async ({ page }) => {
    await openFilterDrawer(page);

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

    await page.evaluate(() => {
      (document.querySelector('[data-testid="clear-filters-button"]') as HTMLElement)?.click();
    });

    await page.waitForFunction(() => {
      const allChip = document.querySelector('[data-testid="filter-chip-engagement-all"]');
      return allChip && allChip.classList.contains('active');
    });

    await expect(buySideChip).not.toHaveClass(/active/);
    await expect(financeChip).not.toHaveClass(/active/);

    const allEngagementsChip = page.locator('[data-testid="filter-chip-engagement-all"]');
    const allThemesChip = page.locator('[data-testid="filter-chip-theme-all"]');

    await expect(allEngagementsChip).toHaveClass(/active/);
    await expect(allThemesChip).toHaveClass(/active/);
  });
});
