import {
  ADVANCED_KEYS,
  formatCurrency,
  formatShortCurrency,
  hasNonDefaultAdvanced,
} from '../../src/scripts/tech-debt-calculator/logic';
import { CURRENCIES } from '../../src/i18n/currency';
import { DEFAULT_STATE } from '../../src/utils/tech-debt-engine';

describe('tech-debt-calculator logic — currency formatting', () => {
  it('prints USD whole, with grouping', () => {
    expect(formatCurrency(1_234_567.8, 'USD')).toBe('$1,234,568');
  });

  it('labels the amount in the selected currency without converting it', () => {
    expect(formatCurrency(10_000, 'EUR')).toBe('€10,000');
    expect(formatCurrency(10_000, 'CAD')).toBe('C$10,000');
    expect(formatCurrency(10_000, 'BRL')).toBe('R$10,000');
  });

  it('short form: millions with one decimal, thousands whole', () => {
    expect(formatShortCurrency(1_250_000, 'USD')).toBe('$1.3M');
    expect(formatShortCurrency(150_000, 'USD')).toBe('$150K');
    expect(formatShortCurrency(100_000, 'GBP')).toBe('£100K');
  });

  it('short form never prints "1000K": amounts that round to a thousand K are millions', () => {
    expect(formatShortCurrency(999_499, 'USD')).toBe('$999K');
    expect(formatShortCurrency(999_500, 'USD')).toBe('$1.0M');
    expect(formatShortCurrency(999_999, 'USD')).toBe('$1.0M');
  });

  it('short form falls back to the whole form under 1,000', () => {
    expect(formatShortCurrency(999, 'USD')).toBe('$999');
    expect(formatShortCurrency(948, 'GBP')).toBe('£948');
  });

  it('the same amount reads the same in every currency, only the symbol changes', () => {
    for (const code of CURRENCIES) {
      expect(formatShortCurrency(140_000, code), code).toMatch(/140K$/);
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
