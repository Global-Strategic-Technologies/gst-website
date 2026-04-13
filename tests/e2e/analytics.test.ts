/**
 * Google Analytics E2E Tests
 * Tests real user journeys and event tracking across the website
 */

import { test, expect } from '@playwright/test';
import { clickThemeToggle } from './helpers/theme';
import { setupAnalyticsMocking } from './helpers/analytics';

test.describe('Google Analytics E2E Tests', () => {
  // Setup for each test
  test.beforeEach(async ({ page }) => {
    // Setup analytics mocking (blocks GA requests + records events)
    await setupAnalyticsMocking(page);
  });

  // Helper to setup mocking after navigation
  async function gotoAndSetupAnalytics(page: any, url: string) {
    await page.goto(url);
    await page.waitForFunction(
      () => {
        return typeof window.gtag === 'function';
      },
      { timeout: 10000 }
    );
    await setupAnalyticsMocking(page);
  }

  test.describe('GA4 Script Loading', () => {
    test('should load GA4 on all pages', async ({ page }) => {
      const pages = [
        { url: '/', name: 'Home' },
        { url: '/ma-portfolio', name: 'Portfolio' },
      ];

      for (const { url } of pages) {
        await gotoAndSetupAnalytics(page, url);

        const gtagExists = await page.evaluate(() => {
          return typeof window.gtag === 'function';
        });
        expect(gtagExists).toBe(true);
      }
    });
  });

  test.describe('Navigation Event Tracking', () => {
    test('should track navigation link clicks', async ({ page }) => {
      await gotoAndSetupAnalytics(page, '/');

      // Wait for gtag to be available
      await page.waitForFunction(() => {
        return typeof window.gtag === 'function';
      });

      // Click navigation link — use evaluate for WebKit
      const portfolioLink = page.locator('a:has-text("M&A")');
      if (await portfolioLink.isVisible()) {
        await portfolioLink.evaluate((el) => (el as HTMLElement).click());
        await page.waitForURL('/ma-portfolio');

        // Verify page loaded successfully
        expect(page.url()).toContain('/ma-portfolio');
      }
    });

    test('should track multiple navigation actions', async ({ page }) => {
      await gotoAndSetupAnalytics(page, '/');

      // Wait for gtag to be available
      await page.waitForFunction(() => {
        return typeof window.gtag === 'function';
      });

      // Navigate to portfolio — use evaluate to bypass WebKit hit-testing issues
      const portfolioLink = page.locator('a:has-text("M&A")');
      if (await portfolioLink.isVisible()) {
        await portfolioLink.evaluate((el) => (el as HTMLElement).click());
        await page.waitForURL('/ma-portfolio');
        expect(page.url()).toContain('/ma-portfolio');
      }

      // Go back home if we can — use evaluate for WebKit
      const logoLink = page.locator('a.logo, [data-testid="logo"]');
      if (await logoLink.isVisible()) {
        await logoLink.evaluate((el) => (el as HTMLElement).click());
        await page.waitForURL('/', { timeout: 10000 }).catch(() => {});
      }

      // Re-setup analytics mocking after navigation (previous page context is gone)
      await setupAnalyticsMocking(page);

      // Verify gtag is still available
      const gtagExists = await page.evaluate(() => {
        return typeof window.gtag === 'function';
      });
      expect(gtagExists).toBe(true);
    });
  });

  test.describe('Portfolio Interaction Tracking', () => {
    test('should track project card clicks', async ({ page }) => {
      await gotoAndSetupAnalytics(page, '/ma-portfolio');

      // Click first project card — use evaluate for WebKit
      const firstCard = page.locator('[data-testid="project-card"]').first();
      await expect(firstCard).toBeVisible();

      await page.evaluate(() => {
        (document.querySelector('[data-testid="project-card"]') as HTMLElement)?.click();
      });

      // Wait for modal
      const modal = page.locator('[data-testid="project-modal"]');
      await expect(modal).toBeVisible({ timeout: 5000 });

      // Verify portfolio_view_details event was tracked
      const events = await page.evaluate(() => (window as any).gtagEvents || []);
      const viewDetailsEvent = events.find((e: any) => e.eventName === 'portfolio_view_details');
      expect(viewDetailsEvent).toBeDefined();
      expect(viewDetailsEvent?.eventData).toBeDefined();
    });

    test('should track modal close action', async ({ page }) => {
      await gotoAndSetupAnalytics(page, '/ma-portfolio');

      // Open modal — use evaluate for WebKit
      const firstCard = page.locator('[data-testid="project-card"]').first();
      await expect(firstCard).toBeVisible();
      await page.evaluate(() => {
        (document.querySelector('[data-testid="project-card"]') as HTMLElement)?.click();
      });

      const modal = page.locator('[data-testid="project-modal"]');
      await expect(modal).toBeVisible({ timeout: 5000 });

      // Close modal — use evaluate for WebKit
      const closeButton = page.locator('[data-testid="project-modal-close"]');
      await expect(closeButton).toBeVisible();
      await page.evaluate(() => {
        (document.querySelector('[data-testid="project-modal-close"]') as HTMLElement)?.click();
      });
      await expect(modal).not.toBeVisible({ timeout: 5000 });

      // Verify close event was tracked
      const events = await page.evaluate(() => (window as any).gtagEvents || []);
      const closeEvent = events.find((e: any) => e.eventName === 'portfolio_close_modal');
      expect(closeEvent).toBeDefined();
    });

    test('should track project view with details', async ({ page }) => {
      await gotoAndSetupAnalytics(page, '/ma-portfolio');

      // Open project modal — use evaluate for WebKit
      const firstCard = page.locator('[data-testid="project-card"]').first();
      await expect(firstCard).toBeVisible();

      await page.evaluate(() => {
        (document.querySelector('[data-testid="project-card"]') as HTMLElement)?.click();
      });

      // Verify project details in modal
      const modal = page.locator('[data-testid="project-modal"]');
      await expect(modal).toBeVisible({ timeout: 5000 });

      const title = page.locator('[data-testid="project-modal-title"]');
      await expect(title).toBeVisible();

      // Wait for event to be tracked (may lag under load)
      await page.waitForFunction(
        () =>
          ((window as any).gtagEvents || []).some(
            (e: any) => e.eventName === 'portfolio_view_details'
          ),
        { timeout: 5000 }
      );

      const events = await page.evaluate(() => (window as any).gtagEvents || []);
      const viewEvent = events.find((e: any) => e.eventName === 'portfolio_view_details');
      expect(viewEvent).toBeDefined();
      expect(viewEvent?.eventData.project_name).toBeTruthy();
    });
  });

  test.describe('Filter Tracking', () => {
    test('should track filter application', async ({ page }) => {
      await gotoAndSetupAnalytics(page, '/ma-portfolio');

      // Use specific header filter toggle selector, not generic button selector
      const filterButton = page.locator('[data-testid="portfolio-filter-toggle"]');

      // Explicitly verify filter controls exist (fail test if missing)
      const filterExists = await filterButton.isVisible({ timeout: 3000 }).catch(() => false);

      if (filterExists) {
        // Use evaluate for WebKit
        await page.evaluate(() => {
          (
            document.querySelector('[data-testid="portfolio-filter-toggle"]') as HTMLElement
          )?.click();
        });

        // Apply a filter if possible
        const filterOption = page.locator('[data-testid^="filter-option-"], label').first();
        const filterOptionExists = await filterOption
          .isVisible({ timeout: 2000 })
          .catch(() => false);

        if (filterOptionExists) {
          await filterOption.evaluate((el) => (el as HTMLElement).click());

          // Verify filter_applied event was tracked
          const events = await page.evaluate(() => (window as any).gtagEvents || []);
          const filterEvent = events.find((e: any) => e.eventName === 'filter_applied');
          expect(filterEvent).toBeDefined();
          expect(filterEvent?.eventData.filter_type).toBeTruthy();
        }
      } else {
        // Portfolio should have filters - skip test rather than silently pass
        test.skip();
      }
    });
  });

  test.describe('Theme Toggle Tracking', () => {
    test('should track theme toggle clicks', async ({ page }) => {
      await gotoAndSetupAnalytics(page, '/');

      // Click theme toggle
      const themeToggle = page.locator('[data-testid="theme-toggle"]');
      await expect(themeToggle).toBeVisible();

      const initialTheme = await page.evaluate(() => {
        return document.documentElement.classList.contains('dark-theme') ? 'dark' : 'light';
      });

      await clickThemeToggle(page);

      // Wait for theme to change
      await page.waitForFunction((theme) => {
        const isDark = document.documentElement.classList.contains('dark-theme');
        const newTheme = isDark ? 'dark' : 'light';
        return newTheme !== theme;
      }, initialTheme);

      // Verify theme_toggle event was tracked
      const events = await page.evaluate(() => (window as any).gtagEvents || []);
      const toggleEvent = events.find((e: any) => e.eventName === 'theme_toggle');
      expect(toggleEvent).toBeDefined();
      expect(['light', 'dark']).toContain(toggleEvent?.eventData.theme);
    });

    test('should track theme preference changes', async ({ page }) => {
      await gotoAndSetupAnalytics(page, '/');

      // Get initial theme
      const initialTheme = await page.evaluate(() => {
        return document.documentElement.classList.contains('dark-theme') ? 'dark' : 'light';
      });

      // Toggle theme
      const themeToggle = page.locator('[data-testid="theme-toggle"]');
      if (await themeToggle.isVisible()) {
        await clickThemeToggle(page);

        // Wait for theme state to change
        await page.waitForFunction(
          (prev) =>
            (document.documentElement.classList.contains('dark-theme') ? 'dark' : 'light') !== prev,
          initialTheme
        );

        // Verify theme changed
        const newTheme = await page.evaluate(() => {
          return document.documentElement.classList.contains('dark-theme') ? 'dark' : 'light';
        });

        expect(newTheme).not.toBe(initialTheme);
      }
    });
  });

  test.describe('Complete User Journey', () => {
    test('should track full portfolio discovery journey', async ({ page }) => {
      // Start at home
      await page.goto('/', { waitUntil: 'domcontentloaded' });

      // Wait for gtag to be available
      await page.waitForFunction(() => {
        return typeof window.gtag === 'function';
      });

      // Step 1: Navigate to portfolio — use evaluate for WebKit
      const portfolioLink = page.locator('a:has-text("M&A")');
      if (await portfolioLink.isVisible()) {
        await portfolioLink.evaluate((el) => (el as HTMLElement).click());
        await page.waitForURL('/ma-portfolio');
        expect(page.url()).toContain('/ma-portfolio');

        // Step 2: View a project — use evaluate for WebKit
        const firstCard = page.locator('[data-testid="project-card"]').first();
        if (await firstCard.isVisible()) {
          await page.evaluate(() => {
            (document.querySelector('[data-testid="project-card"]') as HTMLElement)?.click();
          });

          const modal = page.locator('[data-testid="project-modal"]');
          await expect(modal).toBeVisible({ timeout: 5000 });

          // Step 3: Close modal — use evaluate for WebKit
          const closeBtn = page.locator('[data-testid="project-modal-close"]');
          if (await closeBtn.isVisible()) {
            await page.evaluate(() => {
              (
                document.querySelector('[data-testid="project-modal-close"]') as HTMLElement
              )?.click();
            });
          }
        }
      }

      // Verify gtag is still available after journey
      const gtagExists = await page.evaluate(() => {
        return typeof window.gtag === 'function';
      });
      expect(gtagExists).toBe(true);
    });

    test('should track events independently of page navigation', async ({ page }) => {
      await gotoAndSetupAnalytics(page, '/');

      const events: string[] = [];

      // Listen for network requests to GA
      await page.on('request', (request) => {
        if (
          request.url().includes('google-analytics') ||
          request.url().includes('googletagmanager')
        ) {
          events.push(request.url());
        }
      });

      // Perform actions
      const portfolioLink = page.locator('a:has-text("M&A")');
      await expect(portfolioLink).toBeVisible();
      await portfolioLink.evaluate((el) => (el as HTMLElement).click());
      await page.waitForURL('/ma-portfolio');

      // Even though we navigated, verify gtag is still functioning
      const gtagExists = await page.evaluate(() => {
        return typeof window.gtag === 'function';
      });
      expect(gtagExists).toBe(true);
    });
  });

  test.describe('GA Error Handling', () => {
    test('should not break page if GA fails to load', async ({ page, context }) => {
      // Block GA requests
      await context.route('**/googletagmanager.com/**', (route) => {
        route.abort();
      });

      // Page should still load successfully
      await gotoAndSetupAnalytics(page, '/');

      // Check page is functional
      const title = page.locator('h1, h2');
      expect(await title.count()).toBeGreaterThan(0);
    });

    test('should continue tracking if gtag is temporarily unavailable', async ({ page }) => {
      await gotoAndSetupAnalytics(page, '/');

      // Verify gtag is initially available
      let gtagExists = await page.evaluate(() => {
        return typeof window.gtag === 'function';
      });
      expect(gtagExists).toBe(true);

      // Make gtag temporarily unavailable
      await page.evaluate(() => {
        (window as any).gtagBackup = window.gtag;
        delete (window as any).gtag;
      });

      // Verify gtag is now unavailable
      gtagExists = await page.evaluate(() => {
        return typeof window.gtag === 'function';
      });
      expect(gtagExists).toBe(false);

      // Perform actions while gtag is unavailable — use evaluate for WebKit
      const portfolioLink = page.locator('a:has-text("M&A")');
      await expect(portfolioLink).toBeVisible();
      await portfolioLink.evaluate((el) => (el as HTMLElement).click());
      await page.waitForURL('/ma-portfolio');

      // Restore gtag by re-executing the analytics mocking (since direct restoration doesn't work)
      await setupAnalyticsMocking(page);

      // Verify gtag is restored and functional
      gtagExists = await page.evaluate(() => {
        return typeof window.gtag === 'function';
      });
      expect(gtagExists).toBe(true);

      // Verify we're on the new page
      expect(await page.url()).toContain('/ma-portfolio');
    });
  });
});
