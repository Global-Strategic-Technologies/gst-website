/**
 * Generates the Information Request List (IRL) as a downloadable `.xlsx`
 * workbook from a parsed {@link IRLArticle} AST plus optional engagement
 * metadata. Pure function — no I/O, no side effects — so it runs
 * unchanged in:
 *
 *   - the Cloudflare Workers runtime (the MCP tool wrapper)
 *   - the browser (the `/hub/tools/information-request-list-generator/` page)
 *   - Node (this file's vitest unit tests)
 *
 * Workbook shape (per BL-044 Phase 0 decision):
 *
 *   Sheet 1 "Information Request List" (visible default):
 *     Rows 1-N: engagement header (target, context, date, canonical link),
 *               blank separator, optional intro paragraph, blank separator,
 *               then per-section blocks (uppercased header row + bullet rows
 *               with the request in col A and an empty answer cell in col B).
 *
 *   Sheet 2 "Instructions" (hidden):
 *     Short usage guide for the recipient. Senior-consultant review can
 *     flip the visibility flag (`Hidden: 1` → `Hidden: 0`) without code
 *     restructuring if the live ergonomics say so.
 *
 * Returns the binary workbook buffer (`Uint8Array`). The MCP wrapper
 * encodes to base64; the browser wraps in a `Blob`. Filename composition
 * lives in {@link buildIrlFilename} so both surfaces share one rule.
 */

import * as XLSX from '@e965/xlsx';
import type { IRLArticle } from './types';

export type IRLTransactionContext = 'sell-side' | 'buy-side' | 'value-creation' | 'unknown';

export interface IRLXlsxMetadata {
  readonly targetName?: string;
  readonly transactionContext?: IRLTransactionContext;
  /** Wall-clock timestamp used for both the header cell and the filename date slug. */
  readonly generatedAt: Date;
  /** Canonical URL of the live IRL article (printed in the header so the recipient can navigate back). */
  readonly canonicalUrl: string;
}

export const IRL_XLSX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const PRIMARY_SHEET_NAME = 'Information Request List';
const INSTRUCTIONS_SHEET_NAME = 'Instructions';

