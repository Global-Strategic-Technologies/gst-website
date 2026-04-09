import { test, expect } from '@playwright/test';
import { openFilterDrawer } from './helpers/portfolio';

test.describe('Portfolio Filtering - DOM Integration Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ma-portfolio', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => (window as any).__portfolioInitialized === true, { timeout: 5000 });
  });

  test('should initialize with "All Stages" filter active', async ({ page }) => {
    // Open filter drawer and wait for transition
    await openFilterDrawer(page);

    // "All Stages" should be active
    const allStagesChip = page.locator('[data-testid="filter-chip-stage-all"]');
    await expect(allStagesChip).toHaveClass(/active/);
  });

  test('should initialize with "All Themes" filter active', async ({ page }) => {
    // Open filter drawer and wait for transition
    await openFilterDrawer(page);

    // "All Themes" should be active
    const allThemesChip = page.locator('[data-testid="filter-chip-theme-all"]');
    await expect(allThemesChip).toHaveClass(/active/);
  });

  test('should activate stage filter when clicked', async ({ page }) => {
    // Open filter drawer and wait for transition
    await openFilterDrawer(page);

    // Click Growth Stage
    const growthChip = page.locator('[data-testid="filter-chip-stage-growth"]');
    await growthChip.click();

    // Verify active class is applied
    await expect(growthChip).toHaveClass(/active/);

    // "All Stages" should no longer be active
    const allStagesChip = page.locator('[data-testid="filter-chip-stage-all"]');
    await expect(allStagesChip).not.toHaveClass(/active/);
  });

  test('should activate theme filter when clicked', async ({ page }) => {
    // Open filter drawer and wait for transition
    await openFilterDrawer(page);

    // Click Education theme
    const educationChip = page.locator('[data-testid="filter-chip-theme-education"]');
    await educationChip.click();

    // Verify active class is applied
    await expect(educationChip).toHaveClass(/active/);

    // "All Themes" should no longer be active
    const allThemesChip = page.locator('[data-testid="filter-chip-theme-all"]');
    await expect(allThemesChip).not.toHaveClass(/active/);
  });

  test('should activate year filter when clicked', async ({ page }) => {
    // Open filter drawer and wait for transition
    await openFilterDrawer(page);

    // Click a year filter
    const yearChip = page.locator('[data-testid="filter-chip-year-2024"]');
    await yearChip.click();

    // Verify active class is applied
    await expect(yearChip).toHaveClass(/active/);

    // "All Years" should no longer be active
    const allYearsChip = page.locator('[data-testid="filter-chip-year-all"]');
    await expect(allYearsChip).not.toHaveClass(/active/);
  });

  test('should activate engagement filter when clicked', async ({ page }) => {
    // Open filter drawer and wait for transition
    await openFilterDrawer(page);

    // Click Technical Diligence engagement type
    const tdChip = page.locator('[data-testid="filter-chip-engagement-technical-diligence"]');
    await tdChip.click();

    // Verify active class is applied
    await expect(tdChip).toHaveClass(/active/);

    // "All Types" should no longer be active
    const allTypesChip = page.locator('[data-testid="filter-chip-engagement-all"]');
    await expect(allTypesChip).not.toHaveClass(/active/);
  });

  test('should only allow one stage filter active at a time', async ({ page }) => {
    // Open filter drawer and wait for transition
    await openFilterDrawer(page);

    // Click Growth Stage (use evaluate to bypass WebKit hit-testing issues)
    const growthChip = page.locator('[data-testid="filter-chip-stage-growth"]');
    await page.evaluate(() => {
      (document.querySelector('[data-testid="filter-chip-stage-growth"]') as HTMLElement)?.click();
    });
    await page.waitForFunction(() => {
      const chip = document.querySelector('[data-testid="filter-chip-stage-growth"]');
      return chip?.classList.contains('active');
    });
    await expect(growthChip).toHaveClass(/active/);

    // Click Mature Stage (use evaluate to bypass WebKit hit-testing issues)
    const matureChip = page.locator('[data-testid="filter-chip-stage-mature"]');
    await page.evaluate(() => {
      (document.querySelector('[data-testid="filter-chip-stage-mature"]') as HTMLElement)?.click();
    });
    await page.waitForFunction(() => {
      const chip = document.querySelector('[data-testid="filter-chip-stage-mature"]');
      return chip?.classList.contains('active');
    });

    // Only Mature Stage should be active now
    await expect(matureChip).toHaveClass(/active/);
    await expect(growthChip).not.toHaveClass(/active/);
  });

  test('should reset to "All" filter when clicking "All Stages"', async ({ page }) => {
    // Open filter drawer and wait for transition
    await openFilterDrawer(page);

    // Click Growth Stage (use evaluate to bypass WebKit hit-testing issues)
    const growthChip = page.locator('[data-testid="filter-chip-stage-growth"]');
    await page.evaluate(() => {
      (document.querySelector('[data-testid="filter-chip-stage-growth"]') as HTMLElement)?.click();
    });
    await page.waitForFunction(() => {
      const chip = document.querySelector('[data-testid="filter-chip-stage-growth"]');
      return chip?.classList.contains('active');
    });
    await expect(growthChip).toHaveClass(/active/);

    // Click All Stages to reset (use evaluate to bypass WebKit hit-testing issues)
    const allStagesChip = page.locator('[data-testid="filter-chip-stage-all"]');
    await page.evaluate(() => {
      (document.querySelector('[data-testid="filter-chip-stage-all"]') as HTMLElement)?.click();
    });
    await page.waitForFunction(() => {
      const chip = document.querySelector('[data-testid="filter-chip-stage-all"]');
      return chip?.classList.contains('active');
    });

    // All Stages should be active, Growth should not
    await expect(allStagesChip).toHaveClass(/active/);
    await expect(growthChip).not.toHaveClass(/active/);
  });

  test('should clear all filters and reset to defaults', async ({ page }) => {
    // Open filter drawer and wait for transition
    await openFilterDrawer(page);

    // Apply multiple filters — use evaluate to bypass WebKit hit-testing issues
    // inside the slide-in drawer
    const growthChip = page.locator('[data-testid="filter-chip-stage-growth"]');
    const financeChip = page.locator('[data-testid="filter-chip-theme-finance"]');
    const yearChip = page.locator('[data-testid="filter-chip-year-2025"]');

    await page.evaluate(() => {
      (document.querySelector('[data-testid="filter-chip-stage-growth"]') as HTMLElement)?.click();
    });
    await expect(growthChip).toHaveClass(/active/);

    await page.evaluate(() => {
      (document.querySelector('[data-testid="filter-chip-theme-finance"]') as HTMLElement)?.click();
    });
    await expect(financeChip).toHaveClass(/active/);

    await page.evaluate(() => {
      (document.querySelector('[data-testid="filter-chip-year-2025"]') as HTMLElement)?.click();
    });
    await expect(yearChip).toHaveClass(/active/);

    // Click Clear All Filters button
    await page.evaluate(() => {
      (document.querySelector('[data-testid="clear-filters-button"]') as HTMLElement)?.click();
    });

    // Wait for filter reset
    await page.waitForFunction(() => {
      const allChip = document.querySelector('[data-testid="filter-chip-stage-all"]');
      return allChip && allChip.classList.contains('active');
    });

    // Applied filters should no longer be active
    await expect(growthChip).not.toHaveClass(/active/);
    await expect(financeChip).not.toHaveClass(/active/);
    await expect(yearChip).not.toHaveClass(/active/);

    // All filters should be active
    const allStagesChip = page.locator('[data-testid="filter-chip-stage-all"]');
    const allThemesChip = page.locator('[data-testid="filter-chip-theme-all"]');
    const allYearsChip = page.locator('[data-testid="filter-chip-year-all"]');

    await expect(allStagesChip).toHaveClass(/active/);
    await expect(allThemesChip).toHaveClass(/active/);
    await expect(allYearsChip).toHaveClass(/active/);
  });

  test('should render all filter chip categories', async ({ page }) => {
    // Open filter drawer and wait for transition
    await openFilterDrawer(page);

    // Verify all filter sections are rendered
    const stageChips = page.locator('[data-testid^="filter-chip-stage-"]');
    const themeChips = page.locator('[data-testid^="filter-chip-theme-"]');
    const yearChips = page.locator('[data-testid^="filter-chip-year-"]');
    const engagementChips = page.locator('[data-testid^="filter-chip-engagement-"]');

    expect(await stageChips.count()).toBeGreaterThan(0);
    expect(await themeChips.count()).toBeGreaterThan(0);
    expect(await yearChips.count()).toBeGreaterThan(0);
    expect(await engagementChips.count()).toBeGreaterThan(0);
  });
});
