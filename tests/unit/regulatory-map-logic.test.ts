import {
  buildSearchIndex,
  filterRegionMap,
  renderRegulationCard,
  searchRegulations,
  sortByEffectiveDate,
  type RegIndexEntry,
} from '../../src/scripts/regulatory-map/logic';
import type { Regulation } from '../../src/types/regulatory-map';

const REGS: RegIndexEntry[] = [
  {
    id: 'gdpr',
    name: 'General Data Protection Regulation',
    aliases: ['GDPR'],
    effectiveDate: '2018-05-25',
    category: 'data-privacy',
    regions: ['AUT', 'DEU'],
  },
  {
    id: 'co-ai',
    name: 'Colorado Artificial Intelligence Act',
    aliases: ['SB24-205', 'Colorado AI Act'],
    effectiveDate: '2026-06-30',
    category: 'ai-governance',
    regions: ['US-CO'],
  },
  {
    id: 'ccpa',
    name: 'California Consumer Privacy Act',
    effectiveDate: '2020-01-01',
    category: 'data-privacy',
    regions: ['US-CA'],
  },
];
const byId = Object.fromEntries(REGS.map((r) => [r.id, r]));
const index = buildSearchIndex(REGS);
const ids = (rs: RegIndexEntry[]) => rs.map((r) => r.id);

describe('regulatory map logic — searchRegulations', () => {
  it('matches names and aliases, case-insensitively', () => {
    expect(ids(searchRegulations(index, 'gdpr', 'all'))).toEqual(['gdpr']);
    expect(ids(searchRegulations(index, 'colorado ai act', 'all'))).toEqual(['co-ai']);
  });

  it('requires every term, in any order', () => {
    expect(ids(searchRegulations(index, 'privacy california', 'all'))).toEqual(['ccpa']);
    expect(searchRegulations(index, 'privacy colorado', 'all')).toEqual([]);
  });

  it('keeps to the active category unless it is "all"', () => {
    expect(ids(searchRegulations(index, 'act', 'all'))).toEqual(['co-ai', 'ccpa']);
    expect(ids(searchRegulations(index, 'act', 'data-privacy'))).toEqual(['ccpa']);
  });

  it('returns nothing for a blank query', () => {
    expect(searchRegulations(index, '   ', 'all')).toEqual([]);
  });
});

describe('regulatory map logic — filterRegionMap', () => {
  const regionMap = { DEU: ['gdpr'], 'US-CA': ['ccpa'], 'US-CO': ['co-ai'], AUT: ['gdpr'] };

  it('returns the map itself for "all"', () => {
    expect(filterRegionMap(regionMap, byId, 'all')).toBe(regionMap);
  });

  it('keeps only regions with a regulation in the category', () => {
    expect(filterRegionMap(regionMap, byId, 'ai-governance')).toEqual({ 'US-CO': ['co-ai'] });
    expect(Object.keys(filterRegionMap(regionMap, byId, 'data-privacy')).sort()).toEqual([
      'AUT',
      'DEU',
      'US-CA',
    ]);
  });

  it('drops ids the index does not know', () => {
    expect(filterRegionMap({ FRA: ['unknown'] }, byId, 'data-privacy')).toEqual({});
  });
});

describe('regulatory map logic — sortByEffectiveDate', () => {
  it('orders oldest first and leaves the input untouched', () => {
    const input = [...REGS];
    expect(ids(sortByEffectiveDate(input))).toEqual(['gdpr', 'ccpa', 'co-ai']);
    expect(ids(input)).toEqual(['gdpr', 'co-ai', 'ccpa']);
  });
});

describe('regulatory map logic — renderRegulationCard', () => {
  const reg = {
    id: 'x',
    name: 'Act <b>One</b>',
    effectiveDate: '2024-03-01T12:00:00Z',
    category: 'data-privacy',
    regions: ['DEU'],
    summary: 'Summary & detail',
    scope: 'Controllers',
    keyRequirements: ['Notify', '<script>'],
    penalties: 'Fines',
  } as unknown as Regulation;

  it('escapes every field it prints', () => {
    const html = renderRegulationCard(reg);
    expect(html).toContain('Act &lt;b&gt;One&lt;/b&gt;');
    expect(html).toContain('Summary &amp; detail');
    expect(html).toContain('<li>&lt;script&gt;</li>');
    expect(html).not.toContain('<b>');
  });

  it('prints the long-form date and the optional sections when present', () => {
    const html = renderRegulationCard(reg);
    expect(html).toContain('Effective: March 1, 2024');
    expect(html).toContain('Applies to: Controllers');
    expect(html).toContain('Penalties: Fines');
    expect(html.match(/<li>/g)).toHaveLength(2);
  });

  it('omits the optional sections when absent', () => {
    const html = renderRegulationCard({
      ...reg,
      scope: undefined,
      keyRequirements: [],
      penalties: undefined,
    } as unknown as Regulation);
    expect(html).not.toContain('Applies to');
    expect(html).not.toContain('<ul');
    expect(html).not.toContain('Penalties');
  });
});
