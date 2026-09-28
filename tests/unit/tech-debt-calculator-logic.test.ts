import {
  ADVANCED_KEYS,
  CURRENCIES,
  formatCurrency,
  formatShortCurrency,
  hasNonDefaultAdvanced,
  toUsd,
} from '../../src/scripts/tech-debt-calculator/logic';
import { DEFAULT_STATE } from '../../src/utils/tech-debt-engine';

describe('tech-debt-calculator logic — currency formatting', () => {
  it('prints USD whole, with grouping', () => {
    expect(formatCurrency(1_234_567.8, 'USD')).toBe('$1,234,568');
  });

  it('converts by the currency multiplier before printing', () => {
    expect(formatCurrency(10_000, 'EUR')).toBe('€9,200');
    expect(formatCurrency(10_000, 'CAD')).toBe('C$13,600');
  });

  it('short form: millions with one decimal, thousands whole', () => {
    expect(formatShortCurrency(1_250_000, 'USD')).toBe('$1.3M');
    expect(formatShortCurrency(150_000, 'USD')).toBe('$150K');
    expect(formatShortCurrency(100_000, 'GBP')).toBe('£79K');
  });

  it('short form never prints "1000K": amounts that round to a thousand K are millions', () => {
    expect(formatShortCurrency(999_499, 'USD')).toBe('$999K');
    expect(formatShortCurrency(999_500, 'USD')).toBe('$1.0M');
    expect(formatShortCurrency(999_999, 'USD')).toBe('$1.0M');
  });

  it('short form falls back to the whole form under 1,000 after conversion', () => {
    expect(formatShortCurrency(999, 'USD')).toBe('$999');
    // 1,200 USD is 948 GBP — the threshold applies to the converted value
    expect(formatShortCurrency(1_200, 'GBP')).toBe('£948');
  });

  it('toUsd reads a typed amount in the selected currency back to USD', () => {
    expect(toUsd(140_000, 'USD')).toBe(140_000);
    expect(toUsd(92_000, 'EUR')).toBeCloseTo(100_000, 6);
    expect(toUsd(1_360_000_000, 'CAD')).toBeCloseTo(1_000_000_000, 3);
    expect(toUsd(NaN, 'EUR')).toBeNaN();
  });

  it('a typed amount survives the round trip to USD and back to the display', () => {
    for (const code of Object.keys(CURRENCIES)) {
      expect(formatShortCurrency(toUsd(140_000, code), code), code).toMatch(/140K$/);
    }
  });

  it('every currency has a symbol and a positive multiplier', () => {
    for (const [code, c] of Object.entries(CURRENCIES)) {
      expect(c.symbol, code).not.toBe('');
      expect(c.multiplier, code).toBeGreaterThan(0);
    }
  });
});

describe('tech-debt-calculator logic — advanced panel auto-expand', () => {
  it('the default state does not need the advanced panel', () => {
    expect(hasNonDefaultAdvanced({ ...DEFAULT_STATE })).toBe(false);
  });

  it('a primary-tier change alone does not open it', () => {
    expect(hasNonDefaultAdvanced({ ...DEFAULT_STATE, teamSize: DEFAULT_STATE.teamSize + 5 })).toBe(
      false
    );
  });

  it.each(ADVANCED_KEYS)('a non-default %s opens it', (key) => {
    const value = DEFAULT_STATE[key];
    const changed = typeof value === 'boolean' ? !value : (value as number) + 1;
    expect(hasNonDefaultAdvanced({ ...DEFAULT_STATE, [key]: changed })).toBe(true);
  });
});
