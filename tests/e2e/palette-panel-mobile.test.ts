import { test, expect } from '@playwright/test';
import {
  setMobileViewport,
  openMobileSheet,
  closeMobileSheet,
  clickMobileTab,
  clickMobilePopout,
  clickMobileThemeToggle,
  setPopoutState,
} from './helpers/palette';

test.beforeEach(async ({ page }) => {
  await setMobileViewport(page);
});

// ── Section A: FAB Visibility ─────────────────────────────

test.describe('FAB Visibility', () => {
  test('FAB visible on brand page', async ({ page }) => {
    await page.goto('/brand', { waitUntil: 'domcontentloaded' });
    const display = await page.evaluate(() => {
      const fab = document.getElementById('panel-fab');
      return fab ? getComputedStyle(fab).display : '';
    });
    expect(display).toBe('flex');
  });

  test('FAB hidden on non-brand page when not popped out', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.setItem('palette-popped-out', 'false'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    const display = await page.evaluate(() => {
      const fab = document.getElementById('panel-fab');
      return fab ? getComputedStyle(fab).display : '';
    });
    expect(display).toBe('none');
  });

  test('FAB visible on non-brand page when popped out', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await setPopoutState(page, true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    const display = await page.evaluate(() => {
      const fab = document.getElementById('panel-fab');
      return fab ? getComputedStyle(fab).display : '';
    });
    expect(display).toBe('flex');
  });

  test('FAB hidden on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/brand', { waitUntil: 'domcontentloaded' });
    const display = await page.evaluate(() => {
      const fab = document.getElementById('panel-fab');
      return fab ? getComputedStyle(fab).display : '';
    });
    expect(display).toBe('none');
  });

  test('FAB has triangular clip-path', async ({ page }) => {
    await page.goto('/brand', { waitUntil: 'domcontentloaded' });
    const clipPath = await page.evaluate(() => {
      const fab = document.getElementById('panel-fab');
      return fab ? getComputedStyle(fab).clipPath : '';
    });
    expect(clipPath).toContain('polygon');
  });
});

// ── Section B: Bottom Sheet Open/Close ────────────────────

test.describe('Bottom Sheet Open/Close', () => {
  test('FAB tap opens bottom sheet', async ({ page }) => {
    await page.goto('/brand', { waitUntil: 'domcontentloaded' });
    await openMobileSheet(page);
    const isOpen = await page.evaluate(() =>
      document.getElementById('palette-panel')?.classList.contains('is-open')
    );
    expect(isOpen).toBe(true);
  });

  test('backdrop visible when sheet is open', async ({ page }) => {
    await page.goto('/brand', { waitUntil: 'domcontentloaded' });
    await openMobileSheet(page);
    const isVisible = await page.evaluate(() =>
      document.getElementById('panel-backdrop')?.classList.contains('is-visible')
    );
    expect(isVisible).toBe(true);
  });

  test('backdrop tap closes sheet', async ({ page }) => {
    await page.goto('/brand', { waitUntil: 'domcontentloaded' });
    await openMobileSheet(page);
    await closeMobileSheet(page);
    const isOpen = await page.evaluate(() =>
      document.getElementById('palette-panel')?.classList.contains('is-open')
    );
    expect(isOpen).toBe(false);
  });

  test('FAB not interactive when sheet is open', async ({ page }) => {
    await page.goto('/brand', { waitUntil: 'domcontentloaded' });
    await openMobileSheet(page);
    const pointerEvents = await page.evaluate(() => {
      const fab = document.getElementById('panel-fab');
      return fab ? getComputedStyle(fab).pointerEvents : '';
    });
    expect(pointerEvents).toBe('none');
  });

  test('FAB reappears when sheet closes', async ({ page }) => {
    await page.goto('/brand', { waitUntil: 'domcontentloaded' });
    await openMobileSheet(page);
    await closeMobileSheet(page);
    await page.waitForFunction(
      () => {
        const fab = document.getElementById('panel-fab');
        return fab && getComputedStyle(fab).opacity !== '0';
      },
      { timeout: 10000 }
    );
  });

  test('body scroll locked when sheet open', async ({ page }) => {
    await page.goto('/brand', { waitUntil: 'domcontentloaded' });
    await openMobileSheet(page);
    const overflow = await page.evaluate(() => document.body.style.overflow);
    expect(overflow).toBe('hidden');
  });

  test('body scroll unlocked when sheet closes', async ({ page }) => {
    await page.goto('/brand', { waitUntil: 'domcontentloaded' });
    await openMobileSheet(page);
    await closeMobileSheet(page);
    const overflow = await page.evaluate(() => document.body.style.overflow);
    expect(overflow).toBe('');
  });
});

// ── Section C: Mobile Header Controls ─────────────────────

