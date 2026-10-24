/**
 * Display currency for the hub tools (BL-153 Tier B, hand-off §4).
 *
 * Currency is a **unit label, never a conversion**: a tool shows the numbers a
 * visitor typed in the currency they say those numbers are in. Nothing here
 * holds an exchange rate, and nothing here reads the page locale — ADR-0030
 * § 10: currency is a caller argument, never inferred from the language. The
 * default is USD in every locale; the visitor's choice persists per tool.
 *
 * `parseCurrencyParam` is also a security boundary. Tools carry the currency
 * in a URL parameter (and TechPar in saved state) and paint it into the page,
 * so every read goes through the allowlist below: anything that is not a known
 * code, or a pre-codes legacy symbol, becomes USD.
 */

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'BRL', 'CAD', 'AUD'] as const;
export type Currency = (typeof CURRENCIES)[number];
export const DEFAULT_CURRENCY: Currency = 'USD';

/** The prefix shown beside amounts and inputs. Locale-independent on purpose:
 *  `C$`/`A$`/`R$` read the same to a deal team in any of the site's languages. */
export const CURRENCY_SYMBOL: Readonly<Record<Currency, string>> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  BRL: 'R$',
  CAD: 'C$',
  AUD: 'A$',
};

/** TechPar stored the symbol itself (`?u=€`) before currencies were codes;
 *  links and saved state from then still resolve. */
export const LEGACY_SYMBOL_TO_CODE: Readonly<Record<string, Currency>> = {
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  C$: 'CAD',
  A$: 'AUD',
};

export function isCurrency(value: unknown): value is Currency {
  return typeof value === 'string' && (CURRENCIES as readonly string[]).includes(value);
}

/** Allowlist for any currency read from a URL or storage. Unknown → USD. */
export function parseCurrencyParam(raw: string | null | undefined): Currency {
  if (!raw) return DEFAULT_CURRENCY;
  if (isCurrency(raw)) return raw;
  return LEGACY_SYMBOL_TO_CODE[raw] ?? DEFAULT_CURRENCY;
}
