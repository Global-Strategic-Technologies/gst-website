import fs from 'fs';
import path from 'path';

interface Project {
  id: string;
  codeName: string;
  industry: string;
  theme: string;
  summary: string;
  arr: string;
  arrNumeric: number;
  currency: string;
  growthStage: string;
  year: number;
  technologies: string[];
  engagementType?: string;
  engagementTypeTag?: string;
  engagementTypeDescription?: string;
  challenge?: string;
  solution?: string;
  engagementCategory?: string;
}

let projects: Project[];

describe('Projects Data Validation', () => {
  beforeAll(() => {
    const projectsPath = path.join(process.cwd(), 'src/data/ma-portfolio/projects.json');
    const rawData = fs.readFileSync(projectsPath, 'utf-8');
    projects = JSON.parse(rawData);
  });

  describe('Data Loading', () => {
    it('should load projects.json successfully', () => {
      expect(projects).toBeDefined();
      expect(Array.isArray(projects)).toBe(true);
    });

    it('should have valid number of projects', () => {
      expect(projects.length).toBeGreaterThan(0);
      expect(projects.length).toBeLessThanOrEqual(60); // Reasonable upper bound
    });
  });

  describe('Schema Validation', () => {
    it('should have all required fields on each project', () => {
      const requiredFields = [
        'id',
        'codeName',
        'industry',
        'theme',
        'summary',
        'arr',
        'arrNumeric',
        'currency',
        'growthStage',
        'year',
        'technologies'
      ];

      projects.forEach((project) => {
        requiredFields.forEach(field => {
          expect(project).toHaveProperty(field);
        });
      });
    });

    it('should have valid id format (slug)', () => {
      const slugRegex = /^[a-z0-9-]+$/;

      projects.forEach((project) => {
        expect(project.id).toMatch(slugRegex);
      });
    });

    it('should have valid codeName (non-empty string)', () => {
      projects.forEach((project) => {
        expect(project.codeName).toBeTruthy();
        expect(typeof project.codeName).toBe('string');
        expect(project.codeName.length).toBeGreaterThan(0);
      });
    });

    it('should have valid industry (non-empty string)', () => {
      projects.forEach((project) => {
        expect(project.industry).toBeTruthy();
        expect(typeof project.industry).toBe('string');
      });
    });

    it('should have valid theme (non-empty string)', () => {
      projects.forEach((project) => {
        expect(project.theme).toBeTruthy();
        expect(typeof project.theme).toBe('string');
      });
    });

    it('should have valid summary (non-empty string)', () => {
      projects.forEach((project) => {
        expect(project.summary).toBeTruthy();
        expect(typeof project.summary).toBe('string');
        expect(project.summary.length).toBeGreaterThan(10);
      });
    });

    it('should have valid arr field (string)', () => {
      projects.forEach((project) => {
        expect(typeof project.arr).toBe('string');
        // ARR field can be "Not in source", "N/A" or contain currency symbol
        const isValidSpecial = project.arr === 'Not in source' || project.arr === 'N/A';
        const startsWithCurrency = /^[$€£¥A]/.test(project.arr);
        expect(isValidSpecial || startsWithCurrency).toBe(true);
      });
    });

    it('should have valid arrNumeric field (number)', () => {
      projects.forEach((project) => {
        expect(typeof project.arrNumeric).toBe('number');
        expect(project.arrNumeric).toBeGreaterThanOrEqual(0);
      });
    });

    it('should have valid currency field', () => {
      const validCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'AUD'];

      projects.forEach((project) => {
        expect(validCurrencies).toContain(project.currency);
      });
    });

    it('should have valid growthStage field', () => {
      projects.forEach((project) => {
        expect(project.growthStage).toBeTruthy();
        expect(typeof project.growthStage).toBe('string');
      });
    });

    it('should have valid year (within reasonable range)', () => {
      const currentYear = new Date().getFullYear();
      const minYear = 2000;

      projects.forEach((project) => {
        expect(typeof project.year).toBe('number');
        expect(project.year).toBeGreaterThanOrEqual(minYear);
        expect(project.year).toBeLessThanOrEqual(currentYear + 1);
      });
    });

    it('should have valid technologies array', () => {
      projects.forEach((project) => {
        expect(Array.isArray(project.technologies)).toBe(true);
        expect(project.technologies.length).toBeGreaterThan(0);

        project.technologies.forEach(tech => {
          expect(typeof tech).toBe('string');
          expect(tech.length).toBeGreaterThan(0);
        });
      });
    });
  });

  describe('Uniqueness Constraints', () => {
    it('should have unique project IDs', () => {
      const ids = projects.map(p => p.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have unique project code names', () => {
      const names = projects.map(p => p.codeName);
      const uniqueNames = new Set(names);

      expect(uniqueNames.size).toBe(names.length);
    });
  });

  describe('Data Integrity', () => {
    it('should have consistent currency symbols in arr field', () => {
      const currencyMap = {
        USD: '$',
        EUR: '€',
        GBP: '£',
        JPY: '¥',
        AUD: 'A$'
      };

      projects.forEach((project) => {
        // Skip special values that don't have currency symbols
        if (project.arr === 'Not in source' || project.arr === 'N/A') {
          return;
        }

        const expectedSymbol = currencyMap[project.currency as keyof typeof currencyMap];
        expect(project.arr).toContain(expectedSymbol);
      });
    });

    it('should have non-negative arrNumeric values', () => {
      projects.forEach((project) => {
        expect(project.arrNumeric).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Technology Tags', () => {
    it('should have no empty technology entries', () => {
      projects.forEach((project) => {
        project.technologies.forEach((tech) => {
          expect(tech.trim()).toBe(tech);
          expect(tech).not.toBe('');
        });
      });
    });

    it('should have reasonable technology list lengths', () => {
      projects.forEach((project) => {
        expect(project.technologies.length).toBeLessThan(50); // No project should have 50+ techs
      });
    });
  });
});
