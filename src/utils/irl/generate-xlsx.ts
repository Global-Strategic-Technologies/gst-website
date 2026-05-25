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
  // 4-column layout: [Reference | Request | Location | Response].
  // Header metadata rows put their label in col A and value in col B so the
  // operator can scan the top of the sheet without scrolling. Section header
  // rows and bullet rows respect the same column semantics.
  const rows: (string | number)[][] = [];

  rows.push([article.title, '', '', '']);
  if (meta.targetName) rows.push(['Target', meta.targetName, '', '']);
  if (meta.transactionContext) {
    rows.push(['Engagement context', TRANSACTION_CONTEXT_LABEL[meta.transactionContext], '', '']);
  }
  rows.push(['Generated', isoDate(meta.generatedAt), '', '']);
  rows.push(['Canonical reference', meta.canonicalUrl, '', '']);
  rows.push(['', '', '', '']);

  rows.push([article.intro, '', '', '']);
  rows.push(['', '', '', '']);

  rows.push(['Reference', 'Request', 'Location', 'Response']);

  for (const section of article.sections) {
    rows.push(['', `${section.number} — ${section.title.toUpperCase()}`, '', '']);
    if (section.intro) rows.push(['', section.intro, '', '']);

    let bulletIndex = 0;
    for (const bullet of section.bullets) {
      bulletIndex += 1;
      rows.push([buildReferenceId(section.number, bulletIndex), bullet.text, '', '']);
    }
    rows.push(['', '', '', '']);
  }

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 10 }, // Reference (e.g., "0-01")
    { wch: 80 }, // Request (the bullet text)
    { wch: 25 }, // Location (filename / VDR path the recipient supplies)
    { wch: 40 }, // Response (free-text answer)
  ];
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
    ['  A  Reference  — short ID per request (e.g., "0-01"). Quote it back'],
    ['                 in conversation or in your VDR.'],
    ['  B  Request    — the structured information GST is asking for.'],
    ['  C  Location   — OPTIONAL. The filename, VDR path, or sharepoint'],
    ['                 link where the corresponding artifact lives.'],
    ['  D  Response   — your free-text answer.'],
    [''],
    ['1. Fill answers in column D alongside each request in column B.'],
    ['2. If you are attaching a file or pointing to a VDR folder, put the'],
    ['   reference in column C (Location). Both columns may be used together.'],
    ['3. Type "n/a" or "not yet tracked" rather than leaving a cell blank —'],
    ['   the presence of an answer is signal, including "we do not track this."'],
    ['4. Section header rows (e.g., "00 — BASICS") delimit the ten request'],
    ['   areas. Per-section context lives in the canonical article (link in'],
    ['   the header of the main sheet).'],
    [''],
    [recipientHandback],
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [{ wch: 80 }];
  return sheet;
}
