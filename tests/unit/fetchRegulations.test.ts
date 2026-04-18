import { getRegulationsByRegion } from '@/utils/fetchRegulations';
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
