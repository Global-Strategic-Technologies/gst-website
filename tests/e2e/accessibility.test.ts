/**
 * Accessibility E2E Tests — axe-core WCAG 2.1 AA + 2.2 AA scanning.
 *
 * Scans every route in `PAGES` for accessibility violations. Routes, not pages:
 * `/hub/mcp/docs/` is scanned three times, collapsed, expanded, and at a dense
 * contract pane.
 *
 * NO COUNT HERE, deliberately. This line and the lineage comment on `PAGES`
 * carried hand-maintained numbers that drifted (27, 29, then 33 against real
 * arrays of 30 and 35), as did DEVELOPER_TOOLING.md § Running locally. Count
 * the array.
 *
 * Each route also runs the orphan-class scan (BL-116, helpers/orphan-classes.ts)
 * in the same navigation, asserted only after axe so an orphan never hides an
 * accessibility result.
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
import { collectOrphanClasses, diffAgainstAllowlist } from './helpers/orphan-classes';

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
  // Two localized routes (BL-153). Every locale, live or draft, builds and is
  // reachable, so these scan at rest; the switcher (open) and band (shown) are
  // audited in localization.test.ts instead.
  { name: 'About (es)', path: '/es/about/' },
  { name: 'About (pt-BR)', path: '/pt/about/' },
  { name: 'M&A Portfolio', path: '/ma-portfolio/' },
  { name: 'Hub', path: '/hub/' },
  { name: 'TechPar', path: '/hub/tools/techpar/' },
  { name: 'Tech Debt Calculator', path: '/hub/tools/tech-debt-calculator/' },
  { name: 'MCP Server', path: '/hub/mcp/' },
  { name: 'MCP Get Started', path: '/hub/mcp/get-started/', waitFor: 'h1' },
  { name: 'MCP Using the Server', path: '/hub/mcp/using/', waitFor: 'h1' },
  { name: 'MCP Advanced Operations', path: '/hub/mcp/advanced-operations/', waitFor: 'h1' },
  { name: 'MCP Documentation', path: '/hub/mcp/docs/', waitFor: 'h1' },
  // Idle state only: the issued and error states are scanned in
  // hub-mcp-trial.test.ts, which stubs Turnstile and the mint endpoint.
  { name: 'MCP Trial Signup', path: '/hub/mcp/trial/', waitFor: 'h1' },
  // The from-code guide (BL-156) is localized like the trial, so it is scanned
  // once in English and once in Spanish: focusable <pre> snippets, copy
  // buttons and the English-only notice all sit in the tree at rest.
  { name: 'MCP From Code', path: '/hub/mcp/from-code/', waitFor: 'h1' },
  { name: 'MCP From Code (es)', path: '/es/hub/mcp/from-code/', waitFor: 'h1' },
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
  // 29 as of the IRL extractor; 30 as of the jobs lens with every row opened;
  // 32 as of the two localized About routes (BL-153); 33 as of the trial
  // signup (BL-155); 35 as of the from-code guide and its Spanish route (BL-156).
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
 * which is how the earlier rot was caught ('Tech Debt Calculator' carried 14 against a
 * real 1; 'TechPar' 4 against 1; 'M&A Portfolio' 2 against 1).
 *
 * KEYED BY `name`, NOT `path`. Two entries now scan the identical path
 * `/hub/mcp/docs/` — the Jobs lens collapsed and expanded — and they see
 * different node counts, so one path-keyed baseline would cover both and the
 * stale-baseline guard would fail on whichever scanned fewer. (A third entry
 * carries a hash, so it never collided.) Harmless while the map is empty, which
 * is exactly when it is cheap to close. Names are the key, so keep them unique.
 */
const KNOWN_SERIOUS: Record<string, Record<string, number>> = {};

/**
 * Classes that are legitimately rule-less, per route (BL-116). Keyed by `name`,
 * for the same reason as KNOWN_SERIOUS. Value = the reason, > 40 chars.
 *
 * This is a JS-HOOK DECLARATION, not a place to silence findings: an entry says
 * "a script or test selects this, and no rule should". A phantom styling class
 * gets stripped; a misnamed one gets its markup or CSS fixed. An entry that
 * stops being an orphan on its route fails the stale check below.
 */
