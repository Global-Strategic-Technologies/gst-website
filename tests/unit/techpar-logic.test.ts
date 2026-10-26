// @vitest-environment jsdom
/**
 * TechPar client localization (BL-153 Tier B): the DOM-free helpers in
 * `src/scripts/techpar/logic.ts`, the island reader in `strings.ts`, and the
 * pins that keep the English catalog equal to the sources it was moved from
 * (so the English page renders byte-identical text).
 */
import {
  parseArrInput,
  formatArrInput,
  formatFixed,
  formatPct,
  formatPlain,
  categoryKeyOf,
  trajLabelKind,
} from '../../src/scripts/techpar/logic';
import {
  s,
  sHtml,
  hasString,
  SCRIPT_STRING_KEYS,
  resetStringsForTest,
} from '../../src/scripts/techpar/strings';
import {
  CATEGORY_LABELS,
  SUMMARY_TEXT_EN,
  formatPercent,
  zoneLabel,
} from '../../src/utils/techpar-engine';
import type { Zone } from '../../src/utils/techpar-engine';
import { STAGES, STAGE_KEYS } from '../../src/data/techpar/stages';
import TECHPAR_EN from '../../src/i18n/en/techpar.json';

const CATALOG = TECHPAR_EN as Record<string, string>;
const ZONES: Zone[] = ['underinvest', 'ahead', 'healthy', 'above', 'elevated', 'critical'];

describe('parseArrInput', () => {
  it('reads every grouping convention as the same integer', () => {
    expect(parseArrInput('1,000,000')).toBe(1_000_000);
    expect(parseArrInput('1.000.000')).toBe(1_000_000);
    expect(parseArrInput('1 000 000')).toBe(1_000_000);
    expect(parseArrInput('2500000')).toBe(2_500_000);
  });

  it('is 0 for empty or digit-free input', () => {
    expect(parseArrInput('')).toBe(0);
    expect(parseArrInput(undefined)).toBe(0);
    expect(parseArrInput('abc')).toBe(0);
  });

  it('round-trips through formatArrInput in en and pt-BR', () => {
    expect(formatArrInput(1_000_000, 'en')).toBe('1,000,000');
    expect(formatArrInput(1_000_000, 'pt-BR')).toBe('1.000.000');
    for (const lang of ['en', 'es', 'pt-BR']) {
      expect(parseArrInput(formatArrInput(12_345_678, lang))).toBe(12_345_678);
    }
  });
});

describe('formatPct / formatFixed', () => {
  it('is byte-identical to formatPercent in English', () => {
    for (const n of [0, 12.5, 12.25, 99.95, 1234.56, -3.14, 0.05]) {
      expect(formatPct(n, 'en')).toBe(formatPercent(n));
      expect(formatPct(n, 'en', 0)).toBe(formatPercent(n, 0));
    }
    expect(formatPct(Infinity, 'en')).toBe('—');
    expect(formatPct(NaN, 'pt-BR')).toBe('—');
  });

  it('uses the decimal comma and no grouping in pt-BR', () => {
    expect(formatPct(12.5, 'pt-BR')).toBe('12,5%');
    expect(formatPct(1234.5, 'pt-BR')).toBe('1234,5%');
    expect(formatFixed(-0.4, 'pt-BR', 1)).toBe('-0,4');
  });

  it('formatPlain prints a multiple as String() did in English', () => {
    expect(formatPlain(12, 'en')).toBe('12');
    expect(formatPlain(12.5, 'en')).toBe('12.5');
    expect(formatPlain(12.5, 'pt-BR')).toBe('12,5');
  });
});

describe('categoryKeyOf / trajLabelKind', () => {
  it('maps every engine category label back to its key', () => {
    for (const [k, v] of Object.entries(CATEGORY_LABELS)) expect(categoryKeyOf(v)).toBe(k);
    expect(categoryKeyOf('Something else')).toBeNull();
  });

  it('classifies the engine trajectory labels', () => {
    expect(trajLabelKind('Now')).toEqual({ kind: 'now' });
    expect(trajLabelKind('M12')).toEqual({ kind: 'month', m: 12 });
    expect(trajLabelKind('')).toEqual({ kind: 'other' });
    expect(trajLabelKind('FY2024')).toEqual({ kind: 'other' });
  });
});

