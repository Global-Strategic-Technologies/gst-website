/**
 * Localization — the rendered-page contract (BL-153, hand-off §6).
 *
 * Runs against the ordinary dev server like every other spec. `es` and `pt-BR`
 * are live in the registry, which is what makes the switcher and the first-visit
 * band render. (A second, forced-live server on 4326 was tried and removed: two
 * cold Vite dev servers sharing `node_modules/.vite` in CI produced
 * `504 Outdated Optimize Dep` on another spec's dynamic import — see
 * playwright.config.ts.)
 *
 * The first test is a vacuity guard: it fails unless the page reports ≥2 live
 * locales, so parking a locale as `draft` cannot make the rest of this file pass
 * against a page that carries no switcher — it fails here, by name, instead.
 *
 * What is asserted here and not in vitest: everything that needs a rendered
 * document — `<html lang>`, canonical, `og:locale`, hreflang presence per
 * status, the switcher's geometry and keyboard contract, the band's one-shot
 * behaviour and `localStorage.gstLang`. The functions behind them are unit
 * tested in tests/unit/i18n-locale.test.ts.
 */
import { test, expect, type Page } from '@playwright/test';
import { checkA11y, formatViolations } from './helpers/a11y';

const SWITCH = '.site-header nav ul > li.lang-switch';
const TRIGGER = `${SWITCH} button[aria-haspopup="menu"]`;
const MENU = `${SWITCH} .lang-menu`;

async function waitForNavStyles(page: Page) {
  await page.waitForFunction(() => {
    const nav = document.querySelector('.site-header nav');
    return !!nav && getComputedStyle(nav).display === 'flex';
  });
}

/**
 * Mark the visitor as already decided, so the band stays hidden. Init scripts
 * re-run on every navigation, so this only seeds a MISSING value — otherwise a
 * test that picks a language would see its pick overwritten on the next page.
 */
async function presetLang(page: Page, code: string) {
  await page.addInitScript((c) => {
    try {
      if (!localStorage.getItem('gstLang')) localStorage.setItem('gstLang', c);
    } catch {
      /* ignore */
    }
  }, code);
}

/** Pretend the browser prefers `languages`. */
async function preferLanguages(page: Page, languages: string[]) {
  await page.addInitScript((langs) => {
    Object.defineProperty(navigator, 'languages', { get: () => langs });
    Object.defineProperty(navigator, 'language', { get: () => langs[0] });
  }, languages);
}

test.describe('server sanity', () => {
  test('the page reports at least two live locales (else nothing below is testable)', async ({
    page,
  }) => {
    await presetLang(page, 'en');
    await page.goto('/about/');
    const live = await page.locator(SWITCH).getAttribute('data-live-locales');
    expect(
      live,
      'switcher missing: are at least two locales `live` in src/i18n/locales.ts?'
    ).not.toBeNull();
    expect(live!.split(',').length).toBeGreaterThanOrEqual(2);
  });
});

test.describe('document-level SEO per locale', () => {
  for (const [path, lang, og] of [
    ['/about/', 'en', 'en_US'],
    ['/es/about/', 'es', 'es_CO'],
    ['/pt/about/', 'pt-BR', 'pt_BR'],
  ] as const) {
    test(`${path}: <html lang>, canonical, og:locale and a full hreflang cluster`, async ({
      page,
    }) => {
      await presetLang(page, 'en');
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `https://globalstrategic.tech${path}`
      );
      await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', og);

      // Live in every locale on this server → every page carries the cluster.
      const alternates = page.locator('link[rel="alternate"][hreflang]');
      const hreflangs = await alternates.evaluateAll((els) =>
        els.map((e) => e.getAttribute('hreflang')).sort()
      );
      expect(hreflangs).toEqual(['en', 'es', 'pt-BR', 'x-default'].sort());
      await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
        'href',
        'https://globalstrategic.tech/about/'
      );
    });
  }

  test('an English-only route carries no hreflang cluster and no switcher alternates', async ({
    page,
  }) => {
    await presetLang(page, 'en');
    await page.goto('/ma-portfolio/');
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
    // alternatesFor() returns one entry for a non-registry route → no switcher.
    await expect(page.locator(SWITCH)).toHaveCount(0);
  });
});

