import { test, expect } from '@playwright/test';
import {
  clickThemeToggle,
  currentTheme,
  cycleThemeTo,
  nextTheme,
  THEMES,
  waitForTheme,
} from './helpers/theme';
import { todayKey } from './helpers/storage-baseline';

test.describe('Theme Toggle Journey', () => {
  test.beforeEach(async ({ page }) => {
    // domcontentloaded is reliable under parallel worker contention; networkidle
    // can time out when many workers share the same dev server.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  });

  test('should display theme toggle button', async ({ page }) => {
    const themeToggle = page.locator('[data-testid="theme-toggle"]');
    await expect(themeToggle).toBeVisible();
  });

  test('should start in the baseline light pick', async ({ page }) => {
    // The visitor default follows the date (ADR-0040); every spec starts from
    // the baseline's light pick instead (storage-baseline.ts).
    expect(await currentTheme(page)).toBe('light');
  });

  test('should have theme button with proper accessibility', async ({ page }) => {
    const themeToggle = page.locator('[data-testid="theme-toggle"]');
    await expect(themeToggle).toBeVisible();

    // The label names the current state and the one the next click selects.
    await expect(themeToggle).toHaveAttribute('aria-label', 'Theme: light. Switch to dim light');

    // Button should not be disabled
    const isDisabled = await themeToggle.isDisabled();
    expect(isDisabled).toBe(false);
  });

  test('should cycle light → dim light → dim dark → dark → light', async ({ page }) => {
    const themeToggle = page.locator('[data-testid="theme-toggle"]');
    await expect(themeToggle).toBeVisible();

    const backgrounds = new Set<string>();
    backgrounds.add(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));

    for (const expected of [...THEMES.slice(1), 'light'] as const) {
      await clickThemeToggle(page);
      await waitForTheme(page, expected);
      backgrounds.add(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
      // Each click states where the NEXT click goes.
      await expect(themeToggle).toHaveAttribute(
        'aria-label',
        new RegExp(`Switch to ${nextTheme(expected).replace('-', ' ')}$`)
      );
    }

    // Four states, four page backgrounds — not two.
    expect(backgrounds.size).toBe(4);
  });

  test('the footer delta turns 90° counter-clockwise per click', async ({ page }) => {
    const rotation = () =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--theme-rotation').trim()
      );
    expect(await rotation()).toBe('0deg');
    for (let i = 1; i <= 4; i++) {
      await clickThemeToggle(page);
      await expect.poll(rotation).toBe(`${i * -90}deg`);
    }
    // Light again, but a full turn on — it keeps turning the same way.
    expect(await currentTheme(page)).toBe('light');
    // The icon itself carries the rotation, not just the variable.
    await expect(page.locator('#themeToggle .theme-toggle-icon')).toHaveCSS('rotate', '-360deg');
  });

  test('should maintain theme across navigation', async ({ page }) => {
    await cycleThemeTo(page, 'dark');

    // Navigate to another page — use a known internal nav link
    const link = page
      .locator(
        'nav a[href="/services/"], nav a[href="/ma-portfolio/"], a[href="/services/"], a[href="/ma-portfolio/"]'
      )
      .first();
    const href = await link.getAttribute('href');

    if (href) {
      // Use evaluate to bypass WebKit hit-testing on navigation links
      await link.evaluate((el) => (el as HTMLElement).click());
      // Wait for navigation to fully complete before evaluating
      await page.waitForURL(`**${href}`, { timeout: 10000 });
      await page.waitForLoadState('domcontentloaded');

      // The pick persisted across the navigation
      expect(await currentTheme(page)).toBe('dark');
    }
  });

  test('should support keyboard navigation for theme toggle', async ({ page }) => {
    const themeToggle = page.locator('[data-testid="theme-toggle"]');
    await expect(themeToggle).toBeVisible();

    // Focus and interact
    await themeToggle.focus();
    const isFocused = await themeToggle.evaluate((el) => el === document.activeElement);
    expect(isFocused).toBe(true);

    // Press Enter to activate: one step of the cycle
    await themeToggle.press('Enter');
    await waitForTheme(page, 'dim-light');
  });

  test('should persist theme on page reload', async ({ page }) => {
    await cycleThemeTo(page, 'dim-dark');

    // The baseline storage already holds 'light' (storage-baseline.ts), so
    // wait for the toggle's own write rather than for any value.
    await page.waitForFunction(() => localStorage.getItem('theme') === 'dim-dark');
    // The pick is stamped with today's date, so it holds until midnight (ADR-0040).
    expect(await page.evaluate(() => localStorage.getItem('theme-date'))).toBe(todayKey());

    await page.reload();

    // The head script restores the pick, and the footer delta with it.
    expect(await currentTheme(page)).toBe('dim-dark');
    await expect(page.getByTestId('theme-toggle')).toHaveAttribute('data-theme-state', '2');
  });

  test('should have readable text on all themes', async ({ page }) => {
    const themeToggle = page.locator('[data-testid="theme-toggle"]');
    await expect(themeToggle).toBeVisible();

    for (const theme of [...THEMES.slice(1), 'light'] as const) {
      const fontSize = await themeToggle.evaluate((el) => window.getComputedStyle(el).fontSize);
      expect(parseInt(fontSize)).toBeGreaterThanOrEqual(12);

      // Check contrast (text color should differ from background)
      const [textColor, bgColor] = await themeToggle.evaluate((el) => {
        const s = window.getComputedStyle(el);
        return [s.color, s.backgroundColor];
      });
      expect(textColor).not.toBe(bgColor);

      await clickThemeToggle(page);
      await waitForTheme(page, theme);
    }
  });

  test('should handle rapid theme toggles', async ({ page }) => {
    const themeToggle = page.locator('[data-testid="theme-toggle"]');
    await expect(themeToggle).toBeVisible();

    // Five clicks, waiting for each to register: light → … → light → dim light
    let theme = await currentTheme(page);
    for (let i = 0; i < 5; i++) {
      await clickThemeToggle(page);
      theme = nextTheme(theme);
      await waitForTheme(page, theme);
    }
    expect(theme).toBe('dim-light');
    await expect(themeToggle).toHaveAttribute('data-theme-turns', '5');
  });

  test('should maintain functionality with theme changes', async ({ page }) => {
    const themeToggle = page.locator('[data-testid="theme-toggle"]');
    await expect(themeToggle).toBeVisible();

    // Toggle theme
    await clickThemeToggle(page);
    await waitForTheme(page, 'dim-light');

    // Should still be able to interact with other elements. Visible buttons
    // only: the first-visit language band renders hidden <button>s ahead of
    // the page's own (BL-153), and on a route without a switcher a bare
    // `button` locator resolves to one of them (see mobile-navigation.test.ts).
    const buttons = page.locator('button:visible');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);

    // Should be able to click other buttons
    const firstButton = buttons.first();
    await expect(firstButton).toBeVisible();
  });

  test('should not block other interactions while theme is toggled', async ({ page }) => {
    const themeToggle = page.locator('[data-testid="theme-toggle"]');
    await expect(themeToggle).toBeVisible();

    // Toggle theme
    await clickThemeToggle(page);
    await waitForTheme(page, 'dim-light');

    // Find another interactive element (navigation link or other button)
    const navLink = page.locator('a[href*="/ma-portfolio/"], a:has-text("M&A")').first();
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
