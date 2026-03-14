import { test, expect, devices } from '@playwright/test';

// Run all tests in this file with iPhone 12 viewport
test.use({ ...devices['iPhone 12'] });

/**
 * Helper: click an SVG path element via dispatchEvent.
 */
async function clickSvgPath(page: import('@playwright/test').Page, selector: string): Promise<void> {
  await page.locator(selector).first().waitFor({ state: 'attached' });
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, selector);
}

/**
 * Wait for D3 map paths to finish rendering.
 */
async function waitForMapReady(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(() => document.querySelectorAll('.country-path').length > 0);
}

/**
 * Helper: dismiss the bottom sheet by programmatically clicking the overlay.
 * The overlay (z-index: 50) sits below the panel (z-index: 60), so coordinate-based
 * clicks land on the panel instead. Use dispatchEvent to bypass hit testing.
 */
async function dismissBottomSheet(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    document.getElementById('bottomSheetOverlay')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
  });
  await page.waitForFunction(() => {
    const el = document.getElementById('compliancePanel');
    return el && !el.classList.contains('bottom-sheet--open');
  });
}

/**
 * Reusable helper: open bottom sheet via two-tap flow and wait for transition to complete.
 * Waits for the CSS transform to settle (translateY(100%) → translateY(0)) per best practices §5.
 */
async function openBottomSheetFor(page: import('@playwright/test').Page, alpha3: string): Promise<void> {
  await clickSvgPath(page, `[data-alpha3="${alpha3}"].country-path--active`);
  await page.waitForFunction(() => {
    const el = document.getElementById('mapTapBar');
    return el && !el.hidden;
  });
  // Use evaluate for WebKit mobile hit-testing
  await page.evaluate(() => {
    (document.getElementById('tapBarAction') as HTMLElement)?.click();
  });

  // Wait for both the class AND the CSS transform to reach final value
  await page.waitForFunction(() => {
    const el = document.getElementById('compliancePanel');
    if (!el || !el.classList.contains('bottom-sheet--open')) return false;
    const transform = window.getComputedStyle(el).transform;
    // translateY(0) computes to 'none' or identity matrix
    return transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)';
  }, undefined, { timeout: 5000 });
}

