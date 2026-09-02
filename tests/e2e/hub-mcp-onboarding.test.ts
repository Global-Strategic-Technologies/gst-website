/**
 * /hub/mcp/{get-started,using,advanced-operations}/ — the MCP onboarding
 * guides from the 2026-08 design handoff.
 *
 * Page-shape coverage in the hub idiom: semantic + BEM selectors, no test ids.
 * Published-fact parity (prompt count, engine count, fill-ratio rule, cited
 * names) is asserted statically in
 * `tests/integration/mcp-onboarding-parity.test.ts` — this suite covers what
 * only a browser can: rendering, the sticky TOC and its scroll-spy, the copy
 * buttons' feedback contract, and the clips' lazy source attach.
 *
 * Clipboard: per TEST_BEST_PRACTICES anti-patterns 11 & 24, no clipboard
 * permissions are granted anywhere — the assertion is the visible feedback
 * ("Copied" label swap), which `copyWithFeedback` shows whether or not the
 * write succeeded. That IS the contract the page owns.
 */
import { test, expect } from '@playwright/test';

/** One entry per guide: route, h1, and its sticky-TOC section ids in order. */
const GUIDES = [
  {
    name: 'Get Started',
    route: '/hub/mcp/get-started/',
    h1: /Get started with the GST MCP Server/,
    crumb: 'Get Started',
    sections: ['prerequisites', 'quick-start', 'verify', 'whats-next'],
    clips: 2,
  },
  {
    name: 'Using the Server',
    route: '/hub/mcp/using/',
    h1: /Using the GST MCP Server/,
    crumb: 'Using the Server',
    sections: ['first-query', 'prompts', 'resources', 'troubleshooting', 'next'],
    clips: 1,
  },
  {
    name: 'Advanced Operations',
    route: '/hub/mcp/advanced-operations/',
    h1: /Ingest an information request list/,
    crumb: 'Advanced Operations',
    sections: [
      'why',
      'round-trip',
      'run-it',
      'modes',
      'output',
      'downstream',
      'discipline',
      'next',
    ],
    clips: 0,
  },
] as const;