const ALLOWED_UNSTYLED: Record<string, Record<string, string>> = {
  Brand: {
    'swatch-slider-r': 'Read by src/scripts/palette-manager.ts to drive the swatch colour editor.',
    'swatch-slider-g': 'Read by src/scripts/palette-manager.ts to drive the swatch colour editor.',
    'swatch-slider-b': 'Read by src/scripts/palette-manager.ts to drive the swatch colour editor.',
    'swatch-slider-a': 'Read by src/scripts/palette-manager.ts to drive the swatch colour editor.',
  },
};

/**
 * Rule-less classes rendered by the SITE CHROME, so on every route. Kept out of
 * the per-route map because listing one per route would be thirty-odd copies of
 * one reason. Stale-checked on the route below, where the chrome always renders.
 */
const SITE_WIDE_UNSTYLED: Record<string, string> = {
  'palette-panel__popout-label':
    'Span created by palette-manager.ts inside the site-wide PalettePanel, styled via its ' +
    'parent .palette-panel__popout; asserted on by palette-panel-mobile.test.ts.',
};
const SITE_WIDE_STALE_CHECK_ROUTE = 'Homepage';

/**
 * Every route is scanned in both themes (BL-162). Before it, every scan ran in
 * light, and light only because a fresh context has no `localStorage.theme`.
 */
const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];

/**
 * Apply the theme as a REAL LOAD: BaseLayout's head script reads
 * `localStorage.theme` before first paint. Never toggle `html.dark-theme` after
 * load to measure colours — a probe built that way for ADR-0035 repeatedly read
 * dark text over stale light surfaces (TEST_BEST_PRACTICES #29). Light is set
 * explicitly too, rather than relied on as a default (#21).
 */
async function applyTheme(page: Page, theme: Theme): Promise<void> {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem('theme', t);
    } catch {
      // Storage blocked: the sentinel below fails loudly instead.
    }
  }, theme);
}

/** body background = --bg-light's half for the theme (variables.css). */
const BODY_BG: Record<Theme, string> = {
  light: 'rgb(255, 255, 255)',
  dark: 'rgb(10, 10, 10)',
};

/** Sentinel: a mixed or wrong theme fails here instead of producing numbers. */
async function expectThemeLoaded(page: Page, theme: Theme): Promise<void> {
  const html = page.locator('html');
  if (theme === 'dark') await expect(html).toHaveClass(/(^|\s)dark-theme(\s|$)/);
  else await expect(html).not.toHaveClass(/(^|\s)dark-theme(\s|$)/);
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
    .toBe(BODY_BG[theme]);
}

