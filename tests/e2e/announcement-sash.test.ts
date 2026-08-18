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
      expect(reserve, 'reserve pairs with the corner-box size').toBe(bp.reserve);
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
