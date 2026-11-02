/**
 * The IRL Extractor in every locale (BL-153 Tier B) — the rendered-page
 * contract unit tests cannot reach: the page's chrome and script words come
 * from the locale's catalog, the markdown it produces stays English, catalog
 * links and the notes keep their styling, and the advisory still moves nothing
 * at the cap tier in the longer languages.
 *
 * Expected strings are read from the catalogs, not retyped. The English
 * assertions for the tool itself live in hub-tools-irl-extractor.test.ts.
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  BLANK_ROWS,
  FILLED_ROWS,
  buildWorkbook,
  gotoTool,
  pickWorkbook,
} from './helpers/irl-extractor';

// Read, not imported: Playwright's Node loader needs an import attribute for JSON.
const read = (code: string, ns: string): Record<string, string> =>
  JSON.parse(readFileSync(`src/i18n/${code}/${ns}.json`, 'utf-8'));

const LOCALES = [
  { prefix: '', lang: 'en', decimal: '.' },
  { prefix: '/es', lang: 'es', decimal: ',' },
  { prefix: '/pt', lang: 'pt-BR', decimal: ',' },
].map((l) => ({ ...l, ui: read(l.lang, 'information-request-list-extractor') }));

const TOOL_PATH = '/hub/tools/information-request-list-extractor/';

const fill = (template: string, params: Record<string, string>) =>
  Object.entries(params).reduce((text, [k, v]) => text.replace(`{${k}}`, v), template);

/** The computed value a token resolves to on this page (the palette rotates daily). */
async function resolved(page: Page, property: 'color' | 'fontSize', token: string) {
  return page.evaluate(
    ([prop, name]) => {
      const probe = document.createElement('span');
      probe.style.setProperty(prop === 'fontSize' ? 'font-size' : 'color', `var(${name})`);
      document.body.append(probe);
      const value = getComputedStyle(probe)[prop as 'color' | 'fontSize'];
      probe.remove();
      return value;
    },
    [property, token]
  );
}

