/**
 * Announcement registry — the single place a site-wide announcement sash is
 * added or retired.
 *
 * Imported by the pages that can carry a sash (`src/pages/index.astro`,
 * `src/pages/hub/index.astro`), which call `getActiveAnnouncement(path)` and
 * render `Sash.astro` with the entry. The component itself knows nothing about
 * MCP or any other subject: announcing a future release is one entry here — no
 * new component, no new CSS, no new tokens.
 *
 * Rules that are load-bearing, not stylistic:
 *   - ONE at a time. Two sashes cannot share a corner; the first entry whose
 *     window is open and whose `routes` match wins, and the rest are queued copy.
 *   - `routes` is a mount ALLOWLIST that never contains the announced page
 *     itself — a sash pointing at the page you are on is noise.
 *   - `until` is required. "New" is a dated claim, so the sash self-retires
 *     instead of waiting for someone to remember. Note the site is statically
 *     built: the window is evaluated at BUILD time, so an entry retires on the
 *     first deploy after its date, not at midnight.
 *   - `scale` is chosen by copy length against the budget in
 *     `Sash.astro`'s docblock, not by importance.
 */

export interface Announcement {
  /** Stable id — also the analytics label suffix (`Sash: <id>`). */
  id: string;
  /** The subject. The one required segment. */
  label: string;
  /** Status word chip (secondary-accent fill), leading. ≤ 4 chars. */
  badge?: string;
  /** Version or qualifier, rule-separated. Hidden below 768px. */
  detail?: string;
  /**
   * Optional subtext on the smaller band below the main one (page scale;
   * hidden 512–768px, and the second line of the ≤511 mobile strip — note the
   * strip shows badge + label + subtext, never `detail`). The sourced-claim
   * rule applies to it like every segment, and it has its own copy budget —
   * see Sash.astro's docblock. Setting it also widens the nav's desktop
   * corner reserve (HeaderNavLinks.astro keys on the band's class with
   * :has()).
   */
  subtext?: string;
  /**
   * Where the under-band links (defaults to `href`). Fragment destinations
   * are guarded: tests/integration/announcement-anchor.test.ts asserts the
   * fragment's id exists in the target page's rendered markup.
   */
  subtextHref?: string;
  /**
   * Accessible name for the under-band link; defaults to the raw subtext.
   * Override when the subtext carries a visual separator a screen reader
   * would read out (a literal pipe is spoken "vertical line").
   */
  subtextAriaLabel?: string;
  /** Where the sash links. Its own page must not appear in `routes`. */
  href: string;
  /** Band geometry; defaults to 'page'. */
  scale?: 'page' | 'card';
  /** Mount allowlist, matched with or without a trailing slash. */
  routes: string[];
  /** ISO date. The entry is live while this instant is still in the future. */
  until: string;
  /** Full spoken announcement; Sash.astro composes a default when absent. */
  ariaLabel?: string;
}

export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'mcp-launch',
    badge: 'New',
    // 'GST MCP', with no `detail`: the main band names the thing, and the
    // value pitch moved to the under-band, which has its own (larger) budget —
    // see the table in Sash.astro. The segments share ONE width budget on the
    // 45° band; 10 chars incl. the chip sits well inside the proven ~16.
    label: 'GST MCP',
    // Copy here renders publicly on / and /hub/ and is republished to
    // claude.ai/design via .design-sync/, so every segment must be a SOURCED
    // claim (an earlier '2.0' shipped a version number nothing published and
    // was removed for it). Both halves are sourced by the announced page:
    // /hub/mcp/ markets the server as agents running the GST analysis tools,
    // and the free pilot tier is in its tier presentation (and the hub FAQ).
    // 35 chars — inside the measured 36-char under-band ceiling (Sash.astro).
    subtext: 'Automate analysis | Free pilot tier',
    // The under-band deep-links to the tier matrix the subtext is about.
    subtextHref: '/hub/mcp/#tiers',
    subtextAriaLabel: 'Automate analysis, free pilot tier — see capability tiers',
    href: '/hub/mcp/',
    scale: 'page',
    routes: ['/', '/hub/'],
    until: '2026-10-01',
    // Spoken form is overridden: the literal pipe in `subtext` is a visual
    // separator that a screen reader would announce as "vertical line".
    ariaLabel: 'New: GST MCP — automate analysis, free pilot tier — open the linked page',
  },
];

/** `/hub/` and `/hub` are the same route; `/` stays `/`. */
function normalizeRoute(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/**
 * The announcement to render on `path`, or `null` when none applies.
 *
 * Returns the FIRST entry (registry order) that is both still open
 * (`until` is in the future) and allowlisted for the normalised path.
 */
export function getActiveAnnouncement(path: string, now: Date = new Date()): Announcement | null {
  const route = normalizeRoute(path);
  return (
    ANNOUNCEMENTS.find(
      (entry) =>
        new Date(entry.until).getTime() > now.getTime() &&
        entry.routes.some((allowed) => normalizeRoute(allowed) === route)
    ) ?? null
  );
}
