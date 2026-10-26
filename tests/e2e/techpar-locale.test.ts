/**
 * TechPar in every locale (BL-153 Tier B) — the rendered-page contract that
 * unit tests cannot reach: the page renders from the locale's catalog, numbers
 * follow the page language, the display currency defaults to USD everywhere and
 * survives a reload, and the URL-borne currency and labels cannot inject markup.
 *
 * Expected strings are read from the catalogs, not retyped, so a translation
 * edit never breaks this file; what is pinned is that the right catalog renders.
 * The English assertions for the tool itself live in techpar.test.ts.
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Read, not imported: Playwright's Node loader needs an import attribute for
// JSON (localization.test.ts reads catalogs the same way).
const catalog = (code: string): Record<string, string> =>
  JSON.parse(readFileSync(`src/i18n/${code}/techpar.json`, 'utf-8'));
const EN = catalog('en');
const ES = catalog('es');
const PT = catalog('pt-BR');

const LOCALES = [
  { prefix: '', lang: 'en', catalog: EN },
  { prefix: '/es', lang: 'es', catalog: ES },
  { prefix: '/pt', lang: 'pt-BR', catalog: PT },
] as const;

async function gotoTool(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector('[data-panel="profile"]')?.classList.contains('tp-panel--active'),
    { timeout: 10000 }
  );
}

async function fillInput(page: Page, attr: string, value: string): Promise<void> {
  const input = page.locator(`[data-input="${attr}"]`);
  await input.fill(value);
  await input.dispatchEvent('input');
}

async function clickTab(page: Page, tab: string): Promise<void> {
  await page.click(`.tool-tab[data-tab="${tab}"]`);
  await page.waitForFunction(
    (t) => document.querySelector(`[data-panel="${t}"]`)?.classList.contains('tp-panel--active'),
    tab
  );
}

for (const { prefix, lang, catalog } of LOCALES) {
  test.describe(`TechPar (${lang})`, () => {
    const url = `${prefix}/hub/tools/techpar/`;

    test('renders from its own catalog, with the page language set', async ({ page }) => {
      await gotoTool(page, url);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.locator('#tab-profile .tool-tab__label')).toHaveText(
        catalog['tabs.profile']
      );
      await expect(page.locator('#tab-costs .tool-tab__label')).toHaveText(catalog['tabs.costs']);
      // The client script paints from the island, so a script-rendered string
      // is in this locale too.
      await clickTab(page, 'analysis');
      await expect(page.locator('[data-analysis-empty-msg]')).toContainText(
        catalog['js.analysis.empty.noStage'].split('\n')[0]
      );
    });

    test('defaults to USD and keeps a chosen currency across a reload', async ({ page }) => {
      await gotoTool(page, url);
      await expect(page.locator('[data-currency="USD"]')).toHaveAttribute('aria-checked', 'true');
      await expect(
        page.locator('#tp-arr').locator('..').locator('.brutal-field__prefix')
      ).toHaveText('$');
      await page.click('[data-stage="series_bc"]');
      await page.click('[data-currency="BRL"]');
      await expect(page.locator('[data-arr-val="10000000"]')).toHaveText('R$10M');
      await page.reload({ waitUntil: 'load' });
      await expect(page.locator('[data-currency="BRL"]')).toHaveAttribute('aria-checked', 'true');
      expect(new URL(page.url()).searchParams.get('u')).toBe('BRL');
    });

    test('formats the analysis numbers in the page language', async ({ page }) => {
      await gotoTool(page, url);
      await page.click('[data-stage="series_bc"]');
      await fillInput(page, 'arr', '10000000');
      await clickTab(page, 'costs');
      await fillInput(page, 'infra', '50000');
      await clickTab(page, 'analysis');
      const decimal = await page.evaluate(
        (l) => new Intl.NumberFormat(l).formatToParts(1.5).find((p) => p.type === 'decimal')!.value,
        lang
      );
      // $600K infra on $10M ARR is 6.0% of revenue
      await expect(page.locator('[data-hero-num]')).toContainText(`6${decimal}0`);
    });
  });
}

test.describe('TechPar — URL-borne values are not markup', () => {
  test('a legacy ?u=€ link opens in EUR', async ({ page }) => {
    await gotoTool(page, '/pt/hub/tools/techpar/?s=series_bc&a=10000000&u=%E2%82%AC');
    await expect(page.locator('[data-currency="EUR"]')).toHaveAttribute('aria-checked', 'true');
  });

  test('an injected ?u= and an injected year label render as text', async ({ page }) => {
    const img = encodeURIComponent('<img src=x onerror="window.__pwned=1">');
    const attr = encodeURIComponent('"><img src=x onerror="window.__pwned=1">');
    await gotoTool(
      page,
      `/hub/tools/techpar/?s=series_bc&a=10000000&u=${img}&y1a=5000000&y1t=900000&y1l=${attr}`
    );
    await page.locator('[data-historical] summary').click();
    await expect(page.locator('[data-hist-label="0"]')).toHaveValue(
      '"><img src=x onerror="window.__pwned=1">'
    );
    await expect(page.locator('[data-currency="USD"]')).toHaveAttribute('aria-checked', 'true');
    expect(await page.locator('img[src="x"]').count()).toBe(0);
    expect(await page.evaluate(() => (window as { __pwned?: number }).__pwned)).toBeUndefined();
  });
});

test.describe('TechPar — English catalog is the English page', () => {
  test('the English page text matches the en catalog', async ({ page }) => {
    await gotoTool(page, '/hub/tools/techpar/');
    await expect(page.locator('.hub-header__subtitle')).toHaveText(EN['header.subtitle']);
  });
});
