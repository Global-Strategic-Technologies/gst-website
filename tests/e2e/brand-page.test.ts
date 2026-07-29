import { test, expect } from '@playwright/test';

test.describe('Brand Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/brand/', { waitUntil: 'domcontentloaded' });
  });

  test.describe('Page Structure', () => {
    test('should render all 12 content sections', async ({ page }) => {
      const sectionIds = [
        'identity',
        'colors',
        'typography',
        'spacing',
        'shadows',
        'transitions',
        'components',
        'component-states',
        'accessibility',
        'responsive-demos',
        'ui-library',
        'toc-component',
      ];
      for (const id of sectionIds) {
        const section = page.locator(`#${id}`);
        await expect(section).toBeAttached();
      }
    });

    test('should set data-palette-always attribute on html', async ({ page }) => {
      const hasAttr = await page.evaluate(() =>
        document.documentElement.hasAttribute('data-palette-always')
      );
      expect(hasAttr).toBe(true);
    });
  });

  test.describe('Table of Contents - Desktop', () => {
    test('should display sidebar TOC with section links', async ({ page }) => {
      const toc = page.getByTestId('brand-toc');
      await expect(toc).toBeVisible();

      const links = toc.locator('.toc__list > li a');
      const count = await links.count();
      expect(count).toBeGreaterThanOrEqual(12);
    });

    test('should generate sublists from h3 headings', async ({ page }) => {
      // Wait for JS to build sublists
      await page.waitForFunction(() => document.querySelectorAll('.toc__sublist').length > 0, {
        timeout: 10000,
      });

      // Identity section has 3 h3s (brand-voice, wordmark, logo-usage)
      const identitySubs = page.locator('.toc__layer[data-section="identity"] .toc__sublist li');
      const count = await identitySubs.count();
      expect(count).toBe(3);
    });

    test('should NOT have is-collapsed class on desktop viewport', async ({ page }) => {
      const isCollapsed = await page.evaluate(() =>
        document.querySelector('.toc')?.classList.contains('is-collapsed')
      );
      expect(isCollapsed).toBe(false);
    });
  });

  test.describe('Table of Contents - Mobile', () => {
    test('should start collapsed on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 480, height: 800 });
      // Wait for matchMedia listener to apply collapsed state
      await page.waitForFunction(
        () => document.querySelector('.toc')?.classList.contains('is-collapsed'),
        { timeout: 10000 }
      );
    });

    test('should expand TOC when heading is clicked on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 480, height: 800 });
      await page.waitForFunction(
        () => document.querySelector('.toc')?.classList.contains('is-collapsed'),
        { timeout: 10000 }
      );

      // Click heading to expand
      await page.evaluate(() => {
        document
          .querySelector('.toc__heading')
          ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      await page.waitForFunction(
        () => !document.querySelector('.toc')?.classList.contains('is-collapsed'),
        { timeout: 10000 }
      );
    });

    test('should collapse TOC again on second click', async ({ page }) => {
      await page.setViewportSize({ width: 480, height: 800 });
      await page.waitForFunction(
        () => document.querySelector('.toc')?.classList.contains('is-collapsed'),
        { timeout: 10000 }
      );

      // Expand
      await page.evaluate(() => {
        document
          .querySelector('.toc__heading')
          ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await page.waitForFunction(
        () => !document.querySelector('.toc')?.classList.contains('is-collapsed'),
        { timeout: 10000 }
      );

      // Collapse again
      await page.evaluate(() => {
        document
          .querySelector('.toc__heading')
          ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await page.waitForFunction(
        () => document.querySelector('.toc')?.classList.contains('is-collapsed'),
        { timeout: 10000 }
      );
    });
  });

  test.describe('Scroll Spy', () => {
    test('should highlight first section link on initial load', async ({ page }) => {
      await page.waitForFunction(
        () =>
          document.querySelector('.toc__list a.is-active')?.getAttribute('href') === '#identity',
        { timeout: 10000 }
      );
    });

    test('should only have one active link at a time', async ({ page }) => {
      const activeCount = await page.evaluate(
        () => document.querySelectorAll('.toc__list a.is-active').length
      );
      expect(activeCount).toBe(1);
    });
  });

  /**
   * filter.css, map.css, portfolio.css and progress.css are deliberately code-split
   * out of global.css and imported only by the pages that use them. The brand page
   * renders specimens for all four, so it imports them explicitly (brand.astro).
   * Without those imports the specimens render as unstyled markup — which is worse
   * than omitting them, since a reader concludes the documented class is broken.
   * These assertions fail if an import is dropped or a new sheet is code-split
   * without adding it here.
   */
  test.describe('Code-split component CSS is loaded', () => {
    test('filter drawer and chips are styled', async ({ page }) => {
      const drawer = page.locator('.brutal-filter-drawer').first();
      await expect(drawer).toBeVisible();
      expect(
        await drawer.evaluate((el) => getComputedStyle(el).borderLeftWidth),
        'filter drawer primary left border — filter.css not loaded?'
      ).toBe('3px');

      const chipBorder = await page
        .locator('.brutal-filter-chip')
        .first()
        .evaluate((el) => getComputedStyle(el).borderTopWidth);
      expect(
        parseFloat(chipBorder),
        'filter chip outline — filter.css not loaded?'
      ).toBeGreaterThan(0);
    });

    test('map tap bar, project card and wizard progress are styled', async ({ page }) => {
      // `gap` is the discriminating property — it exists only in map.css, so this
      // fails if the sheet is absent. Do not assert `display`/`border`: the
      // specimen would satisfy those from markup alone if inline styles return.
      const tapBar = page.locator('.brutal-map-tap-bar').first();
      await expect(tapBar).toBeVisible();
      expect(
        await tapBar.evaluate((el) => getComputedStyle(el).columnGap),
        'map tap bar gap (--spacing-md) — map.css not loaded?'
      ).toBe('12px');

      const cardBorder = await page
        .locator('.brutal-project-card')
        .first()
        .evaluate((el) => getComputedStyle(el).borderTopWidth);
      expect(
        parseFloat(cardBorder),
        'project card border — portfolio.css not loaded?'
      ).toBeGreaterThan(0);

      expect(
        await page
          .locator('.tool-wizard-progress')
          .first()
          .evaluate((el) => getComputedStyle(el).display),
        'wizard progress flex layout — progress.css not loaded?'
      ).toBe('flex');
    });
  });

  /**
   * The Responsive Behavior section embeds /brand/responsive-frame in same-origin
   * iframes. The site default (`X-Frame-Options: DENY` + `frame-ancestors 'none'`)
   * forbids framing by every origin INCLUDING this one, so without the documented
   * route exception every frame is blocked with ERR_BLOCKED_BY_RESPONSE and renders
   * empty — silently, with no build error. That shipped and went unnoticed.
   *
   * The iframes are `loading="lazy"`, so they must be scrolled into view before
   * they load at all; a check that skips the scroll passes against empty frames.
   */
  test.describe('Responsive-demo iframes render', () => {
    test('every frame loads content rather than being blocked', async ({ page }) => {
      await page.locator('#responsive-demos').scrollIntoViewIfNeeded();
      const frames = page.locator('.responsive-demo-frame iframe');
      const total = await frames.count();
      expect(total, 'responsive demo iframes present').toBeGreaterThan(0);

      for (let i = 0; i < total; i++) {
        await frames.nth(i).scrollIntoViewIfNeeded();
      }

      await expect
        .poll(
          async () =>
            frames.evaluateAll(
              (els) =>
                els.filter(
                  (el) =>
                    ((el as HTMLIFrameElement).contentDocument?.body?.children.length ?? 0) > 0
                ).length
            ),
          { message: 'iframes rendering content — framing blocked by security headers?' }
        )
        .toBe(total);
    });
  });

  /**
   * The site-chrome specimens are hand-rolled replicas rather than the real
   * components (Header/ThemeToggle both carry singleton ids, so they cannot be
   * rendered twice on one page). These assert PARITY against the live components
   * BaseLayout renders on this same page — no magic numbers, so they cannot go
   * stale when those components change — see BL-095 for the durable fix.
   */
  test.describe('Site chrome specimens match production', () => {
    /**
     * Asserted as PARITY against the live components rendered by BaseLayout on this
     * same page, not against magic numbers — so the pins cannot go stale when
     * Header/ThemeToggle change, and colour drift is caught as well as size.
     */
    test('logo specimen delta matches the real header delta', async ({ page }) => {
      const specimen = page.locator('[data-specimen-logo] svg').first();
      const production = page.locator('.logo-wrapper .delta-icon').first();
      await expect(specimen).toBeVisible();
      await expect(production).toBeVisible();

      const [s, p] = await Promise.all([
        specimen.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { w: Math.round(r.width), color: getComputedStyle(el).color };
        }),
        production.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { w: Math.round(r.width), color: getComputedStyle(el).color };
        }),
      ]);
      expect(s.w, 'logo specimen delta width vs real header').toBe(p.w);
      expect(s.color, 'logo specimen delta color vs real header').toBe(p.color);

      // Lockup gap is its own drift dimension — it regressed once (specimen 8px vs
      // production 4px) while width and color still matched.
      const [sGap, pGap] = await Promise.all([
        page.locator('[data-specimen-logo]').evaluate((el) => getComputedStyle(el).columnGap),
        page
          .locator('.logo-wrapper')
          .first()
          .evaluate((el) => getComputedStyle(el).columnGap),
      ]);
      expect(sGap, 'logo lockup gap vs real header').toBe(pGap);
    });

    test('theme toggle specimen delta matches the real toggle', async ({ page }) => {
      const specimen = page.locator('button[title="Theme toggle specimen"] svg').first();
      const production = page.locator('#themeToggle .theme-toggle-icon').first();
      await expect(specimen).toBeVisible();
      await expect(production).toBeVisible();

      const [s, p] = await Promise.all([
        specimen.evaluate((el) => ({
          w: Math.round(el.getBoundingClientRect().width),
          color: getComputedStyle(el).color,
        })),
        production.evaluate((el) => ({
          w: Math.round(el.getBoundingClientRect().width),
          color: getComputedStyle(el).color,
        })),
      ]);
      expect(s.w, 'toggle specimen delta width vs real toggle').toBe(p.w);
      expect(s.color, 'toggle specimen delta color vs real toggle').toBe(p.color);
    });
  });
});
