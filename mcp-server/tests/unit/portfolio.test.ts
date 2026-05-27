/**
 * Tests for the search_portfolio + list_portfolio_facets tool wrappers.
 *
 * The wrappers delegate to `filterProjects` / `getUnique*` (well-tested
 * upstream). We exercise: input parsing, facet shape, default behavior,
 * and the JSON-validation contract for the bundled dataset.
 *
 * BL-031.95 Phase 4.A: the `limit` input was removed from the schema
 * under the capability-mirror invariant (the website's /ma-portfolio
 * page renders all bundled projects always — no client-side pagination
 * or truncation). The full wrapper-pipeline pathway including deeplink
 * emission is exercised in the integration file
 * `tests/integration/portfolio-handler.test.ts`.
 */

import projectsRaw from '../../../src/data/ma-portfolio/projects.json';
import {
  filterProjects,
  getUniqueThemes,
  getUniqueEngagementCategories,
  getUniqueGrowthStages,
  getUniqueYears,
} from '../../../src/utils/filterLogic';
import {
  ProjectsArraySchema,
  SearchPortfolioInputSchema,
  ListPortfolioFacetsInputSchema,
  type Project,
} from '../../src/schemas';

const PROJECTS: Project[] = ProjectsArraySchema.parse(projectsRaw);

describe('Portfolio dataset (bundle integrity)', () => {
  it('parses cleanly against ProjectsArraySchema', () => {
    expect(PROJECTS.length).toBeGreaterThan(0);
  });

  it('contains a non-trivial number of projects (regression guard against accidental truncation)', () => {
    // Lower bound rather than an exact count: ProjectsArraySchema.parse
    // above is the real integrity check (throws on any malformed record).
    // The `>= 50` guard catches wholesale data loss without trapping
    // routine additions — the exact-count pattern was failing CI on
    // every portfolio-add PR (see TEST_BEST_PRACTICES.md § 6 — "Hardcoded
    // Test Data Assumptions").
    expect(PROJECTS.length).toBeGreaterThanOrEqual(50);
  });

  it('every project has a non-empty technologies array', () => {
    for (const p of PROJECTS) {
      expect(Array.isArray(p.technologies)).toBe(true);
      expect(p.technologies.length).toBeGreaterThan(0);
    }
  });
});

describe('SearchPortfolioInputSchema', () => {
  it('applies defaults when only `search` is provided', () => {
    const parsed = SearchPortfolioInputSchema.parse({ search: 'CRM' });
    expect(parsed.theme).toBe('all');
    expect(parsed.engagement).toBe('all');
  });

  it('accepts an empty input object via defaults', () => {
    const parsed = SearchPortfolioInputSchema.parse({});
    expect(parsed.theme).toBe('all');
    expect(parsed.engagement).toBe('all');
  });

  it('strips unknown keys (capability-mirror invariant — `limit` removed in Phase 4.A)', () => {
    // Zod's default object behaviour drops unknown keys silently.
    const parsed = SearchPortfolioInputSchema.parse({
      theme: 'all',
      limit: 100,
    } as Record<string, unknown>);
    expect((parsed as Record<string, unknown>).limit).toBeUndefined();
  });
});

describe('search_portfolio (filter parity)', () => {
  it('returns at least one match for a substring known to occur in the dataset', () => {
    const matches = filterProjects(PROJECTS, {
      search: 'cloud',
      theme: 'all',
      engagement: 'all',
    });
    expect(matches.length).toBeGreaterThan(0);
  });

  it('returns an empty array for a deliberately impossible search', () => {
    const matches = filterProjects(PROJECTS, {
      search: 'xyznever-matches-anything-zz',
      theme: 'all',
      engagement: 'all',
    });
    expect(matches.length).toBe(0);
  });

  it('respects the engagement filter (engagementCategory equality)', () => {
    const valueCreation = filterProjects(PROJECTS, {
      search: '',
      theme: 'all',
      engagement: 'Buy-Side',
    });
    for (const p of valueCreation) {
      expect(p.engagementCategory).toBe('Buy-Side');
    }
  });

  it('respects the theme filter (exact match)', () => {
    const themes = getUniqueThemes(PROJECTS);
    const sample = themes[0];
    const filtered = filterProjects(PROJECTS, {
      search: '',
      theme: sample,
      engagement: 'all',
    });
    expect(filtered.length).toBeGreaterThan(0);
    for (const p of filtered) {
      expect(p.theme).toBe(sample);
    }
  });
});

describe('list_portfolio_facets (deterministic output)', () => {
  it('returns themes sorted ascending', () => {
    const themes = getUniqueThemes(PROJECTS);
    expect(themes.length).toBeGreaterThan(0);
    const sorted = [...themes].sort();
    expect(themes).toEqual(sorted);
  });

  it('returns years sorted descending', () => {
    const years = getUniqueYears(PROJECTS);
    expect(years.length).toBeGreaterThan(0);
    for (let i = 1; i < years.length; i++) {
      expect(years[i - 1]).toBeGreaterThanOrEqual(years[i]);
    }
  });

  it('returns engagementCategories with no duplicates', () => {
    const cats = getUniqueEngagementCategories(PROJECTS);
    expect(cats.length).toBe(new Set(cats).size);
  });

  it('returns growthStages with no duplicates', () => {
    const stages = getUniqueGrowthStages(PROJECTS);
    expect(stages.length).toBe(new Set(stages).size);
  });

  it('returns growthStages in canonical maturity-progression order', () => {
    // Regression for the BL-032 soak T.B.1.a finding (2026-05-10): the
    // helper previously returned Set-iteration order, which is neither
    // sorted nor maturity-meaningful. The contract is now progression
    // order per GROWTH_STAGE_PROGRESSION_ORDER in filterLogic.ts.
    const stages = getUniqueGrowthStages(PROJECTS);
    expect(stages).toEqual([
      'Early-Stage Growth',
      'Scaling Growth',
      'Expansion Stage',
      'Mature Enterprise',
      'Established Market Leader',
      'Legacy System',
    ]);
  });
});

describe('ListPortfolioFacetsInputSchema', () => {
  it('accepts an empty object', () => {
    const result = ListPortfolioFacetsInputSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
