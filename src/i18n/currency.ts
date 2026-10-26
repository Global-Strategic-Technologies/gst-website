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

/**
 * Short money for display: the shape TechPar has always used (`$1.6M`,
 * `$500K`, `$1.2B` — `formatDollars` in `src/utils/techpar-engine.ts`), with
 * the same unit thresholds and rounding. Only the decimal separator follows the
 * page language (`R$1,6M` on `/pt/`). The digits come from `toFixed`, not from
 * `Intl`, so English output is byte-identical to `formatDollars` and no browser
 * ICU version can move a rounding boundary. `Intl` compact notation was
 * measured and rejected: it drops the `.0` (`$1M`), spells CAD `CA$`, and in
 * es-CO prints `US$2500 M` and mixes `K`/`k`.
 */
export function formatMoneyShort(n: number, code: Currency, intlTag: string = 'en-US'): string {
  if (!Number.isFinite(n)) return '—';
  const symbol = CURRENCY_SYMBOL[code];
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const dec = (s: string) => s.replace('.', decimalSeparator(intlTag));
  if (abs >= 999_950_000) return sign + symbol + dec((abs / 1e9).toFixed(1)) + 'B';
  if (abs >= 999_500) return sign + symbol + dec((abs / 1e6).toFixed(1)) + 'M';
  if (abs >= 1e3) return sign + symbol + Math.round(abs / 1e3) + 'K';
  return sign + symbol + Math.round(abs);
}

/** Preset-chip label: whole K/M amounts, no decimals (`$50K`, `R$2M`). */
export function formatMoneyChip(value: number, code: Currency): string {
  const symbol = CURRENCY_SYMBOL[code];
  return value >= 1e6 ? `${symbol}${value / 1e6}M` : `${symbol}${value / 1e3}K`;
}

const separators = new Map<string, string>();
/** The decimal separator `Intl` uses for a language tag (`.` in en, `,` in es/pt-BR). */
export function decimalSeparator(intlTag: string): string {
  let sep = separators.get(intlTag);
  if (sep === undefined) {
    sep =
      new Intl.NumberFormat(intlTag).formatToParts(1.5).find((p) => p.type === 'decimal')?.value ??
      '.';
    separators.set(intlTag, sep);
  }
  return sep;
}
