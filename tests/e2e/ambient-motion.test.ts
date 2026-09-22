import { test, expect, type Page } from '@playwright/test';
import { checkA11y } from './helpers/a11y';

/**
 * Hero ambient motion (BL-035, ADR-0039): the /brand palette-panel section
 * toggles the homepage hero's effect layer, saved per browser.
 *
 * Readiness: the section sets data-ready="true" only after every handler is
 * bound (TEST_BEST_PRACTICES #25/#26). Visibility is asserted with web-first
 * assertions, which poll (#23).
 */

const STORAGE_KEY = 'ambient-motion';

/** Seed a stored choice before the page's own scripts run — first load only. */
async function seed(page: Page, value: object): Promise<void> {
  await page.addInitScript(
    ([key, raw]) => {
      if (!sessionStorage.getItem('__ambient-seeded')) {
        localStorage.setItem(key, raw);
        sessionStorage.setItem('__ambient-seeded', '1');
      }
    },
    [STORAGE_KEY, JSON.stringify(value)] as const
  );
}

/** Open /brand's panel with the Ambient Motion section wired. */
async function openBrandPanel(page: Page): Promise<void> {
  await page.goto('/brand/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#ambient-controls[data-ready="true"]')).toBeAttached();
  await page.evaluate(() =>
    document
      .getElementById('panel-toggle')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  );
  await expect(page.locator('#palette-panel.is-open')).toBeAttached();
  await expect(page.getByTestId('ambient-controls')).toBeVisible();
}

const htmlAttr = (page: Page, name: string) =>
  page.evaluate((n) => document.documentElement.getAttribute(n), name);

const htmlVar = (page: Page, name: string) =>
  page.evaluate((n) => document.documentElement.style.getPropertyValue(n), name);

