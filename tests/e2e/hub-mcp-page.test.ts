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

  test('carries the human-in-the-loop caveat for radar content', async ({ page }) => {
    // The BL-093 acceptance criterion. Asserted so it cannot be quietly dropped
    // in a future copy edit.
    const caveat = page.locator('.brutal-callout--warning');
    await expect(caveat).toBeVisible();
    await expect(caveat).toContainText(/should not be auto-actioned/i);
    await expect(caveat).toContainText(/human review/i);
  });

  test('links the status page and no developer-docs subdomain', async ({ page }) => {
    await expect(page.locator('a[href*="status.mcp.globalstrategic.tech"]')).toBeVisible();
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
