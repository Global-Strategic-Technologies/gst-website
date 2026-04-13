import { test, expect } from '@playwright/test';

/**
 * E2E tests for the shared <TableOfContents> Astro component.
 *
 * These tests cover cross-page sublist generation, scroll-spy behavior,
 * collapsible resize logic, accessibility attributes, data attributes,
 * and multi-instance isolation. Brand-page-specific TOC basics (link count,
 * desktop/mobile collapse toggle, initial active link, single-active
 * constraint, identity sublists) are covered in brand-page.test.ts.
 */

/** Wait for the client-side TOC script to finish generating sublists. */
async function waitForSublists(page: import('@playwright/test').Page, selector = '.toc__sublist') {
  await page.waitForFunction((sel) => document.querySelectorAll(sel).length > 0, selector, {
    timeout: 10000,
  });
}

test.describe('TableOfContents Component', () => {
  test.describe('Sublist Generation', () => {
    test('should generate sublists for layer-1 on business-architectures page', async ({
      page,
    }) => {
      await page.goto('/hub/library/business-architectures', { waitUntil: 'load' });
      await waitForSublists(page);

      // Count h3[id] headings inside #layer-1 (the source of truth)
      const h3Count = await page.evaluate(
        () => document.querySelectorAll('#layer-1 h3[id]').length
      );
      expect(h3Count).toBeGreaterThan(0);

      // The TOC layer item for layer-1 should have exactly that many sublist entries
      const sublistCount = await page.evaluate(() => {
        const layerItem = document.querySelector('.toc__layer[data-layer="1"]');
        return layerItem ? layerItem.querySelectorAll('.toc__sublist li').length : 0;
      });
      expect(sublistCount).toBe(h3Count);
    });

    test('should render sublist icons at 10x10px on vdr-structure page', async ({ page }) => {
      await page.goto('/hub/library/vdr-structure', { waitUntil: 'domcontentloaded' });
      await waitForSublists(page);

      const dimensions = await page.evaluate(() => {
        const icon = document.querySelector('.toc__sublist .bullet-icon');
        if (!icon) return null;
        return {
          width: icon.getAttribute('width'),
          height: icon.getAttribute('height'),
        };
      });

      expect(dimensions).not.toBeNull();
      expect(dimensions!.width).toBe('10');
      expect(dimensions!.height).toBe('10');
    });
  });

  test.describe('Scroll Spy', () => {
    test('should update active link when scrolling to a mid-page section', async ({ page }) => {
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });

      const toc = page.getByTestId('brand-toc');
      await expect(toc).toBeVisible();

      // Confirm initial active link is the first section
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-testid="brand-toc"] .toc__list a.is-active')
            ?.getAttribute('href') === '#identity',
        { timeout: 10000 }
      );

      // Scroll the #components section into view (mid-page)
      await page.evaluate(() => {
        const section = document.getElementById('components');
        if (section) section.scrollIntoView({ behavior: 'instant' });
      });

      // Wait for scroll-spy to update the active link to #components
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-testid="brand-toc"] .toc__list a.is-active')
            ?.getAttribute('href') === '#components',
        { timeout: 10000 }
      );
    });

    test('should return active link to first section on scroll-to-top', async ({ page }) => {
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });

      // Scroll down to a later section first
      await page.evaluate(() => {
        const section = document.getElementById('components');
        if (section) section.scrollIntoView({ behavior: 'instant' });
      });

      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-testid="brand-toc"] .toc__list a.is-active')
            ?.getAttribute('href') === '#components',
        { timeout: 10000 }
      );

      // Scroll back to top
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));

      // The first link should become active again
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-testid="brand-toc"] .toc__list a.is-active')
            ?.getAttribute('href') === '#identity',
        { timeout: 10000 }
      );
    });
  });

  test.describe('Collapsible Resize Behavior', () => {
    test('should auto-expand when resized from mobile to desktop', async ({ page }) => {
      // Start at mobile width
      await page.setViewportSize({ width: 480, height: 800 });
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });

      // Wait for collapsed state on mobile
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="brand-toc"]')?.classList.contains('is-collapsed'),
        { timeout: 10000 }
      );

      // Resize to desktop
      await page.setViewportSize({ width: 1200, height: 800 });

      // The matchMedia listener should remove is-collapsed
      await page.waitForFunction(
        () =>
          !document.querySelector('[data-testid="brand-toc"]')?.classList.contains('is-collapsed'),
        { timeout: 10000 }
      );
    });
  });

  test.describe('Accessibility & Data Attributes', () => {
    test('should render separators with aria-hidden="true"', async ({ page }) => {
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });

      const separators = await page.evaluate(() => {
        const toc = document.querySelector('[data-testid="brand-toc"]');
        if (!toc) return [];
        const seps = toc.querySelectorAll('.toc__separator');
        return Array.from(seps).map((el) => el.getAttribute('aria-hidden'));
      });

      expect(separators.length).toBeGreaterThan(0);
      for (const val of separators) {
        expect(val).toBe('true');
      }
    });

    test('should apply custom data-* attributes on layer items', async ({ page }) => {
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });

      // The first layer item should have data-section="identity"
      const sectionAttr = await page.evaluate(() => {
        const toc = document.querySelector('[data-testid="brand-toc"]');
        const firstLayer = toc?.querySelector('.toc__layer');
        return firstLayer?.getAttribute('data-section') ?? null;
      });

      expect(sectionAttr).toBe('identity');
    });
  });

  test.describe('Multi-Instance Isolation', () => {
    test('should not activate scroll-spy links in specimen TOC instances', async ({ page }) => {
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });

      // Wait for scroll-spy to initialize on the main TOC
      await page.waitForFunction(
        () => document.querySelector('[data-testid="brand-toc"] .toc__list a.is-active') !== null,
        { timeout: 10000 }
      );

      // The main TOC (brand-toc) should have exactly one active link
      const mainActiveCount = await page.evaluate(
        () => document.querySelectorAll('[data-testid="brand-toc"] .toc__list a.is-active').length
      );
      expect(mainActiveCount).toBe(1);

      // Specimen TOCs (inside .brand-toc-specimen) should have zero active links
      // because they are not configured with scrollSpy={true}
      const specimenActiveCount = await page.evaluate(
        () => document.querySelectorAll('.brand-toc-specimen .toc__list a.is-active').length
      );
      expect(specimenActiveCount).toBe(0);
    });
  });
});
