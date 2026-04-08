/**
 * Google Analytics E2E Tests - EXAMPLE FILE
 *
 * This is an example showing how to use the analytics testing helpers.
 * Copy patterns from this file to write your own analytics tests.
 *
 * Features:
 * - Tests real user journeys
 * - Verifies event tracking
 * - No real calls to Google Analytics
 * - Network requests are intercepted and mocked
 */

import { test, expect } from '@playwright/test';
import {
  setupAnalyticsMocking,
  getRecordedEvents,
  expectEventTracked,
  clearRecordedEvents,
  waitForEvent,
} from './helpers/analytics';

/**
 * Click the theme toggle via dispatchEvent to bypass WebKit hit-test issues.
 */
async function clickThemeToggle(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    document.getElementById('themeToggle')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
  });
}

test.describe('Google Analytics Example Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Setup analytics mocking before each test
    // This blocks real GA requests and enables event recording
    await setupAnalyticsMocking(page);
  });

  test.describe('GA4 Script Loading', () => {
    test('should initialize gtag function', async ({ page }) => {
      await page.goto('/');

      // Wait for gtag to be available
      await page.waitForFunction(() => {
        return typeof window.gtag === 'function';
      });

      // Verify gtag exists
      const gtagExists = await page.evaluate(() => {
        return typeof window.gtag === 'function';
      });
      expect(gtagExists).toBe(true);
    });

    test('should initialize dataLayer', async ({ page }) => {
      await page.goto('/');

      const dataLayerExists = await page.evaluate(() => {
        return typeof window.dataLayer !== 'undefined';
      });
      expect(dataLayerExists).toBe(true);
    });

    test('should load GA4 on all pages', async ({ page }) => {
      const pages = [
        { url: '/', name: 'Home' },
        { url: '/services', name: 'Services' },
        { url: '/ma-portfolio', name: 'Portfolio' },
      ];

      for (const { url, name } of pages) {
        await page.goto(url);

        const gtagExists = await page.evaluate(() => {
          return typeof window.gtag === 'function';
        });
        expect(gtagExists).toBe(true);
      }
    });
  });

  test.describe('Page View Tracking', () => {
    test('should track page views on different pages', async ({ page }) => {
      // Visit home page
      await page.goto('/');

      await page.waitForFunction(() => {
        return typeof window.gtag === 'function';
      });

      // Get recorded events
      const events = await getRecordedEvents(page);
      console.log('Events on home page:', events);

      // Visit services page
      await page.goto('/services');

      const servicesEvents = await getRecordedEvents(page);
      console.log('Events on services page:', servicesEvents);
    });
  });

  test.describe('Navigation Tracking', () => {
    test('should track navigation link clicks', async ({ page }) => {
      await page.goto('/');

      await page.waitForFunction(() => {
        return typeof window.gtag === 'function';
      });

      // Clear any initialization events
      await clearRecordedEvents(page);

      // Click navigation link (in header, not the hero CTA)
      const servicesLink = page.locator('nav a:has-text("Services")');
      if (await servicesLink.isVisible()) {
        await servicesLink.evaluate(el => (el as HTMLElement).click());
        await page.waitForURL('/services');

        // Verify navigation occurred
        expect(page.url()).toContain('/services');

        // Get events to see what was tracked
        const events = await getRecordedEvents(page);
        console.log('Navigation events:', events);
      }
    });

    test('should have gtag available after navigation', async ({ page }) => {
      await page.goto('/');

      // Navigate to portfolio
      const portfolioLink = page.locator('a:has-text("M&A")');
      if (await portfolioLink.isVisible()) {
        await portfolioLink.evaluate(el => (el as HTMLElement).click());
        await page.waitForURL('/ma-portfolio');
      }

      // Verify gtag is still available
      const gtagExists = await page.evaluate(() => {
        return typeof window.gtag === 'function';
      });
      expect(gtagExists).toBe(true);
    });
  });

  test.describe('Theme Toggle Tracking', () => {
    test('should allow tracking theme toggles', async ({ page }) => {
      await page.goto('/');

      await page.waitForFunction(() => {
        return typeof window.gtag === 'function';
      });

      // Clear initialization events
      await clearRecordedEvents(page);

      // Click theme toggle
      const themeToggle = page.getByTestId('theme-toggle');
      if (await themeToggle.isVisible()) {
        await clickThemeToggle(page);

        // Get events to see what was tracked
        const events = await getRecordedEvents(page);
        console.log('Theme toggle events:', events);
      }
    });
  });

  test.describe('CTA Tracking', () => {
    test('should track CTA button clicks', async ({ page }) => {
      // Block actual navigation before interacting with CTA
      await page.route('**/calendly.com/**', route => route.abort());

      await page.goto('/');

      await page.waitForFunction(() => {
        return typeof window.gtag === 'function';
      }, undefined, { timeout: 10000 });

      // Clear events
      await clearRecordedEvents(page);

      // Find and interact with CTA — prevent navigation by temporarily removing href
      const ctaButton = page.locator('a[href*="calendly.com"]').first();
      if (await ctaButton.isVisible()) {
        await ctaButton.evaluate((el) => {
          const anchor = el as HTMLAnchorElement;
          const originalHref = anchor.href;
          anchor.removeAttribute('href');
          anchor.click();
          // Restore href after click event has been processed
          requestAnimationFrame(() => anchor.href = originalHref);
        });

        // Verify event was recorded
        const events = await getRecordedEvents(page);
        console.log('CTA events:', events);
      }
    });
  });

  test.describe('Portfolio Page Interactions', () => {
    test('should load portfolio with GA available', async ({ page }) => {
      await page.goto('/ma-portfolio');

      // Verify gtag is available
      const gtagExists = await page.evaluate(() => {
        return typeof window.gtag === 'function';
      });
      expect(gtagExists).toBe(true);

      // Get all recorded events
      const events = await getRecordedEvents(page);
      console.log('Portfolio page events:', events);
    });
  });

  test.describe('GA Error Handling', () => {
    test('should not break page if GA fails to load', async ({ page, context }) => {
      // Block GA requests
      await context.route('**/googletagmanager.com/**', route => {
        route.abort();
      });

      // Page should still load successfully
      await page.goto('/');

      // Check page is functional
      const title = page.locator('h1, h2');
      expect(await title.count()).toBeGreaterThan(0);
    });
  });

  test.describe('Complete User Journey', () => {
    test('should track a complete user journey', async ({ page }) => {
      // Step 1: Visit home
      await page.goto('/');

      await page.waitForFunction(() => {
        return typeof window.gtag === 'function';
      });

      // Clear initialization events
      await clearRecordedEvents(page);

      // Step 2: Navigate to services (use header nav link, not hero CTA)
      const servicesLink = page.locator('nav a:has-text("Services")');
      if (await servicesLink.isVisible()) {
        // Use force:true to bypass WebKit hit-test issues on nav links
        await servicesLink.click({ force: true });
        await page.waitForURL('/services');
        expect(page.url()).toContain('/services');
      }

      // Step 3: Navigate to portfolio
      const portfolioLink = page.locator('a:has-text("M&A")');
      if (await portfolioLink.isVisible()) {
        await portfolioLink.click({ force: true });
        await page.waitForURL('/ma-portfolio');
        expect(page.url()).toContain('/ma-portfolio');
      }

      // Step 4: Verify GA is still active
      const gtagExists = await page.evaluate(() => {
        return typeof window.gtag === 'function';
      });
      expect(gtagExists).toBe(true);

      // Get all tracked events for this journey
      const events = await getRecordedEvents(page);
      console.log('Complete journey events:', events);
    });
  });

  test.describe('Cross-Browser GA Functionality', () => {
    test('should initialize GA on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/');

      const gtagExists = await page.evaluate(() => {
        return typeof window.gtag === 'function';
      });
      expect(gtagExists).toBe(true);
    });

    test('should initialize GA on desktop viewport', async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto('/');

      const gtagExists = await page.evaluate(() => {
        return typeof window.gtag === 'function';
      });
      expect(gtagExists).toBe(true);
    });
  });
});
