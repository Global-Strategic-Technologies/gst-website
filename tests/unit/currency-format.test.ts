/**
 * Display-currency formatting for the hub tools (src/i18n/currency.ts).
 *
 * `formatMoneyShort` must be byte-identical to TechPar's `formatDollars` in
 * English — every TechPar amount moved onto it, and its unit thresholds are
 * deliberate (`techpar-engine.ts`) — while taking the decimal separator from
 * the page language. The summary builder must use the money formatter it is
 * given, so the copied summary carries the selected currency.
 */

import { CURRENCIES, formatMoneyChip, formatMoneyShort } from '../../src/i18n/currency';
import {
  buildSummaryText,
  compute,
  formatDollars,
  SUMMARY_TEXT_EN,
} from '../../src/utils/techpar-engine';

const SAMPLES = [
  0,
  7,
  999,
  1_000,
  1_499,
  1_500,
  999_499,
  999_500,
  1_000_000,
  1_649_999,
  1_650_000,
  25_000_000,
  999_949_999,
  999_950_000,
  2_500_000_000,
  1_234_567_890_123,
  -1_600_000,
  -42_000,
  NaN,
  Infinity,
];

describe('formatMoneyShort', () => {
  it('matches formatDollars exactly in English, for every legacy symbol', () => {
    const symbols = { USD: '$', EUR: '€', GBP: '£', CAD: 'C$', AUD: 'A$' } as const;
    for (const [code, symbol] of Object.entries(symbols)) {
      for (const n of SAMPLES) {
        expect(formatMoneyShort(n, code as keyof typeof symbols, 'en')).toBe(
          formatDollars(n, symbol)
        );
      }
    }
  });

  it('uses the page language decimal separator and keeps the K/M/B shape', () => {
    expect(formatMoneyShort(1_700_000, 'BRL', 'pt-BR')).toBe('R$1,7M');
    expect(formatMoneyShort(2_500_000_000, 'USD', 'es')).toBe('$2,5B');
    expect(formatMoneyShort(42_000, 'EUR', 'es')).toBe('€42K');
    expect(formatMoneyShort(1_234_567_890_123, 'USD', 'pt-BR')).toBe('$1234,6B');
  });

  it('prints a dash for non-finite input', () => {
    expect(formatMoneyShort(NaN, 'USD')).toBe('—');
  });
});

describe('formatMoneyChip', () => {
  it('labels whole K and M presets with the currency symbol', () => {
    expect(formatMoneyChip(50_000, 'USD')).toBe('$50K');
    expect(formatMoneyChip(2_000_000, 'BRL')).toBe('R$2M');
    expect(formatMoneyChip(250_000_000, 'AUD')).toBe('A$250M');
    for (const c of CURRENCIES) expect(formatMoneyChip(1_000_000, c)).toMatch(/1M$/);
  });
});

describe('buildSummaryText options', () => {
  const inputs = {
    arr: 10_000_000,
    stage: 'series_bc' as const,
    mode: 'quick' as const,
    capexView: 'cash' as const,
    growthRate: 40,
    exitMultiple: 12,
    infraHostingAnnual: 1_200_000,
    infraPersonnel: 600_000,
    rdOpEx: 3_000_000,
    rdCapEx: 0,
    engFTE: 0,
    engCost: 0,
    prodCost: 0,
    toolingCost: 0,
  };

  it('formats every amount with the money function it is given', () => {
    const result = compute(inputs)!;
    const text = buildSummaryText(inputs, result, undefined, undefined, {
      money: (n) => formatMoneyShort(n, 'BRL', 'pt-BR'),
    });
    expect(text).toContain('ARR: R$10,0M');
    expect(text).toContain('(R$4,8M/yr)');
    // no bare-dollar amount survives (R$ is the only symbol allowed)
    expect(text).not.toMatch(/(^|[^R])\$\d/m);
  });

  it('uses supplied text', () => {
    const result = compute(inputs)!;
    const text = buildSummaryText(inputs, result, undefined, undefined, {
      text: { ...SUMMARY_TEXT_EN, title: 'Resumo TechPar' },
    });
    expect(text.split('\n')[0]).toBe('Resumo TechPar');
  });
});
