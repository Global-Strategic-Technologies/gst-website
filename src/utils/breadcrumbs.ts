/**
 * Shared slug-to-display-name mapping for breadcrumb navigation.
 * Used by both the visual Breadcrumb component and the JSON-LD
 * BreadcrumbList schema in SEO.astro.
 *
 * The names live in the i18n catalogs (`src/i18n/<locale>/common.json`, keys
 * `breadcrumb.<slug>`), so a slug is named once per locale and the English
 * map below is DERIVED from the English catalog rather than duplicated —
 * `tests/unit/breadcrumbs.test.ts` still pins the slugs and names.
 */
import { DEFAULT_LOCALE, type Locale } from '../i18n/locales';
import { catalogFor } from '../i18n/t';

const PREFIX = 'breadcrumb.';

function namesFor(locale: Locale): Record<string, string> {
  const catalog = catalogFor(locale.code, 'common') ?? {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(catalog)) {
    if (key.startsWith(PREFIX) && key !== `${PREFIX}ariaLabel` && key !== `${PREFIX}home`) {
      out[key.slice(PREFIX.length)] = value;
    }
  }
  return out;
}

/** Canonical English slug-to-display-name mapping for all site routes. */
export const BREADCRUMB_NAMES: Record<string, string> = namesFor(DEFAULT_LOCALE);

/**
 * Convert a URL slug to a display name using the canonical mapping,
 * with a title-case fallback for unmapped slugs. `locale` defaults to English
 * so the existing one-argument callers are unchanged.
 */
export function slugToName(slug: string, locale: Locale = DEFAULT_LOCALE): string {
  const names = locale === DEFAULT_LOCALE ? BREADCRUMB_NAMES : namesFor(locale);
  return names[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
