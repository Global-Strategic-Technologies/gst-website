/**
 * /hub/mcp/docs/ — the two-lens capability reference.
 *
 * The registry's own correctness (identifiers, counts, orchestration lists,
 * copy rules) is asserted statically in
 * `tests/integration/mcp-docs-parity.test.ts`. This suite covers what only a
 * browser can: the lens swap, `:target`-driven contract selection, the search
 * combobox, and the no-JS reading of the same document.
 *
 * Visibility is asserted as COMPUTED CSS rather than by class name
 * (TEST_BEST_PRACTICES anti-pattern 4): the whole mechanism here is a cascade,
 * so a class assertion would pass against a broken one. The JS-gated search
 * field is asserted the same way rather than through a bare `toBeHidden()`
 * (anti-pattern 8). Copy is asserted as the label swap, never clipboard
 * contents (anti-patterns 11 & 24).
 */
import { test, expect, type Page } from '@playwright/test';

const ROUTE = '/hub/mcp/docs/';

/** Which lens is actually rendered, read from the cascade. */
async function visibleLenses(page: Page): Promise<string[]> {
  return page
    .locator('.mdoc-lens')
    .evaluateAll((els) =>
      els.filter((el) => getComputedStyle(el).display !== 'none').map((el) => el.id)
    );
}

/** Which contract panes are actually rendered. */
async function visiblePaneIds(page: Page): Promise<string[]> {
  return page
    .locator('[data-pane]')
    .evaluateAll((els) =>
      els.filter((el) => getComputedStyle(el).display !== 'none').map((el) => el.id)
    );
}

test.describe('MCP documentation — page shape', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE);
    await page.waitForSelector('h1');
  });

  test('renders the page title and breadcrumb', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('MCP Documentation');
    const crumb = page.locator('nav[aria-label="Breadcrumb"]');
    await expect(crumb).toContainText('Documentation');
    // One breadcrumb landmark: the prototype's per-contract crumb is not ported
    // precisely because a second one is a duplicate landmark.
    await expect(crumb).toHaveCount(1);
  });

  test('opens on Workflows with all four cards', async ({ page }) => {
    await expect.poll(() => visibleLenses(page)).toEqual(['workflows']);
    await expect(page.locator('.mdoc-flow')).toHaveCount(4);
    // Three steps each, every one an anchor into a contract.
    await expect(page.locator('.mdoc-step')).toHaveCount(12);
  });

  test('derives the counts row from the registry', async ({ page }) => {
    const counts = page.locator('.mdoc-counts__link');
    await expect(counts).toHaveCount(3);
    await expect(counts.nth(0)).toHaveText('16 tools');
    await expect(counts.nth(1)).toHaveText('133 resources');
    await expect(counts.nth(2)).toHaveText('12 prompts');
  });

  test('lists every capability in the sidebar', async ({ page }) => {
    // 16 tools + 12 prompts + 3 resource families + 3 operations topics.
    await expect(page.locator('[data-cap-link]')).toHaveCount(34);
  });
});

test.describe('MCP documentation — lens and contract selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE);
    await page.waitForSelector('h1');
  });

  test('the lens switch swaps which lens renders', async ({ page }) => {
    await page.locator('[data-lens-link="reference"]').click();
    await expect.poll(() => visibleLenses(page)).toEqual(['reference']);
    await page.locator('[data-lens-link="workflows"]').click();
    await expect.poll(() => visibleLenses(page)).toEqual(['workflows']);
  });

  test('Reference opens on the default contract, one pane at a time', async ({ page }) => {
    await page.locator('[data-lens-link="reference"]').click();
    await expect.poll(() => visiblePaneIds(page)).toEqual(['cap-search_regulations']);
  });

  test('a sidebar item swaps the rendered contract', async ({ page }) => {
    await page.locator('[data-lens-link="reference"]').click();
    await page.locator('[data-cap-link][data-cap-id="compute_techpar"]').click();
    await expect.poll(() => visiblePaneIds(page)).toEqual(['cap-compute_techpar']);
    await expect(page.locator('#cap-compute_techpar h2').first()).toHaveText('compute_techpar');
  });

  test('a workflow step opens that capability in Reference', async ({ page }) => {
    await page.locator('.mdoc-step').first().click();
    await expect.poll(() => visibleLenses(page)).toEqual(['reference']);
    await expect.poll(() => visiblePaneIds(page)).toEqual(['cap-gst_target_quick_look']);
  });

  test('a deep link lands on Reference and that contract directly', async ({ page }) => {
    // State assertion, not a paint-timing one: `domcontentloaded` is as early as
    // the state is meaningful, and asserting "no flash" would be flaky by shape.
    await page.goto(`${ROUTE}#cap-compute_techpar`, { waitUntil: 'domcontentloaded' });
    await expect.poll(() => visibleLenses(page)).toEqual(['reference']);
    await expect.poll(() => visiblePaneIds(page)).toEqual(['cap-compute_techpar']);
    await expect(page.locator('[data-cap-link][data-cap-id="compute_techpar"]')).toHaveAttribute(
      'aria-current',
      'true'
    );
  });

  test('a stale deep link falls back to the default contract', async ({ page }) => {
    // Reference must never render empty. The inline bootstrap cannot check
    // whether a pane exists (it runs before they parse), so the module does.
    await page.goto(`${ROUTE}#cap-no_such_capability`, { waitUntil: 'domcontentloaded' });
    await expect.poll(() => visibleLenses(page)).toEqual(['reference']);
    await expect.poll(() => visiblePaneIds(page)).toEqual(['cap-search_regulations']);
  });

  test('a related chip navigates to the capability it names', async ({ page }) => {
    await page.goto(`${ROUTE}#cap-compute_techpar`);
    await page.locator('#cap-compute_techpar a.brutal-filter-chip').first().click();
    await expect.poll(() => visiblePaneIds(page)).toEqual(['cap-gst_target_quick_look']);
  });

  test('the counts row opens Reference scrolled to that group', async ({ page }) => {
    await page.locator('[data-group-jump="Prompts"]').click();
    await expect.poll(() => visibleLenses(page)).toEqual(['reference']);
    // The nav container scrolls, not the page: the sidebar is a side column and
    // scrollIntoView would drag the whole document.
    await expect
      .poll(() => page.locator('[data-cap-nav]').evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
  });

  test('a copy button flips to Copied and restores its label', async ({ page }) => {
    await page.goto(`${ROUTE}#cap-compute_techpar`);
    const btn = page.locator('#cap-compute_techpar [data-copy]');
    const original = (await btn.textContent())?.trim();
    await btn.click();
    await expect(btn).toHaveText('Copied');
    await expect(btn).toHaveText(original ?? 'Copy', { timeout: 5000 });
  });
});

