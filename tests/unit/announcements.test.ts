/**
 * Announcement registry — `getActiveAnnouncement` is the whole allowlist
 * (src/data/announcements.ts). It decides, at BUILD time, whether a page
 * carries a sash at all, so a wrong answer is either a sash on the wrong page
 * or an announcement that never appears. Retirement is deleting the entry;
 * there is no date window (removed 2026-10-01 by operator decision).
 *
 * The behaviour tests drive off the registry rather than hard-coding today's
 * entry, so retiring `mcp-launch` by deleting it does NOT fail this suite —
 * silent retirement is the designed outcome, and a guard that failed CI the
 * day the sash disappeared would be arguing with the design.
 * `describe.skipIf` covers the empty-registry state for the same reason.
 */
import { ANNOUNCEMENTS, getActiveAnnouncement } from '@/data/announcements';
import { cardBadgeFor, localizeAnnouncement } from '@/data/announcements-i18n';
import { LOCALES, findLocale } from '@/i18n/locales';
import { catalogFor } from '@/i18n/t';

const EMPTY = ANNOUNCEMENTS.length === 0;

describe.skipIf(EMPTY)('localizeAnnouncement (BL-153)', () => {
  const en = findLocale('en')!;

  it('returns the English entry untouched', () => {
    for (const entry of ANNOUNCEMENTS) expect(localizeAnnouncement(entry, en)).toBe(entry);
  });

  it('the English announcements catalog mirrors the registry, so English has one source', () => {
    // The catalog exists for key parity with the other locales; if it drifts
    // from the registry, a Spanish visitor gets copy translated from stale
    // English while the English visitor sees the registry.
    const catalog = catalogFor('en', 'announcements')!;
    for (const entry of ANNOUNCEMENTS) {
      expect(catalog[`${entry.id}.label`]).toBe(entry.label);
      expect(catalog[`${entry.id}.badge`]).toBe(entry.badge);
      expect(catalog[`${entry.id}.ariaLabel`]).toBe(entry.ariaLabel);
      for (const [i, field] of (entry.subtext ?? []).entries()) {
        expect(catalog[`${entry.id}.subtext.${i + 1}`]).toBe(field.text);
        expect(catalog[`${entry.id}.subtext.${i + 1}.ariaLabel`]).toBe(field.ariaLabel);
      }
    }
  });

  it.each(LOCALES.filter((l) => l.code !== 'en').map((l) => [l.code] as const))(
    '%s: copy comes from the catalog and Tier A hrefs are prefixed, fragments kept',
    (code) => {
      const locale = findLocale(code)!;
      for (const entry of ANNOUNCEMENTS) {
        const localized = localizeAnnouncement(entry, locale);
        const catalog = catalogFor(code, 'announcements')!;
        expect(localized.label).toBe(catalog[`${entry.id}.label`]);
        expect(localized.badge).toBe(catalog[`${entry.id}.badge`]);
        expect(localized.href).toBe(`/${locale.path}${entry.href}`);
        for (const [i, field] of (localized.subtext ?? []).entries()) {
          expect(field.text).toBe(catalog[`${entry.id}.subtext.${i + 1}`]);
          const original = entry.subtext![i].href!;
          const hashAt = original.indexOf('#');
          expect(field.href).toBe(
            `/${locale.path}${original.slice(0, hashAt)}${original.slice(hashAt)}`
          );
        }
        // Structure is untouched.
        expect(localized.routes).toEqual(entry.routes);
        expect(cardBadgeFor(entry, locale)).toBe(catalog[`${entry.id}.cardBadge`]);
      }
    }
  );

  it('keeps the under-band inside the sash copy budget in every locale', () => {
    // Sash.astro's docblock: ~34 characters across the fields. English is 32.
    // The E2E ink test proves the fit; this is the cheap first line.
    for (const locale of LOCALES) {
      for (const entry of ANNOUNCEMENTS) {
        const fields = localizeAnnouncement(entry, locale).subtext ?? [];
        const chars = fields.reduce((n, f) => n + f.text.length, 0);
        expect(chars, `${locale.code} ${entry.id} under-band characters`).toBeLessThanOrEqual(34);
      }
    }
  });
});

describe('ANNOUNCEMENTS registry', () => {
  it('every entry carries the fields the sash and its retirement depend on', () => {
    for (const entry of ANNOUNCEMENTS) {
      expect(entry.id, 'id (analytics label)').toBeTruthy();
      expect(entry.label, 'label (the one required segment)').toBeTruthy();
      expect(entry.href, `${entry.id}: href`).toMatch(/^\//);
      for (const [index, field] of (entry.subtext ?? []).entries()) {
        expect(field.text, `${entry.id}: subtext field ${index} text`).toBeTruthy();
        if (field.href !== undefined) {
          // Fragment resolution is guarded separately by
          // tests/integration/announcement-anchor.test.ts.
          expect(field.href, `${entry.id}: subtext field ${index} href`).toMatch(/^\//);
        }
      }
      expect(entry.routes.length, `${entry.id}: routes`).toBeGreaterThan(0);
    }
  });

  it('no entry lists the page it announces — a sash pointing at the current page is noise', () => {
    for (const entry of ANNOUNCEMENTS) {
      const normalized = entry.routes.map((r) => r.replace(/\/+$/, ''));
      expect(normalized, `${entry.id} announces ${entry.href}`).not.toContain(
        entry.href.replace(/\/+$/, '')
      );
    }
  });

  it('ids are unique (they are the analytics key)', () => {
    const ids = ANNOUNCEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe.skipIf(EMPTY)('getActiveAnnouncement', () => {
  const entry = ANNOUNCEMENTS[0];

  it('returns the entry on an allowlisted route', () => {
    for (const route of entry.routes) {
      expect(getActiveAnnouncement(route)?.id, route).toBe(entry.id);
    }
  });

  it('matches with or without the trailing slash', () => {
    const withSlash = entry.routes[0].endsWith('/') ? entry.routes[0] : `${entry.routes[0]}/`;
    const withoutSlash = withSlash.replace(/\/+$/, '');
    expect(getActiveAnnouncement(withSlash)?.id).toBe(entry.id);
    expect(getActiveAnnouncement(withoutSlash || '/')?.id).toBe(entry.id);
  });

  it('treats the empty path as the root', () => {
    expect(getActiveAnnouncement('')).toEqual(getActiveAnnouncement('/'));
  });

  it('returns null on a route outside the allowlist, including the announced page itself', () => {
    expect(getActiveAnnouncement(entry.href), 'the announced page').toBeNull();
    expect(getActiveAnnouncement('/an-unlisted-route/')).toBeNull();
    expect(
      getActiveAnnouncement(`${entry.routes[0].replace(/\/+$/, '')}/deeper/`),
      'routes are exact, not prefixes'
    ).toBeNull();
  });
});
