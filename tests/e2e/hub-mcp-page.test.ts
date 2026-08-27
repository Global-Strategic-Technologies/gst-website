/**
 * /hub/mcp/ — MCP Server marketing page (BL-093 § Website marketing surface).
 *
 * Page-shape coverage in the hub idiom: semantic + BEM selectors, no test ids.
 * Copy guardrails (published tier numbers, forbidden claims, tool-catalog
 * parity with mcp-server source) are asserted statically in
 * `tests/integration/mcp-marketing-parity.test.ts` — this suite covers what
 * only a browser can: rendering, structure, and the cross-link from /services/.
 */
import { test, expect } from '@playwright/test';

const ROUTE = '/hub/mcp/';

/** Tier columns, in the order they are authored: display name + config id. */
const EXPECTED_TIERS = [
  { id: 'free-pilot', name: 'Pilot' },
  { id: 'paid', name: 'Deal Team' },
  { id: 'enterprise', name: 'Firm' },
] as const;

test.describe('MCP Server page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE);
  });

  test('renders the hub header', async ({ page }) => {
    const title = page.locator('.hub-header__title');
    await expect(title).toBeVisible();
    await expect(title).toHaveText(/MCP Server/);
  });

  test('breadcrumbs link back to the hub with the canonical name', async ({ page }) => {
    const crumb = page.locator('nav[aria-label="Breadcrumb"] a[href="/hub/"]');
    await expect(crumb).toBeVisible();
    await expect(crumb).toHaveText('The GST Hub');
  });

  test('renders one column header per assignable tier', async ({ page }) => {
    const tiers = page.locator('.mcp-tiers .mcp-tier');
    await expect(tiers).toHaveCount(EXPECTED_TIERS.length);

    for (const [index, tier] of EXPECTED_TIERS.entries()) {
      await expect(tiers.nth(index).locator('.mcp-tier__name')).toHaveText(tier.name);
      await expect(tiers.nth(index).locator('.mcp-tier__id')).toHaveText(tier.id);
    }
  });

  test('each tier header sits above its own column of numbers', async ({ page }) => {
    // The headers and the table are separate elements that have to resolve to
    // the same four-column split (grid tracks vs `table-layout: fixed`). Get it
    // wrong and every published ceiling is attributed to the wrong tier, which
    // no static assertion on the markup can see. Above the 768px breakpoint
    // only — below it the tiers stack and each cell names its own tier.
    const width = page.viewportSize()?.width ?? 0;
    test.skip(width <= 768, 'the four-column form only exists above 768px');

    const cells = page.locator('.mcp-tier-table tbody tr').first().locator('td');
    for (let i = 0; i < EXPECTED_TIERS.length; i++) {
      const header = await page.locator('.mcp-tiers .mcp-tier').nth(i).boundingBox();
      const cell = await cells.nth(i).boundingBox();
      expect(header, 'tier header must be laid out').not.toBeNull();
      expect(cell, 'value cell must be laid out').not.toBeNull();
      // Sub-pixel track rounding is the only tolerance intended here.
      expect(Math.abs(header!.x - cell!.x)).toBeLessThan(2);
      expect(Math.abs(header!.width - cell!.width)).toBeLessThan(2);
    }
  });

  test('below the breakpoint, every value names its own tier', async ({ page }) => {
    // The stacked form is otherwise unrendered by any test: all three Playwright
    // projects are desktop, so the alignment test above skips out and nothing
    // exercises the width where the tier headers stop being column headers.
    //
    // What this proves is that the prefix RENDERS — a dropped or out-scoped
    // `::before` rule leaves three unlabelled numbers per row, which is the
    // regression this form exists to prevent. It cannot prove the prefix is the
    // RIGHT tier: the content resolves from the same `data-tier` it is compared
    // against, so the two agree by construction. That half is pinned in
    // `mcp-marketing-parity.test.ts`, which binds each `data-tier` cell to its
    // tier's ceilings in `mcp-server` source.
    await page.setViewportSize({ width: 480, height: 900 });

    const cells = page.locator('.mcp-tier-table tbody td');
    await expect(cells).toHaveCount(12);

    // `getComputedStyle(…, '::before').content` is engine-dependent for `attr()`:
    // Chromium and WebKit return the SUBSTITUTED string (`"Deal Team"`), Firefox
    // returns the declaration verbatim (`attr(data-tier)`). Measured across the
    // repo's own browser builds — the first version of this test asserted the
    // substituted form and was deterministically red on `--project=firefox`.
    //
    // Both forms are accepted rather than gating Firefox out, so all three
    // engines still probe the thing that matters: an out-scoped or deleted rule
    // computes to `none` in every engine and fails everywhere.
    const unlabelled = await page.evaluate(() =>
      [...document.querySelectorAll('.mcp-tier-table tbody td')]
        .map((el) => ({
          tier: el.getAttribute('data-tier') ?? '',
          rendered: getComputedStyle(el, '::before').content,
        }))
        .filter(
          ({ tier, rendered }) =>
            !tier || !(rendered.includes(tier) || rendered.includes('attr(data-tier)'))
        )
    );
    expect(unlabelled).toEqual([]);

    // The prefixes are only necessary because the headers have stacked by here.
    const tiers = page.locator('.mcp-tiers .mcp-tier');
    const first = await tiers.first().boundingBox();
    const second = await tiers.nth(1).boundingBox();
    expect(second!.y).toBeGreaterThan(first!.y);
  });

  test('every tier offers a prefilled access request', async ({ page }) => {
    const ctas = page.locator('.mcp-tiers .mcp-tier__cta');
    await expect(ctas).toHaveCount(EXPECTED_TIERS.length);

    for (let i = 0; i < EXPECTED_TIERS.length; i++) {
      const href = await ctas.nth(i).getAttribute('href');
      expect(href).toMatch(/^mailto:/);
      expect(href).toContain('subject=');
      expect(href).toContain('body=');
      // The tier the link requests is the one whose column it sits in.
      expect(decodeURIComponent(href ?? '')).toContain(`(${EXPECTED_TIERS[i].id})`);
    }
  });

  test('the request-access CTA prefills the operator intake', async ({ page }) => {
    const cta = page.locator('.mcp-block--cta a[href^="mailto:"]');
    await expect(cta).toBeVisible();

    const href = (await cta.getAttribute('href')) ?? '';
    expect(href).toContain('contact@globalstrategic.tech');
    // Subject and the intake prompts the operator inbox expects.
    expect(decodeURIComponent(href)).toContain('GST MCP Server access request');
    expect(decodeURIComponent(href)).toContain('Intended use case:');
  });

  test('copies each URL from its own row and confirms on that button', async ({
    page,
    context,
    browserName,
  }) => {
    const rows = [
      {
        source: '[data-endpoint-url]',
        expected: 'https://mcp.globalstrategic.tech/mcp',
        accessibleName: 'Copied endpoint URL',
      },
      {
        source: '[data-status-url]',
        expected: 'https://status.mcp.globalstrategic.tech/',
        accessibleName: 'Copied status page URL',
      },
    ];

    await expect(page.locator('[data-copy-endpoint]')).toHaveCount(rows.length);

    // Clipboard permissions are Chromium-only in Playwright — granting them on
    // Firefox/WebKit throws "Unknown permission" (TEST_BEST_PRACTICES § 11), so
    // the read-back assertion is guarded and the label check runs everywhere.
    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    }

    for (const [index, row] of rows.entries()) {
      const published = (await page.locator(row.source).textContent())?.trim();
      expect(published).toBe(row.expected);

      const button = page.locator('[data-copy-endpoint]').nth(index);
      const label = button.locator('[data-copy-label]');

      // Asserted on the visible label, not the button: the button also carries
      // an `.sr-only` suffix that distinguishes the two ("Copy endpoint URL" vs
      // "Copy status page URL") and must survive the swap.
      await expect(label).toHaveText('Copy');
      await button.click();
      await expect(label).toHaveText('Copied');
      await expect(button).toHaveClass(/brutal-btn--copied/);

      // The accessible name still distinguishes the buttons after the swap, and
      // still reflects the new state — that pairing is why there is no
      // `aria-label` here, which would have frozen the name at "Copy …".
      await expect(button).toHaveAccessibleName(row.accessibleName);

      if (browserName === 'chromium') {
        // Proves each button copies ITS OWN row, not a hardcoded first element.
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(row.expected);
      }
    }
  });

  test('the status URL is a working link, the endpoint is not', async ({ page }) => {
    // The status page is meant to be visited; the MCP endpoint is a transport
    // address that would only error in a browser, so it is deliberately not a link.
    const statusLink = page.locator('.mcp-endpoint a[href^="https://status.mcp"]');
    await expect(statusLink).toHaveCount(1);
    await expect(statusLink).toHaveAttribute('rel', /noopener/);
    await expect(page.locator('.mcp-endpoint a[href*="mcp.globalstrategic.tech/mcp"]')).toHaveCount(
      0
    );
  });

  test('hides each catalog behind a disclosure that opens on click', async ({ page }) => {
    // One per primitive: Tools, Resources, Prompts.
    const disclosures = page.locator('.mcp-disclosure');
    await expect(disclosures).toHaveCount(3);

    const first = disclosures.first();
    const grid = first.locator('.mcp-catalog');

    // Collapsed by default: the point is to keep the density out of the way.
    await expect(grid).toBeHidden();
    await expect(first.locator('summary')).toBeVisible();

    await first.locator('summary').click();
    await expect(grid).toBeVisible();

    await first.locator('summary').click();
    await expect(grid).toBeHidden();
  });

  test('the disclosure is operable by keyboard', async ({ page }) => {
    // Native <details> gives this for free, which is the reason for choosing it
    // over a bespoke toggle. Asserted so a future "improvement" to a div-based
    // control cannot quietly drop it.
    const first = page.locator('.mcp-disclosure').first();
    await first.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(first.locator('.mcp-catalog')).toBeVisible();
  });

  test('links the status page and no developer-docs subdomain', async ({ page }) => {
    // Once, in the "For your engineers" row. The "How access works" fact names
    // the status page rather than repeating the URL, so a reader never has to
    // check whether two printed URLs agree. Asserted as "at least one renders"
    // rather than an exact count, which would break on the next copy edit.
    const statusLinks = page.locator('a[href*="status.mcp.globalstrategic.tech"]');
    expect(await statusLinks.count()).toBeGreaterThan(0);
    await expect(statusLinks.first()).toBeVisible();

    // The real guardrail: the docs subdomain does not exist, so it must never
    // be linked from here.
    await expect(page.locator('a[href*="docs.mcp.globalstrategic.tech"]')).toHaveCount(0);
  });

  test('returns to the hub by breadcrumb, not by a second primary CTA', async ({ page }) => {
    // Back-navigation used to be a `.cta-button` at the foot of the page, giving
    // it the same weight as the page's conversion. The breadcrumb carries it now.
    // The guides cards legitimately reuse `.cta-button` (every gateway card
    // does), so the pin is the intent itself — no back-to-hub primary CTA —
    // plus the conversion CTA still standing outside any card.
    await expect(page.locator('.mcp-section a.cta-button[href="/hub/"]')).toHaveCount(0);
    await expect(
      page.locator('.mcp-block--cta .cta-button', { hasText: 'REQUEST_MCP_ACCESS()' })
    ).toHaveCount(1);

    await page.locator('nav[aria-label="Breadcrumb"] a[href="/hub/"]').click();
    await page.waitForURL('**/hub/');
  });

  test('puts the endpoint below the argument, not above it', async ({ page }) => {
    // Nothing here is usable without a provisioned client record, so the
    // endpoint must not be the first thing under the header.
    const endpoints = page.locator('.mcp-block--engineers .mcp-endpoints');
    await expect(endpoints).toHaveCount(1);

    const exposed = await page.locator('.mcp-primitive-summary').boundingBox();
    const engineers = await endpoints.boundingBox();
    expect(exposed, "the What's exposed summary must render").not.toBeNull();
    expect(engineers!.y).toBeGreaterThan(exposed!.y);
  });
});

test.describe('MCP Server cross-links', () => {
  test('the hub landing page links to it', async ({ page }) => {
    await page.goto('/hub/');
    const card = page.locator('.hub-cards a[href="/hub/mcp/"]');
    await expect(card).toBeVisible();
    await card.click();
    await page.waitForURL(`**${ROUTE}`);
    await expect(page.locator('.hub-header__title')).toHaveText(/MCP Server/);
  });

  test('the services page links to it', async ({ page }) => {
    await page.goto('/services/');
    const link = page.locator('.mcp-offer a[href="/hub/mcp/"]');
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForURL(`**${ROUTE}`);
    await expect(page.locator('.hub-header__title')).toHaveText(/MCP Server/);
  });
});
