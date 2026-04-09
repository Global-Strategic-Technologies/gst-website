import { test, expect } from '@playwright/test';
import { waitForMapReady as waitForMapPaths } from './helpers/regulatory-map';

/** Click an element via JS. Scrolls into view first, then uses dispatchEvent
 *  to bypass Playwright's coordinate-based click which can fail on WebKit
 *  and under parallel contention. */
async function jsClick(page: import('@playwright/test').Page, selector: string): Promise<void> {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ block: 'center' });
      el.click();
    }
  }, selector);
}

/**
 * Extended map readiness check for timeline page.
 * Waits for base map paths (via shared helper), then additionally waits for
 * timeline entries to render and D3 event handlers to bind.
 */
async function waitForMapAndTimelineReady(page: import('@playwright/test').Page): Promise<void> {
  await waitForMapPaths(page);
  await page.waitForFunction(() =>
    document.querySelectorAll('.brutal-timeline-entry').length > 0 &&
    (document.querySelector('.brutal-timeline-entry') as HTMLElement)?.offsetHeight > 0
  );
  // Brief pause for D3 event handler binding after DOM render.
  // No positive condition to poll — D3 binds synchronously after paint
  // but we need the microtask queue to flush.
  await new Promise(r => setTimeout(r, 200));
}

test.describe('Regulatory Map — Timeline', () => {
  test.beforeEach(async ({ page }) => {
    // domcontentloaded is reliable under parallel worker contention; networkidle
    // can time out when many workers share the same dev server.
    await page.goto('/hub/tools/regulatory-map', { waitUntil: 'domcontentloaded' });
    await waitForMapAndTimelineReady(page);
  });

  test.describe('1. Timeline Rendering', () => {
    test('should render the timeline section with year groups', async ({ page }) => {
      const timeline = page.locator('#timelineSection');
      await expect(timeline).toBeVisible();

      // Should have at least one year group
      const yearGroups = page.locator('.brutal-timeline-year-group');
      const count = await yearGroups.count();
      expect(count).toBeGreaterThan(0);
    });

    test('should render timeline entries with regulation data', async ({ page }) => {
      const entries = page.locator('.brutal-timeline-entry');
      const count = await entries.count();
      expect(count).toBeGreaterThan(0);

      // Each entry should have a name and date
      const first = entries.first();
      await expect(first.locator('.brutal-timeline-entry__name')).not.toBeEmpty();
      await expect(first.locator('.brutal-timeline-entry__date')).not.toBeEmpty();
    });

    test('should render Today marker within the current year group', async ({ page }) => {
      const todayMarker = page.locator('.brutal-timeline-today');
      await expect(todayMarker).toBeVisible();

      // Today marker should be inside or adjacent to the current year
      // Verify it exists and has the correct label
      await expect(todayMarker.locator('.brutal-timeline-today__label')).toHaveText('Today');

      // The current year group should exist
      const currentYear = new Date().getFullYear().toString();
      const yearLabels = page.locator('.brutal-timeline-year');
      const yearTexts = await yearLabels.allTextContents();
      expect(yearTexts).toContain(currentYear);
    });

    test('should have category-colored timeline entries', async ({ page }) => {
      // Verify at least one entry per category color class exists
      const privacyEntries = await page.locator('.brutal-timeline-entry--privacy').count();
      expect(privacyEntries).toBeGreaterThan(0);

      // AI governance entries should also exist (we added 16 AI regulations)
      const aiEntries = await page.locator('.brutal-timeline-entry--ai').count();
      expect(aiEntries).toBeGreaterThan(0);
    });

    test('should mark upcoming regulations differently from past ones', async ({ page }) => {
      const upcoming = await page.locator('.brutal-timeline-entry--upcoming').count();
      const allEntries = await page.locator('.brutal-timeline-entry').count();

      // Some should be upcoming, some past (not all one or the other)
      expect(upcoming).toBeGreaterThan(0);
      expect(upcoming).toBeLessThan(allEntries);
    });
  });

  test.describe('2. Timeline Interaction', () => {
    test('should show regulation in panel when clicking a timeline entry', async ({ page }) => {
      const panel = page.locator('[data-testid="compliance-panel"]');

      // Panel should start hidden
      await expect(panel).toBeHidden();

      // Click the first timeline entry
      const firstEntry = page.locator('.brutal-timeline-entry').first();
      const entryName = await firstEntry.locator('.brutal-timeline-entry__name').textContent();
      await jsClick(page, '.brutal-timeline-entry');

      // Panel should become visible
      await expect(panel).toBeVisible();

      // Panel should show the regulation name
      const panelName = await page.locator('#panelCountryName').textContent();
      expect(panelName).toBeTruthy();
      expect(panelName!.length).toBeGreaterThan(0);

      // Should have exactly one regulation card
      const cards = await page.locator('.brutal-reg-card').count();
      expect(cards).toBe(1);
    });

    test('should highlight regions on map when clicking a timeline entry', async ({ page }) => {
      // No highlighted regions initially
      const initialHighlighted = await page.locator('.country-path--highlighted').count();
      expect(initialHighlighted).toBe(0);

      // Click a timeline entry
      await jsClick(page, '.brutal-timeline-entry');

      // Wait for highlights to appear on the map
      await page.waitForFunction(() => {
        return document.querySelectorAll('.country-path--highlighted').length > 0 ||
               document.querySelectorAll('.state-path--highlighted').length > 0;
      });

      const highlightedCountries = await page.locator('.country-path--highlighted').count();
      const highlightedStates = await page.locator('.state-path--highlighted').count();
      expect(highlightedCountries + highlightedStates).toBeGreaterThan(0);
    });

    test('should toggle timeline entry active state on click', async ({ page }) => {
      const firstEntry = page.locator('.brutal-timeline-entry').first();

      // Click to activate
      await jsClick(page, '.brutal-timeline-entry');
      await page.waitForFunction(() => {
        const el = document.querySelector('.brutal-timeline-entry');
        return el?.classList.contains('brutal-timeline-entry--active');
      });
      await expect(firstEntry).toHaveClass(/brutal-timeline-entry--active/);

      // Click same entry again to deactivate
      await jsClick(page, '.brutal-timeline-entry');
      await page.waitForFunction(() => {
        const el = document.querySelector('.brutal-timeline-entry');
        return !el?.classList.contains('brutal-timeline-entry--active');
      });
      await expect(firstEntry).not.toHaveClass(/brutal-timeline-entry--active/);
    });

    test('should clear previous active entry when clicking a different entry', async ({ page }) => {
      const entries = page.locator('.brutal-timeline-entry');
      const first = entries.first();
      const second = entries.nth(1);

      // Activate first
      await page.evaluate(() => {
        const entries = document.querySelectorAll('.brutal-timeline-entry');
        if (entries[0]) (entries[0] as HTMLElement).click();
      });
      await expect(first).toHaveClass(/brutal-timeline-entry--active/);

      // Click second — first should deactivate
      await page.evaluate(() => {
        const entries = document.querySelectorAll('.brutal-timeline-entry');
        if (entries[1]) (entries[1] as HTMLElement).click();
      });
      await expect(second).toHaveClass(/brutal-timeline-entry--active/);
      await expect(first).not.toHaveClass(/brutal-timeline-entry--active/);
    });

    test('should clear map highlights when deactivating a timeline entry', async ({ page }) => {
      const firstEntry = page.locator('.brutal-timeline-entry').first();

      // Activate — highlights appear
      await jsClick(page, '.brutal-timeline-entry');
      await page.waitForFunction(() => {
        return document.querySelectorAll('.country-path--highlighted').length > 0 ||
               document.querySelectorAll('.state-path--highlighted').length > 0;
      });

      // Deactivate — highlights should be cleared
      await jsClick(page, '.brutal-timeline-entry');
      await page.waitForFunction(() => {
        return document.querySelectorAll('.country-path--highlighted').length === 0 &&
               document.querySelectorAll('.state-path--highlighted').length === 0;
      });

      const highlighted = await page.locator('.country-path--highlighted').count() +
                           await page.locator('.state-path--highlighted').count();
      expect(highlighted).toBe(0);
    });
  });

  test.describe('3. Timeline + Filter Integration', () => {
    test('should update timeline entries when filter changes', async ({ page }) => {
      // Get entry count with "All" filter
      const allCount = await page.locator('.brutal-timeline-entry').count();
      expect(allCount).toBeGreaterThan(0);

      // Switch to AI Governance — wait for filter chip to become active first
      await jsClick(page, '.brutal-filter-chip[data-category="ai-governance"]');
      await page.waitForFunction(() => {
        const chip = document.querySelector('.brutal-filter-chip[data-category="ai-governance"]');
        return chip?.classList.contains('brutal-filter-chip--active');
      });

      // Wait for timeline to re-render with fewer entries
      await page.waitForFunction((prevCount) => {
        return document.querySelectorAll('.brutal-timeline-entry').length !== prevCount;
      }, allCount);

      const aiCount = await page.locator('.brutal-timeline-entry').count();
      expect(aiCount).toBeGreaterThan(0);
      expect(aiCount).toBeLessThan(allCount);
    });

    test('should restore all timeline entries when switching back to "All"', async ({ page }) => {
      const allCount = await page.locator('.brutal-timeline-entry').count();

      // Switch away — wait for filter chip to become active first
      await jsClick(page, '.brutal-filter-chip[data-category="ai-governance"]');
      await page.waitForFunction(() => {
        const chip = document.querySelector('.brutal-filter-chip[data-category="ai-governance"]');
        return chip?.classList.contains('brutal-filter-chip--active');
      });
      await page.waitForFunction((prev) => {
        return document.querySelectorAll('.brutal-timeline-entry').length !== prev;
      }, allCount);

      // Switch back — wait for filter chip to become active first
      await jsClick(page, '.brutal-filter-chip[data-category="all"]');
      await page.waitForFunction(() => {
        const chip = document.querySelector('.brutal-filter-chip[data-category="all"]');
        return chip?.classList.contains('brutal-filter-chip--active');
      });
      await page.waitForFunction((expected) => {
        return document.querySelectorAll('.brutal-timeline-entry').length === expected;
      }, allCount);

      const restoredCount = await page.locator('.brutal-timeline-entry').count();
      expect(restoredCount).toBe(allCount);
    });
  });
});
