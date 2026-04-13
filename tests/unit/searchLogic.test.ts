import {
  performSearch,
  debounce,
  createDebouncedSearch,
  highlightSearchTerm,
  getSearchRelevance,
  sortBySearchRelevance,
} from '@/utils/searchLogic';
import type { Project } from '@/types/portfolio';

// Mock project data
const mockProjects: Project[] = [
  {
    id: 'project-1',
    codeName: 'Tech Corp Acquisition',
    industry: 'Software',
    theme: 'Technology',
    summary: 'Successful tech acquisition',
    arr: '$100M',
    arrNumeric: 100000000,
    currency: 'USD',
    growthStage: 'Scaling Growth',
    year: 2024,
    technologies: ['Node.js', 'React', 'AWS'],
    engagementType: 'Value Creation - Growth',
  },
  {
    id: 'project-2',
    codeName: 'Healthcare Platform',
    industry: 'Healthcare',
    theme: 'Healthcare',
    summary: 'Healthcare management system',
    arr: '€50M',
    arrNumeric: 50000000,
    currency: 'EUR',
    growthStage: 'Mature Enterprise',
    year: 2023,
    technologies: ['Python', 'PostgreSQL', 'AWS'],
    engagementType: 'Value Creation - Modernization',
  },
  {
    id: 'project-3',
    codeName: 'Finance Dashboard',
    industry: 'Finance',
    theme: 'Finance',
    summary: 'Financial analytics dashboard',
    arr: '£75M',
    arrNumeric: 75000000,
    currency: 'GBP',
    growthStage: 'Scaling Growth',
    year: 2024,
    technologies: ['React', 'TypeScript', 'D3.js'],
    engagementType: 'Early Stage Assessment',
  },
  {
    id: 'project-4',
    codeName: 'Logistics Optimizer',
    industry: 'Logistics',
    theme: 'Logistics',
    summary: 'Route optimization engine',
    arr: '$200M',
    arrNumeric: 200000000,
    currency: 'USD',
    growthStage: 'Mature Enterprise',
    year: 2022,
    technologies: ['Go', 'Kubernetes'],
    engagementType: undefined,
  },
];