describe('strings.ts', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    resetStringsForTest();
  });

  it('falls back to English when there is no island', () => {
    expect(s('js.scenario.name', { n: 2 })).toBe('Scenario 2');
    expect(s('js.traj.now')).toBe('Now');
  });

  it('prefers the island, and falls back per key', () => {
    document.body.innerHTML =
      '<script type="application/json" data-techpar-strings>{"js.traj.now":"Hoje"}</script>';
    resetStringsForTest();
    expect(s('js.traj.now')).toBe('Hoje');
    expect(s('js.traj.month', { m: 6 })).toBe('M6');
  });

  it('sHtml escapes params but not the template', () => {
    expect(sHtml('js.chart.tooltipLabel', { label: '<b>', value: '$1K' })).toBe(
      '&lt;b&gt;: $1K/mo'
    );
    // The catalog writes markup-significant characters as entities (it is innerHTML)
    expect(sHtml('js.legend.underinvest', { n: 15 })).toBe('Underinvestment zone (&lt;15%)');
  });

  it('unknown keys are absent and render as the key', () => {
    expect(hasString('js.nope')).toBe(false);
    expect(s('js.nope')).toBe('js.nope');
  });

  it('SCRIPT_STRING_KEYS carries what the scripts read and none of the page-only copy', () => {
    const scriptPrefixes = /^(js|signal|rec|summary|zone|category|stage|industry)\./;
    for (const k of Object.keys(CATALOG)) {
      expect(SCRIPT_STRING_KEYS.includes(k), k).toBe(scriptPrefixes.test(k));
    }
    for (const st of STAGE_KEYS) expect(SCRIPT_STRING_KEYS).toContain(`stage.${st}.label`);
    expect(SCRIPT_STRING_KEYS).not.toContain('meta.title');
  });
});

describe('English catalog equals the sources it mirrors', () => {
  it('zone names equal zoneLabel()', () => {
    for (const z of ZONES) expect(CATALOG[`zone.${z}`]).toBe(zoneLabel(z));
  });

  it('category names equal CATEGORY_LABELS', () => {
    for (const [k, v] of Object.entries(CATEGORY_LABELS)) expect(CATALOG[`category.${k}`]).toBe(v);
  });

  it('stage notes equal stages.ts character for character', () => {
    for (const st of STAGE_KEYS) {
      expect(CATALOG[`stage.${st}.note`]).toBe(STAGES[st].note);
      expect(CATALOG[`stage.${st}.noteUnder`]).toBe(STAGES[st].noteUnder);
    }
  });

  it('summary text equals SUMMARY_TEXT_EN', () => {
    for (const [k, v] of Object.entries(SUMMARY_TEXT_EN)) expect(CATALOG[`summary.${k}`]).toBe(v);
  });

  it('every convergence-frame stage has its trajectory sentence', () => {
    for (const st of STAGE_KEYS) {
      if (STAGES[st].frame !== 'convergence') continue;
      expect(CATALOG[`js.metrics.trajNote.${st}`]).toBe(
        `At ${STAGES[st].label}, trajectory matters more than the current number. The key question is whether this ratio declines as revenue scales.`
      );
    }
  });

  it('every non-SaaS industry has a note and every industry a disclaimer', () => {
    for (const id of ['saas', 'fintech', 'marketplace', 'infra_hw', 'other']) {
      expect(CATALOG[`industry.${id}.disclaimer`]).toBeTruthy();
      if (id !== 'saas') expect(CATALOG[`industry.${id}.note`]).toBeTruthy();
    }
    expect(CATALOG['industry.saas.note']).toBeUndefined();
  });

  it('the R&D sentences have a whole-sentence key per zone they can show', () => {
    for (const z of ['elevated', 'critical']) {
      expect(CATALOG[`js.deepdive.prompt.${z}`]).toContain('{button}');
    }
    for (const z of ['above', 'elevated', 'critical']) {
      expect(CATALOG[`js.crossLink.${z}`]).toContain('{link}');
      expect(CATALOG[`js.crossLink.${z}`]).toContain(zoneLabel(z as Zone).toLowerCase());
    }
  });
});
