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
 *               then per-section blocks (uppercased header row + bullet rows).
 *               Bullet rows are 7 columns wide:
 *                 A Reference | B Request | C Status | D File Location |
 *                 E Comments | F Notes | G Response
 *               Status pre-fills "OPEN" on every row; recipient promotes
 *               to PARTIAL / CLOSED and recolors the cell manually per
 *               the Instructions sheet.
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

import * as XLSX from 'xlsx-js-style';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
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
  const { sheet: primarySheet, statusCellRefs } = buildPrimarySheet(article, metadata);
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
  const written = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const raw =
    written instanceof Uint8Array ? written : new Uint8Array(written as ArrayLike<number>);

  // xlsx-js-style does not emit Excel `<dataValidations>` on write, so the
  // Status column would otherwise accept any string. Post-process the .xlsx
  // (which is a zip) to inject a list-type validation restricting the
  // Status cells to OPEN / PARTIAL / CLOSED. Dropdown appears on click;
  // pasting an out-of-list value raises a hard error per `errorStyle="stop"`.
  return injectStatusDataValidation(raw, statusCellRefs);
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

interface PrimarySheetResult {
  readonly sheet: XLSX.WorkSheet;
  /** A1-style references of every Status cell (col C of each bullet row). Used to scope data validation. */
  readonly statusCellRefs: readonly string[];
}

function buildPrimarySheet(article: IRLArticle, meta: IRLXlsxMetadata): PrimarySheetResult {
  // 7-column layout:
  //   A Reference | B Request | C Status | D File Location | E Comments | F Notes | G Response
  //
  // Status column pre-fills "OPEN" (white fill) on every bullet row. The
  // allowable values are OPEN, PARTIAL, CLOSED with documented fill colors
  // (white / cream / light-green) so a recipient can visually track
  // request-by-request progress. xlsx-js-style cannot emit Excel
  // conditional formatting at write time, so the recipient sets the value
  // and the cell color manually; the Instructions sheet documents the
  // exact hex codes.
  //
  // Col A is wide enough to hold metadata labels ("Canonical reference" =
  // 19 chars) in the header section AND Reference IDs ("0-01") in the
  // data section. Labels are right-aligned in col A so they visually snug
  // against the value in merged B:G — no gap between label and value
  // (the prior narrow-col-A layout left col B mostly empty between them).
  const rows: (string | number)[][] = [];
  const merges: XLSX.Range[] = [];
  const sectionHeaderRowIndices: number[] = [];
  const metadataLabelCells: string[] = [];
  const statusCellRefs: string[] = [];
  const NUM_COLS = 7;
  const LAST_COL = NUM_COLS - 1;

  // Row 0: article title — merge A:E. Bold + large font applied below.
  rows.push([article.title]);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: LAST_COL } });

  let rowIdx = 1;

  // Metadata rows: label in col A (right-aligned), value in merged B:E.
  // Label and value sit visually adjacent — one char of gutter between
  // the end of col A and the start of col B.
  const pushMetadataRow = (label: string, value: string) => {
    rows.push([label, value]);
    merges.push({ s: { r: rowIdx, c: 1 }, e: { r: rowIdx, c: LAST_COL } });
    metadataLabelCells.push(XLSX.utils.encode_cell({ r: rowIdx, c: 0 }));
    rowIdx += 1;
  };

  if (meta.targetName) pushMetadataRow('Target', meta.targetName);
  if (meta.transactionContext) {
    pushMetadataRow('Engagement context', TRANSACTION_CONTEXT_LABEL[meta.transactionContext]);
  }
  pushMetadataRow('Generated', isoDate(meta.generatedAt));
  pushMetadataRow('Canonical reference', meta.canonicalUrl);

  rows.push([]);
  rowIdx += 1;

  // Intro paragraph: merged A:E so the long sentence has the full width.
  const introRowIdx = rowIdx;
  rows.push([article.intro]);
  merges.push({ s: { r: introRowIdx, c: 0 }, e: { r: introRowIdx, c: LAST_COL } });
  rowIdx += 1;
  rows.push([]);
  rowIdx += 1;

  // Column header row — 7 cols, bold + larger font applied after sheet creation.
  const headerRowIdx = rowIdx;
  rows.push(['Reference', 'Request', 'Status', 'File Location', 'Comments', 'Notes', 'Response']);
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
      // Pre-fill Status column with "OPEN" so the cell is non-empty (Excel
      // hides the row's status when blank) and the recipient sees the
      // workflow shape immediately.
      rows.push([buildReferenceId(section.number, bulletIndex), bullet.text, 'OPEN']);
      statusCellRefs.push(XLSX.utils.encode_cell({ r: rowIdx, c: 2 }));
      rowIdx += 1;
    }
    rows.push([]);
    rowIdx += 1;
  }

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 22 }, // A — Reference IDs (data) + metadata labels (header, right-aligned)
    { wch: 70 }, // B — Request (bullet text); also leftmost cell of merged metadata values
    { wch: 12 }, // C — Status (OPEN/PARTIAL/CLOSED)
    { wch: 25 }, // D — File Location
    { wch: 30 }, // E — Comments
    { wch: 30 }, // F — Notes
    { wch: 35 }, // G — Response
  ];
  sheet['!merges'] = merges;

  // Title (A1): bold + large font for emphasis.
  if (sheet['A1']) {
    sheet['A1'].s = { font: { bold: true, sz: 18 } };
  }

  // Metadata labels right-aligned so they sit flush against the merged
  // value cell — eliminates the visual gap users flagged in the prior
  // narrow-col-A layout.
  for (const ref of metadataLabelCells) {
    if (sheet[ref]) {
      sheet[ref].s = { alignment: { horizontal: 'right', vertical: 'center' } };
    }
  }

  // Column header row: bold + larger font.
  const HEADER_STYLE = { font: { bold: true, sz: 13 } };
  for (let col = 0; col < NUM_COLS; col += 1) {
    const ref = XLSX.utils.encode_cell({ r: headerRowIdx, c: col });
    if (sheet[ref]) sheet[ref].s = HEADER_STYLE;
  }

  // Section header text: bold.
  const SECTION_STYLE = { font: { bold: true } };
  for (const sectionRow of sectionHeaderRowIndices) {
    const ref = XLSX.utils.encode_cell({ r: sectionRow, c: 1 });
    if (sheet[ref]) sheet[ref].s = SECTION_STYLE;
  }

  // Status cells: pre-filled "OPEN" with white background + thin border so
  // each status cell renders as a tile. Recipient changes value + cell
  // color when promoting to PARTIAL (cream #FFF8DC) or CLOSED (light-green
  // #C6EFCE) — the Instructions sheet documents the exact hex codes.
  const STATUS_STYLE = {
    fill: { fgColor: { rgb: 'FFFFFF' }, patternType: 'solid' as const },
    alignment: { horizontal: 'center' as const, vertical: 'center' as const },
    font: { bold: true },
    border: {
      top: { style: 'thin' as const, color: { rgb: 'CCCCCC' } },
      bottom: { style: 'thin' as const, color: { rgb: 'CCCCCC' } },
      left: { style: 'thin' as const, color: { rgb: 'CCCCCC' } },
      right: { style: 'thin' as const, color: { rgb: 'CCCCCC' } },
    },
  };
  for (const ref of statusCellRefs) {
    if (sheet[ref]) sheet[ref].s = STATUS_STYLE;
  }

  return { sheet, statusCellRefs };
}

