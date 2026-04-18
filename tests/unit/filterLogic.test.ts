import {
  ENGAGEMENT_CATEGORIES,
  GROWTH_KEYWORDS,
  MATURE_KEYWORDS,
  categorizeGrowthStage,
  categorizeEngagementType,
  getUniqueGrowthStages,
  getGrowthStageProjects,
  getMatureStageProjects,
  getUniqueThemes,
  getUniqueYears,
  getUniqueEngagementTypes,
  getUniqueEngagementCategories,
  createSearchableText,
  filterProjects,
  computeAvailableChips,
  type FilterCriteria,
} from '@/utils/filterLogic';
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
    growthStage: 'Early-Stage Growth',
    year: 2024,
    technologies: ['Node.js', 'React'],
    engagementType: 'Value Creation',
    engagementCategory: 'Sell-Side',
  },
  {
    id: 'project-2',
    codeName: 'Healthcare Modernization',
    industry: 'Healthcare',
    theme: 'Healthcare',
    summary: 'Legacy system modernization',
    arr: '€50M',
    arrNumeric: 50000000,
    currency: 'EUR',
    growthStage: 'Mature Enterprise',
    year: 2023,
    technologies: ['Python', 'AWS'],
    engagementType: 'Value Creation',
    engagementCategory: 'Sell-Side',
  },
  {
    id: 'project-3',
    codeName: 'FinTech Assessment',
    industry: 'Finance',
    theme: 'Finance',
    summary: 'Technical diligence for investment',
    arr: '£75M',
    arrNumeric: 75000000,
    currency: 'GBP',
    growthStage: 'Scaling Growth',
    year: 2024,
    technologies: ['Go', 'Kubernetes'],
    engagementType: 'Technical Diligence',
    engagementCategory: 'Buy-Side',
  },
  {
    id: 'project-4',
    codeName: 'Logistics Platform',
    industry: 'Logistics',
    theme: 'Logistics',
    summary: 'Supply chain optimization',
    arr: '$200M',
    arrNumeric: 200000000,
    currency: 'USD',
    growthStage: 'Established Market Leader',
    year: 2022,
    technologies: ['Java', 'Microservices'],
    engagementType: undefined,
    engagementCategory: 'Sell-Side',
  },
];

