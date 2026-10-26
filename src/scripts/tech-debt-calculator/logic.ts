/**
 * Tech Debt Calculator — the page script's DOM-free logic (ADR-0042).
 *
 * The calculation itself lives in `src/utils/tech-debt-engine.ts`; this file
 * holds the presentation-side rules the page script needs that take only data:
 * currency display formatting, reading a typed amount in the page language,
 * and the "does this state need the advanced panel open" predicate.
 * Unit-tested by `tests/unit/tech-debt-calculator-logic.test.ts`.
 */
import { DEFAULT_STATE } from '../../utils/tech-debt-engine';
import type { CalcState } from '../../utils/tech-debt-engine';
import { CURRENCY_SYMBOL, formatMoneyShort, type Currency } from '../../i18n/currency';

/**
 * Currency is a display unit, never a conversion (BL-153 hand-off §4): the
 * calculator shows the amounts a visitor works in, in the currency they say
 * those amounts are in. It held fixed exchange rates until 2026-10-24.
 */

/**
 * An amount printed whole with the currency symbol, e.g. `€10,000`
 * (`R$10.000` on `/pt/`). Not `formatters.ts`' `formatCurrency`: `Intl`'s
 * currency style spells USD `US$` outside en and moves the symbol, and this
 * page prints the same fixed symbol table as its short amounts.
 */
export function formatCurrency(n: number, currency: Currency, lang: string = 'en-US'): string {
  return (
    CURRENCY_SYMBOL[currency] + new Intl.NumberFormat(lang, { maximumFractionDigits: 0 }).format(n)
  );
}

/**
 * The short form used in the results, slider readouts and direct inputs, e.g.
 * `$1.2M`, `£100K`, `R$1,2M` on `/pt/`.
 */
export function formatShortCurrency(n: number, currency: Currency, lang: string = 'en-US'): string {
  return formatMoneyShort(n, currency, lang);
}

/**
 * Rewrite a typed amount into the dot-decimal form `parseShortCurrency` reads.
 * The direct inputs show amounts in the page language (`R$1,2M` on `/pt/`), so
 * a reader there types a decimal comma. In a comma-decimal language:
 * - exactly one `,` is the decimal point (`1,5M` → `1.5M`);
 * - more than one `,` can only be English-style grouping (`1,000,000`), so the
 *   input passes through and the parser reads it that way;
 * - a `.` followed by exactly three digits is grouping (`1.000.000`);
 * - any other `.` is a decimal point (`1.5M` still reads 1.5M).
 * In a dot-decimal language the input passes through unchanged.
 */
export function normalizeLocaleAmount(raw: string, decimalSep: string): string {
  if (decimalSep !== ',') return raw;
  const commas = (raw.match(/,/g) ?? []).length;
  if (commas > 1) return raw;
  const grouped = raw.replace(/\.(?=\d{3}(?!\d))/g, '');
  return commas === 1 ? grouped.replace(/\./g, '').replace(',', '.') : grouped;
}

// Advanced-tier inputs live behind the collapsible panel. A shared link may
// carry non-default values for any of them (MCP-generated deeplinks always
// encode `a:0` regardless of the advanced fields they populate). If we honor
// `advancedOpen:false` blindly, the recipient lands on a collapsed panel whose
// advanced results breakdown is never rendered — the inputs are silently
// applied to the primary figure but invisible. Auto-expand when any advanced
// field diverges from its default so the full analysis is surfaced on arrival.
export const ADVANCED_KEYS = [
  'deployIdx',
  'incidents',
  'mttr',
  'remediationBudget',
  'arr',
  'remediationPct',
  'contextSwitchOn',
] as const;

export function hasNonDefaultAdvanced(s: CalcState): boolean {
  return ADVANCED_KEYS.some((k) => s[k] !== DEFAULT_STATE[k]);
}
