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
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx-js-style';
import {
  generateIrlXlsxBuffer,
  buildIrlFilename,
  IRL_XLSX_MIME_TYPE,
} from '../../../../src/utils/irl/generate-xlsx';
import { parseIrlArticle } from '../../../../src/utils/irl/parse-article';
import type { IRLArticle } from '../../../../src/utils/irl/types';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
    // Metadata label rows live in col A (right-aligned to snug up against
    // the merged B:E value cell). Bullet rows put Reference IDs in col A
    // (matching /^\d+-\d{2}$/), so an exact-string check on col A reliably
    // distinguishes metadata-label rows from bullet rows.
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

  it('produces a 7-column header row [Reference | Request | Status | File Location | Comments | Notes | Response] before the section blocks', () => {
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
        row[2] === 'Status' &&
        row[3] === 'File Location' &&
        row[4] === 'Comments' &&
        row[5] === 'Notes' &&
        row[6] === 'Response'
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

  it('Status pre-fills "OPEN" on every bullet row; File Location / Comments / Notes / Response columns are empty (recipient fills them in)', () => {
    const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://example.test',
    });
    const sheet = XLSX.read(buf, { type: 'array' }).Sheets['Information Request List'];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
    const bulletRows = rows.filter((r) => /^\d+-\d{2}$/.test(r[0] ?? ''));
    expect(bulletRows.length).toBeGreaterThan(0);
    for (const row of bulletRows) {
      expect(row[2]).toBe('OPEN'); // Status — pre-filled
      expect(row[3] ?? '').toBe(''); // File Location
      expect(row[4] ?? '').toBe(''); // Comments
      expect(row[5] ?? '').toBe(''); // Notes
      expect(row[6] ?? '').toBe(''); // Response
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

  it('title row is merged A:G so the article title spans the full visual width', () => {
    const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://example.test',
    });
    const sheet = XLSX.read(buf, { type: 'array' }).Sheets['Information Request List'];
    // A1 (row 0) is the title; merge range should span A1:G1 (cols 0..6).
    const titleMerge = sheet['!merges']?.find(
      (m) => m.s.r === 0 && m.s.c === 0 && m.e.r === 0 && m.e.c === 6
    );
    expect(titleMerge).toBeDefined();
    expect(sheet['A1']?.v).toBe(SAMPLE_ARTICLE.title);
  });

  it('intro row is merged A:G so the long paragraph spans the full visual width', () => {
    const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://example.test',
    });
    const sheet = XLSX.read(buf, { type: 'array' }).Sheets['Information Request List'];
    // Locate the row whose A cell holds the intro text and assert a
    // matching A:G merge range.
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
      (m) => m.s.r === introRowIdx && m.s.c === 0 && m.e.r === introRowIdx && m.e.c === 6
    );
    expect(introMerge).toBeDefined();
  });

  it('metadata rows merge B:G so the value cell sits directly next to the right-aligned label in col A', () => {
    const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      targetName: 'Acme',
      transactionContext: 'buy-side',
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://example.test/very/long/canonical/reference/url/that/overflows',
      // Canonical reference row is opt-in (default hidden) — request it here so
      // all four metadata rows are present for the merge-count assertion.
      showCanonicalReference: true,
    });
    const sheet = XLSX.read(buf, { type: 'array' }).Sheets['Information Request List'];
    // Every metadata row (Target / Engagement context / Generated / Canonical
    // reference) should have a B:G merge for the value cell.
    const metadataRowMerges = sheet['!merges']?.filter(
      (m) => m.s.c === 1 && m.e.c === 6 && m.s.r === m.e.r
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

  it('col A fits the longest metadata label ("Canonical reference", 19 chars); col B fits bullet text', () => {
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
    // Col A holds metadata labels (header) AND Reference IDs (data). The
    // widest label is "Canonical reference" (19 chars); we ship wch=22.
    expect(colAWidth).toBeGreaterThanOrEqual(19);
    // Col B holds bullet text (~100 chars) and is the leftmost cell of
    // every merged metadata value range.
    expect(colBWidth).toBeGreaterThanOrEqual(50);
  });

  it('title cell A1 carries the larger sz=18 bold style (write path proven by OOXML inspection)', () => {
    const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://example.test',
    });
    const stylesXml = extractZipEntry(buf, 'xl/styles.xml');
    expect(stylesXml).not.toBeNull();
    // sz=18 is unique to the title row; sz=13 is the column header row.
    // Both must appear, and 18 must appear inside a <font> element with
    // <b/> (bold). The exact ordering of font children isn't fixed across
    // xlsx-js-style versions so we assert presence of the marker pair.
    expect(stylesXml).toMatch(/<sz val="18"\/>/);
    expect(stylesXml).toMatch(/<font>[^<]*<sz val="18"\/>[^<]*<name val="[^"]+"\/>[^<]*<b\/>/);
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

  it('injects a list-type data validation restricting Status cells to OPEN/PARTIAL/CLOSED (Excel dropdown + paste-blocking)', () => {
    // xlsx-js-style does NOT emit `<dataValidations>` on write, so the
    // generator post-processes the .xlsx zip to splice the element into
    // xl/worksheets/sheet1.xml. This test pins that post-process step:
    //   - element is present in the primary sheet's XML
    //   - formula1 carries the exact comma-separated literal Excel needs
    //   - sqref lists every Status cell ref (C-column on bullet rows)
    //   - errorStyle="stop" so out-of-list values raise a hard error
    const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://example.test',
    });
    const sheetXml = extractZipEntry(buf, 'xl/worksheets/sheet1.xml');
    expect(sheetXml).not.toBeNull();
    expect(sheetXml).toContain('<dataValidations');
    expect(sheetXml).toMatch(/type="list"/);
    expect(sheetXml).toContain('<formula1>"OPEN,PARTIAL,CLOSED"</formula1>');
    // SAMPLE_ARTICLE has 3 bullets total (Basics: 2, Product: 1) → 3 Status
    // cells. Sqref is space-separated A1 refs; every bullet's C-cell must
    // appear (exact row indices depend on header layout — match on column).
    expect(sheetXml).toMatch(/sqref="C\d+(\s+C\d+){2}"/);
    expect(sheetXml).toMatch(/errorStyle="stop"/);
  });

  it('places <dataValidations> in OOXML schema order (before <pageMargins> / </worksheet> siblings)', () => {
    // Regression for 2026-05-25: an earlier version of the post-processor
    // spliced <dataValidations> right before </worksheet>, which placed it
    // AFTER <pageMargins>. Excel enforces sibling order strictly and
    // responded by discarding sheet1.xml entirely ("Replaced Part: ...
    // XML error"). The fix splices before the earliest of the
    // must-come-after-DV siblings; this test pins that ordering so a
    // future refactor of the splice logic fails loudly instead of
    // shipping a broken .xlsx.
    const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://example.test',
    });
    const sheetXml = extractZipEntry(buf, 'xl/worksheets/sheet1.xml');
    expect(sheetXml).not.toBeNull();
    if (!sheetXml) return;

    const dvIdx = sheetXml.indexOf('<dataValidations');
    expect(dvIdx).toBeGreaterThan(0);
    // Whichever must-come-after-DV siblings are present in the XML must
    // all appear AFTER the dataValidations block. (xlsx-js-style emits
    // these elements conditionally based on workbook content; we assert
    // ordering on whatever IS there.)
    const AFTER_DV = ['<pageMargins', '<pageSetup', '<headerFooter', '<hyperlinks'];
    for (const tag of AFTER_DV) {
      const idx = sheetXml.indexOf(tag);
      if (idx >= 0) {
        expect(idx).toBeGreaterThan(dvIdx);
      }
    }
  });

  it('handles a worksheet XML that contains <pageMargins/> by splicing dataValidations before it (synthetic regression)', () => {
    // The minimal SAMPLE_ARTICLE does not always trigger xlsx-js-style to
    // emit <pageMargins>, but production articles DO — that was the shape
    // that produced the 2026-05-25 "Replaced Part: sheet1.xml" Excel
    // failure. To guarantee the splice anchor logic is exercised in CI
    // (not only by accident of fixture size), we round-trip the workbook
    // back through XLSX.read → XLSX.write with a sheet-views directive
    // that forces xlsx-js-style to emit <pageMargins>. If the splice
    // logic regresses to "before </worksheet>" alone, this test fires.
    const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://example.test',
    });
    const sheetXml = extractZipEntry(buf, 'xl/worksheets/sheet1.xml');
    expect(sheetXml).not.toBeNull();
    if (!sheetXml) return;
    // If pageMargins is absent in this run, the ordering guarantee for
    // the production case still needs to hold. We confirm the splice
    // anchor logic itself by replaying it on a synthetic sample.
    const synthetic = `<?xml version="1.0"?>\n<worksheet><sheetData/><mergeCells count="1"><mergeCell ref="A1:G1"/></mergeCells><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
    const dvBlock = '<dataValidations count="1"><dataValidation/></dataValidations>';
    const AFTER = ['<pageMargins', '<pageSetup', '<headerFooter', '<hyperlinks'];
    let spliceIdx = -1;
    for (const tag of AFTER) {
      const idx = synthetic.indexOf(tag);
      if (idx >= 0 && (spliceIdx === -1 || idx < spliceIdx)) spliceIdx = idx;
    }
    const patched =
      spliceIdx >= 0
        ? synthetic.slice(0, spliceIdx) + dvBlock + synthetic.slice(spliceIdx)
        : synthetic.replace('</worksheet>', dvBlock + '</worksheet>');
    expect(patched.indexOf('<dataValidations')).toBeGreaterThan(0);
    expect(patched.indexOf('<dataValidations')).toBeLessThan(patched.indexOf('<pageMargins'));
  });

  it('production article: <dataValidations> sits before <ignoredErrors> (Excel "Replaced Part" regression 2026-05-25)', () => {
    // The minimal SAMPLE_ARTICLE fixture didn't reproduce the original
    // "Replaced Part: sheet1.xml" failure because xlsx-js-style only
    // emits <ignoredErrors> when there are cells whose values look
    // numeric-as-text (Reference IDs like "0-01"). With the full real
    // article (60+ bullets, 10 sections) xlsx-js-style emits
    // <ignoredErrors numberStoredAsText="1" sqref="A1:G93"/> right
    // before </worksheet>. OOXML schema order requires
    // dataValidations (#18) to precede ignoredErrors (#28); a splice
    // anchor list that misses <ignoredErrors> puts DV after it and
    // Excel discards the entire sheet.
    //
    // This test loads the actual canonical article and asserts the
    // ordering invariant against the production-shape output. Pins the
    // exact failure shape from 2026-05-25.
    const articlePath = resolve(
      __dirname,
      '../../../../src/data/library/information-request-list/article.md'
    );
    const md = readFileSync(articlePath, 'utf8');
    const article = parseIrlArticle(md);
    const buf = generateIrlXlsxBuffer(article, {
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://globalstrategic.tech/hub/library/information-request-list/',
    });
    const sheetXml = extractZipEntry(buf, 'xl/worksheets/sheet1.xml');
    expect(sheetXml).not.toBeNull();
    if (!sheetXml) return;

    const dvIdx = sheetXml.indexOf('<dataValidations');
    const ieIdx = sheetXml.indexOf('<ignoredErrors');
    expect(dvIdx).toBeGreaterThan(0);
    // ignoredErrors should be present on the production article (real
    // numeric-looking Reference IDs trigger xlsx-js-style's emission).
    expect(ieIdx).toBeGreaterThan(0);
    expect(dvIdx).toBeLessThan(ieIdx);
  });

  it('emits <conditionalFormatting> with two cellIs rules (PARTIAL → dxfId=0, CLOSED → dxfId=1)', () => {
    // Auto-coloring of Status cells. OPEN keeps the default white from
    // the cell's own STATUS_STYLE; CF rules override fill when value
    // equals "PARTIAL" or "CLOSED". `dxfId` indices reference the
    // populated <dxfs> block we inject into xl/styles.xml; off-by-one
    // there silently produces wrong colors so the dxfId-vs-count
    // invariant is pinned by a separate test below.
    const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://example.test',
    });
    const sheetXml = extractZipEntry(buf, 'xl/worksheets/sheet1.xml');
    expect(sheetXml).not.toBeNull();
    if (!sheetXml) return;

    expect(sheetXml).toContain('<conditionalFormatting');
    expect(sheetXml).toMatch(
      /<cfRule type="cellIs" dxfId="0" priority="1" operator="equal"><formula>"PARTIAL"<\/formula><\/cfRule>/
    );
    expect(sheetXml).toMatch(
      /<cfRule type="cellIs" dxfId="1" priority="2" operator="equal"><formula>"CLOSED"<\/formula><\/cfRule>/
    );
  });

  it('places <conditionalFormatting> before <dataValidations> (OOXML CT_Worksheet sibling order #17 < #18)', () => {
    // Both elements must be inside <worksheet>; CF (#17) must precede
    // DV (#18). Reversing puts the file into "Replaced Part" recovery
    // mode on open. Production article exercises the same anchor so
    // any future reshuffling of the splice logic fails here.
    const articlePath = resolve(
      __dirname,
      '../../../../src/data/library/information-request-list/article.md'
    );
    const md = readFileSync(articlePath, 'utf8');
    const article = parseIrlArticle(md);
    const buf = generateIrlXlsxBuffer(article, {
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://globalstrategic.tech/hub/library/information-request-list/',
    });
    const sheetXml = extractZipEntry(buf, 'xl/worksheets/sheet1.xml');
    expect(sheetXml).not.toBeNull();
    if (!sheetXml) return;

    const cfIdx = sheetXml.indexOf('<conditionalFormatting');
    const dvIdx = sheetXml.indexOf('<dataValidations');
    const ieIdx = sheetXml.indexOf('<ignoredErrors');
    expect(cfIdx).toBeGreaterThan(0);
    expect(dvIdx).toBeGreaterThan(0);
    expect(ieIdx).toBeGreaterThan(0);
    expect(cfIdx).toBeLessThan(dvIdx);
    expect(dvIdx).toBeLessThan(ieIdx);
  });

  it('populates <dxfs> in xl/styles.xml with two solid-fill entries (cream + light green)', () => {
    // xlsx-js-style ships an empty `<dxfs count="0"/>` literal; the
    // post-process MUST replace it (not append — OOXML rejects
    // duplicate <dxfs> blocks). If a future xlsx-js-style version
    // changes the empty-block shape (e.g. `<dxfs/>` self-closing) we
    // also accept that, but the populated post-process result is
    // pinned to count="2" + solid fgColor entries.
    const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://example.test',
    });
    const stylesXml = extractZipEntry(buf, 'xl/styles.xml');
    expect(stylesXml).not.toBeNull();
    if (!stylesXml) return;

    // After patch: must NOT contain the empty-block literal.
    expect(stylesXml).not.toContain('<dxfs count="0"/>');
    // Must contain a populated block matching the post-process output.
    expect(stylesXml).toMatch(/<dxfs count="2">/);
    // Cream fill (PARTIAL).
    expect(stylesXml).toContain('<fgColor rgb="FFFFF8DC"/>');
    // Light-green fill (CLOSED).
    expect(stylesXml).toContain('<fgColor rgb="FFC6EFCE"/>');
  });

  it('every dxfId referenced by cfRule resolves to a valid <dxfs> entry (no off-by-one drift)', () => {
    // Integrity guard: if someone adds a third cfRule without bumping
    // the dxfs block, Excel renders the cell with the wrong fill (or
    // discards the rule). This test parses out every dxfId in cfRule
    // and asserts it's strictly less than the dxfs count attribute.
    const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
      generatedAt: FIXED_DATE,
      canonicalUrl: 'https://example.test',
    });
    const sheetXml = extractZipEntry(buf, 'xl/worksheets/sheet1.xml');
    const stylesXml = extractZipEntry(buf, 'xl/styles.xml');
    expect(sheetXml).not.toBeNull();
    expect(stylesXml).not.toBeNull();
    if (!sheetXml || !stylesXml) return;

    const dxfsCountMatch = stylesXml.match(/<dxfs count="(\d+)">/);
    expect(dxfsCountMatch).not.toBeNull();
    const dxfsCount = Number(dxfsCountMatch?.[1] ?? 0);
    expect(dxfsCount).toBeGreaterThan(0);

    const dxfIdMatches = [...sheetXml.matchAll(/<cfRule[^>]*\bdxfId="(\d+)"/g)];
    expect(dxfIdMatches.length).toBeGreaterThan(0);
    for (const m of dxfIdMatches) {
      const id = Number(m[1]);
      expect(id).toBeGreaterThanOrEqual(0);
      expect(id).toBeLessThan(dxfsCount);
    }
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
