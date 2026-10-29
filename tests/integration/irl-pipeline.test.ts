/**
 * Integration test for the IRL BL-044 pipeline:
 *   generator source .md → parseIrlArticle → generateIrlXlsxBuffer → XLSX.read
 *
 * The two unit suites (`tests/unit/irl-parse-article.test.ts`,
 * `tests/unit/irl-generate-xlsx.test.ts`) cover each half in isolation
 * against synthetic fixtures. This test exercises the actual contract a
 * consumer sees end-to-end: take the IRL generator source that ships in
 * the repo, pipe it through the public surface, and assert the produced
 * `.xlsx` reflects the markdown's section structure.
 *
 * Uses the decoupled generator source (`src/data/irl/…`), NOT the library
 * article (`src/data/library/information-request-list/article.md`) — the
 * generators render from the former; the latter is free-form library prose.
 *
 * Catches drift the unit tests can't see — e.g., the parser accepting
 * a grammar variant that the generator can't render, or the generator
 * source being edited into a shape the parser rejects.
 *
 * Per TEST_STRATEGY § 3.2 (integration tests for component flows) — the
 * pipeline IS the user-facing promise; pinning it here means a future
 * change to either half that breaks the contract fails CI loudly.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as XLSX from 'xlsx-js-style';

import { parseIrlArticle } from '../../src/utils/irl/parse-article';
import { generateIrlXlsxBuffer } from '../../src/utils/irl/generate-xlsx';
import { customizeIrlArticle } from '../../src/utils/irl/customize-article';
import {
  extractIrlMarkdownFromRows,
  PRIMARY_SHEET_NAME,
} from '../../src/utils/irl/extract-markdown.mjs';
import {
  localizeIrlArticle,
  localizedXlsxLabels,
} from '../../src/scripts/information-request-list-generator/logic';
import ES_DATA from '../../src/i18n/es/information-request-list-generator-data.json';
import PT_DATA from '../../src/i18n/pt-BR/information-request-list-generator-data.json';

const ARTICLE_PATH = resolve(__dirname, '../../src/data/irl/information-request-list.md');

const ARTICLE_BODY = readFileSync(ARTICLE_PATH, 'utf-8');

const METADATA = {
  targetName: 'Integration Test Target',
  transactionContext: 'buy-side' as const,
  generatedAt: new Date('2026-05-27T12:00:00.000Z'),
  canonicalUrl: 'https://globalstrategic.tech/hub/library/information-request-list',
};

describe('IRL pipeline — canonical article.md → AST → .xlsx', () => {
  it('parses the canonical article without throwing', () => {
    expect(() => parseIrlArticle(ARTICLE_BODY)).not.toThrow();
  });

  it("produces an AST whose section count matches the canonical article's H2 count", () => {
    const article = parseIrlArticle(ARTICLE_BODY);
    // Source-of-truth count: every `## ` line at column 0 in the markdown.
    const h2Count = ARTICLE_BODY.split(/\r?\n/).filter((line) => /^## /.test(line)).length;
    expect(article.sections).toHaveLength(h2Count);
  });

  it('produces an AST with the canonical H1 title', () => {
    const article = parseIrlArticle(ARTICLE_BODY);
    expect(article.title).toBe('Information Request List');
  });

  it('produces an AST where every section has at least one bullet (parser invariant)', () => {
    const article = parseIrlArticle(ARTICLE_BODY);
    for (const section of article.sections) {
      expect(section.bullets.length).toBeGreaterThan(0);
    }
  });

  it('generates a valid .xlsx buffer that round-trips through XLSX.read', () => {
    const article = parseIrlArticle(ARTICLE_BODY);
    const buf = generateIrlXlsxBuffer(article, METADATA);
    expect(buf).toBeInstanceOf(Uint8Array);

    const wb = XLSX.read(buf, { type: 'array' });
    expect(wb.SheetNames).toEqual(['Information Request List', 'Instructions']);
  });

  it('produced workbook contains every section header from the canonical article in uppercased form', () => {
    const article = parseIrlArticle(ARTICLE_BODY);
    const buf = generateIrlXlsxBuffer(article, METADATA);
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets['Information Request List'];

    const cellValues = Object.entries(sheet)
      .filter(([k]) => /^[A-Z]+\d+$/.test(k))
      .map(([, cell]) => (cell as XLSX.CellObject).v);

    // Every section's "NN — TITLE" should appear uppercased in the sheet.
    for (const section of article.sections) {
      const expected = `${section.number} — ${section.title.toUpperCase()}`;
      expect(cellValues, `missing section header: ${expected}`).toContain(expected);
    }
  });

  it('produced workbook contains a Status cell for every bullet across all sections', () => {
    const article = parseIrlArticle(ARTICLE_BODY);
    const buf = generateIrlXlsxBuffer(article, METADATA);
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets['Information Request List'];

    // Status column is C; pre-filled 'OPEN' on every bullet row.
    const openStatusCells = Object.entries(sheet).filter(
      ([k, cell]) => /^C\d+$/.test(k) && (cell as XLSX.CellObject).v === 'OPEN'
    );
    const totalBullets = article.sections.reduce((sum, s) => sum + s.bullets.length, 0);
    expect(openStatusCells).toHaveLength(totalBullets);
  });

  it('customized pipeline: filter + custom request renders only selected sections with the custom row', () => {
    const article = parseIrlArticle(ARTICLE_BODY);
    const first = article.sections[0];
    const second = article.sections[1];
    const built = customizeIrlArticle(article, {
      includeSections: [first.number, second.number],
      customRequests: [{ section: first.number, text: 'Bespoke engagement-specific ask.' }],
    });

    const buf = generateIrlXlsxBuffer(built, METADATA);
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets['Information Request List'];
    const cellValues = Object.entries(sheet)
      .filter(([k]) => /^[A-Z]+\d+$/.test(k))
      .map(([, cell]) => (cell as XLSX.CellObject).v);

    // Only the two selected section headers are present; a third is not.
    expect(cellValues).toContain(`${first.number} — ${first.title.toUpperCase()}`);
    expect(cellValues).toContain(`${second.number} — ${second.title.toUpperCase()}`);
    const third = article.sections[2];
    expect(cellValues).not.toContain(`${third.number} — ${third.title.toUpperCase()}`);

    // The custom request appears as a bullet in the sheet.
    expect(cellValues).toContain('Bespoke engagement-specific ask.');

    // Status cells == (selected sections' original bullets) + 1 custom.
    const selectedBullets = first.bullets.length + second.bullets.length + 1;
    const openStatusCells = Object.entries(sheet).filter(
      ([k, cell]) => /^C\d+$/.test(k) && (cell as XLSX.CellObject).v === 'OPEN'
    );
    expect(openStatusCells).toHaveLength(selectedBullets);
  });

  it('directive pipeline: a supplied context auto-drops the tagged question with a Reference-ID gap', () => {
    // The source tags exactly one bullet today — 00's "Engagement context"
    // question (ordinal 2), skip-if for all three real contexts. Verifies the
    // BL-044.5 engine end-to-end on the real source: bullet absent, its
    // Reference ID absent (gap), neighbors' refs unchanged, count down one.
    const article = parseIrlArticle(ARTICLE_BODY);
    const totalBullets = article.sections.reduce((sum, s) => sum + s.bullets.length, 0);
    const built = customizeIrlArticle(article, { context: 'buy-side' });

    const buf = generateIrlXlsxBuffer(built, METADATA);
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets['Information Request List'];
    const cellValues = Object.entries(sheet)
      .filter(([k]) => /^[A-Z]+\d+$/.test(k))
      .map(([, cell]) => (cell as XLSX.CellObject).v);

    expect(cellValues.join('\n')).not.toContain('Engagement context: sell-side preparation');
    expect(cellValues).toContain('0-01');
    expect(cellValues).not.toContain('0-02'); // the gap
    expect(cellValues).toContain('0-03');

    const openStatusCells = Object.entries(sheet).filter(
      ([k, cell]) => /^C\d+$/.test(k) && (cell as XLSX.CellObject).v === 'OPEN'
    );
    expect(openStatusCells).toHaveLength(totalBullets - 1);
  });

  it('combined pipeline: directive + manual exclusion + custom request compose correctly', () => {
    const article = parseIrlArticle(ARTICLE_BODY);
    const totalBullets = article.sections.reduce((sum, s) => sum + s.bullets.length, 0);
    const built = customizeIrlArticle(article, {
      context: 'value-creation', // drops 00 ordinal 2 (directive)
      excludeRequests: ['02-03'], // drops Architecture question 3 (manual)
      customRequests: [{ section: '02', text: 'Bespoke architecture ask.' }],
    });

    const buf = generateIrlXlsxBuffer(built, METADATA);
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets['Information Request List'];
    const cellValues = Object.entries(sheet)
      .filter(([k]) => /^[A-Z]+\d+$/.test(k))
      .map(([, cell]) => (cell as XLSX.CellObject).v);

    // Both gaps present…
    expect(cellValues).not.toContain('0-02');
    expect(cellValues).not.toContain('2-03');
    // …the custom appended with the section's next canonical ordinal…
    expect(cellValues).toContain('Bespoke architecture ask.');
    const section02Count = article.sections.find((s) => s.number === '02')!.bullets.length;
    expect(cellValues).toContain(`2-${String(section02Count + 1).padStart(2, '0')}`);
    // …and the total reflects −2 canonical +1 custom.
    const openStatusCells = Object.entries(sheet).filter(
      ([k, cell]) => /^C\d+$/.test(k) && (cell as XLSX.CellObject).v === 'OPEN'
    );
    expect(openStatusCells).toHaveLength(totalBullets - 2 + 1);
  });

  it('canonical article has the expected 10 sections (regression guard against unexpected restructuring)', () => {
    // Lower bound rather than exact count — adding a new section is a
    // routine authoring change. But ≥10 ensures none of the existing
    // sections silently disappear. Mirrors the portfolio test fix
    // pattern (TEST_BEST_PRACTICES § 6 — Hardcoded Test Data Assumptions).
    const article = parseIrlArticle(ARTICLE_BODY);
    expect(article.sections.length).toBeGreaterThanOrEqual(10);
  });
});

// ─── BL-153 — a workbook from the es / pt page still extracts ────────────────
//
// The es and pt pages translate what a recipient reads (requests, section
// titles, column headers, the Instructions sheet) and leave every token the
// extractor and the MCP extract record match on English. This builds each
// locale's workbook the way the page does and runs it through the shared
// extractor the IRL Extractor page and `irl:extract` use.
describe.each([
  ['es', ES_DATA as Record<string, string>],
  ['pt-BR', PT_DATA as Record<string, string>],
])('IRL pipeline — the %s workbook round-trips through the extractor', (_locale, catalog) => {
  const lookup = (key: string) => catalog[key];
  const article = customizeIrlArticle(localizeIrlArticle(parseIrlArticle(ARTICLE_BODY), lookup), {
    context: 'buy-side',
  });
  const buf = generateIrlXlsxBuffer(article, METADATA, undefined, localizedXlsxLabels(lookup));
  const wb = XLSX.read(buf, { type: 'array' });
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets[PRIMARY_SHEET_NAME], {
    header: 1,
    defval: '',
  });
  const result = extractIrlMarkdownFromRows(rows);
  const bulletCount = article.sections.reduce((n, s) => n + s.bullets.length, 0);

  it('extracts every request, OPEN, in the translated text', () => {
    expect(result.bulletCount).toBe(bulletCount);
    expect(result.markdown).toContain(`- 0-01 ${catalog['req.00-01']} [OPEN] — <NO RESPONSE>`);
    expect(result.markdown).not.toContain('Company name (legal entity');
    expect(result.sectionsSeen).toHaveLength(article.sections.length);
  });

  it('keeps the target and engagement-context lines the sweep reads', () => {
    expect(result.markdown).toContain('> Target: Integration Test Target');
    expect(result.markdown).toContain('> Engagement context: Buy-side');
  });

  it('writes the translated headers and Instructions tab', () => {
    expect(rows).toContainEqual(
      Array.from({ length: 7 }, (_, i) => catalog[`xlsx.header.${i + 1}`])
    );
    expect(wb.SheetNames).toEqual([PRIMARY_SHEET_NAME, catalog['xlsx.instructionsSheetName']]);
  });
});
