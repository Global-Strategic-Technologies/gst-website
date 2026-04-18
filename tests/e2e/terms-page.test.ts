/**
 * Terms and Conditions Page E2E Tests
 *
 * Trimmed to essential coverage: page structure, key content, links,
 * dark theme, and accessibility. Individual heading/section checks
 * consolidated into fewer journey-style assertions.
 */

import { test, expect } from '@playwright/test';
import { clickThemeToggle } from './helpers/theme';

test.describe('Terms Page', () => {
  test.beforeEach(async ({ page }) => {
    // Block external GA requests
    await page.route('**/googletagmanager.com/**', (route) => {
      route.abort();
    });
    await page.route('**/google-analytics.com/**', (route) => {
      route.abort();
    });

    // Navigate to terms page
    await page.goto('/terms', { waitUntil: 'domcontentloaded' });
  });

  test('should load with correct structure and heading', async ({ page }) => {
    const container = page.locator('.legal-page-container');
    await expect(container).toBeVisible();

    const heading = page.locator('.legal-page-header h1');
    await expect(heading).toHaveText('Terms and Conditions');

    const lastUpdated = page.locator('.legal-page-updated');
    await expect(lastUpdated).toContainText('February 2026');

    const body = page.locator('.legal-page-body');
    await expect(body).toBeVisible();

    // Title tag contains expected keywords
    const title = await page.title();
    expect(title).toContain('Terms');
  });

  test('should contain all required content sections', async ({ page }) => {
    const body = page.locator('.legal-page-body');

    // At least 14 h2 section headings
    const headings = body.locator('h2');
    const count = await headings.count();
    expect(count).toBeGreaterThanOrEqual(14);

    // Key legal sections present
    await expect(body).toContainText('Acceptance of Terms');
    await expect(body).toContainText('SMS/Text Messaging Terms');
    await expect(body).toContainText('Governing Law');
    await expect(body).toContainText('State of Colorado');

    // SMS section keywords
    const stopKeyword = body.locator('strong', { hasText: 'STOP' });
    await expect(stopKeyword).toBeVisible();
  });

  test('should have correct links', async ({ page }) => {
    const body = page.locator('.legal-page-body');

    // Contact email
    const emailLink = body.locator('a[href="mailto:contact@globalstrategic.tech"]').first();
    await expect(emailLink).toBeVisible();

    // Privacy policy cross-link
    const privacyLink = body.locator('a[href="/privacy"]');
    await expect(privacyLink).toBeVisible();

    // Website link
    const websiteLink = body.locator('a[href="https://globalstrategic.tech"]').first();
    await expect(websiteLink).toBeVisible();
  });

  test('should display contact section with company info', async ({ page }) => {
    const contactSection = page.locator('.legal-contact-section');
    await expect(contactSection).toBeVisible();
    await expect(contactSection).toContainText('Global Strategic Technologies LLC');

    // Has email and website links
    await expect(
      contactSection.locator('a[href="mailto:contact@globalstrategic.tech"]')
    ).toBeVisible();
    await expect(contactSection.locator('a[href="https://globalstrategic.tech"]')).toBeVisible();
  });

  test('should change heading color in dark theme', async ({ page }) => {
    const heading = page.locator('.legal-page-header h1');

    const lightColor = await heading.evaluate((el) => {
      return window.getComputedStyle(el).color;
    });

    await clickThemeToggle(page);
    await page.waitForFunction(() => document.documentElement.classList.contains('dark-theme'));

    const darkColor = await heading.evaluate((el) => {
      return window.getComputedStyle(el).color;
    });

    expect(darkColor).not.toBe(lightColor);
  });

  test('should render correctly on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/terms', { waitUntil: 'domcontentloaded' });

    const container = page.locator('.legal-page-container');
    await expect(container).toBeVisible();

    const heading = page.locator('.legal-page-header h1');
    await expect(heading).toBeVisible();
  });

  test('should allow email links to receive keyboard focus', async ({ page }) => {
    const emailLink = page
      .locator('.legal-page-body a[href="mailto:contact@globalstrategic.tech"]')
      .first();

    await emailLink.focus();

    const isFocused = await emailLink.evaluate((el) => el === document.activeElement);
    expect(isFocused).toBe(true);
  });
});
