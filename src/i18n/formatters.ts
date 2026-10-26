/**
 * Locale-aware formatting over `Intl`. The one place the site decides how a
 * date or number is rendered for a locale, so that a tool page adopting
 * localization later changes one import rather than re-deriving the tag.
 *
 * Accepts either a registry `Locale` or a bare Intl tag string, because client
 * scripts have no registry — they read `document.documentElement.lang`, which
 * BaseLayout sets to the page locale's `htmlLang`, and pass it here.
 *
 * Currency is a caller decision, never inferred from the locale (BL-153 § 4:
 * a Brazilian reader may price a US target in USD). `formatCurrency` therefore
 * requires the currency code; only the digit grouping and symbol placement
 * follow the locale.
 */
import { DEFAULT_LOCALE, type Locale } from './locales';

export type IntlTag = Locale | string;

function tagOf(locale: IntlTag | undefined): string {
  if (!locale) return DEFAULT_LOCALE.intl;
  return typeof locale === 'string' ? locale : locale.intl;
}

export function formatDate(
  date: Date,
  locale?: IntlTag,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' }
): string {
  return new Intl.DateTimeFormat(tagOf(locale), options).format(date);
}

export function formatNumber(
  value: number,
  locale?: IntlTag,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(tagOf(locale), options).format(value);
}

export function formatCurrency(
  value: number,
  currency: string,
  locale?: IntlTag,
  options?: Omit<Intl.NumberFormatOptions, 'style' | 'currency'>
): string {
  return new Intl.NumberFormat(tagOf(locale), { style: 'currency', currency, ...options }).format(
    value
  );
}

/**
 * Fixed-decimal number, no grouping: what `toFixed` printed, with the
 * locale's decimal separator. English output stays byte-identical to `toFixed`.
 */
export function formatFixed(n: number, locale: IntlTag | undefined, decimals: number): string {
  return formatNumber(n, locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: false,
  });
}

/** A plain number as `String(n)` printed it (e.g. a multiplier), localized. */
export function formatPlain(n: number, locale?: IntlTag): string {
  return formatNumber(n, locale, { maximumFractionDigits: 10, useGrouping: false });
}

/**
 * Join names in the language's list style (`a, b y c`; Spanish writes `e`
 * before an i- sound). English takes the caller's own joiner, so a page keeps
 * the wording it has always printed.
 */
export function formatList(
  items: string[],
  locale: IntlTag | undefined,
  englishJoin: string
): string {
  const tag = tagOf(locale);
  if (tag.startsWith('en') || typeof Intl.ListFormat !== 'function') return items.join(englishJoin);
  return new Intl.ListFormat(tag, { style: 'long', type: 'conjunction' }).format(items);
}

/**
 * The catalog key suffix for a count: `one` or `other`. English, the schema,
 * has only those two forms, so the other `Intl.PluralRules` categories
 * (`many` in es and pt-BR for millions; `zero`, `two`, `few` elsewhere) fold
 * into `other` and every locale carries the same two keys.
 */
export function pluralKey(n: number, locale?: IntlTag): 'one' | 'other' {
  return new Intl.PluralRules(tagOf(locale)).select(n) === 'one' ? 'one' : 'other';
}
