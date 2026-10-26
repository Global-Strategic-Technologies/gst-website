/**
 * Client strings for a Tier B tool page (BL-153).
 *
 * The tool's template inlines the current locale's script strings as a JSON
 * island, `<script type="application/json" data-<tool>-strings>`, built from
 * `SCRIPT_STRING_KEYS`. The reader made here parses it lazily on first use.
 *
 * Fallback: a key absent from the island resolves to the tool's English
 * catalog, which the per-tool wrapper imports statically. That keeps the
 * English page byte-identical and lets jsdom unit tests (no island) render
 * English. `src/i18n/t.ts` is deliberately NOT imported: its eager glob loads
 * every catalog of every locale and must never reach the client bundle.
 *
 * One wrapper per tool, `src/scripts/<tool>/strings.ts`, binds its catalog,
 * prefixes and selector (LOCALIZATION.md § Tool scripts).
 */
import { interpolate, type Params } from '../i18n/interpolate';
import { escapeHtml } from '../utils/escape-html';

export interface ToolStringsConfig {
  /** The tool's English catalog — the fallback and the key list. */
  en: Record<string, string>;
  /**
   * The catalog prefixes the scripts read. The namespace also holds the
   * template's own copy, which renders server-side and the island does not
   * need to repeat.
   */
  prefixes: readonly string[];
  /** The island's selector, e.g. `[data-techpar-strings]`. */
  selector: string;
}

export interface ToolStrings {
  /** Every key the tool's scripts read — what the template puts in the island. */
  SCRIPT_STRING_KEYS: readonly string[];
  /** Whether the island or the English catalog defines `key`. */
  hasString(key: string): boolean;
  /** Plain-text string (for `textContent`, attributes, Chart.js). */
  s(key: string, params?: Params): string;
  /**
   * HTML string for `innerHTML`. The catalog template is trusted markup (the
   * parity guard allowlists its tags); every param value is escaped.
   */
  sHtml(key: string, params?: Params): string;
  /** Test hook: forget the parsed island so the next call re-reads the DOM. */
  resetStringsForTest(): void;
}

export function createToolStrings({ en, prefixes, selector }: ToolStringsConfig): ToolStrings {
  const SCRIPT_STRING_KEYS: readonly string[] = Object.keys(en).filter((key) =>
    prefixes.some((prefix) => key.startsWith(prefix))
  );

  let island: Record<string, string> | null = null;

  function strings(): Record<string, string> {
    if (island) return island;
    let parsed: Record<string, string> = {};
    try {
      const el = typeof document !== 'undefined' ? document.querySelector(selector) : null;
      if (el?.textContent) parsed = JSON.parse(el.textContent) as Record<string, string>;
    } catch {
      parsed = {};
    }
    island = parsed;
    return island;
  }

  function raw(key: string): string | undefined {
    return strings()[key] ?? en[key];
  }

  function s(key: string, params?: Params): string {
    const template = raw(key);
    return template === undefined ? key : interpolate(template, params);
  }

  return {
    SCRIPT_STRING_KEYS,
    hasString: (key) => raw(key) !== undefined,
    s,
    sHtml(key, params) {
      const escaped: Params | undefined = params
        ? Object.fromEntries(Object.entries(params).map(([k, v]) => [k, escapeHtml(String(v))]))
        : undefined;
      return s(key, escaped);
    },
    resetStringsForTest() {
      island = null;
    },
  };
}
