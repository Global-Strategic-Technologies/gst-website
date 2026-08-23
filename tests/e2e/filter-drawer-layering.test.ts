import { test, expect } from '@playwright/test';
import { gotoPortfolio, openFilterDrawer, waitForDrawerGap } from './helpers/portfolio';

test.describe('Filter Drawer Z-Index & Layering - MA Portfolio Page', () => {
  test.beforeEach(async ({ page }) => {
    await gotoPortfolio(page);
  });

  test('should verify filter drawer is initially hidden with correct positioning', async ({
    page,
  }) => {
    const drawer = page.locator('[data-testid="portfolio-filter-drawer"]');

    // Get the initial right position (should be negative/off-screen)
    const initialRight = await drawer.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      // Parse the right value to get the numeric part
      const rightValue = parseFloat(styles.right);
      return rightValue;
    });

    // The drawer should be positioned off-screen (negative right value)
    expect(initialRight).toBeLessThan(0);

    // The open class should not be present
    const hasOpenClass = await drawer.evaluate((el) => el.classList.contains('open'));
    expect(hasOpenClass).toBe(false);
  });

  test('should open filter drawer when filter button is clicked', async ({ page }) => {
    const filterButton = page.locator('[data-testid="portfolio-filter-toggle"]');
    const drawer = page.locator('[data-testid="portfolio-filter-drawer"]');

    await openFilterDrawer(page);

    // Verify the drawer has the open class
    const hasOpenClass = await drawer.evaluate((el) => el.classList.contains('open'));
    expect(hasOpenClass).toBe(true);

    // Verify the drawer is visible and positioned on screen
    const boundingBox = await drawer.boundingBox();
    expect(boundingBox).not.toBeNull();
    if (boundingBox) {
      // Drawer should be visible somewhere on the right side of the screen
      expect(boundingBox.width).toBeGreaterThan(0);
      expect(boundingBox.height).toBeGreaterThan(0);
    }

    // Verify aria-expanded is true on the toggle button
    const ariaExpanded = await filterButton.getAttribute('aria-expanded');
    expect(ariaExpanded).toBe('true');
  });

  test('should close filter drawer when close button is clicked', async ({ page }) => {
    const filterButton = page.locator('[data-testid="portfolio-filter-toggle"]');
    const drawer = page.locator('[data-testid="portfolio-filter-drawer"]');

    // Open the drawer
    await openFilterDrawer(page);

    // Verify it's open
    let hasOpenClass = await drawer.evaluate((el) => el.classList.contains('open'));
    expect(hasOpenClass).toBe(true);

    // Click the close button — use evaluate for WebKit
    await page.evaluate(() => {
      (document.querySelector('[data-testid="portfolio-drawer-close"]') as HTMLElement)?.click();
    });

    // Wait for the open class to be removed (transition complete)
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="portfolio-filter-drawer"]');
      return el && !el.classList.contains('open');
    });

    // Verify the drawer is closed
    hasOpenClass = await drawer.evaluate((el) => el.classList.contains('open'));
    expect(hasOpenClass).toBe(false);

    // Verify aria-expanded is false on the toggle button
    const ariaExpanded = await filterButton.getAttribute('aria-expanded');
    expect(ariaExpanded).toBe('false');
  });

  test('should close filter drawer when overlay is clicked', async ({ page }) => {
    const filterButton = page.locator('[data-testid="portfolio-filter-toggle"]');
    const drawer = page.locator('[data-testid="portfolio-filter-drawer"]');
    const overlay = page.locator('[data-testid="portfolio-filter-overlay"]');

    // Open the drawer
    await openFilterDrawer(page);

    // Verify it's open
    let hasOpenClass = await drawer.evaluate((el) => el.classList.contains('open'));
    expect(hasOpenClass).toBe(true);

    // Click the overlay via dispatchEvent to avoid z-index pointer-event interception
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="portfolio-filter-overlay"]');
      if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Wait for the open class to be removed (transition complete)
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="portfolio-filter-drawer"]');
      return el && !el.classList.contains('open');
    });

    // Verify the drawer is closed
    hasOpenClass = await drawer.evaluate((el) => el.classList.contains('open'));
    expect(hasOpenClass).toBe(false);

    // Verify the overlay is also closed
    const overlayHasOpenClass = await overlay.evaluate((el) => el.classList.contains('open'));
    expect(overlayHasOpenClass).toBe(false);

    // Verify aria-expanded is false
    const ariaExpanded = await filterButton.getAttribute('aria-expanded');
    expect(ariaExpanded).toBe('false');
  });

  test('should verify filter button toggle state changes correctly', async ({ page }) => {
    const filterButton = page.locator('[data-testid="portfolio-filter-toggle"]');

    // Initial state should be collapsed
    let ariaExpanded = await filterButton.getAttribute('aria-expanded');
    expect(ariaExpanded).toBe('false');

    // Click to open
    await openFilterDrawer(page);

    // Wait for drawer to fully open (class + aria state)
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-testid="portfolio-filter-overlay"]');
        return el && el.classList.contains('open');
      },
      { timeout: 10000 }
    );

    ariaExpanded = await filterButton.getAttribute('aria-expanded');
    expect(ariaExpanded).toBe('true');

    // Close using dispatchEvent to avoid z-index pointer-event interception
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="portfolio-filter-overlay"]');
      if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Wait for drawer to close
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-testid="portfolio-filter-drawer"]');
        return el && !el.classList.contains('open');
      },
      { timeout: 10000 }
    );

    // Should be collapsed again
    ariaExpanded = await filterButton.getAttribute('aria-expanded');
    expect(ariaExpanded).toBe('false');
  });

  test('should verify drawer can be toggled multiple times', async ({ page }) => {
    const drawer = page.locator('[data-testid="portfolio-filter-drawer"]');

    // Toggle open and close 3 times
    for (let i = 0; i < 3; i++) {
      // Open
      await openFilterDrawer(page);

      let hasOpenClass = await drawer.evaluate((el) => el.classList.contains('open'));
      expect(hasOpenClass).toBe(true);

      // Close via dispatchEvent to avoid z-index pointer-event interception
      await page.evaluate(() => {
        const el = document.querySelector('[data-testid="portfolio-filter-overlay"]');
        if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Wait for drawer to close (class removed AND transition settled)
      await page.waitForFunction(
        () => {
          const el = document.querySelector('[data-testid="portfolio-filter-drawer"]');
          if (!el || el.classList.contains('open')) return false;
          const right = parseFloat(window.getComputedStyle(el).right);
          return right < -100;
        },
        { timeout: 5000 }
      );

      hasOpenClass = await drawer.evaluate((el) => el.classList.contains('open'));
      expect(hasOpenClass).toBe(false);
    }
  });

  test('should verify clear filters button is accessible and functional', async ({ page }) => {
    const clearButton = page.locator('[data-testid="clear-filters-button"]');

    // Open the drawer
    await openFilterDrawer(page);

    // Verify clear button is visible
    await expect(clearButton).toBeVisible();

    // Verify it's clickable
    const isEnabled = await clearButton.isEnabled();
    expect(isEnabled).toBe(true);
  });
});

