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
  createSearchableText,
  filterProjects,
  type FilterCriteria
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
    engagementType: 'Value Creation - Growth'
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
    engagementType: 'Value Creation - Modernization'
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
    engagementType: 'Early Stage Assessment'
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
    engagementType: undefined
  }
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
      expect(categorizeEngagementType('Value Creation - Growth')).toBe('value-creation');
      expect(categorizeEngagementType('Value Creation - Integration')).toBe('value-creation');
    });

    it('should categorize technical diligence types', () => {
      expect(categorizeEngagementType('Early Stage Assessment')).toBe('technical-diligence');
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
      expect(types).toContain('Value Creation - Growth');
      expect(types).toContain('Early Stage Assessment');
      expect(types.length).toBe(3); // Excludes undefined
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

    it('should handle projects with string technologies', () => {
      const projectWithStringTechs = { ...mockProjects[0], technologies: 'Node.js, React' as any };
      const text = createSearchableText(projectWithStringTechs);
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

  describe('filterProjects', () => {
    const criteria: FilterCriteria = {
      search: '',
      stage: 'all',
      theme: 'all',
      year: 'all',
      engagement: 'all'
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

    it('should filter by year', () => {
      const yearCriteria = { ...criteria, year: '2024' };
      const result = filterProjects(mockProjects, yearCriteria);
      expect(result.length).toBe(2);
      expect(result.map(p => p.year)).toEqual([2024, 2024]);
    });

    it('should filter by growth stage category', () => {
      const growthStages = getGrowthStageProjects(mockProjects);
      const matureStages = getMatureStageProjects(mockProjects);
      const stageCriteria = { ...criteria, stage: 'growth-category' };
      const result = filterProjects(mockProjects, stageCriteria, growthStages, matureStages);
      expect(result.length).toBeGreaterThan(0);
      expect(result.every(p => growthStages.includes(p.growthStage))).toBe(true);
    });

    it('should filter by value creation engagement type', () => {
      const engagementCriteria = { ...criteria, engagement: 'value-creation' };
      const result = filterProjects(mockProjects, engagementCriteria);
      expect(result.length).toBe(2);
      expect(result.map(p => p.id)).toEqual(['project-1', 'project-2']);
    });

    it('should filter by technical diligence engagement type', () => {
      const engagementCriteria = { ...criteria, engagement: 'technical-diligence' };
      const result = filterProjects(mockProjects, engagementCriteria);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('project-3');
    });

    it('should combine multiple filters (intersection)', () => {
      const multiCriteria: FilterCriteria = {
        search: '',
        stage: 'all',
        theme: 'Healthcare',
        year: '2023',
        engagement: 'all'
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
      expect(ENGAGEMENT_CATEGORIES.valueCreation).toContain('Value Creation - Growth');
      expect(ENGAGEMENT_CATEGORIES.technicalDiligence).toContain('Early Stage Assessment');
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
});
