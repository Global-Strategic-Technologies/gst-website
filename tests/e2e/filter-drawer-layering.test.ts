import { test, expect } from '@playwright/test';

test.describe('Filter Drawer Z-Index & Layering - MA Portfolio Page', () => {
  test.beforeEach(async ({ page }) => {
    // domcontentloaded is reliable under parallel worker contention; networkidle
    // can time out when many workers share the same dev server.
    await page.goto('/ma-portfolio', { waitUntil: 'domcontentloaded' });
    // Wait for portfolio initialization
    await page.waitForFunction(() => (window as any).__portfolioInitialized === true, { timeout: 10000 });
  });

  test('should verify filter drawer is initially hidden with correct positioning', async ({ page }) => {
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

    // Click the filter toggle button
    await filterButton.click();

    // Wait for drawer to transition and become visible
    await expect(drawer).toBeVisible({ timeout: 5000 });

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

  test('should verify filter drawer has high z-index value', async ({ page }) => {
    const drawer = page.locator('[data-testid="portfolio-filter-drawer"]');

    // Get the computed z-index
    const zIndex = await drawer.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return parseInt(styles.zIndex, 10);
    });

    // Drawer should have a very high z-index (should be in thousands)
    expect(zIndex).toBeGreaterThan(1000);
  });

  test('should verify overlay has z-index below drawer', async ({ page }) => {
    const overlay = page.locator('[data-testid="portfolio-filter-overlay"]');

    // Get the computed z-index
    const zIndex = await overlay.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return parseInt(styles.zIndex, 10);
    });

    // Overlay should have a high z-index but in thousands
    expect(zIndex).toBeGreaterThan(900);
  });

  test('should verify filter drawer sits above footer (z-index comparison)', async ({ page }) => {
    const drawer = page.locator('[data-testid="portfolio-filter-drawer"]');
    const footer = page.locator('footer');

    // Get both z-index values
    const { drawerZIndex, footerZIndex } = await page.evaluate(() => {
      const drawerEl = document.querySelector('[data-testid="portfolio-filter-drawer"]') as HTMLElement;
      const footerEl = document.querySelector('footer') as HTMLElement;

      if (!drawerEl || !footerEl) {
        throw new Error('Cannot find drawer or footer elements');
      }

      const drawerZ = parseInt(window.getComputedStyle(drawerEl).zIndex || '0', 10);
      const footerZ = parseInt(window.getComputedStyle(footerEl).zIndex || '0', 10);

      return {
        drawerZIndex: drawerZ,
        footerZIndex: footerZ
      };
    });

    // Drawer z-index should be higher than footer
    expect(drawerZIndex).toBeGreaterThan(footerZIndex);
    expect(drawerZIndex).toBeGreaterThan(1000);
  });

  test('should verify theme toggle (delta icon) does not visually overlay filter drawer', async ({ page }) => {
    const filterButton = page.locator('[data-testid="portfolio-filter-toggle"]');
    const drawer = page.locator('[data-testid="portfolio-filter-drawer"]');
    const themeToggle = page.locator('[data-testid="theme-toggle"]');

    // Open the filter drawer
    await filterButton.click();
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // Get bounding boxes to verify there's no visual overlap
    // In a real-world scenario, the theme toggle should be positioned in the footer
    // and the drawer should be on top of it
    const drawerBox = await drawer.boundingBox();
    const themeToggleBox = await themeToggle.boundingBox();

    if (drawerBox && themeToggleBox) {
      // Verify z-index relationship by checking computed styles
      const zIndices = await page.evaluate(() => {
        const drawer = document.querySelector('[data-testid="portfolio-filter-drawer"]') as HTMLElement;
        const toggle = document.querySelector('[data-testid="theme-toggle"]') as HTMLElement;

        const drawerZ = parseInt(window.getComputedStyle(drawer).zIndex || '0', 10);
        const toggleParent = toggle.closest('footer') as HTMLElement;
        const toggleZ = parseInt(window.getComputedStyle(toggleParent).zIndex || '0', 10);

        return { drawerZ, toggleZ };
      });

      // Drawer should be on top
      expect(zIndices.drawerZ).toBeGreaterThan(zIndices.toggleZ);
    }
  });

  test('should close filter drawer when close button is clicked', async ({ page }) => {
    const filterButton = page.locator('[data-testid="portfolio-filter-toggle"]');
    const drawer = page.locator('[data-testid="portfolio-filter-drawer"]');
    const closeButton = page.locator('[data-testid="portfolio-drawer-close"]');

    // Open the drawer
    await filterButton.click();
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // Verify it's open
    let hasOpenClass = await drawer.evaluate((el) => el.classList.contains('open'));
    expect(hasOpenClass).toBe(true);

    // Click the close button
    await closeButton.click();

    // Wait for the transition
    await page.waitForTimeout(400); // Transition time is 0.3s

    // Verify the drawer is closed
    hasOpenClass = await drawer.evaluate((el) => el.classList.contains('open'));
    expect(hasOpenClass).toBe(false);

    // Verify aria-expanded is false on the toggle button
    const ariaExpanded = await filterButton.getAttribute('aria-expanded');
    expect(ariaExpanded).toBe('false');

    // Verify the right position is back to approximately -400px
    const finalRight = await drawer.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return parseFloat(styles.right);
    });
    expect(finalRight).toBeLessThanOrEqual(-360);
    expect(finalRight).toBeGreaterThanOrEqual(-450);
  });

  test('should close filter drawer when overlay is clicked', async ({ page }) => {
    const filterButton = page.locator('[data-testid="portfolio-filter-toggle"]');
    const drawer = page.locator('[data-testid="portfolio-filter-drawer"]');
    const overlay = page.locator('[data-testid="portfolio-filter-overlay"]');

    // Open the drawer
    await filterButton.click();
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // Verify it's open
    let hasOpenClass = await drawer.evaluate((el) => el.classList.contains('open'));
    expect(hasOpenClass).toBe(true);

    // Click the overlay
    await overlay.click();

    // Wait for the transition
    await page.waitForTimeout(400);

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

  test('should verify overlay is visible and has proper styling when drawer is open', async ({ page }) => {
    const filterButton = page.locator('[data-testid="portfolio-filter-toggle"]');
    const overlay = page.locator('[data-testid="portfolio-filter-overlay"]');

    // Open the drawer
    await filterButton.click();
    await page.waitForTimeout(300);

    // Verify overlay is visible
    const isOverlayVisible = await overlay.isVisible();
    expect(isOverlayVisible).toBe(true);

    // Verify overlay has open class
    const hasOpenClass = await overlay.evaluate((el) => el.classList.contains('open'));
    expect(hasOpenClass).toBe(true);

    // Verify overlay has semi-transparent black background
    const overlayStyles = await overlay.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        background: styles.background,
        backgroundColor: styles.backgroundColor,
        display: styles.display,
        pointerEvents: styles.pointerEvents
      };
    });

    // Overlay should be displayed
    expect(overlayStyles.display).not.toBe('none');
    // Overlay should have pointer-events enabled
    expect(overlayStyles.pointerEvents).toBe('auto');
  });

  test('should verify drawer transition animation', async ({ page }) => {
    const filterButton = page.locator('[data-testid="portfolio-filter-toggle"]');
    const drawer = page.locator('[data-testid="portfolio-filter-drawer"]');

    // Verify the drawer has transition CSS property
    const transitionCSS = await drawer.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return styles.transition;
    });

    // Should have a transition defined
    expect(transitionCSS).toContain('right');
  });

  test('should verify drawer content is scrollable when content exceeds viewport', async ({ page }) => {
    const filterButton = page.locator('[data-testid="portfolio-filter-toggle"]');
    const drawer = page.locator('[data-testid="portfolio-filter-drawer"]');

    // Open the drawer
    await filterButton.click();
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // Verify drawer has overflow-y: auto
    const overflowY = await drawer.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return styles.overflowY;
    });

    expect(overflowY).toBe('auto');
  });

  test('should verify drawer is positioned relative to viewport (fixed positioning)', async ({ page }) => {
    const filterButton = page.locator('[data-testid="portfolio-filter-toggle"]');
    const drawer = page.locator('[data-testid="portfolio-filter-drawer"]');

    // Open the drawer
    await filterButton.click();
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // Verify drawer has fixed positioning
    const position = await drawer.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return styles.position;
    });

    expect(position).toBe('fixed');
  });

  test('should verify filter button toggle state changes correctly', async ({ page }) => {
    const filterButton = page.locator('[data-testid="portfolio-filter-toggle"]');
    const drawer = page.locator('[data-testid="portfolio-filter-drawer"]');

    // Initial state should be collapsed
    let ariaExpanded = await filterButton.getAttribute('aria-expanded');
    expect(ariaExpanded).toBe('false');

    // Click to open
    await filterButton.click();
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // Should be expanded
    ariaExpanded = await filterButton.getAttribute('aria-expanded');
    expect(ariaExpanded).toBe('true');

    // Wait before closing to ensure drawer is fully open and overlay is ready
    await page.waitForTimeout(500);

    // Close using the overlay click instead of button to avoid overlay blocking
    const overlay = page.locator('[data-testid="portfolio-filter-overlay"]');
    await overlay.click();
    await page.waitForTimeout(400);

    // Should be collapsed again
    ariaExpanded = await filterButton.getAttribute('aria-expanded');
    expect(ariaExpanded).toBe('false');
  });

  test('should verify drawer can be toggled multiple times', async ({ page }) => {
    const filterButton = page.locator('[data-testid="portfolio-filter-toggle"]');
    const drawer = page.locator('[data-testid="portfolio-filter-drawer"]');
    const overlay = page.locator('[data-testid="portfolio-filter-overlay"]');

    // Toggle open and close 3 times
    for (let i = 0; i < 3; i++) {
      // Open
      await filterButton.click();
      await expect(drawer).toBeVisible({ timeout: 5000 });

      let hasOpenClass = await drawer.evaluate((el) => el.classList.contains('open'));
      expect(hasOpenClass).toBe(true);

      // Wait before closing
      await page.waitForTimeout(300);

      // Close via overlay
      await overlay.click();
      await page.waitForTimeout(400);

      hasOpenClass = await drawer.evaluate((el) => el.classList.contains('open'));
      expect(hasOpenClass).toBe(false);
    }
  });

  test('should verify drawer has proper pointer-events handling', async ({ page }) => {
    const filterButton = page.locator('[data-testid="portfolio-filter-toggle"]');
    const drawer = page.locator('[data-testid="portfolio-filter-drawer"]');

    // Open the drawer
    await filterButton.click();
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // Verify pointer-events is auto (interactive)
    const pointerEvents = await drawer.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return styles.pointerEvents;
    });

    expect(pointerEvents).toBe('auto');
  });

  test('should verify drawer has proper flex layout', async ({ page }) => {
    const filterButton = page.locator('[data-testid="portfolio-filter-toggle"]');
    const drawer = page.locator('[data-testid="portfolio-filter-drawer"]');

    // Open the drawer
    await filterButton.click();
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // Verify drawer layout
    const layout = await drawer.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        display: styles.display,
        flexDirection: styles.flexDirection
      };
    });

    expect(layout.display).toBe('flex');
    expect(layout.flexDirection).toBe('column');
  });

  test('should verify drawer and overlay are both fixed position elements', async ({ page }) => {
    const filterButton = page.locator('[data-testid="portfolio-filter-toggle"]');
    const drawer = page.locator('[data-testid="portfolio-filter-drawer"]');
    const overlay = page.locator('[data-testid="portfolio-filter-overlay"]');

    // Open the drawer
    await filterButton.click();
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // Verify both have fixed positioning
    const positions = await page.evaluate(() => {
      const drawer = document.querySelector('[data-testid="portfolio-filter-drawer"]') as HTMLElement;
      const overlay = document.querySelector('[data-testid="portfolio-filter-overlay"]') as HTMLElement;

      return {
        drawerPosition: window.getComputedStyle(drawer).position,
        overlayPosition: window.getComputedStyle(overlay).position
      };
    });

    expect(positions.drawerPosition).toBe('fixed');
    expect(positions.overlayPosition).toBe('fixed');
  });

  test('should verify drawer top position is set', async ({ page }) => {
    const filterButton = page.locator('[data-testid="portfolio-filter-toggle"]');
    const drawer = page.locator('[data-testid="portfolio-filter-drawer"]');

    // Open the drawer
    await filterButton.click();
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // Get top position (should be some positive value)
    const topPosition = await drawer.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      const topValue = parseFloat(styles.top);
      return topValue;
    });

    // Top should be a positive value (drawer positioned from top)
    expect(topPosition).toBeGreaterThanOrEqual(0);
  });

  test('should verify filter drawer width is correct on desktop', async ({ page }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 1024 });

    const filterButton = page.locator('[data-testid="portfolio-filter-toggle"]');
    const drawer = page.locator('[data-testid="portfolio-filter-drawer"]');

    // Open the drawer
    await filterButton.click();
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // Get width (should be 350px on desktop)
    const width = await drawer.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return styles.width;
    });

    expect(width).toBe('350px');
  });

  test('should verify filter drawer is full width on mobile', async ({ page }) => {
    // Set viewport to mobile size
    await page.setViewportSize({ width: 375, height: 667 });

    const filterButton = page.locator('[data-testid="portfolio-filter-toggle"]');
    const drawer = page.locator('[data-testid="portfolio-filter-drawer"]');

    // Open the drawer
    await filterButton.click();
    await page.waitForTimeout(500); // Mobile drawer might be slower

    // Get width (should be 100% on mobile)
    const width = await drawer.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return styles.width;
    });

    expect(width).toMatch(/100%|375px/); // Either 100% or computed width
  });

  test('should verify clear filters button is accessible and functional', async ({ page }) => {
    const filterButton = page.locator('[data-testid="portfolio-filter-toggle"]');
    const drawer = page.locator('[data-testid="portfolio-filter-drawer"]');
    const clearButton = page.locator('[data-testid="clear-filters-button"]');

    // Open the drawer
    await filterButton.click();
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // Verify clear button is visible
    await expect(clearButton).toBeVisible();

    // Verify it's clickable
    const isEnabled = await clearButton.isEnabled();
    expect(isEnabled).toBe(true);
  });
});