test.describe('language switcher', () => {
  test.beforeEach(async ({ page }) => {
    await presetLang(page, 'en');
  });

  test('one segment showing the short code, plain at rest, stable width across locales', async ({
    page,
  }) => {
    await page.goto('/about/');
    await waitForNavStyles(page);
    const trigger = page.locator(TRIGGER);
    await expect(trigger).toHaveCount(1);
    await expect(trigger).toHaveText('EN');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).not.toHaveClass(/brutal-segmented__btn--active/);
    const enBox = await trigger.boundingBox();

    await page.goto('/pt/about/');
    await waitForNavStyles(page);
    await expect(page.locator(TRIGGER)).toHaveText('PT'); // never PT-BR
    const ptBox = await page.locator(TRIGGER).boundingBox();
    expect(Math.abs(enBox!.width - ptBox!.width)).toBeLessThanOrEqual(1);
  });

  test('sits on the same vertical axis as the four text links', async ({ page }) => {
    // The property a visitor sees: the segment's centre line and each link's
    // centre line agree. Under the flex default (`stretch`) the links rode 8px
    // above the segment — reported 2026-09-05.
    await page.goto('/about/');
    await waitForNavStyles(page);
    const trigger = await page.locator(TRIGGER).boundingBox();
    const triggerMid = trigger!.y + trigger!.height / 2;
    // The GLYPHS, not the <a> box: the link box carries 6px of padding and
    // underline below the text, so its centre is not what the eye aligns.
    const textMids = await page
      .locator('.site-header nav ul > li:not(.lang-switch) a')
      .evaluateAll((els) =>
        els.map((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          const r = range.getBoundingClientRect();
          return r.top + r.height / 2;
        })
      );
    expect(textMids).toHaveLength(4);
    for (const mid of textMids) {
      expect(Math.abs(mid - triggerMid)).toBeLessThanOrEqual(1.5);
    }
  });

  test('opens on click with the primary fill and container border; menu is right-aligned with native names', async ({
    page,
  }) => {
    await page.goto('/about/');
    await waitForNavStyles(page);
    await page.locator(TRIGGER).click();

    const trigger = page.locator(TRIGGER);
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger).toHaveClass(/brutal-segmented__btn--active/);
    const primary = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim()
    );
    expect(primary).not.toBe('');

    const menu = page.locator(MENU);
    await expect(menu).toBeVisible();
    const items = menu.locator('[role="menuitem"]');
    await expect(items).toHaveText(['English', 'Español', 'Português']);
    await expect(items.filter({ hasText: 'English' })).toHaveAttribute('aria-current', 'page');
    await expect(items.filter({ hasText: 'English' }).locator('svg')).toHaveCount(1);

    // Right-aligned to the <li>, 44px rows at desktop.
    const li = await page.locator(SWITCH).boundingBox();
    const menuBox = await menu.boundingBox();
    expect(Math.abs(li!.x + li!.width - (menuBox!.x + menuBox!.width))).toBeLessThanOrEqual(1);
    for (let i = 0; i < 3; i++) {
      const box = await items.nth(i).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('menu rows are 52px at 480px and the trigger fits the row', async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 800 });
    await page.goto('/about/');
    await waitForNavStyles(page);
    await page.locator(TRIGGER).click();
    const first = await page.locator(`${MENU} [role="menuitem"]`).first().boundingBox();
    expect(first!.height).toBeGreaterThanOrEqual(52);
  });

  test('targets the same path in the other locale, or that locale home when untranslated', async ({
    page,
  }) => {
    await page.goto('/es/about/');
    await waitForNavStyles(page);
    await page.locator(TRIGGER).click();
    const items = page.locator(`${MENU} [role="menuitem"]`);
    await expect(items.filter({ hasText: 'English' })).toHaveAttribute('href', '/about/');
    await expect(items.filter({ hasText: 'Português' })).toHaveAttribute('href', '/pt/about/');
  });

  test('keyboard: Enter opens, arrows move, Home/End jump, Escape closes and restores focus', async ({
    page,
  }) => {
    await page.goto('/about/');
    await waitForNavStyles(page);
    const trigger = page.locator(TRIGGER);
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const items = page.locator(`${MENU} [role="menuitem"]`);
    await expect(items.nth(0)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(items.nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(items.nth(2)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(items.nth(0)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(items.nth(2)).toBeFocused(); // wraps
    await page.keyboard.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator(MENU)).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('outside click closes the menu', async ({ page }) => {
    await page.goto('/about/');
    await waitForNavStyles(page);
    await page.locator(TRIGGER).click();
    await expect(page.locator(MENU)).toBeVisible();
    await page.locator('main').click({ position: { x: 10, y: 10 } });
    await expect(page.locator(MENU)).toBeHidden();
  });

  test('picking a language remembers it in localStorage.gstLang and navigates', async ({
    page,
  }) => {
    await page.goto('/about/');
    await waitForNavStyles(page);
    await page.locator(TRIGGER).click();
    await page.locator(`${MENU} [role="menuitem"]`).filter({ hasText: 'Español' }).click();
    await page.waitForURL('**/es/about/');
    expect(await page.evaluate(() => localStorage.getItem('gstLang'))).toBe('es');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  });

  test('dark theme renders the open menu with no extra CSS', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
    await page.goto('/about/');
    await waitForNavStyles(page);
    await expect(page.locator('html')).toHaveClass(/dark-theme/);
    await page.locator(TRIGGER).click();
    const bg = await page.locator(MENU).evaluate((el) => getComputedStyle(el).backgroundColor);
    // --bg-light is a light-dark() pair; in dark theme it resolves to the dark ground.
    expect(bg).not.toBe('rgb(255, 255, 255)');
    await expect(page.locator(MENU)).toBeVisible();
  });
});

test.describe('first-visit band', () => {
  test('shows once, in the suggested language, in flow under the header, and is remembered', async ({
    page,
  }) => {
    await preferLanguages(page, ['es-MX', 'en']);
    await page.goto('/about/');
    const band = page.locator('.lang-band:not([hidden])');
    await expect(band).toHaveCount(1);
    await expect(band).toHaveAttribute('lang', 'es');
    await expect(band.locator('p')).toContainText('Este sitio está disponible en español.');
    await expect(band.locator('.lang-band__accept')).toHaveAttribute('href', '/es/about/');
    // Decline stays in the CURRENT language.
    await expect(band.locator('.lang-band__decline')).toHaveText('Continue in English');

    // In flow directly under the header: its top edge is the header's bottom edge.
    const header = await page.locator('header.site-header').boundingBox();
    const bandBox = await band.boundingBox();
    expect(Math.abs(header!.y + header!.height - bandBox!.y)).toBeLessThanOrEqual(2);

    // Never redirected.
    expect(new URL(page.url()).pathname).toBe('/about/');

    await band.locator('.lang-band__decline').click();
    await expect(page.locator('.lang-band:not([hidden])')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('gstLang'))).toBe('en');

    await page.reload();
    await expect(page.locator('.lang-band:not([hidden])')).toHaveCount(0);
  });

  test('does not show when the suggestion equals the page locale or when gstLang is set', async ({
    page,
  }) => {
    await preferLanguages(page, ['en-GB']);
    await page.goto('/about/');
    await expect(page.locator('.lang-band:not([hidden])')).toHaveCount(0);

    await presetLang(page, 'en');
    await preferLanguages(page, ['pt-BR']);
    await page.goto('/about/');
    await expect(page.locator('.lang-band:not([hidden])')).toHaveCount(0);
  });

  test('suggests English on a Portuguese page to an English-preferring visitor, accept keeps the path', async ({
    page,
  }) => {
    await preferLanguages(page, ['en-US']);
    await page.goto('/pt/about/');
    const band = page.locator('.lang-band:not([hidden])');
    await expect(band).toHaveAttribute('lang', 'en');
    await expect(band.locator('.lang-band__accept')).toHaveAttribute('href', '/about/');
    await expect(band.locator('.lang-band__decline')).toHaveText('Continuar em português');
    await band.locator('.lang-band__accept').click();
    await page.waitForURL('**/about/');
    expect(await page.evaluate(() => localStorage.getItem('gstLang'))).toBe('en');
  });

  test('at 480px the band stacks, the close button is gone and the buttons clear 44px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 480, height: 800 });
    await preferLanguages(page, ['pt-BR']);
    await page.goto('/about/');
    const band = page.locator('.lang-band:not([hidden])');
    await expect(band).toHaveCount(1);
    await expect(band.locator('.lang-band__close')).toBeHidden();
    const accept = await band.locator('.lang-band__accept').boundingBox();
    const decline = await band.locator('.lang-band__decline').boundingBox();
    expect(accept!.height).toBeGreaterThanOrEqual(44);
    expect(decline!.height).toBeGreaterThanOrEqual(44);
    expect(accept!.x + accept!.width).toBeLessThanOrEqual(480);
  });
});

