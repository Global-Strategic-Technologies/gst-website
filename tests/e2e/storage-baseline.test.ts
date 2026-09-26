import { test, expect } from '@playwright/test';
import { AMBIENT_OFF, todayKey } from './helpers/storage-baseline';

/**
 * Canary for the config-wide baseline storage (playwright.config.ts
 * `use.storageState`, tests/e2e/helpers/storage-baseline.ts). storageState is
 * keyed by origin: point a config at an origin the baseline doesn't list and
 * every spec silently starts on the date's rotated look (ADR-0040) with ambient
 * motion running (ADR-0039). This fails first, and says why.
 */
test.describe('E2E baseline storage', () => {
  test('every context starts on palette 0, light, picked today, motion off', async ({
    page,
    baseURL,
  }) => {
    await page.goto('/');
    const stored = await page.evaluate(() => ({
      palette: localStorage.getItem('palette'),
      paletteDate: localStorage.getItem('palette-date'),
      theme: localStorage.getItem('theme'),
      themeDate: localStorage.getItem('theme-date'),
      ambient: localStorage.getItem('ambient-motion'),
    }));
    expect(
      stored,
      `baseline storage did not land on ${baseURL}: add its origin to ORIGINS in storage-baseline.ts`
    ).toEqual({
      palette: '0',
      paletteDate: todayKey(),
      theme: 'light',
      themeDate: todayKey(),
      ambient: AMBIENT_OFF,
    });

    const html = page.locator('html');
    await expect(html).not.toHaveClass(/\bdark-theme\b/);
    await expect(html).not.toHaveClass(/\btheme-dim\b/);
    await expect(html).not.toHaveClass(/\bpalette-[1-9]\b/);
    await expect(html).not.toHaveAttribute('data-ambient');
  });
});
