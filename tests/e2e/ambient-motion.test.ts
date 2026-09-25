import { test, expect, type Page } from '@playwright/test';
import { checkA11y } from './helpers/a11y';
import { palettes } from '../../src/data/palettes';

/**
 * Hero ambient motion (BL-035, ADR-0039): the /brand palette-panel section
 * toggles the homepage hero's effect layer, saved per browser.
 *
 * Readiness (TEST_BEST_PRACTICES #25/#26/#28): palette-manager.ts publishes
 * the ambient loader's decision as <html data-ambient-loader>; the Motion
 * controls are built on the panel's first open and set data-ready="true" once
 * wired; a stored choice builds the effect only after `load` + idle, and the
 * loader then reads "loaded". `off` and `skipped` are final, so an absence
 * gated on them proves something. Visibility is asserted with web-first
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

/** palette-manager.ts has run: it publishes the ambient loader's state. */
async function scriptsReady(page: Page): Promise<void> {
  await expect(page.locator('html[data-ambient-loader]')).toBeAttached();
}

/** Open the panel; its first open builds the Motion controls. */
async function openPanel(page: Page): Promise<void> {
  await scriptsReady(page);
  await page.evaluate(() =>
    document
      .getElementById('panel-toggle')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  );
  await expect(page.locator('#palette-panel.is-open')).toBeAttached();
  await expect(page.locator('#ambient-controls[data-ready="true"]')).toBeAttached();
}

/** Open /brand's panel with the Ambient Motion section wired. */
async function openBrandPanel(page: Page): Promise<void> {
  await page.goto('/brand/', { waitUntil: 'domcontentloaded' });
  await openPanel(page);
  await expect(page.getByTestId('ambient-controls')).toBeVisible();
}

/** A stored choice is built only after `load` + idle; wait for the runtime. */
async function effectReady(page: Page): Promise<void> {
  await page.waitForLoadState('load');
  await expect(page.locator('html[data-ambient-loader="loaded"]')).toBeAttached();
}

const htmlAttr = (page: Page, name: string) =>
  page.evaluate((n) => document.documentElement.getAttribute(n), name);

const htmlVar = (page: Page, name: string) =>
  page.evaluate((n) => document.documentElement.style.getPropertyValue(n), name);

