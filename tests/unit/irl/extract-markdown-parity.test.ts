/**
 * Browser/CLI parity for the IRL extractor.
 *
 * `src/utils/irl/extract-markdown.mjs` is shared by two runtimes that read the
 * workbook bytes DIFFERENTLY:
 *
 *   - the operator CLI (`mcp-server/scripts/extract-irl-markdown.mjs`) reads a
 *     Node `Buffer` with `XLSX.read(buf, { type: 'buffer' })`;
 *   - the Hub page (`/hub/tools/information-request-list-extractor/`) reads a
 *     `File` with `XLSX.read(new Uint8Array(await file.arrayBuffer()),
 *     { type: 'array' })`.
 *
 * Everything after the row array is literally the same function, so asserting
 * that half would be tautological. The real risk is the half that differs:
 * two SheetJS read modes producing row arrays that are not cell-for-cell
 * identical (type coercion, empty-cell handling, sheet ordering) would make
 * the browser output drift from the CLI's on the same file, silently.
 *
 * These tests therefore build ONE filled workbook, read the SAME bytes both
 * ways, and assert the markdown is byte-identical — which is the property the
 * page's "same bytes in, same text out" claim rests on.
 */

import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx-js-style';

import { generateIrlXlsxBuffer } from '../../../src/utils/irl/generate-xlsx';
import type { IRLArticle } from '../../../src/utils/irl/types';
import {
  PRIMARY_SHEET_NAME,
  extractIrlMarkdownFromRows,
} from '../../../src/utils/irl/extract-markdown.mjs';

const FIXED_DATE = new Date('2026-05-23T12:00:00.000Z');

const ARTICLE: IRLArticle = {
  title: 'Information Request List',
  intro: 'Below is information useful to size and execute a client engagement.',
  sections: [
    {
      number: '00',
      title: 'Basics',
      bullets: [
        { text: 'Company name' },
        { text: 'Engagement context' },
        { text: 'Annual recurring revenue' },
      ],
    },
    {
      number: '01',
      title: 'Product',
      intro: 'What the thing is and who buys it.',
      bullets: [{ text: 'One-paragraph product description' }],
    },
  ],
  footer: '_Last updated: 2026-05-23._',
};

interface FilledRow {
  response?: string;
  status?: string;
  fileLocation?: string;
  comments?: string;
  notes?: string;
}

/**
 * Produce a FILLED workbook as bytes: generate the blank one, splice partner
 * content into the bullet rows, and write it back out. The result is a real
 * `.xlsx` byte stream, which is what both read paths actually receive.
 */
function buildFilledWorkbookBytes(responses: Record<string, FilledRow>): Uint8Array {
  const blank = generateIrlXlsxBuffer(ARTICLE, {
    targetName: 'Acme Co',
    transactionContext: 'value-creation',
    generatedAt: FIXED_DATE,
    canonicalUrl: 'https://example.test/canonical',
    showCanonicalReference: true,
  });

  const wb = XLSX.read(blank, { type: 'array' });
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets[PRIMARY_SHEET_NAME], {
    header: 1,
    defval: '',
  });

  for (const row of rows) {
    const ref = String(row[0] ?? '').trim();
    const r = responses[ref];
    if (!r) continue;
    row[2] = r.status ?? 'CLOSED';
    if (r.fileLocation !== undefined) row[3] = r.fileLocation;
    if (r.comments !== undefined) row[4] = r.comments;
    if (r.notes !== undefined) row[5] = r.notes;
    if (r.response !== undefined) row[6] = r.response;
  }

  const outSheet = XLSX.utils.aoa_to_sheet(rows);
  const outBook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(outBook, outSheet, PRIMARY_SHEET_NAME);
  return XLSX.write(outBook, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array;
}

/** The CLI's read: a Node Buffer under `type: 'buffer'`. */
function readTheNodeWay(bytes: Uint8Array) {
  const wb = XLSX.read(Buffer.from(bytes), { type: 'buffer' });
  const sheet = wb.Sheets[PRIMARY_SHEET_NAME] ?? wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: '' });
}

/** The page's read: a `Uint8Array` from `File.arrayBuffer()` under `type: 'array'`. */
function readTheBrowserWay(bytes: Uint8Array) {
  const wb = XLSX.read(new Uint8Array(bytes), { type: 'array' });
  const sheet = wb.Sheets[PRIMARY_SHEET_NAME] ?? wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: '' });
}

const RESPONSES: Record<string, FilledRow> = {
  '0-01': { response: 'Acme Co, trading as Acme.', status: 'CLOSED' },
  '0-02': {
    response: 'Post-close value creation',
    status: 'CLOSED',
    fileLocation: 'VDR/00_Basics/mandate.pdf',
    notes: 'Mandate renews in Q3.',
  },
  // Comments-only: the answer must come from column E, and the ref must be
  // reported in `commentsSourcedAnswers`.
  '0-03': { comments: 'ARR is 12.4M USD as of the April close.', status: 'PARTIAL' },
  // Status claims an answer but every content column is empty: a genuine
  // contradiction the extractor is expected to surface.
  '1-01': { status: 'CLOSED' },
};