test.describe('Mobile Header Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/brand', { waitUntil: 'domcontentloaded' });
    await openMobileSheet(page);
  });

  test('mobile header contains 6 palette tabs', async ({ page }) => {
    const count = await page.evaluate(
      () => document.querySelectorAll('#panel-mobile-header .palette-panel__tab').length
    );
    expect(count).toBe(6);
  });

  test('mobile header contains theme toggle', async ({ page }) => {
    const exists = await page.evaluate(
      () => !!document.querySelector('#panel-mobile-header .palette-panel__theme-toggle')
    );
    expect(exists).toBe(true);
  });

  test('mobile header contains popout button', async ({ page }) => {
    const exists = await page.evaluate(
      () => !!document.querySelector('#panel-mobile-header .palette-panel__popout')
    );
    expect(exists).toBe(true);
  });

  test('grid layout is 6 columns', async ({ page }) => {
    const columns = await page.evaluate(() => {
      const header = document.getElementById('panel-mobile-header');
      return header ? getComputedStyle(header).gridTemplateColumns : '';
    });
    const colCount = columns.split(/\s+/).filter(Boolean).length;
    expect(colCount).toBe(6);
  });

  test('palette tab tap switches palette', async ({ page }) => {
    await clickMobileTab(page, 3);
    await page.waitForFunction(() => document.documentElement.classList.contains('palette-3'), {
      timeout: 10000,
    });
  });

  test('mobile tab tap syncs desktop tabs', async ({ page }) => {
    await clickMobileTab(page, 2);
    await page.waitForFunction(
      () => {
        const active = document.querySelector('#palette-tabs .palette-panel__tab--active');
        return active?.getAttribute('data-palette') === '2';
      },
      { timeout: 10000 }
    );
  });

  test('theme toggle in mobile header works', async ({ page }) => {
    await clickMobileThemeToggle(page);
    await page.waitForFunction(() => document.documentElement.classList.contains('dark-theme'), {
      timeout: 10000,
    });
  });
});

// ── Section D: Popout Scope ───────────────────────────────

