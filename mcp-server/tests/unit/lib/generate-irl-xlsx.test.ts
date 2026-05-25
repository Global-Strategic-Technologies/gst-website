/**
 * Tests for the pure XLSX generator + filename slug helper.
 *
 * The generator round-trips through `@e965/xlsx` (read back what we wrote)
 * so the assertions exercise the actual binary output, not just our code.
 */

import { describe, it, expect } from 'vitest';
import * as XLSX from '@e965/xlsx';
import {
  generateIrlXlsxBuffer,
  buildIrlFilename,
  IRL_XLSX_MIME_TYPE,
} from '../../../../src/utils/irl/generate-xlsx';
import type { IRLArticle } from '../../../../src/utils/irl/types';

const SAMPLE_ARTICLE: IRLArticle = {
  title: 'Information Request List',
  intro: 'Below is information useful to size and execute a client engagement.',
  sections: [
    {
      number: '00',
      title: 'Basics',
      bullets: [{ text: 'Company name' }, { text: 'Engagement context' }],
    },
    {
      number: '01',
      title: 'Product',
      bullets: [{ text: 'One-paragraph product description' }],
    },
  ],
  footer: '_Last updated: 2026-05-23._',
};

const FIXED_DATE = new Date('2026-05-23T12:00:00.000Z');