test.describe('Accessibility — theme scans measure what they claim (BL-162)', () => {
  for (const theme of THEMES) {
    test(`${theme}: a real load renders the known ${theme} card surface`, async ({ page }) => {
      // Known-correct element: .project-card is light-dark(--bg-light, --bg-dark-secondary)
      // in cards.css — #ffffff / #1a1a1a. The ADR-0035 probe read #ffffff here in dark.
      await applyTheme(page, theme);
      // Same navigation as the 'M&A Portfolio' PAGES scan: the cards are server-
      // rendered, so `load` is the proven readiness signal on all three engines.
      await page.goto('/ma-portfolio/', { waitUntil: 'load' });
      const card = page.locator('.project-card').first();
      await expectThemeLoaded(page, theme);
      await expect
        .poll(() => card.evaluate((el) => getComputedStyle(el).backgroundColor))
        .toBe(theme === 'dark' ? 'rgb(26, 26, 26)' : 'rgb(255, 255, 255)');
    });

    test(`${theme}: the scan fails low contrast that the checkerboard used to hide`, async ({
      page,
    }) => {
      await applyTheme(page, theme);
      await page.goto('/', { waitUntil: 'load' });
      await expectThemeLoaded(page, theme);
      // Grey on the body background, clearly under 4.5:1 in either theme:
      // #999 on #ffffff = 2.85:1; #444 on #0a0a0a = 2.08:1.
      await page.evaluate(
        (ink) => {
          const p = document.createElement('p');
          p.id = 'bl162-contrast-probe';
          p.textContent = 'Contrast probe text for the BL-162 instrument check.';
          p.style.cssText = `color:${ink};background:transparent;font-size:16px;margin:0;`;
          document.querySelector('main')!.prepend(p);
        },
        theme === 'dark' ? '#444444' : '#999999'
      );

      // Scoped to the probe, so another node on the page cannot satisfy the assertions.
      const probeOnly = { include: ['#bl162-contrast-probe'] };
      const hidden = await checkA11y(page, probeOnly);
      expect(
        hidden.serious.find((v) => v.id === 'color-contrast'),
        'with the checkerboard hidden, axe must FAIL the probe'
      ).toBeDefined();

      const visible = await checkA11y(page, { ...probeOnly, hideDecorativeBackground: false });
      expect(
        visible.incomplete.find((v) => v.id === 'color-contrast'),
        'with the checkerboard visible, axe cannot judge the probe — the blindness this fixes'
      ).toBeDefined();
      expect(visible.serious.find((v) => v.id === 'color-contrast')).toBeUndefined();

      // The injected style is gone after the scan: later assertions see the real page.
      await expect
        .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundImage))
        .not.toBe('none');
    });
  }

  test('brand-teal text is exempt by ruling, and nothing else is (ADR-0035 § 1)', async ({
    page,
  }) => {
    // Light theme: the only one where teal text fails (2.06:1 on white).
    await applyTheme(page, 'light');
    await page.goto('/', { waitUntil: 'load' });
    await expectThemeLoaded(page, 'light');
    await page.evaluate(() => {
      const add = (id: string, color: string) => {
        const p = document.createElement('p');
        p.id = id;
        p.textContent = 'Brand teal exemption probe text.';
        p.style.cssText = `color:${color};background:transparent;font-size:16px;margin:0;`;
        document.querySelector('main')!.prepend(p);
      };
      add('bl162-teal', 'var(--color-primary)');
      // One channel off brand teal, same contrast: must NOT ride the exemption.
      add('bl162-near-teal', 'rgb(6, 205, 153)');
      // Brand teal, but near-invisible (about 1.1:1): under the floor, must fail.
      add('bl162-faint-teal', 'rgb(from var(--color-primary) r g b / 0.1)');
    });

    const teal = await checkA11y(page, { include: ['#bl162-teal'] });
    expect(teal.serious.find((v) => v.id === 'color-contrast')).toBeUndefined();
    expect(teal.brandTealExempt).toBe(1);

    const tealUnexempted = await checkA11y(page, {
      include: ['#bl162-teal'],
      exemptBrandTealText: false,
    });
    expect(
      tealUnexempted.serious.find((v) => v.id === 'color-contrast'),
      'without the exemption the probe must fail, or this test proves nothing'
    ).toBeDefined();

    const nearTeal = await checkA11y(page, { include: ['#bl162-near-teal'] });
    expect(nearTeal.serious.find((v) => v.id === 'color-contrast')).toBeDefined();
    expect(nearTeal.brandTealExempt).toBe(0);

    const faintTeal = await checkA11y(page, { include: ['#bl162-faint-teal'] });
    expect(
      faintTeal.serious.find((v) => v.id === 'color-contrast'),
      'teal below the floor is not the ruled brand teal — it must still fail'
    ).toBeDefined();
    expect(faintTeal.brandTealExempt).toBe(0);
  });
});

