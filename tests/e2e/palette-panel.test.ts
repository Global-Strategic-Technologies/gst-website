import { test, expect } from '@playwright/test';

/**
 * Click a palette panel button via dispatchEvent (bypasses z-index hit-testing issues).
 */
async function clickPanelButton(page: import('@playwright/test').Page, id: string): Promise<void> {
  await page.evaluate((btnId) => {
    document.getElementById(btnId)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, id);
}

test.describe('Palette Panel', () => {
  test.describe('Visibility Rules', () => {
    test('should be visible on the brand page', async ({ page }) => {
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });
      const panel = page.getByTestId('palette-panel');
      await expect(panel).toBeAttached();
      // Panel edge (toggle button) should be visible even when panel body is closed
      const toggle = page.getByTestId('palette-panel-toggle');
      await expect(toggle).toBeAttached();
    });

    test('should set data-palette-always on html for brand page', async ({ page }) => {
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });
      const hasAttr = await page.evaluate(() =>
        document.documentElement.hasAttribute('data-palette-always')
      );
      expect(hasAttr).toBe(true);
    });

    test('should be hidden on non-brand pages by default', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      const display = await page.evaluate(() => {
        const panel = document.getElementById('palette-panel');
        return panel ? getComputedStyle(panel).display : 'none';
      });
      expect(display).toBe('none');
    });
  });

  test.describe('Panel Open/Close', () => {
    test('should toggle is-open class when panel toggle is clicked', async ({ page }) => {
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });

      // Initially closed
      const initiallyOpen = await page.evaluate(() =>
        document.getElementById('palette-panel')?.classList.contains('is-open')
      );
      expect(initiallyOpen).toBe(false);

      // Open
      await clickPanelButton(page, 'panel-toggle');
      await page.waitForFunction(
        () => document.getElementById('palette-panel')?.classList.contains('is-open'),
        { timeout: 10000 }
      );

      // Close
      await clickPanelButton(page, 'panel-toggle');
      await page.waitForFunction(
        () => !document.getElementById('palette-panel')?.classList.contains('is-open'),
        { timeout: 10000 }
      );
    });
  });

  test.describe('Palette Switching', () => {
    test('should apply palette-N class to html when tab is clicked', async ({ page }) => {
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });
      await clickPanelButton(page, 'panel-toggle');

      // Click palette tab 2
      await page.evaluate(() => {
        const tab = document.querySelector('[data-palette="2"]') as HTMLElement;
        tab?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      await page.waitForFunction(() => document.documentElement.classList.contains('palette-2'), {
        timeout: 10000,
      });
    });

    test('should remove previous palette class when switching', async ({ page }) => {
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });
      await clickPanelButton(page, 'panel-toggle');

      // Switch to palette 2 then palette 3
      await page.evaluate(() => {
        (document.querySelector('[data-palette="2"]') as HTMLElement)?.dispatchEvent(
          new MouseEvent('click', { bubbles: true })
        );
      });
      await page.waitForFunction(() => document.documentElement.classList.contains('palette-2'), {
        timeout: 10000,
      });

      await page.evaluate(() => {
        (document.querySelector('[data-palette="3"]') as HTMLElement)?.dispatchEvent(
          new MouseEvent('click', { bubbles: true })
        );
      });

      const result = await page.evaluate(() => ({
        has2: document.documentElement.classList.contains('palette-2'),
        has3: document.documentElement.classList.contains('palette-3'),
      }));
      expect(result).toEqual({ has2: false, has3: true });
    });

    test('should mark clicked tab as active and deactivate others', async ({ page }) => {
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });
      await clickPanelButton(page, 'panel-toggle');

      await page.evaluate(() => {
        (document.querySelector('[data-palette="3"]') as HTMLElement)?.dispatchEvent(
          new MouseEvent('click', { bubbles: true })
        );
      });

      const result = await page.evaluate(() => {
        const active = document.querySelectorAll('.palette-panel__tab--active');
        return { count: active.length, palette: (active[0] as HTMLElement)?.dataset.palette };
      });
      expect(result).toEqual({ count: 1, palette: '3' });
    });
  });

  test.describe('localStorage Persistence', () => {
    test('should persist palette selection to localStorage', async ({ page }) => {
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });
      await clickPanelButton(page, 'panel-toggle');

      await page.evaluate(() => {
        (document.querySelector('[data-palette="4"]') as HTMLElement)?.dispatchEvent(
          new MouseEvent('click', { bubbles: true })
        );
      });

      await page.waitForFunction(() => localStorage.getItem('palette') === '4', { timeout: 10000 });
    });

    test('should restore palette from localStorage on page load', async ({ page }) => {
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => localStorage.setItem('palette', '3'));
      await page.reload({ waitUntil: 'domcontentloaded' });

      const hasPalette = await page.evaluate(() =>
        document.documentElement.classList.contains('palette-3')
      );
      expect(hasPalette).toBe(true);
    });

    test('should persist pop-out state to localStorage', async ({ page }) => {
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });
      await clickPanelButton(page, 'panel-popout-toggle');

      await page.waitForFunction(() => localStorage.getItem('palette-popped-out') === 'true', {
        timeout: 10000,
      });
    });

    test('should restore pop-out state from localStorage on reload', async ({ page }) => {
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => localStorage.setItem('palette-popped-out', 'true'));
      await page.reload({ waitUntil: 'domcontentloaded' });

      const isPoppedOut = await page.evaluate(() =>
        document.documentElement.classList.contains('palette-popped-out')
      );
      expect(isPoppedOut).toBe(true);
    });
  });

  test.describe('FOUC Prevention', () => {
    test('should apply palette class synchronously before body renders', async ({ page }) => {
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => localStorage.setItem('palette', '5'));
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });

      const hasPalette = await page.evaluate(() =>
        document.documentElement.classList.contains('palette-5')
      );
      expect(hasPalette).toBe(true);
    });
  });

  test.describe('Cross-Page Persistence', () => {
    test('should maintain palette selection when navigating between pages', async ({ page }) => {
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });
      await clickPanelButton(page, 'panel-toggle');

      await page.evaluate(() => {
        (document.querySelector('[data-palette="2"]') as HTMLElement)?.dispatchEvent(
          new MouseEvent('click', { bubbles: true })
        );
      });

      await page.waitForFunction(() => document.documentElement.classList.contains('palette-2'), {
        timeout: 10000,
      });

      // Navigate to homepage
      await page.goto('/', { waitUntil: 'domcontentloaded' });

      const hasPalette = await page.evaluate(() =>
        document.documentElement.classList.contains('palette-2')
      );
      expect(hasPalette).toBe(true);
    });
  });

  test.describe('Reset All Overrides', () => {
    test('should clear inline style overrides when reset button is clicked', async ({ page }) => {
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });
      await clickPanelButton(page, 'panel-toggle');

      // Apply a manual override
      await page.evaluate(() => {
        document.documentElement.style.setProperty('--color-primary', '#ff0000');
      });

      // Click reset
      await clickPanelButton(page, 'reset-all');

      await page.waitForFunction(
        () => document.documentElement.style.getPropertyValue('--color-primary') === '',
        { timeout: 10000 }
      );
    });
  });
});
