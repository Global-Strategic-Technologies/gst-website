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
import { test, expect, type Page } from '@playwright/test';
import { getActiveAnnouncement } from '../../src/data/announcements';

/**
 * Corner-box size ↔ nav reserve, per breakpoint. Edit with sash.css, or neither.
 * The tiers switch at 768 / 540 / 512 — the widths at which each reserve FITS on
 * every engine, not the handoff's 768/480; below 512 the sash stands down
 * entirely (see the narrow-viewport tests at the bottom of this file).
 */
const BREAKPOINTS = [
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
 * 200px (HeaderNavLinks.astro). The tier reserves are identical either way —
 * the under-band hides ≤768px and the per-tier restatements repeat the tier
 * values — so only the desktop expectation is conditional.
 */
const LIVE_SUBTEXT = getActiveAnnouncement(SASH_ROUTE)?.subtext;
const DESKTOP_RESERVE = LIVE_SUBTEXT === undefined ? '168px' : '200px';

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
   * three-engine fit probe of the 200px reserve at 769–1440px.
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

    const under = pageSash(page).locator('.brutal-sash-under');
    await expect(under).toHaveCount(1);
    await expect(under).toHaveText(LIVE_SUBTEXT!);
    await expect(under).toHaveAttribute('aria-hidden', 'true');

    // The inverted pair, asserted as computed equality against the main
    // band's own values so it follows every palette rather than pinning hex.
    const inverted = await page.evaluate(() => {
      const corner = document.querySelector('.brutal-sash-corner:not(.brutal-sash-corner--card)')!;
      const main = getComputedStyle(corner.querySelector('.brutal-sash')!);
      const underCs = getComputedStyle(corner.querySelector('.brutal-sash-under')!);
      return underCs.backgroundColor === main.color && underCs.color === main.backgroundColor;
    });
    expect(inverted, 'the under-band inverts the two sash tokens').toBe(true);

    // The band is aria-hidden; the announcement is spoken on the link instead
    // — either the registry's explicit ariaLabel (used e.g. to keep a literal
    // pipe in the subtext from being read as "vertical line") or, absent one,
    // the composed default, which must carry the subtext.
    const spoken = await pageSash(page).locator('.brutal-sash').getAttribute('aria-label');
    const liveAria = getActiveAnnouncement(SASH_ROUTE)?.ariaLabel;
    if (liveAria !== undefined) {
      expect(spoken, 'the registry aria override is spoken').toBe(liveAria);
    } else {
      expect(spoken, 'subtext joins the composed aria-label').toContain(LIVE_SUBTEXT!);
    }

    const reserve = await page
      .locator('.site-header nav ul')
      .evaluate((el) => getComputedStyle(el).paddingRight);
    expect(reserve, 'the conditional desktop reserve').toBe('200px');

    // Hidden ≤768 alongside __detail, and the tier restatement defeats the
    // base bump (:has() still matches the display:none band).
    await page.setViewportSize({ width: 768, height: 800 });
    await expect(under).toBeHidden();
    const tierReserve = await page
      .locator('.site-header nav ul')
      .evaluate((el) => getComputedStyle(el).paddingRight);
    expect(tierReserve, 'tier reserve returns while the band is hidden').toBe('140px');
  });

  for (const bp of BREAKPOINTS) {
    test(`at ${bp.name} the corner box is ${bp.box}px and the nav reserves ${bp.reserve}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.goto(SASH_ROUTE);

      const corner = pageSash(page);
      const size = await corner.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { w: cs.width, h: cs.height };
      });
      expect(size.w).toBe(`${bp.box}px`);
      expect(size.h).toBe(`${bp.box}px`);

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

  test('below 512px the sash stands down and the nav takes its corner back', async ({ page }) => {
    // The regression this pins: at 375px the logo and four links already fill
    // the header row, so a 108px reserve pushed the nav 64px past the viewport
    // and every sash page scrolled sideways. Both halves have to agree — :has()
    // still matches a display:none corner box, so a hidden sash with a live
    // reserve would be the same bug with nothing on screen to explain it.
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(SASH_ROUTE);

    const corner = pageSash(page);
    await expect(corner).toHaveCount(1);
    await expect(corner).toBeHidden();

    const reserve = await page
      .locator('.site-header nav ul')
      .evaluate((el) => getComputedStyle(el).paddingRight);
    expect(reserve, 'no corner to reserve').toBe('0px');

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
    expect(withSash, 'the sash adds no overflow where it stands down').toBeLessThanOrEqual(without);
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
  });
});
