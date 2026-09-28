/**
 * Tech Debt Calculator — the page script's DOM-free logic (ADR-0042).
 *
 * The calculation itself lives in `src/utils/tech-debt-engine.ts`; this file
 * holds the presentation-side rules the page script needs that take only data:
 * currency formatting and the "does this state need the advanced panel open"
 * predicate. Unit-tested by `tests/unit/tech-debt-calculator-logic.test.ts`.
 */
import { DEFAULT_STATE, fmtShortC } from '../../utils/tech-debt-engine';
import type { CalcState } from '../../utils/tech-debt-engine';

// Static approximate multipliers (mid-market rates, fixed at tool release).
export const CURRENCIES: Record<string, { symbol: string; multiplier: number }> = {
  USD: { symbol: '$', multiplier: 1.0 },
  EUR: { symbol: '€', multiplier: 0.92 },
  GBP: { symbol: '£', multiplier: 0.79 },
  CAD: { symbol: 'C$', multiplier: 1.36 },
  AUD: { symbol: 'A$', multiplier: 1.53 },
};

/** A USD amount converted to `currency` and printed whole, e.g. `€9,200`. */
export function formatCurrency(n: number, currency: string): string {
  const { symbol, multiplier } = CURRENCIES[currency];
  const converted = n * multiplier;
  return symbol + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(converted);
}

/**
 * A typed amount, read in the selected currency, back to the USD the state
 * holds. The direct inputs display converted amounts, so what the user types
 * is in that currency too. `NaN` stays `NaN` for the "couldn't read" path.
 */
export function toUsd(n: number, currency: string): number {
  return n / CURRENCIES[currency].multiplier;
}

/**
 * The short form used in the results, slider readouts and direct inputs, e.g.
 * `$1.2M`, `£79K` — the engine's `fmtShortC`, which also formats the copied
 * summary, keyed by currency code.
 */
export function formatShortCurrency(n: number, currency: string): string {
  const { symbol, multiplier } = CURRENCIES[currency];
  return fmtShortC(n, symbol, multiplier);
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
