/**
 * Locale-aware formatting (BL-153 slice 2, `src/i18n/formatters.ts`): the
 * default locale when none is given, a registry `Locale` and its bare Intl
 * tag rendering identically (client scripts pass the tag from
 * `document.documentElement.lang`), locale-specific grouping, and currency
 * as a caller decision that the locale never overrides.
 */

import { DEFAULT_LOCALE, findLocale } from '../../src/i18n/locales';
import { formatCurrency, formatDate, formatNumber } from '../../src/i18n/formatters';

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
