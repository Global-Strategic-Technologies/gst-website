/**
 * Integration test for the IRL BL-044 pipeline:
 *   canonical article.md → parseIrlArticle → generateIrlXlsxBuffer → XLSX.read
 *
 * The two unit suites (`tests/unit/irl-parse-article.test.ts`,
 * `tests/unit/irl-generate-xlsx.test.ts`) cover each half in isolation
 * against synthetic fixtures. This test exercises the actual contract a
 * consumer sees end-to-end: take the canonical markdown that ships in
 * the repo, pipe it through the public surface, and assert the produced
 * `.xlsx` reflects the markdown's section structure.
 *
 * Catches drift the unit tests can't see — e.g., the parser accepting
 * a grammar variant that the generator can't render, or the canonical
 * article being edited into a shape the parser rejects.
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

const ARTICLE_PATH = resolve(
  __dirname,
  '../../src/data/library/information-request-list/article.md'
);

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

  it('canonical article has the expected 10 sections (regression guard against unexpected restructuring)', () => {
    // Lower bound rather than exact count — adding a new section is a
    // routine authoring change. But ≥10 ensures none of the existing
    // sections silently disappear. Mirrors the portfolio test fix
    // pattern (TEST_BEST_PRACTICES § 6 — Hardcoded Test Data Assumptions).
    const article = parseIrlArticle(ARTICLE_BODY);
    expect(article.sections.length).toBeGreaterThanOrEqual(10);
  });
});
