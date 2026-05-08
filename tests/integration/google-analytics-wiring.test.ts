/**
 * Integration Tests for GoogleAnalytics Component — wiring contract
 *
 * Validates the static contract of the inline gtag init script in
 * `src/components/GoogleAnalytics.astro`.
 *
 * Why this test exists:
 *
 * In commit 9028f90 (2026-04-09) the inline init was changed from Google's
 * canonical `function gtag(){ dataLayer.push(arguments); }` pattern to a
 * rest-spread variant: `function gtag(...args){ dataLayer.push(args); }`.
 * The change satisfied ESLint's `prefer-rest-params` rule but silently broke
 * GA: the gtag.js runtime monkey-patches `dataLayer.push` and inspects pushed
 * values, requiring the Arguments object specifically. A real Array routes
 * through a different branch and no `/g/collect` beacons fire.
 *
 * The bug shipped to production for ~one month and Realtime stayed empty the
 * whole time. None of the pre-existing tests caught it because:
 *   - tests/unit/analytics.test.ts mocks `window.gtag` entirely (tests the
 *     utility wrapper around gtag, not the production gtag function)
 *   - tests/e2e/helpers/analytics.ts also replaces `window.gtag` with a
 *     recorder, so E2E never executes the production gtag pattern
 *   - the component had no integration test at all
 *
 * This test asserts on the source file directly (per the integration-test
 * pattern in this project — Astro components cannot be rendered in Vitest).
 * If the inline script changes shape, this test fails before the regression
 * reaches production.
 *
 * See: src/components/GoogleAnalytics.astro
 *      docs link in commit message of fix(analytics): use canonical gtag dataLayer pattern
 */

// globals: true in vitest.config.ts provides describe, it, expect, beforeAll

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const COMPONENT_PATH = resolve(__dirname, '../../src/components/GoogleAnalytics.astro');

describe('GoogleAnalytics component — gtag wiring contract', () => {
  let source: string;

  beforeAll(() => {
    source = readFileSync(COMPONENT_PATH, 'utf-8');
  });

  describe('canonical gtag pattern (regression: rest-spread breaks GA silently)', () => {
    it('defines gtag with the canonical Arguments-object pattern', () => {
      // gtag.js requires `dataLayer.push(arguments)`. The Arguments object
      // has a specific shape the runtime detects; pushing a real Array
      // routes through a code path that does not execute the gtag command.
      expect(source).toMatch(
        /function\s+gtag\s*\(\s*\)\s*{\s*dataLayer\.push\(arguments\)\s*;?\s*}/
      );
    });

    it('does NOT use rest-spread on the gtag function (the regression pattern)', () => {
      // The exact broken pattern that shipped:
      //   function gtag(...args) { dataLayer.push(args); }
      // ESLint's `prefer-rest-params` rule will push toward this pattern,
      // which is why the component has an inline `eslint-disable-next-line`
      // override on the gtag function. If a future maintainer "fixes" the
      // lint warning by removing the override and switching back, this test
      // catches it.
      expect(source).not.toMatch(/function\s+gtag\s*\(\s*\.\.\.[\w$]+\s*\)/);
      expect(source).not.toMatch(/dataLayer\.push\(args\)/);
    });

    it('does NOT wrap gtag config calls in requestIdleCallback', () => {
      // The deferral wrapper introduces a timing race with the async gtag.js
      // loader. FCP gain was negligible (loader is already async, inline
      // init is microsecond-scale). Removed in the same fix as the
      // rest-spread regression; we don't want it to creep back.
      expect(source).not.toMatch(/requestIdleCallback/);
    });
  });

  describe('initialization order (per Google gtag documentation)', () => {
    it('initializes window.dataLayer before defining the gtag function', () => {
      const dataLayerInit = source.indexOf('window.dataLayer = window.dataLayer');
      const gtagDefinition = source.search(/function\s+gtag\s*\(/);
      expect(dataLayerInit).toBeGreaterThan(-1);
      expect(gtagDefinition).toBeGreaterThan(-1);
      expect(dataLayerInit).toBeLessThan(gtagDefinition);
    });

    it("issues gtag('js', new Date()) before gtag('config', ...)", () => {
      // Google's documented pattern requires the 'js' command (which queues a
      // gtm.js timestamp) to fire before any 'config' command. Inverting the
      // order produces undefined behavior across gtag.js versions.
      const jsCall = source.search(/gtag\(\s*['"]js['"]\s*,/);
      const configCall = source.search(/gtag\(\s*['"]config['"]\s*,/);
      expect(jsCall).toBeGreaterThan(-1);
      expect(configCall).toBeGreaterThan(-1);
      expect(jsCall).toBeLessThan(configCall);
    });

    it('exposes gtag on window so the rest of the app can call gtag(event, ...)', () => {
      expect(source).toMatch(/window\.gtag\s*=\s*gtag/);
    });
  });

  describe('gtag.js loader script', () => {
    it('loads gtag.js from googletagmanager.com using the configured measurement ID', () => {
      // The src URL must reference the measurementId template variable so
      // PUBLIC_GA_MEASUREMENT_ID flows through correctly at build time.
      expect(source).toMatch(/googletagmanager\.com\/gtag\/js\?id=\$\{measurementId\}/);
    });

    it('marks the loader script as async (non-blocking)', () => {
      expect(source).toMatch(/<script[\s\S]*?\basync\b[\s\S]*?googletagmanager\.com/);
    });

    it('gates the loader behind isProduction so dev/preview do not ping GA', () => {
      // Test environments mock requests; dev should not ship pageviews.
      expect(source).toMatch(/\{isProduction\s*&&/);
    });
  });

  describe('config call shape', () => {
    it('passes send_page_view: true so the initial pageview fires automatically', () => {
      expect(source).toMatch(/send_page_view\s*:\s*true/);
    });

    it('uses the measurementId variable (not a hardcoded literal) in the config call', () => {
      // Hardcoding G-XXX would make the env-var override (PUBLIC_GA_MEASUREMENT_ID)
      // useless. The component must thread the variable through.
      expect(source).toMatch(/gtag\(\s*['"]config['"]\s*,\s*measurementId/);
    });
  });
});
