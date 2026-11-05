/**
 * The portfolio and the library index in every locale (BL-153 Tier B): what unit
 * tests cannot reach. Entries stay English while their fixed labels translate,
 * filters still work on English values behind translated chips, and registering
 * these routes changed the /hub/ cards that link to them.
 *
 * Expected strings are read from the catalogs, not retyped.
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { gotoPortfolio, openFilterDrawer } from './helpers/portfolio';

// Read, not imported: Playwright's Node loader needs an import attribute for JSON.
const read = (code: string, ns: string): Record<string, string> =>
  JSON.parse(readFileSync(`src/i18n/${code}/${ns}.json`, 'utf-8'));

const LOCALES = [
  { prefix: '', lang: 'en' },
  { prefix: '/es', lang: 'es' },
  { prefix: '/pt', lang: 'pt-BR' },
].map((l) => ({
  ...l,
  isEnglish: l.lang === 'en',
  ma: read(l.lang, 'ma-portfolio'),
  lib: read(l.lang, 'hub-library'),
  common: read(l.lang, 'common'),
}));

const ES = LOCALES[1];

type Project = {
  id: string;
  codeName: string;
  theme: string;
  growthStage: string;
  engagementCategory: string;
  engagementType: string;
  summary: string;
};
const raw = JSON.parse(readFileSync('src/data/ma-portfolio/projects.json', 'utf-8'));
const PROJECTS: Project[] = Array.isArray(raw) ? raw : raw.projects;
const FIRST = PROJECTS[0];

/** A label's catalog value, found the way the page finds it: by its English value. */
function labelOf(ma: Record<string, string>, kind: string, value: string): string {
  const en = LOCALES[0].ma;
  const key = Object.keys(en).find((k) => k.startsWith(`${kind}.`) && en[k] === value);
  if (!key) throw new Error(`no ${kind} label for ${value}`);
  return ma[key];
}

async function openFirstProject(page: Page): Promise<void> {
  await page.locator(`[data-project-id="${FIRST.id}"]`).click();
  await expect(page.getByTestId('project-modal')).toBeVisible();
}

