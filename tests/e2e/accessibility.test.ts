/**
 * Accessibility E2E Tests — axe-core WCAG 2.1 AA scanning.
 *
 * Scans 8 critical pages for accessibility violations.
 * Critical and serious violations must be zero; moderate/minor are
 * tracked as a ratchet count that can only decrease over time.
 *
 * Run locally: npm run test:a11y
 */
import { test, expect } from '@playwright/test';
import { checkA11y, formatViolations } from './helpers/a11y';

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
    // are NOT scanned here because they never render without a bearer. Run the
    // suite with `npm run radar:stub` bound to cover those too.
    waitFor: '.fyi-item, .wire-item, .radar-empty',
  },
  {
    name: 'Brand',
    path: '/brand/',
    // Scoped rather than baselined into KNOWN_SERIOUS, which is documented as
    // design debt that "can only decrease" — the wrong contract for a page whose
    // job is exhibiting components, including deliberately non-conformant ones.
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
 * Tracked here as a ratchet — count can only decrease over time.
 * Each entry documents the violation ID and the max allowed node count.
 */
const KNOWN_SERIOUS: Record<string, Record<string, number>> = {
  '/services/': { 'color-contrast': 1 },
  '/about/': { 'color-contrast': 1 },
  '/ma-portfolio/': { 'color-contrast': 2 },
  '/hub/': { 'color-contrast': 1 },
  '/hub/tools/techpar/': { 'color-contrast': 4 },
  '/hub/tools/tech-debt-calculator/': { 'color-contrast': 14 },
  // /hub/radar, added 2026-08-02 with the route. Both nodes are --color-primary
  // (#05cd99) contrast, i.e. design-level token calls, not ARIA fixes:
  //
  //   1. a[href="/hub/"].active — the site-wide ACTIVE NAV LINK, #05cd99 on
  //      #f5f5f5 = 1.88:1. Not radar-specific; it is the same violation already
  //      baselined above on /hub/, surfacing here because this route is also
  //      under /hub. Fixing it is a header change affecting every page.
  //   2. .filter-btn.active — #ffffff on #05cd99 = 2.05:1, the "All" pill.
  //      Radar-local, and the worse offender of the two in practice because the
  //      pills are the page's only interactive control.
  //
  // Both are real text failing AA — deliberately NOT excluded, since an
  // exclusion would hide them, whereas this ratchet keeps them counted and can
  // only decrease. Raised as a design item rather than decided inside a test
  // change, matching the /brand -> BL-096 precedent below.
  //
  // `nested-interactive` (2 nodes) is CONTENT-DEPENDENT and therefore invisible
  // to CI: FyiItem puts an <a> inside a <summary>, and <summary> is itself an
  // interactive control, so it only fires once FYI items actually render — which
  // needs a bearer CI does not have. Reproduce with `npm run radar:stub`. The
  // node count tracks the number of FYI items in the fixture (2), NOT a
  // production count, so this entry cannot ratchet meaningfully; it is here so
  // the suite is runnable against real content rather than failing anyone who
  // binds a feed. The defect is real and tracked as BL-100 — the fix is an
  // interaction-model decision (does clicking a headline expand, or navigate?),
  // not something to settle inside a test change.
  '/hub/radar/': { 'color-contrast': 2, 'nested-interactive': 2 },
  // /brand, added 2026-07-29. The intent was to land it with no baseline at all;
  // the discovery run said otherwise, and the honest move is to record the number
  // rather than widen the exclusions until the prediction comes true.
  //
  // 8 of the 13 are .a11y-badge--pass/--fail, which IS page-local (styled in
  // brand.astro, used only in BrandAccessibility.astro). What does NOT work is
  // merely inverting it: contrast ratio is symmetric, so filling the badge with the
  // semantic token and using the page background as text colour is the same colour
  // pair and the identical 4.25:1 for --color-success on white. A filled badge with
  // a DIFFERENT foreground is a real option (#000 on #2e8b57 is 4.95:1), as are
  // changing the token light values or clearing WCAG's large-text threshold — which
  // is 18.66px bold, not 14px, so --text-2xs is nowhere near it. All three are
  // design calls on a page whose job is exhibiting the system, so they go to BL-096
  // rather than getting decided inside a touch-target change.
  //
  // The other 5 are .brutal-tab__label, .brand-tag, .project-card__cta,
  // .brutal-reg-card__scope and .brutal-map-tap-bar__action — real components,
  // already partly baselined on other routes.
  '/brand/': { 'color-contrast': 13 },
};

test.describe('Accessibility — WCAG 2.1 AA', () => {
  for (const pg of PAGES) {
    test(`${pg.name} (${pg.path}) has zero critical violations`, async ({ page }) => {
      if (pg.waitFor) {
        // `load` would block on the island's own request and can resolve before
        // the swap lands, so wait on the resulting DOM instead of the lifecycle.
        await page.goto(pg.path, { waitUntil: 'domcontentloaded' });
        await page.locator(pg.waitFor).first().waitFor({ state: 'attached', timeout: 15000 });
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
