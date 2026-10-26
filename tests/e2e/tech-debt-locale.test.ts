/**
 * The Tech Debt Calculator in every locale (BL-153 Tier B) — the rendered-page
 * contract unit tests cannot reach: the page renders from the locale's catalog,
 * the client script paints from the island, numbers follow the page language,
 * a typed decimal comma reads as a decimal on /es/ and /pt/, the display
 * currency defaults to USD, and the shared-link notice speaks the locale.
 *
 * Expected strings are read from the catalogs, not retyped, so a translation
 * edit never breaks this file; what is pinned is that the right catalog renders.
 * The English assertions for the tool itself live in tech-debt-calculator.test.ts.
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Read, not imported: Playwright's Node loader needs an import attribute for JSON.
const catalog = (code: string): Record<string, string> =>
  JSON.parse(readFileSync(`src/i18n/${code}/tech-debt-calculator.json`, 'utf-8'));

const LOCALES = [
  { prefix: '', lang: 'en', catalog: catalog('en'), dec: '.' },
  { prefix: '/es', lang: 'es', catalog: catalog('es'), dec: ',' },
  { prefix: '/pt', lang: 'pt-BR', catalog: catalog('pt-BR'), dec: ',' },
] as const;

// The page joins field names with `Intl.ListFormat` in its language (Spanish
// writes "y" as "e" before an i- sound); English keeps its comma list.
const listOf = (lang: string, items: string[]): string =>
  lang === 'en'
    ? items.join(', ')
    : new Intl.ListFormat(lang, { style: 'long', type: 'conjunction' }).format(items);

async function gotoCalc(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector('[data-metric="annual-cost"]')?.textContent?.trim() !== '—',
    { timeout: 10000 }
  );
}

async function openAdvanced(page: Page): Promise<void> {
  await page.locator('[data-advanced-toggle]').click();
  await expect(page.locator('[data-advanced-panel]')).not.toHaveClass(/is-hidden/);
}

async function typeDirect(page: Page, key: string, value: string): Promise<void> {
  const input = page.locator(`[data-direct="${key}"]`);
  await input.fill(value);
  await input.dispatchEvent('change');
}

for (const { prefix, lang, catalog, dec } of LOCALES) {
  test.describe(`Tech Debt Calculator (${lang})`, () => {
    const url = `${prefix}/hub/tools/tech-debt-calculator/`;

    test('renders from its own catalog, server and script alike', async ({ page }) => {
      await gotoCalc(page, url);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.locator('.section-label').first()).toHaveText(catalog['section.teamCost']);
      // Painted by the script from the island: the default 25% burden is a red flag.
      await expect(page.locator('#ctx-burden-label')).toHaveText(catalog['burden.red.label']);
      await openAdvanced(page);
      await expect(page.locator('[data-toggle-label]')).toHaveText(catalog['js.advanced.hide']);
      await expect(page.locator('[data-deploy-btn="3"]')).toHaveText(catalog['deploy.3']);
    });

    test('defaults to USD, in the page language’s decimal separator', async ({ page }) => {
      await gotoCalc(page, url);
      await expect(page.locator('#currency-select')).toHaveValue('USD');
      await openAdvanced(page);
      await expect(page.locator('[data-display="arr"]')).toHaveText(`$10${dec}0M`);
    });

    test('a ?cur= link labels amounts in that currency', async ({ page }) => {
      await gotoCalc(page, `${url}?cur=BRL`);
      await expect(page.locator('#currency-select')).toHaveValue('BRL');
      await expect(page.locator('[data-display="salary"]')).toHaveText('R$150K');
    });

    test('reads a typed amount in the page language', async ({ page }) => {
      await gotoCalc(page, url);
      await openAdvanced(page);
      await typeDirect(page, 'arr', `1${dec}5M`);
      await expect(page.locator('[data-display="arr"]')).toHaveText(`$1${dec}5M`);
      await expect(page.locator('[data-clamp-msg="arr"]')).toBeHidden();
    });

    test('the pages that link here open it in the same locale', async ({ page }) => {
      const href = `${prefix}/hub/tools/tech-debt-calculator/`;
      await page.goto(`${prefix}/hub/mcp/`, { waitUntil: 'load' });
      await expect(
        page.locator('a.mcp-catalog__try[href$="/hub/tools/tech-debt-calculator/"]')
      ).toHaveAttribute('href', href);
      // TechPar's cross-link reads its href from this attribute (chart.ts).
      await page.goto(`${prefix}/hub/tools/techpar/`, { waitUntil: 'load' });
      await expect(page.locator('[data-techpar]')).toHaveAttribute('data-tech-debt-href', href);
    });

    test('a shared link with out-of-range values explains itself in the locale', async ({
      page,
    }) => {
      const s = Buffer.from(JSON.stringify({ ts: 9999, ar: 5 })).toString('base64');
      await gotoCalc(page, `${url}?s=${encodeURIComponent(s)}`);
      const fields = listOf(lang, [catalog['field.ts'], catalog['field.ar']]);
      await expect(page.locator('[data-shared-notice]')).toHaveText(
        catalog['js.sharedNotice'].replace('{fields}', fields)
      );
    });
  });
}
