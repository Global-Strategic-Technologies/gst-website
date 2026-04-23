import { getRegulationsByRegion, buildRegulationIndex } from '@/utils/fetchRegulations';
import type { Regulation } from '@/types/regulatory-map';

// Minimal regulation fixtures for testing the pure grouping function
const makeRegulation = (
  id: string,
  regions: string[],
  overrides?: Partial<Regulation>
): Regulation => ({
  id,
  name: `Regulation ${id}`,
  regions,
  category: 'data-privacy',
  effectiveDate: '2024-01-01',
  summary: `Test regulation ${id}`,
  scope: 'National',
  penalties: 'Fines',
  ...overrides,
});

describe('getRegulationsByRegion', () => {
  it('should group regulations by region code', () => {
    const regs = [makeRegulation('gdpr', ['DEU', 'FRA', 'ITA']), makeRegulation('ccpa', ['US-CA'])];

    const map = getRegulationsByRegion(regs);

    expect(map['DEU']).toHaveLength(1);
    expect(map['DEU'][0].id).toBe('gdpr');
    expect(map['FRA']).toHaveLength(1);
    expect(map['US-CA']).toHaveLength(1);
    expect(map['US-CA'][0].id).toBe('ccpa');
  });

  it('should return multiple regulations for the same region', () => {
    const regs = [makeRegulation('gdpr', ['DEU']), makeRegulation('bdsg', ['DEU'])];

    const map = getRegulationsByRegion(regs);

    expect(map['DEU']).toHaveLength(2);
    expect(map['DEU'].map((r) => r.id)).toContain('gdpr');
    expect(map['DEU'].map((r) => r.id)).toContain('bdsg');
  });

  it('should return empty object for empty input', () => {
    const map = getRegulationsByRegion([]);
    expect(map).toEqual({});
  });

  it('should handle regulation with no regions gracefully', () => {
    const regs = [makeRegulation('orphan', [])];
    const map = getRegulationsByRegion(regs);
    expect(Object.keys(map)).toHaveLength(0);
  });

  it('should handle regulation appearing in many regions', () => {
    const regions = ['DEU', 'FRA', 'ITA', 'ESP', 'NLD', 'BEL', 'AUT'];
    const regs = [makeRegulation('gdpr', regions)];
    const map = getRegulationsByRegion(regs);

    for (const code of regions) {
      expect(map[code]).toHaveLength(1);
      expect(map[code][0].id).toBe('gdpr');
    }
  });
});

describe('buildRegulationIndex', () => {
  it('should produce a lightweight index with region-to-id mapping', () => {
    const regs = [makeRegulation('gdpr', ['DEU', 'FRA']), makeRegulation('ccpa', ['US-CA'])];

    const index = buildRegulationIndex(regs);

    expect(index.regions['DEU']).toEqual(['gdpr']);
    expect(index.regions['FRA']).toEqual(['gdpr']);
    expect(index.regions['US-CA']).toEqual(['ccpa']);
  });

  it('should include only lightweight fields in regs array', () => {
    const regs = [makeRegulation('gdpr', ['DEU'], { summary: 'Full summary text', scope: 'EU' })];

    const index = buildRegulationIndex(regs);

    expect(index.regs).toHaveLength(1);
    expect(index.regs[0]).toEqual({
      id: 'gdpr',
      name: 'Regulation gdpr',
      effectiveDate: '2024-01-01',
      category: 'data-privacy',
      regions: ['DEU'],
    });
    // Should NOT contain summary, scope, penalties, keyRequirements
    expect(index.regs[0]).not.toHaveProperty('summary');
    expect(index.regs[0]).not.toHaveProperty('scope');
    expect(index.regs[0]).not.toHaveProperty('penalties');
  });

  it('should handle multiple regulations per region', () => {
    const regs = [makeRegulation('gdpr', ['DEU']), makeRegulation('bdsg', ['DEU'])];

    const index = buildRegulationIndex(regs);

    expect(index.regions['DEU']).toEqual(['gdpr', 'bdsg']);
    expect(index.regs).toHaveLength(2);
  });

  it('should return empty structures for empty input', () => {
    const index = buildRegulationIndex([]);

    expect(index.regions).toEqual({});
    expect(index.regs).toEqual([]);
  });
});
