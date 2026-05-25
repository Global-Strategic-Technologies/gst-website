import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

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
});
