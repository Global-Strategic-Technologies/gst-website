// @vitest-environment jsdom
/**
 * Regulatory Map script words on an es or pt page (BL-153 Tier B): the
 * `data-rm-strings` island beats the English fallbacks — the `regulatory-map`
 * catalog for the script's words, the TypeScript name maps for regions — and
 * dates follow `<html lang>`. The English rendering, with no island, is
 * `regulatory-map-logic.test.ts`.
 */
import {
  buildSearchIndex,
  regionName,
  regionNameEn,
  renderRegulationCard,
  renderSearchResultRows,
  renderTimelineGroups,
  searchRegulations,
  type RegIndexEntry,
} from '../../src/scripts/regulatory-map/logic';
import { resetStringsForTest } from '../../src/scripts/regulatory-map/strings';
import type { Regulation } from '../../src/types/regulatory-map';

function island(strings: Record<string, string>, lang: string) {
  document.documentElement.lang = lang;
  document.body.innerHTML = `<script type="application/json" data-rm-strings>${JSON.stringify(strings)}</script>`;
  resetStringsForTest();
}

afterEach(() => {
  document.body.innerHTML = '';
  document.documentElement.lang = '';
  resetStringsForTest();
});

const REG: Regulation = {
  id: 'eu-gdpr',
  name: 'Reglamento General de Protección de Datos (GDPR)',
  regions: ['DEU'],
  effectiveDate: '2018-05-25',
  summary: 'Resumen.',
  category: 'data-privacy',
  keyRequirements: ['Requisito'],
  penalties: 'Multas',
};

describe('Regulatory Map logic — reads the island when there is one', () => {
  it('names a region from the island, and keeps the English name for analytics', () => {
    island({ 'region.DEU': 'Alemania', 'region.US-NY': 'Nueva York' }, 'es');
    expect(regionName('DEU')).toBe('Alemania');
    expect(regionName('US-NY')).toBe('Nueva York');
    expect(regionNameEn('DEU')).toBe('Germany');
    // A code the island lacks falls back to English.
    expect(regionName('FRA')).toBe('France');
  });

  it('renders the card in the page language', () => {
    island(
      {
        'js.card.effective': 'Vigencia: {date}',
        'js.card.penalties': 'Sanciones: {penalties}',
      },
      'es'
    );
    const html = renderRegulationCard(REG);
    expect(html).toContain('Vigencia: 25 de mayo de 2018');
    expect(html).toContain('Sanciones: Multas');
  });

  it('dates the timeline in the page language', () => {
    island({}, 'pt-BR');
    const html = renderTimelineGroups([{ ...REG, regions: ['DEU'] }], '2026-01-01');
    expect(html).toMatch(/mai\.? de 2018/);
    expect(html).not.toContain('May 2018');
  });

  it('labels category chips and counts from the island', () => {
    island(
      {
        'js.category.data-privacy': 'Privacidad',
        'js.regionCount.one': '{count} región',
        'js.regionCount.other': '{count} regiones',
      },
      'es'
    );
    const html = renderSearchResultRows([{ ...REG, regions: ['DEU', 'FRA'] }]);
    expect(html).toContain('>Privacidad<');
    expect(html).toContain('2 regiones');
  });
});

describe('Regulatory Map search on a translated index', () => {
  const ENTRY: RegIndexEntry = {
    id: 'br-lgpd',
    name: 'Lei Geral de Proteção de Dados Pessoais (LGPD)',
    nameEn: 'General Data Protection Law (LGPD)',
    effectiveDate: '2020-09-18',
    category: 'data-privacy',
    regions: ['BRA'],
  };
  const index = buildSearchIndex([ENTRY]);

  it('finds the translated name without its accents', () => {
    expect(searchRegulations(index, 'protecao dados', 'all')).toEqual([ENTRY]);
  });

  it('finds the English name too', () => {
    expect(searchRegulations(index, 'general data protection law', 'all')).toEqual([ENTRY]);
  });

  it('folds accents typed in the query', () => {
    expect(searchRegulations(index, 'PROTEÇÃO', 'all')).toEqual([ENTRY]);
  });
});
