/**
 * Announcement registry — `getActiveAnnouncement` is the whole allowlist and
 * retirement mechanism (src/data/announcements.ts). It decides, at BUILD time,
 * whether a page carries a sash at all, so a wrong answer is either a stale
 * "NEW" claim shipped indefinitely or a launch announcement that never appears.
 *
 * The behaviour tests drive off the registry rather than hard-coding today's
 * entry, so retiring `mcp-launch` (deleting it, or letting its window close) does
 * NOT fail this suite — silent retirement is the designed outcome, and a guard
 * that failed CI the day the sash disappeared would be arguing with the design.
 * `describe.skipIf` covers the empty-registry state for the same reason.
 */
import { describe, it, expect } from 'vitest';
import { ANNOUNCEMENTS, getActiveAnnouncement } from '@/data/announcements';

const EMPTY = ANNOUNCEMENTS.length === 0;

describe('ANNOUNCEMENTS registry', () => {
  it('every entry carries the fields the sash and its retirement depend on', () => {
    for (const entry of ANNOUNCEMENTS) {
      expect(entry.id, 'id (analytics label)').toBeTruthy();
      expect(entry.label, 'label (the one required segment)').toBeTruthy();
      expect(entry.href, `${entry.id}: href`).toMatch(/^\//);
      if (entry.subtextHref !== undefined) {
        // Fragment resolution is guarded separately by
        // tests/integration/announcement-anchor.test.ts.
        expect(entry.subtextHref, `${entry.id}: subtextHref`).toMatch(/^\//);
      }
      expect(entry.routes.length, `${entry.id}: routes`).toBeGreaterThan(0);
      expect(Number.isNaN(new Date(entry.until).getTime()), `${entry.id}: until parses`).toBe(
        false
      );
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
  const open = new Date(new Date(entry.until).getTime() - 1);
  const closed = new Date(entry.until);

  it('returns the entry on an allowlisted route while the window is open', () => {
    for (const route of entry.routes) {
      expect(getActiveAnnouncement(route, open)?.id, route).toBe(entry.id);
    }
  });

  it('matches with or without the trailing slash', () => {
    const withSlash = entry.routes[0].endsWith('/') ? entry.routes[0] : `${entry.routes[0]}/`;
    const withoutSlash = withSlash.replace(/\/+$/, '');
    expect(getActiveAnnouncement(withSlash, open)?.id).toBe(entry.id);
    expect(getActiveAnnouncement(withoutSlash || '/', open)?.id).toBe(entry.id);
  });

  it('treats the empty path as the root', () => {
    expect(getActiveAnnouncement('', open)).toEqual(getActiveAnnouncement('/', open));
  });

  it('returns null on a route outside the allowlist, including the announced page itself', () => {
    expect(getActiveAnnouncement(entry.href, open), 'the announced page').toBeNull();
    expect(getActiveAnnouncement('/an-unlisted-route/', open)).toBeNull();
    expect(
      getActiveAnnouncement(`${entry.routes[0].replace(/\/+$/, '')}/deeper/`, open),
      'routes are exact, not prefixes'
    ).toBeNull();
  });

  it('retires on its own once `until` has passed, and the boundary itself is closed', () => {
    expect(getActiveAnnouncement(entry.routes[0], closed)).toBeNull();
    expect(
      getActiveAnnouncement(entry.routes[0], new Date(closed.getTime() + 86_400_000))
    ).toBeNull();
  });

  it('a route with no open entry yields null even when the registry is populated', () => {
    const farFuture = new Date(
      Math.max(...ANNOUNCEMENTS.map((a) => new Date(a.until).getTime())) + 1
    );
    for (const route of entry.routes) {
      expect(getActiveAnnouncement(route, farFuture), route).toBeNull();
    }
  });
});
