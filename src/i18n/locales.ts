/**
 * Locale registry — the single source for every locale the website knows.
 *
 * Imported by `astro.config.mjs` (for `i18n.locales` and the sitemap's
 * alternates), by `BaseLayout`/`SEO` (for `<html lang>`, `og:locale`,
 * hreflang), by the sitemap filter, and by the guard tests. Because the config
 * loads it in plain Node before Astro exists, this file must stay pure TS: no
 * `astro:*` imports, no `import.meta.env`.
 *
 * ## The model (ADR-0030)
 *
 * A locale is `language[-REGION]`. Resolution is exact → language → default:
 * `pt-BR` matches itself; `pt-PT` (no such locale yet) resolves to the first
 * `pt` locale, which is `pt-BR` today; `fr` resolves to English. A future
 * dialect (`pt-PT`, `es-MX`) is a NEW entry here and nothing else — the
 * resolver, the routing, the sitemap and the switcher all read this table.
 *
 * `region` as a user preference (currency, units) is a separate axis that
 * never selects a catalog and is deliberately not modelled here.
 *
 * ## `status`
 *
 * A `draft` locale builds and is reachable by URL, so translation review can
 * happen on preview deploys — but it is `noindex`, kept out of the sitemap,
 * emits no hreflang, and is offered by neither the switcher nor the band.
 *
 * `es` and `pt-BR` went live on 2026-09-05 by operator decision, ahead of a
 * native-speaker review, so the switcher and band ship at once; the catalogs
 * are first-pass translations and the review is still owed (see
 * `src/docs/development/LOCALIZATION.md` § Draft → live).
 *
 * Test runs can force liveness without editing this file:
 * `PUBLIC_I18N_LIVE_LOCALES=es,pt-BR` (comma-separated codes). It is read from
 * `process.env` — not `import.meta.env` — because the config imports this
 * module in Node. Page scripts never read it; the rendered markup carries the
 * live set they need.
 */

export type LocaleStatus = 'draft' | 'live';

export interface Locale {
  /** BCP 47 tag, the identity used everywhere in code: `en`, `es`, `pt-BR`. */
  code: string;
  /** URL segment (`/pt/…`); lowercase by convention. `en` is unprefixed but still needs a segment for Astro and the sitemap. */
  path: string;
  /** The language half of `code`, used by the resolver's second step. */
  language: string;
  /** `<html lang>` value. */
  htmlLang: string;
  /** Open Graph `og:locale` value (underscore form). */
  ogLocale: string;
  /** The tag handed to `Intl.*` constructors. */
  intl: string;
  /** Native full name, shown in the switcher menu. */
  name: string;
  /** Two-letter code shown on the switcher trigger. Never the region (`PT`, not `PT-BR`). */
  short: string;
  status: LocaleStatus;
}

const REGISTRY: readonly Locale[] = [
  {
    code: 'en',
    path: 'en',
    language: 'en',
    htmlLang: 'en',
    ogLocale: 'en_US',
    intl: 'en-US',
    name: 'English',
    short: 'EN',
    status: 'live',
  },
  {
    code: 'es',
    path: 'es',
    language: 'es',
    htmlLang: 'es',
    // Colombian Spanish (operator decision 2026-09-05): the catalogs use the
    // Colombian business register, and `Intl`/Open Graph carry the CO region.
    // The code, URL prefix and switcher name stay the bare `es` / "Español",
    // because the site has one Spanish, not a dialect set (ADR-0030 § 13).
    ogLocale: 'es_CO',
    intl: 'es-CO',
    name: 'Español',
    short: 'ES',
    status: 'live',
  },
  {
    code: 'pt-BR',
    path: 'pt',
    language: 'pt',
    htmlLang: 'pt-BR',
    ogLocale: 'pt_BR',
    intl: 'pt-BR',
    // Bare "Português", not "Português (Brasil)": the menu is content-width and
    // the region made it the widest row for nothing — there is one Portuguese.
    name: 'Português',
    short: 'PT',
    status: 'live',
  },
];

