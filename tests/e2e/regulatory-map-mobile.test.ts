import { test, expect, devices } from '@playwright/test';
import { clickSvgPath, waitForMapReady } from './helpers/regulatory-map';

// Run all tests in this file with iPhone 12 viewport
test.use({ ...devices['iPhone 12'] });

/**
 * Helper: dismiss the bottom sheet by programmatically clicking the overlay.
 * The overlay (z-index: 50) sits below the panel (z-index: 60), so coordinate-based
 * clicks land on the panel instead. Use dispatchEvent to bypass hit testing.
 */
async function dismissBottomSheet(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    document
      .getElementById('bottomSheetOverlay')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForFunction(() => {
    const el = document.getElementById('compliancePanel');
    return el && !el.classList.contains('brutal-panel--sheet-open');
  });
}

/**
 * Reusable helper: open bottom sheet via two-tap flow and wait for transition to complete.
 * Waits for the CSS transform to settle (translateY(100%) → translateY(0)) per best practices §5.
 */
async function openBottomSheetFor(
  page: import('@playwright/test').Page,
  alpha3: string
): Promise<void> {
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
  await page.waitForFunction(
    () => {
      const el = document.getElementById('compliancePanel');
      if (!el || !el.classList.contains('brutal-panel--sheet-open')) return false;
      const transform = window.getComputedStyle(el).transform;
      // translateY(0) computes to 'none' or identity matrix
      return transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)';
    },
    undefined,
    { timeout: 10000 }
  );
}

// ── Group 1: Static Layout Tests ─────────────────────────────────────────────
// These verify server-rendered HTML/CSS that exists at domcontentloaded.
// No D3 rendering or regulation data needed — skip waitForMapReady entirely.
// Per TEST_BEST_PRACTICES §25: readiness gate matches test dependencies.

test.describe('Regulatory Map — Mobile Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/hub/tools/regulatory-map', { waitUntil: 'domcontentloaded' });
  });

  test('should not show CTA on mobile (tap bar provides guidance instead)', async ({ page }) => {
    const cta = page.locator('#mapCta');
    await expect(cta).toBeHidden();
  });

  test('should display quick-zoom buttons on mobile', async ({ page }) => {
    const quickZoom = page.locator('#mapQuickZoom');
    const display = await quickZoom.evaluate((el) => window.getComputedStyle(el).display);
    expect(display).not.toBe('none');
  });

  test('should have all four region buttons', async ({ page }) => {
    const buttons = page.locator('.brutal-quick-zoom');
    const count = await buttons.count();
    expect(count).toBe(4);

    const texts = await buttons.allTextContents();
    expect(texts).toContain('AMR');
    expect(texts).toContain('EUR');
    expect(texts).toContain('APAC');
    expect(texts).toContain('MEA');
  });

  test('should hide +/−/reset zoom controls on mobile (quick-zoom provides navigation)', async ({
    page,
  }) => {
    const controls = page.locator('.map-controls');
    const display = await controls.evaluate((el) => window.getComputedStyle(el).display);
    expect(display).toBe('none');
  });

  test('should have 32px minimum quick-zoom button size for touch accessibility', async ({
    page,
  }) => {
    const btn = page.locator('.brutal-quick-zoom').first();
    const box = await btn.boundingBox();

    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(32);
    expect(box!.height).toBeGreaterThanOrEqual(32);
  });

  test('should render legend inline (not overlapping map) on mobile', async ({ page }) => {
    const legend = page.locator('.brutal-legend');
    await legend.waitFor({ state: 'visible', timeout: 10000 });
    const position = await legend.evaluate((el) => window.getComputedStyle(el).position);

    // On mobile, legend should be static (inline) not absolute/fixed
    expect(position).toBe('static');
  });
});

// ── Group 2: Map Interaction Tests ───────────────────────────────────────────
// These need D3 rendering + regulation data. Wait for data-map-ready signal
// which is set after Phase B (regulation data fetched + --active classes applied).

test.describe('Regulatory Map — Mobile Interactions', () => {
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
      const cards = await page.locator('.brutal-reg-card').count();
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
      const display = await handle.evaluate((el) => window.getComputedStyle(el).display);
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
  });

  test.describe('3. Quick-Zoom Map Transform', () => {
    test('should zoom the map when clicking a quick-zoom button', async ({ page }) => {
      const mapGroup = page.locator('#mapSvg g').first();
      const transformBefore = await mapGroup.getAttribute('transform');

      // Click "Europe" quick-zoom — use evaluate for WebKit mobile
      await page.evaluate(() => {
        (
          document.querySelector('.brutal-quick-zoom[data-region="europe"]') as HTMLElement
        )?.click();
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

  test.describe('4. Filter Deselection on Mobile', () => {
    test('should close bottom sheet when filter removes selected region regulations', async ({
      page,
    }) => {
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
        const chip = document.querySelector(
          '.brutal-filter-chip[data-category="industry-compliance"]'
        );
        if (chip) (chip as HTMLElement).click();
      });

      // Bottom sheet should not reopen — panel must not have the open class
      await page.waitForFunction(() => {
        const el = document.getElementById('compliancePanel');
        return el && !el.classList.contains('brutal-panel--sheet-open');
      });

      // Selected path highlight should be cleared (region deselected)
      const selectedPaths = await page.locator('.country-path--selected').count();
      expect(selectedPaths).toBe(0);
    });
  });

  test.describe('5. FAQ / Bottom Sheet Stacking', () => {
    test('should not let FAQ section paint over the compliance panel bottom sheet', async ({
      page,
    }) => {
      // Scroll FAQ into the viewport BEFORE opening the sheet, because
      // openBottomSheet() sets body overflow:hidden which prevents further scrolling.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

      // Open bottom sheet — helpers use dispatchEvent, so they work regardless of scroll position
      await openBottomSheetFor(page, 'BRA');

      // Get the panel's bounding rect to sample points inside it
      const panelRect = await page.evaluate(() => {
        const el = document.getElementById('compliancePanel');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: r.top, left: r.left, right: r.right, bottom: r.bottom };
      });
      expect(panelRect).not.toBeNull();

      // Sample 3 horizontal points at 25%/50%/75% across the panel,
      // at 2 vertical positions (near top and midpoint).
      const xs = [0.25, 0.5, 0.75].map(
        (p) => panelRect!.left + (panelRect!.right - panelRect!.left) * p
      );
      const ys = [panelRect!.top + 20, (panelRect!.top + panelRect!.bottom) / 2];

      const hits = await page.evaluate(
        ({ xs, ys }) =>
          xs.flatMap((x) =>
            ys.map((y) => {
              const el = document.elementFromPoint(x, y);
              if (el?.closest('#compliancePanel') || el?.closest('#bottomSheetOverlay'))
                return 'panel';
              if (el?.closest('.faq-section')) return 'faq';
              return 'other';
            })
          ),
        { xs, ys }
      );

      // Every sample must hit the panel or overlay — never the FAQ section
      expect(hits.every((h) => h === 'panel')).toBe(true);
    });

    test('should allow dismissing bottom sheet when FAQ is scrolled behind it', async ({
      page,
    }) => {
      // Scroll FAQ into viewport first, then open sheet
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await openBottomSheetFor(page, 'BRA');

      // Dismiss — helper waits for brutal-panel--sheet-open class removal
      await dismissBottomSheet(page);

      // Verify body scroll is restored
      const overflow = await page.evaluate(() => document.body.style.overflow);
      expect(overflow).toBe('');
    });
  });
});
