/**
 * TechPar client strings (BL-153 Tier B).
 *
 * The page inlines the current locale's script strings as a JSON island,
 * `<script type="application/json" data-techpar-strings>`, built from
 * `SCRIPT_STRING_KEYS`. This module reads it lazily on first use.
 *
 * Fallback: a key absent from the island resolves to the English catalog,
 * imported statically below. That keeps the English page byte-identical and
 * lets the jsdom unit tests (which import `dom.ts` with no island) render
 * English. `src/i18n/t.ts` is deliberately NOT imported: its eager glob loads
 * every catalog of every locale and must never reach the client bundle.
 */
import { interpolate, type Params } from '../../i18n/interpolate';
import { escapeHtml } from '../../utils/escape-html';
import EN from '../../i18n/en/techpar.json';

const EN_STRINGS = EN as Record<string, string>;

/**
 * The catalog prefixes the scripts read. The `techpar` namespace also holds
 * the template's own copy, which the page renders server-side and the island
 * does not need to repeat.
 */
const SCRIPT_KEY_PREFIXES = [
  'js.',
  'signal.',
  'rec.',
  'summary.',
  'zone.',
  'category.',
  'stage.',
  'industry.',
] as const;

/** Every key the TechPar scripts read — what the template puts in the island. */
export const SCRIPT_STRING_KEYS: readonly string[] = Object.keys(EN_STRINGS).filter((key) =>
  SCRIPT_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
);

let island: Record<string, string> | null = null;

function strings(): Record<string, string> {
  if (island) return island;
  let parsed: Record<string, string> = {};
  try {
    const el =
      typeof document !== 'undefined' ? document.querySelector('[data-techpar-strings]') : null;
    if (el?.textContent) parsed = JSON.parse(el.textContent) as Record<string, string>;
  } catch {
    parsed = {};
  }
  island = parsed;
  return island;
}

function raw(key: string): string | undefined {
  return strings()[key] ?? EN_STRINGS[key];
}

/** Whether the island or the English catalog defines `key`. */
export function hasString(key: string): boolean {
  return raw(key) !== undefined;
}

/** Plain-text string (for `textContent`, attributes, Chart.js). */
export function s(key: string, params?: Params): string {
  const template = raw(key);
  return template === undefined ? key : interpolate(template, params);
}

/**
 * HTML string for `innerHTML`. The catalog template is trusted markup (the
 * parity guard allowlists its tags); every param value is escaped.
 */
export function sHtml(key: string, params?: Params): string {
  const escaped: Params | undefined = params
    ? Object.fromEntries(Object.entries(params).map(([k, v]) => [k, escapeHtml(String(v))]))
    : undefined;
  return s(key, escaped);
}

/** Test hook: forget the parsed island so the next call re-reads the DOM. */
export function resetStringsForTest(): void {
  island = null;
}
