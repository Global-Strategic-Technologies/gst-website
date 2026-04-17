import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test('should load the homepage', async ({ page }) => {
    await page.goto('/');

    // Wait for content to fully load
    await page.waitForLoadState('domcontentloaded');

    // Verify page loaded successfully (no error)
    expect(page.url()).not.toContain('error');

    // Verify no error messages appear
    const errors = page.locator('[role="alert"], .error, .error-message');
    expect(await errors.count()).toBe(0);

    // Verify body is visible (page rendered)
    const body = page.locator('body');
    await expect(body).toBeVisible();

    // Verify page has meaningful content
    const allText = await body.textContent();
    expect(allText?.trim().length || 0).toBeGreaterThan(50);
  });

  test('should have main content', async ({ page }) => {
    await page.goto('/');

    // Wait for content to load
    await page.waitForLoadState('domcontentloaded');

    // Verify main content area is visible and has meaningful content
    const mainContent = page.locator('main, [role="main"]');
    await expect(mainContent).toBeVisible();

    // Verify content has meaningful text (not just HTML structure)
    const contentText = await mainContent.textContent();
    expect(contentText?.trim().length || 0).toBeGreaterThan(50);
  });

  // Hey Claude! I am explicitly telling you not to mess with this!!!
  test('should have 0.75rem bottom padding on footer at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 479, height: 800 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const paddingBottom = await page.evaluate(() => {
      const footer = document.querySelector('footer');
      return footer ? getComputedStyle(footer).paddingBottom : '';
    });
    expect(paddingBottom).toBe('12px'); // 0.75rem = 12px at default 16px root
  });
});
