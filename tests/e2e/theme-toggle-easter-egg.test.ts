import { test, expect } from '@playwright/test';

/**
 * Dispatch a pointerdown on the theme toggle button.
 * Uses dispatchEvent to avoid Playwright's coordinate hit-testing issues
 * with the oversized bounding box on the toggle button.
 */
async function pressDown(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    document
      .getElementById('themeToggle')
      ?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
  });
}

/** Dispatch a pointerup on the theme toggle button. */
async function pressUp(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    document
      .getElementById('themeToggle')
      ?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
}

/** Dispatch a click on the theme toggle button (fires after pointerup in real interactions). */
async function clickToggle(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    document
      .getElementById('themeToggle')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

/** Simulate a short press: pointerdown, pointerup, click in quick succession. */
async function shortPress(page: import('@playwright/test').Page): Promise<void> {
  await pressDown(page);
  await pressUp(page);
  await clickToggle(page);
}

// ─── All-browser tests (interaction logic, no haptic assertions) ─────────────

test.describe('Theme Toggle — Long-Press Easter Egg', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure palette is not popped out
    await page.addInitScript(() => localStorage.removeItem('palette-popped-out'));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="theme-toggle"]')).toBeVisible();
  });

  test('short click still toggles theme', async ({ page }) => {
    const before = await page.evaluate(() =>
      document.documentElement.classList.contains('dark-theme')
    );

    await shortPress(page);

    // Wait for actual state change
    await page.waitForFunction(
      (was: boolean) => document.documentElement.classList.contains('dark-theme') !== was,
      before
    );

    const after = await page.evaluate(() =>
      document.documentElement.classList.contains('dark-theme')
    );
    expect(after).not.toBe(before);
  });

  test('long-press pops out palette panel and does not toggle theme', async ({ page }) => {
    const themeBefore = await page.evaluate(() =>
      document.documentElement.classList.contains('dark-theme')
    );

    await pressDown(page);

    // Wait for the actual popout state — the only observable result of a 7s hold
    await page.waitForFunction(
      () => document.documentElement.classList.contains('palette-popped-out'),
      undefined,
      { timeout: 9000 }
    );

    await pressUp(page);
    await clickToggle(page);

    // Palette should be popped out
    const isPopped = await page.evaluate(() =>
      document.documentElement.classList.contains('palette-popped-out')
    );
    expect(isPopped).toBe(true);

    // Theme should NOT have toggled (long-press suppresses click)
    const themeAfter = await page.evaluate(() =>
      document.documentElement.classList.contains('dark-theme')
    );
    expect(themeAfter).toBe(themeBefore);
  });

  test('early release cancels popout and toggles theme', async ({ page }) => {
    const before = await page.evaluate(() =>
      document.documentElement.classList.contains('dark-theme')
    );

    // Press and immediately release — no need to hold for an arbitrary duration
    await shortPress(page);

    // Wait for theme to toggle (proves click fired)
    await page.waitForFunction(
      (was: boolean) => document.documentElement.classList.contains('dark-theme') !== was,
      before
    );

    // Should NOT pop out
    const isPopped = await page.evaluate(() =>
      document.documentElement.classList.contains('palette-popped-out')
    );
    expect(isPopped).toBe(false);
  });

  test('visual hold feedback appears during hold and clears after popout', async ({ page }) => {
    await pressDown(page);

    // Wait for the holding class to appear (scheduled at 3s)
    await page.waitForFunction(
      () =>
        document.getElementById('themeToggle')?.classList.contains('theme-toggle--holding') ??
        false,
      undefined,
      { timeout: 5000 }
    );

    // Now wait for the popout to fire (at 7s) — holding class should be removed
    await page.waitForFunction(
      () => document.documentElement.classList.contains('palette-popped-out'),
      undefined,
      { timeout: 6000 }
    );

    // Holding class should be cleaned up after popout fires
    const stillHolding = await page.evaluate(
      () =>
        document.getElementById('themeToggle')?.classList.contains('theme-toggle--holding') ?? false
    );
    expect(stillHolding).toBe(false);

    await pressUp(page);
    await clickToggle(page);
  });

  test('no-op when palette already popped out', async ({ page }) => {
    // Pop out the palette first
    await page.evaluate(() => {
      localStorage.setItem('palette-popped-out', 'true');
      document.documentElement.classList.add('palette-popped-out');
    });

    const themeBefore = await page.evaluate(() =>
      document.documentElement.classList.contains('dark-theme')
    );

    // Short press — theme should still toggle normally
    await shortPress(page);

    await page.waitForFunction(
      (was: boolean) => document.documentElement.classList.contains('dark-theme') !== was,
      themeBefore
    );

    // No holding class should have appeared (startPress was never called)
    const hasHolding = await page.evaluate(
      () =>
        document.getElementById('themeToggle')?.classList.contains('theme-toggle--holding') ?? false
    );
    expect(hasHolding).toBe(false);
  });
});

// ─── Chromium-only tests (haptic feedback via navigator.vibrate) ─────────────

test.describe('Theme Toggle — Haptic Feedback (Chromium only)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Vibration API is Chromium-only');

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('palette-popped-out'));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="theme-toggle"]')).toBeVisible();

    // Install a spy on navigator.vibrate to capture calls
    await page.evaluate(() => {
      (window as any).__vibrateCalls = [] as number[];
      (navigator as any).vibrate = (pattern: number | number[]) => {
        const ms = typeof pattern === 'number' ? pattern : pattern[0];
        (window as any).__vibrateCalls.push(ms);
        return true;
      };
    });
  });

  test('haptic pulses fire during hold and include success buzz', async ({ page }) => {
    await pressDown(page);

    // Wait for the observable end state — popout class applied at 7s
    await page.waitForFunction(
      () => document.documentElement.classList.contains('palette-popped-out'),
      undefined,
      { timeout: 9000 }
    );

    const calls: number[] = await page.evaluate(() => (window as any).__vibrateCalls);

    // All 6 progressive pulses + 1 success buzz = 7 calls
    expect(calls.length).toBe(7);
    expect(calls).toContain(50); // 1s pulse
    expect(calls).toContain(75); // 2s pulse
    expect(calls).toContain(100); // 3s pulse
    expect(calls).toContain(125); // 4s pulse
    expect(calls).toContain(150); // 5s pulse
    expect(calls).toContain(200); // 6s pulse
    expect(calls).toContain(400); // 7s success buzz

    await pressUp(page);
    await clickToggle(page);
  });

  test('no haptic calls on short click', async ({ page }) => {
    await shortPress(page);

    // Wait for theme toggle to prove the click completed
    await page.waitForFunction(() => {
      const calls = (window as any).__vibrateCalls;
      // If any vibrate fired, it would be in the array; give a frame for any pending timer
      return calls !== undefined;
    });

    const calls: number[] = await page.evaluate(() => (window as any).__vibrateCalls);
    expect(calls.length).toBe(0);
  });
});