test.describe('Popout Scope', () => {
  test('popout label shows "Brand Only" when not active', async ({ page }) => {
    await page.goto('/brand', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.removeItem('palette-popped-out'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await openMobileSheet(page);
    const label = await page.evaluate(() => {
      const el = document.querySelector('#panel-mobile-header .palette-panel__popout-label');
      return el?.textContent;
    });
    expect(label).toBe('Brand Only');
  });

  test('popout label changes to "All Pages" when toggled', async ({ page }) => {
    await page.goto('/brand', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.removeItem('palette-popped-out'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await openMobileSheet(page);
    await clickMobilePopout(page);
    await page.waitForFunction(
      () => {
        const el = document.querySelector('#panel-mobile-header .palette-panel__popout-label');
        return el?.textContent === 'All Pages';
      },
      { timeout: 10000 }
    );
  });

  test('popout button has is-active class when popped out', async ({ page }) => {
    await page.goto('/brand', { waitUntil: 'domcontentloaded' });
    await setPopoutState(page, true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await openMobileSheet(page);
    const isActive = await page.evaluate(() => {
      const btn = document.querySelector('#panel-mobile-header .palette-panel__popout');
      return btn?.classList.contains('is-active');
    });
    expect(isActive).toBe(true);
  });

  test('popout icon filled when active', async ({ page }) => {
    await page.goto('/brand', { waitUntil: 'domcontentloaded' });
    await setPopoutState(page, true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await openMobileSheet(page);
    const fill = await page.evaluate(() => {
      const path = document.querySelector(
        '#panel-mobile-header .palette-panel__popout.is-active .palette-panel__icon path'
      );
      return path ? getComputedStyle(path).fill : '';
    });
    // When active, fill should not be 'none' (it's set to --color-primary)
    expect(fill).not.toBe('none');
  });
});

// ── Section E: Cross-Page Navigation with Popout ──────────

test.describe('Cross-Page Navigation', () => {
  test('brand → homepage: FAB hidden when Brand Only', async ({ page }) => {
    await page.goto('/brand', { waitUntil: 'domcontentloaded' });
    await setPopoutState(page, false);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const display = await page.evaluate(() => {
      const fab = document.getElementById('panel-fab');
      return fab ? getComputedStyle(fab).display : '';
    });
    expect(display).toBe('none');
  });

  test('brand → homepage: FAB visible when All Pages', async ({ page }) => {
    await page.goto('/brand', { waitUntil: 'domcontentloaded' });
    await setPopoutState(page, true);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const display = await page.evaluate(() => {
      const fab = document.getElementById('panel-fab');
      return fab ? getComputedStyle(fab).display : '';
    });
    expect(display).toBe('flex');
  });

  test('homepage → brand: FAB always visible', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await setPopoutState(page, false);
    await page.goto('/brand', { waitUntil: 'domcontentloaded' });
    const display = await page.evaluate(() => {
      const fab = document.getElementById('panel-fab');
      return fab ? getComputedStyle(fab).display : '';
    });
    expect(display).toBe('flex');
  });

  test('palette selection persists across navigation', async ({ page }) => {
    await page.goto('/brand', { waitUntil: 'domcontentloaded' });
    await openMobileSheet(page);
    await clickMobileTab(page, 3);
    await page.waitForFunction(() => document.documentElement.classList.contains('palette-3'), {
      timeout: 10000,
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.goto('/brand', { waitUntil: 'domcontentloaded' });
    const hasPalette = await page.evaluate(() =>
      document.documentElement.classList.contains('palette-3')
    );
    expect(hasPalette).toBe(true);
  });

  test('popout state persists across navigation', async ({ page }) => {
    await page.goto('/brand', { waitUntil: 'domcontentloaded' });
    await openMobileSheet(page);
    await clickMobilePopout(page);
    await page.waitForFunction(
      () => document.documentElement.classList.contains('palette-popped-out'),
      { timeout: 10000 }
    );
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const fabVisible = await page.evaluate(() => {
      const fab = document.getElementById('panel-fab');
      return fab ? getComputedStyle(fab).display : '';
    });
    expect(fabVisible).toBe('flex');
  });

  test('pop-in on non-brand page hides FAB and closes sheet', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await setPopoutState(page, true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await openMobileSheet(page);
    await clickMobilePopout(page);
    await page.waitForFunction(
      () => !document.getElementById('palette-panel')?.classList.contains('is-open'),
      { timeout: 10000 }
    );
    const fabDisplay = await page.evaluate(() => {
      const fab = document.getElementById('panel-fab');
      return fab ? fab.style.display : '';
    });
    expect(fabDisplay).toBe('none');
  });
});

// ── Section F: Compact Swatches ───────────────────────────

test.describe('Compact Swatches', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/brand', { waitUntil: 'domcontentloaded' });
    await openMobileSheet(page);
  });

  test('3-column swatch grid on mobile', async ({ page }) => {
    const columns = await page.evaluate(() => {
      const grid = document.querySelector('.palette-panel__swatch-grid');
      return grid ? getComputedStyle(grid).gridTemplateColumns : '';
    });
    const colCount = columns.split(/\s+/).filter(Boolean).length;
    expect(colCount).toBe(3);
  });

  test('swatch color preview is approximately square', async ({ page }) => {
    const ratio = await page.evaluate(() => {
      const color = document.querySelector<HTMLElement>('.palette-panel .brand-swatch__color');
      if (!color) return 0;
      const rect = color.getBoundingClientRect();
      return rect.width > 0 ? rect.height / rect.width : 0;
    });
    // Aspect-ratio: 1 means ratio should be close to 1 (within 10% tolerance)
    expect(ratio).toBeGreaterThan(0.9);
    expect(ratio).toBeLessThan(1.1);
  });

  test('hex values hidden by default', async ({ page }) => {
    const display = await page.evaluate(() => {
      const val = document.querySelector('.palette-panel .brand-swatch__value');
      return val ? getComputedStyle(val).display : '';
    });
    expect(display).toBe('none');
  });

  test('tap swatch expands controls', async ({ page }) => {
    // Wait for controls to be injected
    await page.waitForFunction(
      () => document.querySelectorAll('.palette-panel .swatch-controls').length > 0,
      { timeout: 10000 }
    );
    await page.evaluate(() => {
      const swatch = document.querySelector<HTMLElement>('.palette-panel .brand-swatch');
      swatch?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const expanded = await page.evaluate(() => {
      const swatch = document.querySelector('.palette-panel .brand-swatch');
      return swatch?.classList.contains('swatch-expanded');
    });
    expect(expanded).toBe(true);
  });

  test('only one swatch expanded at a time', async ({ page }) => {
    await page.waitForFunction(
      () => document.querySelectorAll('.palette-panel .swatch-controls').length > 0,
      { timeout: 10000 }
    );
    // Expand first swatch
    await page.evaluate(() => {
      const swatches = document.querySelectorAll<HTMLElement>('.palette-panel .brand-swatch');
      swatches[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // Expand second swatch
    await page.evaluate(() => {
      const swatches = document.querySelectorAll<HTMLElement>('.palette-panel .brand-swatch');
      swatches[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const expandedCount = await page.evaluate(
      () => document.querySelectorAll('.palette-panel .brand-swatch.swatch-expanded').length
    );
    expect(expandedCount).toBe(1);
  });
});

// ── Section G: FAB Footer Avoidance ───────────────────────

test.describe('FAB Footer Avoidance', () => {
  test('FAB above footer when scrolled to bottom', async ({ page }) => {
    await page.goto('/brand', { waitUntil: 'domcontentloaded' });
    // Scroll to very bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    // Wait for scroll to settle and position to update
    await page.waitForFunction(
      () => {
        const fab = document.getElementById('panel-fab');
        const footer = document.querySelector('footer');
        if (!fab || !footer) return false;
        const fabRect = fab.getBoundingClientRect();
        const footerRect = footer.getBoundingClientRect();
        // FAB bottom edge should be above footer top edge
        return fabRect.bottom <= footerRect.top + 2; // 2px tolerance
      },
      { timeout: 10000 }
    );
  });

  test('FAB at default position when footer not visible', async ({ page }) => {
    await page.goto('/brand', { waitUntil: 'domcontentloaded' });
    // Scroll to top
    await page.evaluate(() => window.scrollTo(0, 0));
    const bottom = await page.evaluate(() => {
      const fab = document.getElementById('panel-fab');
      return fab ? fab.style.bottom || '16px' : '';
    });
    expect(bottom).toBe('16px');
  });
});
