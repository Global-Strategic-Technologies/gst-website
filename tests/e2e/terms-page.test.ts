/**
 * Terms and Conditions Page E2E Tests
 * Tests for page structure, content sections, links, dark theme, responsive layout, and accessibility
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

  test.describe('Page Load & Structure', () => {
    test('should load the terms page successfully at /terms', async ({ page }) => {
      const container = page.locator('.legal-page-container');
      await expect(container).toBeVisible();
    });

    test('should have correct page title', async ({ page }) => {
      const title = await page.title();
      expect(title).toContain('Terms');
      expect(title).toContain('GST');
    });

    test('should display h1 heading "Terms and Conditions"', async ({ page }) => {
      const heading = page.locator('.legal-page-header h1');
      await expect(heading).toBeVisible();
      await expect(heading).toHaveText('Terms and Conditions');
    });

    test('should show "Last Updated" date', async ({ page }) => {
      const lastUpdated = page.locator('.legal-page-updated');
      await expect(lastUpdated).toBeVisible();
      await expect(lastUpdated).toContainText('Last Updated');
      await expect(lastUpdated).toContainText('February 2026');
    });

    test('should contain legal-page-container, legal-page-header, and legal-page-body elements', async ({
      page,
    }) => {
      const container = page.locator('.legal-page-container');
      const header = page.locator('.legal-page-header');
      const body = page.locator('.legal-page-body');

      await expect(container).toBeVisible();
      await expect(header).toBeVisible();
      await expect(body).toBeVisible();
    });
  });

  test.describe('Content Sections', () => {
    test('should have at least 14 h2 headings', async ({ page }) => {
      const headings = page.locator('.legal-page-body h2');
      const count = await headings.count();
      expect(count).toBeGreaterThanOrEqual(14);
    });

    test('should contain "Acceptance of Terms" heading', async ({ page }) => {
      const heading = page.locator('.legal-page-body h2', { hasText: 'Acceptance of Terms' });
      await expect(heading).toBeVisible();
    });

    test('should contain "SMS/Text Messaging Terms" heading', async ({ page }) => {
      const heading = page.locator('.legal-page-body h2', { hasText: 'SMS/Text Messaging Terms' });
      await expect(heading).toBeVisible();
    });

    test('should contain "Governing Law" heading', async ({ page }) => {
      const heading = page.locator('.legal-page-body h2', { hasText: 'Governing Law' });
      await expect(heading).toBeVisible();
    });

    test('should contain "Contact Us" heading', async ({ page }) => {
      const heading = page.locator('.legal-page-body h2', { hasText: 'Contact Us' });
      await expect(heading).toBeVisible();
    });

    test('should have 5 list items in the "Use of Website" section', async ({ page }) => {
      const listItems = page.locator('.legal-page-body ul li');
      const count = await listItems.count();
      expect(count).toBe(5);
    });

    test('should reference Colorado in the "Governing Law" section', async ({ page }) => {
      const termsBody = page.locator('.legal-page-body');
      await expect(termsBody).toContainText('State of Colorado');
    });

    test('should contain STOP and HELP keywords in SMS section', async ({ page }) => {
      const stopKeyword = page.locator('.legal-page-body strong', { hasText: 'STOP' });
      const helpKeyword = page.locator('.legal-page-body strong', { hasText: 'HELP' });

      await expect(stopKeyword).toBeVisible();
      await expect(helpKeyword).toBeVisible();
    });
  });

  test.describe('Links', () => {
    test('should have contact email link with correct mailto href', async ({ page }) => {
      const emailLink = page
        .locator('.legal-page-body a[href="mailto:contact@globalstrategic.tech"]')
        .first();
      await expect(emailLink).toBeVisible();

      const href = await emailLink.getAttribute('href');
      expect(href).toBe('mailto:contact@globalstrategic.tech');
    });

    test('should have website link with correct href', async ({ page }) => {
      const websiteLink = page
        .locator('.legal-page-body a[href="https://globalstrategic.tech"]')
        .first();
      await expect(websiteLink).toBeVisible();

      const href = await websiteLink.getAttribute('href');
      expect(href).toBe('https://globalstrategic.tech');
    });

    test('should have Privacy Policy link pointing to /privacy', async ({ page }) => {
      const privacyLink = page.locator('.legal-page-body a[href="/privacy"]');
      await expect(privacyLink).toBeVisible();

      const href = await privacyLink.getAttribute('href');
      expect(href).toBe('/privacy');
    });

    test('should style links in legal-page-body with teal color', async ({ page }) => {
      const link = page.locator('.legal-page-body a').first();
      await expect(link).toBeVisible();

      const color = await link.evaluate((el) => {
        return window.getComputedStyle(el).color;
      });

      // #05cd99 converts to rgb(5, 205, 153)
      expect(color).toBe('rgb(5, 205, 153)');
    });
  });

  test.describe('Contact Section', () => {
    test('should display the contact section', async ({ page }) => {
      const contactSection = page.locator('.legal-contact-section');
      await expect(contactSection).toBeVisible();
    });

    test('should have green left border on contact section', async ({ page }) => {
      const contactSection = page.locator('.legal-contact-section');
      const borderLeft = await contactSection.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return style.borderLeftColor;
      });

      // #05cd99 converts to rgb(5, 205, 153)
      expect(borderLeft).toBe('rgb(5, 205, 153)');
    });

    test('should contain company name "Global Strategic Technologies LLC"', async ({ page }) => {
      const contactSection = page.locator('.legal-contact-section');
      await expect(contactSection).toContainText('Global Strategic Technologies LLC');
    });

    test('should have email and website links in contact section', async ({ page }) => {
      const contactSection = page.locator('.legal-contact-section');

      const emailLink = contactSection.locator('a[href="mailto:contact@globalstrategic.tech"]');
      await expect(emailLink).toBeVisible();

      const websiteLink = contactSection.locator('a[href="https://globalstrategic.tech"]');
      await expect(websiteLink).toBeVisible();
    });
  });

  test.describe('Dark Theme Support', () => {
    test('should change heading color when dark theme is toggled', async ({ page }) => {
      const heading = page.locator('.legal-page-header h1');

      // Get light theme color
      const lightColor = await heading.evaluate((el) => {
        return window.getComputedStyle(el).color;
      });

      // Toggle to dark theme
      await clickThemeToggle(page);
      await page.waitForFunction(() => document.documentElement.classList.contains('dark-theme'));

      // Verify dark theme is active
      const isDark = await page.evaluate(() =>
        document.documentElement.classList.contains('dark-theme')
      );
      expect(isDark).toBe(true);

      // Get dark theme color
      const darkColor = await heading.evaluate((el) => {
        return window.getComputedStyle(el).color;
      });

      // Colors should be different between themes
      expect(darkColor).not.toBe(lightColor);
    });

    test('should change body text color in dark theme', async ({ page }) => {
      const termsBody = page.locator('.legal-page-body');

      // Get light theme color
      const lightColor = await termsBody.evaluate((el) => {
        return window.getComputedStyle(el).color;
      });

      // Toggle to dark theme
      await clickThemeToggle(page);
      await page.waitForFunction(() => document.documentElement.classList.contains('dark-theme'));

      // Get dark theme color
      const darkColor = await termsBody.evaluate((el) => {
        return window.getComputedStyle(el).color;
      });

      expect(darkColor).not.toBe(lightColor);
    });

    test('should render contact section correctly in dark theme', async ({ page }) => {
      const contactSection = page.locator('.legal-contact-section');

      // Toggle to dark theme
      await clickThemeToggle(page);
      await page.waitForFunction(() => document.documentElement.classList.contains('dark-theme'));

      // Contact section should be visible with structural left border
      await expect(contactSection).toBeVisible();
      const borderLeft = await contactSection.evaluate((el) => {
        return window.getComputedStyle(el).borderLeftStyle;
      });
      expect(borderLeft).toBe('solid');
    });
  });

  test.describe('Responsive Layout', () => {
    test('should render correctly on mobile viewport (375px)', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/terms', { waitUntil: 'domcontentloaded' });

      const container = page.locator('.legal-page-container');
      await expect(container).toBeVisible();

      const heading = page.locator('.legal-page-header h1');
      await expect(heading).toBeVisible();

      const termsBody = page.locator('.legal-page-body');
      await expect(termsBody).toBeVisible();
    });

    test('should render heading at larger size on tablet viewport (768px)', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto('/terms', { waitUntil: 'domcontentloaded' });

      const heading = page.locator('.legal-page-header h1');
      await expect(heading).toBeVisible();

      const fontSize = await heading.evaluate((el) => {
        return window.getComputedStyle(el).fontSize;
      });

      // At 768px breakpoint, font-size should be 3rem (48px)
      const fontSizeValue = parseFloat(fontSize);
      expect(fontSizeValue).toBeGreaterThanOrEqual(48);
    });

    test('should render correctly on desktop viewport (1920px)', async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto('/terms', { waitUntil: 'domcontentloaded' });

      const container = page.locator('.legal-page-container');
      await expect(container).toBeVisible();

      const heading = page.locator('.legal-page-header h1');
      await expect(heading).toBeVisible();

      const contactSection = page.locator('.legal-contact-section');
      await expect(contactSection).toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('should allow email links to receive keyboard focus', async ({ page }) => {
      const emailLink = page
        .locator('.legal-page-body a[href="mailto:contact@globalstrategic.tech"]')
        .first();

      await emailLink.focus();

      const isFocused = await emailLink.evaluate((el) => el === document.activeElement);
      expect(isFocused).toBe(true);
    });

    test('should have meaningful text content on the page', async ({ page }) => {
      const termsBody = page.locator('.legal-page-body');
      const textContent = await termsBody.textContent();

      expect(textContent).toBeTruthy();
      expect(textContent!.length).toBeGreaterThan(100);
    });

    test('should not have sticky positioning on the terms header', async ({ page }) => {
      const header = page.locator('.legal-page-header');

      const position = await header.evaluate((el) => {
        return window.getComputedStyle(el).position;
      });

      expect(position).toBe('static');
    });
  });
});
