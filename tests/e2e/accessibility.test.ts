/**
 * Accessibility E2E Tests — axe-core WCAG 2.1 AA scanning.
 *
 * Scans 22 critical pages for accessibility violations.
 * Critical and serious violations must be zero; moderate/minor are
 * tracked as a ratchet count that can only decrease over time.
 *
 * Run locally: npm run test:a11y
 */
import { test, expect } from '@playwright/test';
import { checkA11y, formatViolations } from './helpers/a11y';
import { RADAR_SETTLED_SELECTOR, RADAR_SETTLE_TIMEOUT_MS } from './helpers/radar';

interface A11yPage {
  name: string;
  path: string;
  /** Selectors dropped from the scan. Every entry needs a reason — see /brand. */
  exclude?: string[];
  /**
   * Selector that must be present before scanning. Two uses:
   *
   *   1. Pages whose real content arrives after navigation — a `server:defer` island or
   *      a d3-rendered map — where scanning on `load` audits a placeholder.
   *   2. HEAVY pages, where `load` blocks on every subresource and, under worker
   *      contention against one dev server, times out the navigation itself rather
   *      than the assertion. `h1` is enough: it proves the document rendered without
   *      waiting on images and fonts.
   *
   * Pages without this keep the original `load` wait.
   */
  waitFor?: string;
}

const PAGES: A11yPage[] = [
  { name: 'Homepage', path: '/' },
  { name: 'Services', path: '/services/' },
  { name: 'About', path: '/about/' },
  { name: 'M&A Portfolio', path: '/ma-portfolio/' },
  { name: 'Hub', path: '/hub/' },
  { name: 'TechPar', path: '/hub/tools/techpar/' },
  { name: 'Tech Debt Calculator', path: '/hub/tools/tech-debt-calculator/' },
  // BL-096 AC3, 2026-08-03: 9 routes -> 22 (13 added, 9 of which needed a baseline). Deliberately NOT excluded here are the
  // dev-only gateway cards on /hub/library and /hub/tools (rendered under
  // `import.meta.env.DEV`, and Playwright's webServer runs the dev server). Asserting
  // zero rather than excluding them is the honest choice: a violation in markup that
  // never ships would otherwise become a baseline CI can never clear.
  { name: 'Privacy', path: '/privacy/' },
  { name: 'Terms', path: '/terms/' },
  { name: 'Booking Confirmed', path: '/booking-confirmed/' },
  // Reached the way 404-page.test.ts reaches it — `/404` directly can 308 under
  // trailingSlash before the error page renders.
  { name: '404', path: '/this-page-does-not-exist' },
  { name: 'Hub Library', path: '/hub/library/' },
  {
    name: 'Library — Business Architectures',
    path: '/hub/library/business-architectures/',
    waitFor: 'h1',
  },
  { name: 'Library — IRL', path: '/hub/library/information-request-list/' },
  { name: 'Library — VDR Structure', path: '/hub/library/vdr-structure/', waitFor: 'h1' },
  { name: 'Hub Tools', path: '/hub/tools/' },
  {
    name: 'IRL Generator',
    path: '/hub/tools/information-request-list-generator/',
    waitFor: 'h1',
  },
  { name: 'Diligence Machine', path: '/hub/tools/diligence-machine/', waitFor: 'h1' },
  { name: 'ICG', path: '/hub/tools/infrastructure-cost-governance/', waitFor: 'h1' },
  {
    name: 'Regulatory Map',
    path: '/hub/tools/regulatory-map/',
    // The map is d3-rendered after two blocking fetches, so `load` can resolve with an
    // empty <svg>. Wait for a painted country path instead of the lifecycle.
    waitFor: '#mapSvg path',
    exclude: [
      // Adding this route surfaced two REAL findings, both about the same unanswered
      // question — how the map is exposed to assistive tech — so both are filed as
      // BL-102 rather than settled inside a route addition:
      //
      //   - aria-prohibited-attr (110 nodes): every `.country-path` carries BOTH
      //     `role="presentation"` AND `aria-label="<country>"`. A global ARIA attribute
      //     suppresses the presentation role, so it is genuinely ambiguous whether 110
      //     country names are announced or silent. Deleting the labels and deleting the
      //     role are both defensible and produce opposite experiences.
      //   - nested-interactive (1): the <svg> is `role="img"` — "treat as one image" —
      //     while holding focusable descendants.
      //
      // EXCLUDED rather than baselined, deliberately. The 110 tracks the number of
      // country paths in the topojson, so a baseline would be a data-derived number
      // that breaks the day the map data changes — the same fixture-count trap that
      // nearly shipped on the radar feed. Scoped to the SVG only: the search, filter
      // chips, region cards and compliance panel all stay in scope.
      '#mapSvg',
    ],
  },
  {
    name: 'Radar',
    path: '/hub/radar/',
    // The feed is a `server:defer` island (ADR-0012), so this waits for it to
    // RESOLVE before scanning — otherwise axe audits the aria-hidden skeleton.
    //
    // Scope note, so nobody reads this as more coverage than it is: CI binds no
    // MCP_KEY_WEBSITE_RADAR, so the island resolves to `.radar-empty` and the
    // scan covers the shell — breadcrumb, headings, the filter pills (real
    // interactive controls), the empty state and the CTA. `FyiItem`/`WireItem`
    // only render with a bearer; use `npm run radar:stub` to cover those too.
    waitFor: RADAR_SETTLED_SELECTOR,
    exclude: [
      // FyiItem nests its article <a> inside the <details> <summary>, which axe
      // rates `nested-interactive`/serious. EXCLUDED, not baselined, and the
      // distinction is the point: per the /brand precedent this file follows,
      // exclusions are for "must not change" and KNOWN_SERIOUS is for debt that
      // should decrease. An operator investigated this exact finding on
      // 2026-08-02 — link is keyboard-reachable, Enter navigates without
      // toggling, the mouse case is handled by a stopPropagation, and no
      // screen-reader harm reproduced — and ruled the component works as
      // intended and is not to be changed. See BACKLOG.md § BL-095.
      //
      // Baselining it would also have been quietly broken: KNOWN_SERIOUS is a
      // MAX node count, and the count scales with however many annotated items
      // the feed holds — so a number measured against the 2-item stub fixture
      // would fail the first person to bind a real feed.
      //
      // Scoped to the <summary> only. The item BODY stays in scope, so a real
      // violation in the expanded content still fails.
      '.fyi-item__header',
    ],
  },
  {
    name: 'Brand',
    path: '/brand/',
    // Scoped rather than baselined into KNOWN_SERIOUS, which is documented as
    // design debt that "can only decrease" — the wrong contract for a page whose
    // job is exhibiting components, including deliberately non-conformant ones.
    // NOTE /brand no longer has a KNOWN_SERIOUS entry at all (BL-096, 2026-08-03);
    // these exclusions are the only instrument left on it, which is the intent.
    exclude: [
      // 12 lazy same-origin iframes across the four group documents (BL-097 —
      // one document per component group, embedded at three widths each). axe
      // scans frames by default, so whether they are loaded at scan time
      // (engine, viewport and machine dependent) would swing the count, and one
      // violation inside a group's document is counted once per width embed.
      // The wrapper is NOT excluded: .responsive-demo-label is real 0.6rem text
      // that should be checked.
      '.responsive-demo-frame iframe',
      // Specimens that force a :hover appearance, which for the primary and
      // secondary buttons is primary-on-transparent — low contrast ON PURPOSE.
      // Scoped to "hover" specifically: focus/error/readonly states only alter
      // outline and border, so they stay in scope. Their default-state twins sit
      // beside them in the same row and are scanned normally.
      '[data-demo-state="hover"]',
    ],
    // Deliberately NOT excluded: the contrast tables. The ~2.1:1 "Decorative only"
    // row documents a ratio via a text-less swatch span, and axe's color-contrast
    // rule only evaluates text nodes — so it was never in scope. The row's own
    // text is --text-secondary/--text-muted (AA), and the .a11y-badge tokens are
    // used site-wide, where a failure is real debt rather than a specimen artifact.
  },
];