describe('generateIrlXlsxBuffer', () => {
  it('returns a non-empty Uint8Array', () => {
    const out = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://globalstrategic.tech/hub/library/information-request-list/',
    });
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.byteLength).toBeGreaterThan(500);
  });

  it('produces a workbook readable by SheetJS (round-trip integrity)', () => {
    const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://example.test/canonical',
    });
    const wb = XLSX.read(buf, { type: 'array' });
    expect(wb.SheetNames).toContain('Information Request List');
    expect(wb.SheetNames).toContain('Instructions');
  });

  it('main sheet contains the article title, intro, and every section header + bullet', () => {
    const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://example.test/canonical',
    });
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets['Information Request List'];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
    const flat = rows.flat().join('\n');

    expect(flat).toContain('Information Request List');
    expect(flat).toContain('Below is information useful');
    expect(flat).toContain('00 — BASICS');
    expect(flat).toContain('01 — PRODUCT');
    expect(flat).toContain('Company name');
    expect(flat).toContain('Engagement context');
    expect(flat).toContain('One-paragraph product description');
  });

  it('writes optional metadata cells when supplied (target + transactionContext)', () => {
    const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      targetName: 'MedSig Health',
      transactionContext: 'buy-side',
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://example.test',
    });
    const sheet = XLSX.read(buf, { type: 'array' }).Sheets['Information Request List'];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
    const flat = rows.flat().join('\n');
    expect(flat).toContain('MedSig Health');
    expect(flat).toContain('Buy-side');
  });

  it('omits target/context label-rows when not supplied (bullet content unaffected)', () => {
    const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://example.test',
    });
    const sheet = XLSX.read(buf, { type: 'array' }).Sheets['Information Request List'];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
    // A label-row is `[<label>, <value-or-empty>]` where value populated.
    // Bullet rows are `[<question>, '']` so col B is empty.
    const hasTargetLabelRow = rows.some(
      (r) => r[0] === 'Target' && typeof r[1] === 'string' && r[1] !== ''
    );
    const hasContextLabelRow = rows.some(
      (r) => r[0] === 'Engagement context' && typeof r[1] === 'string' && r[1] !== ''
    );
    expect(hasTargetLabelRow).toBe(false);
    expect(hasContextLabelRow).toBe(false);
  });

  it('emits the engagement date in YYYY-MM-DD form', () => {
    const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://example.test',
    });
    const sheet = XLSX.read(buf, { type: 'array' }).Sheets['Information Request List'];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
    expect(rows.flat()).toContain('2026-05-23');
  });

  it('hides the Instructions sheet by default (Hidden flag set)', () => {
    const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://example.test',
    });
    const wb = XLSX.read(buf, { type: 'array' });
    const instructionsMeta = wb.Workbook?.Sheets?.find((s) => s.name === 'Instructions');
    expect(instructionsMeta).toBeDefined();
    expect(instructionsMeta?.Hidden).toBe(1);
  });

  it('Instructions sheet content mentions the n/a discipline', () => {
    const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://example.test',
    });
    const sheet = XLSX.read(buf, { type: 'array' }).Sheets['Instructions'];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
    const flat = rows.flat().join('\n');
    expect(flat).toContain('n/a');
  });

  it('produces a 4-column header row [Reference | Request | Location | Response] before the section blocks', () => {
    const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://example.test',
    });
    const sheet = XLSX.read(buf, { type: 'array' }).Sheets['Information Request List'];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
    const headerRowIndex = rows.findIndex(
      (row) =>
        row[0] === 'Reference' &&
        row[1] === 'Request' &&
        row[2] === 'Location' &&
        row[3] === 'Response'
    );
    expect(headerRowIndex).toBeGreaterThan(0);
  });

  it('emits per-bullet Reference IDs in the form `<sectionDigit>-<NN>` (00 → 0-01, 01 → 1-01)', () => {
    const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://example.test',
    });
    const sheet = XLSX.read(buf, { type: 'array' }).Sheets['Information Request List'];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
    // SAMPLE_ARTICLE has: Basics (00) with 2 bullets, Product (01) with 1 bullet.
    // Expected IDs: 0-01, 0-02, 1-01.
    const refIds = rows.map((r) => r[0]).filter((cell) => /^\d+-\d{2}$/.test(cell ?? ''));
    expect(refIds).toEqual(['0-01', '0-02', '1-01']);
  });

  it('Reference IDs sit alongside their bullet text in the same row', () => {
    const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://example.test',
    });
    const sheet = XLSX.read(buf, { type: 'array' }).Sheets['Information Request List'];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
    const row0_01 = rows.find((r) => r[0] === '0-01');
    expect(row0_01?.[1]).toBe('Company name');
    const row1_01 = rows.find((r) => r[0] === '1-01');
    expect(row1_01?.[1]).toBe('One-paragraph product description');
  });

  it('Location + Response columns are empty for every bullet row (recipient fills them in)', () => {
    const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://example.test',
    });
    const sheet = XLSX.read(buf, { type: 'array' }).Sheets['Information Request List'];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
    const bulletRows = rows.filter((r) => /^\d+-\d{2}$/.test(r[0] ?? ''));
    expect(bulletRows.length).toBeGreaterThan(0);
    for (const row of bulletRows) {
      expect(row[2] ?? '').toBe(''); // Location
      expect(row[3] ?? '').toBe(''); // Response
    }
  });

  it('section header rows have an empty Reference cell (only the named bullets get IDs)', () => {
    const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://example.test',
    });
    const sheet = XLSX.read(buf, { type: 'array' }).Sheets['Information Request List'];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
    const basicsHeader = rows.find((r) => r[1] === '00 — BASICS');
    expect(basicsHeader).toBeDefined();
    expect(basicsHeader?.[0] ?? '').toBe(''); // Reference col empty on section header row
  });

  it('header rows do NOT emit empty-string cells in B/C/D — preserves Excel rightward text overflow', () => {
    // Regression for the visual-truncation bug surfaced 2026-05-25: padding
    // the title / intro / canonical rows with explicit '' values blocks
    // Excel's natural overflow and truncates long text inside narrow col A.
    // The fix is to omit the padding entirely so those cells don't exist in
    // the workbook. Verified by inspecting the raw worksheet cell map.
    const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      targetName: 'Acme',
      transactionContext: 'buy-side',
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://example.test/very/long/canonical/reference/url/that/overflows',
    });
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets['Information Request List'];
    // Locate the title row (row 0). For row 0, cells B1/C1/D1 must NOT
    // exist in the worksheet — if they did, Excel would block overflow.
    expect(sheet['A1']).toBeDefined();
    expect(sheet['B1']).toBeUndefined();
    expect(sheet['C1']).toBeUndefined();
    expect(sheet['D1']).toBeUndefined();
    // Same contract for the intro row: A populated, B/C/D unwritten.
    // Locate it by scanning for the cell whose value starts with the
    // intro's first phrase.
    const introCellKey = Object.keys(sheet).find(
      (k) =>
        k.startsWith('A') &&
        typeof sheet[k] === 'object' &&
        typeof sheet[k].v === 'string' &&
        sheet[k].v.startsWith('Below is information')
    );
    expect(introCellKey).toBeDefined();
    if (introCellKey) {
      const rowNum = introCellKey.slice(1);
      expect(sheet[`B${rowNum}`]).toBeUndefined();
      expect(sheet[`C${rowNum}`]).toBeUndefined();
      expect(sheet[`D${rowNum}`]).toBeUndefined();
    }
  });

  it('column A width is wide enough to display the longest header metadata label without truncation', () => {
    const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://example.test',
    });
    const sheet = XLSX.read(buf, { type: 'array', cellStyles: true }).Sheets[
      'Information Request List'
    ];
    const colA = sheet['!cols']?.[0];
    expect(colA).toBeDefined();
    // "Canonical reference" is 19 chars; col A must be at least that wide
    // (we ship wch=22 with margin). Stable across SheetJS wch/wpx encoding.
    const widthChars = colA?.wch ?? (colA?.wpx ? colA.wpx / 7 : 0);
    expect(widthChars).toBeGreaterThanOrEqual(19);
  });

  it('column widths are preserved on round-trip when cellStyles is requested', () => {
    const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://example.test',
    });
    const wb = XLSX.read(buf, { type: 'array', cellStyles: true });
    const sheet = wb.Sheets['Information Request List'];
    // SheetJS Community Edition stores column widths as `wpx` (pixels) on
    // round-trip rather than the `wch` (character) units we set; assert on
    // either form so the test stays stable across SheetJS versions.
    const firstColWidth = sheet['!cols']?.[0];
    expect(firstColWidth).toBeDefined();
    const widthValue = firstColWidth?.wch ?? firstColWidth?.wpx ?? 0;
    expect(widthValue).toBeGreaterThan(0);
  });

  it('exports the standard .xlsx MIME type constant', () => {
    expect(IRL_XLSX_MIME_TYPE).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  });
});

