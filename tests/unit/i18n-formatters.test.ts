/**
 * Locale-aware formatting (BL-153 slice 2, `src/i18n/formatters.ts`): the
 * default locale when none is given, a registry `Locale` and its bare Intl
 * tag rendering identically (client scripts pass the tag from
 * `document.documentElement.lang`), locale-specific grouping, and currency
 * as a caller decision that the locale never overrides.
 */

import { DEFAULT_LOCALE, findLocale } from '../../src/i18n/locales';
import {
  formatCurrency,
  formatDate,
  formatList,
  formatNumber,
  pluralKey,
} from '../../src/i18n/formatters';

const es = findLocale('es')!;
const pt = findLocale('pt-BR')!;
const NOON_UTC = new Date(Date.UTC(2026, 0, 15, 12));

describe('formatters', () => {
  it('fall back to the default locale when none is given', () => {
    expect(formatNumber(1234.5)).toBe(formatNumber(1234.5, DEFAULT_LOCALE));
    expect(formatNumber(1234.5)).toBe('1,234.5');
    expect(formatDate(NOON_UTC)).toBe(formatDate(NOON_UTC, DEFAULT_LOCALE));
  });

  it('render a registry Locale and its bare Intl tag identically', () => {
    expect(formatDate(NOON_UTC, es)).toBe(formatDate(NOON_UTC, es.intl));
    expect(formatNumber(1234.5, pt)).toBe(formatNumber(1234.5, pt.intl));
  });

  it('group digits per locale', () => {
    expect(formatNumber(1234567.5, es)).not.toBe(formatNumber(1234567.5, DEFAULT_LOCALE));
    expect(formatNumber(1234.5, pt)).toBe('1.234,5');
  });

  it('keep the caller-supplied currency; the locale only shapes it', () => {
    expect(formatCurrency(10, 'USD', pt)).toMatch(/^US\$\s10,00$/);
    expect(formatCurrency(10, 'USD', DEFAULT_LOCALE)).toBe('$10.00');
    expect(formatCurrency(10, 'USD', es)).not.toMatch(/COP/);
  });
});

describe('formatList', () => {
  it('uses the caller’s joiner in English, unchanged', () => {
    expect(formatList(['A', 'B', 'C'], 'en', ', ')).toBe('A, B, C');
    expect(formatList(['A', 'B'], DEFAULT_LOCALE, ' and ')).toBe('A and B');
  });

  it('joins in the language’s own style elsewhere', () => {
    expect(formatList(['Equipo', 'Ventas'], 'es', ', ')).toBe('Equipo y Ventas');
    expect(formatList(['Equipo', 'Ingresos'], 'es', ', ')).toBe('Equipo e Ingresos');
    expect(formatList(['A', 'B', 'C'], 'pt-BR', ', ')).toBe('A, B e C');
  });
});

describe('pluralKey', () => {
  it('is one or other in every locale', () => {
    expect(pluralKey(1, 'en')).toBe('one');
    expect(pluralKey(0, 'en')).toBe('other');
    expect(pluralKey(2, 'es')).toBe('other');
    expect(pluralKey(1, 'pt-BR')).toBe('one');
  });

  it('folds the categories English lacks into other', () => {
    // es and pt-BR call a million `many`; the catalogs only carry one/other.
    expect(new Intl.PluralRules('es').select(1_000_000)).toBe('many');
    expect(pluralKey(1_000_000, 'es')).toBe('other');
  });
});