describe('searchLogic', () => {
  describe('performSearch', () => {
    it('should return all projects for empty search term', () => {
      const result = performSearch(mockProjects, '');
      expect(result).toHaveLength(mockProjects.length);
    });

    it('should return all projects for whitespace-only search term', () => {
      const result = performSearch(mockProjects, '   ');
      expect(result).toHaveLength(mockProjects.length);
    });

    it('should find projects by code name', () => {
      const result = performSearch(mockProjects, 'Tech');
      expect(result).toContainEqual(mockProjects[0]);
    });

    it('should find projects by industry', () => {
      const result = performSearch(mockProjects, 'Healthcare');
      expect(result).toContainEqual(mockProjects[1]);
    });

    it('should find projects by technology', () => {
      const result = performSearch(mockProjects, 'React');
      expect(result).toHaveLength(2); // Projects 1 and 3
      expect(result.map((p) => p.id)).toContain('project-1');
      expect(result.map((p) => p.id)).toContain('project-3');
    });

    it('should find projects by summary text', () => {
      const result = performSearch(mockProjects, 'acquisition');
      expect(result).toContainEqual(mockProjects[0]);
    });

    it('should be case insensitive', () => {
      const result1 = performSearch(mockProjects, 'TECH');
      const result2 = performSearch(mockProjects, 'tech');
      expect(result1).toHaveLength(result2.length);
    });

    it('should handle multiple matching projects', () => {
      const result = performSearch(mockProjects, 'AWS');
      expect(result.length).toBe(2); // Projects 1 and 2
    });

    it('should return empty array for no matches', () => {
      const result = performSearch(mockProjects, 'NonexistentTerm');
      expect(result).toHaveLength(0);
    });
  });

  describe('debounce', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should delay function execution', () => {
      const mockFn = vi.fn();
      const debouncedFn = debounce(mockFn, 300);

      debouncedFn('test');
      expect(mockFn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(299);
      expect(mockFn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(mockFn).toHaveBeenCalledWith('test');
    });

    it('should cancel previous execution if called again', () => {
      const mockFn = vi.fn();
      const debouncedFn = debounce(mockFn, 300);

      debouncedFn('first');
      vi.advanceTimersByTime(100);
      debouncedFn('second');
      vi.advanceTimersByTime(300);

      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith('second');
    });

    it('should handle multiple calls correctly', () => {
      const mockFn = vi.fn();
      const debouncedFn = debounce(mockFn, 300);

      debouncedFn('call1');
      vi.advanceTimersByTime(100);
      debouncedFn('call2');
      vi.advanceTimersByTime(100);
      debouncedFn('call3');
      vi.advanceTimersByTime(300);

      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith('call3');
    });
  });

  describe('createDebouncedSearch', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should create a debounced search with default delay', () => {
      const mockCallback = vi.fn();
      const debouncedSearch = createDebouncedSearch(mockCallback);

      debouncedSearch('test');
      expect(mockCallback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(300);
      expect(mockCallback).toHaveBeenCalledWith('test');
    });

    it('should create a debounced search with custom delay', () => {
      const mockCallback = vi.fn();
      const debouncedSearch = createDebouncedSearch(mockCallback, 100);

      debouncedSearch('test');
      vi.advanceTimersByTime(99);
      expect(mockCallback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(mockCallback).toHaveBeenCalledWith('test');
    });
  });

  describe('highlightSearchTerm', () => {
    it('should highlight search term in text', () => {
      const result = highlightSearchTerm('Hello World', 'World');
      expect(result).toContain('<mark>World</mark>');
    });

    it('should be case insensitive', () => {
      const result = highlightSearchTerm('Hello World', 'world');
      expect(result).toContain('<mark>');
    });

    it('should return unchanged text for empty search term', () => {
      const text = 'Hello World';
      const result = highlightSearchTerm(text, '');
      expect(result).toBe(text);
    });

    it('should highlight multiple occurrences', () => {
      const result = highlightSearchTerm('Tech tech TECH', 'tech');
      const markCount = (result.match(/<mark>/g) || []).length;
      expect(markCount).toBe(3);
    });
  });

  describe('getSearchRelevance', () => {
    it('should give highest score for exact name match', () => {
      const score = getSearchRelevance(mockProjects[0], 'Tech Corp Acquisition');
      expect(score).toBe(100);
    });

    it('should give high score for partial name match', () => {
      const score1 = getSearchRelevance(mockProjects[0], 'Tech');
      const score2 = getSearchRelevance(mockProjects[0], 'Other');
      expect(score1).toBeGreaterThan(score2);
    });

    it('should score based on field matches', () => {
      const score1 = getSearchRelevance(mockProjects[0], 'Tech'); // Matches name
      const score2 = getSearchRelevance(mockProjects[1], 'Healthcare'); // Matches name
      expect(score1).toBeGreaterThan(0);
      expect(score2).toBeGreaterThan(0);
    });

    it('should score technology matches', () => {
      const score = getSearchRelevance(mockProjects[0], 'React');
      expect(score).toBeGreaterThan(0);
    });

    it('should return 0 for empty search term', () => {
      const score = getSearchRelevance(mockProjects[0], '');
      expect(score).toBe(0);
    });

    it('should handle case insensitive matching', () => {
      const score1 = getSearchRelevance(mockProjects[0], 'tech');
      const score2 = getSearchRelevance(mockProjects[0], 'TECH');
      expect(score1).toBe(score2);
    });
  });

  describe('sortBySearchRelevance', () => {
    it('should sort projects by relevance score', () => {
      const searchTerm = 'Tech';
      const result = sortBySearchRelevance(mockProjects, searchTerm);

      // First project should be more relevant (has 'Tech' in name)
      expect(result[0].id).toBe('project-1');
    });

    it('should return original order for empty search term', () => {
      const result = sortBySearchRelevance(mockProjects, '');
      expect(result).toEqual(mockProjects);
    });

    it('should not modify original array', () => {
      const originalProjects = [...mockProjects];
      sortBySearchRelevance(mockProjects, 'Tech');
      expect(mockProjects).toEqual(originalProjects);
    });

    it('should handle projects with same relevance score', () => {
      // sortBySearchRelevance sorts all projects but gives higher scores to matching ones
      const result = sortBySearchRelevance(mockProjects, 'AWS');
      // Projects 1 and 2 have AWS, so they should be at the top
      expect(result.length).toBe(4); // All projects returned, sorted by relevance
      expect([result[0].id, result[1].id]).toContain('project-1');
      expect([result[0].id, result[1].id]).toContain('project-2');
    });

    it('should handle empty project list', () => {
      const result = sortBySearchRelevance([], 'search');
      expect(result).toHaveLength(0);
    });
  });
});