for (const guide of GUIDES) {
  test.describe(`MCP onboarding — ${guide.name}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(guide.route);
      await page.waitForSelector('h1');
    });

    test('renders the hub header and breadcrumb', async ({ page }) => {
      await expect(page.locator('.hub-header__title')).toHaveText(guide.h1);
      const nav = page.locator('nav[aria-label="Breadcrumb"]');
      await expect(nav.locator(`a[href="/hub/mcp/"]`)).toHaveText('MCP Server');
      await expect(nav.getByText(guide.crumb)).toBeVisible();
    });

    test('the sticky TOC links every section, and every id resolves', async ({ page }) => {
      const links = page.locator('[data-onboarding-toc] a');
      await expect(links).toHaveCount(guide.sections.length);
      for (const [i, id] of guide.sections.entries()) {
        await expect(links.nth(i)).toHaveAttribute('href', `#${id}`);
        await expect(page.locator(`section#${id}`)).toHaveCount(1);
      }
    });

    test('scroll-spy marks the section under the reader, not the first one', async ({ page }) => {
      // A middle section, top-aligned: `scrollIntoView(true)` honors its
      // `scroll-margin-top: 80px`, putting its top inside the 100px threshold
      // while every later section stays below it — deterministic, where the
      // last section may be too short to ever cross the threshold.
      const midId = guide.sections[2];
      await page.evaluate((id) => {
        document.getElementById(id)?.scrollIntoView(true);
      }, midId);
      await expect(page.locator(`[data-onboarding-toc] a[href="#${midId}"]`)).toHaveClass(
        /is-active/
      );
      await expect(
        page.locator(`[data-onboarding-toc] a[href="#${guide.sections[0]}"]`)
      ).not.toHaveClass(/is-active/);
    });

    test('a copy button flips to Copied and restores its label', async ({ page }) => {
      const btn = page.locator('[data-copy], [data-copy-prev]').first();
      await btn.scrollIntoViewIfNeeded();
      const original = (await btn.textContent())?.trim();
      await btn.click();
      await expect(btn).toHaveText('Copied');
      // copyWithFeedback restores after its duration; wait on state, not time.
      await expect(btn).toHaveText(original ?? 'Copy', { timeout: 5000 });
    });

    test('next-step cards render as gateway cards with resolvable routes', async ({ page }) => {
      const cards = page.locator('.brutal-gateway-grid .brutal-gateway-card');
      await expect(cards).toHaveCount(3);
      const ctas = page.locator('.brutal-gateway-card__cta');
      await expect(ctas).toHaveCount(3);
      for (const href of await ctas.evaluateAll((els) =>
        els.map((el) => el.getAttribute('href'))
      )) {
        expect(href).toMatch(/^\/(hub|downloads)\//);
      }
    });

    test('the Read docs card reaches the capability reference', async ({ page }) => {
      // This assertion replaces a comment recording /hub/mcp/docs/ as a known
      // not-yet-built target. It shipped, so the link is now navigable and the
      // suite says so rather than asserting shape only.
      await page.locator('a[href="/hub/mcp/docs/"]').first().click();
      await expect(page).toHaveURL(/\/hub\/mcp\/docs\/$/);
      await expect(page.locator('h1')).toHaveText('MCP Documentation');
    });

    if (guide.clips > 0) {
      test('screen-capture clips lazily attach their sources', async ({ page }) => {
        const clips = page.locator('video[data-clip]');
        await expect(clips).toHaveCount(guide.clips);
        const first = clips.first();
        // Collapsed <details> clips attach on open; the wide clip attaches on
        // approach. Both end with real <source> children — the CSP proof.
        const details = page.locator('details[data-clip-details]').first();
        if ((await details.count()) > 0) {
          await details.locator('summary').click();
          await expect(details).toHaveAttribute('open', '');
        } else {
          await first.scrollIntoViewIfNeeded();
        }
        await expect(first.locator('source')).not.toHaveCount(0);
        await expect(first).toHaveAttribute('poster', /\/images\/hub\/mcp\//);
      });
    }

    test('renders without horizontal overflow at 768px and 480px', async ({ page }) => {
      for (const width of [768, 480]) {
        await page.setViewportSize({ width, height: 900 });
        // The wide Using-page clip pans inside its own scroller by design; the
        // page body itself must not scroll horizontally.
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        expect(overflow, `${width}px viewport`).toBeLessThanOrEqual(1);
      }
    });

    test('dark theme renders with a dark background', async ({ page }) => {
      await page.evaluate(() => {
        document.documentElement.classList.add('dark-theme');
      });
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      // Not a pixel pin — just proof the page participates in the theme system
      // (its background is token-driven, not hardcoded light).
      expect(bg).not.toBe('rgb(255, 255, 255)');
    });
  });
}

test.describe('MCP onboarding — cross-page wiring', () => {
  test('the get-started endpoint matches the marketing page endpoint', async ({ page }) => {
    await page.goto('/hub/mcp/get-started/');
    await expect(page.locator('.endpoint-code').first()).toHaveText(
      'https://mcp.globalstrategic.tech/mcp'
    );
  });

  test('the request-access links land on an existing anchor on /hub/mcp/', async ({ page }) => {
    await page.goto('/hub/mcp/');
    await expect(page.locator('#request-access')).toHaveCount(1);
  });

  test('the parent page guides section links all four guides', async ({ page }) => {
    await page.goto('/hub/mcp/');
    const grid = page.locator('.mcp-guides');
    for (const guide of GUIDES) {
      await expect(grid.locator(`a[href="${guide.route}"]`)).toHaveCount(1);
    }
    // The docs page is the fourth card. It is deliberately NOT a GUIDES entry:
    // that list drives per-guide describes expecting a sticky TOC and clips,
    // neither of which the two-lens reference has.
    await expect(grid.locator('a[href="/hub/mcp/docs/"]')).toHaveCount(1);
    await expect(grid.locator('.brutal-gateway-card')).toHaveCount(4);
  });

  test('the Northwind demo IRL downloads from the advanced-operations page link', async ({
    page,
  }) => {
    await page.goto('/hub/mcp/advanced-operations/');
    const link = page.locator('a[href="/downloads/mcp/northwind-analytics-irl.md"]');
    await expect(link).toHaveAttribute('download', '');
    // The asset itself must exist — a moved file would 404 silently otherwise.
    const res = await page.request.get('/downloads/mcp/northwind-analytics-irl.md');
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain('Northwind Analytics');
  });
});