/**
 * Pre-existing violations that require design-level fixes (not ARIA attributes).
 * Tracked as a ratchet — each entry is a MAX node count that can only decrease.
 *
 * Every entry re-measured 2026-08-03 under BL-096 and ratcheted to its actual count.
 *
 * What is left is ONE node per route, and it is the same node everywhere: the header's
 * active nav link, `--color-primary` (#05cd99) on #f5f5f5 = **1.88:1**. It is not
 * page-local — it surfaces on each route because each route has a header — so fixing it
 * is a token or header change affecting every page, which is deferred with the rest of
 * BL-096 rather than decided inside this one.
 *
 * Three of these had drifted into slack: techpar carried 4 against a real 1,
 * tech-debt-calculator 14 against 1, ma-portfolio 2 against 1. A ratchet that is never
 * re-measured stops being a ratchet, so the numbers below are all from a run rather
 * than from history.
 *
 * `/brand/` was 13 and is now **absent**, not zero-valued: the 8 `.a11y-badge` chips
 * plus `.brutal-tab--active`, `.brand-tag`, `.brutal-reg-card__scope`,
 * `.brutal-map-tap-bar__action` and the deleted `.project-card__cta` were all fixed.
 * An entry here would be slack for a violation that no longer exists — and its absence
 * means any new one fails as an UNKNOWN serious violation, which is louder.
 *
 * `/hub/radar/` was 2, now 1: `.filter-btn.active` was `--bg-light` on the category
 * colour; active pills now fill uniformly with `--color-primary` and take `--bg-dark`.
 */
