/**
 * Announcement sash — the corner band rendered from `src/data/announcements.ts`
 * by `Sash.astro`, plus the nav's corner reservation in `HeaderNavLinks.astro`.
 *
 * What only a browser can prove, and what this file therefore covers:
 *   - the corner box does not eat clicks on the nav underneath it
 *     (`pointer-events: none` on the box, `auto` on the band),
 *   - the reserve and the corner-box size stay paired at all three breakpoints,
 *   - a page WITHOUT a sash gets no reserve at all (the `:has()` guard), and
 *   - the announced page never carries a sash pointing at itself.
 *
 * Route selection and the `until` window are unit-tested against the registry in
 * `tests/unit/announcements.test.ts`; nothing here re-asserts them, and nothing
 * here pins the announcement's copy. Retirement is the designed outcome, not a
 * failure, so the suite reads the registry itself and skips when no
 * announcement is live on SASH_ROUTE — otherwise every assertion below would
 * turn a required check red on a calendar date, with no code change and nothing
 * to fix. The unit suite skips the same way (`describe.skipIf`).
 *
 * Geometry pairs — corner box / band top / band width / nav reserve — per
 * `src/styles/components/sash.css`.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';
import { getActiveAnnouncement } from '../../src/data/announcements';

/**
 * Corner-box size ↔ nav reserve, per breakpoint. Edit with sash.css, or neither.
 * The tiers switch at 768 / 540 / 512 — the widths at which each reserve FITS on
 * every engine, not the handoff's 768/480; below 512 the sash leaves the corner
 * and renders as a full-width IN-FLOW strip above the header, with the reserve
 * at 0 (see the narrow-viewport tests at the bottom of this file).
 */
const BREAKPOINTS = [
  // Desktop's pair is the WITHOUT-under-band case; DESKTOP_BOX and
  // DESKTOP_RESERVE below read these two fields and swap in 220px when a live
  // entry carries a subtext, since the under-band grows the box.
  { name: 'desktop', width: 1440, height: 900, box: 200, reserve: '168px' },
  { name: '768px', width: 768, height: 800, box: 170, reserve: '140px' },
  { name: '540px', width: 540, height: 800, box: 140, reserve: '108px' },
] as const;

/**
 * Every width the header is expected to render without a horizontal scrollbar.
 * Starts at 400 rather than 375: below ~390 the header row overflows on EVERY
 * page, sash or not (pre-existing, measured identical on /services/), and the
 * stand-down test below covers the narrow end by comparing against a sash-less
 * page instead of against zero.
 */
const NO_OVERFLOW_WIDTHS = [400, 480, 512, 540, 541, 600, 768, 769, 900, 1440] as const;

const SASH_ROUTE = '/hub/';
// /brand/ carries sash SPECIMENS in its body. It belongs here because a
// descendant :has() match reserved 168px on its real header for a corner that
// isn't there — the guard is scoped to a direct child of <body> for that reason.
const SASH_LESS_ROUTES = ['/services/', '/about/', '/brand/'];
const ANNOUNCED_PAGE = '/hub/mcp/';

const pageSash = (page: Page) => page.locator('.brutal-sash-corner:not(.brutal-sash-corner--card)');

/**
 * The pages are built from the registry, so with no live entry there is no sash
 * to assert anything about. Evaluated here in Node against the same clock the
 * dev server builds with.
 */
const NO_LIVE_ANNOUNCEMENT = getActiveAnnouncement(SASH_ROUTE) === null;

/**
 * Registry-driven like everything else here: a live entry carrying `subtext`
 * renders the under-band, which conditionally widens the DESKTOP reserve to
 * 220px (HeaderNavLinks.astro) — the box grows to 220px there too, see
 * sash.css. The tier reserves are identical either way —
 * the under-band hides ≤768px and the per-tier restatements repeat the tier
 * values — so only the desktop expectation is conditional.
 */
