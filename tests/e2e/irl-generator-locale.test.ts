/**
 * The IRL Generator in every locale (BL-153 Tier B) — the rendered-page
 * contract unit tests cannot reach: the page renders its sections and requests
 * from the locale's catalogs (the shared source stays English for the MCP
 * server), the auto-skip tag reads the context's label, the downloaded
 * workbook carries the translated requests while every machine-read token
 * stays English, and the MCP page links to the same-locale tool.
 *
 * Expected strings are read from the catalogs, not retyped. The English
 * assertions for the tool itself live in hub-tools-irl-generator.test.ts.
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
// xlsx-js-style is CJS; normalize the interop shape as hub-tools-irl-generator does.
import * as XLSXImport from 'xlsx-js-style';
const XLSX = (XLSXImport as unknown as { default?: typeof XLSXImport }).default ?? XLSXImport;

// Read, not imported: Playwright's Node loader needs an import attribute for JSON.
const read = (code: string, ns: string): Record<string, string> =>
  JSON.parse(readFileSync(`src/i18n/${code}/${ns}.json`, 'utf-8'));

const LOCALES = [
  { prefix: '', lang: 'en' },
  { prefix: '/es', lang: 'es' },
  { prefix: '/pt', lang: 'pt-BR' },
].map((l) => ({
  ...l,
  ui: read(l.lang, 'information-request-list-generator'),
  data: read(l.lang, 'information-request-list-generator-data'),
}));

/** Wait until the client script has wired the page (see hub-tools-irl-generator). */
async function gotoTool(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.irl-gen__q[data-skip-context] .irl-gen__q-toggle[aria-disabled]', {
    state: 'attached',
    timeout: 10000,
  });
}

for (const { prefix, lang, ui, data } of LOCALES) {
  test.describe(`IRL Generator (${lang})`, () => {
    const url = `${prefix}/hub/tools/information-request-list-generator/`;

    test('sections and requests render from the catalog', async ({ page }) => {
      await gotoTool(page, url);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(
        page.locator('.irl-gen__section[data-section="02"] .irl-gen__section-name')
      ).toContainText(data['section.02.title']);
      await expect(page.locator('.irl-gen__q[data-question="00-01"] .irl-gen__q-text')).toHaveText(
        data['req.00-01']
      );
      await expect(page.locator('button.irl-gen__cta')).toHaveText(ui['form.download']);
    });

    test('the auto-skip tag reads the context label', async ({ page }) => {
      await gotoTool(page, url);
      await page.locator('input[name="transactionContext"][value="sell-side"]').check();
      await expect(
        page.locator('.irl-gen__q[data-question="00-02"] .irl-gen__q-auto-label')
      ).toHaveText(ui['js.autoSkipped'].replace('{context}', ui['context.sell-side']));
    });

    test('the workbook carries the locale text and English machine tokens', async ({ page }) => {
      await gotoTool(page, url);
      await page.locator('input#targetName').fill('Acme');
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
      await page.locator('button.irl-gen__cta').click();
      const path = await (await downloadPromise).path();
      expect(path).toBeTruthy();
      const wb = XLSX.read(readFileSync(path!), { type: 'buffer' });
      expect(wb.SheetNames).toEqual([
        'Information Request List',
        data['xlsx.instructionsSheetName'],
      ]);
      const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Information Request List'], {
        header: 1,
        defval: '',
      });
      expect(rows.find((r) => r[0] === 'Target')?.[1]).toBe('Acme');
      const first = rows.find((r) => r[0] === '0-01');
      expect(first?.[1]).toBe(data['req.00-01']);
      expect(first?.[2]).toBe('OPEN');
      await expect(page.locator('#irl-gen-status')).toContainText('GST-IRL-Acme-');
    });

    test('the MCP page links to the same-locale generator', async ({ page }) => {
      await page.goto(`${prefix}/hub/mcp/`, { waitUntil: 'load' });
      await expect(
        page.locator('a.mcp-catalog__try[href$="/hub/tools/information-request-list-generator/"]')
      ).toHaveAttribute('href', url);
    });
  });
}
