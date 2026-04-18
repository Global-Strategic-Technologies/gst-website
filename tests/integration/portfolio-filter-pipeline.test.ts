/**
 * Integration test: Portfolio Filter Pipeline
 *
 * Tests the end-to-end data flow from raw projects through filtering,
 * chip availability computation, and result counts — without DOM.
 * Verifies that filterProjects and computeAvailableChips produce
 * consistent, correct results when composed.
 */
import { describe, it, expect } from 'vitest';
import {
  filterProjects,
  computeAvailableChips,
  getUniqueThemes,
  getUniqueEngagementCategories,
  type FilterCriteria,
} from '@/utils/filterLogic';
import type { Project } from '@/types/portfolio';

// Realistic subset — covers multiple themes, engagement categories, and technologies
const projects: Project[] = [
  {
    id: 'p1',
    codeName: 'Alpha Platform',
    industry: 'Software',
    theme: 'Technology',
    summary: 'Cloud platform migration',
    arr: '$80M',
    arrNumeric: 80_000_000,
    currency: 'USD',
    growthStage: 'Scaling Growth',
    year: 2024,
    technologies: ['React', 'AWS', 'TypeScript'],
    engagementType: 'Value Creation',
    engagementCategory: 'Sell-Side',
  },
  {
    id: 'p2',
    codeName: 'Beta Health',
    industry: 'Healthcare',
    theme: 'Healthcare',
    summary: 'EHR modernization',
    arr: '€40M',
    arrNumeric: 40_000_000,
    currency: 'EUR',
    growthStage: 'Mature Enterprise',
    year: 2023,
    technologies: ['Python', 'PostgreSQL'],
    engagementType: 'Technical Diligence',
    engagementCategory: 'Buy-Side',
  },
  {
    id: 'p3',
    codeName: 'Gamma Finance',
    industry: 'Finance',
    theme: 'Finance',
    summary: 'Risk analytics dashboard',
    arr: '£120M',
    arrNumeric: 120_000_000,
    currency: 'GBP',
    growthStage: 'Mature Enterprise',
    year: 2024,
    technologies: ['React', 'D3.js', 'Node.js'],
    engagementType: 'Value Creation',
    engagementCategory: 'Sell-Side',
  },
  {
    id: 'p4',
    codeName: 'Delta Logistics',
    industry: 'Logistics',
    theme: 'Technology',
    summary: 'Supply chain optimization with Go microservices',
    arr: '$200M',
    arrNumeric: 200_000_000,
    currency: 'USD',
    growthStage: 'Scaling Growth',
    year: 2024,
    technologies: ['Go', 'Kubernetes', 'AWS'],
    engagementType: 'Technical Diligence',
    engagementCategory: 'Buy-Side',
  },
  {
    id: 'p5',
    codeName: 'Epsilon Retail',
    industry: 'Retail',
    theme: 'Retail',
    summary: 'E-commerce platform rewrite',
    arr: '$50M',
    arrNumeric: 50_000_000,
    currency: 'USD',
    growthStage: 'Early-Stage Growth',
    year: 2023,
    technologies: ['React', 'Next.js'],
    engagementType: 'Value Creation',
    engagementCategory: 'Sell-Side',
  },
];

