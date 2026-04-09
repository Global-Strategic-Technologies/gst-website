import { sortProjectsByYear, sortProjectsByARR, sortProjectsByName } from '@/utils/sort';
import type { Project } from '@/types/portfolio';

describe('Sort Projects Utility', () => {
  const mockProjects: Project[] = [
    { id: '1', codeName: 'Project Alpha', year: 2022, arrNumeric: 50000000, industry: '', theme: '', summary: '', arr: '', currency: 'USD', growthStage: '', technologies: [], engagementType: undefined },
    { id: '2', codeName: 'Project Beta', year: 2024, arrNumeric: 100000000, industry: '', theme: '', summary: '', arr: '', currency: 'USD', growthStage: '', technologies: [], engagementType: undefined },
    { id: '3', codeName: 'Project Gamma', year: 2023, arrNumeric: 75000000, industry: '', theme: '', summary: '', arr: '', currency: 'USD', growthStage: '', technologies: [], engagementType: undefined },
    { id: '4', codeName: 'Project Delta', year: 2025, arrNumeric: 150000000, industry: '', theme: '', summary: '', arr: '', currency: 'USD', growthStage: '', technologies: [], engagementType: undefined },
  ];

  describe('sortProjectsByYear', () => {
    it('should sort projects by year in descending order (most recent first)', () => {
      const sorted = sortProjectsByYear(mockProjects);

      expect(sorted[0].year).toBe(2025);
      expect(sorted[1].year).toBe(2024);
      expect(sorted[2].year).toBe(2023);
      expect(sorted[3].year).toBe(2022);
    });

    it('should not mutate the original array', () => {
      const original = [...mockProjects];
      const sorted = sortProjectsByYear(mockProjects);

      expect(mockProjects).toEqual(original);
      expect(sorted).not.toBe(mockProjects);
    });

    it('should maintain project identity through sort', () => {
      const sorted = sortProjectsByYear(mockProjects);

      const ids = sorted.map(p => p.id);
      expect(ids).toContain('1');
      expect(ids).toContain('2');
      expect(ids).toContain('3');
      expect(ids).toContain('4');
    });

    it('should handle single project', () => {
      const single = [mockProjects[0]];
      const sorted = sortProjectsByYear(single);

      expect(sorted.length).toBe(1);
      expect(sorted[0]).toEqual(mockProjects[0]);
    });

    it('should handle empty array', () => {
      const sorted = sortProjectsByYear([]);
      expect(sorted).toEqual([]);
    });

    it('should handle projects with same year', () => {
      const sameYear = [
        { id: '1', codeName: 'Alpha', year: 2024, arrNumeric: 50000000 },
        { id: '2', codeName: 'Beta', year: 2024, arrNumeric: 100000000 },
        { id: '3', codeName: 'Gamma', year: 2023, arrNumeric: 75000000 },
      ];

      const sorted = sortProjectsByYear(sameYear);

      expect(sorted[0].year).toBe(2024);
      expect(sorted[1].year).toBe(2024);
      expect(sorted[2].year).toBe(2023);
    });
  });

  describe('sortProjectsByARR', () => {
    it('should sort projects by ARR in descending order (highest first)', () => {
      const sorted = sortProjectsByARR(mockProjects);

      expect(sorted[0].arrNumeric).toBe(150000000);
      expect(sorted[1].arrNumeric).toBe(100000000);
      expect(sorted[2].arrNumeric).toBe(75000000);
      expect(sorted[3].arrNumeric).toBe(50000000);
    });

    it('should not mutate the original array', () => {
      const original = [...mockProjects];
      const sorted = sortProjectsByARR(mockProjects);

      expect(mockProjects).toEqual(original);
      expect(sorted).not.toBe(mockProjects);
    });

    it('should handle projects with zero ARR', () => {
      const withZero = [
        { id: '1', codeName: 'Alpha', year: 2024, arrNumeric: 50000000 },
        { id: '2', codeName: 'Beta', year: 2024, arrNumeric: 0 },
        { id: '3', codeName: 'Gamma', year: 2023, arrNumeric: 100000000 },
      ];

      const sorted = sortProjectsByARR(withZero);

      expect(sorted[0].arrNumeric).toBe(100000000);
      expect(sorted[1].arrNumeric).toBe(50000000);
      expect(sorted[2].arrNumeric).toBe(0);
    });

    it('should handle projects with missing arrNumeric', () => {
      const withMissing = [
        { id: '1', codeName: 'Alpha', year: 2024, arrNumeric: 50000000 },
        { id: '2', codeName: 'Beta', year: 2024 } as any,
        { id: '3', codeName: 'Gamma', year: 2023, arrNumeric: 100000000 },
      ];

      const sorted = sortProjectsByARR(withMissing);

      // Should not throw and should place undefined/null values at the end
      expect(sorted.length).toBe(3);
      expect(sorted[0].arrNumeric).toBe(100000000);
    });

    it('should handle empty array', () => {
      const sorted = sortProjectsByARR([]);
      expect(sorted).toEqual([]);
    });
  });

  describe('sortProjectsByName', () => {
    it('should sort projects by code name in ascending alphabetical order', () => {
      const sorted = sortProjectsByName(mockProjects);

      expect(sorted[0].codeName).toBe('Project Alpha');
      expect(sorted[1].codeName).toBe('Project Beta');
      expect(sorted[2].codeName).toBe('Project Delta');
      expect(sorted[3].codeName).toBe('Project Gamma');
    });

    it('should not mutate the original array', () => {
      const original = [...mockProjects];
      const sorted = sortProjectsByName(mockProjects);

      expect(mockProjects).toEqual(original);
      expect(sorted).not.toBe(mockProjects);
    });

    it('should handle case-insensitive sorting', () => {
      const mixedCase = [
        { id: '1', codeName: 'zebra', year: 2024, arrNumeric: 50000000 },
        { id: '2', codeName: 'Apple', year: 2024, arrNumeric: 100000000 },
        { id: '3', codeName: 'Banana', year: 2023, arrNumeric: 75000000 },
      ];

      const sorted = sortProjectsByName(mixedCase);

      // localeCompare is case-insensitive by default
      expect(sorted[0].codeName.toLowerCase()).toBe('apple');
    });

    it('should handle projects with similar names', () => {
      const similar = [
        { id: '1', codeName: 'Project App', year: 2024, arrNumeric: 50000000 },
        { id: '2', codeName: 'Project Append', year: 2024, arrNumeric: 100000000 },
        { id: '3', codeName: 'Project Apple', year: 2023, arrNumeric: 75000000 },
      ];

      const sorted = sortProjectsByName(similar);

      // Should maintain correct alphabetical order
      expect(sorted[0].codeName).toBe('Project App');
      expect(sorted[1].codeName).toBe('Project Append');
      expect(sorted[2].codeName).toBe('Project Apple');
    });

    it('should handle empty array', () => {
      const sorted = sortProjectsByName([]);
      expect(sorted).toEqual([]);
    });
  });

});
