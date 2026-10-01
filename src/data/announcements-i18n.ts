/**
 * Localizing an announcement (BL-153) — kept OUT of `announcements.ts` on
 * purpose. That registry is imported by Playwright specs under plain Node
 * (`tests/e2e/announcement-sash.test.ts` derives the desktop corner box from
 * the live entry), where the catalog loader's `import.meta.glob` and untyped
 * JSON imports do not exist. This module carries the Vite-only dependency and
 * is imported only by the page templates and vitest.
 *
 * Copy comes from `src/i18n/<locale>/announcements.json` under `<id>.badge`,
 * `<id>.label`, `<id>.detail`, `<id>.subtext.<n>`, `<id>.subtext.<n>.ariaLabel`,
 * `<id>.ariaLabel` and `<id>.cardBadge`. The English catalog mirrors the
 * registry and `tests/unit/announcements.test.ts` holds the two equal, so the
 * registry stays the single source for English. Hrefs go through
 * `localizedHrefWithFragment` (shared with the localized sash E2E), so `/hub/mcp/trial/` becomes `/es/hub/mcp/trial/` for a
 * Tier A destination and stays English for anything else. `routes` is
 * structure, not copy, and is untouched. For English the entry is
 * returned as-is.
 *
 * Copy budget: the sash's band is a fixed chord, so a translation must fit the
 * same ~34 characters across the under-band fields (Sash.astro's docblock).
 * `tests/e2e/localization.test.ts` measures the ink against the corner on the
 * localized home pages exactly as announcement-sash.test.ts does for English.
 */
import type { Announcement } from './announcements';
import { isDefaultLocale, type Locale } from '../i18n/locales';
import { localizedHrefWithFragment } from '../i18n/routes';
import { catalogFor } from '../i18n/t';

export function localizeAnnouncement(entry: Announcement, locale: Locale): Announcement {
  if (isDefaultLocale(locale)) return entry;
  const catalog = catalogFor(locale.code, 'announcements') ?? {};
  const pick = (key: string, fallback: string | undefined) =>
    catalog[`${entry.id}.${key}`] ?? fallback;
  return {
    ...entry,
    label: pick('label', entry.label) as string,
    badge: pick('badge', entry.badge),
    detail: pick('detail', entry.detail),
    ariaLabel: pick('ariaLabel', entry.ariaLabel),
    href: localizedHrefWithFragment(entry.href, locale),
    subtext: entry.subtext?.map((field, index) => ({
      ...field,
      text: pick(`subtext.${index + 1}`, field.text) as string,
      ariaLabel: pick(`subtext.${index + 1}.ariaLabel`, field.ariaLabel),
      href: field.href === undefined ? undefined : localizedHrefWithFragment(field.href, locale),
    })),
  };
}

/** The card-scale "New" chip's word for `locale` (Sash.astro `label` at card scale). */
export function cardBadgeFor(entry: Announcement, locale: Locale): string {
  const fallback = entry.badge ?? 'New';
  if (isDefaultLocale(locale)) return fallback;
  return catalogFor(locale.code, 'announcements')?.[`${entry.id}.cardBadge`] ?? fallback;
}
