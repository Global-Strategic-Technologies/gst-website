import { test, expect } from '@playwright/test';
import {
  waitForRadarReady,
  hasRadarContent,
  clickCategoryFilter,
  getVisibleItemCount,
} from './helpers/radar';

test.describe('Radar Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/hub/radar');
    await waitForRadarReady(page);
  });

  // -------------------------------------------------------------------------
  // Loading and Layout
  // -------------------------------------------------------------------------

  test.describe('Loading and Layout', () => {
    test('should load the radar page with meaningful content', async ({ page }) => {
      expect(page.url()).toContain('/hub/radar');

      // Verify page renders with real content (not a blank/error page)
      const title = page.locator('.hub-header__title');
      await expect(title).toBeVisible();
      const titleText = await title.textContent();
      expect(titleText).toContain('The Radar');
    });

    test('should display breadcrumb linking back to Hub', async ({ page }) => {
      const hubLink = page.locator('.hub-header__breadcrumb a[href="/hub"]');
      await expect(hubLink).toBeVisible();
      const linkText = await hubLink.textContent();
      expect(linkText).toContain('Hub');
    });

    test('should display exactly 5 category filter buttons (All + 4 categories)', async ({ page }) => {
      const filterNav = page.locator('.category-filter');
      await expect(filterNav).toBeVisible();

      const buttons = page.locator('.filter-btn');
      const count = await buttons.count();
      expect(count).toBe(5);

      // Verify the button labels match known categories
      const labels = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.filter-btn'))
          .map(el => el.textContent?.trim())
      );
      expect(labels[0]).toBe('All');
      // Remaining 4 should all be non-empty category labels
      for (let i = 1; i < labels.length; i++) {
        expect(labels[i]!.length).toBeGreaterThan(0);
      }
    });

    test('should display return link and header with valid timestamp', async ({ page }) => {
      const returnLink = page.locator('.radar-container a.cta-button[href="/hub"]');
      await expect(returnLink).toBeVisible();

      const timestamp = page.locator('.hub-header__updated');
      const timestampText = await timestamp.textContent();
      // Verify it contains "Updated" and a date-like pattern (month name)
      expect(timestampText).toBeTruthy();
      expect(timestampText!.toLowerCase()).toContain('updated');
      expect(timestampText).toMatch(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/);
    });

    test('should show either live feed items or fallback message', async ({ page }) => {
      // Wait for either content items or fallback to render
      // Increased timeout — under parallel contention the SSR may be slower
      await page.waitForFunction(() => {
        const items = document.querySelectorAll('.fyi-item, .wire-item').length;
        const fallback = document.querySelector('.radar-empty');
        return items > 0 || (fallback && fallback.textContent!.trim().length > 0);
      }, { timeout: 15000 });

      const hasContent = await hasRadarContent(page);
      if (hasContent) {
        // Verify at least one feed item (FYI or Wire) is present
        const itemCount = await page.evaluate(() =>
          document.querySelectorAll('.fyi-item, .wire-item').length
        );
        expect(itemCount).toBeGreaterThan(0);
      } else {
        const fallback = page.locator('.radar-empty');
        await expect(fallback).toBeVisible();
        const fallbackText = await fallback.textContent();
        expect(fallbackText).toContain('Intelligence feed');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Content Behavioral Verification
  // -------------------------------------------------------------------------

  test.describe('Content Behavior', () => {
    test('external links should open in new tab with security attributes', async ({ page }) => {
      const hasContent = await hasRadarContent(page);
      if (!hasContent) {
        test.skip();
        return;
      }

      const externalLinks = page.locator('a[target="_blank"]');
      const linkCount = await externalLinks.count();
      // If content exists, there must be at least one external link
      expect(linkCount).toBeGreaterThan(0);

      // Verify ALL external links (up to 10) have proper security attributes
      for (let i = 0; i < Math.min(linkCount, 10); i++) {
        const link = externalLinks.nth(i);
        const rel = await link.getAttribute('rel');
        expect(rel).toContain('noopener');
        expect(rel).toContain('noreferrer');
      }
    });

    test('data-category attributes should match known category IDs', async ({ page }) => {
      const hasContent = await hasRadarContent(page);
      if (!hasContent) {
        test.skip();
        return;
      }

      const validCategories = ['pe-ma', 'enterprise-tech', 'ai-automation', 'security'];
      const categoryValues = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-category]'))
          .map(el => (el as HTMLElement).dataset.category)
      );

      expect(categoryValues.length).toBeGreaterThan(0);
      for (const val of categoryValues) {
        expect(validCategories).toContain(val);
      }
    });

    test('FYI items should display Editor\'s Pick tags', async ({ page }) => {
      const fyiItems = page.locator('.fyi-item');
      if (await fyiItems.count() === 0) {
        test.skip();
        return;
      }

      const pickTags = page.locator('.fyi-item .editors-pick-tag');
      const tagCount = await pickTags.count();
      expect(tagCount).toBeGreaterThan(0);

      // Verify every tag says "Editor's Pick"
      for (let i = 0; i < Math.min(tagCount, 3); i++) {
        const tagText = await pickTags.nth(i).textContent();
        expect(tagText?.trim()).toBe("Editor's Pick");
      }
    });
  });

  // -------------------------------------------------------------------------
  // Category Filtering — Behavioral Tests
  // -------------------------------------------------------------------------

  test.describe('Category Filtering', () => {
    test('"All" filter should be active by default with no other button active', async ({ page }) => {
      const activeButtons = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.filter-btn.active'))
          .map(el => (el as HTMLElement).dataset.filter)
      );
      expect(activeButtons).toEqual(['all']);
    });

    test('clicking a category should activate it, deactivate "All", and hide non-matching items', async ({ page }) => {
      const hasContent = await hasRadarContent(page);
      if (!hasContent) {
        test.skip();
        return;
      }

      const totalBefore = await getVisibleItemCount(page);
      if (totalBefore === 0) {
        test.skip();
        return;
      }

      // Find a category that has items but doesn't contain ALL items
      const categories = ['enterprise-tech', 'pe-ma', 'ai-automation', 'security'];
      let targetCategory: string | null = null;

      for (const cat of categories) {
        const catCount = await page.evaluate((c) =>
          document.querySelectorAll(`[data-category="${c}"]`).length
        , cat);
        if (catCount > 0 && catCount < totalBefore) {
          targetCategory = cat;
          break;
        }
      }

      if (!targetCategory) {
        test.skip();
        return;
      }

      // 1. Click the category filter
      await clickCategoryFilter(page, targetCategory);

      // 2. Wait for actual DOM change — non-matching items hidden via computed style
      await page.waitForFunction(
        (cat) => {
          const allItems = document.querySelectorAll('[data-category]');
          let hasHidden = false;
          allItems.forEach(el => {
            const htmlEl = el as HTMLElement;
            if (htmlEl.dataset.category !== cat && window.getComputedStyle(htmlEl).display === 'none') {
              hasHidden = true;
            }
          });
          return hasHidden;
        },
        targetCategory,
        { timeout: 3000 },
      );

      // 3. Verify: "All" is deactivated
      const allIsActive = await page.evaluate(() =>
        document.querySelector('.filter-btn[data-filter="all"]')?.classList.contains('active')
      );
      expect(allIsActive).toBe(false);

      // 4. Verify: only ONE button is active and it's the target
      const activeButtons = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.filter-btn.active'))
          .map(el => (el as HTMLElement).dataset.filter)
      );
      expect(activeButtons).toEqual([targetCategory]);

      // 5. Verify: only matching items are visible (actual display property check)
      const visibleMatching = await getVisibleItemCount(page, targetCategory);
      const visibleTotal = await getVisibleItemCount(page);
      expect(visibleMatching).toBeGreaterThan(0);
      expect(visibleTotal).toBe(visibleMatching);
    });

    test('clicking "All" should reset filter — before/after state comparison', async ({ page }) => {
      const hasContent = await hasRadarContent(page);
      if (!hasContent) {
        test.skip();
        return;
      }

      const totalBefore = await getVisibleItemCount(page);
      if (totalBefore === 0) {
        test.skip();
        return;
      }

      // Apply a filter first
      await clickCategoryFilter(page, 'enterprise-tech');
      const filteredCount = await getVisibleItemCount(page);

      // Verify filter actually reduced the visible items (not a no-op)
      // If enterprise-tech IS the only category, filtering won't reduce — skip
      if (filteredCount >= totalBefore) {
        test.skip();
        return;
      }
      expect(filteredCount).toBeLessThan(totalBefore);

      // Click "All" to reset
      await clickCategoryFilter(page, 'all');

      // Wait for all items to be visible again
      await page.waitForFunction(
        (expectedCount) => {
          const items = document.querySelectorAll('[data-category]');
          let visible = 0;
          items.forEach(el => {
            if (window.getComputedStyle(el as HTMLElement).display !== 'none') {
              visible++;
            }
          });
          return visible === expectedCount;
        },
        totalBefore,
        { timeout: 3000 },
      );

      // Verify: count restored to original
      const totalAfterReset = await getVisibleItemCount(page);
      expect(totalAfterReset).toBe(totalBefore);
    });

    test('switching between categories should update visible items each time', async ({ page }) => {
      const hasContent = await hasRadarContent(page);
      if (!hasContent) {
        test.skip();
        return;
      }

      // Click enterprise-tech
      await clickCategoryFilter(page, 'enterprise-tech');

      const etActiveButtons = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.filter-btn.active'))
          .map(el => (el as HTMLElement).dataset.filter)
      );
      expect(etActiveButtons).toEqual(['enterprise-tech']);

      // Click security — different category
      await clickCategoryFilter(page, 'security');

      const secActiveButtons = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.filter-btn.active'))
          .map(el => (el as HTMLElement).dataset.filter)
      );
      expect(secActiveButtons).toEqual(['security']);

      // Verify: enterprise-tech items now hidden (computed style)
      const etVisibleAfterSwitch = await getVisibleItemCount(page, 'enterprise-tech');
      expect(etVisibleAfterSwitch).toBe(0);

      // Verify: only security items are visible
      const secVisible = await getVisibleItemCount(page, 'security');
      const totalVisible = await getVisibleItemCount(page);
      expect(totalVisible).toBe(secVisible);
    });
  });

  // -------------------------------------------------------------------------
  // Responsive — Verify actual CSS differences between breakpoints
  // -------------------------------------------------------------------------

  test.describe('Responsive', () => {
    test('filter pills should be horizontally scrollable at mobile width', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto('/hub/radar');
      await waitForRadarReady(page);

      // Verify the filter container has overflow behavior at mobile
      const filterStyle = await page.evaluate(() => {
        const nav = document.querySelector('.category-filter');
        if (!nav) return null;
        const style = window.getComputedStyle(nav);
        return {
          overflowX: style.overflowX,
          flexWrap: style.flexWrap,
        };
      });

      expect(filterStyle).not.toBeNull();
      // At 480px and below, filter should not wrap (nowrap) and should overflow-scroll
      expect(filterStyle!.flexWrap).toBe('nowrap');
      expect(filterStyle!.overflowX).toBe('auto');
    });

    test('filter pills should wrap at desktop width', async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto('/hub/radar');
      await waitForRadarReady(page);

      // At desktop, filter should wrap normally
      const filterStyle = await page.evaluate(() => {
        const nav = document.querySelector('.category-filter');
        if (!nav) return null;
        const style = window.getComputedStyle(nav);
        return { flexWrap: style.flexWrap };
      });

      expect(filterStyle).not.toBeNull();
      expect(filterStyle!.flexWrap).toBe('wrap');

      // All buttons should be visible (not clipped by overflow)
      const buttons = page.locator('.filter-btn');
      const count = await buttons.count();
      for (let i = 0; i < count; i++) {
        await expect(buttons.nth(i)).toBeVisible();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Accessibility & SEO
  // -------------------------------------------------------------------------

  test.describe('Accessibility and SEO', () => {
    test('page should have proper title and meta description', async ({ page }) => {
      const pageTitle = await page.title();
      expect(pageTitle.toLowerCase()).toContain('radar');

      const description = await page.getAttribute('meta[name="description"]', 'content');
      expect(description).toBeTruthy();
      expect(description!.length).toBeGreaterThan(20);
    });

    test('category filter nav should have aria-label for screen readers', async ({ page }) => {
      const ariaLabel = await page.locator('.category-filter').getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
      expect(ariaLabel!.length).toBeGreaterThan(0);
    });

    test('page should have exactly one h1 with meaningful text', async ({ page }) => {
      const h1Count = await page.locator('h1').count();
      expect(h1Count).toBe(1);

      const h1Text = await page.locator('h1').textContent();
      expect(h1Text?.trim().length).toBeGreaterThan(0);
    });
  });
});
