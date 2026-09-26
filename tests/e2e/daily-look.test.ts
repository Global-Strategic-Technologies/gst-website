import { test, expect, type Page } from '@playwright/test';
import { AMBIENT_OFF, EMPTY_STATE, seedStorage } from './helpers/storage-baseline';
import { clickThemeToggle } from './helpers/theme';

/**
 * The daily look rotation (ADR-0040): with no pick stamped today, the palette
 * follows the weekday (Monday = 0 … Sunday = 6) and the theme the week of the
 * month (1–7 light, 8–14 dim light, 15–21 dim dark, 22+ dark), on the
 * visitor's local clock. A pick holds until local midnight, per dimension.
 *
 * These tests start from EMPTY_STATE (not the suite's baseline pick) and pin
 * the clock with page.clock.setFixedTime, which fixes Date.now() while timers
 * keep running and applies before BaseLayout's head script. Ambient motion is
 * seeded off: it is not what this spec is about.
 */

test.use({ storageState: EMPTY_STATE, timezoneId: 'UTC' });

async function at(page: Page, iso: string): Promise<void> {
  await page.clock.setFixedTime(new Date(iso));
}

async function motionOff(page: Page, extra: Record<string, string | null> = {}): Promise<void> {
  await seedStorage(page, { 'ambient-motion': AMBIENT_OFF, ...extra });
}

/** The <html> look: palette id and theme name, read from its classes. */
async function look(page: Page): Promise<{ palette: number; theme: string }> {
  return page.evaluate(() => {
    const c = document.documentElement.classList;
    const palette = Number(/\bpalette-(\d)\b/.exec(c.value)?.[1] ?? 0);
    const dark = c.contains('dark-theme');
    const dim = c.contains('theme-dim');
    const theme = dark ? (dim ? 'dim-dark' : 'dark') : dim ? 'dim-light' : 'light';
    return { palette, theme };
  });
}

test.describe('Daily look rotation', () => {
  const MATRIX = [
    ['2026-06-01T12:00:00Z', 'Mon 1st', 0, 'light'],
    ['2026-06-10T12:00:00Z', 'Wed 10th', 2, 'dim-light'],
    ['2026-06-18T12:00:00Z', 'Thu 18th', 3, 'dim-dark'],
    ['2026-06-28T12:00:00Z', 'Sun 28th', 6, 'dark'],
    ['2026-06-30T12:00:00Z', 'Tue 30th (the fourth bucket runs to the end)', 1, 'dark'],
  ] as const;

  for (const [iso, label, palette, theme] of MATRIX) {
    test(`a first visit on ${label} gets palette ${palette}, ${theme}`, async ({ page }) => {
      await at(page, iso);
      await motionOff(page);
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      expect(await look(page)).toEqual({ palette, theme });
    });
  }

  test.describe('on the visitor’s local clock', () => {
    test.use({ timezoneId: 'Pacific/Auckland' });

    test('20:00 UTC on Sunday the 7th is Monday the 8th in Auckland', async ({ page }) => {
      // In UTC this would be Sunday the 7th: palette 6, light.
      await at(page, '2026-06-07T20:00:00Z');
      await motionOff(page);
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      expect(await look(page)).toEqual({ palette: 0, theme: 'dim-light' });
    });
  });

  test('a palette pick holds today, leaves the theme on the rotation, and expires tomorrow', async ({
    page,
  }) => {
    await at(page, '2026-06-10T12:00:00Z'); // Wed: palette 2, dim light
    await motionOff(page);
    await page.goto('/brand/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html[data-ambient-loader]')).toBeAttached();
    await page.evaluate(() =>
      document
        .querySelector<HTMLElement>('#palette-tabs [data-palette="4"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    );
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('palette-date')))
      .toBe('2026-06-10');

    await page.reload({ waitUntil: 'domcontentloaded' });
    expect(await look(page)).toEqual({ palette: 4, theme: 'dim-light' });

    await at(page, '2026-06-11T12:00:00Z'); // Thu: palette 3, dim light
    await page.reload({ waitUntil: 'domcontentloaded' });
    expect(await look(page)).toEqual({ palette: 3, theme: 'dim-light' });
  });

  test('a footer toggle pick holds today', async ({ page }) => {
    await at(page, '2026-06-10T12:00:00Z'); // dim light → the footer flips to dark
    await motionOff(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html[data-ambient-loader]')).toBeAttached();
    await clickThemeToggle(page);
    await expect(page.locator('html')).toHaveClass(/(^|\s)dark-theme(\s|$)/);
    expect(
      await page.evaluate(() => [localStorage.getItem('theme'), localStorage.getItem('theme-date')])
    ).toEqual(['dark', '2026-06-10']);

    await page.reload({ waitUntil: 'domcontentloaded' });
    expect(await look(page)).toEqual({ palette: 2, theme: 'dark' });
  });

  test('yesterday’s pick and an unstamped pick both yield to the rotation', async ({ page }) => {
    await at(page, '2026-06-10T12:00:00Z');
    await motionOff(page, {
      palette: '5',
      'palette-date': '2026-06-09',
      theme: 'dark', // no theme-date: stored before the rotation shipped
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(await look(page)).toEqual({ palette: 2, theme: 'dim-light' });
  });

  test('palette 0 picked today holds on a day that rotates elsewhere', async ({ page }) => {
    await at(page, '2026-06-10T12:00:00Z');
    await motionOff(page, { palette: '0', 'palette-date': '2026-06-10' });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(await look(page)).toEqual({ palette: 0, theme: 'dim-light' });
  });

  test('the /brand panel shows the rotated palette and theme', async ({ page }) => {
    await at(page, '2026-06-10T12:00:00Z');
    await motionOff(page);
    await page.goto('/brand/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html[data-ambient-loader]')).toBeAttached();
    await expect(page.locator('#palette-tabs [data-palette="2"]')).toHaveClass(
      /palette-panel__tab--active/
    );
    await expect(page.locator('#panel-theme-toggle')).toHaveAttribute('data-theme-state', '1');
  });

  test('colour edits apply only on the palette they were made on', async ({ page }) => {
    await at(page, '2026-06-10T12:00:00Z'); // palette 2
    await motionOff(page, {
      'palette-overrides': JSON.stringify({ '--color-primary': 'rgb(1, 2, 3)' }),
      'palette-overrides-palette': '1', // made on Tuesday's palette
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(
      await page.evaluate(() => document.documentElement.style.getPropertyValue('--color-primary'))
    ).toBe('');
    // palette-manager clears the stale edits from storage too.
    await expect(page.locator('html[data-ambient-loader]')).toBeAttached();
    expect(await page.evaluate(() => localStorage.getItem('palette-overrides'))).toBeNull();
  });

  test('colour edits made on today’s palette still apply', async ({ page }) => {
    await at(page, '2026-06-10T12:00:00Z'); // palette 2
    await motionOff(page, {
      'palette-overrides': JSON.stringify({ '--color-primary': 'rgb(1, 2, 3)' }),
      'palette-overrides-palette': '2',
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(
      await page.evaluate(() => document.documentElement.style.getPropertyValue('--color-primary'))
    ).toBe('rgb(1, 2, 3)');
  });
});
