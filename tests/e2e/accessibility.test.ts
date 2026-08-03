/**
 * Accessibility E2E Tests — axe-core WCAG 2.1 AA scanning.
 *
 * Scans 9 critical pages for accessibility violations.
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
   * Selector that must be present before scanning. Only needed for pages whose
   * real content arrives after navigation — i.e. a `server:defer` island, where
   * scanning on `load` would audit the skeleton placeholder instead of the DOM
   * a user ends up with. Pages without this keep the original `load` wait.
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