function liveOverride(): Set<string> | undefined {
  // `process` is absent in the browser; this module is server/build-only, but
  // the guard keeps an accidental client import from throwing.
  //
  // `process.env`, not `astro:env`: this file is imported by astro.config.mjs,
  // which runs before Astro's env layer exists, so the virtual module is not
  // available here — the same reason the config itself reads process.env. The
  // exception is recorded in DEVELOPER_TOOLING.md § Environment variables.
  const raw =
    // eslint-disable-next-line no-restricted-properties -- pre-Astro build input, see above
    typeof process !== 'undefined' ? process.env?.PUBLIC_I18N_LIVE_LOCALES : undefined;
  if (!raw) return undefined;
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

/** Every locale, with the test-run liveness override applied. */
export const LOCALES: readonly Locale[] = (() => {
  const override = liveOverride();
  if (!override) return REGISTRY;
  return REGISTRY.map((l) => (override.has(l.code) ? { ...l, status: 'live' as const } : l));
})();

export const DEFAULT_LOCALE_CODE = 'en';

export const DEFAULT_LOCALE: Locale = LOCALES.find((l) => l.code === DEFAULT_LOCALE_CODE)!;

export function isDefaultLocale(locale: Locale): boolean {
  return locale.code === DEFAULT_LOCALE_CODE;
}

/** Locales that are served under a URL prefix — everything but the default. */
export function nonDefaultLocales(): Locale[] {
  return LOCALES.filter((l) => !isDefaultLocale(l));
}

/** Locales that may be offered to visitors and to crawlers. */
export function liveLocales(): Locale[] {
  return LOCALES.filter((l) => l.status === 'live');
}

/** Exact `code` match, case-insensitive; `undefined` when unknown. */
export function findLocale(code: string | undefined | null): Locale | undefined {
  if (!code) return undefined;
  const lower = code.toLowerCase();
  return LOCALES.find((l) => l.code.toLowerCase() === lower);
}

/** Match by URL segment (`pt`), case-insensitive. */
export function localeByPath(segment: string | undefined | null): Locale | undefined {
  if (!segment) return undefined;
  const lower = segment.toLowerCase();
  return LOCALES.find((l) => l.path.toLowerCase() === lower);
}

/**
 * Resolve one candidate or an ordered list (e.g. `navigator.languages`) to a
 * locale: exact → language → default. The list is walked candidate by
 * candidate with BOTH steps applied to each, so `['pt-PT', 'es']` resolves to
 * `pt-BR` (language match on the first candidate) rather than `es`.
 *
 * Accepts `Astro.currentLocale`, which is `undefined` on a route outside any
 * i18n prefix; that resolves to the default.
 */
export function resolveLocale(candidate: string | readonly string[] | undefined | null): Locale {
  const list = candidate == null ? [] : typeof candidate === 'string' ? [candidate] : candidate;
  for (const raw of list) {
    if (!raw) continue;
    const exact = findLocale(raw);
    if (exact) return exact;
    const language = raw.toLowerCase().split('-')[0];
    // Prefer the locale whose whole code IS the language (`es` over a future
    // `es-MX`); otherwise the first locale of that language in registry order.
    const byLanguage =
      LOCALES.find((l) => l.code.toLowerCase() === language) ??
      LOCALES.find((l) => l.language.toLowerCase() === language);
    if (byLanguage) return byLanguage;
  }
  return DEFAULT_LOCALE;
}

/**
 * Split a pathname into its locale and the locale-free route path.
 * `/pt/about/` → `{ locale: pt-BR, routePath: '/about/' }`;
 * `/about/` → `{ locale: en, routePath: '/about/' }`;
 * `/pt/` → `{ locale: pt-BR, routePath: '/' }`.
 *
 * The default locale is unprefixed (`prefixDefaultLocale: false`), so `/en/…`
 * is NOT a route on this site and is returned as an English path verbatim —
 * it would 404, which is correct.
 */
export function localeFromPath(pathname: string): { locale: Locale; routePath: string } {
  const match = /^\/([^/]+)(\/.*)?$/.exec(pathname);
  if (match) {
    const locale = localeByPath(match[1]);
    if (locale && !isDefaultLocale(locale)) {
      return { locale, routePath: match[2] || '/' };
    }
  }
  return { locale: DEFAULT_LOCALE, routePath: pathname || '/' };
}

/** Shape for `astro.config.mjs` → `i18n.locales`. */
export function toAstroLocales(): { path: string; codes: [string, ...string[]] }[] {
  return LOCALES.map((l) => ({ path: l.path, codes: [l.code] }));
}

/**
 * Shape for `@astrojs/sitemap`'s `i18n` option: keys are URL segments, values
 * are hreflang codes. Only live locales are listed — a draft locale's URLs are
 * already dropped by the filter, and listing its segment here would be
 * harmless but misleading. `en` is present as a key even though no `/en/` URL
 * exists: the integration treats unprefixed URLs as `defaultLocale`.
 */
export function toSitemapI18n(): { defaultLocale: string; locales: Record<string, string> } {
  const locales: Record<string, string> = {};
  for (const l of liveLocales()) locales[l.path] = l.htmlLang;
  return { defaultLocale: DEFAULT_LOCALE.path, locales };
}