test.describe('Accessibility — WCAG 2.1 AA + 2.2 AA', () => {
  test('orphan-class allowlists name real routes (BL-116)', () => {
    // A renamed PAGES entry would otherwise silently switch off the site-wide
    // stale check, or strand a per-route allowlist that no test ever reads.
    const names = new Set(PAGES.map((p) => p.name));
    expect(names.has(SITE_WIDE_STALE_CHECK_ROUTE)).toBe(true);
    expect(Object.keys(ALLOWED_UNSTYLED).filter((n) => !names.has(n))).toEqual([]);
  });

  // Dim states (ADR-0038): scanned on two routes, not the full matrix. The dim
  // block swaps surfaces only, so the question is whether text still clears AA
  // on the gray/charcoal grounds — / and /brand exercise every token family.
  // Held to the SAME known-serious baseline as the base theme of each scheme.
  for (const [stored, base] of [
    ['dim-light', 'light'],
    ['dim-dark', 'dark'],
  ] as const) {
    for (const pg of PAGES.filter((p) => p.path === '/' || p.path === '/brand/')) {
      const baseName = base === 'light' ? pg.name : `${pg.name} (dark)`;
      test(`${pg.name} (${stored}) has no new critical or serious violations`, async ({ page }) => {
        await page.addInitScript((t) => {
          try {
            localStorage.setItem('theme', t);
          } catch {
            // Storage blocked: the class assertion below fails loudly instead.
          }
        }, stored);
        await page.goto(pg.path, { waitUntil: 'load' });
        await expect(page.locator('html')).toHaveClass(/(^|\s)theme-dim(\s|$)/);
        if (base === 'dark')
          await expect(page.locator('html')).toHaveClass(/(^|\s)dark-theme(\s|$)/);
        await expect
          .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
          .toBe(base === 'dark' ? 'rgb(28, 28, 28)' : 'rgb(235, 235, 235)');
        if (pg.setup) await pg.setup(page);

        const results = await checkA11y(page, pg.exclude ? { exclude: pg.exclude } : undefined);
        expect(results.critical, formatViolations(results.critical)).toHaveLength(0);
        const known = KNOWN_SERIOUS[baseName] ?? {};
        const breaches = results.serious.filter((v) => !(v.id in known) || v.nodes > known[v.id]);
        expect(
          breaches,
          `Serious a11y violations on ${pg.name} (${stored}):\n${formatViolations(breaches)}`
        ).toHaveLength(0);
      });
    }
  }

  // Palette 6 (ADR-0040): the one palette whose primary is split into a
  // text-safe green and a neon for dark pairings, so the one where pairing the
  // wrong one shows. Light and dim light are where its primary works hardest
  // (dark theme uses one neon for both). The brand-teal exemption is OFF: it
  // matches text by the live --color-primary, and on this palette that is the
  // green whose failures this scan exists to catch (ADR-0035 § 1 is teal-only).
  const PALETTE_6_ROUTES = ['/', '/services/', '/hub/tools/techpar/', '/brand/'];
  for (const [stored, bodyBg] of [
    ['light', 'rgb(255, 255, 255)'],
    ['dim-light', 'rgb(235, 235, 235)'],
  ] as const) {
    for (const pg of PAGES.filter((p) => PALETTE_6_ROUTES.includes(p.path))) {
      test(`${pg.name} (palette 6, ${stored}) has no critical or serious violations`, async ({
        page,
      }) => {
        await page.addInitScript((t) => {
          try {
            localStorage.setItem('palette', '6');
            localStorage.setItem('theme', t);
          } catch {
            // Storage blocked: the class assertion below fails loudly instead.
          }
        }, stored);
        if (pg.waitFor) {
          await page.goto(pg.path, { waitUntil: 'domcontentloaded' });
          await page
            .locator(pg.waitFor)
            .first()
            .waitFor({ state: 'attached', timeout: RADAR_SETTLE_TIMEOUT_MS });
        } else {
          await page.goto(pg.path, { waitUntil: 'load' });
        }
        await expect(page.locator('html')).toHaveClass(/(^|\s)palette-6(\s|$)/);
        await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark-theme(\s|$)/);
        await expect
          .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
          .toBe(bodyBg);
        if (pg.setup) await pg.setup(page);

        const results = await checkA11y(page, {
          ...(pg.exclude ? { exclude: pg.exclude } : {}),
          exemptBrandTealText: false,
        });
        expect(results.critical, formatViolations(results.critical)).toHaveLength(0);
        expect(
          results.serious,
          `Serious a11y violations on ${pg.name} (palette 6, ${stored}):\n${formatViolations(results.serious)}`
        ).toHaveLength(0);
      });
    }
  }

  for (const theme of THEMES) {
    for (const pg of PAGES) {
      const scanName = theme === 'light' ? pg.name : `${pg.name} (dark)`;
      test(`${scanName} (${pg.path}) has zero critical violations`, async ({ page }) => {
        await applyTheme(page, theme);
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

        await expectThemeLoaded(page, theme);

        if (pg.setup) await pg.setup(page);

        // Collected here, in the exact state axe scans; ASSERTED at the end.
        // Light only: which classes have rules does not depend on theme.
        const orphans = theme === 'light' ? await collectOrphanClasses(page) : [];

        const results = await checkA11y(page, pg.exclude ? { exclude: pg.exclude } : undefined);

        // Critical MUST always be zero
        if (results.critical.length > 0) {
          console.log('CRITICAL violations:\n' + formatViolations(results.critical));
        }
        expect(
          results.critical,
          `Critical a11y violations on ${scanName}:\n${formatViolations(results.critical)}`
        ).toHaveLength(0);

        // Serious: filter out known pre-existing violations (ratchet)
        const knownForPage = KNOWN_SERIOUS[scanName] ?? {};
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
          `New serious a11y violations on ${scanName}:\n${formatViolations(unknownSerious)}`
        ).toHaveLength(0);
        expect(
          ratchetBreaches,
          `Ratchet breached on ${scanName}:\n${formatViolations(ratchetBreaches)}`
        ).toHaveLength(0);

        // Stale-baseline guard. The ratchet only ever failed on EXCEEDING a baseline, so a
        // too-generous one passed forever — and three of seven had rotted into slack by
        // 2026-08-03 ('Tech Debt Calculator' carried 14 against a real 1). This is the same
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
          `Baseline is now slack on ${scanName} — the violation was fixed but KNOWN_SERIOUS ` +
            `was not ratcheted down. Lower it to the measured count (or delete the entry ` +
            `entirely when it reaches 0, so a future one fails as UNKNOWN):\n  ` +
            slack.map((e) => `${e.id}: baseline ${e.max}, actual ${e.actual}`).join('\n  ')
        ).toEqual([]);

        // Log known serious for visibility
        const knownSerious = results.serious.filter((v) => v.id in knownForPage);
        if (knownSerious.length > 0) {
          console.log(
            `[${scanName}] ${knownSerious.reduce((s, v) => s + v.nodes, 0)} known color-contrast nodes (ratchet baseline)`
          );
        }

        if (theme === 'dark') return;

        await test.step('no orphan classes (BL-116)', async () => {
          // Site-wide entries are checked for staleness once, on the chrome route;
          // elsewhere they are only excused (a route may legitimately not render one).
          const siteWideCheckedHere = pg.name === SITE_WIDE_STALE_CHECK_ROUTE;
          const routeOrphans = siteWideCheckedHere
            ? orphans
            : orphans.filter((c) => !Object.hasOwn(SITE_WIDE_UNSTYLED, c));
          const { unexpected, stale } = diffAgainstAllowlist(routeOrphans, {
            ...(siteWideCheckedHere ? SITE_WIDE_UNSTYLED : {}),
            ...(ALLOWED_UNSTYLED[pg.name] ?? {}),
          });
          expect(
            unexpected,
            `classes used on ${pg.name} (${pg.path}) with no CSS rule anywhere. Repoint the ` +
              `markup at the real class, add the rule, or strip a phantom class. Only add to ` +
              `ALLOWED_UNSTYLED if a script or test selects it.`
          ).toEqual([]);
          expect(
            stale,
            `ALLOWED_UNSTYLED entries for ${pg.name} are no longer orphans there — delete them.`
          ).toEqual([]);
        });
      });
    }
  }
});
