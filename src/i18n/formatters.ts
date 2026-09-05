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