const KNOWN_SERIOUS: Record<string, Record<string, number>> = {
  '/services/': { 'color-contrast': 1 },
  '/about/': { 'color-contrast': 1 },
  '/ma-portfolio/': { 'color-contrast': 1 },
  '/hub/': { 'color-contrast': 1 },
  '/hub/tools/techpar/': { 'color-contrast': 1 },
  '/hub/tools/tech-debt-calculator/': { 'color-contrast': 1 },
  '/hub/radar/': { 'color-contrast': 1 },
  // The 9 of 13 new routes that needed a baseline (BL-096 AC3, 2026-08-03). Each carries
  // exactly the same
  // single node as the routes above — the header's active nav link at 1.88:1 — which is
  // why they are uniform. `/privacy/`, `/terms/`, `/booking-confirmed/` and `/404` are
  // absent because they have NO active nav link and came back clean.
  '/hub/library/': { 'color-contrast': 1 },
  '/hub/library/business-architectures/': { 'color-contrast': 1 },
  '/hub/library/information-request-list/': { 'color-contrast': 1 },
  '/hub/library/vdr-structure/': { 'color-contrast': 1 },
  '/hub/tools/': { 'color-contrast': 1 },
  '/hub/tools/information-request-list-generator/': { 'color-contrast': 1 },
  '/hub/tools/diligence-machine/': { 'color-contrast': 1 },
  '/hub/tools/infrastructure-cost-governance/': { 'color-contrast': 1 },
  '/hub/tools/regulatory-map/': { 'color-contrast': 1 },
};

test.describe('Accessibility — WCAG 2.1 AA', () => {
  for (const pg of PAGES) {
    test(`${pg.name} (${pg.path}) has zero critical violations`, async ({ page }) => {
      if (pg.waitFor) {
        // Not `load`: it waits on the island's own subresource request, which
        // under worker contention times out the navigation itself (see the
        // `gotoRadar` docblock in helpers/radar.ts). Wait on the resulting DOM
        // instead of the lifecycle — that is the signal we actually need.
        await page.goto(pg.path, { waitUntil: 'domcontentloaded' });
        await page
          .locator(pg.waitFor)
          .first()
          .waitFor({ state: 'attached', timeout: RADAR_SETTLE_TIMEOUT_MS });
      } else {
        await page.goto(pg.path, { waitUntil: 'load' });
      }

      const results = await checkA11y(page, pg.exclude ? { exclude: pg.exclude } : undefined);

      // Critical MUST always be zero
      if (results.critical.length > 0) {
        console.log('CRITICAL violations:\n' + formatViolations(results.critical));
      }
      expect(
        results.critical,
        `Critical a11y violations on ${pg.name}:\n${formatViolations(results.critical)}`
      ).toHaveLength(0);

      // Serious: filter out known pre-existing violations (ratchet)
      const knownForPage = KNOWN_SERIOUS[pg.path] ?? {};
      const unknownSerious = results.serious.filter((v) => !(v.id in knownForPage));
      const ratchetBreaches = results.serious.filter(
        (v) => v.id in knownForPage && v.nodes > knownForPage[v.id]
      );

      if (unknownSerious.length > 0) {
        console.log('NEW serious violations:\n' + formatViolations(unknownSerious));
      }
      if (ratchetBreaches.length > 0) {
        console.log(
          'RATCHET breached (more nodes than baseline):\n' + formatViolations(ratchetBreaches)
        );
      }

      expect(
        unknownSerious,
        `New serious a11y violations on ${pg.name}:\n${formatViolations(unknownSerious)}`
      ).toHaveLength(0);
      expect(
        ratchetBreaches,
        `Ratchet breached on ${pg.name}:\n${formatViolations(ratchetBreaches)}`
      ).toHaveLength(0);

      // Stale-baseline guard. The ratchet only ever failed on EXCEEDING a baseline, so a
      // too-generous one passed forever — and three of seven had rotted into slack by
      // 2026-08-03 (tech-debt-calculator carried 14 against a real 1). This is the same
      // mechanism FLOOR_EXCEPTIONS uses for its allowlist, applied to the other one:
      // fixing a violation now FAILS until the number comes down with it.
      const slack = Object.entries(knownForPage)
        .map(([id, max]) => {
          const actual = results.serious.find((v) => v.id === id)?.nodes ?? 0;
          return { id, max, actual };
        })
        .filter(({ max, actual }) => actual < max);

      expect(
        slack,
        `Baseline is now slack on ${pg.name} — the violation was fixed but KNOWN_SERIOUS ` +
          `was not ratcheted down. Lower it to the measured count (or delete the entry ` +
          `entirely when it reaches 0, so a future one fails as UNKNOWN):\n  ` +
          slack.map((e) => `${e.id}: baseline ${e.max}, actual ${e.actual}`).join('\n  ')
      ).toEqual([]);

      // Log known serious for visibility
      const knownSerious = results.serious.filter((v) => v.id in knownForPage);
      if (knownSerious.length > 0) {
        console.log(
          `[${pg.name}] ${knownSerious.reduce((s, v) => s + v.nodes, 0)} known color-contrast nodes (ratchet baseline)`
        );
      }
    });
  }
});