const TRANSACTION_CONTEXT_LABEL: Record<IRLTransactionContext, string> = {
  'sell-side': 'Sell-side',
  'buy-side': 'Buy-side',
  'value-creation': 'Value Creation',
  unknown: 'Unspecified',
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Build the download filename from the optional target and the generation
 * date. Mirrors the convention chosen in BL-044 Phase 0:
 *
 *   - with target:     `GST-IRL-<target-slug>-<YYYY-MM-DD>.xlsx`
 *   - without target:  `GST-IRL-<YYYY-MM-DD>.xlsx`
 *
 * The target slug is NFKD-normalized, diacritic-stripped, and
 * kebab-cased. A targetName that slugifies to the empty string (e.g.
 * a pure-emoji input) gracefully degrades to the no-target form.
 */
export function buildIrlFilename(targetName: string | undefined, generatedAt: Date): string {
  const dateSlug = isoDate(generatedAt);
  const targetSlug = targetName ? slugifyTargetName(targetName) : '';
  if (!targetSlug) return `GST-IRL-${dateSlug}.xlsx`;
  return `GST-IRL-${targetSlug}-${dateSlug}.xlsx`;
}

function slugifyTargetName(name: string): string {
  // U+0300..U+036F is the Unicode "Combining Diacritical Marks" block —
  // NFKD decomposes accented characters into base + combining mark, so
  // stripping the marks leaves only ASCII-compatible base letters.
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Render the IRL article + metadata as an `.xlsx` workbook buffer. */
export function generateIrlXlsxBuffer(article: IRLArticle, metadata: IRLXlsxMetadata): Uint8Array {
  const primarySheet = buildPrimarySheet(article, metadata);
  const instructionsSheet = buildInstructionsSheet(metadata);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, primarySheet, PRIMARY_SHEET_NAME);
  XLSX.utils.book_append_sheet(wb, instructionsSheet, INSTRUCTIONS_SHEET_NAME);

  // Hide the Instructions sheet so the recipient lands on the request list
  // by default. Toggle to `0` (visible) if senior-consultant review prefers
  // it surfaced — single-flag change.
  wb.Workbook = {
    Sheets: [
      { name: PRIMARY_SHEET_NAME, Hidden: 0 },
      { name: INSTRUCTIONS_SHEET_NAME, Hidden: 1 },
    ],
  };

  // SheetJS's `type: 'array'` returns a Uint8Array in modern releases but
  // older API surfaces returned a plain number array; normalize so callers
  // (MCP wrapper + browser Blob constructor) get a consistent shape.
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return out instanceof Uint8Array ? out : new Uint8Array(out as ArrayLike<number>);
}

/**
 * Compose the per-bullet Reference identifier.
 *
 * Section numbers in the canonical article are zero-padded to two digits
 * (`"00"` through `"09"`). The Reference column uses the section's leading
 * digit dropped — so Basics (section `"00"`) → `0-01`, Product (`"01"`)
 * → `1-01`, Governance (`"09"`) → `9-01`. Bullet index is one-based and
 * zero-padded to two digits. The pattern collapses cleanly back to the
 * section structure when a recipient quotes a Reference back ("we'll
 * cover 3-05 in tomorrow's call").
 */
function buildReferenceId(sectionNumber: string, bulletIndex: number): string {
  const sectionDigit = sectionNumber.replace(/^0+/, '') || '0';
  const bulletSlug = String(bulletIndex).padStart(2, '0');
  return `${sectionDigit}-${bulletSlug}`;
}

function buildPrimarySheet(article: IRLArticle, meta: IRLXlsxMetadata): XLSX.WorkSheet {
  // 5-column layout: [Reference | Request | File Location | Response | Notes].
  //
  // Col A is deliberately NARROW — it only holds short Reference IDs in the
  // data section. The header section (title / metadata / intro) does not
  // depend on col A's width: long header text lives in col B (labels) +
  // merged C:E (values), or spans A:E as a single visual cell via !merges.
  // This keeps the data table compact while letting header content
  // breathe.
  const rows: (string | number)[][] = [];
  const merges: XLSX.Range[] = [];
  const sectionHeaderRowIndices: number[] = [];
  const NUM_COLS = 5;
  const LAST_COL = NUM_COLS - 1;

  // Row 0: article title — merge A:E so the title spans the visual width.
  rows.push([article.title]);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: LAST_COL } });

  let rowIdx = 1;

  // Metadata rows: col A empty, col B = label, col C:E merged = value.
  // This keeps col A narrow while ensuring long labels ("Engagement
  // context", "Canonical reference") and long values (URLs) both render
  // fully without truncation.
  if (meta.targetName) {
    rows.push(['', 'Target', meta.targetName]);
    merges.push({ s: { r: rowIdx, c: 2 }, e: { r: rowIdx, c: LAST_COL } });
    rowIdx += 1;
  }
  if (meta.transactionContext) {
    rows.push(['', 'Engagement context', TRANSACTION_CONTEXT_LABEL[meta.transactionContext]]);
    merges.push({ s: { r: rowIdx, c: 2 }, e: { r: rowIdx, c: LAST_COL } });
    rowIdx += 1;
  }
  rows.push(['', 'Generated', isoDate(meta.generatedAt)]);
  merges.push({ s: { r: rowIdx, c: 2 }, e: { r: rowIdx, c: LAST_COL } });
  rowIdx += 1;
  rows.push(['', 'Canonical reference', meta.canonicalUrl]);
  merges.push({ s: { r: rowIdx, c: 2 }, e: { r: rowIdx, c: LAST_COL } });
  rowIdx += 1;
  rows.push([]);
  rowIdx += 1;

  // Intro paragraph: merged A:E so the long sentence has the full width.
  const introRowIdx = rowIdx;
  rows.push([article.intro]);
  merges.push({ s: { r: introRowIdx, c: 0 }, e: { r: introRowIdx, c: LAST_COL } });
  rowIdx += 1;
  rows.push([]);
  rowIdx += 1;

  // Column header row — 5 cols, bold + larger font applied after sheet creation.
  const headerRowIdx = rowIdx;
  rows.push(['Reference', 'Request', 'File Location', 'Response', 'Notes']);
  rowIdx += 1;

  for (const section of article.sections) {
    sectionHeaderRowIndices.push(rowIdx);
    rows.push(['', `${section.number} — ${section.title.toUpperCase()}`]);
    rowIdx += 1;

    if (section.intro) {
      rows.push(['', section.intro]);
      rowIdx += 1;
    }

    let bulletIndex = 0;
    for (const bullet of section.bullets) {
      bulletIndex += 1;
      rows.push([buildReferenceId(section.number, bulletIndex), bullet.text]);
      rowIdx += 1;
    }
    rows.push([]);
    rowIdx += 1;
  }

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 10 }, // A — Reference (data section only; narrow per UX feedback)
    { wch: 70 }, // B — Request (bullet text) + metadata labels in header section
    { wch: 25 }, // C — File Location (recipient's filename / VDR path)
    { wch: 35 }, // D — Response (free-text answer)
    { wch: 30 }, // E — Notes (recipient's free-text annotation)
  ];
  sheet['!merges'] = merges;

  // Bold + larger font on the column header row, bold on the section
  // header text. SheetJS writes the cell.s style block into the XLSX;
  // Excel / LibreOffice / Sheets all honor it. Round-trip read in
  // Vitest may not preserve style metadata, so the test surface keeps to
  // text-position / merge-range assertions rather than style verification.
  const HEADER_STYLE = { font: { bold: true, sz: 13 } };
  for (let col = 0; col < NUM_COLS; col += 1) {
    const ref = XLSX.utils.encode_cell({ r: headerRowIdx, c: col });
    if (sheet[ref]) sheet[ref].s = HEADER_STYLE;
  }

  const SECTION_STYLE = { font: { bold: true } };
  for (const sectionRow of sectionHeaderRowIndices) {
    const ref = XLSX.utils.encode_cell({ r: sectionRow, c: 1 });
    if (sheet[ref]) sheet[ref].s = SECTION_STYLE;
  }

  return sheet;
}

