/**
 * Shared by hub-tools-irl-extractor.test.ts (the English contract) and
 * irl-extractor-locale.test.ts: a spec cannot import from another spec without
 * re-registering its tests.
 */
import type { Page } from '@playwright/test';
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
export async function gotoTool(page: Page, url: string = PAGE_URL): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#irl-ext-drop', { timeout: 10000 });
  await page.waitForSelector('#irl-ext-diag[data-empty="true"]', { timeout: 10000 });
}

/**
 * A minimal IRL workbook, built in-process rather than committed as a binary
 * fixture. The column layout is the generator's contract:
 *   A Reference | B Request | C Status | D File Location | E Comments | F Notes | G Response
 */
export function buildWorkbook(
  rows: (string | number)[][],
  sheetName = 'Information Request List'
): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName);
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export const FILLED_ROWS: (string | number)[][] = [
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

/**
 * The same requests with every answer stripped: an unfilled template. It still
 * has request rows, so it converts — into a body of `<NO RESPONSE>` lines — and
 * that is what raises the advisory. Declared once; three tests need it.
 */
export const BLANK_ROWS: (string | number)[][] = FILLED_ROWS.map((row) =>
  /^\d{1,2}-\d{2}$/.test(String(row[0] ?? '')) ? [row[0], row[1], 'OPEN', '', '', '', ''] : row
);

/** Attach a workbook to the (visually hidden but present) file input. */
export async function pickWorkbook(page: Page, name: string, buffer: Buffer): Promise<void> {
  await page.setInputFiles('#irl-ext-file', {
    name,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
  });
}
