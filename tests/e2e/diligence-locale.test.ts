/**
 * The Diligence Machine in every locale (BL-153 Tier B) — the rendered-page
 * contract unit tests cannot reach: the wizard renders from the locale's
 * catalog, the agenda is translated by id from the island (the engine keeps
 * the MCP server's English), a "Not sure" answer reads as the button does,
 * the clipboard speaks the locale, and the pages that link here stay in it.
 *
 * The agenda is opened through a complete deeplink, the same URL the MCP
 * tool returns. Expected strings are read from the catalogs, not retyped. The
 * English assertions for the tool itself live in diligence-machine.test.ts.
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Read, not imported: Playwright's Node loader needs an import attribute for JSON.
const read = (code: string, ns: string): Record<string, string> =>
  JSON.parse(readFileSync(`src/i18n/${code}/${ns}.json`, 'utf-8'));

const LOCALES = [
  { prefix: '', lang: 'en' },
  { prefix: '/es', lang: 'es' },
  { prefix: '/pt', lang: 'pt-BR' },
].map((l) => ({
  ...l,
  ui: read(l.lang, 'diligence-machine'),
  data: read(l.lang, 'diligence-machine-data'),
}));

const fill = (template: string, params: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));

// A complete profile with one "Not sure" answer (company age) and two regions.
const DEEPLINK =
  '?tt=carve-out&pt=b2b-saas&ta=hybrid-legacy&hc=51-200&rr=25-100m&gs=mature&ca=unknown' +
  '&ge=us%2Ceu&bm=services-led&si=high&ts=mid-migration&ds=high&om=hybrid';

/** A complete deeplink restores the wizard on its last step, answered; generate from there. */
async function openAgenda(page: Page, url: string): Promise<void> {
  await page.goto(`${url}${DEEPLINK}`, { waitUntil: 'load' });
  await expect(
    page.locator('[data-testid="wizard-container"][data-restored="true"]')
  ).toBeVisible();
  await expect(page.locator('[data-testid="btn-generate"]')).toBeEnabled();
  await page.locator('[data-testid="btn-generate"]').click();
  await expect(page.locator('[data-testid="output-container"]')).toBeVisible();
}

for (const { prefix, lang, ui, data } of LOCALES) {
  test.describe(`Diligence Machine (${lang})`, () => {
    const url = `${prefix}/hub/tools/diligence-machine/`;

    test('the wizard renders from the catalog', async ({ page }) => {
      await page.goto(url, { waitUntil: 'load' });
      await expect(
        page.locator('[data-testid="wizard-container"][data-restored="true"]')
      ).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      const step1 = page.locator('[data-testid="wizard-step-1"]');
      await expect(step1.locator('.step-title')).toHaveText(ui['step.transaction-type.title']);
      await expect(
        page.locator('[data-testid="option-transaction-type-carve-out"] .brutal-option-card__label')
      ).toHaveText(ui['option.transaction-type.carve-out.label']);
      await expect(
        page.locator('[data-testid="option-transaction-type-unknown"] .brutal-option-card__label')
      ).toHaveText(ui['option.unknown']);
      await expect(page.locator('[data-testid="btn-next"]')).toHaveText(ui['nav.next']);
      // The cross-tool note on the tech-stack step links to TechPar in this locale.
      await expect(page.locator('[data-step-id="tech-archetype"] .step-note a')).toHaveAttribute(
        'href',
        `${prefix}/hub/tools/techpar/`
      );
    });

    test('the agenda is translated by id', async ({ page }) => {
      await openAgenda(page, url);
      await expect(page.locator('.doc-title')).toHaveText(ui['doc.title']);

      // "Not sure" reads as the button does, under the locale's label.
      const ageCard = page.locator('.doc-meta-card', {
        has: page.locator('.doc-meta-label', { hasText: ui['js.meta.companyAge'] }),
      });
      await expect(ageCard.locator('.doc-meta-value')).toHaveText(ui['option.unknown']);
      await expect(
        page.locator('.doc-meta-card').filter({ hasText: ui['js.meta.headcount'] })
      ).toContainText(
        fill(ui['js.meta.headcountValue'], { range: ui['option.headcount.51-200.label'] })
      );

      // Topic, question, priority badge and trigger tag, all looked up by id.
      await expect(page.locator('.doc-topic-title').first()).toHaveText(
        data['topic.architecture.label']
      );
      const question = page.locator('.doc-question').first();
      const qid = await question.getAttribute('data-question-id');
      await expect(question.locator('.doc-q-text')).toHaveText(data[`question.${qid}.text`]);
      const priority = (await question.getAttribute('class'))!.match(/priority-(\w+)/)![1];
      await expect(question.locator('.doc-q-priority')).toHaveText(data[`priority.${priority}`]);
      const metaLabels = Object.entries(ui)
        .filter(([k]) => k.startsWith('js.meta.') && !k.includes('Value') && !k.includes('Cta'))
        .map(([, v]) => v);
      for (const tag of await page.locator('.doc-q-trigger-tag').allTextContents()) {
        expect(metaLabels).toContain(tag);
      }

      // Two regions add multi-region, which brings its attention areas.
      const area = page.locator('[data-attention-id="attention-multi-data-transfer"]');
      await expect(area.locator('.doc-attention-title')).toHaveText(
        data['area.attention-multi-data-transfer.title']
      );
    });

    test('the clipboard speaks the locale', async ({ page, context, browserName }) => {
      test.skip(browserName !== 'chromium', 'clipboard read needs Chromium');
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await openAgenda(page, url);
      await page.locator('[data-testid="btn-copy"]').click();
      await expect(page.locator('#btnCopyLabel')).toHaveText(ui['js.copied']);
      const text = await page.evaluate(() => navigator.clipboard.readText());
      expect(text).toContain(ui['js.clip.title'].toLocaleUpperCase(lang));
      expect(text).toContain(`${ui['js.meta.companyAge']}:`);
      expect(text).toContain(data['topic.architecture.label'].toLocaleUpperCase(lang));
      expect(text).not.toContain('unknown');
    });

    test('the MCP page links here in the same locale', async ({ page }) => {
      await page.goto(`${prefix}/hub/mcp/`, { waitUntil: 'load' });
      await expect(
        page.locator('a.mcp-catalog__try[href$="/hub/tools/diligence-machine/"]')
      ).toHaveAttribute('href', url);
    });
  });
}
