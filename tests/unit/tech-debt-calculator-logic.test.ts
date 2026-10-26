import {
  ADVANCED_KEYS,
  formatCurrency,
  formatShortCurrency,
  hasNonDefaultAdvanced,
  normalizeLocaleAmount,
} from '../../src/scripts/tech-debt-calculator/logic';
import { CURRENCIES, decimalSeparator } from '../../src/i18n/currency';
import {
  BURDEN_TEXT_EN,
  CONTEXT_NOTE_EN,
  DEFAULT_STATE,
  DEPLOY_OPTIONS,
  STATE_FIELD_LABELS,
  SUMMARY_TEXT_EN,
  parseShortCurrency,
} from '../../src/utils/tech-debt-engine';
import EN from '../../src/i18n/en/tech-debt-calculator.json';

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

describe('tech-debt-calculator logic — page-language amounts', () => {
  it('formats in the page language, English unchanged', () => {
    expect(formatCurrency(10_000, 'BRL', 'pt-BR')).toBe('R$10.000');
    expect(formatShortCurrency(1_250_000, 'BRL', 'pt-BR')).toBe('R$1,3M');
    expect(formatShortCurrency(1_250_000, 'USD', 'es')).toBe('$1,3M');
    expect(formatShortCurrency(1_250_000, 'USD', 'en')).toBe('$1.3M');
  });

  const read = (raw: string, lang: string) =>
    parseShortCurrency(normalizeLocaleAmount(raw, decimalSeparator(lang)));

  it.each(['pt-BR', 'es', 'es-CO'])('reads a decimal comma in %s', (lang) => {
    expect(read('1,5M', lang)).toBe(1_500_000);
    expect(read('R$1,2M', lang)).toBe(1_200_000);
    expect(read('1.000.000', lang)).toBe(1_000_000);
    expect(read('150.000', lang)).toBe(150_000);
    expect(read('1.234,5K', lang)).toBe(1_234_500);
    expect(read('1.5M', lang)).toBe(1_500_000);
    expect(read('1,000,000', lang)).toBe(1_000_000);
  });

  it('leaves English input to the parser as before', () => {
    expect(normalizeLocaleAmount('1,5M', '.')).toBe('1,5M');
    expect(read('1,000,000', 'en')).toBe(1_000_000);
    expect(read('$1.5M', 'en')).toBe(1_500_000);
  });

  it('echoes what the page prints back into the field', () => {
    // The field shows the short form; leaving it untouched must not change the value.
    for (const lang of ['en', 'es', 'pt-BR']) {
      for (const [n, shownValue] of [
        [150_000, 150_000],
        [1_250_000, 1_300_000],
        [2_500_000_000, 2_500_000_000],
      ]) {
        const shown = formatShortCurrency(n, 'BRL', lang);
        expect(read(shown, lang), `${lang} ${shown}`).toBeCloseTo(shownValue);
      }
    }
  });
});

describe('tech-debt-calculator catalog — English equals the engine it mirrors', () => {
  const en = EN as Record<string, string>;

  it('burden levels', () => {
    for (const [key, text] of Object.entries(BURDEN_TEXT_EN)) {
      expect(en[`burden.${key}.label`]).toBe(text.label);
      expect(en[`burden.${key}.range`]).toBe(text.range);
      expect(en[`burden.${key}.plain`]).toBe(text.plain);
      expect(en[`burden.${key}.note`]).toBe(CONTEXT_NOTE_EN[key as keyof typeof CONTEXT_NOTE_EN]);
    }
  });

  it('deployment frequencies and DORA tiers', () => {
    DEPLOY_OPTIONS.forEach((opt, i) => {
      expect(en[`deploy.${i}`]).toBe(opt.label);
      expect(en[`dora.${opt.doraLabel}`]).toBe(opt.doraLabel);
    });
  });

  it('shared-link field labels', () => {
    for (const [key, label] of Object.entries(STATE_FIELD_LABELS)) {
      expect(en[`field.${key}`]).toBe(label);
    }
  });

  it('summary lines', () => {
    for (const [key, text] of Object.entries(SUMMARY_TEXT_EN)) {
      expect(en[`summary.${key}`]).toBe(text);
    }
  });
});
