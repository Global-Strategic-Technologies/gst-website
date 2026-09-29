import {
  buildSearchIndex,
  filterRegionMap,
  renderRegulationCard,
  renderSearchResultRows,
  renderTimelineGroups,
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
    effectiveDate: '2024-03-01', // bare YYYY-MM-DD, as every data file stores it
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

  it('prints the stored date in every time zone', () => {
    // A bare date parses as UTC midnight; west of UTC it used to print a day early.
    const saved = process.env.TZ;
    try {
      for (const tz of ['America/Los_Angeles', 'UTC', 'Asia/Tokyo']) {
        process.env.TZ = tz;
        expect(renderRegulationCard(reg), tz).toContain('Effective: March 1, 2024');
      }
    } finally {
      if (saved === undefined) delete process.env.TZ;
      else process.env.TZ = saved;
    }
  });

  it('prints the optional sections when present', () => {
    const html = renderRegulationCard(reg);
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

describe('regulatory map logic — renderSearchResultRows', () => {
  it('prints each match with its category chip and a pluralised region count', () => {
    const html = renderSearchResultRows(REGS);
    expect(html).toContain('id="search-result-0"');
    expect(html).toContain('brutal-search__category--privacy">Privacy</span>');
    expect(html).toContain('brutal-search__category--ai">AI</span>');
    expect(html).toContain('>2 regions<');
    expect(html).toContain('>1 region<');
  });

  it('caps the list at 15 and counts the rest', () => {
    const many = Array.from({ length: 18 }, (_, i) => ({ ...REGS[0], id: `r${i}` }));
    const html = renderSearchResultRows(many);
    expect(html.match(/role="option"/g)).toHaveLength(15);
    expect(html).toContain('3 more results…');
    expect(renderSearchResultRows(many.slice(0, 15))).not.toContain('more results');
  });

  it('escapes an unknown category, which falls back to its raw id', () => {
    const odd = { ...REGS[0], category: '<b>new</b>' };
    const html = renderSearchResultRows([odd]);
    expect(html).toContain('brutal-search__category--privacy">&lt;b&gt;new&lt;/b&gt;</span>');
  });
});

describe('regulatory map logic — renderTimelineGroups', () => {
  const sorted = sortByEffectiveDate(REGS); // 2018, 2020, 2026

  it('groups entries by year, in the order given', () => {
    const html = renderTimelineGroups(sorted, '2025-01-01');
    const years = [...html.matchAll(/brutal-timeline-year">(\d{4})</g)].map((m) => m[1]);
    expect(years).toEqual(['2018', '2020', '2026']);
  });

  it('marks entries after today as upcoming, and none on or before it', () => {
    const html = renderTimelineGroups(sorted, '2025-01-01');
    expect(html.match(/brutal-timeline-entry--upcoming/g)).toHaveLength(1);
    expect(renderTimelineGroups(sorted, '2026-06-30')).not.toContain('--upcoming');
  });

  it('reads the month from the string, so no time zone shifts it', () => {
    expect(renderTimelineGroups(sorted, '2025-01-01')).toContain('May 2018</span>');
  });

  it('cuts names over 35 characters to 33 plus an ellipsis, keeping the full name in the label', () => {
    const long = { ...REGS[0], name: 'A'.repeat(36) };
    const html = renderTimelineGroups([long], '2025-01-01');
    expect(html).toContain(`>${'A'.repeat(33)}…</span>`);
    expect(html).toContain(`aria-label="${'A'.repeat(36)}, May 2018"`);
    const exact = renderTimelineGroups([{ ...long, name: 'B'.repeat(35) }], '2025-01-01');
    expect(exact).toContain(`>${'B'.repeat(35)}</span>`);
  });

  it('escapes names', () => {
    const html = renderTimelineGroups([{ ...REGS[0], name: 'X <i>' }], '2025-01-01');
    expect(html).toContain('X &lt;i&gt;');
    expect(html).not.toContain('<i>');
  });
});
