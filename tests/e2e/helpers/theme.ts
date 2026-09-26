import type { Page } from '@playwright/test';

/** The four theme states (ADR-0038), in the order both toggles cycle them. */
export const THEMES = ['light', 'dim-light', 'dim-dark', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/**
 * Click the theme toggle via dispatchEvent.
 *
 * WebKit's hit-testing can fail on the toggle due to the footer's z-index: 0
 * stacking context + the large font-size creating an oversized bounding box.
 * dispatchEvent bypasses Playwright's coordinate-based click.
 */
export async function clickThemeToggle(page: Page): Promise<void> {
  await page.evaluate(() => {
    document
      .getElementById('themeToggle')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

/** The theme <html> carries, read from both classes — never `dark-theme`
 *  alone, which cannot tell light from dim light or dark from dim dark. */
export async function currentTheme(page: Page): Promise<Theme> {
  return page.evaluate(() => {
    const c = document.documentElement.classList;
    const dark = c.contains('dark-theme');
    const dim = c.contains('theme-dim');
    if (dark) return dim ? 'dim-dark' : 'dark';
    return dim ? 'dim-light' : 'light';
  });
}

/** Wait until <html> carries `theme`. */
export async function waitForTheme(page: Page, theme: Theme): Promise<void> {
  await page.waitForFunction((t) => {
    const c = document.documentElement.classList;
    const dark = c.contains('dark-theme');
    const dim = c.contains('theme-dim');
    const now = dark ? (dim ? 'dim-dark' : 'dark') : dim ? 'dim-light' : 'light';
    return now === t;
  }, theme);
}

/** The state after `theme` in the footer's four-state cycle. */
export function nextTheme(theme: Theme): Theme {
  return THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
}

/**
 * Click the footer toggle until <html> carries `target` — at most three clicks,
 * waiting for each step so a click never lands mid-transition.
 */
export async function cycleThemeTo(page: Page, target: Theme): Promise<void> {
  let theme = await currentTheme(page);
  while (theme !== target) {
    const next = nextTheme(theme);
    await clickThemeToggle(page);
    await waitForTheme(page, next);
    theme = next;
  }
}