describe('Portfolio Filter Pipeline', () => {
  describe('filter → result count consistency', () => {
    it('no filters returns all projects', () => {
      const criteria: FilterCriteria = { search: '', theme: 'all', engagement: 'all' };
      const result = filterProjects(projects, criteria);
      expect(result).toHaveLength(projects.length);
    });

    it('search narrows results correctly', () => {
      const criteria: FilterCriteria = { search: 'React', theme: 'all', engagement: 'all' };
      const result = filterProjects(projects, criteria);
      // p1 (React), p3 (React), p5 (React) — 3 projects
      expect(result).toHaveLength(3);
      expect(result.map((p) => p.id)).toEqual(expect.arrayContaining(['p1', 'p3', 'p5']));
    });

    it('theme filter narrows results correctly', () => {
      const criteria: FilterCriteria = { search: '', theme: 'Technology', engagement: 'all' };
      const result = filterProjects(projects, criteria);
      // p1 (Technology), p4 (Technology) — 2 projects
      expect(result).toHaveLength(2);
    });

    it('engagement filter narrows results correctly', () => {
      const criteria: FilterCriteria = { search: '', theme: 'all', engagement: 'Buy-Side' };
      const result = filterProjects(projects, criteria);
      // p2 (Buy-Side), p4 (Buy-Side) — 2 projects
      expect(result).toHaveLength(2);
    });

    it('combined filters narrow correctly', () => {
      const criteria: FilterCriteria = {
        search: 'AWS',
        theme: 'Technology',
        engagement: 'all',
      };
      const result = filterProjects(projects, criteria);
      // p1 (Technology + AWS), p4 (Technology + AWS) — 2 projects
      expect(result).toHaveLength(2);
    });

    it('impossible combination returns empty', () => {
      const criteria: FilterCriteria = {
        search: 'React',
        theme: 'Healthcare',
        engagement: 'Sell-Side',
      };
      const result = filterProjects(projects, criteria);
      // No Healthcare projects use React
      expect(result).toHaveLength(0);
    });
  });

  describe('chip availability is consistent with filter results', () => {
    it('available themes match projects in current engagement filter', () => {
      const criteria: FilterCriteria = { search: '', theme: 'all', engagement: 'Buy-Side' };
      const available = computeAvailableChips(projects, criteria);
      const filtered = filterProjects(projects, criteria);

      // Every theme in filtered results should be in available set
      const filteredThemes = new Set(filtered.map((p) => p.theme));
      for (const theme of filteredThemes) {
        expect(available.theme.has(theme)).toBe(true);
      }
    });

    it('selecting an unavailable chip would yield zero results', () => {
      const criteria: FilterCriteria = { search: '', theme: 'all', engagement: 'Buy-Side' };
      const available = computeAvailableChips(projects, criteria);

      // Get all themes in the dataset
      const allThemes = getUniqueThemes(projects);
      const unavailableThemes = allThemes.filter((t) => !available.theme.has(t));

      // Each unavailable theme combined with Buy-Side should give 0 results
      for (const theme of unavailableThemes) {
        const combined: FilterCriteria = { search: '', theme, engagement: 'Buy-Side' };
        const result = filterProjects(projects, combined);
        expect(
          result,
          `Theme "${theme}" + Buy-Side should yield 0 results but got ${result.length}`
        ).toHaveLength(0);
      }
    });

    it('search narrows both chip dimensions', () => {
      const noSearch: FilterCriteria = { search: '', theme: 'all', engagement: 'all' };
      const withSearch: FilterCriteria = { search: 'Go', theme: 'all', engagement: 'all' };

      const allAvailable = computeAvailableChips(projects, noSearch);
      const searchAvailable = computeAvailableChips(projects, withSearch);

      expect(searchAvailable.theme.size).toBeLessThanOrEqual(allAvailable.theme.size);
      expect(searchAvailable.engagement.size).toBeLessThanOrEqual(allAvailable.engagement.size);

      // Only p4 has Go — Technology theme, Buy-Side engagement
      expect(searchAvailable.theme.has('Technology')).toBe(true);
      expect(searchAvailable.engagement.has('Buy-Side')).toBe(true);
    });
  });

  describe('metadata extraction matches filter options', () => {
    it('getUniqueThemes covers all themes in data', () => {
      const themes = getUniqueThemes(projects);
      const allThemes = new Set(projects.map((p) => p.theme));
      expect(themes.sort()).toEqual([...allThemes].sort());
    });

    it('getUniqueEngagementCategories covers all categories in data', () => {
      const categories = getUniqueEngagementCategories(projects);
      const allCategories = new Set(projects.map((p) => p.engagementCategory).filter(Boolean));
      expect(categories.sort()).toEqual([...allCategories].sort());
    });
  });
});
