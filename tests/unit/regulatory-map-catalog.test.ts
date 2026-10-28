/**
 * The Regulatory Map's two mirror catalogs stay faithful copies of their
 * English sources (BL-153 Tier B), both ways — nothing missing, nothing extra:
 *
 * - `regulatory-map-data` mirrors the regulation files, which stay English
 *   because the MCP server returns them verbatim. When a regulation changes,
 *   this fails until `npm run i18n:sync-regulatory-map` rewrites the mirror;
 *   then the es and pt-BR sidecars go stale (`npm run test:docs`) until the
 *   text is retranslated and re-stamped.
 * - `regulatory-map-geo` mirrors the region-name maps the page script bundles
 *   as its English fallback.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import DATA_EN from '../../src/i18n/en/regulatory-map-data.json';
import GEO_EN from '../../src/i18n/en/regulatory-map-geo.json';
import { alpha3ToName } from '../../src/utils/countryCodeMap';
import { stateCodeToName } from '../../src/utils/fipsToStateCode';
import { provinceCodeToName } from '../../src/utils/canadianProvinceMap';
import { catalogFromRegulations } from '../../scripts/sync-regulatory-map-catalog.mjs';

const DATA_DIR = join(process.cwd(), 'src', 'data', 'regulatory-map');

describe('regulatory-map-data mirrors the regulation files', () => {
  const regulations = readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(DATA_DIR, f), 'utf8')));
  const expected = catalogFromRegulations(regulations) as Record<string, string>;

  it('has every key the files imply, with the same English', () => {
    for (const [key, english] of Object.entries(expected)) {
      expect(
        (DATA_EN as Record<string, string>)[key],
        `${key} is stale: run npm run i18n:sync-regulatory-map`
      ).toBe(english);
    }
  });

  it('has nothing else, in the order the sync script writes', () => {
    expect(Object.keys(DATA_EN)).toEqual(Object.keys(expected));
  });

  it('covers every regulation', () => {
    const ids = new Set(Object.keys(DATA_EN).map((key) => key.split('.')[1]));
    expect(ids.size).toBe(regulations.length);
  });
});

describe('regulatory-map-geo mirrors the region-name maps', () => {
  const expected: Record<string, string> = {};
  for (const map of [alpha3ToName, stateCodeToName, provinceCodeToName]) {
    for (const [code, name] of Object.entries(map)) expected[`region.${code}`] = name;
  }

  it('has every region, with the same English name', () => {
    for (const [key, name] of Object.entries(expected)) {
      expect((GEO_EN as Record<string, string>)[key], key).toBe(name);
    }
  });

  it('has nothing else', () => {
    expect(Object.keys(GEO_EN).sort()).toEqual(Object.keys(expected).sort());
  });
});
