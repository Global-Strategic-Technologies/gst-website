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
    name: 'Brand',
    path: '/brand/',
    // Scoped rather than baselined into KNOWN_SERIOUS, which is documented as
    // design debt that "can only decrease" — the wrong contract for a page whose
    // job is exhibiting components, including deliberately non-conformant ones.
    exclude: [
      // 12 lazy same-origin iframes of the same document. axe scans frames by
      // default, so whether they are loaded at scan time (engine, viewport and
      // machine dependent) would swing the count, and one violation inside the
      // shared document is counted once per embed. The wrapper is NOT excluded:
      // .responsive-demo-label is real 0.6rem text that should be checked.
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
      await page.goto(pg.path, { waitUntil: 'load' });

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
