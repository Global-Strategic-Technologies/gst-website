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
 *   - Copy here is ENGLISH. Other locales' copy lives in
 *     `src/i18n/<locale>/announcements.json` and is overlaid by
 *     `localizeAnnouncement` in `announcements-i18n.ts` (BL-153) — a separate
 *     module because Playwright specs import THIS file under plain Node, where
 *     the catalog loader cannot run. Pass the locale-free route path to
 *     `getActiveAnnouncement`, since `routes` are English paths.
 */

/**
 * One field of the under-band — a run of copy that may carry its own
 * destination. The band is a homogeneous list of these, rule-separated; the
 * main band's parts are a fixed tuple of unlike segments (badge · label ·
 * detail) and are a different thing entirely.
 *
 * Fields are INDEPENDENT: two fields mean two anchors, two destinations, two
 * accessible names and two analytics labels — not one link with two clickable
 * zones. A third field, or one deliberately left unlinked, costs no new code.
 */
export interface SashSubtextField {
  /** The rendered copy. */
  text: string;
  /**
   * Where this field links. Absent → the field renders as plain text rather
   * than an anchor, which is a legitimate state (an unlinked phrase beside a
   * linked one). There is deliberately no fallback to the announcement's own
   * `href`: with a field per destination there is no sensible single default.
   * Fragment destinations are guarded — tests/integration/announcement-anchor.test.ts
   * asserts the fragment's id exists in the target page's rendered markup.
   */
  href?: string;
  /**
   * Accessible name for this field's link; defaults to `text`. Set it only
   * when the visible copy would not read well aloud on its own — an
   * `aria-label` identical to the visible text is noise, so the component
   * omits the attribute in that case.
   */
  ariaLabel?: string;
}

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
   * Optional under-band: the smaller band below the main one, as an ordered
   * list of FIELDS the component renders rule-separated (page scale; hidden
   * 512–768px, and the second line of the ≤511 mobile strip — note the strip
   * shows badge + label + the fields, never `detail`). The sourced-claim rule
   * applies to every field like every segment, and the band as a whole has
   * its own copy budget — see Sash.astro's docblock. Setting this property
   * also widens the nav's desktop corner reserve (HeaderNavLinks.astro keys
   * on the band's class with :has()).
   */
  subtext?: SashSubtextField[];
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
    // 45° band; 10 chars incl. the chip sits well inside the proven ~13.
    label: 'GST MCP',
    // Copy here renders publicly on / and /hub/ and is republished to
    // claude.ai/design via .design-sync/, so every segment and field must be a
    // SOURCED claim (an earlier '2.0' shipped a version number nothing
    // published and was removed for it). Both fields are sourced by the page:
    // /hub/mcp/ markets the server as agents running the GST analysis tools,
    // and the free pilot tier is in its tier presentation (and the hub FAQ).
    // 32 characters of copy across the two fields, against a ceiling of ~34 —
    // one ceiling on every engine, because BL-144 pinned the mono (the spread
    // is now ≤0.5px where it used to be 18px). Measured 2026-08-29: 243px of
    // ink into 261px of usable chord, 18px spare. The rule and the two gaps
    // around it cost ~23px, so a THIRD field would spend more chord than its
    // copy alone. Count characters to sanity-check, then PROVE new copy by
    // running the sash E2E suite on all three engines: it measures the ink
    // against the corner and is the only budget that has ever been right.
    //
    // Two fields, two destinations: the pitch half deep-links to what the
    // server does, the offer half to the tier matrix it names. Each is its own
    // anchor — clicking "Automate analysis" must not land on the tiers.
    subtext: [
      {
        text: 'Automate analysis',
        href: '/hub/mcp/#what-it-does',
        ariaLabel: 'Automate analysis — see what the MCP server does',
      },
      {
        text: 'Free pilot tier',
        href: '/hub/mcp/#tiers',
        ariaLabel: 'Free pilot tier — see capability tiers',
      },
    ],
    href: '/hub/mcp/',
    scale: 'page',
    routes: ['/', '/hub/'],
    until: '2026-10-01',
    // Spoken form is overridden: the rule the component draws between fields
    // is a visual separator a screen reader would announce as "vertical line".
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
