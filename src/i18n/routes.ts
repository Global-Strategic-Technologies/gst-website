/**
 * Route registry — which routes exist in every locale, and the two link
 * helpers every localized component uses.
 *
 * Tier A (ADR-0030, BL-153) is the set of pages a locale must carry to launch.
 * A page is added to a locale by adding it HERE and giving it a template in
 * `src/pages/[locale]/[...route].astro`'s template map — the catch-all's
 * `getStaticPaths` is `nonDefaultLocales() × TIER_A_ROUTES`, so nothing else
 * needs to know a page exists.
 *
 * Everything not listed (tool pages, guides, the portfolio, brand) is English
 * only. `localizedHref` returns those paths UNCHANGED for every locale, so a
 * Spanish page links to the English tool rather than to a `/es/…` 404.
 */
import { DEFAULT_LOCALE, LOCALES, isDefaultLocale, localeFromPath, type Locale } from './locales';

export interface RouteEntry {
  /** Stable id, also the template-map key in the catch-all and the catalog namespace for page copy. */
  id: string;
  /** Locale-free path with leading and trailing slash (`/hub/tools/`); `/` for home. */
  path: string;
}

export const TIER_A_ROUTES: readonly RouteEntry[] = [
  { id: 'home', path: '/' },
  { id: 'services', path: '/services/' },
  { id: 'about', path: '/about/' },
  { id: 'hub', path: '/hub/' },
  { id: 'hub-tools', path: '/hub/tools/' },
  { id: 'hub-mcp', path: '/hub/mcp/' },
  { id: 'privacy', path: '/privacy/' },
  { id: 'terms', path: '/terms/' },
];

/** Normalise `/about` and `/about/` to the registry's trailing-slash form. */
export function normalizeRoutePath(path: string): string {
  if (!path || path === '/') return '/';
  const withLead = path.startsWith('/') ? path : `/${path}`;
  return withLead.endsWith('/') ? withLead : `${withLead}/`;
}

export function routeFor(path: string): RouteEntry | undefined {
  const normalized = normalizeRoutePath(path);
  return TIER_A_ROUTES.find((r) => r.path === normalized);
}

export function isLocalizedRoute(path: string): boolean {
  return routeFor(path) !== undefined;
}

/**
 * The `route` param the catch-all's `getStaticPaths` emits for a registry
 * entry: no leading or trailing slash, `undefined` for home.
 */
export function routeParam(entry: RouteEntry): string | undefined {
  const trimmed = entry.path.replace(/^\/|\/$/g, '');
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Prefix a site path for `locale`. Rules, in order:
 *  - external, `mailto:`, `tel:`, hash-only and protocol-relative hrefs → unchanged;
 *  - the default locale → unchanged (English is unprefixed);
 *  - a registry route → `/<locale.path><path>`;
 *  - anything else → unchanged (English page; pair with the
 *    `common.notice.contentInEnglish` line when `locale` is not `en`).
 *
 * `path` may already carry a locale prefix (e.g. `Astro.url.pathname` on a
 * localized page); it is stripped first so the result never double-prefixes.
 */
export function localizedHref(path: string, locale: Locale): string {
  if (
    /^[a-z][a-z0-9+.-]*:/i.test(path) || // scheme: http:, mailto:, tel:
    path.startsWith('//') ||
    path.startsWith('#') ||
    !path.startsWith('/')
  ) {
    return path;
  }
  const { routePath } = localeFromPath(path);
  if (isDefaultLocale(locale)) return routePath;
  if (!isLocalizedRoute(routePath)) return routePath;
  return `/${locale.path}${normalizeRoutePath(routePath)}`;
}

/** The locale's home: `/` for English, `/es/` for Spanish. */
export function localeHome(locale: Locale): string {
  return isDefaultLocale(locale) ? '/' : `/${locale.path}/`;
}

/**
 * Locales that carry `routePath` and may be advertised as alternates of it.
 * A list of ONE means "no alternates": callers emit no hreflang cluster, no
 * `x-default`, no `og:locale:alternate` and no switcher. That is the result
 * for a route outside the registry (English only) and for a page in a DRAFT
 * locale — a draft page is `noindex`, and hreflang from it to English would be
 * non-reciprocal (English does not list drafts), which crawlers discard.
 * Otherwise: the live locales, in registry order, `current` among them.
 */
export function alternatesFor(routePath: string, current: Locale = DEFAULT_LOCALE): Locale[] {
  const normalized = normalizeRoutePath(localeFromPath(routePath).routePath);
  if (!isLocalizedRoute(normalized)) return [current];
  if (current.status === 'draft') return [current];
  return LOCALES.filter((l) => l.status === 'live');
}

/** Absolute URL of `routePath` in `locale`, for hreflang and og:locale:alternate. */
export function absoluteLocalizedUrl(
  siteOrigin: string,
  routePath: string,
  locale: Locale
): string {
  return `${siteOrigin}${localizedHref(routePath, locale)}`;
}
