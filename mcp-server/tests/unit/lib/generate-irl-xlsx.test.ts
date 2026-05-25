/**
 * Tests for the pure XLSX generator + filename slug helper.
 *
 * The generator round-trips through `xlsx-js-style` (read back what we
 * wrote) so the assertions exercise the actual binary output, not just
 * our code.
 */

import { describe, it, expect } from 'vitest';
import { inflateRawSync } from 'node:zlib';
import { Buffer } from 'node:buffer';
import * as XLSX from 'xlsx-js-style';
import {
  generateIrlXlsxBuffer,
  buildIrlFilename,
  IRL_XLSX_MIME_TYPE,
} from '../../../../src/utils/irl/generate-xlsx';
import type { IRLArticle } from '../../../../src/utils/irl/types';

/**
 * Minimal ZIP "local file header" walker — pulls out a single named entry
 * from the .xlsx (which is just a ZIP). Used to verify style XML directly
 * because xlsx-js-style's round-trip READ does not preserve `cell.s.font`
 * metadata even though the underlying file IS written with the styles.
 * The library's write side is correct (verified by inspection); the read
 * side strips style metadata back to a partial shape (`{ patternType:
 * 'none' }` only). Inspecting the file bytes is the only reliable test.
 */
function extractZipEntry(xlsxBuf: Uint8Array, targetName: string): string | null {
  const buf = Buffer.from(xlsxBuf);
  let off = 0;
  while (off < buf.length - 4) {
    if (buf.readUInt32LE(off) === 0x04034b50) {
      const compMethod = buf.readUInt16LE(off + 8);
      const compSize = buf.readUInt32LE(off + 18);
      const nameLen = buf.readUInt16LE(off + 26);
      const extraLen = buf.readUInt16LE(off + 28);
      const name = buf.slice(off + 30, off + 30 + nameLen).toString('utf8');
      const dataStart = off + 30 + nameLen + extraLen;
      if (name === targetName) {
        const data = buf.slice(dataStart, dataStart + compSize);
        return compMethod === 0 ? data.toString('utf8') : inflateRawSync(data).toString('utf8');
      }
      off = dataStart + compSize;
    } else {
      off += 1;
    }
  }
  return null;
}

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
    // Metadata label rows live in col B (col A is empty / reserved for
    // the Reference column). A label row pairs the col-B label with a
    // populated col-C value. Bullet rows have the bullet text in col B
    // and Reference ID in col A, so the col[1]==='Target' check below
    // wouldn't match them.
    const hasTargetLabelRow = rows.some(
      (r) => r[1] === 'Target' && typeof r[2] === 'string' && r[2] !== ''
    );
    const hasContextLabelRow = rows.some(
      (r) => r[1] === 'Engagement context' && typeof r[2] === 'string' && r[2] !== ''
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

  it('produces a 5-column header row [Reference | Request | File Location | Response | Notes] before the section blocks', () => {
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
        row[2] === 'File Location' &&
        row[3] === 'Response' &&
        row[4] === 'Notes'
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

  it('File Location, Response, and Notes columns are empty for every bullet row (recipient fills them in)', () => {
    const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://example.test',
    });
    const sheet = XLSX.read(buf, { type: 'array' }).Sheets['Information Request List'];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
    const bulletRows = rows.filter((r) => /^\d+-\d{2}$/.test(r[0] ?? ''));
    expect(bulletRows.length).toBeGreaterThan(0);
    for (const row of bulletRows) {
      expect(row[2] ?? '').toBe(''); // File Location
      expect(row[3] ?? '').toBe(''); // Response
      expect(row[4] ?? '').toBe(''); // Notes
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

  it('title row is merged A:E so the article title spans the full visual width', () => {
    const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://example.test',
    });
    const sheet = XLSX.read(buf, { type: 'array' }).Sheets['Information Request List'];
    // A1 (row 0) is the title; merge range should span A1:E1.
    const titleMerge = sheet['!merges']?.find(
      (m) => m.s.r === 0 && m.s.c === 0 && m.e.r === 0 && m.e.c === 4
    );
    expect(titleMerge).toBeDefined();
    expect(sheet['A1']?.v).toBe(SAMPLE_ARTICLE.title);
  });

  it('intro row is merged A:E so the long paragraph spans the full visual width', () => {
    const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://example.test',
    });
    const sheet = XLSX.read(buf, { type: 'array' }).Sheets['Information Request List'];
    // Locate the row whose A cell holds the intro text and assert a
    // matching A:E merge range.
    const introCellKey = Object.keys(sheet).find(
      (k) =>
        k.startsWith('A') &&
        typeof sheet[k] === 'object' &&
        typeof sheet[k].v === 'string' &&
        sheet[k].v.startsWith('Below is information')
    );
    expect(introCellKey).toBeDefined();
    const introRowIdx = introCellKey ? Number(introCellKey.slice(1)) - 1 : -1;
    const introMerge = sheet['!merges']?.find(
      (m) => m.s.r === introRowIdx && m.s.c === 0 && m.e.r === introRowIdx && m.e.c === 4
    );
    expect(introMerge).toBeDefined();
  });

  it('metadata rows merge C:E so the value cell has room (URLs, long labels)', () => {
    const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      targetName: 'Acme',
      transactionContext: 'buy-side',
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://example.test/very/long/canonical/reference/url/that/overflows',
    });
    const sheet = XLSX.read(buf, { type: 'array' }).Sheets['Information Request List'];
    // Every metadata row (Target / Engagement context / Generated / Canonical
    // reference) should have a C:E merge for the value cell.
    const metadataRowMerges = sheet['!merges']?.filter(
      (m) => m.s.c === 2 && m.e.c === 4 && m.s.r === m.e.r
    );
    expect(metadataRowMerges?.length).toBeGreaterThanOrEqual(4);
  });

  it('generated .xlsx contains a bold font definition in xl/styles.xml (write path proven by OOXML inspection)', () => {
    // Regression for 2026-05-25: `@e965/xlsx` (SheetJS Community
    // auto-republish) silently dropped `cell.s.font` on write so column
    // headers and section headers rendered as plain text. We swapped to
    // `xlsx-js-style`, which actually serializes the styles into OOXML.
    // We can't verify via round-trip read (xlsx-js-style's READ side
    // strips style metadata), so we unzip the .xlsx and inspect the
    // xl/styles.xml fragment directly. The presence of `<b/>` inside a
    // `<font>` element proves Excel / Sheets / LibreOffice will render
    // the column header row + section header rows in bold.
    const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://example.test',
    });
    const stylesXml = extractZipEntry(buf, 'xl/styles.xml');
    expect(stylesXml).not.toBeNull();
    // The bold marker must live inside a <font> element (could appear
    // anywhere else in the doc by coincidence otherwise).
    expect(stylesXml).toMatch(/<font>[^<]*<[^>]*\/>\s*<[^>]*\/>\s*<b\/>/);
    // At least one font has the larger column-header size (sz=13).
    expect(stylesXml).toMatch(/<sz val="13"\/>/);
  });

  it('col A is narrow (Reference IDs only); col B is wide enough for bullet text', () => {
    const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://example.test',
    });
    const sheet = XLSX.read(buf, { type: 'array', cellStyles: true }).Sheets[
      'Information Request List'
    ];
    const colA = sheet['!cols']?.[0];
    const colB = sheet['!cols']?.[1];
    const colAWidth = colA?.wch ?? (colA?.wpx ? colA.wpx / 7 : 0);
    const colBWidth = colB?.wch ?? (colB?.wpx ? colB.wpx / 7 : 0);
    // Col A: just for "Reference" (9 chars) + IDs like "0-01" (4 chars).
    // Should be narrow — definitely under 20.
    expect(colAWidth).toBeGreaterThan(0);
    expect(colAWidth).toBeLessThan(20);
    // Col B: holds bullet text which can be 100+ chars; widest column.
    expect(colBWidth).toBeGreaterThanOrEqual(50);
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
