/**
 * Unit tests for `fill_information_request_list_xlsx` (BL-140).
 *
 * Three layers, mirroring the tool's own responsibility split:
 *
 *   1. Schema: the D-cell sourcing grammar's accept/reject table (ADR-0021),
 *      the D-requires-E / E-requires-D pairing, caps, and control-character
 *      rejection — all enforced pre-handler by Zod.
 *   2. Handler: ref-set validation (duplicate/unknown with actionable
 *      hints), zero-section config, D-segment dedup, payload shape and
 *      counters, envelope contract with the base64 `textOmit` asymmetry,
 *      content-level idempotency.
 *   3. Bounds: the caps-saturated envelope measurement pinned beside the
 *      `tool-response-budget` entry's note.
 *
 * The frozen-path conformance proof (extractor round-trip, fillRatio
 * simulation, provenance matching) lives in `fill-irl-conformance.test.ts`.
 */

import * as XLSX from 'xlsx-js-style';

import {
  FillIrlXlsxInputSchema,
  IRL_FILE_LOCATION_PATTERN,
  handleFillIrlXlsxTool,
  type FillIrlXlsxInput,
} from '../../../src/tools/fill-information-request-list-xlsx';
import {
  measureEnvelope,
  parseToolResult,
  type CallToolResultPayload,
} from '../../helpers/tool-envelope';

const VALID_FILL = {
  ref: '0-01',
  fileLocation: 'VDR/00/entity-chart.pdf, page 1',
  comments: 'Delaware C-corp, single operating entity.',
};

function validInput(overrides: Partial<FillIrlXlsxInput> = {}): FillIrlXlsxInput {
  return { fills: [VALID_FILL], ...overrides } as FillIrlXlsxInput;
}

interface FillPayload {
  filename: string;
  base64: string;
  mimeType: string;
  byteLength: number;
  sectionCount: number;
  bulletCount: number;
  filledRowCount: number;
  blankRowCount: number;
  filledRefs: string[];
  canonicalUrl: string;
}

function decodeWorkbook(base64: string): XLSX.WorkBook {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return XLSX.read(bytes, { type: 'array' });
}

// ─── D-cell grammar (ADR-0021 accept/reject table) ───────────────────────────

describe('IRL_FILE_LOCATION_PATTERN — the D-cell sourcing grammar', () => {
  const ACCEPTS = [
    'TechDebtRegistryAndRoadmap.pdf, page 4, paragraph 2',
    '[User stated this Jan 4 2026 2pm in session chat]',
    '[inferred from FileA.pdf + FileB.xlsx]',
    'VDR/06/soc2-2025.pdf, section 3.2',
    // The UAT-07 manual convention parses as a valid bracketed segment —
    // the grammar is a superset of it (BL-140 AC).
    '[pre-populated, not recipient-confirmed]',
    // Multi-segment extend case: reference then bracketed inference.
    '10-K FY2025, Item 1A; [inferred from 10-K FY2025 + earnings call 2026-01-15]',
    // En-dash and hyphen stay legal (only em-dash anchors extractExcerpt).
    'board-minutes–2026.pdf, item 3',
  ];

  const REJECTS: Array<[value: string, why: string]> = [
    ['TechDebt.pdf — page 4', 'em-dash collapses citation excerpt extraction'],
    ['SOC 2 report (2025), page 3', 'parens break the (Source: …) rendering'],
    ['[User stated (in chat) yesterday]', 'parens inside a bracketed segment'],
    ['report.pdf; ', 'trailing separator leaves an empty segment'],
    ['see [note] in file.pdf', 'a segment is bracketed in full or not at all'],
    ['[[double bracket]]', 'nested brackets'],
    ['a; b;c', "';' inside a segment (separator is '; ' between segments)"],
    ['line one\nline two', 'control characters detach (Source: …) from its bullet'],
    ['', 'empty'],
  ];

  for (const value of ACCEPTS) {
    it(`accepts: ${value}`, () => {
      expect(IRL_FILE_LOCATION_PATTERN.test(value)).toBe(true);
    });
  }

  for (const [value, why] of REJECTS) {
    it(`rejects (${why}): ${JSON.stringify(value)}`, () => {
      expect(IRL_FILE_LOCATION_PATTERN.test(value)).toBe(false);
    });
  }
});

