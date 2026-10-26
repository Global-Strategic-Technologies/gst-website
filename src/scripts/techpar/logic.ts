/**
 * TechPar UI — DOM-free helpers (ADR-0042: pure logic lives in `logic.ts` so
 * it is unit-testable and counted by coverage).
 */
import { formatFixed, formatNumber, formatPlain } from '../../i18n/formatters';

export { formatFixed, formatPlain };
import { CATEGORY_LABELS } from '../../utils/techpar-engine';

/**
 * Parse the ARR text field. It is the one `type="text"` money input and shows
 * locale grouping (`1,000,000` in en, `1.000.000` in es/pt-BR), so every
 * non-digit is a separator: strip them all. The field never holds a fraction.
 */
export function parseArrInput(raw: string | null | undefined): number {
  const digits = (raw ?? '').replace(/[^0-9]/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

/** ARR for the text field, with the page locale's digit grouping. */
export function formatArrInput(n: number, lang: string): string {
  return formatNumber(n, lang, { maximumFractionDigits: 0 });
}

/** `formatPercent` (`n.toFixed(d) + '%'`, em dash when not finite), localized. */
export function formatPct(n: number, lang: string, decimals = 1): string {
  if (!isFinite(n)) return '—';
  return formatFixed(n, lang, decimals) + '%';
}

/** The `CATEGORY_LABELS` key for an engine category label, or null. */
export function categoryKeyOf(label: string): keyof typeof CATEGORY_LABELS | null {
  const entry = (Object.entries(CATEGORY_LABELS) as [keyof typeof CATEGORY_LABELS, string][]).find(
    ([, v]) => v === label
  );
  return entry ? entry[0] : null;
}

/**
 * Classify an engine trajectory x-label: `'Now'`, `M{m}`, or blank. Anything
 * else (a user's historical label) is returned as `{ kind: 'other' }` so the
 * caller leaves it untouched.
 */
export function trajLabelKind(
  label: string
): { kind: 'now' } | { kind: 'month'; m: number } | { kind: 'other' } {
  if (label === 'Now') return { kind: 'now' };
  const m = /^M(\d+)$/.exec(label);
  if (m) return { kind: 'month', m: Number(m[1]) };
  return { kind: 'other' };
}