test.describe('Ambient motion — /brand panel section', () => {
  test('starts with every effect off and a still preview', async ({ page }) => {
    await openBrandPanel(page);
    const chips = page.locator('[data-ambient-effect]');
    await expect(chips).toHaveCount(6);
    for (const chip of await chips.all())
      await expect(chip).toHaveAttribute('aria-pressed', 'false');
    for (const id of ['grid', 'glow', 'scan', 'rails', 'deltas', 'arrows']) {
      await expect(page.getByTestId(`ambient-strength-${id}`)).toBeDisabled();
    }
    await expect(page.getByTestId('ambient-pace')).toBeDisabled();
    expect(await htmlAttr(page, 'data-ambient')).toBeNull();
    expect(await htmlAttr(page, 'data-ambient-loader')).toBe('off');
    const stage = page.getByTestId('brand-ambient-stage');
    await expect(stage.locator('.ambient__layer')).toHaveCount(0);
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
    await expect(page.locator('#ambient-state')).toHaveText(/2 of 6 on/);

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
    await openPanel(page);
    await expect(page.getByTestId('ambient-chip-glow')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('ambient-strength-glow')).toHaveValue('70');

    // …and it reaches the homepage hero.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await effectReady(page);
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
  // effect on leaves five rows disabled, covering both row states.
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
    await scriptsReady(page);
    expect(await htmlAttr(page, 'data-ambient')).toBeNull();
    expect(await htmlAttr(page, 'data-ambient-loader')).toBe('off');
    // The placeholder is there; the layer is never built.
    await expect(page.locator('.hero .ambient')).toBeAttached();
    await expect(page.locator('.hero .ambient__layer')).toHaveCount(0);
  });

  // A visitor who never opted in downloads none of it (the lazy-loading
  // change): not the effect, not its CSS, not the panel's Motion controls.
  // Gated on the loader's final `off` state, so the absence means something.
  // URLs are the dev server's module paths, which is what E2E runs against.
  test('a visitor who never opted in fetches none of ambient motion', async ({ page }) => {
    const fetched: string[] = [];
    page.on('request', (r) => {
      if (/\/scripts\/ambient\/(runtime|controls)|ambient\.css|controls\.css/.test(r.url()))
        fetched.push(r.url());
    });
    for (const path of ['/', '/about/', '/brand/']) {
      await page.goto(path, { waitUntil: 'load' });
      await expect(page.locator('html[data-ambient-loader="off"]'), path).toBeAttached();
      await expect(page.locator('.ambient__layer'), path).toHaveCount(0);
      await expect(page.locator('#ambient-css'), path).toHaveCount(0);
      await expect(page.locator('#ambient-controls'), path).toHaveCount(0);
    }
    expect(fetched).toEqual([]);
  });

  test('a stored choice loads the effect only after the page has loaded, and fades it in', async ({
    page,
  }) => {
    await seed(page, { on: ['glow'] });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await effectReady(page);
    await expect(page.locator('.hero .ambient[data-ambient-ready]')).toBeAttached();
    // Ordered by the browser's own clock, not by catching a state mid-flight.
    const { runtime, loadStart } = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const entry = performance
        .getEntriesByType('resource')
        .find((e) => e.name.includes('/scripts/ambient/runtime'));
      return { runtime: entry?.startTime ?? -1, loadStart: nav.loadEventStart };
    });
    expect(runtime).toBeGreaterThanOrEqual(loadStart);
    await expect
      .poll(() =>
        page.evaluate(() => getComputedStyle(document.querySelector('.hero .ambient')!).opacity)
      )
      .toBe('1');
  });

  test('Hero scope on a page with no hero layer loads nothing', async ({ page }) => {
    await seed(page, { on: ['glow'], scope: 'hero' });
    const fetched: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/scripts/ambient/runtime')) fetched.push(r.url());
    });
    await page.goto('/about/', { waitUntil: 'load' });
    await expect(page.locator('html[data-ambient-loader="skipped"]')).toBeAttached();
    expect(fetched).toEqual([]);
  });

  test('a stored choice shows on / and the localized homepage', async ({ page }) => {
    await seed(page, { on: ['scan', 'deltas'], strength: { scan: 60 } });
    for (const path of ['/', '/es/']) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await effectReady(page);
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
    // Nothing is fetched or built, and the placeholder itself is hidden.
    await expect(page.locator('html[data-ambient-loader="skipped"]')).toBeAttached();
    await expect(page.locator('.hero .ambient')).toBeHidden();
    await expect(page.locator('.hero .ambient__layer')).toHaveCount(0);
  });

  test('Glow Shift fades out with the hero band instead of stopping at its edge', async ({
    page,
  }) => {
    // The layer clips at the hero's box; unmasked, glow b ends in a flat line
    // across the hero's foot. Measure what a visitor sees: the mean brightness
    // step between the two pixel rows either side of that edge (≈3.5 unmasked,
    // 0 masked; the page's own grid lines step ≈0.8 anywhere).
    await page.setViewportSize({ width: 1218, height: 900 });
    await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
    await seed(page, { on: ['glow'] });
    await page.goto('/', { waitUntil: 'load' });
    await effectReady(page);
    // Measured once the fade-in has finished.
    await expect
      .poll(() =>
        page.evaluate(() => getComputedStyle(document.querySelector('.hero .ambient')!).opacity)
      )
      .toBe('1');
    const bottom = await page.evaluate(() => {
      for (const a of document.getAnimations()) {
        const target = (a.effect as KeyframeEffect | null)?.target;
        if (!target?.closest('.hero .ambient__layer--glow')) continue;
        a.pause();
        // The end of the drift's leg: glow b sits lowest in the hero there.
        a.currentTime = Number(a.effect!.getComputedTiming().duration);
      }
      const hero = document.querySelector('.hero')!;
      hero.scrollIntoView({ block: 'end' });
      window.scrollBy(0, 300);
      return Math.round(hero.getBoundingClientRect().bottom);
    });
    const shot = await page.screenshot({ clip: { x: 0, y: bottom - 40, width: 1218, height: 80 } });
    const step = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, img.width, img.height).data;
      const lum = (y: number, x: number): number => {
        const i = (img.width * y + x) * 4;
        return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      };
      const rowStep = (y: number): number => {
        let sum = 0;
        for (let x = 0; x < img.width; x++) sum += Math.abs(lum(y, x) - lum(y - 1, x));
        return sum / img.width;
      };
      return Math.max(rowStep(40), rowStep(41));
    }, shot.toString('base64'));
    expect(step).toBeLessThan(1.5);
  });

  test.describe('Delta Arrows', () => {
    // Measured on /brand's preview stage (about 808×318 at 1218 wide), whose
    // shape is far from the viewport's: without its size container, `cq`
    // units fall back to the viewport and the arrows would still fly, but
    // along the viewport's diagonal, which only a differently shaped layer
    // tells apart. Frozen with getAnimations(), like the Glow Shift test.
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1218, height: 900 });
      await seed(page, { on: ['arrows'] });
      await page.goto('/brand/', { waitUntil: 'domcontentloaded' });
      await effectReady(page);
      const stage = page.getByTestId('brand-ambient-stage');
      await stage.scrollIntoViewIfNeeded();
      await expect(stage.locator('.ambient__layer--arrows')).toBeVisible();
    });

    /** Freeze the stage's first volley at `f` of its cycle; read its lead's
     *  tip and base (probe points added inside the rotated arrow) and the
     *  layer's size, all as the visitor sees them. */
    const frame = (page: Page, f: number) =>
      page.evaluate((f) => {
        const stage = document.querySelector('[data-testid="brand-ambient-stage"]')!;
        const volley = stage.querySelector<HTMLElement>('.ambient__volley')!;
        for (const a of volley.getAnimations()) {
          a.pause();
          a.currentTime = Number(a.effect!.getComputedTiming().duration) * f;
        }
        const lead = volley.querySelector<HTMLElement>('[data-lead]')!;
        const probe = (top: string) => {
          let el = lead.querySelector<HTMLElement>(`[data-probe="${top}"]`);
          if (!el) {
            el = document.createElement('span');
            el.dataset.probe = top;
            el.style.cssText = `position:absolute;left:50%;top:${top};width:0;height:0`;
            lead.append(el);
          }
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y };
        };
        const layer = stage.querySelector('.ambient__layer--arrows')!.getBoundingClientRect();
        // DeltaIcon's path: apex at y=12, base at y=52 of 64.
        return { tip: probe('18.75%'), base: probe('81.25%'), w: layer.width, h: layer.height };
      }, f);

    const deg = (dx: number, dy: number) => (Math.atan2(-dy, dx) * 180) / Math.PI;

    test("volleys fly bottom-left → top-right along the layer's own diagonal", async ({ page }) => {
      const a = await frame(page, 0.2);
      const b = await frame(page, 0.4);
      const dx = b.tip.x - a.tip.x;
      const dy = b.tip.y - a.tip.y;
      expect(dx).toBeGreaterThan(0); // right
      expect(dy).toBeLessThan(0); // and up
      expect(Math.abs(deg(dx, dy) - deg(a.w, -a.h))).toBeLessThan(3);
    });

    test('each arrow is the unaltered brand delta: outline, stroke, square', async ({ page }) => {
      // Operator ruling (2026-09-23): never filled, never stretched.
      const arrows = await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid="brand-ambient-stage"] .ambient__arrow')].map(
          (el) => {
            const path = el.querySelector('svg path')!;
            return {
              scale: getComputedStyle(el).scale,
              fill: path.getAttribute('fill'),
              stroke: path.getAttribute('stroke'),
              strokeWidth: path.getAttribute('stroke-width'),
              ratio: el.clientWidth / el.clientHeight,
            };
          }
        )
      );
      expect(arrows.length).toBeGreaterThan(0);
      for (const a of arrows)
        expect(a).toEqual({
          scale: 'none',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: '6',
          ratio: 1,
        });
    });

    test('each arrowhead points where it flies', async ({ page }) => {
      const a = await frame(page, 0.2);
      const b = await frame(page, 0.4);
      const travel = deg(b.tip.x - a.tip.x, b.tip.y - a.tip.y);
      const pointing = deg(a.tip.x - a.base.x, a.tip.y - a.base.y);
      expect(Math.abs(pointing - travel)).toBeLessThan(3);
    });
  });

  test('in Hero scope, other Hero pages carry no hero layer', async ({ page }) => {
    await page.goto('/about/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.hero')).toBeAttached();
    await expect(page.locator('.hero .ambient')).toHaveCount(0);
  });

  test('the popped-out panel on / carries the section, and it drives the real hero live', async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('palette-popped-out', 'true'));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await scriptsReady(page);
    await page.locator('#panel-motion-toggle').click();
    await expect(page.locator('#ambient-controls[data-ready="true"]')).toBeAttached();
    await expect(page.locator('#palette-panel.is-open')).toBeAttached();
    await page.getByTestId('ambient-chip-scan').click();
    await expect(page.locator('.hero .ambient__layer--scan')).toBeVisible();
    await expect(page.getByTestId('ambient-chip-scan')).toHaveClass(/brutal-choice-btn--selected/);
  });

  test('has no axe violations with the panel open on /', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('palette-popped-out', 'true'));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await scriptsReady(page);
    await page.locator('#panel-motion-toggle').click();
    await expect(page.locator('#ambient-controls[data-ready="true"]')).toBeAttached();
    await page.getByTestId('ambient-chip-glow').click();
    const result = await checkA11y(page, { include: ['#palette-panel'] });
    const blocking = [...result.critical, ...result.serious];
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
});