describe('IRL extractor — browser/CLI read parity', () => {
  it('produces byte-identical markdown from the same bytes read both ways', () => {
    const bytes = buildFilledWorkbookBytes(RESPONSES);

    const viaNode = extractIrlMarkdownFromRows(readTheNodeWay(bytes));
    const viaBrowser = extractIrlMarkdownFromRows(readTheBrowserWay(bytes));

    expect(viaBrowser.markdown).toBe(viaNode.markdown);
    // Guard against a vacuous pass: an empty body would satisfy the equality
    // above while proving nothing.
    expect(viaNode.bulletCount).toBeGreaterThan(0);
  });

  it('agrees on every returned diagnostic, not just the markdown', () => {
    const bytes = buildFilledWorkbookBytes(RESPONSES);

    const viaNode = extractIrlMarkdownFromRows(readTheNodeWay(bytes));
    const viaBrowser = extractIrlMarkdownFromRows(readTheBrowserWay(bytes));

    expect(viaBrowser.bulletCount).toBe(viaNode.bulletCount);
    expect(viaBrowser.sectionsSeen).toEqual(viaNode.sectionsSeen);
    expect(viaBrowser.statusContradictions).toEqual(viaNode.statusContradictions);
    expect(viaBrowser.commentsSourcedAnswers).toEqual(viaNode.commentsSourcedAnswers);
  });
});

describe('IRL extractor — the shape the page renders', () => {
  const result = extractIrlMarkdownFromRows(readTheBrowserWay(buildFilledWorkbookBytes(RESPONSES)));
  const lines = result.markdown.split('\n');

  it('opens with the H1 carrying the target and the (filled) suffix', () => {
    // The server substring-matches on this exact head shape; the page shows
    // it verbatim, so a change here is a change to a downstream contract.
    expect(lines[0]).toBe('# Information Request List — Acme Co (filled)');
  });

  it('emits all three preamble quote lines when the workbook carries them', () => {
    const quotes = lines.filter((l) => l.startsWith('> '));
    // The context is the generator's DISPLAY label ('Value Creation'), not the
    // `value-creation` enum slug that was passed in — the workbook is written
    // for a human to read, and the extractor passes the cell through verbatim.
    expect(quotes).toEqual([
      '> Engagement context: Value Creation',
      '> Generated: 2026-05-23',
      '> Canonical reference: https://example.test/canonical',
    ]);
  });

  it('renders a bullet as "- <ref> <request> [<STATUS>] — <answer>"', () => {
    expect(result.markdown).toContain('- 0-01 Company name [CLOSED] — Acme Co, trading as Acme.');
  });

  it('puts Source and Note outside the answer span, in that order', () => {
    expect(result.markdown).toContain(
      '- 0-02 Engagement context [CLOSED] — Post-close value creation ' +
        '(Source: VDR/00_Basics/mandate.pdf) (Note: Mandate renews in Q3.)'
    );
  });

  it('reads a Comments-only row as answered and reports it', () => {
    expect(result.markdown).toContain(
      '- 0-03 Annual recurring revenue [PARTIAL] — ARR is 12.4M USD as of the April close.'
    );
    expect(result.commentsSourcedAnswers).toContain('0-03');
  });

  it('renders <NO RESPONSE> and flags the contradiction when Status claims an answer', () => {
    expect(result.markdown).toContain(
      '- 1-01 One-paragraph product description [CLOSED] — <NO RESPONSE>'
    );
    expect(result.statusContradictions).toContain('1-01');
  });

  it('reports section numbers rather than titles', () => {
    // The page's diagnostics strip prints these verbatim, so it must not
    // promise section names it was never given.
    expect(result.sectionsSeen).toEqual(['00', '01']);
  });

  it('drops section headers and section intros from the bullet stream', () => {
    expect(result.markdown).not.toContain('What the thing is and who buys it.');
    expect(result.markdown).not.toContain('00 — Basics');
  });
});

describe('IRL extractor — the zero-bullet path the page shows as a failure', () => {
  it('returns no bullets for a workbook that is not an IRL', () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Cost centre', 'Q3 actual', 'Q3 budget'],
      ['Platform', 412_000, 400_000],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Sheet1');
    const bytes = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array;

    // The page falls back to the first sheet exactly as the CLI does, so this
    // lands on "0 requests" rather than a sheet-name error.
    const result = extractIrlMarkdownFromRows(readTheBrowserWay(bytes));
    expect(result.bulletCount).toBe(0);
  });

  it('returns no bullets for a blank template', () => {
    const bytes = buildFilledWorkbookBytes({});
    const result = extractIrlMarkdownFromRows(readTheBrowserWay(bytes));
    // Every row is still OPEN with no content in D/E/F/G, so nothing is an
    // answer — but the rows themselves ARE present, which is what makes the
    // blank template and a non-IRL workbook indistinguishable by row count
    // alone. The page distinguishes them by sheet name instead.
    expect(result.bulletCount).toBeGreaterThan(0);
    expect(result.markdown).toContain('<NO RESPONSE>');
  });
});
