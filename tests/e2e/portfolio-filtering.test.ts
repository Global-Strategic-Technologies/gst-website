import { test, expect, type Page } from '@playwright/test';
import { openFilterDrawer } from './helpers/portfolio';

const HEADER_SEARCH = '[data-testid="portfolio-search-input"]';
const STICKY_SEARCH = '[data-testid="sticky-search-input"]';

/**
 * Scroll the portfolio header up under the nav so the floating StickyControls bar
 * slides in, then wait for the slide to finish (TEST_BEST_PRACTICES §5): the bar
 * animates `transform` (translateY(-200px) → 0) and `opacity`, so the class alone
 * lands before the bar is where a user sees it. No fixed timeouts.
 *
 * The scroll handler also runs once at init, so this cannot race its binding.
 */
async function revealStickyBar(page: Page): Promise<void> {
  await page.evaluate(() => {
    const header = document.querySelector('.portfolio-header');
    if (!header) throw new Error('.portfolio-header not found');
    window.scrollTo(0, header.getBoundingClientRect().bottom + window.scrollY + 100);
  });
  await page.waitForFunction(
    () => {
      const bar = document.querySelector('.sticky-controls-overlay .portfolio-controls-fixed');
      if (!bar || !bar.classList.contains('sticky-active')) return false;
      const cs = window.getComputedStyle(bar);
      return (
        parseFloat(cs.opacity) >= 0.99 && Math.abs(new DOMMatrixReadOnly(cs.transform).m42) < 1
      );
    },
    undefined,
    { timeout: 5000 }
  );
}

/**
 * A search term taken from the live data rather than hard-coded (TEST_BEST_PRACTICES
 * §6): the first project's code name. Code names are distinct per engagement, so it
 * matches that project and not the whole portfolio.
 */
async function readSearchFixture(page: Page) {
  return page.evaluate(() => {
    const state = (
      window as unknown as { portfolioState: { allProjects: Record<string, unknown>[] } }
    ).portfolioState;
    const first = state.allProjects[0];
    return {
      term: String(first.codeName),
      firstId: String(first.id),
      total: state.allProjects.length,
    };
  });
}

function visibleCardCount(page: Page): Promise<number> {
  return page.locator('.project-card:not(.hidden)').count();
}

function searchParam(page: Page): string | null {
  return new URL(page.url()).searchParams.get('search');
}

test.describe('Portfolio Filtering - DOM Integration Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ma-portfolio/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => (window as any).__portfolioInitialized === true, {
      timeout: 5000,
    });
  });

  test('should initialize with "All Engagements" filter active', async ({ page }) => {
    await openFilterDrawer(page);

    const allEngagementsChip = page.locator('[data-testid="filter-chip-engagement-all"]');
    await expect(allEngagementsChip).toHaveClass(/active/);
  });

  test('should initialize with "All Themes" filter active', async ({ page }) => {
    await openFilterDrawer(page);

    const allThemesChip = page.locator('[data-testid="filter-chip-theme-all"]');
    await expect(allThemesChip).toHaveClass(/active/);
  });

  test('should activate engagement category filter when clicked', async ({ page }) => {
    await openFilterDrawer(page);

    const buySideChip = page.locator('[data-testid="filter-chip-engagement-buy-side"]');
    await buySideChip.click();

    await expect(buySideChip).toHaveClass(/active/);

    const allEngagementsChip = page.locator('[data-testid="filter-chip-engagement-all"]');
    await expect(allEngagementsChip).not.toHaveClass(/active/);
  });

  test('should activate theme filter when clicked', async ({ page }) => {
    await openFilterDrawer(page);

    const educationChip = page.locator('[data-testid="filter-chip-theme-education"]');
    await educationChip.click();

    await expect(educationChip).toHaveClass(/active/);

    const allThemesChip = page.locator('[data-testid="filter-chip-theme-all"]');
    await expect(allThemesChip).not.toHaveClass(/active/);
  });

  test('should only allow one engagement filter active at a time', async ({ page }) => {
    await openFilterDrawer(page);

    const buySideChip = page.locator('[data-testid="filter-chip-engagement-buy-side"]');
    await page.evaluate(() => {
      (
        document.querySelector('[data-testid="filter-chip-engagement-buy-side"]') as HTMLElement
      )?.click();
    });
    await page.waitForFunction(() => {
      const chip = document.querySelector('[data-testid="filter-chip-engagement-buy-side"]');
      return chip?.classList.contains('active');
    });
    await expect(buySideChip).toHaveClass(/active/);

    const sellSideChip = page.locator('[data-testid="filter-chip-engagement-sell-side"]');
    await page.evaluate(() => {
      (
        document.querySelector('[data-testid="filter-chip-engagement-sell-side"]') as HTMLElement
      )?.click();
    });
    await page.waitForFunction(() => {
      const chip = document.querySelector('[data-testid="filter-chip-engagement-sell-side"]');
      return chip?.classList.contains('active');
    });

    await expect(sellSideChip).toHaveClass(/active/);
    await expect(buySideChip).not.toHaveClass(/active/);
  });

  test('should reset to "All" filter when clicking "All Engagements"', async ({ page }) => {
    await openFilterDrawer(page);

    const buySideChip = page.locator('[data-testid="filter-chip-engagement-buy-side"]');
    await page.evaluate(() => {
      (
        document.querySelector('[data-testid="filter-chip-engagement-buy-side"]') as HTMLElement
      )?.click();
    });
    await page.waitForFunction(() => {
      const chip = document.querySelector('[data-testid="filter-chip-engagement-buy-side"]');
      return chip?.classList.contains('active');
    });
    await expect(buySideChip).toHaveClass(/active/);

    const allEngagementsChip = page.locator('[data-testid="filter-chip-engagement-all"]');
    await page.evaluate(() => {
      (
        document.querySelector('[data-testid="filter-chip-engagement-all"]') as HTMLElement
      )?.click();
    });
    await page.waitForFunction(() => {
      const chip = document.querySelector('[data-testid="filter-chip-engagement-all"]');
      return chip?.classList.contains('active');
    });

    await expect(allEngagementsChip).toHaveClass(/active/);
    await expect(buySideChip).not.toHaveClass(/active/);
  });

  test('should clear all filters and reset to defaults', async ({ page }) => {
    await openFilterDrawer(page);

    const buySideChip = page.locator('[data-testid="filter-chip-engagement-buy-side"]');
    const financeChip = page.locator('[data-testid="filter-chip-theme-finance"]');

    await page.evaluate(() => {
      (
        document.querySelector('[data-testid="filter-chip-engagement-buy-side"]') as HTMLElement
      )?.click();
    });
    await expect(buySideChip).toHaveClass(/active/);

    await page.evaluate(() => {
      (document.querySelector('[data-testid="filter-chip-theme-finance"]') as HTMLElement)?.click();
    });
    await expect(financeChip).toHaveClass(/active/);

    await page.evaluate(() => {
      (document.querySelector('[data-testid="clear-filters-button"]') as HTMLElement)?.click();
    });

    await page.waitForFunction(() => {
      const allChip = document.querySelector('[data-testid="filter-chip-engagement-all"]');
      return allChip && allChip.classList.contains('active');
    });

    await expect(buySideChip).not.toHaveClass(/active/);
    await expect(financeChip).not.toHaveClass(/active/);

    const allEngagementsChip = page.locator('[data-testid="filter-chip-engagement-all"]');
    const allThemesChip = page.locator('[data-testid="filter-chip-theme-all"]');

    await expect(allEngagementsChip).toHaveClass(/active/);
    await expect(allThemesChip).toHaveClass(/active/);
  });
});

