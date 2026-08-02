/**
 * Sitemap inclusion filter for `@astrojs/sitemap`.
 *
 * ## The contract that makes this file exist
 *
 * `filter` receives the **absolute URL** of a page, not its path — e.g.
 * `https://globalstrategic.tech/brand/`, never `/brand/`. That is documented
 * ("the function receives the full URL of a page") and verifiable in the
 * integration: `@astrojs/sitemap/dist/index.js` builds
 * `new URL(fullPath, finalSiteUrl).href` before invoking this.
 *
 * The previous inline implementation used `page.includes('/brand')`, which
 * worked only by coincidence — a substring test happens to match inside an
 * absolute URL. Anyone "tidying" it to `startsWith('/brand')` would have
 * silently emptied the exclusion list while every test stayed green. Parsing
 * the URL makes the contract explicit in code rather than in a comment, and
 * prefix-matching the pathname stops a future `/brands-we-advise/` route from
 * being excluded by a bare substring match on `/brand`.
 *
 * ## Keep this list in sync with `noindex`
 *
 * Every page rendered with BaseLayout's `noindex` prop must appear here.
 * Submitting a URL in the sitemap while telling crawlers to drop it is a
 * contradictory signal. `tests/unit/indexability.test.ts` enforces the pairing.
 */

/**
 * Path prefixes excluded from the sitemap.
 *
 * `/404` and `/500` are **redundant but deliberate**: `@astrojs/sitemap`
 * already drops status-code pages before any user filter runs (it keeps its
 * own `STATUS_CODE_PAGES` set). They are listed so this file reads as the
 * single answer to "what is kept out of the sitemap, and why" — but note that
 * a test asserting their absence passes whatever this file says, so such a
 * test proves nothing about this filter.
 *
 * `/colors` is a bare 301 to `/brand#colors` with no layout, so it cannot
 * carry a `noindex` tag; the exclusion here is the only thing keeping it out.
 *
 * `/hub/radar` is the inverse of `/colors`: it DOES carry `noindex`, and this
 * entry is the required other half of that pairing. Its feed rotates wholly
 * every 6h and has no per-item permalinks, so there is nothing stable for an
 * index to hold — see ADR-0012. Note the prefix match below stops at
 * `/hub/radar` and anything beneath it; `/hub/` itself stays in the sitemap.
 */
export const SITEMAP_EXCLUDED_PREFIXES = [
  '/brand',
  '/colors',
  '/booking-confirmed',
  '/hub/radar',
  '/404',
  '/500',
] as const;

/**
 * @param page The candidate page. The integration supplies an absolute URL;
 *   a bare pathname is also accepted and behaves identically, so a change to
 *   that contract is a no-op rather than a silent failure.
 * @returns `true` to include the page in the sitemap.
 */
export function sitemapFilter(page: string): boolean {
  // The base is ignored when `page` is absolute (the documented contract) and
  // used when it is a bare path. That makes the one realistic contract drift —
  // the integration starting to pass pathnames — a no-op rather than a silent
  // failure mode, so there is no fail-open branch left to reason about.
  //
  // Assumes `astro.config.mjs` sets no `base`. If one is ever added, pathnames
  // gain that prefix and every exclusion below silently stops matching.
  const pathname = new URL(page, 'https://sitemap-filter.invalid').pathname;

  // Normalise the trailing slash the site emits (`trailingSlash: true` in
  // vercel.json) so `/brand/` and `/brand` compare identically.
  const normalized = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;

  return !SITEMAP_EXCLUDED_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`)
  );
}
