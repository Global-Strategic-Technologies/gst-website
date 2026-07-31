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
 */
export const SITEMAP_EXCLUDED_PREFIXES = [
  '/brand',
  '/colors',
  '/booking-confirmed',
  '/404',
  '/500',
] as const;

/**
 * @param page Absolute URL of the candidate page, as supplied by the integration.
 * @returns `true` to include the page in the sitemap.
 */
export function sitemapFilter(page: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(page).pathname;
  } catch {
    // A non-absolute value means the integration's contract changed under us.
    // Fail open — a slightly over-full sitemap is recoverable, an empty one is
    // an outage-shaped SEO regression — but make the cause obvious in the build log.
    console.warn(`[sitemap-filter] Expected an absolute URL, received: ${page}`);
    return true;
  }

  // Normalise the trailing slash the site emits (`trailingSlash: true` in
  // vercel.json) so `/brand/` and `/brand` compare identically.
  const normalized = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;

  return !SITEMAP_EXCLUDED_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`)
  );
}
