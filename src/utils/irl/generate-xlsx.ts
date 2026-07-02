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
 *               Status pre-fills "OPEN" on every row. The recipient
 *               promotes a row by picking PARTIAL or CLOSED from the
 *               in-cell dropdown; the cell auto-recolors via Excel
 *               conditional formatting (PARTIAL → cream, CLOSED →
 *               light green). xlsx-js-style cannot emit CF or data
 *               validation natively, so both ship via a post-process
 *               that splices the necessary OOXML elements into
 *               sheet1.xml and styles.xml.
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
  /**
   * Requesting company name. When set (with or without {@link projectName}),
   * it is prepended to the workbook title cell:
   * `"{companyName} {projectName} {article.title}"`. Title-only — no metadata row.
   */
  readonly companyName?: string;
  /** Engagement / project name. Composed into the title cell alongside {@link companyName}. */
  readonly projectName?: string;
  /** Wall-clock timestamp used for both the header cell and the filename date slug. */
  readonly generatedAt: Date;
  /** Canonical URL of the live IRL article (used by the optional Canonical reference row + MCP structuredContent). */
  readonly canonicalUrl: string;
  /**
   * Show the "Canonical reference" metadata row in the workbook header.
   * Defaults to **false** (hidden) — the row is opt-in per engagement.
   */
  readonly showCanonicalReference?: boolean;
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
  const instructionsSheet = buildInstructionsSheet(metadata, article.sections.length);

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

  // xlsx-js-style does not emit Excel `<dataValidations>` or
  // `<conditionalFormatting>` on write, so we post-process the .xlsx
  // (which is a zip) to splice both into the worksheet XML AND populate
  // the empty `<dxfs/>` block in styles.xml with the cream/green fills
  // the CF rules reference. Result: Status cells get an in-cell dropdown,
  // paste-blocking, AND auto-coloring (PARTIAL → cream, CLOSED → green).
  return patchStatusValidationAndColoring(raw, statusCellRefs);
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
  // Status column pre-fills "OPEN" (white fill) on every bullet row.
  // Allowable values: OPEN, PARTIAL, CLOSED. The in-cell dropdown is
  // wired by the post-process step (data validation); the cell fill
  // auto-updates via Excel conditional formatting (PARTIAL → cream,
  // CLOSED → light green; OPEN keeps the default white from the cell's
  // own style). Both CF rules + DV dropdown are spliced into the .xlsx
  // by `patchStatusValidationAndColoring` below.
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

  // Row 0: title cell, merged full-width (A1:G1). When a requesting company
  // and/or project name is supplied it is prepended to the canonical article
  // title → "{Company} {Project} Information Request List". Each part is
  // trimmed so an untrimmed input (the MCP schema's `min(1)` does not trim)
  // can't leave a double space. Neither supplied → the bare article title.
  const displayTitle = [meta.companyName, meta.projectName, article.title]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
  rows.push([displayTitle]);
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
  // Canonical reference is opt-in (default hidden). The URL still travels in
  // metadata for the MCP tool's structuredContent regardless of this flag.
  if (meta.showCanonicalReference) {
    pushMetadataRow('Canonical reference', meta.canonicalUrl);
  }

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
 * ARGB fills referenced by conditional-format `dxfId` indices. Order is
 * load-bearing: `dxfId="0"` → first entry (PARTIAL), `dxfId="1"` →
 * second (CLOSED). Eight-hex form (`FF` alpha prefix) is required by
 * Excel for opaque solid fills; six-hex renders transparent in some
 * versions. OPEN intentionally has no entry — the default white fill
 * from `STATUS_STYLE` is the OPEN appearance.
 */
const STATUS_DXF_FILLS = [
  { rgb: 'FFFFF8DC', label: 'PARTIAL' }, // cream
  { rgb: 'FFC6EFCE', label: 'CLOSED' }, // light green
] as const;

/**
 * Inject Excel data validation + conditional formatting into the
 * post-XLSX-write buffer:
 *
 *   1. `<conditionalFormatting>` into `xl/worksheets/sheet1.xml` so
 *      Status cell fill auto-updates when value matches PARTIAL or
 *      CLOSED (OPEN keeps the default white from STATUS_STYLE).
 *   2. `<dataValidations>` into the same sheet so cells carry an
 *      in-cell dropdown and paste-block invalid values.
 *   3. Populated `<dxfs>` block into `xl/styles.xml` defining the two
 *      fill differentials the CF rules reference. xlsx-js-style ships
 *      with a hard-coded empty `<dxfs count="0"/>` literal in its
 *      bundle; we string-replace it (NOT append — OOXML rejects
 *      duplicate `<dxfs>` blocks).
 *
 * OOXML sibling order (CT_Worksheet, §18.3.1.99): conditionalFormatting
 * (#17) MUST precede dataValidations (#18). We compute one splice anchor
 * (earliest must-come-after-DV sibling) and emit `CF + DV` together so
 * their relative order is correct by construction.
 *
 * `errorStyle="stop"` blocks paste/free-typed values; the recipient
 * sees a hard error dialog instead of silently writing a bad string.
 *
 * Two regression bugs surfaced during development; both are pinned by
 * tests:
 *   - "Replaced Part: sheet1.xml" when DV landed after `<pageMargins>`
 *   - same error when DV landed after `<ignoredErrors>` (which
 *     xlsx-js-style emits on numeric-as-text Reference IDs like "0-01")
 *
 * Splice anchor scans for the earliest must-come-after sibling so
 * future content shapes / xlsx-js-style version bumps don't reintroduce
 * either regression. CF uses the same anchor (CF must precede DV but
 * both must precede `<hyperlinks>` onwards, so the same anchor works
 * for both).
 */