/**
 * BL-139 — what the drawer must keep doing at narrow widths.
 *
 * BL-139 found ~270 lines of drawer CSS in two components that don't render the
 * drawer, so Astro's scoping meant none of it applied — including a full-width
 * sheet at ≤768px and a bottom sheet at ≤480px. Rendered for the first time,
 * those turned out to be worse than the 350px side panel that has always
 * shipped: full-bleed, the drawer covers the page header and the controls that
 * opened it. They were deleted rather than adopted.
 *
 * These tests hold that line. The width assertion is not decoration — it is the
 * decision, written where reintroducing the sheet would trip over it.
 */
test.describe('Filter Drawer at narrow widths (BL-139)', () => {
  test.use({ viewport: { width: 375, height: 700 } });

  test.beforeEach(async ({ page }) => {
    await gotoPortfolio(page);
  });

  test('stays a side panel rather than going full-bleed', async ({ page }) => {
    await openFilterDrawer(page);

    const m = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="portfolio-filter-drawer"]')!;
      const cs = getComputedStyle(el);
      return {
        width: parseFloat(cs.width),
        borderLeftWidth: cs.borderLeftWidth,
        clientWidth: document.documentElement.clientWidth,
      };
    });

    // Pinned to the panel width, not just "narrower than the viewport": at
    // 375px a full-bleed sheet is only ~25px wider than the panel, so a range
    // check would let a partial revival through. This number IS the ruling.
    expect(m.width, 'the drawer stays the 350px side panel').toBeCloseTo(350, 0);
    expect(m.width, 'the drawer must not span the viewport').toBeLessThan(m.clientWidth);
    expect(m.borderLeftWidth, 'the side panel keeps its left border').toBe('2px');
  });

  test('the close button is tappable, not buried under the fixed chrome', async ({ page }) => {
    await openFilterDrawer(page);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await waitForDrawerGap(page);

    // Geometry cannot see stacking. An earlier revision of BL-139 moved the
    // drawer's top edge to y=12 and passed every rect assertion while the site
    // header covered the close button completely — `main` is a stacking context
    // (`position: relative; z-index: 1` in global.css), so no z-index the drawer
    // carries can lift it over chrome that lives outside `main`. That clearance
    // is what `--drawer-top-inset` exists to hold.
    const hittable = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="portfolio-drawer-close"]');
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && (hit === el || el.contains(hit));
    });
    expect(hittable, 'the close button must not sit under the site header').toBe(true);
  });

  test('a closed drawer keeps its controls out of the tab order', async ({ page }) => {
    // Focus reachability, not a CSS proxy: an off-screen panel should not be
    // somewhere keyboard focus can walk into.
    const focusableWhenClosed = await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="portfolio-drawer-close"]') as HTMLElement;
      btn.focus();
      return document.activeElement === btn;
    });
    expect(focusableWhenClosed, 'closed drawer must not be focusable').toBe(false);

    await openFilterDrawer(page);

    const focusableWhenOpen = await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="portfolio-drawer-close"]') as HTMLElement;
      btn.focus();
      return document.activeElement === btn;
    });
    expect(focusableWhenOpen, 'open drawer must be focusable').toBe(true);
  });
});
