import { test, expect, type Page } from '@playwright/test';
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
  /**
   * Resolve a length-valued custom property to px, as seen by the drawer.
   *
   * The probe is appended INSIDE the drawer, not the body: `--drawer-top-inset`
   * is declared on `.filter-drawer` rather than `:root`, so a probe elsewhere in
   * the tree cannot see it and `var()` would fall back to nothing — silently
   * yielding 0 and making every assertion built on it wrong in the same
   * direction. Out-of-flow so it cannot affect layout or document height.
   */
  async function drawerTokenPx(page: Page, name: string): Promise<number> {
    const px = await page.evaluate((prop) => {
      const drawer = document.querySelector('[data-testid="portfolio-filter-drawer"]');
      if (!drawer) return NaN;
      const probe = document.createElement('div');
      probe.style.cssText = `position:fixed;top:-9999px;width:1px;height:var(${prop})`;
      drawer.appendChild(probe);
      const h = probe.getBoundingClientRect().height;
      probe.remove();
      return h;
    }, name);
    // A token that resolves to 0 means the probe could not see it. Fail loudly
    // rather than letting every downstream assertion quietly shift by that much.
    expect(px, `${name} must resolve to a non-zero length`).toBeGreaterThan(0);
    return px;
  }

  /** height === max(30%, min(100% - clearance - inset, 85%)), whichever term binds. */
  function expectedHeight(innerHeight: number, clearance: number, inset: number): number {
    return Math.max(
      0.3 * innerHeight,
      Math.min(innerHeight - clearance - inset, 0.85 * innerHeight)
    );
  }

  /**
   * Is the element's own centre the thing a tap would land on?
   *
   * Geometry is not enough here and that is the lesson this file encodes: the
   * sheet once rendered with `top: 12`, its header fully inside the viewport and
   * every rect assertion green, while the site header covered it and the close
   * button could not be tapped at all. `main { position: relative; z-index: 1 }`
   * makes `main` a stacking context, so the drawer's z-index cannot lift it over
   * chrome that lives outside `main`.
   */
  async function centreIsHittable(page: Page, testId: string): Promise<boolean> {
    return page.evaluate((id) => {
      const el = document.querySelector(`[data-testid="${id}"]`);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return (
        !!hit && (hit === el || el.contains(hit) || hit.closest(`[data-testid="${id}"]`) !== null)
      );
    }, testId);
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

    test('the full-bleed sheet has an opaque surface, not a sheen', async ({ page }) => {
      await gotoPortfolio(page);
      await openFilterDrawer(page);

      // The drawer co-applies .brutal-frosted--blur-only, whose surface token is
      // `transparent` in light theme. That is right for the 350px desktop panel
      // and unreadable full-bleed: the drawer's own title and chips render on
      // top of the page title, the search box and the body copy. Guarding the
      // alpha rather than the exact colour keeps this about legibility.
      const alpha = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="portfolio-filter-drawer"]')!;
        const bg = getComputedStyle(el).backgroundColor;
        const m = bg.match(/rgba?\(([^)]+)\)/);
        if (!m) return 0;
        const parts = m[1].split(',').map((p) => parseFloat(p));
        return parts.length === 4 ? parts[3] : 1;
      });
      expect(alpha, 'the mobile sheet must not be see-through').toBeGreaterThan(0.85);
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

    // The tablet band collides with the same fixed chrome as the phone sheet —
    // it just starts below it by construction rather than by a computed cap.
    // Asserted rather than assumed, since width alone would not have caught it.
    test('the tablet sheet clears the fixed chrome and stays dismissable', async ({ page }) => {
      await gotoPortfolio(page);
      await openFilterDrawer(page);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await waitForDrawerGap(page);

      const topInset = await drawerTokenPx(page, '--drawer-top-inset');
      const top = await page.evaluate(
        () =>
          document.querySelector('[data-testid="portfolio-filter-drawer"]')!.getBoundingClientRect()
            .top
      );
      expect(Math.abs(top - topInset)).toBeLessThanOrEqual(1);
      expect(
        await centreIsHittable(page, 'portfolio-drawer-close'),
        'the close button must be tappable on tablets too'
      ).toBe(true);
    });
  });

  test.describe('at 400px — the bottom sheet', () => {
    // 700px tall is chosen so the drawer's content (measured at 763px) genuinely
    // exceeds the 85% cap (595px). Without that the cap assertions below would
    // be upper bounds nothing tests, and the scroll probe could not hold.
    test.use({ viewport: { width: 400, height: 700 } });

    test('the cap binds at rest and the sheet is anchored to the viewport bottom', async ({
      page,
    }) => {
      await gotoPortfolio(page);
      await openFilterDrawer(page);

      const inset = await drawerTokenPx(page, '--drawer-top-inset');
      const box = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="portfolio-filter-drawer"]')!;
        const r = el.getBoundingClientRect();
        return {
          height: r.height,
          bottom: r.bottom,
          innerHeight: window.innerHeight,
          clearance: parseFloat(getComputedStyle(el).getPropertyValue('--drawer-footer-clearance')),
        };
      });

      // Rendered height, not computed max-height: per CSSOM `max-height` is not
      // among the properties whose resolved value is the used value, so
      // getComputedStyle returns the computed value and a percentage computes to
      // itself — every engine returns the literal `clamp(...)` string. `height`
      // IS a used value. Since the content exceeds the cap (763px against any of
      // the three terms at this viewport), this proves the cap both applies and
      // binds — without assuming WHICH term binds, which the top inset changed.
      expect(
        Math.abs(box.height - expectedHeight(box.innerHeight, box.clearance, inset))
      ).toBeLessThanOrEqual(1);
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

      const topInset = await drawerTokenPx(page, '--drawer-top-inset');
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
      // binds. Asserting a fixed height instead would only hold in one regime.
      expect(
        Math.abs(m.height - expectedHeight(m.innerHeight, m.clearance, topInset))
      ).toBeLessThanOrEqual(1);

      // The sheet shrank rather than sliding up: its top stays at the inset.
      expect(Math.abs(m.top - topInset)).toBeLessThanOrEqual(1);
      expect(m.headerTop).toBeGreaterThanOrEqual(0);
      expect(m.headerBottom).toBeLessThanOrEqual(m.innerHeight);
    });

    test('the close button is still tappable when scrolled to the footer', async ({ page }) => {
      await gotoPortfolio(page);
      await openFilterDrawer(page);

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await waitForDrawerGap(page);

      // The assertion the geometry checks above could not make. Before the cap
      // subtracted the top inset, every one of them passed while this returned
      // HEADER.site-header: the sheet's only in-sheet dismiss control sat under
      // fixed chrome that no z-index it can carry will ever outrank.
      expect(
        await centreIsHittable(page, 'portfolio-drawer-close'),
        'the close button must not be buried under the site header or the sticky bar'
      ).toBe(true);
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