test.describe('Ambient motion — /brand panel section', () => {
  test('starts with every effect off and a still preview', async ({ page }) => {
    await openBrandPanel(page);
    const chips = page.locator('[data-ambient-effect]');
    await expect(chips).toHaveCount(5);
    for (const chip of await chips.all())
      await expect(chip).toHaveAttribute('aria-pressed', 'false');
    for (const id of ['grid', 'glow', 'scan', 'rails', 'deltas']) {
      await expect(page.getByTestId(`ambient-strength-${id}`)).toBeDisabled();
    }
    await expect(page.getByTestId('ambient-pace')).toBeDisabled();
    expect(await htmlAttr(page, 'data-ambient')).toBeNull();
    const stage = page.getByTestId('brand-ambient-stage');
    await expect(stage.locator('.ambient__layer--glow')).toBeHidden();
  });

  test('multi-select toggles, layers, tunes, persists, and survives a palette change', async ({
    page,
  }) => {
    await openBrandPanel(page);
    await page.getByTestId('ambient-chip-glow').click();
    await page.getByTestId('ambient-chip-rails').click();

    await expect(page.getByTestId('ambient-chip-glow')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('ambient-chip-rails')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('ambient-chip-scan')).toHaveAttribute('aria-pressed', 'false');
    expect(await htmlAttr(page, 'data-ambient')).toBe('glow rails');
    expect(await htmlAttr(page, 'data-ambient-layered')).toBe('');

    // Rows follow the chips; effects that are off stay disabled.
    await expect(page.getByTestId('ambient-strength-glow')).toBeEnabled();
    await expect(page.getByTestId('ambient-strength-scan')).toBeDisabled();
    await expect(page.getByTestId('ambient-pace')).toBeEnabled();
    await expect(page.locator('#ambient-state')).toHaveText(/2 of 5 on/);

    // The /brand preview follows live.
    const stage = page.getByTestId('brand-ambient-stage');
    await expect(stage.locator('.ambient__layer--glow')).toBeVisible();
    await expect(stage.locator('.ambient__layer--rails')).toBeVisible();
    await expect(stage.locator('.ambient__layer--scan')).toBeHidden();
    // Layered: solo elements are thinned out of the budget.
    await expect(stage.locator('.ambient__layer--rails .ambient__el--solo').first()).toBeHidden();

    await page.getByTestId('ambient-strength-glow').fill('70');
    await expect.poll(() => htmlVar(page, '--ambient-glow')).toBe('0.7');
    await expect(page.locator('[data-ambient-value="glow"]')).toHaveText('70%');
    await page.getByTestId('ambient-pace').fill('130');
    await expect.poll(() => htmlVar(page, '--ambient-pace')).toBe('1.3');

    // A new palette wipes colour edits, never motion.
    await page.evaluate(() =>
      document
        .querySelector<HTMLElement>('#palette-tabs [data-palette="3"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    );
    await expect.poll(() => htmlAttr(page, 'class')).toContain('palette-3');
    expect(await htmlAttr(page, 'data-ambient')).toBe('glow rails');

    // Reload: applied before paint, and the controls hydrate from storage.
    await page.reload({ waitUntil: 'domcontentloaded' });
    expect(await htmlAttr(page, 'data-ambient')).toBe('glow rails');
    expect(await htmlVar(page, '--ambient-glow')).toBe('0.7');
    await expect(page.locator('#ambient-controls[data-ready="true"]')).toBeAttached();
    await expect(page.getByTestId('ambient-chip-glow')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('ambient-strength-glow')).toHaveValue('70');

    // …and it reaches the homepage hero.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.hero .ambient__layer--glow')).toBeVisible();
    await expect(page.locator('.hero .ambient__layer--rails')).toBeVisible();
    await expect(page.locator('.hero .ambient__layer--grid')).toBeHidden();
  });

  test('a single effect shows its full set; Reset forgets everything', async ({ page }) => {
    await openBrandPanel(page);
    await page.getByTestId('ambient-chip-rails').click();
    expect(await htmlAttr(page, 'data-ambient-layered')).toBeNull();
    const stage = page.getByTestId('brand-ambient-stage');
    await expect(stage.locator('.ambient__layer--rails .ambient__el--solo').first()).toBeVisible();

    await page.getByTestId('ambient-reset').click();
    expect(await htmlAttr(page, 'data-ambient')).toBeNull();
    await expect(page.getByTestId('ambient-chip-rails')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#ambient-state')).toHaveText(/Nothing on/);
    expect(await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)).toBeNull();
    await expect(stage.locator('.ambient__layer--rails')).toBeHidden();
  });

  // accessibility.test.ts scans /brand with the panel closed, where its body is
  // display:none and axe skips it — so the section is scanned open here. One
  // effect on leaves four rows disabled, covering both row states.
  for (const theme of ['light', 'dark'] as const) {
    test(`has no axe violations with the panel open (${theme})`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
      await openBrandPanel(page);
      await page.getByTestId('ambient-chip-glow').click();
      const result = await checkA11y(page, { include: ['#palette-panel'] });
      const blocking = [...result.critical, ...result.serious];
      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    });
  }
});

test.describe('Ambient motion — homepage hero', () => {
  test('a visitor with nothing stored sees a still hero', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(await htmlAttr(page, 'data-ambient')).toBeNull();
    await expect(page.locator('.hero .ambient')).toBeAttached();
    for (const id of ['grid', 'glow', 'scan', 'rails', 'deltas']) {
      await expect(page.locator(`.hero .ambient__layer--${id}`)).toBeHidden();
    }
  });

  test('a stored choice shows on / and the localized homepage', async ({ page }) => {
    await seed(page, { on: ['scan', 'deltas'], strength: { scan: 60 } });
    for (const path of ['/', '/es/']) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.hero .ambient__layer--scan'), path).toBeVisible();
      await expect(page.locator('.hero .ambient__layer--deltas'), path).toBeVisible();
    }
    expect(await htmlVar(page, '--ambient-scan')).toBe('0.6');
  });

  test('reduced motion hides the layer whatever is stored', async ({ page }) => {
    await seed(page, { on: ['glow'] });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(await htmlAttr(page, 'data-ambient')).toBe('glow');
    await expect(page.locator('.hero .ambient')).toBeHidden();
  });

  test('other Hero pages carry no layer', async ({ page }) => {
    await page.goto('/about/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.hero')).toBeAttached();
    await expect(page.locator('.hero .ambient')).toHaveCount(0);
  });

  test('the popped-out panel off /brand has no motion section', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('palette-popped-out', 'true'));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('palette-panel')).toBeAttached();
    await expect(page.locator('#ambient-controls')).toHaveCount(0);
  });
});