/**
 * Inject Excel data validation into the post-XLSX-write buffer so the
 * Status column accepts only OPEN / PARTIAL / CLOSED. xlsx-js-style does
 * not serialize `<dataValidations>` on write, so we unzip the .xlsx
 * (which is just a zip of XML), splice the element into the primary
 * worksheet XML before `</worksheet>`, and re-zip.
 *
 * The `sqref` attribute is a space-separated list of A1-style references.
 * Status cells are non-contiguous in the sheet (interleaved with section
 * headers and blank separator rows) so we list every cell individually
 * rather than try to coalesce ranges.
 *
 * `errorStyle="stop"` blocks paste/free-typed values; the recipient sees
 * a hard error dialog instead of silently writing a bad string.
 */
function injectStatusDataValidation(
  buf: Uint8Array,
  statusCellRefs: readonly string[]
): Uint8Array {
  if (statusCellRefs.length === 0) return buf;

  const unzipped = unzipSync(buf);
  const sheetPath = 'xl/worksheets/sheet1.xml';
  const sheetBytes = unzipped[sheetPath];
  if (!sheetBytes) return buf; // Defensive: structure changed, leave file untouched.

  const sheetXml = strFromU8(sheetBytes);
  const sqref = statusCellRefs.join(' ');
  const validationXml =
    `<dataValidations count="1">` +
    `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" ` +
    `errorStyle="stop" errorTitle="Invalid status" ` +
    `error="Status must be OPEN, PARTIAL, or CLOSED." ` +
    `promptTitle="Status" prompt="OPEN, PARTIAL, or CLOSED" ` +
    `sqref="${sqref}">` +
    `<formula1>"OPEN,PARTIAL,CLOSED"</formula1>` +
    `</dataValidation>` +
    `</dataValidations>`;

  // OOXML strictly enforces sibling order inside `<worksheet>`:
  //   sheetData → mergeCells → … → dataValidations → hyperlinks →
  //   printOptions → pageMargins → pageSetup → headerFooter → … → </worksheet>
  //
  // Splicing right before `</worksheet>` puts dataValidations AFTER
  // pageMargins, which Excel rejects with "Replaced Part: sheet1.xml with
  // XML error" and discards the entire sheet. Instead, find the earliest
  // sibling that must come AFTER dataValidations and splice before it.
  // Fall back to `</worksheet>` only when none of those siblings exist
  // (xlsx-js-style omits pageMargins on minimally-styled sheets).
  // CT_Worksheet sibling order (OOXML 18.3.1.99): dataValidations is
  // position 18; everything from 19 onward must come AFTER it. Notably
  // `<ignoredErrors>` (#28) is the one xlsx-js-style emits on numeric
  // Reference IDs ("0-01" etc.) being stored-as-text — splicing before
  // </worksheet> alone puts DV after ignoredErrors and Excel rejects
  // the sheet ("Replaced Part: sheet1.xml part with XML error" —
  // observed 2026-05-25). The full list below covers every sibling
  // that must come after DV so the splice anchor is stable across
  // xlsx-js-style versions and content shapes.
  const AFTER_DV_TAGS = [
    '<hyperlinks',
    '<printOptions',
    '<pageMargins',
    '<pageSetup',
    '<headerFooter',
    '<rowBreaks',
    '<colBreaks',
    '<customProperties',
    '<cellWatches',
    '<ignoredErrors',
    '<smartTags',
    '<drawing',
    '<legacyDrawing',
    '<legacyDrawingHF',
    '<picture',
    '<oleObjects',
    '<controls',
    '<webPublishItems',
    '<tableParts',
    '<extLst',
  ];
  let spliceIdx = -1;
  for (const tag of AFTER_DV_TAGS) {
    const idx = sheetXml.indexOf(tag);
    if (idx >= 0 && (spliceIdx === -1 || idx < spliceIdx)) spliceIdx = idx;
  }
  if (spliceIdx === -1) {
    spliceIdx = sheetXml.lastIndexOf('</worksheet>');
  }
  if (spliceIdx < 0) return buf; // Malformed sheet XML; bail rather than corrupt.

  const patchedXml = sheetXml.slice(0, spliceIdx) + validationXml + sheetXml.slice(spliceIdx);
  unzipped[sheetPath] = strToU8(patchedXml);

  return zipSync(unzipped, { level: 6 });
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
    ['  A  Reference      short ID per request (e.g., "0-01"). Quote it'],
    ['                   back in conversation or in your VDR.'],
    ['  B  Request        the structured information GST is asking for.'],
    ['  C  Status         OPEN, PARTIAL, or CLOSED. Pre-filled OPEN on'],
    ['                   every row; update as you progress.'],
    ['  D  File Location  OPTIONAL. The filename, VDR path, or share-link'],
    ['                   where the corresponding artifact lives.'],
    ['  E  Comments       OPTIONAL. Caveats, follow-ups, or context worth'],
    ['                   flagging alongside the answer.'],
    ['  F  Notes          OPTIONAL. Free-form scratch space.'],
    ['  G  Response       your free-text answer.'],
    [''],
    ['Status workflow (column C):'],
    ['  OPEN     no response yet. Cell color: white (#FFFFFF).'],
    ['  PARTIAL  answer in progress / awaiting input. Cell color:'],
    ['           cream (#FFF8DC).'],
    ['  CLOSED   answered and complete. Cell color: light green (#C6EFCE).'],
    [''],
    ['Cell colors are not auto-applied — change the cell value AND the fill'],
    ['color together when you advance a row. In Excel: select the cell,'],
    ['Home > Fill Color > More Colors > Custom > enter the hex above.'],
    [''],
    ['1. Set Status (column C) to PARTIAL or CLOSED as you progress.'],
    ['2. Fill answers in column G (Response) alongside each request in B.'],
    ['3. If you are attaching a file or pointing to a VDR folder, put the'],
    ['   reference in column D (File Location). D and G may be used together.'],
    ['4. Use column E (Comments) for anything that does not fit in Response'],
    ['   ("scheduled for Q3 refresh", "confidential, discuss in call").'],
    ['5. Type "n/a" or "not yet tracked" rather than leaving a Response'],
    ['   cell blank. The presence of an answer is signal, including'],
    ['   "we do not track this."'],
    ['6. Section header rows (e.g., "00 — BASICS") delimit the ten request'],
    ['   areas. Per-section context lives in the canonical article (link in'],
    ['   the header of the main sheet).'],
    [''],
    [recipientHandback],
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [{ wch: 80 }];
  return sheet;
}