function patchStatusValidationAndColoring(
  buf: Uint8Array,
  statusCellRefs: readonly string[]
): Uint8Array {
  if (statusCellRefs.length === 0) return buf;

  const unzipped = unzipSync(buf);

  // -- Patch 1: sheet1.xml (CF + DV) -------------------------------------
  const sheetPath = 'xl/worksheets/sheet1.xml';
  const sheetBytes = unzipped[sheetPath];
  if (!sheetBytes) return buf;

  const sheetXml = strFromU8(sheetBytes);
  const sqref = statusCellRefs.join(' ');

  const conditionalFormattingXml =
    `<conditionalFormatting sqref="${sqref}">` +
    STATUS_DXF_FILLS.map(
      (fill, idx) =>
        `<cfRule type="cellIs" dxfId="${idx}" priority="${idx + 1}" operator="equal">` +
        `<formula>"${fill.label}"</formula>` +
        `</cfRule>`
    ).join('') +
    `</conditionalFormatting>`;

  const dataValidationsXml =
    `<dataValidations count="1">` +
    `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" ` +
    `errorStyle="stop" errorTitle="Invalid status" ` +
    `error="Status must be OPEN, PARTIAL, or CLOSED." ` +
    `promptTitle="Status" prompt="OPEN, PARTIAL, or CLOSED" ` +
    `sqref="${sqref}">` +
    `<formula1>"OPEN,PARTIAL,CLOSED"</formula1>` +
    `</dataValidation>` +
    `</dataValidations>`;

  // CT_Worksheet sibling order (OOXML §18.3.1.99): everything from
  // #19 (hyperlinks) onward must come AFTER dataValidations. The list
  // below covers every sibling Excel might reject if it appears before
  // our splice point.
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
  if (spliceIdx === -1) spliceIdx = sheetXml.lastIndexOf('</worksheet>');
  if (spliceIdx < 0) return buf;

  const patchedSheetXml =
    sheetXml.slice(0, spliceIdx) +
    conditionalFormattingXml +
    dataValidationsXml +
    sheetXml.slice(spliceIdx);
  unzipped[sheetPath] = strToU8(patchedSheetXml);

  // -- Patch 2: styles.xml (populate <dxfs>) -----------------------------
  const stylesPath = 'xl/styles.xml';
  const stylesBytes = unzipped[stylesPath];
  if (stylesBytes) {
    const stylesXml = strFromU8(stylesBytes);
    const dxfsBlock =
      `<dxfs count="${STATUS_DXF_FILLS.length}">` +
      STATUS_DXF_FILLS.map(
        (fill) =>
          `<dxf><fill><patternFill patternType="solid">` +
          `<fgColor rgb="${fill.rgb}"/><bgColor rgb="${fill.rgb}"/>` +
          `</patternFill></fill></dxf>`
      ).join('') +
      `</dxfs>`;

    let patchedStylesXml: string;
    if (stylesXml.includes('<dxfs count="0"/>')) {
      patchedStylesXml = stylesXml.replace('<dxfs count="0"/>', dxfsBlock);
    } else if (stylesXml.includes('<dxfs/>')) {
      patchedStylesXml = stylesXml.replace('<dxfs/>', dxfsBlock);
    } else if (!stylesXml.includes('<dxfs')) {
      const closeIdx = stylesXml.lastIndexOf('</styleSheet>');
      if (closeIdx < 0) return buf;
      patchedStylesXml = stylesXml.slice(0, closeIdx) + dxfsBlock + stylesXml.slice(closeIdx);
    } else {
      // A populated `<dxfs count="N">…</dxfs>` already exists from
      // xlsx-js-style. Splicing a second one would be a schema
      // violation; bail rather than corrupt the file. Should be
      // unreachable with current xlsx-js-style bundle.
      return buf;
    }
    unzipped[stylesPath] = strToU8(patchedStylesXml);
  }

  return zipSync(unzipped, { level: 6 });
}

function buildInstructionsSheet(meta: IRLXlsxMetadata, sectionCount: number): XLSX.WorkSheet {
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
    ['  OPEN     no response yet. Cell color: white.'],
    ['  PARTIAL  answer in progress or awaiting input. Cell auto-colors'],
    ['           cream when value is set to PARTIAL.'],
    ['  CLOSED   answered and complete. Cell auto-colors light green'],
    ['           when value is set to CLOSED.'],
    [''],
    ['Click any Status cell to use the in-cell dropdown. Cell color'],
    ['updates automatically as the value changes (no manual recolor).'],
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
    [`6. Section header rows (e.g., "00 — BASICS") delimit the ${sectionCount} request`],
    ['   areas. Per-section context lives in the canonical GST Information'],
    ['   Request List article.'],
    [''],
    [recipientHandback],
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [{ wch: 80 }];
  return sheet;
}