for (const { prefix, lang, isEnglish, ma, lib } of LOCALES) {
  test.describe(`M&A portfolio (${lang})`, () => {
    const url = `${prefix}/ma-portfolio/`;

    test('chrome comes from the catalog, with the hreflang cluster', async ({ page }) => {
      await gotoPortfolio(page, prefix);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.locator('h1.portfolio-title')).toHaveText(ma['header.title']);
      await expect(page.getByTestId('portfolio-search-input')).toHaveAttribute(
        'placeholder',
        ma['search.placeholder']
      );
      await expect(page.locator('.portfolio-summary h2')).toHaveText(ma['summary.heading']);
      await expect(page.locator('.stat-label').first()).toHaveText(ma['stats.combinedArr']);
      await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(4);
    });

    test('a card translates its fixed labels and keeps its entry text in English', async ({
      page,
    }) => {
      await gotoPortfolio(page, prefix);
      const card = page.locator(`[data-project-id="${FIRST.id}"]`);
      await expect(card.locator('.metric-value').last()).toHaveText(
        labelOf(ma, 'stage', FIRST.growthStage)
      );
      await expect(card.locator('.tag.theme')).toHaveText(labelOf(ma, 'theme', FIRST.theme));
      await expect(card.locator('.tag.engagement')).toHaveText(
        labelOf(ma, 'category', FIRST.engagementCategory)
      );
      await expect(card.locator('.summary')).toHaveText(FIRST.summary);
      if (isEnglish) {
        await expect(card.locator('.summary')).not.toHaveAttribute('lang', /.*/);
      } else {
        await expect(card.locator('.summary')).toHaveAttribute('lang', 'en');
      }
    });

    test('the modal translates its labels and keeps its entry text in English', async ({
      page,
    }) => {
      await gotoPortfolio(page, prefix);
      await openFirstProject(page);
      await expect(page.getByTestId('project-modal-title')).toHaveText(FIRST.codeName);
      await expect(page.getByTestId('project-modal-stage')).toHaveText(
        labelOf(ma, 'stage', FIRST.growthStage)
      );
      await expect(page.getByTestId('project-modal-theme')).toHaveText(
        labelOf(ma, 'theme', FIRST.theme)
      );
      await expect(page.getByTestId('project-modal-engagement')).toHaveText(
        `${labelOf(ma, 'category', FIRST.engagementCategory)} · ${labelOf(
          ma,
          'type',
          FIRST.engagementType
        )}`
      );
      await expect(page.getByTestId('project-modal-summary')).toHaveText(FIRST.summary);
      for (const id of ['project-modal-title', 'project-modal-summary']) {
        if (isEnglish) await expect(page.getByTestId(id)).not.toHaveAttribute('lang', /.*/);
        else await expect(page.getByTestId(id)).toHaveAttribute('lang', 'en');
      }
      await expect(page.locator('#portfolio-labels')).toHaveCount(isEnglish ? 0 : 1);
    });

    test('a translated chip filters on the English value and writes it to the URL', async ({
      page,
    }) => {
      await gotoPortfolio(page, prefix);
      await openFilterDrawer(page);
      const chip = page.getByTestId('filter-chip-theme-healthcare');
      await expect(chip).toHaveText(labelOf(ma, 'theme', 'Healthcare'));
      await chip.click();

      await expect(page).toHaveURL(/[?&]theme=Healthcare/);
      const expected = PROJECTS.filter((p) => p.theme === 'Healthcare').length;
      await expect(page.locator('[data-testid="project-card"]:visible')).toHaveCount(expected);
    });

    test('an empty result shows the translated message', async ({ page }) => {
      await gotoPortfolio(page, prefix);
      await page.getByTestId('portfolio-search-input').fill('zzzz-no-such-project');
      await expect(page.locator('#portfolio-no-results')).toHaveText(ma['noResults']);
    });

    test('the English-content notice shows only on a translated page', async ({ page }) => {
      await gotoPortfolio(page, prefix);
      const note = page.locator('.portfolio-summary__note');
      if (isEnglish) {
        await expect(note).toHaveCount(0);
        return;
      }
      await expect(note).toHaveText(ma['notice.entriesEnglish']);
      // Its own size, not the larger size of the summary paragraph beside it.
      const sizes = await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.fontSize = 'var(--text-sm)';
        document.body.append(probe);
        const expected = getComputedStyle(probe).fontSize;
        probe.remove();
        const el = document.querySelector('.portfolio-summary__note')!;
        return { expected, actual: getComputedStyle(el).fontSize };
      });
      expect(sizes.actual).toBe(sizes.expected);
    });

    test('the page title stays inside its box beside the controls', async ({ page }) => {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => document.fonts.ready);
      for (const width of [1440, 1100, 1025, 768, 480, 360]) {
        await page.setViewportSize({ width, height: 800 });
        await page.waitForFunction((w) => document.documentElement.clientWidth <= w, width);
        const fit = await page.evaluate(() => {
          const title = document.querySelector<HTMLElement>('.portfolio-title')!;
          const range = document.createRange();
          range.selectNodeContents(title);
          const ink = range.getBoundingClientRect();
          const controls = document
            .querySelector('.portfolio-header .portfolio-controls-fixed')!
            .getBoundingClientRect();
          const sameRow = controls.top < ink.bottom && ink.top < controls.bottom;
          return {
            right: ink.right,
            viewport: document.documentElement.clientWidth,
            overlap: sameRow ? ink.right - controls.left : -1,
          };
        });
        expect(fit.right, `title within the viewport at ${width}px`).toBeLessThanOrEqual(
          fit.viewport
        );
        expect(fit.overlap, `title clear of the controls at ${width}px`).toBeLessThanOrEqual(0);
      }
    });
  });

  test.describe(`Library index (${lang})`, () => {
    const url = `${prefix}/hub/library/`;

    test('bullets and CTAs translate while titles and article links stay English', async ({
      page,
    }) => {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.locator('h1')).toHaveText(lib['header.title']);

      const cards = page.locator('.brutal-gateway-card');
      const title = cards.first().locator('h2');
      await expect(title).toHaveText('Business & Technology Architectures');
      if (isEnglish) await expect(title).not.toHaveAttribute('lang', /.*/);
      else await expect(title).toHaveAttribute('lang', 'en');
      await expect(cards.first().locator('li').first()).toHaveText(lib['architectures.feature1']);

      const cta = cards.first().locator('.brutal-gateway-card__cta');
      await expect(cta).toHaveText(lib['architectures.cta']);
      await expect(cta).toHaveAttribute('href', '/hub/library/business-architectures/');
      // Analytics payloads stay English in every locale.
      await expect(cta).toHaveAttribute('onclick', "trackCTA('resource-article', 'library')");
      if (isEnglish) {
        await expect(cta).not.toHaveAttribute('hreflang', /.*/);
      } else {
        await expect(cta).toHaveAttribute('hreflang', 'en');
      }

      await expect(page.locator('.library-notice')).toHaveCount(isEnglish ? 0 : 1);
      const back = page.locator('.library-section > .container > a.cta-button');
      await expect(back).toHaveAttribute('href', `${prefix}/hub/`);
      await expect(back).toHaveAttribute('onclick', "trackNavigation('/hub', 'Return to Hub')");
    });
  });
}

