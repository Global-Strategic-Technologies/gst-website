/**
 * Shared helpers for palette panel E2E tests.
 *
 * Reuses the dispatchEvent() pattern from TEST_BEST_PRACTICES §7 to
 * bypass z-index hit-testing issues on overlay elements.
 */
import type { Page } from '@playwright/test';

/** Standard mobile viewport matching existing brand-page and palette tests. */
export const MOBILE_VIEWPORT = { width: 480, height: 800 };

export async function setMobileViewport(page: Page): Promise<void> {
  await page.setViewportSize(MOBILE_VIEWPORT);
}

/** Click any element by ID using dispatchEvent (bypasses z-index stacking). */
export async function clickById(page: Page, id: string): Promise<void> {
  await page.evaluate((btnId) => {
    document.getElementById(btnId)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, id);
}

/** Open the mobile bottom sheet via FAB tap and wait for is-open. */
export async function openMobileSheet(page: Page): Promise<void> {
  await clickById(page, 'panel-fab');
  await page.waitForFunction(
    () => document.getElementById('palette-panel')?.classList.contains('is-open'),
    { timeout: 10000 }
  );
}

/** Close the mobile bottom sheet via backdrop tap and wait for close. */
export async function closeMobileSheet(page: Page): Promise<void> {
  await clickById(page, 'panel-backdrop');
  await page.waitForFunction(
    () => !document.getElementById('palette-panel')?.classList.contains('is-open'),
    { timeout: 10000 }
  );
}

/** Set localStorage popout state for test setup (call before navigation). */
export async function setPopoutState(page: Page, popped: boolean): Promise<void> {
  await page.evaluate(
    (val) => localStorage.setItem('palette-popped-out', val),
    popped ? 'true' : 'false'
  );
}

/** Click a palette tab in the mobile header by palette ID. */
export async function clickMobileTab(page: Page, paletteId: number): Promise<void> {
  await page.evaluate((id) => {
    const tabs = document.querySelectorAll<HTMLElement>('#panel-mobile-header .palette-panel__tab');
    for (const tab of tabs) {
      if (tab.dataset.palette === String(id)) {
        tab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        break;
      }
    }
  }, paletteId);
}

/** Click the popout clone button in the mobile header. */
export async function clickMobilePopout(page: Page): Promise<void> {
  await page.evaluate(() => {
    const popout = document.querySelector<HTMLElement>(
      '#panel-mobile-header .palette-panel__popout'
    );
    popout?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

/** Click the theme toggle clone in the mobile header. */
export async function clickMobileThemeToggle(page: Page): Promise<void> {
  await page.evaluate(() => {
    const btn = document.querySelector<HTMLElement>(
      '#panel-mobile-header .palette-panel__theme-toggle'
    );
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}
