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

/** Tier headings, in the order the cards are authored. */
const EXPECTED_TIERS = ['free-pilot', 'paid', 'enterprise'] as const;

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

  test('renders one gateway card per assignable tier', async ({ page }) => {
    const cards = page.locator('.mcp-tiers .brutal-gateway-card');
    await expect(cards).toHaveCount(EXPECTED_TIERS.length);

    for (const [index, tier] of EXPECTED_TIERS.entries()) {
      await expect(cards.nth(index).locator('h2')).toHaveText(tier);
    }
  });

  test('every tier card offers a prefilled access request', async ({ page }) => {
    const ctas = page.locator('.mcp-tiers .brutal-gateway-card__cta');
    await expect(ctas).toHaveCount(EXPECTED_TIERS.length);

    for (let i = 0; i < EXPECTED_TIERS.length; i++) {
      const href = await ctas.nth(i).getAttribute('href');
      expect(href).toMatch(/^mailto:/);
      expect(href).toContain('subject=');
      expect(href).toContain('body=');
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
    // The page carries the status link twice on purpose — the endpoint row at the
    // top and the "How access works" bullet — so this asserts "at least one
    // renders" rather than a single element. A bare `toBeVisible()` here was a
    // strict-mode violation once the second link landed, and pinning an exact
    // count would just break on the next copy edit.
    const statusLinks = page.locator('a[href*="status.mcp.globalstrategic.tech"]');
    expect(await statusLinks.count()).toBeGreaterThan(0);
    await expect(statusLinks.first()).toBeVisible();

    // The real guardrail: the docs subdomain does not exist, so it must never
    // be linked from here.
    await expect(page.locator('a[href*="docs.mcp.globalstrategic.tech"]')).toHaveCount(0);
  });

  test('returns to the hub', async ({ page }) => {
    const back = page.locator('.mcp-section > .container > a.cta-button[href="/hub/"]');
    await expect(back).toBeVisible();
    await back.click();
    await page.waitForURL('**/hub/');
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
