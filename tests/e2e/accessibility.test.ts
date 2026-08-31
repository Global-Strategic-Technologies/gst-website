/**
 * Accessibility E2E Tests — axe-core WCAG 2.1 AA + 2.2 AA scanning.
 *
 * Scans 27 critical pages for accessibility violations.
 * Critical and serious violations must be zero; moderate/minor are
 * tracked as a ratchet count that can only decrease over time.
 *
 * The 2.2 AA tag (`target-size`) was added 2026-08-03 once /brand's palette editor
 * was fixed — see the tag rationale in helpers/a11y.ts. BL-096 predicted it would
 * "hard-fail until BL-103 is resolved"; measured, 21 of the 22 routes were already
 * clean and /brand was the sole failure. Recorded because the prediction was
 * pessimistic and the cost of the guard was close to zero.
 *
 * Run locally: npm run test:a11y
 */
import { test, expect, type Page } from '@playwright/test';
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
  /**
   * Run after `waitFor` and before the scan, for markup that exists only once a
   * reader interacts. axe audits the rendered tree, so anything behind a closed
   * disclosure is not merely passing — it is invisible to the scan.
   */
  setup?: (page: Page) => Promise<void>;
}

const PAGES: A11yPage[] = [
  { name: 'Homepage', path: '/' },
  { name: 'Services', path: '/services/' },
  { name: 'About', path: '/about/' },
  { name: 'M&A Portfolio', path: '/ma-portfolio/' },
  { name: 'Hub', path: '/hub/' },
  { name: 'TechPar', path: '/hub/tools/techpar/' },
  { name: 'Tech Debt Calculator', path: '/hub/tools/tech-debt-calculator/' },
  { name: 'MCP Server', path: '/hub/mcp/' },
  { name: 'MCP Get Started', path: '/hub/mcp/get-started/', waitFor: 'h1' },
  { name: 'MCP Using the Server', path: '/hub/mcp/using/', waitFor: 'h1' },
  { name: 'MCP Advanced Operations', path: '/hub/mcp/advanced-operations/', waitFor: 'h1' },
  { name: 'MCP Documentation', path: '/hub/mcp/docs/', waitFor: 'h1' },
  // The row above loads with no hash, so the pane it scans is the four-argument
  // default. This one addresses the densest contract deliberately: it is the
  // only route where the sweep sees the fourteen argument-value controls at
  // all, and the only one that exercises the runnable call's own markup —
  // `target-size` on the controls, `td-has-header` on a three-column table, and
  // `scrollable-region-focusable` on the multi-line snippet. Without it all
  // three are structurally invisible to CI.
  {
    name: 'MCP Documentation (dense contract)',
    path: '/hub/mcp/docs/#cap-compute_techpar',
    waitFor: 'h1',
  },
  // The Jobs lens opens COLLAPSED (ADR-0026), so the row above scans twelve
  // summaries and nothing else: thirty step links and every job blurb sit
  // inside a closed `<details>` and are structurally invisible to axe. That is
  // a coverage loss against the cards this lens replaced, whose steps were
  // always in the tree. Open them all and scan again, for the same reason the
  // dense-contract row above exists.
  {
    name: 'MCP Documentation (jobs expanded)',
    path: '/hub/mcp/docs/',
    waitFor: '.mdoc-job',
    setup: async (page) => {
      const opened = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('details.mdoc-job')];
        rows.forEach((d) => ((d as HTMLDetailsElement).open = true));
        return rows.length;
      });
      // Not decoration: a selector that stops matching would make this route a
      // second scan of the collapsed page, passing while covering nothing.
      expect(opened).toBe(12);
      await expect(page.locator('.mdoc-step').first()).toBeVisible();
    },
  },
  // BL-096 AC3, 2026-08-03: 9 routes -> 22 (13 added, 9 of which needed a baseline);
  // 23 as of the /hub/mcp/ marketing page; 26 as of the three MCP onboarding
  // guides; 27 as of the capability reference; 28 as of its dense-contract pane;
  // 29 as of its jobs lens with every row opened.
  // Deliberately NOT excluded here are the
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
  {
    name: 'IRL Extractor',
    path: '/hub/tools/information-request-list-extractor/',
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
      // intended and is not to be changed.
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
    // The swatch controls are injected inside a requestIdleCallback, so `load` can
    // resolve with ZERO .swatch-slider nodes in the DOM — measured at 2 runs in 5,
    // all present by +300ms. Those sliders are the reason `target-size` is enabled
    // at all (BL-103), and four documents now say the AA floor is machine-enforced
    // rather than asserted, so the scan must not race the surface it enforces.
    waitFor: '.swatch-slider',
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
 * **It is empty, and that is the finished state, not an un-filled one.**
 *
 * It held 16 entries until 2026-08-03, every one of them `{ 'color-contrast': 1 }`, and
 * every one of them the SAME node: the header's active nav link, `--color-primary`
 * (#05cd99) on #f5f5f5 = 1.88:1. It appeared once per route because every route has a
 * header. BL-096 § Still owed closed it by moving the ink to `--color-tertiary`
 * (light-dark(#02724f, #05cd99) — 5.47:1 in light, unchanged in dark), so all 16 went to
 * zero together and the entries were deleted rather than zero-valued.
 *
 * Deleting beats zeroing: with no entry, a future violation on these routes fails as an
 * UNKNOWN serious violation — louder than sitting under a baseline of 0. `/brand/` was
 * emptied the same way earlier in BL-096 (13 → absent).
 *
 * Keep the mechanism. Two guards flank it and both still matter the moment anything is
 * added back: the ratchet fails on EXCEEDING a baseline, and the stale-baseline guard
 * below fails on falling under one. Between them, an entry of `n` asserts exactly `n` —
 * which is how the earlier rot was caught (tech-debt-calculator carried 14 against a
 * real 1; techpar 4 against 1; ma-portfolio 2 against 1).
 */
const KNOWN_SERIOUS: Record<string, Record<string, number>> = {};

test.describe('Accessibility — WCAG 2.1 AA + 2.2 AA', () => {
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

      if (pg.setup) await pg.setup(page);

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