function buildInstructionsSheet(meta: IRLXlsxMetadata): XLSX.WorkSheet {
  const recipientHandback = meta.targetName
    ? 'Return the filled file to your Global Strategic Technologies engagement lead.'
    : 'Return the filled file to your Global Strategic Technologies point of contact.';

  const rows: string[][] = [
    ['Instructions'],
    [''],
    ['This spreadsheet is the structured response surface for the GST'],
    ['Information Request List. Each section mirrors a Virtual Data Room'],
    ['(VDR) folder; together they cover the inputs GST needs to size and'],
    ['execute the engagement.'],
    [''],
    ['Column layout on the main sheet:'],
    ['  A  Reference      — short ID per request (e.g., "0-01"). Quote it'],
    ['                     back in conversation or in your VDR.'],
    ['  B  Request        — the structured information GST is asking for.'],
    ['  C  File Location  — OPTIONAL. The filename, VDR path, or share-link'],
    ['                     where the corresponding artifact lives.'],
    ['  D  Response       — your free-text answer.'],
    ['  E  Notes          — OPTIONAL. Any caveats, follow-ups, or context'],
    ['                     the recipient wants to flag alongside an answer.'],
    [''],
    ['1. Fill answers in column D alongside each request in column B.'],
    ['2. If you are attaching a file or pointing to a VDR folder, put the'],
    ['   reference in column C (File Location). C and D may be used together.'],
    ['3. Use column E (Notes) for anything that does not fit in Response —'],
    ['   "scheduled for Q3 refresh", "confidential — discuss in call", etc.'],
    ['4. Type "n/a" or "not yet tracked" rather than leaving a cell blank —'],
    ['   the presence of an answer is signal, including "we do not track this."'],
    ['5. Section header rows (e.g., "00 — BASICS") delimit the ten request'],
    ['   areas. Per-section context lives in the canonical article (link in'],
    ['   the header of the main sheet).'],
    [''],
    [recipientHandback],
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [{ wch: 80 }];
  return sheet;
}