for (const { prefix, lang, decimal, ui } of LOCALES) {
  test.describe(`IRL Extractor (${lang})`, () => {
    const url = `${prefix}${TOOL_PATH}`;

    test('the chrome renders from the catalog', async ({ page }) => {
      await gotoTool(page, url);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.locator('#irl-ext-status')).toHaveText(ui['out.waiting']);
      await expect(page.locator('#irl-ext-copy')).toHaveText(ui['action.copy']);
      await expect(page.locator('.irl-ext__error-title')).toHaveText(ui['error.title']);
      await expect(page.locator('#irl-ext-md')).toHaveAttribute('aria-label', ui['out.ariaLabel']);
      await expect(page.locator('.irl-ext__back')).toHaveText(ui['nav.back']);
    });

    test('a filled workbook reports in the locale and converts to English markdown', async ({
      page,
    }) => {
      await gotoTool(page, url);
      await pickWorkbook(page, 'acme-irl.xlsx', buildWorkbook(FILLED_ROWS));
      await expect(page.locator('#irl-ext-md')).toBeVisible({ timeout: 10000 });

      await expect(page.locator('#irl-ext-status')).toHaveText(
        fill(ui['js.status.read'], {
          sheet: 'Information Request List',
          requests: fill(ui['js.status.requests.other'], { count: '3' }),
          sections: fill(ui['js.status.sections.one'], { count: '1' }),
        })
      );
      await expect(page.locator('#diag-bullets')).toHaveText('3');
      await expect(page.locator('#diag-bytes')).toHaveText(new RegExp(`^\\d+\\${decimal}\\d KB$`));

      // Machine-read grammar: byte-identical to the operator CLI in every locale.
      const text = await page.locator('#irl-ext-md').textContent();
      expect(text).toContain('# Information Request List — Acme Co (filled)');
      expect(text).toContain('> Engagement context: Value Creation');
      expect(text).toContain('- 0-03 Annual recurring revenue [OPEN] — <NO RESPONSE>');
    });

    test('an unfilled template raises the translated advisory', async ({ page }) => {
      await gotoTool(page, url);
      await pickWorkbook(page, 'blank.xlsx', buildWorkbook(BLANK_ROWS));
      await expect(page.locator('#irl-ext-advisory')).toHaveText(
        fill(ui['js.advisory.unanswered.other'], { count: '3' }),
        { timeout: 10000 }
      );
    });

    test('a workbook with no request rows explains itself in the locale', async ({ page }) => {
      await gotoTool(page, url);
      await pickWorkbook(
        page,
        'q3-budget.xlsx',
        buildWorkbook([['Cost centre', 'Q3 actual']], 'Sheet1')
      );
      await expect(page.locator('#irl-ext-error-body')).toHaveText(
        fill(ui['js.error.noRows.body'], { sheet: 'Sheet1' }),
        { timeout: 10000 }
      );
      await expect(page.locator('#irl-ext-status')).toHaveText(
        fill(ui['js.status.zero'], { sheet: 'Sheet1' })
      );
      await expect(page.locator('#diag-sections')).toHaveText(ui['js.diag.none']);
    });

    test('a file over the ceiling explains itself in the locale', async ({ page }) => {
      await gotoTool(page, url);
      await pickWorkbook(page, 'vdr-export.xlsx', Buffer.alloc(16 * 1024 * 1024));
      await expect(page.locator('#irl-ext-error-body')).toHaveText(
        fill(ui['js.error.tooLarge.body'], {
          file: 'vdr-export.xlsx',
          size: `16${decimal}0`,
          max: '15',
        }),
        { timeout: 10000 }
      );
      await expect(page.locator('#irl-ext-status')).toHaveText(ui['js.status.tooLarge']);
    });

    test('a file that is not a spreadsheet explains itself in the locale', async ({ page }) => {
      await gotoTool(page, url);
      // A truncated zip header: an .xlsx is a zip, and this cannot be opened as one.
      await pickWorkbook(page, 'broken.xlsx', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]));
      await expect(page.locator('#irl-ext-status')).toHaveText(ui['js.status.unreadable'], {
        timeout: 10000,
      });
      await expect(page.locator('#irl-ext-error-hint')).toHaveText(ui['js.error.unreadable.hint']);
    });

    test('copying confirms in the locale', async ({ page, context, browserName }) => {
      // clipboard-write is a Chromium permission; granted per test (TEST_BEST_PRACTICES).
      test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only');
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await gotoTool(page, url);
      await pickWorkbook(page, 'acme-irl.xlsx', buildWorkbook(FILLED_ROWS));
      await expect(page.locator('#irl-ext-copy')).toBeEnabled({ timeout: 10000 });
      await page.locator('#irl-ext-copy').click();
      await expect(page.locator('#irl-ext-copy')).toHaveText(ui['js.copied']);
    });

    test('the links stay in the locale, and the Tier C reference is marked English', async ({
      page,
    }) => {
      await gotoTool(page, url);
      await expect(
        page.locator('.irl-ext__intro a[href$="/hub/tools/information-request-list-generator/"]')
      ).toHaveAttribute('href', `${prefix}/hub/tools/information-request-list-generator/`);
      await expect(page.locator('.irl-ext__back')).toHaveAttribute('href', `${prefix}/hub/tools/`);
      for (const scope of ['.irl-ext__intro', '.irl-ext__card-list']) {
        await expect(
          page.locator(`${scope} a[href="/hub/mcp/docs/#cap-gst_irl_sweep"]`)
        ).toHaveAttribute('hreflang', 'en');
      }
    });

    // Catalog links come through set:html, which carries no Astro scope
    // attribute, so a plain scoped `a` selector silently misses them.
    test('catalog links keep the page styling', async ({ page }) => {
      await gotoTool(page, url);
      const primary = await resolved(page, 'color', '--color-primary');
      for (const scope of ['.irl-ext__intro', '.irl-ext__card-list']) {
        const link = await page
          .locator(`${scope} a`)
          .first()
          .evaluate((a) => {
            const style = getComputedStyle(a);
            return { color: style.color, border: style.borderBottomWidth };
          });
        expect(link.color, scope).toBe(primary);
        expect(link.border, scope).toBe('1px');
      }
    });

    test('at the cap tier an advisory moves nothing at all', async ({ page }) => {
      // The English contract lives in hub-tools-irl-extractor.test.ts. The cap
      // has 12.64px of headroom there, and a translated advisory one line
      // longer would use it up, so each locale is held to the same property.
      await page.setViewportSize({ width: 1920, height: 1200 });
      await gotoTool(page, url);
      const frame = () =>
        page.evaluate(() => {
          const box = (sel: string) => {
            const r = document.querySelector(sel)!.getBoundingClientRect();
            return { height: r.height, top: r.top + window.scrollY };
          };
          return {
            pick: box('.irl-ext__panel--pick'),
            out: box('.irl-ext__panel--out'),
            cards: box('.irl-ext__cards'),
          };
        });
      const before = await frame();
      await pickWorkbook(page, 'blank-template.xlsx', buildWorkbook(BLANK_ROWS));
      await expect(page.locator('#irl-ext-advisory')).toBeVisible({ timeout: 10000 });
      const after = await frame();
      expect(after.out.height).toBeCloseTo(before.out.height, 0);
      expect(after.pick.height).toBeCloseTo(before.pick.height, 0);
      expect(after.cards.top).toBeCloseTo(before.cards.top, 0);
    });

    test('the status line shows in full', async ({ page }) => {
      await gotoTool(page, url);
      await pickWorkbook(page, 'acme-irl.xlsx', buildWorkbook(FILLED_ROWS));
      await expect(page.locator('#irl-ext-md')).toBeVisible({ timeout: 10000 });
      const status = await page
        .locator('#irl-ext-status')
        .evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
      expect(status.scroll).toBeLessThanOrEqual(status.client);
    });
  });
}

