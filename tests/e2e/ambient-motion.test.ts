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

  test('the popped-out panel on / carries the section, and it drives the real hero live', async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('palette-popped-out', 'true'));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#ambient-controls[data-ready="true"]')).toBeAttached();
    await page.locator('#panel-motion-toggle').click();
    await expect(page.locator('#palette-panel.is-open')).toBeAttached();
    await page.getByTestId('ambient-chip-scan').click();
    await expect(page.locator('.hero .ambient__layer--scan')).toBeVisible();
    await expect(page.getByTestId('ambient-chip-scan')).toHaveClass(/brutal-choice-btn--selected/);
  });

  test('has no axe violations with the panel open on /', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('palette-popped-out', 'true'));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#ambient-controls[data-ready="true"]')).toBeAttached();
    await page.locator('#panel-motion-toggle').click();
    await page.getByTestId('ambient-chip-glow').click();
    const result = await checkA11y(page, { include: ['#palette-panel'] });
    const blocking = [...result.critical, ...result.serious];
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
});

test.describe('Ambient motion — the rail Motion button', () => {
  /** True once the section's top edge lies inside the panel body's visible area. */
  const sectionInView = (page: Page) =>
    page.evaluate(() => {
      const body = document.getElementById('panel-body')!.getBoundingClientRect();
      const top = document.getElementById('panel-motion-section')!.getBoundingClientRect().top;
      return top >= body.top - 1 && top < body.bottom;
    });

  test('opens the panel, scrolls to the section and focuses its first toggle', async ({ page }) => {
    await page.goto('/brand/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#ambient-controls[data-ready="true"]')).toBeAttached();
    expect(await page.locator('#palette-panel').getAttribute('class')).not.toContain('is-open');
    // On the desktop rail the button is icon-only.
    await expect(page.locator('#panel-motion-toggle .palette-panel__motion-label')).toBeHidden();

    await page.getByTestId('palette-motion-toggle').click();
    await expect(page.locator('#palette-panel.is-open')).toBeAttached();
    await expect.poll(() => sectionInView(page)).toBe(true);
    await expect(page.getByTestId('ambient-chip-grid')).toBeFocused();
  });

  test('is lit only while an effect is on', async ({ page }) => {
    await page.goto('/brand/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#ambient-controls[data-ready="true"]')).toBeAttached();
    const color = () =>
      page.evaluate(() => getComputedStyle(document.getElementById('panel-motion-toggle')!).color);
    const off = await color();
    await page.getByTestId('palette-motion-toggle').click();
    await page.getByTestId('ambient-chip-glow').click();
    await expect.poll(color).not.toBe(off);
    await page.getByTestId('ambient-chip-glow').click();
    await expect.poll(color).toBe(off);
  });

  test('on a phone it sits in the open sheet, labelled, and jumps to the section', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/brand/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#ambient-controls[data-ready="true"]')).toBeAttached();
    await page.evaluate(() =>
      document
        .getElementById('panel-fab')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    );
    await expect(page.locator('#palette-panel.is-open')).toBeAttached();

    const clone = page.locator('#panel-mobile-header .palette-panel__motion');
    await expect(clone).toHaveCount(1);
    await expect(clone.locator('.palette-panel__motion-label')).toBeVisible();
    await expect(clone.locator('.palette-panel__motion-label')).toHaveText('Motion');
    const columns = await page.evaluate(
      () => getComputedStyle(document.getElementById('panel-mobile-header')!).gridTemplateColumns
    );
    expect(columns.split(/\s+/).filter(Boolean)).toHaveLength(6);

    await clone.click();
    await expect.poll(() => sectionInView(page)).toBe(true);
  });
});