test.describe('Regulatory Map — Mobile UX', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/hub/tools/regulatory-map', { waitUntil: 'domcontentloaded' });
    await waitForMapReady(page);
  });

  test.describe('1. Bottom Sheet Panel', () => {
    test('should open bottom sheet when selecting a region on mobile', async ({ page }) => {
      const panel = page.locator('[data-testid="compliance-panel"]');

      await openBottomSheetFor(page, 'BRA');

      // Panel should be visible and contain regulation content
      await expect(panel).toBeVisible();
      const cards = await page.locator('.reg-card').count();
      expect(cards).toBeGreaterThan(0);
    });

    test('should show overlay when bottom sheet opens', async ({ page }) => {
      await openBottomSheetFor(page, 'BRA');

      const overlay = page.locator('#bottomSheetOverlay');
      await expect(overlay).toBeVisible();
    });

    test('should close bottom sheet when clicking overlay', async ({ page }) => {
      await openBottomSheetFor(page, 'BRA');

      // Dismiss via overlay
      await dismissBottomSheet(page);
    });

    test('should display drag handle on mobile', async ({ page }) => {
      await openBottomSheetFor(page, 'BRA');

      // Drag handle should be visible on mobile
      const handle = page.locator('#bottomSheetHandle');
      const display = await handle.evaluate(el => window.getComputedStyle(el).display);
      expect(display).not.toBe('none');
    });
  });

  test.describe('2. Tap Bar (Two-Tap Flow)', () => {
    test('should show tap bar with region name on first tap', async ({ page }) => {
      await clickSvgPath(page, '[data-alpha3="BRA"].country-path--active');

      await page.waitForFunction(() => {
        const el = document.getElementById('mapTapBar');
        return el && !el.hidden;
      });

      const tapBarName = page.locator('#tapBarName');
      await expect(tapBarName).toHaveText('Brazil');
    });

    test('should show "View details" button in tap bar', async ({ page }) => {
      await clickSvgPath(page, '[data-alpha3="BRA"].country-path--active');

      await page.waitForFunction(() => {
        const el = document.getElementById('mapTapBar');
        return el && !el.hidden;
      });

      const actionBtn = page.locator('#tapBarAction');
      await expect(actionBtn).toBeVisible();
      await expect(actionBtn).toHaveText('View details');
    });

    test('should remove CTA prompt after first tap interaction', async ({ page }) => {
      // CTA should exist initially
      const cta = page.locator('#mapCta');
      await expect(cta).toBeVisible();

      // First tap on a region
      await clickSvgPath(page, '[data-alpha3="BRA"].country-path--active');

      // CTA should be removed from the DOM
      await page.waitForFunction(() => !document.getElementById('mapCta'));
      await expect(cta).toBeHidden();
    });
  });

  test.describe('3. Quick-Zoom Buttons', () => {
    test('should display quick-zoom buttons on mobile', async ({ page }) => {
      const quickZoom = page.locator('#mapQuickZoom');
      const display = await quickZoom.evaluate(el => window.getComputedStyle(el).display);
      expect(display).not.toBe('none');
    });

    test('should have all four region buttons', async ({ page }) => {
      const buttons = page.locator('.quick-zoom-btn');
      const count = await buttons.count();
      expect(count).toBe(4);

      const texts = await buttons.allTextContents();
      expect(texts).toContain('AMR');
      expect(texts).toContain('EUR');
      expect(texts).toContain('APAC');
      expect(texts).toContain('MEA');
    });

    test('should zoom the map when clicking a quick-zoom button', async ({ page }) => {
      const mapGroup = page.locator('#mapSvg g').first();
      const transformBefore = await mapGroup.getAttribute('transform');

      // Click "Europe" quick-zoom — use evaluate for WebKit mobile
      await page.evaluate(() => {
        (document.querySelector('.quick-zoom-btn[data-region="europe"]') as HTMLElement)?.click();
      });

      // Wait for D3 zoom transition to change the transform
      await page.waitForFunction((before) => {
        const g = document.querySelector('#mapSvg g');
        return g && g.getAttribute('transform') !== before;
      }, transformBefore);

      const transformAfter = await mapGroup.getAttribute('transform');
      expect(transformAfter).not.toBe(transformBefore);
    });
  });

  test.describe('4. Zoom Button Touch Targets', () => {
    test('should have 44px minimum zoom button size for touch accessibility', async ({ page }) => {
      const zoomIn = page.locator('#zoomIn');
      const box = await zoomIn.boundingBox();

      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    });
  });

  test.describe('5. Legend Positioning', () => {
    test('should render legend inline (not overlapping map) on mobile', async ({ page }) => {
      const legend = page.locator('.map-legend');
      const position = await legend.evaluate(el => window.getComputedStyle(el).position);

      // On mobile, legend should be static (inline) not absolute/fixed
      expect(position).toBe('static');
    });
  });

  test.describe('6. Filter Deselection on Mobile', () => {
    test('should close bottom sheet when filter removes selected region regulations', async ({ page }) => {
      // Two-tap to open Thailand (has data-privacy + cybersecurity, NOT industry-compliance)
      await openBottomSheetFor(page, 'THA');

      // Verify bottom sheet is open with regulation content
      const panel = page.locator('[data-testid="compliance-panel"]');
      await expect(panel).toBeVisible();

      // Close bottom sheet first — overlay covers filter chips on mobile
      await dismissBottomSheet(page);

      // Switch to Industry Compliance — Thailand has no industry regs
      // Use evaluate to bypass hit-testing issues on mobile viewport
      await page.evaluate(() => {
        const chip = document.querySelector('.filter-chip[data-category="industry-compliance"]');
        if (chip) (chip as HTMLElement).click();
      });

      // Bottom sheet should not reopen — panel must not have the open class
      await page.waitForFunction(() => {
        const el = document.getElementById('compliancePanel');
        return el && !el.classList.contains('bottom-sheet--open');
      });

      // Selected path highlight should be cleared (region deselected)
      const selectedPaths = await page.locator('.country-path--selected').count();
      expect(selectedPaths).toBe(0);
    });
  });
});