for (const prefix of ['/es', '/pt']) {
  test(`${prefix}: the notes render tiny, not at body size`, async ({ page }) => {
    await gotoTool(page, `${prefix}${TOOL_PATH}`);
    const tiny = await resolved(page, 'fontSize', '--text-xs');
    await expect(page.locator('.irl-ext__intro .irl-ext__note')).toHaveCSS('font-size', tiny);
    await expect(page.locator('.irl-ext__card .irl-ext__note')).toHaveCSS('font-size', tiny);
  });

  test(`${prefix}/hub/tools/: the extractor card opens in the locale`, async ({ page }) => {
    await page.goto(`${prefix}/hub/tools/`, { waitUntil: 'load' });
    const card = page.locator(`a.brutal-gateway-card__cta[href$="${TOOL_PATH}"]`);
    await expect(card).toHaveAttribute('href', `${prefix}${TOOL_PATH}`);
    await expect(card).not.toHaveAttribute('hreflang', 'en');
  });

  test(`${prefix}/hub/tools/: the English-only line appears only with an English-only tool`, async ({
    page,
  }) => {
    await page.goto(`${prefix}/hub/tools/`, { waitUntil: 'load' });
    // Read from the page, so a future tool that launches in English shows the
    // line and passes here rather than failing on a pinned tool list.
    const englishOnly = await page.locator('a.brutal-gateway-card__cta[hreflang="en"]').count();
    await expect(page.locator('.tools-notice')).toHaveCount(englishOnly > 0 ? 1 : 0);
  });
}

test('/hub/tools/: the English page never carries the English-only line', async ({ page }) => {
  await page.goto('/hub/tools/', { waitUntil: 'load' });
  await expect(page.locator('.tools-notice')).toHaveCount(0);
});