describe('buildIrlFilename', () => {
  it('emits the no-target form when targetName is undefined', () => {
    expect(buildIrlFilename(undefined, FIXED_DATE)).toBe('GST-IRL-2026-05-23.xlsx');
  });

  it('emits the no-target form when targetName is empty string', () => {
    expect(buildIrlFilename('', FIXED_DATE)).toBe('GST-IRL-2026-05-23.xlsx');
  });

  it('kebab-cases a multi-word target name', () => {
    expect(buildIrlFilename('MedSig Health', FIXED_DATE)).toBe(
      'GST-IRL-MedSig-Health-2026-05-23.xlsx'
    );
  });

  it('strips diacritics via NFKD normalization', () => {
    expect(buildIrlFilename('Café Société', FIXED_DATE)).toBe(
      'GST-IRL-Cafe-Societe-2026-05-23.xlsx'
    );
  });

  it('collapses runs of non-alphanumeric characters into a single hyphen', () => {
    expect(buildIrlFilename('Acme  &  Co., Ltd.', FIXED_DATE)).toBe(
      'GST-IRL-Acme-Co-Ltd-2026-05-23.xlsx'
    );
  });

  it('trims leading and trailing hyphens', () => {
    expect(buildIrlFilename('--Bracketed--', FIXED_DATE)).toBe('GST-IRL-Bracketed-2026-05-23.xlsx');
  });

  it('falls back to the no-target form when slug collapses to empty', () => {
    expect(buildIrlFilename('🚀🎯', FIXED_DATE)).toBe('GST-IRL-2026-05-23.xlsx');
  });

  it('uses the ISO date portion of the provided generation timestamp', () => {
    expect(buildIrlFilename('Acme', new Date('2027-01-15T23:59:59.000Z'))).toBe(
      'GST-IRL-Acme-2027-01-15.xlsx'
    );
  });
});
