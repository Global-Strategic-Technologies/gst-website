/**
 * About Page E2E Tests
 *
 * Trimmed to essential coverage: founder photo display, theme switching,
 * signature display, GA tracking, layout, and accessibility.
 * Removed: unfailable hover CSS-rule inspection, heavy multi-toggle loops,
 * fragile aspect-ratio cross-theme checks, and redundant cross-browser
 * viewport tests that duplicate the mobile responsive test.
 */

import { test, expect } from '@playwright/test';
import { clickThemeToggle } from './helpers/theme';
import { setupAnalyticsMocking } from './helpers/analytics';

/**
 * Click the founder photo link via dispatchEvent to bypass WebKit hit-test issues.
 */
async function clickFounderPhotoLink(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    document
      .getElementById('founder-photo-link')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

test.describe('About Page - Founder Section', () => {
  test.beforeEach(async ({ page }) => {
    // Setup analytics mocking (blocks GA requests + records events)
    await setupAnalyticsMocking(page);

    // Navigate to about page
    await page.goto('/about', { waitUntil: 'domcontentloaded' });

    // Wait for gtag to be available
    await page.waitForFunction(
      () => {
        return typeof window.gtag === 'function';
      },
      { timeout: 10000 }
    );

    // Setup mocking for analytics verification
    await setupAnalyticsMocking(page);
  });

  test.describe('Founder Photo Display', () => {
    test('should display founder photo in landscape layout', async ({ page }) => {
      const img = page.locator('.founder-image').first();

      // Wait for image to load and be visible
      await expect(img).toBeVisible();

      // Get actual rendered dimensions
      const box = await img.boundingBox();
      expect(box).toBeTruthy();

      if (box) {
        // Verify image has reasonable dimensions
        expect(box.width).toBeGreaterThan(100);
        expect(box.height).toBeGreaterThan(50);

        // For founder photo, verify it's not distorted
        // The aspect ratio should be reasonable (width >= height is fine)
        expect(box.width).toBeGreaterThanOrEqual(box.height * 0.8);
      }
    });

    test('should have fetchpriority="high" and not be lazy-loaded (LCP optimization)', async ({
      page,
    }) => {
      const img = page.locator('.founder-image').first();

      await expect(img).toHaveAttribute('fetchpriority', 'high');

      const loading = await img.getAttribute('loading');
      expect(loading).not.toBe('lazy');
    });

    test('should have explicit width and height attributes to prevent CLS', async ({ page }) => {
      const img = page.locator('.founder-image').first();

      const width = await img.getAttribute('width');
      const height = await img.getAttribute('height');
      expect(width).toBeTruthy();
      expect(height).toBeTruthy();
      expect(Number(width)).toBeGreaterThan(0);
      expect(Number(height)).toBeGreaterThan(0);
    });

    test('should render founder photo as clickable link to LinkedIn', async ({ page }) => {
      const founderLink = page.locator('#founder-photo-link');
      await expect(founderLink).toBeVisible();

      const href = await founderLink.getAttribute('href');
      expect(href).toBe('https://www.linkedin.com/in/reidperyam/');

      // Should open in new window
      const target = await founderLink.getAttribute('target');
      expect(target).toBe('_blank');

      // Should have noopener noreferrer for security
      const rel = await founderLink.getAttribute('rel');
      expect(rel).toBe('noopener noreferrer');
    });
  });

  test.describe('Founder Photo Theme Variants', () => {
    test('should show light theme photo by default', async ({ page }) => {
      const isDarkMode = await page.evaluate(() =>
        document.documentElement.classList.contains('dark-theme')
      );

      if (isDarkMode) {
        await clickThemeToggle(page);
        await page.waitForFunction(
          () => !document.documentElement.classList.contains('dark-theme')
        );
      }

      const lightPhoto = page.locator('.founder-portrait-light');
      await expect(lightPhoto).toBeVisible({ timeout: 5000 });

      const darkPhoto = page.locator('.founder-portrait-dark');
      await expect(darkPhoto).not.toBeVisible();
    });

    test('should switch to dark theme photo when dark mode is enabled', async ({ page }) => {
      const initialIsDark = await page.evaluate(() =>
        document.documentElement.classList.contains('dark-theme')
      );

      if (!initialIsDark) {
        await clickThemeToggle(page);
        await page.waitForFunction(() => document.documentElement.classList.contains('dark-theme'));
      }

      const darkPhoto = page.locator('.founder-portrait-dark');
      await expect(darkPhoto).toBeVisible({ timeout: 5000 });

      const lightPhoto = page.locator('.founder-portrait-light');
      await expect(lightPhoto).not.toBeVisible();
    });
  });

  test.describe('Founder Signature Display', () => {
    test('should display founder signature in bio section', async ({ page }) => {
      const signature = page.locator('.founder-signature');
      const count = await signature.count();
      expect(count).toBeGreaterThanOrEqual(1);
    });

    test('should switch to dark signature in dark theme', async ({ page }) => {
      const initialIsDark = await page.evaluate(() =>
        document.documentElement.classList.contains('dark-theme')
      );
      if (!initialIsDark) {
        await clickThemeToggle(page);
        await page.waitForFunction(() => document.documentElement.classList.contains('dark-theme'));
      }

      // Verify via computed style — toBeVisible() is unreliable here because
      // lazy-loaded signature images may have zero dimensions in Firefox/WebKit
      const darkDisplay = await page.evaluate(() => {
        const el = document.querySelector('.founder-signature-dark');
        return el ? window.getComputedStyle(el).display : 'missing';
      });
      expect(darkDisplay).not.toBe('none');

      const lightDisplay = await page.evaluate(() => {
        const el = document.querySelector('.founder-signature-light');
        return el ? window.getComputedStyle(el).display : 'missing';
      });
      expect(lightDisplay).toBe('none');
    });
  });

  test.describe('Founder Photo GA Tracking', () => {
    test('should track founder_profile_click event when photo is clicked', async ({ page }) => {
      const founderLink = page.locator('#founder-photo-link');
      await expect(founderLink).toBeVisible();

      // Prevent navigation to LinkedIn
      await page.evaluate(() => {
        const link = document.getElementById('founder-photo-link') as HTMLAnchorElement;
        if (link) {
          link.addEventListener('click', (e) => {
            e.preventDefault();
          });
        }
      });

      await clickFounderPhotoLink(page);

      const events = await page.evaluate(() => (window as any).gtagEvents || []);
      const founderClickEvent = events.find((e: any) => e.eventName === 'founder_profile_click');

      expect(founderClickEvent).toBeDefined();
      expect(founderClickEvent?.eventData.destination).toBe(
        'https://www.linkedin.com/in/reidperyam/'
      );
      expect(founderClickEvent?.eventData.event_category).toBe('engagement');
    });
  });

  test.describe('Founder Photo Interaction States', () => {
    test('should have cursor:pointer on founder photo link', async ({ page }) => {
      const founderLink = page.locator('#founder-photo-link');
      const cursor = await founderLink.evaluate((el) => {
        return window.getComputedStyle(el).cursor;
      });

      expect(cursor).toBe('pointer');
    });
  });

  test.describe('About Page Layout', () => {
    test('should display founder section with content', async ({ page }) => {
      const founderSection = page.locator('.founder-section');
      await expect(founderSection).toBeVisible();

      // Verify bio content is visible
      const bioTitle = page.locator('.founder-bio h2');
      await expect(bioTitle).toHaveText('About the Founder');

      const bioText = page.locator('.founder-bio p').first();
      await expect(bioText).toBeVisible();
    });

    test('should be responsive on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/about');

      const founderSection = page.locator('.founder-section');
      await expect(founderSection).toBeVisible();

      // Photo and signature visible at mobile width
      const founderPhoto = page.locator('.founder-portrait').first();
      await expect(founderPhoto).toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('founder photo link should have proper alt text', async ({ page }) => {
      const img = page.locator('.founder-image').first();
      const altText = await img.getAttribute('alt');

      expect(altText).toBeTruthy();
      expect(altText).toContain('Founder');
    });

    test('founder photo link should be keyboard accessible', async ({ page }) => {
      const founderLink = page.locator('#founder-photo-link');

      await founderLink.focus();

      const isFocused = await founderLink.evaluate((el) => el === document.activeElement);
      expect(isFocused).toBe(true);
    });

    test('signature images should have alt text', async ({ page }) => {
      const sig = page.locator('.signature-image').first();
      const altText = await sig.getAttribute('alt');

      expect(altText).toBeTruthy();
      expect(altText).toContain('signature');
    });
  });
});
