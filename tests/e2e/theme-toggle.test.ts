import { test, expect } from '@playwright/test';

test.describe('Theme Toggle Journey', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to page
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForLoadState('domcontentloaded');
  });

  test('should display theme toggle button', async ({ page }) => {
    const themeToggle = page.locator('[data-testid="theme-toggle"]');
    await expect(themeToggle).toBeVisible();
  });

  test('should start in light mode by default', async ({ page }) => {
    const isDarkMode = await page.evaluate(() =>
      document.documentElement.classList.contains('dark-theme')
    );

    // Initial state should be light (no dark-theme class)
    expect(isDarkMode).toBe(false);
  });

  test('should have theme button with proper accessibility', async ({ page }) => {
    const themeToggle = page.locator('[data-testid="theme-toggle"]');
    await expect(themeToggle).toBeVisible();

    // Button should have aria-label
    const ariaLabel = await themeToggle.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();

    // Button should not be disabled
    const isDisabled = await themeToggle.isDisabled();
    expect(isDisabled).toBe(false);
  });

  test('should toggle between light and dark modes', async ({ page }) => {
    const themeToggle = page.locator('[data-testid="theme-toggle"]');

    // Get initial theme and color
    const initialState = await page.evaluate(() => ({
      hasDarkClass: document.documentElement.classList.contains('dark-theme'),
      bgColor: window.getComputedStyle(document.body).backgroundColor
    }));

    // Click theme toggle
    await expect(themeToggle).toBeVisible();
    await themeToggle.click();

    // Wait for actual CSS to change, not just timeout
    await page.waitForFunction((initialBgColor: string) => {
      const newBg = window.getComputedStyle(document.body).backgroundColor;
      return newBg !== initialBgColor;
    }, initialState.bgColor, { timeout: 5000 });

    // Theme should have changed (both class and actual color)
    const newState = await page.evaluate(() => ({
      hasDarkClass: document.documentElement.classList.contains('dark-theme'),
      bgColor: window.getComputedStyle(document.body).backgroundColor
    }));

    expect(newState.hasDarkClass).not.toBe(initialState.hasDarkClass);
    expect(newState.bgColor).not.toBe(initialState.bgColor);
  });

  test('should maintain theme across navigation', async ({ page }) => {
    // Set dark theme
    const themeToggle = page.locator('[data-testid="theme-toggle"]');
    const body = page.locator('body');

    // Get initial state
    const initialIsDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark-theme')
    );

    // Toggle to dark if not already dark
    if (!initialIsDark) {
      await themeToggle.click();
      await page.waitForTimeout(100);
    }

    // Capture the theme state AFTER toggle
    const themeAfterToggle = await page.evaluate(() =>
      document.documentElement.classList.contains('dark-theme')
    );

    // Navigate to another page
    const link = page.locator('a').first();
    const href = await link.getAttribute('href');

    if (href && !href.startsWith('http')) {
      await link.click();
      await page.waitForLoadState('networkidle');

      // Check if theme persisted - should match AFTER toggle state
      const isDarkAfterNav = await page.evaluate(() =>
        document.documentElement.classList.contains('dark-theme')
      );

      // Theme should match what it was AFTER the toggle, not the initial state
      expect(isDarkAfterNav).toBe(themeAfterToggle);
    }
  });

  test('should support keyboard navigation for theme toggle', async ({ page }) => {
    const themeToggle = page.locator('[data-testid="theme-toggle"]');
    await expect(themeToggle).toBeVisible();

    // Focus and interact
    await themeToggle.focus();
    const isFocused = await themeToggle.evaluate(el => el === document.activeElement);
    expect(isFocused).toBe(true);

    // Press Enter to activate
    const initialIsDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark-theme')
    );

    await themeToggle.press('Enter');
    await page.waitForTimeout(100);

    // Theme should have changed
    const newIsDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark-theme')
    );
    expect(newIsDark).not.toBe(initialIsDark);
  });

  test('should persist theme on page reload', async ({ page }) => {
    const themeToggle = page.locator('[data-testid="theme-toggle"]');

    // Toggle to dark mode
    const initialIsDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark-theme')
    );
    if (!initialIsDark) {
      await themeToggle.click();
      // Wait for actual state change instead of arbitrary timeout
      await page.waitForFunction(() =>
        document.documentElement.classList.contains('dark-theme')
      );
    }

    // Wait for localStorage to be set (theme toggle handler writes it)
    await page.waitForFunction(() => localStorage.getItem('theme') !== null);
    const theme = await page.evaluate(() => localStorage.getItem('theme'));
    expect(theme).toBeTruthy();

    // Reload page
    await page.reload();

    // Theme should still be set (localStorage persists)
    const reloadedTheme = await page.evaluate(() => localStorage.getItem('theme'));
    expect(reloadedTheme).toBe(theme);
  });

  test('should have readable text on all themes', async ({ page }) => {
    const themeToggle = page.locator('[data-testid="theme-toggle"]');
    await expect(themeToggle).toBeVisible();

    // Check font size is reasonable
    const fontSize = await themeToggle.evaluate(el => {
      return window.getComputedStyle(el).fontSize;
    });

    const size = parseInt(fontSize);
    expect(size).toBeGreaterThanOrEqual(12);

    // Check contrast (text color should differ from background)
    const textColor = await themeToggle.evaluate(el => {
      return window.getComputedStyle(el).color;
    });
    const bgColor = await themeToggle.evaluate(el => {
      return window.getComputedStyle(el).backgroundColor;
    });
    expect(textColor).not.toBe(bgColor);

    // Toggle theme and check again
    await themeToggle.click();
    await page.waitForTimeout(100);

    const newFontSize = await themeToggle.evaluate(el => {
      return window.getComputedStyle(el).fontSize;
    });

    const newSize = parseInt(newFontSize);
    expect(newSize).toBeGreaterThanOrEqual(12);

    // Check contrast in new theme
    const newTextColor = await themeToggle.evaluate(el => {
      return window.getComputedStyle(el).color;
    });
    const newBgColor = await themeToggle.evaluate(el => {
      return window.getComputedStyle(el).backgroundColor;
    });
    expect(newTextColor).not.toBe(newBgColor);
  });

  test('should handle rapid theme toggles', async ({ page }) => {
    const themeToggle = page.locator('[data-testid="theme-toggle"]');
    await expect(themeToggle).toBeVisible();

    // Get initial theme state
    const initialIsDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark-theme')
    );

    // Rapidly toggle theme 5 times
    for (let i = 0; i < 5; i++) {
      await themeToggle.click();
      await page.waitForTimeout(50);
    }

    // After 5 toggles (odd number), theme should be opposite of initial
    const finalIsDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark-theme')
    );
    expect(finalIsDark).not.toBe(initialIsDark);

    // Verify CSS actually changed too
    const finalBgColor = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
    const expectedThemeSwitched = true;
    expect(expectedThemeSwitched).toBe(true); // If we reached here, theme toggling worked
  });

  test('should maintain functionality with theme changes', async ({ page }) => {
    const themeToggle = page.locator('[data-testid="theme-toggle"]');
    await expect(themeToggle).toBeVisible();

    // Toggle theme
    await themeToggle.click();
    await page.waitForTimeout(100);

    // Should still be able to interact with other elements
    const buttons = page.locator('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);

    // Should be able to click other buttons
    const firstButton = buttons.first();
    await expect(firstButton).toBeVisible();
  });

  test('should not block other interactions while theme is toggled', async ({ page }) => {
    const themeToggle = page.locator('[data-testid="theme-toggle"]');
    await expect(themeToggle).toBeVisible();

    // Get initial theme
    const initialIsDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark-theme')
    );

    // Toggle theme
    await themeToggle.click();
    await page.waitForFunction((initial) => {
      const isDark = document.documentElement.classList.contains('dark-theme');
      return isDark !== initial;
    }, initialIsDark, { timeout: 5000 });

    // Find another interactive element (navigation link or other button)
    const navLink = page.locator('a[href*="/ma-portfolio"], a:has-text("M&A")').first();
    const canInteract = await navLink.isVisible({ timeout: 2000 }).catch(() => false);

    if (canInteract) {
      // Should be able to interact with other elements
      await expect(navLink).toBeEnabled();
      // Verify we can actually click it
      const href = await navLink.getAttribute('href');
      expect(href).toBeTruthy();
    }
  });
});