test.describe('Ambient motion — scope (Hero / Homepage / Every page)', () => {
  const ALL = ['grid', 'glow', 'scan', 'rails', 'deltas', 'arrows'];

  /** Real signal, not a class: animations whose target is inside the page layer.
   *  CSS animations only, so the layers' fade-in (a transition) never counts. */
  const pageLayer = (page: Page) =>
    page.evaluate(() => {
      const layer = document.getElementById('ambient-page')!;
      const animations = document.getAnimations().filter((a) => a instanceof CSSAnimation);
      const running = animations.filter((a) =>
        layer.contains((a.effect as KeyframeEffect | null)?.target ?? null)
      ).length;
      const main = document.querySelector('main')!.getBoundingClientRect();
      const last = layer.lastElementChild?.getBoundingClientRect();
      const hero = document.querySelector('.hero')?.getBoundingClientRect();
      // Everything ambient on the page — the hero layer and the background —
      // since the budget is for both together.
      const total = animations.filter((a) =>
        ((a.effect as KeyframeEffect | null)?.target as Element | null)?.closest('.ambient')
      ).length;
      return {
        display: getComputedStyle(layer).display,
        running,
        total,
        spacers: layer.children.length,
        covered: last ? last.bottom >= main.bottom - 1 : false,
        belowHero: hero ? layer.getBoundingClientRect().top >= hero.bottom - 1 : true,
      };
    });

  test('the Scope control defaults to Hero and sets the scope live', async ({ page }) => {
    await page.goto('/brand/', { waitUntil: 'domcontentloaded' });
    await scriptsReady(page);
    await page.getByTestId('palette-motion-toggle').click();
    await expect(page.locator('#ambient-controls[data-ready="true"]')).toBeAttached();
    await expect(page.getByTestId('ambient-scope-hero')).toBeDisabled();
    await page.getByTestId('ambient-chip-glow').click();
    await expect(page.getByTestId('ambient-scope-hero')).toHaveAttribute('aria-pressed', 'true');
    expect(await htmlAttr(page, 'data-ambient-scope')).toBe('hero');
    await page.getByTestId('ambient-scope-page').click();
    await expect(page.getByTestId('ambient-scope-page')).toHaveAttribute('aria-pressed', 'true');
    expect(await htmlAttr(page, 'data-ambient-scope')).toBe('page');
    await expect(page.locator('#ambient-scope-hint')).toHaveText('Whole homepage');
    await expect(page.locator('#ambient-state')).toHaveText(/homepage/);
  });

  test('Hero scope draws no page background on /', async ({ page }) => {
    await seed(page, { on: ALL, scope: 'hero' });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await effectReady(page);
    await expect(page.locator('.hero .ambient__layer--glow')).toBeVisible();
    await expect.poll(async () => (await pageLayer(page)).display).toBe('none');
    expect((await pageLayer(page)).running).toBe(0);
  });

  test('Homepage scope fills / below the hero, within budget, top to bottom', async ({ page }) => {
    await seed(page, { on: ALL, scope: 'page' });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await effectReady(page);
    await expect.poll(async () => (await pageLayer(page)).running).toBeGreaterThan(0);
    const top = await pageLayer(page);
    expect(top.running).toBeLessThanOrEqual(32);
    expect(top.covered).toBe(true);
    expect(top.belowHero).toBe(true);

    expect(top.total).toBeLessThanOrEqual(32);

    // The worst case: a tile boundary mid-screen (two tiles live) with the hero
    // scrolled away. Its layer must stop, or the total would be 16 + 32.
    await page.evaluate(() => {
      const second = document.getElementById('ambient-page')!.children[1] as HTMLElement;
      window.scrollTo(0, second.getBoundingClientRect().top + window.scrollY - innerHeight / 2);
    });
    await expect.poll(async () => (await pageLayer(page)).running).toBe(32);
    // The hero has scrolled away, so its layer stops: still ≤32 all told.
    await expect.poll(async () => (await pageLayer(page)).total).toBeLessThanOrEqual(32);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect.poll(async () => (await pageLayer(page)).running).toBeGreaterThan(0);
    // The clone moved: the first spacer is empty once it has scrolled away.
    await expect
      .poll(() =>
        page.evaluate(() => !document.getElementById('ambient-page')!.firstElementChild!.firstChild)
      )
      .toBe(true);
  });

  test('Homepage scope leaves other pages alone', async ({ page }) => {
    await seed(page, { on: ALL, scope: 'page' });
    await page.goto('/about/', { waitUntil: 'domcontentloaded' });
    // Nothing here that Homepage scope would draw, so nothing is loaded.
    await expect(page.locator('html[data-ambient-loader="skipped"]')).toBeAttached();
    expect((await pageLayer(page)).display).toBe('none');
    expect((await pageLayer(page)).running).toBe(0);
  });

  test('Every-page scope reaches other pages and locales', async ({ page }) => {
    await seed(page, { on: ALL, scope: 'site' });
    for (const path of ['/about/', '/es/']) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await effectReady(page);
      // The background starts below the hero, which on a short viewport (and
      // /es/, with its language band) can end below the fold — scroll past it.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
      await expect
        .poll(async () => (await pageLayer(page)).running, { message: path })
        .toBeGreaterThan(0);
      expect((await pageLayer(page)).running).toBeLessThanOrEqual(32);
    }
  });

  test("/brand's own preview stops off screen, so the total stays within budget", async ({
    page,
  }) => {
    await seed(page, { on: ALL, scope: 'site' });
    await page.goto('/brand/', { waitUntil: 'domcontentloaded' });
    await effectReady(page);
    await expect.poll(async () => (await pageLayer(page)).spacers).toBeGreaterThan(8);
    // A tile boundary well away from the preview stage: two tiles live.
    await page.evaluate(() => {
      const s = document.getElementById('ambient-page')!.children[6] as HTMLElement;
      window.scrollTo(0, s.getBoundingClientRect().top + window.scrollY - innerHeight / 2);
    });
    await expect.poll(async () => (await pageLayer(page)).running).toBe(32);
    await expect.poll(async () => (await pageLayer(page)).total).toBe(32);
  });

  test('placing the background causes no layout shift', async ({ page }) => {
    // The layer is positioned by script after first paint; it stays hidden
    // until placed, or its jump below the hero counts as CLS (0.62 measured).
    await seed(page, { on: ALL, scope: 'site' });
    await page.goto('/', { waitUntil: 'load' });
    await effectReady(page);
    await expect.poll(async () => (await pageLayer(page)).running).toBeGreaterThan(0);
    const cls = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let total = 0;
          new PerformanceObserver((list) => {
            for (const e of list.getEntries()) total += (e as unknown as { value: number }).value;
          }).observe({ type: 'layout-shift', buffered: true });
          setTimeout(() => resolve(total), 300);
        })
    );
    expect(cls).toBe(0);
  });

  test('reduced motion builds no page background', async ({ page }) => {
    await seed(page, { on: ['glow'], scope: 'site' });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/about/', { waitUntil: 'domcontentloaded' });
    // The runtime is never fetched, so nothing can be built.
    await expect(page.locator('html[data-ambient-loader="skipped"]')).toBeAttached();
    const r = await pageLayer(page);
    expect(r.spacers).toBe(0);
    expect(r.running).toBe(0);
  });

  test('switching scope from the panel on / adds and removes the background live', async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('palette-popped-out', 'true'));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await scriptsReady(page);
    await page.getByTestId('palette-motion-toggle').click();
    await expect(page.locator('#ambient-controls[data-ready="true"]')).toBeAttached();
    await page.getByTestId('ambient-chip-rails').click();
    await page.getByTestId('ambient-scope-page').click();
    await expect.poll(async () => (await pageLayer(page)).running).toBeGreaterThan(0);
    await page.getByTestId('ambient-scope-hero').click();
    await expect.poll(async () => (await pageLayer(page)).running).toBe(0);
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
    await scriptsReady(page);
    expect(await page.locator('#palette-panel').getAttribute('class')).not.toContain('is-open');
    // On the desktop rail the button is icon-only.
    await expect(page.locator('#panel-motion-toggle .palette-panel__motion-label')).toBeHidden();

    await page.getByTestId('palette-motion-toggle').click();
    await expect(page.locator('#ambient-controls[data-ready="true"]')).toBeAttached();
    await expect(page.locator('#palette-panel.is-open')).toBeAttached();
    await expect.poll(() => sectionInView(page)).toBe(true);
    await expect(page.getByTestId('ambient-chip-grid')).toBeFocused();
  });

  test('is lit only while an effect is on', async ({ page }) => {
    await page.goto('/brand/', { waitUntil: 'domcontentloaded' });
    await scriptsReady(page);
    const color = () =>
      page.evaluate(() => getComputedStyle(document.getElementById('panel-motion-toggle')!).color);
    const off = await color();
    await page.getByTestId('palette-motion-toggle').click();
    await expect(page.locator('#ambient-controls[data-ready="true"]')).toBeAttached();
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
    await scriptsReady(page);
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
    // Three tracks per palette, so the three delta buttons split row 2 evenly.
    expect(columns.split(/\s+/).filter(Boolean)).toHaveLength(palettes.length * 3);
    const buttonTops = await page.evaluate(() =>
      ['.palette-panel__popout', '.palette-panel__motion', '.palette-panel__theme-toggle'].map(
        (sel) =>
          Math.round(
            document.querySelector(`#panel-mobile-header ${sel}`)!.getBoundingClientRect().top
          )
      )
    );
    expect(new Set(buttonTops).size, 'the three delta buttons share one row').toBe(1);

    await clone.click();
    await expect.poll(() => sectionInView(page)).toBe(true);
  });
});
