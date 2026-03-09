import { test, expect } from '@playwright/test';

/**
 * Wait for D3 map paths to finish rendering.
 */
async function waitForMapReady(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(() => document.querySelectorAll('.country-path').length > 0);
}

test.describe('Regulatory Map — Timeline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/hub/tools/regulatory-map', { waitUntil: 'networkidle' });
    await waitForMapReady(page);
  });

  test.describe('1. Timeline Rendering', () => {
    test('should render the timeline section with year groups', async ({ page }) => {
      const timeline = page.locator('#timelineSection');
      await expect(timeline).toBeVisible();

      // Should have at least one year group
      const yearGroups = page.locator('.timeline-year-group');
      const count = await yearGroups.count();
      expect(count).toBeGreaterThan(0);
    });

    test('should render timeline entries with regulation data', async ({ page }) => {
      const entries = page.locator('.timeline-entry');
      const count = await entries.count();
      expect(count).toBeGreaterThan(0);

      // Each entry should have a name and date
      const first = entries.first();
      await expect(first.locator('.timeline-entry__name')).not.toBeEmpty();
      await expect(first.locator('.timeline-entry__date')).not.toBeEmpty();
    });

    test('should render Today marker within the current year group', async ({ page }) => {
      const todayMarker = page.locator('.timeline-today');
      await expect(todayMarker).toBeVisible();

      // Today marker should be inside or adjacent to the current year
      // Verify it exists and has the correct label
      await expect(todayMarker.locator('.timeline-today__label')).toHaveText('Today');

      // The current year group should exist
      const currentYear = new Date().getFullYear().toString();
      const yearLabels = page.locator('.timeline-year-label');
      const yearTexts = await yearLabels.allTextContents();
      expect(yearTexts).toContain(currentYear);
    });

    test('should have category-colored timeline entries', async ({ page }) => {
      // Verify at least one entry per category color class exists
      const privacyEntries = await page.locator('.timeline-entry--privacy').count();
      expect(privacyEntries).toBeGreaterThan(0);

      // AI governance entries should also exist (we added 16 AI regulations)
      const aiEntries = await page.locator('.timeline-entry--ai').count();
      expect(aiEntries).toBeGreaterThan(0);
    });

    test('should mark upcoming regulations differently from past ones', async ({ page }) => {
      const upcoming = await page.locator('.timeline-entry--upcoming').count();
      const allEntries = await page.locator('.timeline-entry').count();

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
      const firstEntry = page.locator('.timeline-entry').first();
      const entryName = await firstEntry.locator('.timeline-entry__name').textContent();
      await firstEntry.click();

      // Panel should become visible
      await expect(panel).toBeVisible();

      // Panel should show the regulation name
      const panelName = await page.locator('#panelCountryName').textContent();
      expect(panelName).toBeTruthy();
      expect(panelName!.length).toBeGreaterThan(0);

      // Should have exactly one regulation card
      const cards = await page.locator('.reg-card').count();
      expect(cards).toBe(1);
    });

    test('should highlight regions on map when clicking a timeline entry', async ({ page }) => {
      // No highlighted regions initially
      const initialHighlighted = await page.locator('.country-path--highlighted').count();
      expect(initialHighlighted).toBe(0);

      // Click a timeline entry
      await page.locator('.timeline-entry').first().click();

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
      const firstEntry = page.locator('.timeline-entry').first();

      // Click to activate
      await firstEntry.click();
      await expect(firstEntry).toHaveClass(/timeline-entry--active/);

      // Click same entry again to deactivate
      await firstEntry.click();
      await expect(firstEntry).not.toHaveClass(/timeline-entry--active/);
    });

    test('should clear previous active entry when clicking a different entry', async ({ page }) => {
      const entries = page.locator('.timeline-entry');
      const first = entries.first();
      const second = entries.nth(1);

      // Activate first
      await first.click();
      await expect(first).toHaveClass(/timeline-entry--active/);

      // Click second — first should deactivate
      await second.click();
      await expect(second).toHaveClass(/timeline-entry--active/);
      await expect(first).not.toHaveClass(/timeline-entry--active/);
    });

    test('should clear map highlights when deactivating a timeline entry', async ({ page }) => {
      const firstEntry = page.locator('.timeline-entry').first();

      // Activate — highlights appear
      await firstEntry.click();
      await page.waitForFunction(() => {
        return document.querySelectorAll('.country-path--highlighted').length > 0 ||
               document.querySelectorAll('.state-path--highlighted').length > 0;
      });

      // Deactivate — highlights should be cleared
      await firstEntry.click();
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
      const allCount = await page.locator('.timeline-entry').count();
      expect(allCount).toBeGreaterThan(0);

      // Switch to AI Governance
      await page.locator('.filter-chip[data-category="ai-governance"]').click();

      // Wait for timeline to re-render with fewer entries
      await page.waitForFunction((prevCount) => {
        return document.querySelectorAll('.timeline-entry').length !== prevCount;
      }, allCount);

      const aiCount = await page.locator('.timeline-entry').count();
      expect(aiCount).toBeGreaterThan(0);
      expect(aiCount).toBeLessThan(allCount);
    });

    test('should restore all timeline entries when switching back to "All"', async ({ page }) => {
      const allCount = await page.locator('.timeline-entry').count();

      // Switch away
      await page.locator('.filter-chip[data-category="ai-governance"]').click();
      await page.waitForFunction((prev) => {
        return document.querySelectorAll('.timeline-entry').length !== prev;
      }, allCount);

      // Switch back
      await page.locator('.filter-chip[data-category="all"]').click();
      await page.waitForFunction((expected) => {
        return document.querySelectorAll('.timeline-entry').length === expected;
      }, allCount);

      const restoredCount = await page.locator('.timeline-entry').count();
      expect(restoredCount).toBe(allCount);
    });
  });
});
