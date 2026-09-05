/**
 * Typed translation lookup over the JSON catalogs in `src/i18n/<locale>/`.
 *
 * English is the schema: every key a template may ask for is a key of the
 * `en/<namespace>.json` file, and `useTranslations(locale, ns).t(key)` only
 * accepts those keys. The other locales' catalogs are loaded by glob; the
 * catalog-parity guard (`tests/integration/i18n-catalog-parity.test.ts`) keeps
 * their key sets identical to English, so a missing translation is caught by
 * `npm run test:docs` before it is caught here.
 *
 * Failure mode is LOUD. A non-default locale missing a key throws at build
 * time; it never falls back to English silently, because a half-translated
 * page under `/es/` is exactly the duplicate-content URL BL-153 declines.
 *
 * `{name}` placeholders are interpolated from `params`. `t()` returns plain
 * text (Astro escapes it); `tHtml()` is for strings that carry inline markup
 * and must be rendered with `set:html`. Its params are HTML-escaped and the
 * parity guard restricts the tags a `tHtml` string may contain.
 *
 * No runtime dependency: this is the ~100 lines BL-153 budgeted for. Plurals
 * are not needed for Tier A copy; add `Intl.PluralRules` here when a Tier B
 * tool needs them (ADR-0030).
 */
import { DEFAULT_LOCALE_CODE, type Locale } from './locales';
import { escapeHtml } from '../utils/escape-html';

import enCommon from './en/common.json';
import enAbout from './en/about.json';
import enAnnouncements from './en/announcements.json';
import enHome from './en/home.json';
import enHub from './en/hub.json';
import enHubMcp from './en/hub-mcp.json';
import enHubTools from './en/hub-tools.json';
import enPrivacy from './en/privacy.json';
import enServices from './en/services.json';
import enTerms from './en/terms.json';

/** The English catalogs, one static import per namespace: they ARE the types. */
export const EN = {
  common: enCommon,
  announcements: enAnnouncements,
  home: enHome,
  services: enServices,
  about: enAbout,
  hub: enHub,
  'hub-tools': enHubTools,
  'hub-mcp': enHubMcp,
  privacy: enPrivacy,
  terms: enTerms,
} as const;

export type Namespace = keyof typeof EN;
export type Key<N extends Namespace> = keyof (typeof EN)[N] & string;
export type Params = Record<string, string | number>;

type Catalog = Record<string, string>;

/**
 * Every `<locale>/<namespace>.json` (sidecars excluded), keyed
 * `"<locale>/<namespace>"`. Eager so the lookup is synchronous at render.
 */
const CATALOGS: Record<string, Catalog> = (() => {
  const modules = import.meta.glob<{ default: Catalog }>('./*/*.json', { eager: true });
  const out: Record<string, Catalog> = {};
  for (const [file, mod] of Object.entries(modules)) {
    // './pt-BR/common.json' → 'pt-BR/common'; skip './pt-BR/common.source.json'
    const m = /^\.\/([^/]+)\/([^/.]+)\.json$/.exec(file);
    if (!m) continue;
    out[`${m[1]}/${m[2]}`] = mod.default;
  }
  return out;
})();

export function catalogFor(localeCode: string, ns: Namespace): Catalog | undefined {
  return CATALOGS[`${localeCode}/${ns}`];
}

/** Locale codes that have at least one catalog on disk (used by the guard). */
export function catalogLocaleCodes(): string[] {
  return [...new Set(Object.keys(CATALOGS).map((k) => k.split('/')[0]))];
}

export function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole
  );
}

export interface Translator<N extends Namespace> {
  /** Plain-text lookup; Astro escapes the result when rendered as `{t(...)}`. */
  t(key: Key<N>, params?: Params): string;
  /** Markup-bearing lookup for `set:html`; params are escaped, the string is not. */
  tHtml(key: Key<N>, params?: Params): string;
  readonly locale: Locale;
  readonly namespace: N;
}

export function useTranslations<N extends Namespace>(locale: Locale, ns: N): Translator<N> {
  const catalog = catalogFor(locale.code, ns);
  const lookup = (key: string): string => {
    const value = catalog?.[key];
    if (value === undefined) {
      if (locale.code === DEFAULT_LOCALE_CODE) {
        const en = (EN[ns] as Catalog)[key];
        if (en !== undefined) return en;
      }
      throw new Error(`i18n: missing "${ns}.${key}" for locale "${locale.code}"`);
    }
    return value;
  };
  return {
    locale,
    namespace: ns,
    t: (key, params) => interpolate(lookup(key), params),
    tHtml: (key, params) => {
      if (!params) return lookup(key);
      const escaped: Params = {};
      // The shared escaper (src/utils/escape-html.ts) also escapes `'`, which
      // is what an attribute-position param needs.
      for (const [k, v] of Object.entries(params)) escaped[k] = escapeHtml(String(v));
      return interpolate(lookup(key), escaped);
    },
  };
}
