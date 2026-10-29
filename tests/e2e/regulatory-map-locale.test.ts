/**
 * The Regulatory Map in every locale (BL-153 Tier B) — the rendered-page
 * contract unit tests cannot reach: the chrome renders from the locale's
 * catalog, region names come from the island, the regulation texts arrive
 * from the locale's own /data/ endpoints (the source files stay English for
 * the MCP server), English acronyms still find a regulation, and the pages
 * that link here stay in the locale.
 *
 * Expected strings are read from the catalogs, not retyped. The English
 * assertions for the tool itself live in regulatory-map*.test.ts.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { clickSvgPath, waitForMapReady } from './helpers/regulatory-map';

// Read, not imported: Playwright's Node loader needs an import attribute for JSON.
const read = (code: string, ns: string): Record<string, string> =>
  JSON.parse(readFileSync(`src/i18n/${code}/${ns}.json`, 'utf-8'));

const LOCALES = [
  { prefix: '', lang: 'en' },
  { prefix: '/es', lang: 'es' },
  { prefix: '/pt', lang: 'pt-BR' },
].map((l) => ({
  ...l,
  ui: read(l.lang, 'regulatory-map'),
  geo: read(l.lang, 'regulatory-map-geo'),
  data: read(l.lang, 'regulatory-map-data'),
}));

for (const { prefix, lang, ui, geo, data } of LOCALES) {
  test.describe(`Regulatory Map (${lang})`, () => {
    const url = `${prefix}/hub/tools/regulatory-map/`;

    test.beforeEach(async ({ page }) => {
      await page.goto(url, { waitUntil: 'load' });
      await waitForMapReady(page);
    });

    test('the chrome renders from the catalog', async ({ page }) => {
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.locator('.brutal-legend__label').first()).toHaveText(ui['legend.coverage']);
      await expect(page.locator('[data-category="ai-governance"]')).toHaveText(
        ui['category.ai-governance']
      );
      await expect(page.locator('.brutal-timeline-today__label')).toHaveText(ui['js.today']);
    });

    test('a region opens in the locale, with its regulations', async ({ page }) => {
      await clickSvgPath(page, '[data-alpha3="BRA"].country-path--active');
      await expect(page.locator('#panelCountryName')).toHaveText(geo['region.BRA']);
      const lgpd = page.locator('.brutal-reg-card').filter({ hasText: data['reg.br-lgpd.name'] });
      await expect(lgpd.locator('.brutal-reg-card__summary')).toHaveText(
        data['reg.br-lgpd.summary']
      );
    });

    test('an English acronym finds a regulation, shown in the locale', async ({ page }) => {
      await page.locator('#regulationSearchInput').fill('GDPR');
      const result = page.locator('.brutal-search__result[data-reg-id="eu-gdpr"]');
      await expect(result.locator('.brutal-search__result-name')).toHaveText(
        data['reg.eu-gdpr.name']
      );
      await result.click();
      await expect(page.locator('.brutal-reg-card__name')).toHaveText(data['reg.eu-gdpr.name']);
      await expect(page.locator('.brutal-reg-card__penalties')).toContainText(
        data['reg.eu-gdpr.penalties']
      );
    });

    test('the MCP page links to the same-locale map', async ({ page }) => {
      await page.goto(`${prefix}/hub/mcp/`, { waitUntil: 'load' });
      await expect(
        page.locator('a.mcp-catalog__try[href$="/hub/tools/regulatory-map/"]')
      ).toHaveAttribute('href', url);
    });
  });
}
