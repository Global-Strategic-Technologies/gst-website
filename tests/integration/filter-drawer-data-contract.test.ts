/**
 * Integration Tests — FilterDrawer Data Contract
 *
 * Tests the data transformation logic that drives FilterDrawer.astro rendering.
 * Since Astro components can't be rendered in Vitest, we replicate the chip-
 * building logic as pure functions and verify in isolation — following the same
 * pattern as toc-component.test.ts.
 *
 * If FilterDrawer's template changes its data-testid generation logic,
 * these tests MUST be updated in parallel.
 */
import { getUniqueThemes, getUniqueEngagementCategories } from '../../src/utils/filterLogic';
import projects from '../../src/data/ma-portfolio/projects.json';
import type { Project } from '../../src/types/portfolio';

// ─── Chip generation logic (replicates FilterDrawer.astro template) ─────────

interface ChipEntry {
  value: string;
  testId: string;
  label: string;
}

/**
 * Replicates the engagement chip data-testid generation from FilterDrawer.astro:
 *   data-testid={`filter-chip-engagement-${cat.toLowerCase().replace(/[\s&]+/g, '-')}`}
 */
function buildEngagementChips(categories: string[]): ChipEntry[] {
  return [
    { value: 'all', testId: 'filter-chip-engagement-all', label: 'All Engagements' },
    ...categories.map((cat) => ({
      value: cat,
      testId: `filter-chip-engagement-${cat.toLowerCase().replace(/[\s&]+/g, '-')}`,
      label: cat,
    })),
  ];
}

/**
 * Replicates the theme chip data-testid generation from FilterDrawer.astro:
 *   data-testid={`filter-chip-theme-${theme.toLowerCase().replace(/\s+/g, '-')}`}
 */
function buildThemeChips(themes: string[]): ChipEntry[] {
  return [
    { value: 'all', testId: 'filter-chip-theme-all', label: 'All Themes' },
    ...themes.map((theme) => ({
      value: theme,
      testId: `filter-chip-theme-${theme.toLowerCase().replace(/\s+/g, '-')}`,
      label: theme,
    })),
  ];
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('FilterDrawer — chip generation', () => {
  describe('engagement chips', () => {
    it('generates "All Engagements" as first entry', () => {
      const chips = buildEngagementChips(['Buy-Side', 'Sell-Side']);
      expect(chips[0]).toEqual({
        value: 'all',
        testId: 'filter-chip-engagement-all',
        label: 'All Engagements',
      });
    });

    it('generates correct data-testid slugs with hyphens', () => {
      const chips = buildEngagementChips(['Buy-Side', 'Sell-Side']);
      expect(chips[1].testId).toBe('filter-chip-engagement-buy-side');
      expect(chips[2].testId).toBe('filter-chip-engagement-sell-side');
    });

    it('replaces spaces and ampersands in testId slugs', () => {
      const chips = buildEngagementChips(['Research & Advisory']);
      expect(chips[1].testId).toBe('filter-chip-engagement-research-advisory');
    });

    it('empty categories produces only the All chip', () => {
      const chips = buildEngagementChips([]);
      expect(chips).toHaveLength(1);
      expect(chips[0].value).toBe('all');
    });

    it('preserves input order', () => {
      const chips = buildEngagementChips(['Alpha', 'Beta', 'Gamma']);
      expect(chips.map((c) => c.label)).toEqual(['All Engagements', 'Alpha', 'Beta', 'Gamma']);
    });
  });

  describe('theme chips', () => {
    it('generates "All Themes" as first entry', () => {
      const chips = buildThemeChips(['Technology', 'Healthcare']);
      expect(chips[0]).toEqual({
        value: 'all',
        testId: 'filter-chip-theme-all',
        label: 'All Themes',
      });
    });

    it('generates correct data-testid slugs', () => {
      const chips = buildThemeChips(['Technology', 'Healthcare']);
      expect(chips[1].testId).toBe('filter-chip-theme-technology');
      expect(chips[2].testId).toBe('filter-chip-theme-healthcare');
    });

    it('handles multi-word themes', () => {
      const chips = buildThemeChips(['Financial Services']);
      expect(chips[1].testId).toBe('filter-chip-theme-financial-services');
    });

    it('handles single-item array', () => {
      const chips = buildThemeChips(['Education']);
      expect(chips).toHaveLength(2);
      expect(chips[1].label).toBe('Education');
    });
  });
});

describe('FilterDrawer — props contract against production data', () => {
  const typedProjects = projects as unknown as Project[];

  it('getUniqueThemes returns non-empty sorted array from production data', () => {
    const themes = getUniqueThemes(typedProjects);
    expect(themes.length).toBeGreaterThan(0);
    expect(themes).toEqual([...themes].sort());
  });

  it('getUniqueEngagementCategories returns non-empty sorted array from production data', () => {
    const categories = getUniqueEngagementCategories(typedProjects);
    expect(categories.length).toBeGreaterThan(0);
    expect(categories).toEqual([...categories].sort());
  });

  it('all generated theme chip testIds contain only lowercase, digits, hyphens, and ampersands', () => {
    const themes = getUniqueThemes(typedProjects);
    const chips = buildThemeChips(themes);
    for (const chip of chips) {
      expect(chip.testId).toMatch(/^[a-z0-9&-]+$/);
    }
  });

  it('all generated engagement chip testIds are valid CSS selector strings', () => {
    const categories = getUniqueEngagementCategories(typedProjects);
    const chips = buildEngagementChips(categories);
    for (const chip of chips) {
      expect(chip.testId).toMatch(/^[a-z0-9-]+$/);
    }
  });
});
