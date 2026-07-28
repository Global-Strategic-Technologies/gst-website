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
      expect(
        await page
          .locator('.brutal-map-tap-bar')
          .first()
          .evaluate((el) => getComputedStyle(el).display),
        'map tap bar flex layout — map.css not loaded?'
      ).toBe('flex');

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
   * The site-chrome specimens are hand-rolled replicas rather than the real
   * components (Header/ThemeToggle both carry singleton ids, so they cannot be
   * rendered twice on one page). These pin the sizes to production's computed
   * values so the replicas cannot silently drift again — see BL-095 for the
   * durable fix.
   */
  test.describe('Site chrome specimens match production sizing', () => {
    test('logo delta is 32px and theme toggle delta is 54px', async ({ page }) => {
      const logoBox = await page.locator('#lib-site-chrome ~ * svg').first().boundingBox();
      expect(Math.round(logoBox!.width), 'logo delta (Header.astro renders 32px)').toBe(32);

      const toggleBox = await page
        .locator('button[title="Theme toggle specimen"] svg')
        .first()
        .boundingBox();
      expect(
        Math.round(toggleBox!.width),
        'theme toggle delta (ThemeToggle.astro computes ~54px)'
      ).toBe(54);
    });
  });
});