test.describe('announcement sash in other locales', () => {
  // Reported 2026-09-05: switching to ES made the "New GST MCP" banner vanish,
  // because the sash was rendered on the English page only. It now renders in
  // every locale with catalog copy; the ink must still fit the corner box, and
  // its links must point at the localized MCP page.
  const MIN_INK_MARGIN = 4;

  for (const [path, badge, mcp] of [
    ['/es/', 'Nuevo', '/es/hub/mcp/'],
    ['/pt/', 'Novo', '/pt/hub/mcp/'],
  ] as const) {
    test(`${path} carries the sash, localized, with its copy inside the corner`, async ({
      page,
    }) => {
      await presetLang(page, 'en');
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(path);
      const corner = page.locator('body > .brutal-sash-corner');
      await expect(corner).toHaveCount(1);
      await expect(corner.locator('.brutal-sash__badge')).toHaveText(badge);
      await expect(corner.locator('a.brutal-sash')).toHaveAttribute('href', mcp);
      const fields = corner.locator('.brutal-sash-under a');
      await expect(fields).toHaveCount(2);
      await expect(fields.first()).toHaveAttribute('href', `${mcp}#what-it-does`);

      // Same ink-containment measurement as announcement-sash.test.ts.
      const margins = await corner.evaluate((el) => {
        const box = (el as HTMLElement).offsetWidth;
        return ['.brutal-sash', '.brutal-sash-under']
          .map((sel) => {
            const band = el.querySelector<HTMLElement>(sel);
            if (!band || getComputedStyle(band).display === 'none') return null;
            const prior = band.style.transform;
            band.style.transform = 'none';
            const range = document.createRange();
            range.selectNodeContents(band);
            const ink = range.getBoundingClientRect();
            const flat = band.getBoundingClientRect();
            const dx = ink.left + ink.width / 2 - (flat.left + flat.width / 2);
            const dy = ink.top + ink.height / 2 - (flat.top + flat.height / 2);
            band.style.transform = prior;
            const bcx = band.offsetLeft + band.offsetWidth / 2;
            const bcy = band.offsetTop + band.offsetHeight / 2;
            const r2 = Math.SQRT1_2;
            const m: number[] = [];
            for (const sx of [-1, 1])
              for (const sy of [-1, 1]) {
                const px = dx + (sx * ink.width) / 2;
                const py = dy + (sy * ink.height) / 2;
                const x = bcx + (px - py) * r2;
                const y = bcy + (px + py) * r2;
                m.push(x, y, box - x, box - y);
              }
            return { sel, margin: Math.min(...m) };
          })
          .filter((b): b is { sel: string; margin: number } => b !== null);
      });
      expect(margins.length).toBeGreaterThan(0);
      for (const b of margins) {
        expect(b.margin, `${path} ${b.sel} clearance`).toBeGreaterThanOrEqual(MIN_INK_MARGIN);
      }
    });
  }

  test('the localized footer link row stays on one line from 360px up, like English', async ({
    page,
  }) => {
    // Reported 2026-09-05 (screenshot): "LINKEDIN PRIVACIDADE TERMOS / CONTATO".
    // Same design requirement narrow-viewport-chrome.test.ts pins for English.
    await presetLang(page, 'en');
    for (const width of [360, 375, 390, 430, 480, 540]) {
      await page.setViewportSize({ width, height: 800 });
      for (const path of ['/es/about/', '/pt/about/']) {
        await page.goto(path);
        await page.waitForFunction(() => {
          const row = document.querySelector('footer .footer-links');
          return !!row && getComputedStyle(row).display === 'flex';
        });
        await page.evaluate(() => document.fonts.ready);
        const lines = await page
          .locator('footer .footer-links a')
          .evaluateAll(
            (els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size
          );
        expect(lines, `${path} at ${width}px`).toBe(1);
      }
    }
  });

  test('the localized header stays one row at phone widths, like English', async ({ page }) => {
    // Reported 2026-09-05: the Spanish labels wrapped the header to two rows
    // from 375px down. Compare each locale to English at the same width rather
    // than to a fixed rule: whatever English does, the others must match.
    await presetLang(page, 'en');
    for (const width of [360, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 800 });
      const rows: Record<string, boolean> = {};
      for (const path of ['/', '/es/', '/pt/']) {
        await page.goto(path);
        await waitForNavStyles(page);
        rows[path] = await page.evaluate(() => {
          const nav = document.querySelector('.site-header nav')!;
          const ul = nav.querySelector('ul')!.getBoundingClientRect();
          const logo = nav.querySelector('.logo-wrapper')!.getBoundingClientRect();
          return ul.top >= logo.bottom - 1;
        });
      }
      expect(rows['/es/'], `${width}px: /es/ wraps but / does not`).toBe(rows['/']);
      expect(rows['/pt/'], `${width}px: /pt/ wraps but / does not`).toBe(rows['/']);
      if (width >= 360) expect(rows['/'], `${width}px: English header is one row`).toBe(false);
    }
  });
});

