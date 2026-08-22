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
  /** Status word, inverted chip, leading. ≤ 4 chars. */
  badge?: string;
  /** Version or qualifier, rule-separated. Hidden below 768px. */
  detail?: string;
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
    label: 'MCP Server',
    // No `detail`: it previously read '2.0', which published a version claim
    // nothing sourced — the server is 0.57.0 and /hub/mcp/ states no version at
    // all. Any value here renders publicly on / and /hub/ and is republished to
    // claude.ai/design via .design-sync/, so it must be sourced before it ships.
    href: '/hub/mcp/',
    scale: 'page',
    routes: ['/', '/hub/'],
    until: '2026-10-01',
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