test.describe('MCP documentation — capability search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE);
    await page.waitForSelector('h1');
  });

  test('the field appears only once its script has run', async ({ page }) => {
    // Rendered `hidden` so a reader without JS never meets a dead input; the
    // module unhides it. Computed style, not the attribute alone.
    await expect
      .poll(() => page.locator('[data-cap-search]').evaluate((el) => getComputedStyle(el).display))
      .not.toBe('none');
  });

  test('matches on identifier and on description', async ({ page }) => {
    const input = page.locator('[data-cap-search-input]');
    await input.fill('techpar');
    await expect(page.locator('[data-cap-search-results] [role="option"]')).toHaveCount(1);

    await input.fill('carrying cost');
    const byGloss = page.locator('[data-cap-search-results] [role="option"]');
    await expect(byGloss.first()).toContainText('estimate_tech_debt_cost');
  });

  test('reports an empty result rather than an empty box', async ({ page }) => {
    await page.locator('[data-cap-search-input]').fill('zzzznotacapability');
    await expect(page.locator('.brutal-search__no-results')).toContainText('No capability matches');
  });

  test('keyboard selection opens the contract', async ({ page }) => {
    const input = page.locator('[data-cap-search-input]');
    await input.fill('techpar');
    await input.press('ArrowDown');
    await expect(input).toHaveAttribute('aria-activedescendant', 'mdoc-search-option-0');
    await input.press('Enter');
    await expect.poll(() => visiblePaneIds(page)).toEqual(['cap-compute_techpar']);
    await expect(input).toHaveValue('');
  });

  test('Escape closes the dropdown', async ({ page }) => {
    const input = page.locator('[data-cap-search-input]');
    await input.fill('techpar');
    await expect(page.locator('[data-cap-search-results]')).toBeVisible();
    await input.press('Escape');
    await expect(page.locator('[data-cap-search-results]')).toBeHidden();
  });
});

test.describe('MCP documentation — without JavaScript', () => {
  test('renders every contract as one linear document', async ({ browser }) => {
    // This is where "the page publishes every capability" is enforced: the
    // parity suite imports the registry, and this proves the page renders it.
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(ROUTE);

    await expect(page.locator('[data-pane]')).toHaveCount(34);
    expect(await visiblePaneIds(page)).toHaveLength(34);
    // Both lenses read too: with no script there is nothing to switch with.
    await expect.poll(() => visibleLenses(page)).toEqual(['workflows', 'reference']);
    // And the dead search field is not offered.
    await expect(page.locator('[data-cap-search]')).toBeHidden();

    await context.close();
  });
});

test.describe('MCP documentation — themes and viewports', () => {
  test('renders in dark theme', async ({ page }) => {
    await page.goto(ROUTE);
    await page.evaluate(() => document.documentElement.classList.add('dark-theme'));
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('.mdoc-flow').first()).toBeVisible();
  });

  for (const width of [1440, 1280, 1024, 900, 768, 480]) {
    test(`no capability identifier wraps at ${width}px`, async ({ page }) => {
      // A wrapped wire identifier reads as two entries: two sidebar rows, or two
      // workflow steps. The sidebar column is `max-content` sized and the step
      // grid drops columns rather than squeezing, so this should hold at every
      // width; the assertion is what keeps a future longer tool name honest.
      // Line count comes from a Range over the text, since the elements are
      // block-level and would report one rect however they wrap.
      await page.setViewportSize({ width, height: 900 });
      await page.goto(ROUTE);
      await page.waitForSelector('h1');
      const wrapped = await page.evaluate(() => {
        const out: string[] = [];
        document.querySelectorAll('.mdoc-step__id, [data-cap-link]').forEach((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          const clipped = el.scrollWidth > el.clientWidth + 1;
          if (range.getClientRects().length > 1 || clipped) out.push(el.textContent?.trim() ?? '');
        });
        return out;
      });
      expect(wrapped).toEqual([]);
    });
  }

  for (const width of [768, 480]) {
    test(`renders at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${ROUTE}#cap-compute_techpar`);
      await expect(page.locator('#cap-compute_techpar')).toBeVisible();
      // No horizontal overflow: long identifiers break mid-token instead.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      );
      expect(overflow).toBe(false);
    });
  }
});
