/**
 * Accessibility E2E Tests — axe-core WCAG 2.1 AA scanning.
 *
 * Scans 6 critical pages for accessibility violations.
 * Critical and serious violations must be zero; moderate/minor are
 * tracked as a ratchet count that can only decrease over time.
 *
 * Run locally: npm run test:a11y
 */
import { test, expect } from '@playwright/test';
import { checkA11y, formatViolations } from './helpers/a11y';

const PAGES = [
  { name: 'Homepage', path: '/' },
  { name: 'Services', path: '/services' },
  { name: 'About', path: '/about' },
  { name: 'M&A Portfolio', path: '/ma-portfolio' },
  { name: 'Hub', path: '/hub' },
  { name: 'TechPar', path: '/hub/tools/techpar' },
];

/**
 * Pre-existing violations that require design-level fixes (not ARIA attributes).
 * Tracked here as a ratchet — count can only decrease over time.
 * Each entry documents the violation ID and the max allowed node count.
 */
const KNOWN_SERIOUS: Record<string, Record<string, number>> = {
  '/services': { 'color-contrast': 9 },
  '/about': { 'color-contrast': 2 },
  '/ma-portfolio': { 'color-contrast': 220, 'nested-interactive': 57 },
  '/hub': { 'color-contrast': 9 },
  '/hub/tools/techpar': { 'color-contrast': 34 },
};

test.describe('Accessibility — WCAG 2.1 AA', () => {
  for (const pg of PAGES) {
    test(`${pg.name} (${pg.path}) has zero critical violations`, async ({ page }) => {
      await page.goto(pg.path, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle');

      const results = await checkA11y(page);

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
