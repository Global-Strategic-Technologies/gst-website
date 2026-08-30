import { test, expect, type Page } from '@playwright/test';
// xlsx-js-style is CJS; the namespace-vs-default interop shape differs between
// the vitest and Playwright runners, so normalize to whichever carries `read`.
import * as XLSXImport from 'xlsx-js-style';
const XLSX = (XLSXImport as unknown as { default?: typeof XLSXImport }).default ?? XLSXImport;

const PAGE_URL = '/hub/tools/information-request-list-extractor/';

/**
 * Deep readiness gate. The client module's LAST statements are `showState('idle')`
 * + `resetDiag()`, and `resetDiag()` is what stamps `data-empty="true"` onto the
 * diagnostics block — so waiting on that attribute means every handler above it
 * (file input, drag/drop, copy, download) is attached. Per
 * TEST_BEST_PRACTICES § 26: wait on the signal that fires after all wiring, not
 * on a statically-rendered element.
 */
async function gotoTool(page: Page): Promise<void> {
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#irl-ext-drop', { timeout: 10000 });
  await page.waitForSelector('#irl-ext-diag[data-empty="true"]', { timeout: 10000 });
}

/**
 * A minimal IRL workbook, built in-process rather than committed as a binary
 * fixture. The column layout is the generator's contract:
 *   A Reference | B Request | C Status | D File Location | E Comments | F Notes | G Response
 */
function buildWorkbook(
  rows: (string | number)[][],
  sheetName = 'Information Request List'
): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName);
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const FILLED_ROWS: (string | number)[][] = [
  ['Target', 'Acme Co'],
  ['Engagement context', 'Value Creation'],
  ['Generated', '2026-05-23'],
  [],
  ['Reference', 'Request', 'Status', 'File Location', 'Comments', 'Notes', 'Response'],
  ['', '00 — Basics'],
  ['0-01', 'Company name', 'CLOSED', '', '', '', 'Acme Co, trading as Acme.'],
  [
    '0-02',
    'Engagement context',
    'CLOSED',
    'VDR/00/mandate.pdf',
    '',
    '',
    'Post-close value creation',
  ],
  ['0-03', 'Annual recurring revenue', 'OPEN', '', '', '', ''],
];

/** Attach a workbook to the (visually hidden but present) file input. */
async function pickWorkbook(page: Page, name: string, buffer: Buffer): Promise<void> {
  await page.setInputFiles('#irl-ext-file', {
    name,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
  });
}

test.describe('IRL Extractor — conversion', () => {
  test('converts a filled workbook to canonical markdown in the browser', async ({ page }) => {
    await gotoTool(page);

    // Idle first: the markdown panel must not be showing anything yet.
    await expect(page.locator('#irl-ext-md')).toBeHidden();
    await expect(page.locator('#irl-ext-idle')).toBeVisible();

    await pickWorkbook(page, 'acme-irl.xlsx', buildWorkbook(FILLED_ROWS));

    const md = page.locator('#irl-ext-md');
    await expect(md).toBeVisible({ timeout: 10000 });

    const text = await md.textContent();
    // The exact canonical shape — H1 with the (filled) suffix, the preamble
    // quote lines, and the bullet grammar the sweep consumes.
    expect(text).toContain('# Information Request List — Acme Co (filled)');
    expect(text).toContain('> Engagement context: Value Creation');
    expect(text).toContain('> Generated: 2026-05-23');
    expect(text).toContain('- 0-01 Company name [CLOSED] — Acme Co, trading as Acme.');
    expect(text).toContain(
      '- 0-02 Engagement context [CLOSED] — Post-close value creation (Source: VDR/00/mandate.pdf)'
    );
    expect(text).toContain('- 0-03 Annual recurring revenue [OPEN] — <NO RESPONSE>');
    // Section header rows are not bullets.
    expect(text).not.toContain('00 — Basics [');
  });

  test('reports the diagnostics the extractor actually returns', async ({ page }) => {
    await gotoTool(page);
    await pickWorkbook(page, 'acme-irl.xlsx', buildWorkbook(FILLED_ROWS));

    await expect(page.locator('#irl-ext-md')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#irl-ext-diag')).toHaveAttribute('data-empty', 'false');

    await expect(page.locator('#diag-bullets')).toHaveText('3');
    // Section NUMBERS, not titles — the extractor returns no titles.
    await expect(page.locator('#diag-sections')).toHaveText('00');
    await expect(page.locator('#diag-bytes')).toContainText('KB');

    await expect(page.locator('#irl-ext-status')).toContainText('3 requests');
    await expect(page.locator('#irl-ext-status')).toContainText('Information Request List');
  });

  test('enables the actions only once there is markdown, and copies it', async ({
    page,
    browserName,
  }) => {
    await gotoTool(page);

    // Inert before a pick — the buttons exist from first paint (so the layout
    // never shifts) but must not be operable.
    await expect(page.locator('#irl-ext-actions')).toHaveAttribute('data-enabled', 'false');
    await expect(page.locator('#irl-ext-copy')).toBeDisabled();

    await pickWorkbook(page, 'acme-irl.xlsx', buildWorkbook(FILLED_ROWS));
    await expect(page.locator('#irl-ext-actions')).toHaveAttribute('data-enabled', 'true', {
      timeout: 10000,
    });
    await expect(page.locator('#irl-ext-copy')).toBeEnabled();

    // Clipboard permissions are Chromium-only in this suite; granting them at
    // project level crashes mobile device contexts, so it is done per-test and
    // guarded by browserName (see TEST_BEST_PRACTICES / the Playwright note in
    // CLAUDE.md).
    test.skip(browserName !== 'chromium', 'clipboard permissions are chromium-only here');
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.locator('#irl-ext-copy').click();
    await expect(page.locator('#irl-ext-copy')).toHaveText('Copied');

    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain('# Information Request List — Acme Co (filled)');
  });

  test('downloads the markdown as a .md named after the workbook', async ({ page }) => {
    await gotoTool(page);
    await pickWorkbook(page, 'acme-irl.xlsx', buildWorkbook(FILLED_ROWS));
    await expect(page.locator('#irl-ext-md')).toBeVisible({ timeout: 10000 });

    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
    await page.locator('#irl-ext-download').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('acme-irl.md');
  });
});

test.describe('IRL Extractor — the zero-row path', () => {
  test('fails loudly on a workbook with no request rows, naming the sheet it read', async ({
    page,
  }) => {
    await gotoTool(page);

    await pickWorkbook(
      page,
      'q3-budget.xlsx',
      buildWorkbook(
        [
          ['Cost centre', 'Q3 actual', 'Q3 budget'],
          ['Platform', 412000, 400000],
        ],
        'Sheet1'
      )
    );

    const err = page.locator('#irl-ext-error');
    await expect(err).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#irl-ext-md')).toBeHidden();
    // Names the sheet actually read — the reader falls back to the first sheet
    // when the primary one is absent, so this is the only honest signal.
    await expect(page.locator('#irl-ext-error-body')).toContainText('Sheet1');
    await expect(page.locator('#irl-ext-status')).toContainText('0 requests');
    // Actions must go back to inert rather than offering an empty body.
    await expect(page.locator('#irl-ext-actions')).toHaveAttribute('data-enabled', 'false');
  });
});
