/**
 * Pins the portfolio's fixed labels to the data (BL-153 Tier B). The page shows
 * `theme`, `growthStage`, `engagementCategory` and `engagementType` translated by
 * key, and the English catalog is the value-to-key map, so a value in
 * `projects.json` with no matching English entry would fail the build. `theme` is
 * a plain string in the schema, so nothing else catches a new one. The catalog
 * parity guard (`npm run test:docs`) then carries each key to es and pt-BR.
 */
import { projects } from '@/data/ma-portfolio';
import { DEFAULT_LOCALE, LOCALES } from '@/i18n/locales';
import {
  LABEL_KINDS,
  labelEntries,
  portfolioLabelIsland,
  portfolioLabeler,
} from '@/lib/portfolio-labels';
import {
  ENGAGEMENT_CATEGORY_VALUES,
  ENGAGEMENT_TYPE_VALUES,
  GROWTH_STAGE_VALUES,
} from '@/schemas/portfolio';

const distinct = (values: (string | undefined)[]): string[] =>
  [...new Set(values.filter((v): v is string => Boolean(v)))].sort();
const english = (kind: (typeof LABEL_KINDS)[number]): string[] =>
  labelEntries(kind)
    .map(([, value]) => value)
    .sort();

describe('portfolio labels', () => {
  it('has exactly one entry per theme in the data, so a new or stale theme fails', () => {
    expect(english('theme')).toEqual(distinct(projects.map((p) => p.theme)));
  });

  it('matches the schema enums exactly', () => {
    expect(english('stage')).toEqual([...GROWTH_STAGE_VALUES].sort());
    expect(english('category')).toEqual([...ENGAGEMENT_CATEGORY_VALUES].sort());
    expect(english('type')).toEqual([...ENGAGEMENT_TYPE_VALUES].sort());
  });

  it('labels every value in the data, in every locale', () => {
    for (const locale of LOCALES) {
      const label = portfolioLabeler(locale);
      for (const p of projects) {
        expect(label('theme', p.theme)).not.toBe('');
        expect(label('stage', p.growthStage)).not.toBe('');
        expect(label('category', p.engagementCategory)).not.toBe('');
        expect(label('type', p.engagementType)).not.toBe('');
      }
    }
  });

  it('leaves English labels equal to the data', () => {
    const label = portfolioLabeler(DEFAULT_LOCALE);
    for (const p of projects) expect(label('theme', p.theme)).toBe(p.theme);
  });

  it('renders nothing for an absent optional value and throws on an unknown one', () => {
    const label = portfolioLabeler(DEFAULT_LOCALE);
    expect(label('type', undefined)).toBe('');
    expect(() => label('theme', 'Not A Theme')).toThrow(/Not A Theme/);
  });

  it('gives the modal island every label, keyed by English value', () => {
    const es = LOCALES.find((l) => l.code === 'es')!;
    const island = portfolioLabelIsland(es);
    expect(Object.keys(island)).toEqual([...LABEL_KINDS]);
    expect(island.theme.Healthcare).toBe(portfolioLabeler(es)('theme', 'Healthcare'));
    expect(Object.keys(island.stage).sort()).toEqual([...GROWTH_STAGE_VALUES].sort());
  });
});