const LIVE_SUBTEXT = getActiveAnnouncement(SASH_ROUTE)?.subtext;
const DESKTOP_TIER = BREAKPOINTS[0];
const DESKTOP_RESERVE = LIVE_SUBTEXT === undefined ? DESKTOP_TIER.reserve : '220px';
/** The box grows with the reserve — a sash carrying an under-band needs the
 *  extra chord for its subtext (sash.css). Same conditional, same pair. */
const DESKTOP_BOX = LIVE_SUBTEXT === undefined ? `${DESKTOP_TIER.box}px` : '220px';

test.describe('Announcement sash', () => {
  test.skip(() => NO_LIVE_ANNOUNCEMENT, 'no announcement is live on this route — nothing renders');

  test('the page sash renders in the top-right corner as a link, above the sticky header', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SASH_ROUTE);

    const corner = pageSash(page);
    await expect(corner).toHaveCount(1);

    const box = await corner.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box).not.toBeNull();
    expect(box!.y, 'flush with the top of the page').toBeLessThanOrEqual(1);
    expect(box!.x + box!.width, 'flush with the right edge').toBeGreaterThanOrEqual(
      viewport.width - 1
    );

    const band = corner.locator('.brutal-sash');
    await expect(band).toHaveAttribute('href', ANNOUNCED_PAGE);
    await expect(band).toHaveAttribute('aria-label', /open the linked page/);

    const [cornerZ, headerZ] = await Promise.all([
      corner.evaluate((el) => Number(getComputedStyle(el).zIndex)),
      page.locator('.site-header').evaluate((el) => Number(getComputedStyle(el).zIndex)),
    ]);
    expect(cornerZ, 'the sash clears the sticky header').toBeGreaterThan(headerZ);
  });

  test('the band navigates to the announced page', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SASH_ROUTE);
    await pageSash(page).locator('.brutal-sash').click();
    await page.waitForURL(`**${ANNOUNCED_PAGE}`);
    await expect(page.locator('.hub-header__title')).toHaveText(/MCP Server/);
  });

  test('the announced page never carries a sash pointing at itself', async ({ page }) => {
    await page.goto(ANNOUNCED_PAGE);
    await expect(page.locator('.brutal-sash-corner')).toHaveCount(0);
  });

  test('the hub MCP card carries the decorative card-scale band, hidden from AT', async ({
    page,
  }) => {
    await page.goto(SASH_ROUTE);
    const card = page.locator(`.hub-cards a[href="${ANNOUNCED_PAGE}"]`);
    const corner = card.locator('.brutal-sash-corner--card');
    await expect(corner).toHaveCount(1);

    const band = corner.locator('.brutal-sash');
    await expect(band).toHaveAttribute('aria-hidden', 'true');
    expect(await band.evaluate((el) => el.tagName), 'decorative — not a second link').toBe('SPAN');
    expect(
      await card.evaluate((el) => getComputedStyle(el).overflow),
      'the card must clip the band'
    ).toBe('hidden');
  });

  /**
   * The optional under-band (`.brutal-sash-under`, sash.css). Arm (a) runs
   * while no live entry sets `subtext` and pins the enabled-not-present
   * contract; arm (b) takes over the day an entry ships one. Exactly one arm
   * is live in any registry state, so neither state can silently regress.
   * Both arms have run green: (b) was exercised against a temporarily-mutated
   * registry when the capability landed (2026-08-28), alongside a
   * three-engine fit probe of the conditional reserve at 769–1440px.
   */
  test('without a registry subtext there is no under-band (enabled, not present)', async ({
    page,
  }) => {
    test.skip(LIVE_SUBTEXT !== undefined, 'the live entry sets a subtext — the presence arm runs');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SASH_ROUTE);

    // The sash is there; the under-band is not — anywhere on the page.
    await expect(pageSash(page)).toHaveCount(1);
    await expect(page.locator('.brutal-sash-under')).toHaveCount(0);
  });

  test('a registry subtext renders the under-band and widens the desktop reserve', async ({
    page,
  }) => {
    test.skip(LIVE_SUBTEXT === undefined, 'no live entry sets a subtext — the absence arm runs');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SASH_ROUTE);

    const entry = getActiveAnnouncement(SASH_ROUTE)!;
    const under = pageSash(page).locator('.brutal-sash-under');
    await expect(under).toHaveCount(1);
    await expect(under).toHaveText(LIVE_SUBTEXT!);

    // The under-band is its OWN link (to subtextHref, or the main href absent
    // one), with its own accessible name — the registry override exists so a
    // literal pipe in the subtext is not spoken as "vertical line".
    expect(await under.evaluate((el) => el.tagName), 'a link, not a decoration').toBe('A');
    await expect(under).toHaveAttribute('href', entry.subtextHref ?? entry.href);
    await expect(under).toHaveAttribute('aria-label', entry.subtextAriaLabel ?? LIVE_SUBTEXT!);

    // The AA touch-target floor, on the element's unrotated box.
    const underHeight = await under.evaluate((el) => (el as HTMLElement).offsetHeight);
    expect(underHeight, 'min-height: var(--touch-target-min-aa)').toBeGreaterThanOrEqual(24);

    // The inverted pair, asserted as computed equality against the main
    // band's own values so it follows every palette rather than pinning hex.
    const inverted = await page.evaluate(() => {
      const corner = document.querySelector('.brutal-sash-corner:not(.brutal-sash-corner--card)')!;
      const main = getComputedStyle(corner.querySelector('.brutal-sash')!);
      const underCs = getComputedStyle(corner.querySelector('.brutal-sash-under')!);
      return underCs.backgroundColor === main.color && underCs.color === main.backgroundColor;
    });
    expect(inverted, 'the under-band inverts the two sash tokens').toBe(true);

    // The main link speaks the whole announcement — either the registry's
    // explicit ariaLabel or the composed default, which must carry the subtext.
    const spoken = await pageSash(page).locator('.brutal-sash').getAttribute('aria-label');
    if (entry.ariaLabel !== undefined) {
      expect(spoken, 'the registry aria override is spoken').toBe(entry.ariaLabel);
    } else {
      expect(spoken, 'subtext joins the composed aria-label').toContain(LIVE_SUBTEXT!);
    }

    const reserve = await page
      .locator('.site-header nav ul')
      .evaluate((el) => getComputedStyle(el).paddingRight);
    expect(reserve, 'the conditional desktop reserve').toBe('220px');

    // Hidden 512–768 alongside __detail, and the tier restatement defeats the
    // base bump (:has() still matches the display:none band).
    await page.setViewportSize({ width: 768, height: 800 });
    await expect(under).toBeHidden();
    const tierReserve = await page
      .locator('.site-header nav ul')
      .evaluate((el) => getComputedStyle(el).paddingRight);
    expect(tierReserve, 'tier reserve returns while the band is hidden').toBe('140px');

    // …and back as the second line of the ≤511 strip.
    await page.setViewportSize({ width: 375, height: 800 });
    await expect(under).toBeVisible();
  });

  test('the under-band deep-links to its fragment destination', async ({ page }) => {
    const entry = getActiveAnnouncement(SASH_ROUTE);
    test.skip(
      entry?.subtext === undefined || entry?.subtextHref === undefined,
      'no live entry carries a subtext deep-link'
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SASH_ROUTE);
    await pageSash(page).locator('.brutal-sash-under').click();
    await page.waitForURL(`**${entry!.subtextHref}`);

    // The fragment resolves to a real element (its existence is also guarded
    // at unit speed by tests/integration/announcement-anchor.test.ts).
    const fragment = entry!.subtextHref!.split('#')[1];
    await expect(page.locator(`#${fragment}`)).toBeVisible();
  });

  /**
   * The RIBBON-FORM invariant (sash.css's header comment), asserted on every
   * rendered corner form rather than on the numbers themselves — those live in
   * one place and are free to move.
   *
   * Work in chord space c = x − y (corner-box local): a 45° band is the strip
   * c ∈ [c_min, c_max], and the box's main diagonal is c = 0. A band whose
   * c_min drops to 0 or below stops being a ribbon — its lower edge crosses
   * the box's LEFT and BOTTOM edges instead of the top and right, so the band
   * covers the box's top-left corner and gets cut off square in mid-page.
   * That shipped twice while every geometry probe passed (the probes checked
   * that band pixels were where chord math predicted; none checked WHICH box
   * edges cut them), so it is a test now.
   */
  /** Chord-space measurement of every band inside one corner, from its
   *  unrotated layout box (the corner is each band's offsetParent). */
  const measureBands = (corner: Locator) =>
    corner.evaluate((el) => {
      const box = (el as HTMLElement).offsetWidth;
      return ['.brutal-sash', '.brutal-sash-under']
        .map((sel) => {
          const band = el.querySelector<HTMLElement>(sel);
          if (!band || getComputedStyle(band).display === 'none') return null;
          const cx = band.offsetLeft + band.offsetWidth / 2;
          const cy = band.offsetTop + band.offsetHeight / 2;
          const c = cx - cy;
          const halfC = (band.offsetHeight * Math.SQRT2) / 2;
          const r2 = Math.SQRT1_2;
          const capCornersInside = [-1, 1]
            .flatMap((along) =>
              [-1, 1].map((across) => [
                cx +
                  ((along * band.offsetWidth) / 2) * r2 +
                  ((across * band.offsetHeight) / 2) * r2,
                cy +
                  ((along * band.offsetWidth) / 2) * r2 -
                  ((across * band.offsetHeight) / 2) * r2,
              ])
            )
            .filter(([x, y]) => x > 0 && x < box && y > 0 && y < box).length;
          return { sel, box, cMin: c - halfC, cMax: c + halfC, capCornersInside };
        })
        .filter((b): b is NonNullable<typeof b> => b !== null);
    });

  const expectRibbons = (bands: Awaited<ReturnType<typeof measureBands>>, where: string) => {
    for (const b of bands) {
      expect(b.cMin, `${where} ${b.sel}: lower edge stays off the box diagonal`).toBeGreaterThan(2);
      expect(b.cMax, `${where} ${b.sel}: upper edge leaves the corner apex white`).toBeLessThan(
        b.box
      );
      expect(
        b.capCornersInside,
        `${where} ${b.sel}: end caps are clipped away, never visible`
      ).toBe(0);
    }
  };

  for (const bp of BREAKPOINTS) {
    test(`at ${bp.name} every band is a ribbon: cut by the box top and right edges only`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.goto(SASH_ROUTE);
      const bands = await measureBands(pageSash(page));

      // Armed off the registry like the rest of this file: the under-band
      // exists only while a live entry carries `subtext`, and only above 768px.
      const expected =
        getActiveAnnouncement(SASH_ROUTE)?.subtext !== undefined && bp.width > 768 ? 2 : 1;
      expect(bands.length, `${bp.name}: bands present to be checked`).toBe(expected);
      expectRibbons(bands, bp.name);
    });
  }

  /**
   * Ink containment — the property the ribbon test does NOT cover: a band can
   * be a perfect ribbon while the box cuts its COPY. Both of this file's
   * geometry defects were of that kind, and both hid behind a measurement in
   * the wrong space, so this measures the way the box actually sees it: the
   * band is un-rotated to read its ink flat, and the ink's four corners are
   * mapped back through the 45° rotation and tested against the box.
   *
   * Per ENGINE on purpose. `--font-family-mono` is the bare `monospace`
   * generic, so the advance width is whatever the engine and OS pick — the
   * live subtext measures 222px on Chromium and Firefox and 240px on WebKit,
   * and a chromium-only check once passed a band WebKit was clipping by 5px.
   */
  /**
   * NOT `> 0`. At the geometry this guard was written for, Chromium cleared the
   * box by 0.8px and WebKit overflowed it by 5.3px — a sub-pixel pass on one
   * engine is what hid a real clip on another, so the floor is a real number.
   */
  const MIN_INK_MARGIN = 4;

  const measureInkFit = (corner: Locator) =>
    corner.evaluate((el) => {
      const box = (el as HTMLElement).offsetWidth;
      return ['.brutal-sash', '.brutal-sash-under']
        .map((sel) => {
          const band = el.querySelector<HTMLElement>(sel);
          if (!band || getComputedStyle(band).display === 'none') return null;

          const priorTransform = band.style.transform;
          band.style.transform = 'none';
          const range = document.createRange();
          range.selectNodeContents(band);
          const ink = range.getBoundingClientRect();
          const flat = band.getBoundingClientRect();
          const dx = ink.left + ink.width / 2 - (flat.left + flat.width / 2);
          const dy = ink.top + ink.height / 2 - (flat.top + flat.height / 2);
          const inkW = ink.width;
          const inkH = ink.height;
          band.style.transform = priorTransform;

          const bcx = band.offsetLeft + band.offsetWidth / 2;
          const bcy = band.offsetTop + band.offsetHeight / 2;
          const r2 = Math.SQRT1_2;
          const margins: number[] = [];
          for (const sx of [-1, 1])
            for (const sy of [-1, 1]) {
              const px = dx + (sx * inkW) / 2;
              const py = dy + (sy * inkH) / 2;
              const x = bcx + (px - py) * r2;
              const y = bcy + (px + py) * r2;
              margins.push(x, y, box - x, box - y);
            }
          return { sel, margin: Math.min(...margins) };
        })
        .filter((b): b is NonNullable<typeof b> => b !== null);
    });

  test('the copy fits inside the corner, not just the band', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SASH_ROUTE);
    const live = await measureInkFit(pageSash(page));
    expect(live.length, 'bands present to be checked').toBeGreaterThan(0);
    for (const b of live) {
      expect(
        b.margin,
        `page sash ${b.sel}: copy needs ${MIN_INK_MARGIN}px of clearance from the corner box`
      ).toBeGreaterThanOrEqual(MIN_INK_MARGIN);
    }

    // The specimens carry copy the live registry does not, and are where a new
    // combination is supposed to be proven before it ships.
    await page.goto('/brand/');
    const frames = page.locator('.brand-sash-frame');
    const count = await frames.count();
    expect(count, '/brand exhibits sash specimens to check').toBeGreaterThan(0);
    let underSpecimens = 0;
    for (let i = 0; i < count; i++) {
      const bands = await measureInkFit(frames.nth(i).locator('.brutal-sash-corner'));
      expect(
        bands.length,
        `/brand specimen ${i} renders at least one band to check`
      ).toBeGreaterThan(0);
      underSpecimens += bands.filter((b) => b.sel === '.brutal-sash-under').length;
      for (const b of bands) {
        expect(
          b.margin,
          `/brand specimen ${i} ${b.sel}: copy needs ${MIN_INK_MARGIN}px of clearance`
        ).toBeGreaterThanOrEqual(MIN_INK_MARGIN);
      }
    }
    // Deleting the under-band specimens would otherwise shrink this test's
    // coverage silently — and the under-band is the band with the tight fit.
    expect(underSpecimens, '/brand exhibits the under-band form').toBeGreaterThan(0);
  });

  test('the card-scale band is a ribbon too', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SASH_ROUTE);
    const corner = page
      .locator(`.hub-cards a[href="${ANNOUNCED_PAGE}"]`)
      .locator('.brutal-sash-corner--card');
    const bands = await measureBands(corner);
    expect(bands.length, 'the card corner carries its one band').toBe(1);
    expectRibbons(bands, 'card');
  });

  for (const bp of BREAKPOINTS) {
    test(`at ${bp.name} the corner box and the nav reserve stay paired`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.goto(SASH_ROUTE);

      const corner = pageSash(page);
      const size = await corner.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { w: cs.width, h: cs.height };
      });
      // Desktop only, both members of the pair are registry-conditional.
      const expectedBox = bp.name === 'desktop' ? DESKTOP_BOX : `${bp.box}px`;
      expect(size.w, 'corner box width').toBe(expectedBox);
      expect(size.h, 'corner box height').toBe(expectedBox);

      const reserve = await page
        .locator('.site-header nav ul')
        .evaluate((el) => getComputedStyle(el).paddingRight);
      // Desktop only, the reserve is registry-conditional — see DESKTOP_RESERVE.
      const expected = bp.name === 'desktop' ? DESKTOP_RESERVE : bp.reserve;
      expect(reserve, 'reserve pairs with the corner-box size').toBe(expected);
    });

    test(`at ${bp.name} the nav links under the sash are still clickable`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.goto(SASH_ROUTE);

      // elementFromPoint, not click(): the failure mode is the corner box
      // swallowing the hit, which a click would report only as a navigation to
      // the wrong place — and only when the two happen to overlap.
      for (const label of ['Hub', 'About']) {
        const hit = await page.evaluate((text) => {
          const link = [...document.querySelectorAll('.site-header nav a')].find(
            (a) => a.textContent?.trim() === text
          ) as HTMLElement | undefined;
          if (!link) return null;
          const r = link.getBoundingClientRect();
          const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return top === link || link.contains(top);
        }, label);
        expect(hit, `${label} is on top at its own centre`).toBe(true);
      }
    });
  }

  for (const route of SASH_LESS_ROUTES) {
    test(`${route} carries no page sash and no nav reserve (the :has() guard)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route);

      // A PAGE sash is a direct child of <body>; /brand's specimens and any
      // card-scale band are nested, and neither may move the nav.
      await expect(page.locator('body > .brutal-sash-corner')).toHaveCount(0);
      const reserve = await page
        .locator('.site-header nav ul')
        .evaluate((el) => getComputedStyle(el).paddingRight);
      expect(reserve, 'a page without a page sash must render as it did before').toBe('0px');
    });
  }

  test('below 512px the sash leaves the corner for the in-flow strip', async ({ page }) => {
    // The regression the 0px reserve pins: at 375px the logo and four links
    // already fill the header row, so a 108px reserve pushed the nav 64px past
    // the viewport and every sash page scrolled sideways. The sash now changes
    // FORM here instead of hiding — a full-width strip IN FLOW above the
    // header, which costs the nav nothing — so the reserve stays 0 while the
    // corner box stays in the DOM and visible.
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(SASH_ROUTE);

    const corner = pageSash(page);
    await expect(corner).toHaveCount(1);
    await expect(corner).toBeVisible();
    const box = await corner.evaluate((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { position: cs.position, width: r.width };
    });
    expect(box.position, 'in flow, not an overlay').toBe('static');
    expect(box.width, 'full width').toBeGreaterThanOrEqual(374);

    const reserve = await page
      .locator('.site-header nav ul')
      .evaluate((el) => getComputedStyle(el).paddingRight);
    expect(reserve, 'the strip costs the nav nothing').toBe('0px');

    // Both strip lines receive their own clicks (registry-driven: the second
    // line exists only while the live entry carries a subtext).
    const stripLines =
      LIVE_SUBTEXT === undefined ? ['.brutal-sash'] : ['.brutal-sash', '.brutal-sash-under'];
    for (const sel of stripLines) {
      const hit = await page.evaluate((s) => {
        const el = document.querySelector(`body > .brutal-sash-corner ${s}`) as HTMLElement;
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return top === el || el.contains(top);
      }, sel);
      expect(hit, `${sel} is hit-testable at its centre`).toBe(true);
    }

    // The card-scale band lives inside a card and never meets the nav.
    await expect(page.locator('.brutal-sash-corner--card')).toBeVisible();

    // The outcome, not just the mechanism: at 375px the sash must cost the page
    // nothing. Compared against a sash-less page rather than against zero,
    // because the header row itself overflows below ~390px on every page — a
    // pre-existing bug this component neither caused nor is allowed to worsen.
    const overflowOf = async (route: string) => {
      await page.goto(route);
      return page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
    };
    const withSash = await overflowOf(SASH_ROUTE);
    const without = await overflowOf('/services/');
    expect(withSash, 'the strip adds no horizontal overflow').toBeLessThanOrEqual(without);
  });

  test('the sash never costs the page a horizontal scrollbar', async ({ page }) => {
    for (const width of NO_OVERFLOW_WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(SASH_ROUTE);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, `${width}px wide`).toBeLessThanOrEqual(1);
    }
  });

  test('the focused band draws its ring inside the corner box', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SASH_ROUTE);

    // focus() rather than Tab: all three engines match :focus-visible on
    // programmatic focus of a link (verified in each), while WebKit's default
    // keyboard navigation skips links entirely — that difference is the subject
    // of the next test, not this one.
    const band = pageSash(page).locator('.brutal-sash');
    await band.focus();
    await expect(band).toBeFocused();

    const outline = await band.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        width: cs.outlineWidth,
        style: cs.outlineStyle,
        offset: cs.outlineOffset,
        focusVisible: el.matches(':focus-visible'),
      };
    });
    expect(outline.focusVisible, 'the ring is carried by :focus-visible').toBe(true);
    expect(outline.style).toBe('solid');
    expect(outline.width).toBe('2px');
    expect(outline.offset, 'inset — an outside ring would be clipped').toBe('-4px');
  });

  test('the focused under-band draws the INVERTED ring inside the corner box', async ({ page }) => {
    test.skip(LIVE_SUBTEXT === undefined, 'no live entry sets a subtext — no under-band to focus');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SASH_ROUTE);

    const under = pageSash(page).locator('.brutal-sash-under');
    await under.focus();
    await expect(under).toBeFocused();

    // The inversion is the point: the under-band fills with --sash-ink, so its
    // ring is --sash-bg where the main band's is --sash-ink. A ring that
    // regressed to the main band's colour would vanish into the dark fill.
    const ring = await under.evaluate((el) => {
      const cs = getComputedStyle(el);
      const band = el.closest('.brutal-sash-corner')!.querySelector('.brutal-sash')!;
      return {
        width: cs.outlineWidth,
        style: cs.outlineStyle,
        offset: cs.outlineOffset,
        color: cs.outlineColor,
        fill: cs.backgroundColor,
        bandInk: getComputedStyle(band).color,
        focusVisible: el.matches(':focus-visible'),
      };
    });
    expect(ring.focusVisible, 'the ring is carried by :focus-visible').toBe(true);
    expect(ring.style).toBe('solid');
    expect(ring.width).toBe('2px');
    expect(ring.offset, 'inset — an outside ring would be clipped').toBe('-4px');
    expect(ring.color, 'the ring is the band fill inverted, not the main band ink').not.toBe(
      ring.bandInk
    );
    expect(ring.color, 'and it contrasts with the fill it sits on').not.toBe(ring.fill);
  });

  test('the band is in the natural tab order, right after the skip-nav link', async ({
    page,
    browserName,
  }) => {
    // WebKit ships with "press Tab to highlight each item" OFF, so Tab skips
    // links there by preference, not by defect — Safari users reach them with
    // Option+Tab. Asserting the DOM tab order on the two engines that honour it
    // is the honest scope; the ring itself is covered above on all three.
    test.skip(browserName === 'webkit', 'WebKit excludes links from Tab by default');

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SASH_ROUTE);
    await page.keyboard.press('Tab');
    await expect(page.locator('.skip-nav')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(pageSash(page).locator('.brutal-sash')).toBeFocused();
    if (LIVE_SUBTEXT !== undefined) {
      // The under-band link is the band's immediate DOM sibling.
      await page.keyboard.press('Tab');
      await expect(pageSash(page).locator('.brutal-sash-under')).toBeFocused();
    }
  });

  test('the strip keeps the same tab order on mobile', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit excludes links from Tab by default');
    test.skip(LIVE_SUBTEXT === undefined, 'one-line strip: covered by the desktop order test');

    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(SASH_ROUTE);
    await page.keyboard.press('Tab');
    await expect(page.locator('.skip-nav')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(pageSash(page).locator('.brutal-sash')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(pageSash(page).locator('.brutal-sash-under')).toBeFocused();
  });
});