// The floating StickyControls bar carries a second search box for the same filter.
// PortfolioHeader's script binds both boxes, so each direction of the pair is tested
// (TEST_BEST_PRACTICES §27): sticky → header, header → sticky, and Clear → both.
test.describe('Portfolio Filtering - sticky search bar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ma-portfolio/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => (window as { __portfolioInitialized?: boolean }).__portfolioInitialized === true,
      undefined,
      { timeout: 10000 }
    );
  });

  test('sticky search filters the grid, mirrors into the header search and writes the URL', async ({
    page,
  }) => {
    const { term, firstId, total } = await readSearchFixture(page);
    await revealStickyBar(page);

    // fill() needs no hit-test, so the bar's z-index 9999 overlay (§7) is not in play.
    await page.locator(STICKY_SEARCH).fill(term);

    // The filter and the URL write run behind a 300ms debounce (§9): poll, never sleep.
    await expect.poll(() => searchParam(page)).toBe(term);
    await expect(page.locator(HEADER_SEARCH)).toHaveValue(term);

    await expect.poll(() => visibleCardCount(page)).toBeGreaterThan(0);
    await expect.poll(() => visibleCardCount(page)).toBeLessThan(total);
    await expect(page.locator(`.project-card[data-project-id="${firstId}"]`)).not.toHaveClass(
      /\bhidden\b/
    );
  });

  test('header search mirrors into the sticky search', async ({ page }) => {
    const { term } = await readSearchFixture(page);

    await page.locator(HEADER_SEARCH).fill(term);

    await expect(page.locator(STICKY_SEARCH)).toHaveValue(term);
    await expect.poll(() => searchParam(page)).toBe(term);
  });

  test('a ?search= deeplink fills both search boxes', async ({ page }) => {
    const { term } = await readSearchFixture(page);

    await page.goto(`/ma-portfolio/?search=${encodeURIComponent(term)}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForFunction(
      () => (window as { __portfolioInitialized?: boolean }).__portfolioInitialized === true,
      undefined,
      { timeout: 10000 }
    );

    await expect(page.locator(HEADER_SEARCH)).toHaveValue(term);
    await expect(page.locator(STICKY_SEARCH)).toHaveValue(term);
  });

  test('Clear filters empties both search boxes and the URL', async ({ page }) => {
    const { term, total } = await readSearchFixture(page);
    await revealStickyBar(page);

    await page.locator(STICKY_SEARCH).fill(term);
    await expect.poll(() => searchParam(page)).toBe(term);

    await openFilterDrawer(page);
    // Dispatched rather than clicked: the sticky overlay (z-index 9999) can sit over
    // the drawer's top edge, so a coordinate click could land on it (§7).
    await page.evaluate(() => {
      (document.querySelector('[data-testid="clear-filters-button"]') as HTMLElement)?.click();
    });

    await expect(page.locator(STICKY_SEARCH)).toHaveValue('');
    await expect(page.locator(HEADER_SEARCH)).toHaveValue('');
    await expect.poll(() => searchParam(page)).toBeNull();
    await expect.poll(() => visibleCardCount(page)).toBe(total);
  });
});
