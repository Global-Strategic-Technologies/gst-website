/**
 * Tech Debt Calculator — the page script's DOM-free logic (ADR-0042).
 *
 * The calculation itself lives in `src/utils/tech-debt-engine.ts`; this file
 * holds the presentation-side rules the page script needs that take only data:
 * currency display formatting and the "does this state need the advanced panel open"
 * predicate. Unit-tested by `tests/unit/tech-debt-calculator-logic.test.ts`.
 */
import { DEFAULT_STATE, fmtShortC } from '../../utils/tech-debt-engine';
import type { CalcState } from '../../utils/tech-debt-engine';
import { CURRENCY_SYMBOL, type Currency } from '../../i18n/currency';

/**
 * Currency is a display unit, never a conversion (BL-153 hand-off §4): the
 * calculator shows the amounts a visitor works in, in the currency they say
 * those amounts are in. It held fixed exchange rates until 2026-10-24.
 */

/** An amount printed whole with the currency symbol, e.g. `€10,000`. */
export function formatCurrency(n: number, currency: Currency): string {
  return (
    CURRENCY_SYMBOL[currency] +
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)
  );
}

/**
 * The short form used in the results, slider readouts and direct inputs, e.g.
 * `$1.2M`, `£100K` — the engine's `fmtShortC`, which also formats the copied
 * summary, keyed by currency code.
 */
export function formatShortCurrency(n: number, currency: Currency): string {
  return fmtShortC(n, CURRENCY_SYMBOL[currency]);
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