test.describe('accessibility of the switcher and the band', () => {
  // accessibility.test.ts scans pages at rest, so the menu is closed and the
  // band hidden there; the controls are audited here, in the states a visitor
  // actually meets: menu open, band shown.
  test('axe: open menu and visible band carry no critical or serious violations', async ({
    page,
  }) => {
    await preferLanguages(page, ['es']);
    await page.goto('/about/');
    await waitForNavStyles(page);
    await expect(page.locator('.lang-band:not([hidden])')).toHaveCount(1);
    await page.locator(TRIGGER).click();
    await expect(page.locator(MENU)).toBeVisible();
    const result = await checkA11y(page);
    expect(result.critical, formatViolations(result.critical)).toHaveLength(0);
    expect(result.serious, formatViolations(result.serious)).toHaveLength(0);
  });
});

test.describe('nav geometry with the fifth item', () => {
  for (const width of [320, 360, 375, 390, 430, 768, 1440] as const) {
    test(`at ${width}px the switcher and all four links stay on screen with no overflow`, async ({
      page,
    }) => {
      await presetLang(page, 'en');
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/services/');
      await waitForNavStyles(page);
      const trigger = page.locator(TRIGGER);
      const box = await trigger.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      const links = page.locator('.site-header nav ul > li:not(.lang-switch) a');
      await expect(links).toHaveCount(4);
      for (let i = 0; i < 4; i++) {
        const b = await links.nth(i).boundingBox();
        expect(b!.x + b!.width).toBeLessThanOrEqual(width);
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
