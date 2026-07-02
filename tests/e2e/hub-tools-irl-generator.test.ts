import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
// xlsx-js-style is CJS; the namespace-vs-default interop shape differs between
// the vitest and Playwright runners, so normalize to whichever carries `read`.
import * as XLSXImport from 'xlsx-js-style';
const XLSX = (XLSXImport as unknown as { default?: typeof XLSXImport }).default ?? XLSXImport;

const PAGE_URL = '/hub/tools/information-request-list-generator';

/**
 * Deep readiness gate — wait on the submit button (the element the test cases
 * actually interact with), not just `'domcontentloaded'`. The button is
 * rendered statically by Astro, so its presence is the synchronous-DOM signal
 * the page is ready to interact with. See src/docs/testing/TEST_BEST_PRACTICES.md
 * § 25.
 */
async function gotoTool(page: Page): Promise<void> {
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button.irl-gen__cta', { timeout: 10000 });
  // Section checkboxes are rendered client-side from the parsed article; wait
  // for them so tests that interact with sections aren't racing hydration.
  await page.waitForSelector('#irl-gen-sections-list input[name="sections"]', { timeout: 10000 });
}

test.describe('Hub Tools — Information Request List Generator', () => {
  test('renders the form with target input + context radios + download CTA', async ({ page }) => {
    await gotoTool(page);

    await expect(page.locator('input#targetName')).toBeVisible();
    await expect(page.locator('input[name="transactionContext"][value="sell-side"]')).toBeVisible();
    await expect(page.locator('input[name="transactionContext"][value="buy-side"]')).toBeVisible();
    await expect(
      page.locator('input[name="transactionContext"][value="value-creation"]')
    ).toBeVisible();
    await expect(page.locator('button.irl-gen__cta')).toBeVisible();
  });

  test('renders the company + project inputs and an unchecked canonical toggle', async ({
    page,
  }) => {
    await gotoTool(page);
    await expect(page.locator('input#companyName')).toBeVisible();
    await expect(page.locator('input#projectName')).toBeVisible();
    await expect(page.locator('input#showCanonicalReference')).not.toBeChecked();
  });

  test('renders section checkboxes, all checked by default', async ({ page }) => {
    await gotoTool(page);
    const boxes = page.locator('#irl-gen-sections-list input[name="sections"]');
    const count = await boxes.count();
    expect(count).toBeGreaterThanOrEqual(10);
    // Every rendered section starts checked.
    for (let i = 0; i < count; i++) {
      await expect(boxes.nth(i)).toBeChecked();
    }
    // The canonical "00" Basics section is present.
    await expect(
      page.locator('#irl-gen-sections-list input[name="sections"][value="00"]')
    ).toBeVisible();
  });

  test('unchecking a section still downloads a valid .xlsx', async ({ page }) => {
    await gotoTool(page);
    await page.locator('#irl-gen-sections-list input[name="sections"][value="00"]').uncheck();

    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
    await page.locator('button.irl-gen__cta').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^GST-IRL-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  test('adding a custom request row still downloads a valid .xlsx', async ({ page }) => {
    await gotoTool(page);
    await page.locator('.irl-gen__section[data-section="00"] .irl-gen__add-custom').click();
    const customInput = page.locator('.irl-gen__section[data-section="00"] .irl-gen__custom-input');
    await expect(customInput).toBeVisible();
    await customInput.fill('Bespoke engagement-specific request.');

    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
    await page.locator('button.irl-gen__cta').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  });

  test('clearing all sections blocks download and shows a status message', async ({ page }) => {
    await gotoTool(page);
    await page.locator('#irl-gen-clear-all').click();
    await page.locator('button.irl-gen__cta').click();
    // No download fires; the status line prompts the user to pick a section.
    await expect(page.locator('#irl-gen-status')).toContainText(/at least one section/i);
  });

  test('intro paragraph links back to the canonical library article', async ({ page }) => {
    await gotoTool(page);
    const libraryLink = page.locator('a[href="/hub/library/information-request-list/"]');
    await expect(libraryLink).toBeVisible();
    await expect(libraryLink).toHaveText(/Information Request List/i);
  });

  test('clicking Download with no input triggers a .xlsx download named GST-IRL-<date>.xlsx', async ({
    page,
  }) => {
    await gotoTool(page);

    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
    await page.locator('button.irl-gen__cta').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^GST-IRL-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  test('supplied targetName slugifies into the filename', async ({ page }) => {
    await gotoTool(page);
    await page.locator('input#targetName').fill('MedSig Health');

    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
    await page.locator('button.irl-gen__cta').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^GST-IRL-MedSig-Health-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  test('status line updates after a successful download', async ({ page }) => {
    await gotoTool(page);

    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
    await page.locator('button.irl-gen__cta').click();
    await downloadPromise;

    await expect(page.locator('#irl-gen-status')).toContainText(/Downloaded GST-IRL-/);
    await expect(page.locator('#irl-gen-status')).toContainText(/\.xlsx/);
  });

  test('downloaded file is a real .xlsx (ZIP magic bytes PK\\x03\\x04 at offset 0)', async ({
    page,
  }) => {
    await gotoTool(page);

    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
    await page.locator('button.irl-gen__cta').click();
    const download = await downloadPromise;

    // Inspect the actual bytes — `.xlsx` is a ZIP archive (OOXML), so the
    // first four bytes must be the local file header signature 0x504B0304
    // ("PK\x03\x04"). This catches the failure mode the previous vacuous
    // test missed: a corrupt or wrong-mimetype payload that still surfaces
    // a download event with the correct filename.
    const path = await download.path();
    expect(path).toBeTruthy();
    const bytes = readFileSync(path);
    expect(bytes.length).toBeGreaterThan(500);
    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4b); // 'K'
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);
  });

  test('tools landing index has a card linking to this generator', async ({ page }) => {
    await page.goto('/hub/tools', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.brutal-gateway-card', { timeout: 10000 });

    const card = page.locator('a[href="/hub/tools/information-request-list-generator"]').first();
    await expect(card).toBeVisible();
  });

  test('URL query params pre-fill the form (deeplink from the MCP tool)', async ({ page }) => {
    // The MCP generate_information_request_list_xlsx tool emits a deeplink
    // with `?target=...&context=...` so a user arriving from a Claude
    // Desktop chat doesn't have to re-type the args. Without this hydration
    // the MCP path is no better than a bookmark.
    await page.goto(`${PAGE_URL}?target=MedSig+Health&context=buy-side`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForSelector('button.irl-gen__cta', { timeout: 10000 });

    await expect(page.locator('input#targetName')).toHaveValue('MedSig Health');
    await expect(page.locator('input[name="transactionContext"][value="buy-side"]')).toBeChecked();
  });

  test('URL query params pre-fill company + project (deeplink)', async ({ page }) => {
    await page.goto(`${PAGE_URL}?company=Praxis+Capital&project=Project+Titan`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForSelector('button.irl-gen__cta', { timeout: 10000 });
    await expect(page.locator('input#companyName')).toHaveValue('Praxis Capital');
    await expect(page.locator('input#projectName')).toHaveValue('Project Titan');
  });

  test('URL sections param pre-checks only the listed sections', async ({ page }) => {
    await page.goto(`${PAGE_URL}?sections=00,01`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#irl-gen-sections-list input[name="sections"]', { timeout: 10000 });
    await expect(
      page.locator('#irl-gen-sections-list input[name="sections"][value="00"]')
    ).toBeChecked();
    await expect(
      page.locator('#irl-gen-sections-list input[name="sections"][value="01"]')
    ).toBeChecked();
    // A section not in the list is unchecked.
    await expect(
      page.locator('#irl-gen-sections-list input[name="sections"][value="09"]')
    ).not.toBeChecked();
  });

  test('URL canonical=1 pre-checks the canonical toggle', async ({ page }) => {
    await page.goto(`${PAGE_URL}?canonical=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button.irl-gen__cta', { timeout: 10000 });
    await expect(page.locator('input#showCanonicalReference')).toBeChecked();
  });

  test('URL query params ignore unknown context values (defensive)', async ({ page }) => {
    // A malformed or attacker-supplied URL with an unknown context value
    // must not break the form — it should fall back to the default
    // (Unspecified) without raising.
    await page.goto(`${PAGE_URL}?target=Acme&context=not-a-real-value`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForSelector('button.irl-gen__cta', { timeout: 10000 });

    await expect(page.locator('input#targetName')).toHaveValue('Acme');
    await expect(page.locator('input[name="transactionContext"][value=""]')).toBeChecked();
  });

  test('URL custom param hydrates a pre-filled row that lands in the downloaded .xlsx', async ({
    page,
  }) => {
    // The MCP tool encodes custom requests as a JSON `custom` deeplink param so
    // the Hub page reproduces them for one-click download. This verifies the
    // full round-trip: deeplink → hydrated pre-filled row → the request text
    // actually present in the generated workbook (behavior, not presence).
    const CUSTOM_TEXT = 'Detail the top 3 customer concentration risks by ARR.';
    const custom = encodeURIComponent(JSON.stringify([{ section: '01', text: CUSTOM_TEXT }]));
    await page.goto(`${PAGE_URL}?custom=${custom}`, { waitUntil: 'domcontentloaded' });

    // Readiness gate (§25): wait for the deepest element the test depends on —
    // the custom-request input the hydration creates inside section 01, not the
    // outer form. It does not exist in the SSR HTML; the client builds it from
    // the `custom` param.
    const customInput = page.locator('.irl-gen__section[data-section="01"] .irl-gen__custom-input');
    await customInput.waitFor({ state: 'visible', timeout: 10000 });

    // Hydration: the created row is pre-filled with the exact request text
    // (auto-retrying assertion, not a snapshot read).
    await expect(customInput).toHaveValue(CUSTOM_TEXT);

    // Full round-trip: the generated .xlsx contains the custom request as a row.
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
    await page.locator('button.irl-gen__cta').click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).toBeTruthy();

    const wb = XLSX.read(readFileSync(path!), { type: 'buffer' });
    const sheet = wb.Sheets['Information Request List'];
    const flat = XLSX.utils
      .sheet_to_json<string[]>(sheet, { header: 1, defval: '' })
      .flat()
      .join('\n');
    expect(flat).toContain(CUSTOM_TEXT);
  });
});