describe('filterLogic', () => {
  describe('categorizeGrowthStage', () => {
    it('should categorize growth stages correctly', () => {
      expect(categorizeGrowthStage('Early-Stage Growth')).toBe('growth');
      expect(categorizeGrowthStage('Scaling Growth')).toBe('growth');
      expect(categorizeGrowthStage('Expansion Stage')).toBe('growth');
    });

    it('should categorize mature stages correctly', () => {
      expect(categorizeGrowthStage('Mature Enterprise')).toBe('mature');
      expect(categorizeGrowthStage('Established Market Leader')).toBe('mature');
      expect(categorizeGrowthStage('Legacy System')).toBe('mature');
    });

    it('should categorize unknown stages as other', () => {
      expect(categorizeGrowthStage('Unknown Stage')).toBe('other');
      expect(categorizeGrowthStage('Mid-Market')).toBe('other');
    });

    it('should be case insensitive', () => {
      expect(categorizeGrowthStage('EARLY-STAGE GROWTH')).toBe('growth');
      expect(categorizeGrowthStage('mature enterprise')).toBe('mature');
    });
  });

  describe('categorizeEngagementType', () => {
    it('should categorize value creation types', () => {
      expect(categorizeEngagementType('Value Creation')).toBe('value-creation');
    });

    it('should categorize technical diligence types', () => {
      expect(categorizeEngagementType('Technical Diligence')).toBe('technical-diligence');
      expect(categorizeEngagementType('Technical Assessment')).toBe('technical-diligence');
    });

    it('should handle undefined engagement type', () => {
      expect(categorizeEngagementType(undefined)).toBe('other');
    });

    it('should categorize unknown types as other', () => {
      expect(categorizeEngagementType('Unknown Type')).toBe('other');
    });
  });

  describe('getUniqueGrowthStages', () => {
    it('should extract unique growth stages from projects', () => {
      const stages = getUniqueGrowthStages(mockProjects);
      expect(stages).toContain('Early-Stage Growth');
      expect(stages).toContain('Mature Enterprise');
      expect(stages).toContain('Scaling Growth');
      expect(stages).toHaveLength(4);
    });

    it('should handle empty project list', () => {
      expect(getUniqueGrowthStages([])).toEqual([]);
    });
  });

  describe('getGrowthStageProjects', () => {
    it('should filter and sort growth stage projects', () => {
      const growthStages = getGrowthStageProjects(mockProjects);
      expect(growthStages).toContain('Early-Stage Growth');
      expect(growthStages).toContain('Scaling Growth');
      expect(growthStages).not.toContain('Mature Enterprise');
      expect(growthStages.length).toBeLessThan(4);
    });
  });

  describe('getMatureStageProjects', () => {
    it('should filter and sort mature stage projects', () => {
      const matureStages = getMatureStageProjects(mockProjects);
      expect(matureStages).toContain('Mature Enterprise');
      expect(matureStages).toContain('Established Market Leader');
      expect(matureStages.length).toBeLessThan(4);
    });
  });

  describe('getUniqueThemes', () => {
    it('should extract and sort unique themes', () => {
      const themes = getUniqueThemes(mockProjects);
      expect(themes).toContain('Technology');
      expect(themes).toContain('Healthcare');
      expect(themes.length).toBe(4);
      expect(themes).toEqual([...themes].sort()); // Verify sorted
    });
  });

  describe('getUniqueYears', () => {
    it('should extract and sort years in descending order', () => {
      const years = getUniqueYears(mockProjects);
      expect(years).toContain(2024);
      expect(years).toContain(2022);
      expect(years[0]).toBe(2024); // Most recent first
      expect(years).toEqual([...years].sort((a, b) => b - a)); // Verify descending
    });
  });

  describe('getUniqueEngagementTypes', () => {
    it('should extract and sort unique engagement types', () => {
      const types = getUniqueEngagementTypes(mockProjects);
      expect(types).toContain('Value Creation');
      expect(types).toContain('Technical Diligence');
      expect(types.length).toBe(2); // Excludes undefined; project-1 and project-2 share 'Value Creation'
    });

    it('should handle projects without engagement types', () => {
      const types = getUniqueEngagementTypes(mockProjects);
      expect(types).not.toContain(undefined);
    });
  });

  describe('createSearchableText', () => {
    it('should combine searchable text from project fields', () => {
      const text = createSearchableText(mockProjects[0]);
      expect(text).toContain('tech corp acquisition');
      expect(text).toContain('software');
      expect(text).toContain('successful tech acquisition');
      expect(text).toContain('node.js');
      expect(text).toContain('react');
    });

    it('should handle projects without technologies', () => {
      const projectNoTechs = { ...mockProjects[0], technologies: [] };
      const text = createSearchableText(projectNoTechs);
      expect(text).toBeTruthy();
    });

    it('should return lowercase text', () => {
      const text = createSearchableText(mockProjects[0]);
      expect(text).toBe(text.toLowerCase());
    });
  });

  describe('getUniqueEngagementCategories', () => {
    it('should extract and sort unique engagement categories', () => {
      const categories = getUniqueEngagementCategories(mockProjects);
      expect(categories).toContain('Buy-Side');
      expect(categories).toContain('Sell-Side');
      expect(categories.length).toBe(2);
      expect(categories).toEqual([...categories].sort());
    });

    it('should handle empty project list', () => {
      expect(getUniqueEngagementCategories([])).toEqual([]);
    });
  });

  describe('filterProjects', () => {
    const criteria: FilterCriteria = {
      search: '',
      theme: 'all',
      engagement: 'all',
    };

    it('should return all projects with default criteria', () => {
      const result = filterProjects(mockProjects, criteria);
      expect(result).toHaveLength(mockProjects.length);
    });

    it('should filter by search term', () => {
      const searchCriteria = { ...criteria, search: 'Tech' };
      const result = filterProjects(mockProjects, searchCriteria);
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContainEqual(mockProjects[0]);
    });

    it('should filter by theme', () => {
      const themeCriteria = { ...criteria, theme: 'Technology' };
      const result = filterProjects(mockProjects, themeCriteria);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('project-1');
    });

    it('should filter by engagement category Sell-Side', () => {
      const engagementCriteria = { ...criteria, engagement: 'Sell-Side' };
      const result = filterProjects(mockProjects, engagementCriteria);
      expect(result.length).toBe(3);
      expect(result.map((p) => p.id)).toEqual(['project-1', 'project-2', 'project-4']);
    });

    it('should filter by engagement category Buy-Side', () => {
      const engagementCriteria = { ...criteria, engagement: 'Buy-Side' };
      const result = filterProjects(mockProjects, engagementCriteria);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('project-3');
    });

    it('should combine multiple filters (intersection)', () => {
      const multiCriteria: FilterCriteria = {
        search: '',
        theme: 'Healthcare',
        engagement: 'Sell-Side',
      };
      const result = filterProjects(mockProjects, multiCriteria);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('project-2');
    });

    it('should handle case-insensitive search', () => {
      const searchCriteria = { ...criteria, search: 'HEALTHCARE' };
      const result = filterProjects(mockProjects, searchCriteria);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return empty array when no projects match', () => {
      const nomatchCriteria = { ...criteria, search: 'NonexistentTerm' };
      const result = filterProjects(mockProjects, nomatchCriteria);
      expect(result).toHaveLength(0);
    });
  });

  describe('Constants', () => {
    it('should export engagement categories', () => {
      expect(ENGAGEMENT_CATEGORIES.valueCreation).toContain('Value Creation');
      expect(ENGAGEMENT_CATEGORIES.technicalDiligence).toContain('Technical Diligence');
    });

    it('should export growth keywords', () => {
      expect(GROWTH_KEYWORDS).toContain('growth');
      expect(GROWTH_KEYWORDS).toContain('expansion');
    });

    it('should export mature keywords', () => {
      expect(MATURE_KEYWORDS).toContain('mature');
      expect(MATURE_KEYWORDS).toContain('enterprise');
    });
  });

  describe('computeAvailableChips', () => {
    it('returns all values when no filters are active', () => {
      const criteria: FilterCriteria = { search: '', theme: 'all', engagement: 'all' };
      const available = computeAvailableChips(mockProjects, criteria);
      expect(available.theme.size).toBeGreaterThan(0);
      expect(available.engagement.size).toBeGreaterThan(0);
    });

    it('narrows theme options when engagement filter is active', () => {
      const allCriteria: FilterCriteria = { search: '', theme: 'all', engagement: 'all' };
      const allAvailable = computeAvailableChips(mockProjects, allCriteria);

      const filteredCriteria: FilterCriteria = { search: '', theme: 'all', engagement: 'Buy-Side' };
      const filteredAvailable = computeAvailableChips(mockProjects, filteredCriteria);

      expect(filteredAvailable.theme.size).toBeLessThanOrEqual(allAvailable.theme.size);
    });

    it('narrows engagement options when theme filter is active', () => {
      const criteria: FilterCriteria = { search: '', theme: 'Technology', engagement: 'all' };
      const available = computeAvailableChips(mockProjects, criteria);

      // Only engagement categories that have Technology-themed projects
      for (const cat of available.engagement) {
        const hasMatch = mockProjects.some(
          (p) => p.theme === 'Technology' && p.engagementCategory === cat
        );
        expect(hasMatch, `${cat} should have Technology-themed projects`).toBe(true);
      }
    });

    it('narrows both dimensions when search is active', () => {
      const criteria: FilterCriteria = { search: 'React', theme: 'all', engagement: 'all' };
      const available = computeAvailableChips(mockProjects, criteria);

      // Only projects with React in searchable text should contribute
      const reactProjects = mockProjects.filter((p) => createSearchableText(p).includes('react'));
      const expectedThemes = new Set(reactProjects.map((p) => p.theme));
      expect(available.theme).toEqual(expectedThemes);
    });
  });
});