// ─── Schema-level enforcement ────────────────────────────────────────────────

describe('FillIrlXlsxInputSchema', () => {
  it('accepts a minimal valid input', () => {
    expect(FillIrlXlsxInputSchema.safeParse({ fills: [VALID_FILL] }).success).toBe(true);
  });

  it('trims fileLocation and comments before validating (schema-level, pre-handler)', () => {
    const parsed = FillIrlXlsxInputSchema.parse({
      fills: [{ ...VALID_FILL, fileLocation: '  A.pdf, page 1  ', comments: '  Answer.  ' }],
    });
    expect(parsed.fills[0].fileLocation).toBe('A.pdf, page 1');
    expect(parsed.fills[0].comments).toBe('Answer.');
  });

  it('rejects a fill with fileLocation but no comments (the fill never writes D without E)', () => {
    const result = FillIrlXlsxInputSchema.safeParse({
      fills: [{ ref: '0-01', fileLocation: 'A.pdf' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a fill with comments but no fileLocation (every answered row carries a well-shaped D)', () => {
    const result = FillIrlXlsxInputSchema.safeParse({
      fills: [{ ref: '0-01', comments: 'An answer with no source.' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects the NN-II exclusion-key shape as a ref', () => {
    const result = FillIrlXlsxInputSchema.safeParse({
      fills: [{ ...VALID_FILL, ref: '00-01' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects control characters in comments (in-cell newlines detach the rendered suffix)', () => {
    const result = FillIrlXlsxInputSchema.safeParse({
      fills: [{ ...VALID_FILL, comments: 'line one\nline two' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty fills array and enforces the 200-entry cap', () => {
    expect(FillIrlXlsxInputSchema.safeParse({ fills: [] }).success).toBe(false);
    const oversized = Array.from({ length: 201 }, (_, i) => ({
      ...VALID_FILL,
      ref: `${i % 10}-${String((i % 60) + 1).padStart(2, '0')}`,
    }));
    expect(FillIrlXlsxInputSchema.safeParse({ fills: oversized }).success).toBe(false);
  });

  it('enforces the per-cell length caps (fileLocation 300, comments 2000)', () => {
    expect(
      FillIrlXlsxInputSchema.safeParse({
        fills: [{ ...VALID_FILL, fileLocation: 'a'.repeat(301) }],
      }).success
    ).toBe(false);
    expect(
      FillIrlXlsxInputSchema.safeParse({
        fills: [{ ...VALID_FILL, comments: 'a'.repeat(2001) }],
      }).success
    ).toBe(false);
  });
});

// ─── Handler behavior ────────────────────────────────────────────────────────

describe('handleFillIrlXlsxTool', () => {
  it('returns the payload shape with fill counters and sorted filledRefs', async () => {
    const result = (await handleFillIrlXlsxTool(
      validInput({
        targetName: 'Acme Corp',
        fills: [{ ref: '1-01', fileLocation: 'B.pdf, page 2', comments: 'Answer B.' }, VALID_FILL],
      })
    )) as CallToolResultPayload;
    const payload = parseToolResult<FillPayload>(result, { textOmit: ['base64'] });

    expect(payload.filename).toMatch(/^GST-IRL-Acme-Corp-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(payload.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    expect(payload.filledRowCount).toBe(2);
    expect(payload.filledRefs).toEqual(['0-01', '1-01']);
    expect(payload.blankRowCount).toBe(payload.bulletCount - 2);
    expect(payload.byteLength).toBeGreaterThan(0);
    expect(payload.base64.length).toBeGreaterThan(0);
  });

  it('writes the fills into D/E of the addressed rows and leaves others blank', async () => {
    const result = (await handleFillIrlXlsxTool(validInput())) as CallToolResultPayload;
    const payload = parseToolResult<FillPayload>(result, { textOmit: ['base64'] });
    const wb = decodeWorkbook(payload.base64);
    const sheet = wb.Sheets['Information Request List'];

    const rowEntry = Object.entries(sheet).find(
      ([k, cell]) => /^A\d+$/.test(k) && (cell as XLSX.CellObject).v === '0-01'
    );
    expect(rowEntry).toBeDefined();
    const row = Number(rowEntry![0].slice(1));
    expect(sheet[`D${row}`]?.v).toBe(VALID_FILL.fileLocation);
    expect(sheet[`E${row}`]?.v).toBe(VALID_FILL.comments);
    expect(sheet[`C${row}`]?.v).toBe('OPEN');

    const otherEntry = Object.entries(sheet).find(
      ([k, cell]) => /^A\d+$/.test(k) && (cell as XLSX.CellObject).v === '0-02'
    );
    expect(otherEntry).toBeDefined();
    const otherRow = Number(otherEntry![0].slice(1));
    expect(sheet[`D${otherRow}`]).toBeUndefined();
    expect(sheet[`E${otherRow}`]).toBeUndefined();
  });

  it('the summary stops at the artifact: review, then run ingestion yourself', async () => {
    const result = (await handleFillIrlXlsxTool(validInput())) as CallToolResultPayload;
    const caption = result.content[0].text!;
    expect(caption).toContain('blank rows are the remaining ask');
    expect(caption).toContain('gst_irl_ingestion yourself');
    expect(caption).toContain('never invokes the sweep');
  });

  it('fails duplicate refs with an actionable merge hint (explicit error, not merge)', async () => {
    const result = (await handleFillIrlXlsxTool(
      validInput({
        fills: [VALID_FILL, { ...VALID_FILL, comments: 'A different answer.' }],
      })
    )) as CallToolResultPayload;
    expect(result.isError).toBe(true);
    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured.error).toBe('invalid-input');
    expect(structured.duplicateRefs).toEqual(['0-01']);
    expect(result.content[0].text).toContain("join them in a single fileLocation with '; '");
  });

  it("fails unknown refs with the '0-03'-vs-'00-03' hint", async () => {
    const result = (await handleFillIrlXlsxTool(
      validInput({ fills: [{ ...VALID_FILL, ref: '0-99' }] })
    )) as CallToolResultPayload;
    expect(result.isError).toBe(true);
    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured.error).toBe('invalid-input');
    expect(structured.unknownRefs).toEqual(['0-99']);
    expect(result.content[0].text).toContain("NOT the 'NN-II' exclusion key '00-03'");
    expect(result.content[0].text).toContain('skip-if');
  });

  it('fails a ref removed by the scoping configuration (skip-if / sections)', async () => {
    // includeSections ['01'] removes section 00 — so 0-01 is not in this workbook.
    const result = (await handleFillIrlXlsxTool(
      validInput({ includeSections: ['01'] })
    )) as CallToolResultPayload;
    expect(result.isError).toBe(true);
    expect((result.structuredContent as Record<string, unknown>).unknownRefs).toEqual(['0-01']);
  });

  it('fails a zero-section configuration as invalid-input (toolFail, not throw)', async () => {
    const result = (await handleFillIrlXlsxTool(
      validInput({ includeSections: ['77'] })
    )) as CallToolResultPayload;
    expect(result.isError).toBe(true);
    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured.error).toBe('invalid-input');
    expect(result.content[0].text).toContain('No sections matched');
  });

  it('dedups exact-duplicate D segments, first-seen order, and never dedups comments', async () => {
    const result = (await handleFillIrlXlsxTool(
      validInput({
        fills: [
          {
            ref: '0-01',
            fileLocation: 'A.pdf, page 1; B.pdf; A.pdf, page 1',
            comments: 'Answer. Answer.',
          },
        ],
      })
    )) as CallToolResultPayload;
    const payload = parseToolResult<FillPayload>(result, { textOmit: ['base64'] });
    const wb = decodeWorkbook(payload.base64);
    const sheet = wb.Sheets['Information Request List'];
    const rowEntry = Object.entries(sheet).find(
      ([k, cell]) => /^A\d+$/.test(k) && (cell as XLSX.CellObject).v === '0-01'
    );
    const row = Number(rowEntry![0].slice(1));
    expect(sheet[`D${row}`]?.v).toBe('A.pdf, page 1; B.pdf');
    expect(sheet[`E${row}`]?.v).toBe('Answer. Answer.');
  });

  it('is content-level idempotent: two identical calls differ only in the Generated row', async () => {
    const input = validInput({ targetName: 'Acme Corp' });
    const a = parseToolResult<FillPayload>(
      (await handleFillIrlXlsxTool(input)) as CallToolResultPayload,
      { textOmit: ['base64'] }
    );
    const b = parseToolResult<FillPayload>(
      (await handleFillIrlXlsxTool(input)) as CallToolResultPayload,
      { textOmit: ['base64'] }
    );
    const cells = (base64: string): string => {
      const sheet = decodeWorkbook(base64).Sheets['Information Request List'];
      return Object.entries(sheet)
        .filter(([k]) => /^[A-Z]+\d+$/.test(k))
        .map(([k, cell]) => `${k}=${String((cell as XLSX.CellObject).v)}`)
        .filter((s) => !/^B\d+=\d{4}-\d{2}-\d{2}$/.test(s)) // the Generated date value
        .join('\n');
    };
    expect(cells(a.base64)).toBe(cells(b.base64));
  });

  it('caps-saturated envelope: 200 max-length fills stays measurable and bounded', async () => {
    // The measurement pinned beside BUDGETS['fill_information_request_list_xlsx']:
    // cell text DEFLATEs inside the workbook, so the envelope grows far slower
    // than the raw 200 × (300 + 2000) ≈ 460 KB of cell text would suggest.
    // Repetitive filler compresses unrealistically well, so build distinct-ish
    // prose per row for an honest ceiling.
    const article = await import('../../../src/content/irl-source-loader');
    const { parseIrlArticle } = await import('../../../../src/utils/irl/parse-article');
    const { enumerateWorkbookRefs } = await import('../../../../src/utils/irl/generate-xlsx');
    const refs = enumerateWorkbookRefs(parseIrlArticle(article.loadIrlSourceBody()));

    const filler = (i: number, len: number): string =>
      `Row ${i} evidence prose. `
        .repeat(Math.ceil(len / 20))
        .slice(0, len)
        .trimEnd();
    // Grammar caps a single segment at 200 chars — keep the filename part
    // well under it while still near the 300-char cell cap via two segments.
    const fills = refs.map((ref, i) => ({
      ref,
      fileLocation: `VDR/${String(i % 10).padStart(2, '0')}/${filler(i, 130).replace(/[^A-Za-z0-9]/g, '')}.pdf, page ${i + 1}; [inferred from row-${i} filing history + call notes]`,
      comments: filler(i, 2000),
    }));
    const result = (await handleFillIrlXlsxTool(validInput({ fills }))) as CallToolResultPayload;
    expect(result.isError).not.toBe(true);
    const { envelopeBytes } = measureEnvelope(result);
    // Measured 2026-08-23: 25,043-byte envelope at full canonical-list
    // saturation (every row × max-length cells; the fixture prose is
    // semi-repetitive, so real-world text will land somewhat higher).
    // Generous ceiling so content growth doesn't flake the pin; the point is
    // the ORDER OF MAGNITUDE — far under the 143,027-char BL-109
    // client-ceiling observation even fully saturated.
    expect(envelopeBytes).toBeLessThan(140_000);
    expect(envelopeBytes).toBeGreaterThan(15_000);
  });
});
