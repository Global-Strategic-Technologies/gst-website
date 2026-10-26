/**
 * Infrastructure Cost Governance in every locale (BL-153 Tier B) — the
 * rendered-page contract unit tests cannot reach: the page renders from the
 * locale's catalog, the wizard and results are translated by id from the
 * island (the engine keeps the MCP server's English), counts take the
 * language's plural, and the pages that link here stay in the locale.
 *
 * Expected strings are read from the catalogs, not retyped. The English
 * assertions for the tool itself live in infrastructure-cost-governance.test.ts.
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Read, not imported: Playwright's Node loader needs an import attribute for JSON.
const catalog = (code: string): Record<string, string> =>
  JSON.parse(readFileSync(`src/i18n/${code}/infrastructure-cost-governance.json`, 'utf-8'));

const LOCALES = [
  { prefix: '', lang: 'en', catalog: catalog('en') },
  { prefix: '/es', lang: 'es', catalog: catalog('es') },
  { prefix: '/pt', lang: 'pt-BR', catalog: catalog('pt-BR') },
] as const;

const fill = (template: string, params: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));

async function gotoTool(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('[data-view="landing"]:not(.is-hidden)');
}

/**
 * Pick a stage, then answer every question "Not in place" (0) and advance
 * through all six domains. Clicks go through evaluate: each answer re-renders
 * the step, so a held locator would go stale.
 */
async function completeAllZero(page: Page): Promise<void> {
  await page.click('[data-stage="pe-backed"]');
  await page.click('[data-action="start"]');
  for (let step = 1; step <= 6; step++) {
    await page.waitForSelector('[data-answer]');
    await page.evaluate(() => {
      for (let i = 0; i < 20; i++) {
        const next = Array.from(document.querySelectorAll<HTMLElement>('[data-score="0"]')).find(
          (b) => !b.classList.contains('brutal-choice-btn--selected')
        );
        if (!next) break;
        next.click();
      }
      (document.querySelector('[data-action="next"]') as HTMLElement).click();
    });
  }
  await page.waitForSelector('[data-view="results"]:not(.is-hidden)');
}

for (const { prefix, lang, catalog } of LOCALES) {
  test.describe(`ICG (${lang})`, () => {
    const url = `${prefix}/hub/tools/infrastructure-cost-governance/`;

    test('the landing page and the wizard render from the catalog', async ({ page }) => {
      await gotoTool(page, url);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.locator('[data-action="start"]')).toHaveText(catalog['landing.begin']);
      await expect(page.locator('[data-stage="enterprise"]')).toHaveText(
        catalog['stage.enterprise']
      );
      await page.click('[data-action="start"]');
      await expect(page.locator('[data-domain-name]')).toHaveText(catalog['domain.d1.name']);
      await expect(page.locator('.icg-question-text').first()).toContainText(
        catalog['question.q1_1.text']
      );
      const answers = page.locator('[data-answer="q1_1"]');
      await expect(answers).toHaveText([
        catalog['answer.0'],
        catalog['answer.1'],
        catalog['answer.2'],
        catalog['answer.3'],
        catalog['answer.-1'],
      ]);
    });

    test('the results speak the locale, translated by id', async ({ page }) => {
      await gotoTool(page, url);
      await completeAllZero(page);
      await expect(page.locator('[data-score-level]')).toHaveText(catalog['maturity.Reactive']);
      await expect(page.locator('[data-stage-context]')).toHaveText(
        fill(catalog['context.below'], {
          score: 0,
          stage: catalog['stage.pe-backed'],
          low: 45,
          high: 70,
        })
      );
      await expect(page.locator('[data-foundational-warning-title]')).toHaveText(
        fill(catalog['js.foundational.two'], {
          first: catalog['domain.d1.name'],
          second: catalog['domain.d2.name'],
        })
      );
      // Visibility and Tagging triggers four recommendations at score 0.
      await expect(page.locator('.icg-domain-bar__rec-count').first()).toHaveText(
        fill(catalog['js.recCount.other'], { n: 4 })
      );
      await expect(page.locator('[data-rec-id="r01"] .brutal-rec-card__text')).toHaveText(
        catalog['rec.r01.title']
      );
      await expect(page.locator('[data-rec-id="r01"] .brutal-rec-card__badge--high')).toHaveText(
        catalog['impact.high']
      );
      await expect(page.locator('[data-radar-chart] text').first()).toHaveText(
        catalog['domain.d1.short']
      );
    });

    test('the MCP page links here in the same locale', async ({ page }) => {
      await page.goto(`${prefix}/hub/mcp/`, { waitUntil: 'load' });
      await expect(
        page.locator('a.mcp-catalog__try[href$="/hub/tools/infrastructure-cost-governance/"]')
      ).toHaveAttribute('href', url);
    });
  });
}