test('English chips keep their order, and Spanish chips sort by their translated text', async ({
  page,
}) => {
  const values = [...new Set(PROJECTS.map((p) => p.theme))];
  const chipTexts = async () =>
    (await page.locator('#theme-chips .filter-chip:not([data-value="all"])').allTextContents()).map(
      (s) => s.trim()
    );

  await gotoPortfolio(page);
  expect(await chipTexts()).toEqual([...values].sort());

  await gotoPortfolio(page, '/es');
  const collator = new Intl.Collator('es-CO');
  expect(await chipTexts()).toEqual(
    values.map((v) => labelOf(ES.ma, 'theme', v)).sort((a, b) => collator.compare(a, b))
  );
});

test('a shared English filter link works on the Spanish page', async ({ page }) => {
  await page.goto('/es/ma-portfolio/?theme=Healthcare', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => (window as { __portfolioInitialized?: boolean }).__portfolioInitialized === true
  );
  const expected = PROJECTS.filter((p) => p.theme === 'Healthcare').length;
  await expect(page.locator('[data-testid="project-card"]:visible')).toHaveCount(expected);
});

test('the open modal passes axe on the Spanish page', async ({ page }) => {
  await gotoPortfolio(page, '/es');
  await openFirstProject(page);
  const { violations } = await new AxeBuilder({ page })
    .include('[data-testid="project-modal"]')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
});

test('registering the library takes its English-only line off the /es/hub/ card only', async ({
  page,
}) => {
  await page.goto('/es/hub/', { waitUntil: 'domcontentloaded' });
  const library = page.locator('a.hub-card[href="/es/hub/library/"]');
  await expect(library).toBeVisible();
  await expect(library).not.toHaveAttribute('hreflang', /.*/);
  await expect(library.locator('.hub-card-notice')).toHaveCount(0);

  const radar = page.locator('a.hub-card[href="/hub/radar/"]');
  await expect(radar).toHaveAttribute('hreflang', 'en');
  await expect(radar.locator('.hub-card-notice')).toHaveText(ES.common['notice.contentInEnglish']);
});

test('the MCP page links to the same-locale portfolio', async ({ page }) => {
  await page.goto('/es/hub/mcp/', { waitUntil: 'domcontentloaded' });
  const link = page.locator('a.mcp-catalog__try[href="/es/ma-portfolio/"]');
  await expect(link).toHaveCount(1);
  await expect(link).not.toHaveAttribute('hreflang', /.*/);
});
