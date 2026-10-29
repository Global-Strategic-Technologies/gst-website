/**
 * A regulation as an es or pt page receives it (src/lib/regulation-i18n.ts):
 * prose from the `regulatory-map-data` catalog by id, everything else as the
 * English file has it, plus the English name for search and analytics.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_LOCALE, nonDefaultLocales } from '../../src/i18n/locales';
import { catalogFor } from '../../src/i18n/t';
import { localizeRegulation, regulationDataPaths } from '../../src/lib/regulation-i18n';
import { buildRegulationIndex } from '../../src/utils/fetchRegulations';
import type { Regulation } from '../../src/types/regulatory-map';

const read = (file: string): Regulation =>
  JSON.parse(readFileSync(join(process.cwd(), 'src', 'data', 'regulatory-map', file), 'utf8'));

const gdpr = read('EU-GDPR.json');
// The one record enacted but not yet in force, and one of the 8 with a `scope`.
const cccs = read('CA-CCCS.json');
const hia = read('CA-AB-HIA.json');

describe('localizeRegulation', () => {
  it('returns the English record untouched', () => {
    expect(localizeRegulation(gdpr, DEFAULT_LOCALE)).toBe(gdpr);
  });

  for (const locale of nonDefaultLocales()) {
    describe(locale.code, () => {
      const catalog = catalogFor(locale.code, 'regulatory-map-data')!;

      it('swaps every prose field for the catalog, keyed by id', () => {
        const out = localizeRegulation(gdpr, locale);
        expect(out.name).toBe(catalog['reg.eu-gdpr.name']);
        expect(out.summary).toBe(catalog['reg.eu-gdpr.summary']);
        expect(out.penalties).toBe(catalog['reg.eu-gdpr.penalties']);
        expect(out.keyRequirements).toEqual(
          (gdpr.keyRequirements ?? []).map((_, i) => catalog[`reg.eu-gdpr.req.${i + 1}`])
        );
        expect(out.name).not.toBe(gdpr.name);
      });

      it('keeps ids, dates, regions, category and aliases, and adds the English name', () => {
        const out = localizeRegulation(cccs, locale);
        expect(cccs.status).toBe('not-in-force');
        expect(out).toMatchObject({
          id: cccs.id,
          nameEn: cccs.name,
          regions: cccs.regions,
          effectiveDate: cccs.effectiveDate,
          category: cccs.category,
          status: cccs.status,
        });
        expect(out.aliases).toEqual(cccs.aliases);
      });

      it('translates scope only where the record has one', () => {
        expect(hia.scope).toBeTruthy();
        expect(localizeRegulation(hia, locale).scope).toBe(catalog[`reg.${hia.id}.scope`]);
        expect(gdpr.scope).toBeUndefined();
        expect('scope' in localizeRegulation(gdpr, locale)).toBe(false);
      });

      it('carries the English name into the index', () => {
        const [entry] = buildRegulationIndex([localizeRegulation(gdpr, locale)]).regs;
        expect(entry.nameEn).toBe(gdpr.name);
        expect(entry.name).toBe(catalog['reg.eu-gdpr.name']);
      });

      it('serves from its own /data/ paths', () => {
        expect(regulationDataPaths(locale)).toEqual({
          index: `/data/reg-index/${locale.path}.json`,
          base: `/data/regulations/${locale.path}/`,
        });
      });
    });
  }

  it('leaves the English index without nameEn', () => {
    const [entry] = buildRegulationIndex([gdpr]).regs;
    expect('nameEn' in entry).toBe(false);
    expect(regulationDataPaths(DEFAULT_LOCALE)).toEqual({
      index: '/data/reg-index.json',
      base: '/data/regulations/',
    });
  });
});
