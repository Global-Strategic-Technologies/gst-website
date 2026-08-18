import { test, expect, type Page } from '@playwright/test';
import { openFilterDrawer, waitForDrawerGap } from './helpers/portfolio';

test.describe('Filter Drawer Z-Index & Layering - MA Portfolio Page', () => {
  test.beforeEach(async ({ page }) => {
    // domcontentloaded is reliable under parallel worker contention; networkidle
    // can time out when many workers share the same dev server.
    await page.goto('/ma-portfolio/', { waitUntil: 'domcontentloaded' });
    // Wait for portfolio initialization
    await page.waitForFunction(() => (window as any).__portfolioInitialized === true, {
      timeout: 10000,
    });
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
 * BL-137 — the drawer's mobile treatment.
 *
 * The rules for it were authored in PortfolioHeader.astro and StickyControls
 * .astro, neither of which renders the drawer, so Astro's scoping attribute
 * never matched and none of them applied: at 375px the drawer computed
 * `width: 350px; border-left: 2px; max-height: none` — the desktop side panel.
 * They now live in filter.css, and these are the rendered measurements that
 * prove it, since nothing about the authored CSS can.
 *
 * Viewports come from `test.use` at describe scope rather than setViewportSize
 * in a beforeEach: it applies before the page exists, so the media query is in
 * force at first render with no ordering hazard.
 *
 * Widths are asserted against documentElement.clientWidth, never the test.use
 * argument — `width: 100%` resolves against the initial containing block, which
 * excludes the classic scrollbar gutter, and that gutter differs by engine.
 */
test.describe('Filter Drawer Mobile Treatment (BL-137)', () => {
  async function gotoPortfolio(page: Page) {
    await page.goto('/ma-portfolio/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => (window as any).__portfolioInitialized === true, {
      timeout: 10000,
    });
  }

  /** Resolve --spacing-md to px. Out-of-flow so it cannot grow the document. */
  async function spacingMdPx(page: Page): Promise<number> {
    return page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;top:-9999px;width:1px;height:var(--spacing-md)';
      document.body.appendChild(probe);
      const h = probe.getBoundingClientRect().height;
      probe.remove();
      return h;
    });
  }

  test.describe('at 375px — full-width sheet', () => {
    test.use({ viewport: { width: 375, height: 700 } });

    test('closed drawer sits a full viewport width off-screen', async ({ page }) => {
      await gotoPortfolio(page);

      const { right, clientWidth } = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="portfolio-filter-drawer"]')!;
        return {
          right: parseFloat(getComputedStyle(el).right),
          clientWidth: document.documentElement.clientWidth,
        };
      });

      // `right: -100%`, not the desktop rule's -400px.
      expect(right).toBeGreaterThanOrEqual(-clientWidth - 2);
      expect(right).toBeLessThanOrEqual(-clientWidth + 2);
    });

    test('open drawer is a full-width sheet with a top border, not a side panel', async ({
      page,
    }) => {
      await gotoPortfolio(page);
      await openFilterDrawer(page);

      const styles = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="portfolio-filter-drawer"]')!;
        const cs = getComputedStyle(el);
        return {
          width: parseFloat(cs.width),
          borderLeftWidth: cs.borderLeftWidth,
          borderTopWidth: cs.borderTopWidth,
          clientWidth: document.documentElement.clientWidth,
        };
      });

      expect(Math.abs(styles.width - styles.clientWidth)).toBeLessThanOrEqual(1);
      expect(styles.borderLeftWidth).toBe('0px');
      expect(styles.borderTopWidth).toBe('2px');
    });
  });

  test.describe('at 600px — the tablet band', () => {
    test.use({ viewport: { width: 600, height: 700 } });

    // Pins the 768px block, which had never shipped at all.
    test('open drawer is full-width on tablets too', async ({ page }) => {
      await gotoPortfolio(page);
      await openFilterDrawer(page);

      const styles = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="portfolio-filter-drawer"]')!;
        const cs = getComputedStyle(el);
        return {
          width: parseFloat(cs.width),
          borderLeftWidth: cs.borderLeftWidth,
          clientWidth: document.documentElement.clientWidth,
        };
      });

      expect(Math.abs(styles.width - styles.clientWidth)).toBeLessThanOrEqual(1);
      expect(styles.borderLeftWidth).toBe('0px');
    });
  });

  test.describe('at 400px — the bottom sheet', () => {
    // 700px tall is chosen so the drawer's content (measured at 763px) genuinely
    // exceeds the 85% cap (595px). Without that the cap assertions below would
    // be upper bounds nothing tests, and the scroll probe could not hold.
    test.use({ viewport: { width: 400, height: 700 } });

    test('the 85% cap binds at rest and the sheet is anchored to the viewport bottom', async ({
      page,
    }) => {
      await gotoPortfolio(page);
      await openFilterDrawer(page);

      const box = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="portfolio-filter-drawer"]')!;
        const r = el.getBoundingClientRect();
        return { height: r.height, bottom: r.bottom, innerHeight: window.innerHeight };
      });

      // Rendered height, not computed max-height: per CSSOM `max-height` is not
      // among the properties whose resolved value is the used value, so
      // getComputedStyle returns the computed value and a percentage computes to
      // itself — every engine returns the literal `clamp(...)` string. `height`
      // IS a used value. Since the content exceeds the cap, this single
      // assertion proves both that the declaration applies and that it binds.
      expect(Math.abs(box.height - 0.85 * box.innerHeight)).toBeLessThanOrEqual(1);
      expect(Math.abs(box.bottom - box.innerHeight)).toBeLessThanOrEqual(1);
    });

    test('the content area scrolls rather than clipping its chips', async ({ page }) => {
      await gotoPortfolio(page);
      await openFilterDrawer(page);

      // The drawer is `overflow: hidden`, so if .drawer-content were not
      // scrollable the last chips would simply be unreachable.
      const scrollable = await page.evaluate(() => {
        const content = document.querySelector('.drawer-content') as HTMLElement;
        return content.scrollHeight > content.clientHeight;
      });
      expect(scrollable, '.drawer-content must be scrollable').toBe(true);

      const lastChipInside = await page.evaluate(() => {
        const drawer = document.querySelector('[data-testid="portfolio-filter-drawer"]')!;
        const content = drawer.querySelector('.drawer-content') as HTMLElement;
        content.scrollTop = content.scrollHeight;
        const chips = drawer.querySelectorAll('#theme-chips .filter-chip');
        const last = chips[chips.length - 1].getBoundingClientRect();
        const d = drawer.getBoundingClientRect();
        return last.top >= d.top - 1 && last.bottom <= d.bottom + 1;
      });
      expect(lastChipInside, 'the last theme chip must be reachable by scrolling').toBe(true);
    });

    test('the sheet shrinks as the footer arrives, keeping its top edge on screen', async ({
      page,
    }) => {
      await gotoPortfolio(page);
      await openFilterDrawer(page);

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await waitForDrawerGap(page);

      const spacingMd = await spacingMdPx(page);
      const m = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="portfolio-filter-drawer"]')!;
        const header = el.querySelector('.drawer-header')!.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        return {
          top: r.top,
          height: r.height,
          headerTop: header.top,
          headerBottom: header.bottom,
          innerHeight: window.innerHeight,
          clearance: parseFloat(getComputedStyle(el).getPropertyValue('--drawer-footer-clearance')),
        };
      });

      // The height identity, which holds whichever of the clamp's three terms
      // binds. Asserting `top === spacingMd` instead would only hold while the
      // MIDDLE term binds; the real clearance sits close enough to that
      // boundary that a slightly shorter footer would turn it red for no defect.
      const expected = Math.max(
        0.3 * m.innerHeight,
        Math.min(m.innerHeight - m.clearance - spacingMd, 0.85 * m.innerHeight)
      );
      expect(Math.abs(m.height - expected)).toBeLessThanOrEqual(1);

      // The regression this exists for: with a clearance-blind cap the box only
      // moved up, so its top — and the close button in the header — left the
      // viewport.
      expect(m.top).toBeGreaterThanOrEqual(spacingMd - 1);
      expect(m.headerTop).toBeGreaterThanOrEqual(0);
      expect(m.headerBottom).toBeLessThanOrEqual(m.innerHeight);
    });

    test('a closed drawer keeps its controls out of the tab order', async ({ page }) => {
      await gotoPortfolio(page);

      // Focus reachability, not a CSS proxy: the point is that keyboard focus
      // cannot walk into an off-screen panel.
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
});
