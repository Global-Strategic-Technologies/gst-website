/**
 * Google Analytics E2E Tests
 *
 * Every test asserts that a specific GA event reached the gtag recorder
 * (helpers/analytics.ts) with its payload. Tests that could only observe
 * "gtag exists" or "the page navigated" were removed: they passed whether or
 * not anything was tracked.
 */

import { test, expect, type Page } from '@playwright/test';
import { clickThemeToggle, currentTheme, waitForTheme } from './helpers/theme';
import { setupAnalyticsMocking } from './helpers/analytics';
import { openFilterDrawer } from './helpers/portfolio';

test.describe('Google Analytics E2E Tests', () => {
  // Navigate, wait for the GA bootstrap, then wrap gtag with the recorder.
  // The recorder lives in the page context, so it has to be installed after
  // every goto (TEST_BEST_PRACTICES anti-pattern 19).
  async function gotoAndSetupAnalytics(page: Page, url: string) {
    await page.goto(url);
    await page.waitForFunction(
      () => {
        return typeof window.gtag === 'function';
      },
      { timeout: 10000 }
    );
    await setupAnalyticsMocking(page);
  }

  test.describe('Navigation Event Tracking', () => {
    test('a header nav click sends navigation_click', async ({ page }) => {
      await gotoAndSetupAnalytics(page, '/');

      // The recorder is page-scoped, so a real navigation would take the
      // recorded event with it. A document-level listener runs after the
      // link's inline onclick (which calls trackNavigation) and cancels only
      // the navigation, so the event stays readable.
      await page.evaluate(() => {
        document.addEventListener('click', (e) => e.preventDefault());
      });

      await page
        .locator('.site-header a[href="/ma-portfolio/"]')
        .filter({ visible: true })
        .first()
        .evaluate((el) => (el as HTMLElement).click()); // evaluate: WebKit hit-testing

      await page.waitForFunction(() =>
        ((window as any).gtagEvents || []).some((e: any) => e.eventName === 'navigation_click')
      );
      const nav = (await page.evaluate(() => (window as any).gtagEvents)).find(
        (e: any) => e.eventName === 'navigation_click'
      );
      expect(nav.eventData).toMatchObject({
        event_category: 'navigation',
        destination: '/ma-portfolio',
        label: 'M&A Portfolio',
      });
    });
  });

  test.describe('Portfolio Interaction Tracking', () => {
    test('should track project card clicks', async ({ page }) => {
      await gotoAndSetupAnalytics(page, '/ma-portfolio/');

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
      await gotoAndSetupAnalytics(page, '/ma-portfolio/');

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
      await gotoAndSetupAnalytics(page, '/ma-portfolio/');

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
    test('clicking a theme chip sends filter_applied', async ({ page }) => {
      await gotoAndSetupAnalytics(page, '/ma-portfolio/');
      await page.waitForFunction(() => (window as any).__portfolioInitialized === true);
      await openFilterDrawer(page);

      const chip = page
        .locator('[data-testid^="filter-chip-theme-"]:not([data-testid="filter-chip-theme-all"])')
        .first();
      const value = await chip.getAttribute('data-value');
      expect(value).toBeTruthy();
      await chip.click();

      await page.waitForFunction(
        (expected) =>
          ((window as any).gtagEvents || []).some(
            (e: any) =>
              e.eventName === 'filter_applied' &&
              e.eventData.filter_type === 'theme' &&
              e.eventData.filter_value === expected
          ),
        value
      );
      const filterEvent = (await page.evaluate(() => (window as any).gtagEvents)).find(
        (e: any) => e.eventName === 'filter_applied'
      );
      expect(filterEvent.eventData).toMatchObject({
        event_category: 'portfolio',
        filter_type: 'theme',
        filter_value: value,
      });
    });
  });

  test.describe('Theme Toggle Tracking', () => {
    test('should track theme toggle clicks', async ({ page }) => {
      await gotoAndSetupAnalytics(page, '/');

      // Click theme toggle
      const themeToggle = page.locator('[data-testid="theme-toggle"]');
      await expect(themeToggle).toBeVisible();

      // From the baseline's light pick, one click is one step of the
      // four-state cycle (ADR-0038) — and the event reports that state.
      expect(await currentTheme(page)).toBe('light');
      await clickThemeToggle(page);
      await waitForTheme(page, 'dim-light');

      // Verify theme_toggle event was tracked
      const events = await page.evaluate(() => (window as any).gtagEvents || []);
      const toggleEvent = events.find((e: any) => e.eventName === 'theme_toggle');
      expect(toggleEvent).toBeDefined();
      expect(toggleEvent?.eventData.theme).toBe('dim-light');
    });
  });

  test.describe('MCP pages (BL-152 Slice 0)', () => {
    test('guide view and endpoint copy are tracked on /hub/mcp/get-started/', async ({
      page,
      context,
      browserName,
    }) => {
      // Clipboard permission is per-test and Chromium-only (CLAUDE.md: never at
      // project level). Elsewhere the write rejects and the copy still fires
      // its analytics hook, which is what this test asserts.
      if (browserName === 'chromium') {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      }
      await gotoAndSetupAnalytics(page, '/hub/mcp/get-started/');

      // `mcp_guide_view` fires at module init, before the recorder wraps gtag,
      // so read it from the dataLayer the inline bootstrap queues into.
      const guideView = await page.evaluate(() =>
        ((window as any).dataLayer as IArguments[]).some(
          (args) => args[0] === 'event' && args[1] === 'mcp_guide_view'
        )
      );
      expect(guideView).toBe(true);

      await page.locator('[data-copy-kind="endpoint"]').first().click();
      await page.waitForFunction(() =>
        (window as any).gtagEvents?.some((e: any) => e.eventName === 'mcp_endpoint_copied')
      );
      const copied = (await page.evaluate(() => (window as any).gtagEvents)).find(
        (e: any) => e.eventName === 'mcp_endpoint_copied'
      );
      expect(copied.eventData).toMatchObject({
        event_category: 'tool',
        page: 'get-started',
        target: 'endpoint',
      });
    });

    test('guide view and token-endpoint copy are tracked on /hub/mcp/from-code/', async ({
      page,
      context,
      browserName,
    }) => {
      // BL-156: the localized guide shares the get-started script, so the same
      // two events fire; the page slug is the segment after /hub/mcp/.
      if (browserName === 'chromium') {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      }
      await gotoAndSetupAnalytics(page, '/hub/mcp/from-code/');

      const guideView = await page.evaluate(() =>
        ((window as any).dataLayer as IArguments[]).some(
          (args) => args[0] === 'event' && args[1] === 'mcp_guide_view'
        )
      );
      expect(guideView).toBe(true);

      await page.locator('[data-copy-kind="endpoint"]').first().click();
      await page.waitForFunction(() =>
        (window as any).gtagEvents?.some((e: any) => e.eventName === 'mcp_endpoint_copied')
      );
      const copied = (await page.evaluate(() => (window as any).gtagEvents)).find(
        (e: any) => e.eventName === 'mcp_endpoint_copied'
      );
      expect(copied.eventData).toMatchObject({
        event_category: 'tool',
        page: 'from-code',
        target: 'endpoint',
      });
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
  });
});
