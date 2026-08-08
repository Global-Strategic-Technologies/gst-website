import { test, expect } from '@playwright/test';

import type { ResponsiveDemoGroup } from '../../src/utils/responsive-demo-groups';

test.describe('Brand Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/brand/', { waitUntil: 'domcontentloaded' });
  });

  test.describe('Indexability', () => {
    test('should be excluded from the search index', async ({ page }) => {
      // /brand is an internal design reference, not marketing content, and has
      // been sitemap-excluded since before this tag existed. `follow` keeps
      // outbound link equity flowing. Asserts the tag is actually SERVED,
      // which tests/unit/indexability.test.ts cannot check from source.
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        'content',
        'noindex, follow'
      );
    });
  });

  test.describe('Page Structure', () => {
    test('should render all 12 content sections', async ({ page }) => {
      const sectionIds = [
        'identity',
        'colors',
        'typography',
        'spacing',
        'shadows',
        'transitions',
        'components',
        'component-states',
        'accessibility',
        'responsive-demos',
        'ui-library',
        'toc-component',
      ];
      for (const id of sectionIds) {
        const section = page.locator(`#${id}`);
        await expect(section).toBeAttached();
      }
    });

    test('should set data-palette-always attribute on html', async ({ page }) => {
      const hasAttr = await page.evaluate(() =>
        document.documentElement.hasAttribute('data-palette-always')
      );
      expect(hasAttr).toBe(true);
    });
  });

  test.describe('Table of Contents - Desktop', () => {
    test('should display sidebar TOC with section links', async ({ page }) => {
      const toc = page.getByTestId('brand-toc');
      await expect(toc).toBeVisible();

      const links = toc.locator('.toc__list > li a');
      const count = await links.count();
      expect(count).toBeGreaterThanOrEqual(12);
    });

    test('should generate sublists from h3 headings', async ({ page }) => {
      // Wait for JS to build sublists
      await page.waitForFunction(() => document.querySelectorAll('.toc__sublist').length > 0, {
        timeout: 10000,
      });

      // Identity section has 3 h3s (brand-voice, wordmark, logo-usage)
      const identitySubs = page.locator('.toc__layer[data-section="identity"] .toc__sublist li');
      const count = await identitySubs.count();
      expect(count).toBe(3);
    });

    test('should NOT have is-collapsed class on desktop viewport', async ({ page }) => {
      const isCollapsed = await page.evaluate(() =>
        document.querySelector('.toc')?.classList.contains('is-collapsed')
      );
      expect(isCollapsed).toBe(false);
    });
  });

  test.describe('Table of Contents - Mobile', () => {
    test('should start collapsed on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 480, height: 800 });
      // Wait for matchMedia listener to apply collapsed state
      await page.waitForFunction(
        () => document.querySelector('.toc')?.classList.contains('is-collapsed'),
        { timeout: 10000 }
      );
    });

    test('should expand TOC when heading is clicked on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 480, height: 800 });
      await page.waitForFunction(
        () => document.querySelector('.toc')?.classList.contains('is-collapsed'),
        { timeout: 10000 }
      );

      // Click heading to expand
      await page.evaluate(() => {
        document
          .querySelector('.toc__heading')
          ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      await page.waitForFunction(
        () => !document.querySelector('.toc')?.classList.contains('is-collapsed'),
        { timeout: 10000 }
      );
    });

    test('should collapse TOC again on second click', async ({ page }) => {
      await page.setViewportSize({ width: 480, height: 800 });
      await page.waitForFunction(
        () => document.querySelector('.toc')?.classList.contains('is-collapsed'),
        { timeout: 10000 }
      );

      // Expand
      await page.evaluate(() => {
        document
          .querySelector('.toc__heading')
          ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await page.waitForFunction(
        () => !document.querySelector('.toc')?.classList.contains('is-collapsed'),
        { timeout: 10000 }
      );

      // Collapse again
      await page.evaluate(() => {
        document
          .querySelector('.toc__heading')
          ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await page.waitForFunction(
        () => document.querySelector('.toc')?.classList.contains('is-collapsed'),
        { timeout: 10000 }
      );
    });
  });

  test.describe('Scroll Spy', () => {
    test('should highlight first section link on initial load', async ({ page }) => {
      await page.waitForFunction(
        () =>
          document.querySelector('.toc__list a.is-active')?.getAttribute('href') === '#identity',
        { timeout: 10000 }
      );
    });

    test('should only have one active link at a time', async ({ page }) => {
      const activeCount = await page.evaluate(
        () => document.querySelectorAll('.toc__list a.is-active').length
      );
      expect(activeCount).toBe(1);
    });
  });

  /**
   * filter.css, map.css, portfolio.css and progress.css are deliberately code-split
   * out of global.css and imported only by the pages that use them. The brand page
   * renders specimens for all four, so it imports them explicitly (brand.astro).
   * Without those imports the specimens render as unstyled markup — which is worse
   * than omitting them, since a reader concludes the documented class is broken.
   * These assertions fail if an import is dropped or a new sheet is code-split
   * without adding it here.
   */
  test.describe('Code-split component CSS is loaded', () => {
    test('filter drawer and chips are styled', async ({ page }) => {
      const drawer = page.locator('.brutal-filter-drawer').first();
      await expect(drawer).toBeVisible();
      expect(
        await drawer.evaluate((el) => getComputedStyle(el).borderLeftWidth),
        'filter drawer primary left border — filter.css not loaded?'
      ).toBe('3px');

      const chipBorder = await page
        .locator('.brutal-filter-chip')
        .first()
        .evaluate((el) => getComputedStyle(el).borderTopWidth);
      expect(
        parseFloat(chipBorder),
        'filter chip outline — filter.css not loaded?'
      ).toBeGreaterThan(0);
    });

    test('map tap bar, project card and wizard progress are styled', async ({ page }) => {
      // `gap` is the discriminating property — it exists only in map.css, so this
      // fails if the sheet is absent. Do not assert `display`/`border`: the
      // specimen would satisfy those from markup alone if inline styles return.
      const tapBar = page.locator('.brutal-map-tap-bar').first();
      await expect(tapBar).toBeVisible();
      expect(
        await tapBar.evaluate((el) => getComputedStyle(el).columnGap),
        'map tap bar gap (--spacing-md) — map.css not loaded?'
      ).toBe('12px');

      const cardBorder = await page
        .locator('.brutal-project-card')
        .first()
        .evaluate((el) => getComputedStyle(el).borderTopWidth);
      expect(
        parseFloat(cardBorder),
        'project card border — portfolio.css not loaded?'
      ).toBeGreaterThan(0);

      expect(
        await page
          .locator('.tool-wizard-progress')
          .first()
          .evaluate((el) => getComputedStyle(el).display),
        'wizard progress flex layout — progress.css not loaded?'
      ).toBe('flex');
    });
  });

  /**
   * The Responsive Behavior section embeds /brand/responsive-frame/<group> in
   * same-origin iframes. The site default (`X-Frame-Options: DENY` + `frame-ancestors 'none'`)
   * forbids framing by every origin INCLUDING this one, so without the documented
   * route exception every frame is blocked with ERR_BLOCKED_BY_RESPONSE and renders
   * empty — silently, with no build error. That shipped and went unnoticed.
   *
   * The iframes are `loading="lazy"`, so they must be scrolled into view before
   * they load at all; a check that skips the scroll passes against empty frames.
   */
  test.describe('Responsive-demo iframes render', () => {
    test('every frame loads content rather than being blocked, and is titled', async ({ page }) => {
      await page.locator('#responsive-demos').scrollIntoViewIfNeeded();
      const frames = page.locator('.responsive-demo-frame iframe');
      const total = await frames.count();
      expect(total, 'responsive demo iframes present').toBeGreaterThan(0);

      for (let i = 0; i < total; i++) {
        await frames.nth(i).scrollIntoViewIfNeeded();
      }

      await expect
        .poll(
          async () =>
            frames.evaluateAll(
              (els) =>
                els.filter(
                  (el) =>
                    ((el as HTMLIFrameElement).contentDocument?.body?.children.length ?? 0) > 0
                ).length
            ),
          { message: 'iframes rendering content — framing blocked by security headers?' }
        )
        .toBe(total);

      // Asserted here rather than in its own test: the axe scan excludes
      // `.responsive-demo-frame iframe` (12 lazy same-origin frames across the four
      // group documents would make the violation count nondeterministic and
      // triple-counted), which also drops axe's `frame-title` check. Folding it in
      // keeps that coverage without a second parallel load of /brand racing these
      // same lazy frames.
      const untitled = await frames.evaluateAll((els) =>
        els
          .map((el, i) => ({
            i,
            src: new URL((el as HTMLIFrameElement).src).pathname,
            t: (el as HTMLIFrameElement).title?.trim() ?? '',
          }))
          .filter((f) => f.t.length === 0)
          .map((f) => `frame ${f.i} (${f.src})`)
      );
      expect(
        untitled,
        `demo iframes with no title — screen-reader users get "iframe" and nothing else:\n  ${untitled.join('\n  ')}`
      ).toEqual([]);
    });

    /**
     * BL-097: the frame page used to read `?group=` from the query string, which a
     * STATIC build never supplies — so all 12 frames rendered the `cards` group
     * while their labels claimed four different ones. The test above passes
     * regardless, because "the frame is not empty" is true of twelve frames all
     * showing the wrong thing.
     *
     * The expectation is anchored to the row's HEADING, and every other link in
     * the chain is asserted to agree with it: heading -> iframe title -> `src` ->
     * rendered content. Anchoring anywhere further down looks equivalent and is
     * not, because each anchor leaves the links above it free to drift together:
     *
     *   - anchored on `src`: pointing all four rows at `/…/cards/` reproduces the
     *     shipped defect exactly, and the check calls it self-consistent
     *   - anchored on the title: changing a row's `group` AND `label` together
     *     leaves a section headed "Tab Bar" rendering three card frames
     *
     * The heading is the right anchor because it is the accessible name — each
     * row is `role="group"` with `aria-labelledby` pointing at it — so it is what
     * a screen-reader user is told the frames below are.
     */
    const GROUP_MARKER: Record<ResponsiveDemoGroup, string> = {
      cards: '.brutal-option-card',
      tabs: '.brutal-tab',
      form: '.brutal-field',
      shell: '.brutal-tool-shell',
    };

    /** Frame titles read "<Label> at <width>px" — see BrandAccessibility.astro. */
    const LABEL_TO_GROUP: Record<string, ResponsiveDemoGroup> = {
      Cards: 'cards',
      Tabs: 'tabs',
      Form: 'form',
      Shell: 'shell',
    };

    /** The row headings, which are the rows' accessible names. */
    const HEADING_TO_GROUP: Record<string, ResponsiveDemoGroup> = {
      'Option Card Grid': 'cards',
      'Tab Bar': 'tabs',
      'Form Controls': 'form',
      'Tool Shell': 'shell',
    };

    test('each frame renders the group its HEADING claims', async ({ page }) => {
      await page.locator('#responsive-demos').scrollIntoViewIfNeeded();
      const frames = page.locator('.responsive-demo-frame iframe');
      const total = await frames.count();
      expect(total, 'responsive demo iframes present').toBe(12);

      for (let i = 0; i < total; i++) {
        await frames.nth(i).scrollIntoViewIfNeeded();
      }

      // Give each frame its OWN load budget before the shared poll below runs
      // the actual verification. Without this, all 12 dev-server iframe loads
      // share the poll's single expect-timeout window — mis-sized on a cold
      // run, where vite compiles every demo route on demand. Observed twice
      // (2026-08-08), both times on the day's first parallel run, never solo
      // and never on a warm server; the poll reported frames "not loaded".
      for (let i = 0; i < total; i++) {
        await expect(
          frames.nth(i).contentFrame().locator('body > *').first(),
          `frame ${i} loaded a document`
        ).toBeAttached();
      }

      await expect
        .poll(
          async () =>
            frames.evaluateAll(
              (els, { markers, labels, headings }) =>
                els.map((el) => {
                  const f = el as HTMLIFrameElement;

                  // The anchor: the row's accessible name.
                  const labelledBy = f
                    .closest('.responsive-demo-row')
                    ?.getAttribute('aria-labelledby');
                  const heading = labelledBy
                    ? (document.getElementById(labelledBy)?.textContent ?? '').trim()
                    : '';
                  const expected = headings[heading];
                  if (!expected) return `"${heading}": UNKNOWN HEADING`;

                  const label = (f.title || '').split(' ')[0];
                  if (labels[label] !== expected)
                    return `${heading}: title says "${label}", heading claims ${expected}`;

                  const urlGroup =
                    new URL(f.src).pathname.replace(/\/$/, '').split('/').pop() ?? '';
                  if (urlGroup !== expected)
                    return `${heading}: src is ${urlGroup}, heading claims ${expected}`;

                  const doc = f.contentDocument;
                  if (!doc || doc.readyState !== 'complete' || !doc.body?.children.length)
                    return `${heading}: not loaded`;
                  return doc.querySelector(markers[expected])
                    ? `${heading}: ok`
                    : `${heading}: MISSING ${markers[expected]} (body has ${
                        doc.body?.firstElementChild?.className || 'nothing'
                      })`;
                }),
              { markers: GROUP_MARKER, labels: LABEL_TO_GROUP, headings: HEADING_TO_GROUP }
            ),
          {
            message:
              'each frame must render the group its label claims — BL-097: a static build cannot read ?group=',
          }
        )
        .toEqual(Array(12).fill(expect.stringContaining(': ok')));

      // Truthfulness is not coverage. The poll above proves every frame renders
      // what its heading claims, which stays true if a row is duplicated —
      // turning the tabs row into a second cards row leaves /brand with two
      // identical sections and the tabs group demoed nowhere, all twelve honest.
      // `.at(-2)` rather than the strip-then-pop the other checks use, deliberately:
      // it reads the segment BEFORE the trailing empty one, so a slashless `src`
      // yields 'responsive-frame' and fails loudly instead of silently regrouping.
      // Don't harmonise the three parses into one helper without keeping that.
      const groups = await frames.evaluateAll((els) =>
        els.map((el) => new URL((el as HTMLIFrameElement).src).pathname.split('/').at(-2))
      );
      const perGroup = Object.fromEntries(
        [...new Set(groups)].sort().map((g) => [g, groups.filter((x) => x === g).length])
      );
      expect(perGroup, 'every group demoed at exactly the three widths').toEqual({
        cards: 3,
        form: 3,
        shell: 3,
        tabs: 3,
      });
    });

    test('every demo iframe requests the trailing-slash form', async ({ page }) => {
      // `responsive-demo-groups.ts` exports two builders and the iframes must use
      // the slash-terminated one: `trailingSlash: true` makes the slashless form a
      // 308 per frame in production. The dev server serves both, so nothing else
      // would notice the swap.
      const paths = await page
        .locator('.responsive-demo-frame iframe')
        .evaluateAll((els) => els.map((el) => new URL((el as HTMLIFrameElement).src).pathname));
      expect(paths.filter((p) => !p.endsWith('/'))).toEqual([]);
    });

    /**
     * The frames are fixed-height with `body { overflow: hidden }`, so content that
     * outgrows them is cropped SILENTLY. BL-096 deferred this measurement because
     * only the `form` group contains `.brutal-btn` and that group never rendered.
     *
     * Measured on the VIEWPORT, not `body`: `<html>` is `overflow: visible`, so
     * body's `overflow: hidden` propagates to the viewport and body's own used
     * overflow becomes `visible`. With `height: auto` body then grows to fit its
     * content, making `body.scrollHeight === body.clientHeight` regardless of
     * clipping — an assertion that can never fail.
     */
    test('no frame crops its own content', async ({ page }) => {
      await page.locator('#responsive-demos').scrollIntoViewIfNeeded();
      const frames = page.locator('.responsive-demo-frame iframe');
      const total = await frames.count();

      for (let i = 0; i < total; i++) {
        await frames.nth(i).scrollIntoViewIfNeeded();
      }

      // Sequenced after a readiness poll on purpose: an unloaded or about:blank
      // frame reports scrollHeight === clientHeight, so overflow would pass
      // vacuously on a frame that never loaded.
      //
      // BOTH conditions, and neither alone is sufficient:
      //   - body-has-children alone admits a frame at 'interactive', whose
      //     stylesheets are still pending; an unstyled document (default body
      //     margin, no grid) lays out differently enough to cause both false
      //     failures and false passes in the measurement below
      //   - readyState alone admits a lazy frame that has NOT navigated yet: its
      //     pristine about:blank already reports 'complete', with zero children
      //     and scrollHeight === clientHeight in both axes, which would make the
      //     measurement entirely vacuous
      await expect
        .poll(async () =>
          frames.evaluateAll(
            (els) =>
              els.filter((el) => {
                const doc = (el as HTMLIFrameElement).contentDocument;
                return doc?.readyState === 'complete' && (doc.body?.children.length ?? 0) > 0;
              }).length
          )
        )
        .toBe(total);

      // Both axes: `overflow: hidden` crops horizontally just as silently.
      // Overflow INSIDE a component's own scroll container doesn't count and
      // isn't measured here — `.brutal-tab-bar` is `overflow-x: auto`, so at
      // 240px it scrolls internally, which is exactly what production does.
      // Only the document outgrowing the frame is a cropped demo.
      const overflowing = await frames.evaluateAll((els) =>
        els
          .flatMap((el) => {
            const f = el as HTMLIFrameElement;
            const root = f.contentDocument!.documentElement;
            const group = new URL(f.src).pathname.replace(/\/$/, '').split('/').pop();
            return [
              {
                group,
                w: f.clientWidth,
                axis: 'height',
                content: root.scrollHeight,
                frame: root.clientHeight,
              },
              {
                group,
                w: f.clientWidth,
                axis: 'width',
                content: root.scrollWidth,
                frame: root.clientWidth,
              },
            ];
          })
          .filter((m) => m.content > m.frame)
          .map((m) => `${m.group} @${m.w}px: ${m.axis} ${m.content}px > frame ${m.frame}px`)
      );
      expect(
        overflowing,
        `frames cropping their content (body has overflow:hidden, so this is invisible):\n  ${overflowing.join('\n  ')}`
      ).toEqual([]);
    });
  });

  /**
   * The site-chrome specimens render the REAL components (BL-095 AC-2 —
   * HeaderLogo/HeaderNavLinks/ThemeToggleButton/FooterLinks/CTABox are the
   * presentational inners that Header/ThemeToggle/Footer/CTASection compose),
   * so the per-specimen parity guards this section used to carry are gone with
   * the replicas they guarded: a specimen that IS the component cannot drift
   * from it. What remains are the carriers with no component behind them: the
   * `.nav-link` utility mirror, and `.project-card`, whose single global rule
   * both production and the specimen consume and which is pinned cross-page
   * below so a second (scoped) definition cannot silently return.
   */
  test.describe('Site chrome specimens match production', () => {
    /**
     * `.nav-link` / `.nav-link.active` (typography.css) is a hand-maintained
     * MIRROR of the header nav treatment with no production consumer — which is
     * precisely why it drifts unnoticed. It did: BL-096 changed the active ink
     * from `--color-primary` (1.88:1) to `--color-tertiary` and found this
     * utility still hardcoding the old token, needing a hand-correction in the
     * slice that added this test.
     *
     * This reads TWO pages, because `/brand` renders no production-branch nav
     * (its HeaderNavLinks specimen uses the untracked demo branch, and the live
     * header marks `active` only for `/services`, `/ma-portfolio`, `/hub` and
     * `/about`). The production side is the real active link on `/services/`;
     * the nav-treatment declarations live in `HeaderNavLinks.astro`. Asserting
     * against a resolved `var(--color-tertiary)` would be cheaper and weaker —
     * it cannot see production moving to some third token.
     */
    test('.nav-link.active utility matches the real active header nav link', async ({ page }) => {
      /**
       * Transitions are suppressed before every read. The nav anchors declare
       * `transition: color var(--transition-fast)` (HeaderNavLinks.astro), and
       * the theme script re-resolves `light-dark()` after first paint — so an
       * immediate read samples the animation rather than the value. It caught
       * this test out with `rgb(4, 181, 134)`, which is `#05cd99 → #02724f`
       * about a quarter of the way through. Same-page comparisons never hit
       * this because both elements transition together; reading across two
       * navigations does not.
       */
      const freeze = () =>
        page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
      const readInk = (l: ReturnType<typeof page.locator>) =>
        l.evaluate((el) => {
          const cs = getComputedStyle(el);
          return { color: cs.color, borderBottomColor: cs.borderBottomColor };
        });

      await page.goto('/services/', { waitUntil: 'domcontentloaded' });
      const production = page.locator('.site-header nav a.active');
      await expect(production).toBeVisible();
      await freeze();
      const p = await readInk(production);

      await page.goto('/brand/', { waitUntil: 'domcontentloaded' });
      const utility = page.locator('.nav-link.active');
      await expect(utility).toBeVisible();
      await freeze();
      const u = await readInk(utility);

      expect(u.color, '.nav-link.active utility ink vs real active header nav link').toBe(p.color);
      expect(
        u.borderBottomColor,
        '.nav-link.active utility accent vs real active header nav link'
      ).toBe(p.borderBottomColor);
    });

    /**
     * `.project-card` is ONE global rule (cards.css) that production
     * (/ma-portfolio) and the /brand specimen both consume. It used to be two:
     * an Astro-scoped duplicate in PortfolioGrid.astro out-specified the
     * global rule on /ma-portfolio while /brand saw only cards.css, so the
     * specimen rendered #0a0a0a in dark theme against production's #1a1a1a —
     * drift invisible to every same-page check. This pins the single-definition
     * state cross-page so a second definition cannot silently return.
     *
     * Built to actually discriminate:
     * - DARK theme, seeded via addInitScript so it survives both navigations
     *   (TEST_BEST_PRACTICES #19/#21) — BaseLayout applies the class
     *   synchronously in <head> from localStorage, so it holds from first
     *   paint. The historical divergence was dark-only; light values were
     *   identical on both sides by construction.
     * - transitionDuration is read BEFORE the transition freeze (the freeze
     *   forces 0s on both sides, which would make that assertion vacuous);
     *   the freeze precedes only the colour reads, per the lesson in the test
     *   above.
     * - ALL `.project-card` nodes on /brand are compared, with a non-zero
     *   count asserted first so removing a specimen cannot silently reduce
     *   this to zero comparisons.
     */
    test('project-card specimens match the real portfolio card in dark theme', async ({ page }) => {
      await page.addInitScript(() => {
        try {
          localStorage.setItem('theme', 'dark');
        } catch {
          /* storage unavailable — the test will fail loudly on the light values */
        }
      });
      const freeze = () =>
        page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
      const readDuration = (l: ReturnType<typeof page.locator>) =>
        l.evaluate((el) => getComputedStyle(el).transitionDuration);
      const readColors = (l: ReturnType<typeof page.locator>) =>
        l.evaluate((el) => {
          const cs = getComputedStyle(el);
          return { background: cs.backgroundColor, borderColor: cs.borderTopColor };
        });

      await page.goto('/ma-portfolio/', { waitUntil: 'domcontentloaded' });
      const production = page.locator('.project-card').first();
      await expect(production).toBeVisible();
      const pDuration = await readDuration(production);
      await freeze();
      const pColors = await readColors(production);

      await page.goto('/brand/', { waitUntil: 'domcontentloaded' });
      const specimens = page.locator('.project-card');
      const count = await specimens.count();
      expect(count, 'project-card specimens present on /brand').toBeGreaterThan(0);

      const sDurations: string[] = [];
      for (let i = 0; i < count; i++) sDurations.push(await readDuration(specimens.nth(i)));
      await freeze();
      for (let i = 0; i < count; i++) {
        const s = await readColors(specimens.nth(i));
        expect(s.background, `specimen ${i} dark background vs real portfolio card`).toBe(
          pColors.background
        );
        expect(s.borderColor, `specimen ${i} dark border vs real portfolio card`).toBe(
          pColors.borderColor
        );
        expect(sDurations[i], `specimen ${i} transition duration vs real portfolio card`).toBe(
          pDuration
        );
      }
    });
  });

  /**
   * Every class on this page must have a CSS rule behind it.
   *
   * A specimen whose class has no rule renders as unstyled markup while its
   * label confidently documents the class — so the page actively teaches the
   * wrong thing, and nothing fails. An audit found 28 such classes: a "Live"
   * badge rendering as bare text, inert `.cta-button primary` modifiers whose
   * label claimed they were real variants, and stale names that had drifted
   * from the classes production actually uses.
   *
   * The same audit surfaced a live TechPar defect from the identical cause
   * (emitted `bench-label--stage`, styled `.brutal-bench-table__label--stage`),
   * so this is not a brand-page-only failure mode.
   *
   * ALLOWED_UNSTYLED is for classes used purely as JS hooks. Adding to it is a
   * deliberate act: it says "this class is a selector for script, never a
   * styling hook". If a specimen looks wrong, the fix is the markup or the CSS,
   * never this list.
   *
   * Known precision limit: a class counts as "defined" if it appears anywhere in
   * any selector, including another component's scoped rule or a descendant
   * qualifier (`.a .b` marks both `a` and `b`). So this catches a class with no
   * rule at all — the failure mode that shipped 28 times — but not one whose
   * rule can never apply in this context. Tightening that would mean resolving
   * specificity per element, which is not worth the complexity here.
   */
  test.describe('No orphan classes', () => {
    const ALLOWED_UNSTYLED = new Set([
      // Read by src/scripts/palette-manager.ts to drive the swatch editor.
      'swatch-slider-r',
      'swatch-slider-g',
      'swatch-slider-b',
      'swatch-slider-a',
      // JS-created span (palette-manager.ts); styled entirely by its parent
      // .palette-panel__popout rule. Asserted on by palette-panel-mobile.test.ts
      // (~:213, :227), so it is a live selector — do not delete it as dead markup.
      'palette-panel__popout-label',
    ]);

    test('every class in the DOM has a CSS rule', async ({ page }) => {
      const orphans = await page.evaluate(() => {
        const defined = new Set<string>();
        const walk = (rules: CSSRuleList) => {
          for (const rule of Array.from(rules)) {
            const sel = (rule as CSSStyleRule).selectorText;
            if (sel) {
              for (const m of sel.matchAll(/\.([A-Za-z0-9_-]+)/g)) defined.add(m[1]);
            }
            const nested = (rule as CSSGroupingRule).cssRules;
            if (nested) walk(nested);
          }
        };
        for (const sheet of Array.from(document.styleSheets)) {
          try {
            walk(sheet.cssRules);
          } catch {
            /* stylesheet not readable — skip */
          }
        }
        const used = new Set<string>();
        for (const el of Array.from(document.querySelectorAll('[class]'))) {
          for (const c of Array.from(el.classList)) used.add(c);
        }
        return [...used].filter((c) => !defined.has(c)).sort();
      });

      const unexpected = orphans.filter((c) => !ALLOWED_UNSTYLED.has(c));
      expect(
        unexpected,
        `classes used on /brand with no CSS rule anywhere — the specimen will render ` +
          `unstyled while its label documents the class. Repoint the markup at the real ` +
          `class, or add the rule. Only add to ALLOWED_UNSTYLED if it is purely a JS hook.`
      ).toEqual([]);
    });
  });

  /**
   * The touch-target specimens must measure what their captions claim.
   *
   * `.brutal-btn` had no `min-height` and computed to 33px, so the specimen's own
   * dashed 44x44 overlay bled 5.5px above and below the button while the caption
   * read "meets minimum" and the prose claimed every interactive component met
   * WCAG 2.5.5. The page was rendering its own counter-evidence.
   *
   * /brand is the right place to assert this because it renders every variant —
   * primary, secondary, full-width, disabled, choice, choice--unsure and the
   * marketing .cta-button — in one document. All three classes are named as meeting
   * the floor in BRAND_GUIDELINES, so all three are measured here; a doc claiming a
   * floor that no instrument checks is the exact defect this branch removes.
   * The floor itself is enforced at source level by
   * tests/integration/touch-target-floor.test.ts, which reaches the tool pages'
   * media-query overrides that no E2E can.
   *
   * The visible filter is load-bearing: PalettePanel renders a `.brutal-btn` in a
   * panel body that is `display: none` until opened, and BaseLayout puts it on
   * every page, so an unfiltered sweep measures a 0x0 box and fails on a control
   * the user cannot touch.
   */
  test.describe('Touch targets', () => {
    const MIN = 44;

    const measureUndersized = (page: import('@playwright/test').Page) =>
      page.evaluate((min) => {
        const bad: string[] = [];
        // Grows with each BL-096 slice. This is the instrument that catches a control
        // with NO floor declared at all — the declared-value scan in
        // tests/integration/touch-target-floor.test.ts structurally cannot.
        const guarded =
          '.brutal-btn, .brutal-choice-btn, .cta-button, .filter-button, .theme-toggle';
        for (const el of Array.from(document.querySelectorAll(guarded))) {
          const r = el.getBoundingClientRect();
          // getClientRects() rather than a zero-rect test: `visibility: hidden` keeps a
          // NONZERO rect, so a zero-rect check would measure controls the user cannot
          // touch. `offsetParent === null` is not the alternative — it is null for
          // `position: fixed` too, which would silently skip the palette rail.
          if (el.getClientRects().length === 0) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.pointerEvents === 'none') continue;
          if (r.width < min || r.height < min) {
            bad.push(
              `${el.className.trim()} = ${r.width.toFixed(1)}x${r.height.toFixed(1)} ` +
                `("${(el.textContent ?? '').trim().slice(0, 20)}")`
            );
          }
        }
        return bad;
      }, MIN);

    for (const vp of [
      { name: 'desktop', width: 1280, height: 900 },
      { name: 'mobile', width: 390, height: 844 },
    ]) {
      test(`every visible button meets ${MIN}x${MIN} on ${vp.name}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        const undersized = await measureUndersized(page);
        expect(
          undersized,
          `Buttons below the ${MIN}x${MIN} WCAG 2.5.5 floor at ${vp.width}px. A page-local ` +
            `rule is probably out-specifying var(--touch-target-min):\n  ${undersized.join('\n  ')}`
        ).toEqual([]);
      });
    }

    test('the 44x44 overlay traces each specimen instead of overflowing it', async ({ page }) => {
      const demos = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.a11y-touch-demo')).map((demo) => {
          const b = demo.querySelector('button')!.getBoundingClientRect();
          const o = demo.querySelector('.a11y-touch-overlay')!.getBoundingClientRect();
          return { bleedTop: b.top - o.top, bleedBottom: o.bottom - b.bottom };
        })
      );

      expect(demos.length, 'touch-target specimens present').toBeGreaterThan(0);
      for (const d of demos) {
        // Negative bleed = overlay inside the button, which is the passing shape.
        expect(d.bleedTop, 'overlay must not extend above the control').toBeLessThanOrEqual(0.5);
        expect(d.bleedBottom, 'overlay must not extend below the control').toBeLessThanOrEqual(0.5);
      }
    });

    test('the overlay is decorative and carries no text of its own', async ({ page }) => {
      // It sits over the button's label; any text here renders as an unreadable
      // overlap and is announced as a stray string after the button.
      const overlays = page.locator('.a11y-touch-overlay');
      const count = await overlays.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        await expect(overlays.nth(i)).toHaveAttribute('aria-hidden', 'true');
        expect((await overlays.nth(i).textContent())?.trim()).toBe('');
      }
    });
  });
});
