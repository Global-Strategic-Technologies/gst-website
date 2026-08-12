/**
 * Round-trip tests for the IRL `.xlsx` → canonical-markdown extractor.
 *
 * The generator (`src/utils/irl/generate-xlsx.ts`) is the single source of
 * truth for the IRL workbook shape; this script is its structural inverse.
 * The round-trip discipline: build a workbook with a known article + filled
 * responses → read the bytes → extract markdown → assert every bullet + the
 * partner's response landed in the canonical body.
 *
 * Coverage targets:
 *   - Bullet rows survive the round-trip with reference / request / status
 *     / response intact.
 *   - Rows with no content in ANY of D/E/F/G emit `— <NO RESPONSE>`. This is
 *     a human-readable marker only — no server code parses it and it does not
 *     become a (J) gap entry (see `src/docs/testing/uat/UAT-07-irl-pipeline.md`);
 *     the fill ratio is what accounts for unanswered rows.
 *   - BL-120: File Location (D), Comments (E) and Notes (F) are read. Comments
 *     joins Response into ONE contiguous answer span; Source/Note render as
 *     suffixes OUTSIDE the answer slot so a bare filename never reads as an
 *     answer. Both operator ref lists (status contradictions, Comments-sourced
 *     answers) are returned from the pure function.
 *   - Metadata header rows (Target, Engagement context, Generated, Canonical
 *     reference) populate the markdown preamble.
 *   - Section header rows + section intros are filtered out (canonical body
 *     is a flat bullet stream — matches the model's reconstruction shape).
 *   - Unknown / empty workbook fails gracefully via the `bulletCount === 0`
 *     CLI guard (here we just assert the function returns 0 bullets).
 *   - The bundled live regulation-load happy-path (the round-trip works
 *     on the REAL canonical article + a synthetic response set), so a
 *     future canonical-article edit can't drift the extractor's
 *     assumptions silently.
 */

import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx-js-style';
import { generateIrlXlsxBuffer } from '../../../../src/utils/irl/generate-xlsx';
import type { IRLArticle } from '../../../../src/utils/irl/types';
import { extractIrlMarkdownFromRows } from '../../../scripts/extract-irl-markdown.mjs';

const FIXED_DATE = new Date('2026-05-23T12:00:00.000Z');

const SAMPLE_ARTICLE: IRLArticle = {
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
      bullets: [{ text: 'One-paragraph product description' }],
    },
    {
      number: '10',
      title: 'Contacts',
      intro: 'Names + roles of the engagement principals.',
      bullets: [{ text: 'Deal team contacts' }],
    },
  ],
  footer: '_Last updated: 2026-05-23._',
};

/**
 * A filled bullet row, expressed in the columns the workbook actually has.
 * `response` stays required so the pre-BL-120 call sites read unchanged; the
 * three content columns BL-120 taught the extractor to read are opt-in.
 */
interface FilledRow {
  /** Column G — Response. */
  response: string;
  /** Column C — Status. Defaults to `CLOSED` when a response is spliced. */
  status?: string;
  /** Column D — File Location. */
  fileLocation?: string;
  /** Column E — Comments. */
  comments?: string;
  /** Column F — Notes. */
  notes?: string;
}

/**
 * Round-trip helper: build the workbook, read it back via SheetJS, and
 * splice partner-supplied content into the bullet rows before extraction.
 * The generator pre-fills `Status: OPEN`; partner responses populate col G
 * and may also flip Status to `CLOSED` or `PARTIAL`. D/E/F are left untouched
 * unless the case supplies them, so the generator's own empty-cell shape is
 * what the extractor sees by default.
 */
function buildFilledWorkbookRows(
  article: IRLArticle,
  responses: Record<string, FilledRow>
): (string | number)[][] {
  const buf = generateIrlXlsxBuffer(article, {
    targetName: 'Acme Co',
    transactionContext: 'value-creation',
    generatedAt: FIXED_DATE,
    canonicalUrl: 'https://example.test/canonical',
    // Canonical reference row is opt-in (default hidden); the extractor
    // round-trip asserts the row survives, so emit it here.
    showCanonicalReference: true,
  });
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets['Information Request List'];
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: '' });

  // Splice in partner responses by reference id.
  for (const row of rows) {
    const ref = String(row[0] ?? '').trim();
    const r = responses[ref];
    if (r) {
      row[2] = r.status ?? 'CLOSED'; // col C — Status
      row[6] = r.response; // col G — Response
      if (r.fileLocation !== undefined) row[3] = r.fileLocation; // col D — File Location
      if (r.comments !== undefined) row[4] = r.comments; // col E — Comments
      if (r.notes !== undefined) row[5] = r.notes; // col F — Notes
    }
  }
  return rows;
}

describe('extract-irl-markdown.mjs — round-trip from generator', () => {
  it('emits the canonical title with the target name from metadata', () => {
    const rows = buildFilledWorkbookRows(SAMPLE_ARTICLE, {});
    const { markdown } = extractIrlMarkdownFromRows(rows);
    expect(markdown.split('\n')[0]).toBe('# Information Request List — Acme Co (filled)');
  });

  it('includes engagement metadata as YAML-style preamble lines', () => {
    const rows = buildFilledWorkbookRows(SAMPLE_ARTICLE, {});
    const { markdown } = extractIrlMarkdownFromRows(rows);
    expect(markdown).toContain('> Engagement context: Value Creation');
    expect(markdown).toContain('> Generated: 2026-05-23');
    expect(markdown).toContain('> Canonical reference: https://example.test/canonical');
  });

  it('round-trips every bullet row with the partner response and status appended', () => {
    const rows = buildFilledWorkbookRows(SAMPLE_ARTICLE, {
      '0-01': { response: 'Acme, Inc. (Delaware C-corp)', status: 'CLOSED' },
      '0-02': { response: 'value-creation, post-close', status: 'CLOSED' },
      '0-03': { response: '$45.2M USD (FY26 actual)', status: 'CLOSED' },
      '1-01': { response: 'B2B SaaS for retail workforce mgmt', status: 'CLOSED' },
      '10-01': { response: 'Phil Cunningham (MD), Nishant Patel (Principal)', status: 'CLOSED' },
    });
    const { markdown, bulletCount, sectionsSeen } = extractIrlMarkdownFromRows(rows);
    expect(bulletCount).toBe(5);
    expect(sectionsSeen).toEqual(['00', '01', '10']);
    expect(markdown).toContain('- 0-01 Company name [CLOSED] — Acme, Inc. (Delaware C-corp)');
    expect(markdown).toContain('- 0-02 Engagement context [CLOSED] — value-creation, post-close');
    expect(markdown).toContain(
      '- 0-03 Annual recurring revenue [CLOSED] — $45.2M USD (FY26 actual)'
    );
    expect(markdown).toContain(
      '- 1-01 One-paragraph product description [CLOSED] — B2B SaaS for retail workforce mgmt'
    );
    expect(markdown).toContain(
      '- 10-01 Deal team contacts [CLOSED] — Phil Cunningham (MD), Nishant Patel (Principal)'
    );
  });

  it('preserves Status=OPEN pre-fill for unanswered rows and stamps `— <NO RESPONSE>`', () => {
    const rows = buildFilledWorkbookRows(SAMPLE_ARTICLE, {
      '0-01': { response: 'Acme', status: 'CLOSED' },
      // 0-02 and 0-03 + 1-01 + 10-01 intentionally unanswered.
    });
    const { markdown, bulletCount } = extractIrlMarkdownFromRows(rows);
    expect(bulletCount).toBe(5);
    expect(markdown).toContain('- 0-02 Engagement context [OPEN] — <NO RESPONSE>');
    expect(markdown).toContain('- 0-03 Annual recurring revenue [OPEN] — <NO RESPONSE>');
    expect(markdown).toContain('- 10-01 Deal team contacts [OPEN] — <NO RESPONSE>');
  });

  it('passes through PARTIAL status verbatim', () => {
    const rows = buildFilledWorkbookRows(SAMPLE_ARTICLE, {
      '0-03': { response: 'preliminary FY26 estimate; final pending audit', status: 'PARTIAL' },
    });
    const { markdown } = extractIrlMarkdownFromRows(rows);
    expect(markdown).toContain(
      '- 0-03 Annual recurring revenue [PARTIAL] — preliminary FY26 estimate; final pending audit'
    );
  });

  it('does NOT include section header rows or section intros in the bullet stream', () => {
    // Section intro on section "10" is "Names + roles of the engagement principals.";
    // header rows look like "10 — CONTACTS" in col B with empty col A.
    const rows = buildFilledWorkbookRows(SAMPLE_ARTICLE, {});
    const { markdown } = extractIrlMarkdownFromRows(rows);
    // The bullet stream MUST NOT contain the uppercased section title or
    // the section intro as a bullet — only as ignored rows.
    const bulletLines = markdown.split('\n').filter((l: string) => l.startsWith('- '));
    expect(bulletLines.some((l: string) => l.includes('CONTACTS'))).toBe(false);
    expect(
      bulletLines.some((l: string) => l.includes('Names + roles of the engagement principals'))
    ).toBe(false);
  });

  it('does NOT include the workbook column header row ("Reference | Request | Status...") in output', () => {
    const rows = buildFilledWorkbookRows(SAMPLE_ARTICLE, {});
    const { markdown } = extractIrlMarkdownFromRows(rows);
    expect(markdown).not.toContain('Reference Request');
    expect(markdown).not.toContain('| Status |');
  });

  it('handles a workbook with zero bullets gracefully (returns 0 count, no throw)', () => {
    const result = extractIrlMarkdownFromRows([]);
    expect(result.bulletCount).toBe(0);
    expect(result.sectionsSeen).toEqual([]);
    // Title still emits — only bullets are missing.
    expect(result.markdown).toContain('# Information Request List');
  });

  it('multi-line responses are preserved as part of the bullet (single-line emit)', () => {
    // The canonical body is a flat bullet stream — multi-line responses
    // get folded into one line. (The model in reconstruction mode does
    // the same thing.) Cell content with internal newlines is left as-is
    // and the bullet stays on one line.
    const rows = buildFilledWorkbookRows(SAMPLE_ARTICLE, {
      '0-01': {
        response: 'Acme Solutions Inc. (parent: Acme Holdings LLC)\nDE C-corp, founded 2015',
        status: 'CLOSED',
      },
    });
    const { markdown } = extractIrlMarkdownFromRows(rows);
    // The newline survives in the response cell value, but the bullet
    // identifier line stays intact — verify both pieces are present.
    expect(markdown).toContain('Acme Solutions Inc. (parent: Acme Holdings LLC)');
    expect(markdown).toContain('DE C-corp, founded 2015');
  });

  it('round-trip byte size is within an order of magnitude of the bullet count × ~80 bytes', () => {
    // Sanity ceiling: ensure no exponential blow-up from JSON-escaping or
    // duplicated content. ~80 bytes/bullet is a realistic average; 8× that
    // is a generous ceiling that would catch an accidental N² emit bug.
    const rows = buildFilledWorkbookRows(SAMPLE_ARTICLE, {
      '0-01': { response: 'A'.repeat(50), status: 'CLOSED' },
      '0-02': { response: 'B'.repeat(50), status: 'CLOSED' },
      '0-03': { response: 'C'.repeat(50), status: 'CLOSED' },
      '1-01': { response: 'D'.repeat(50), status: 'CLOSED' },
      '10-01': { response: 'E'.repeat(50), status: 'CLOSED' },
    });
    const { markdown, bulletCount } = extractIrlMarkdownFromRows(rows);
    const max = bulletCount * 80 * 8;
    expect(markdown.length).toBeLessThan(max);
  });
});

/**
 * BL-120 — the extractor reads all seven columns.
 *
 * Before this, columns D (File Location), E (Comments) and F (Notes) were
 * discarded as "partner-supplied side channels". On the first real filled
 * workbook measured that cost 45.2% of the authored characters, and 17 rows
 * whose Status said CLOSED/PARTIAL rendered `<NO RESPONSE>` while their answer
 * sat in Comments. GST pre-populates research into Comments, sources into File
 * Location and caveats into Notes; the recipient confirms by setting Status.
 *
 * Two invariants carry the design and are asserted separately below because
 * they pull in opposite directions:
 *   1. Comments joins Response into ONE contiguous span, so a citation reading
 *      across the boundary still normalizes to a substring of the body.
 *   2. File Location and Notes stay OUTSIDE the answer slot, so a row whose
 *      only content is a VDR filename still reads `<NO RESPONSE>` and cannot
 *      inflate the prompt's fill ratio or satisfy its inclusion gates.
 */
describe('extract-irl-markdown.mjs — full-workbook read (BL-120)', () => {
  /** Pull the single bullet line for a reference out of the body. */
  function bulletFor(markdown: string, ref: string): string {
    const line = markdown.split('\n').find((l: string) => l.startsWith(`- ${ref} `));
    if (!line) throw new Error(`no bullet emitted for ref ${ref}`);
    return line;
  }

  it('takes the answer from Comments when Response is empty', () => {
    const rows = buildFilledWorkbookRows(SAMPLE_ARTICLE, {
      '1-01': {
        response: '',
        status: 'CLOSED',
        comments: 'B2B SaaS (retail workforce management + retail execution platform).',
      },
    });
    const { markdown, commentsSourcedAnswers, statusContradictions } =
      extractIrlMarkdownFromRows(rows);
    expect(bulletFor(markdown, '1-01')).toBe(
      '- 1-01 One-paragraph product description [CLOSED] — ' +
        'B2B SaaS (retail workforce management + retail execution platform).'
    );
    // The row is answered, so it must NOT read as a contradiction — but it IS
    // the legacy-ambiguity set the operator is asked to skim.
    expect(statusContradictions).toEqual([]);
    expect(commentsSourcedAnswers).toEqual(['1-01']);
  });

  it('joins Response and Comments into one contiguous span, Response first', () => {
    const rows = buildFilledWorkbookRows(SAMPLE_ARTICLE, {
      '0-03': {
        response: '$45.2M USD (FY26 actual)',
        status: 'CLOSED',
        comments: 'Excludes the two acquisitions closed in Q4.',
      },
    });
    const { markdown, commentsSourcedAnswers } = extractIrlMarkdownFromRows(rows);
    expect(bulletFor(markdown, '0-03')).toBe(
      '- 0-03 Annual recurring revenue [CLOSED] — $45.2M USD (FY26 actual). ' +
        'Excludes the two acquisitions closed in Q4.'
    );
    // Response was non-empty, so this row is not in the Comments-sourced set —
    // the answer stands on its own either way.
    expect(commentsSourcedAnswers).toEqual([]);
  });

  it('inserts a period after a Response ending in a letter or a closing bracket', () => {
    const rows = buildFilledWorkbookRows(SAMPLE_ARTICLE, {
      '0-01': { response: 'Acme Inc', status: 'CLOSED', comments: 'Delaware C-corp' },
      '0-02': {
        response: 'value-creation (post-close)',
        status: 'CLOSED',
        comments: 'Signed 2026-03-11',
      },
    });
    const { markdown } = extractIrlMarkdownFromRows(rows);
    expect(bulletFor(markdown, '0-01')).toContain('— Acme Inc. Delaware C-corp');
    expect(bulletFor(markdown, '0-02')).toContain(
      '— value-creation (post-close). Signed 2026-03-11'
    );
  });

  it('does NOT double-terminate a Response that already ends in terminal punctuation', () => {
    const rows = buildFilledWorkbookRows(SAMPLE_ARTICLE, {
      '0-01': { response: 'Acme Inc.', status: 'CLOSED', comments: 'Delaware C-corp' },
      '0-02': { response: 'Who owns this?', status: 'PARTIAL', comments: 'Unresolved' },
      '0-03': { response: '$45.2M; unaudited:', status: 'PARTIAL', comments: 'FY26' },
    });
    const { markdown } = extractIrlMarkdownFromRows(rows);
    expect(bulletFor(markdown, '0-01')).toContain('— Acme Inc. Delaware C-corp');
    expect(bulletFor(markdown, '0-02')).toContain('— Who owns this? Unresolved');
    expect(bulletFor(markdown, '0-03')).toContain('— $45.2M; unaudited: FY26');
    expect(markdown).not.toContain('..');
  });

  it('adds a period after a Response ending in a symbol or unit, not just a letter', () => {
    // The rule is "unless already terminated", not "when it ends in a letter or
    // closing bracket" — the latter silently omitted the period after
    // everything real cells actually end in.
    const rows = buildFilledWorkbookRows(SAMPLE_ARTICLE, {
      '0-03': { response: 'Grew 14%', status: 'CLOSED', comments: 'Recurring only' },
      '1-01': { response: 'Hosting $4.15M +', status: 'CLOSED', comments: 'Excludes egress' },
    });
    const { markdown } = extractIrlMarkdownFromRows(rows);
    expect(bulletFor(markdown, '0-03')).toContain('— Grew 14%. Recurring only');
    expect(bulletFor(markdown, '1-01')).toContain('— Hosting $4.15M +. Excludes egress');
  });

  it('leaves a deliberately-open clause open — trailing ellipsis or dash', () => {
    // Both cases are from the real workbook this change was measured against:
    // a Response ending `ADRs, BDRs, Designs, APIs, AC, …` must not become
    // `AC, ….`. Pinned because the earlier phrasing of the rule got these right
    // by accident, so the rewrite had no test to answer to.
    const rows = buildFilledWorkbookRows(SAMPLE_ARTICLE, {
      '0-01': {
        response: 'ADRs, BDRs, Designs, APIs, AC, …',
        status: 'CLOSED',
        comments: 'Direction confirmed',
      },
      '0-02': {
        response: 'Three named, one pending —',
        status: 'PARTIAL',
        comments: 'Names in the deck',
      },
    });
    const { markdown } = extractIrlMarkdownFromRows(rows);
    expect(bulletFor(markdown, '0-01')).toContain(
      '— ADRs, BDRs, Designs, APIs, AC, … Direction confirmed'
    );
    expect(bulletFor(markdown, '0-02')).toContain('— Three named, one pending — Names in the deck');
    expect(markdown).not.toContain('….');
  });

  it('sees through a closing quote — including the curly quotes Excel autocorrects to', () => {
    // Excel turns `"` into `“ ”` by default, so quoted Responses arrive curly
    // far more often than straight. An ASCII-only quote class missed the common
    // case, and a trailing `,"` produced the very `,.`-shaped artifact the comma
    // rule exists to prevent.
    const rows = buildFilledWorkbookRows(SAMPLE_ARTICLE, {
      '0-01': {
        response: 'They call it “the rating engine”',
        status: 'CLOSED',
        comments: 'Rewrite deferred twice',
      },
      '0-02': { response: '"we ship weekly,"', status: 'CLOSED', comments: 'per the VP Eng' },
      '0-03': { response: 'Revenue was flat (FY26.)', status: 'CLOSED', comments: 'Unaudited' },
    });
    const { markdown } = extractIrlMarkdownFromRows(rows);
    expect(bulletFor(markdown, '0-01')).toContain(
      '— They call it “the rating engine”. Rewrite deferred twice'
    );
    // Ends in a comma once the quote is peeled → the clause continues.
    expect(bulletFor(markdown, '0-02')).toContain('— "we ship weekly," per the VP Eng');
    // Already terminated inside the bracket → no second terminator.
    expect(bulletFor(markdown, '0-03')).toContain('— Revenue was flat (FY26.) Unaudited');
    expect(markdown).not.toContain(',.');
    expect(markdown).not.toContain(',".');
  });

  it('does NOT turn a trailing comma into `,.` — the clause continues instead', () => {
    // The comma case is why the rule is "add a period after alphanumerics and
    // closing brackets" rather than "add a period unless one is already there".
    const rows = buildFilledWorkbookRows(SAMPLE_ARTICLE, {
      '0-01': {
        response: 'Acme Inc,',
        status: 'CLOSED',
        comments: 'a Delaware C-corp founded 2015',
      },
    });
    const { markdown } = extractIrlMarkdownFromRows(rows);
    expect(bulletFor(markdown, '0-01')).toContain('— Acme Inc, a Delaware C-corp founded 2015');
    expect(markdown).not.toContain(',.');
  });

  it('appends File Location and Notes as suffixes outside the answer slot', () => {
    const rows = buildFilledWorkbookRows(SAMPLE_ARTICLE, {
      '0-03': {
        response: '$45.2M USD (FY26 actual)',
        status: 'CLOSED',
        fileLocation: 'VDR/03-Financials/arr-bridge-2026.xlsx',
        notes: 'pending partner confirmation',
      },
    });
    const { markdown } = extractIrlMarkdownFromRows(rows);
    expect(bulletFor(markdown, '0-03')).toBe(
      '- 0-03 Annual recurring revenue [CLOSED] — $45.2M USD (FY26 actual)' +
        ' (Source: VDR/03-Financials/arr-bridge-2026.xlsx)' +
        ' (Note: pending partner confirmation)'
    );
  });

  it('emits all four columns in the canonical order: answer, Source, Note', () => {
    const rows = buildFilledWorkbookRows(SAMPLE_ARTICLE, {
      '0-03': {
        response: '$45.2M USD',
        status: 'CLOSED',
        comments: 'Excludes Q4 acquisitions.',
        fileLocation: 'VDR/03/arr.xlsx',
        notes: 'unaudited',
      },
    });
    const { markdown } = extractIrlMarkdownFromRows(rows);
    expect(bulletFor(markdown, '0-03')).toBe(
      '- 0-03 Annual recurring revenue [CLOSED] — $45.2M USD. Excludes Q4 acquisitions.' +
        ' (Source: VDR/03/arr.xlsx) (Note: unaudited)'
    );
  });

  it('renders `<NO RESPONSE>` when only File Location or Notes are present', () => {
    // The fill-ratio guard. The prompt HALTs a run below 15% substantive
    // Response cells and several inclusion gates test bare non-emptiness — so a
    // row whose only content is a VDR filename must not read as answered.
    const rows = buildFilledWorkbookRows(SAMPLE_ARTICLE, {
      '0-03': { response: '', status: 'CLOSED', fileLocation: 'VDR/03/arr-bridge.xlsx' },
      '1-01': { response: '', status: 'PARTIAL', notes: 'deck is being refreshed' },
    });
    const { markdown, statusContradictions, commentsSourcedAnswers } =
      extractIrlMarkdownFromRows(rows);
    expect(bulletFor(markdown, '0-03')).toBe(
      '- 0-03 Annual recurring revenue [CLOSED] — <NO RESPONSE> (Source: VDR/03/arr-bridge.xlsx)'
    );
    expect(bulletFor(markdown, '1-01')).toBe(
      '- 1-01 One-paragraph product description [PARTIAL] — <NO RESPONSE> (Note: deck is being refreshed)'
    );
    // Neither is a contradiction: the row carries content, just not an answer.
    expect(statusContradictions).toEqual([]);
    expect(commentsSourcedAnswers).toEqual([]);
  });

  it('flags a CLOSED/PARTIAL row with every content column empty as a contradiction', () => {
    const rows = buildFilledWorkbookRows(SAMPLE_ARTICLE, {
      '0-01': { response: 'Acme Inc.', status: 'CLOSED' },
      '0-02': { response: '', status: 'CLOSED' },
      '0-03': { response: '', status: 'PARTIAL' },
      // 1-01 and 10-01 stay OPEN with nothing — unanswered, not contradictory.
    });
    const { markdown, statusContradictions } = extractIrlMarkdownFromRows(rows);
    expect(statusContradictions).toEqual(['0-02', '0-03']);
    expect(bulletFor(markdown, '0-02')).toBe('- 0-02 Engagement context [CLOSED] — <NO RESPONSE>');
    // An OPEN row with nothing in it is the normal unanswered case.
    expect(bulletFor(markdown, '10-01')).toBe('- 10-01 Deal team contacts [OPEN] — <NO RESPONSE>');
  });

  it('lists Comments-sourced answers regardless of Status, including OPEN rows', () => {
    // Observed on the real workbook: a row marked OPEN carrying 400+ characters
    // of Comments. The list is defined on "Response empty + Comments present"
    // precisely because Status is the field that is unreliable here.
    const rows = buildFilledWorkbookRows(SAMPLE_ARTICLE, {
      '0-01': { response: '', status: 'OPEN', comments: 'Acme Inc., a Delaware C-corp.' },
      '0-02': { response: '', status: 'CLOSED', comments: 'Value creation, post-close.' },
      '0-03': { response: '$45.2M', status: 'CLOSED', comments: 'Unaudited.' },
    });
    const { markdown, commentsSourcedAnswers, statusContradictions } =
      extractIrlMarkdownFromRows(rows);
    expect(commentsSourcedAnswers).toEqual(['0-01', '0-02']);
    expect(statusContradictions).toEqual([]);
    // The OPEN row's Comments still becomes the answer — Status does not gate
    // inclusion, it only describes the recipient's confidence.
    expect(bulletFor(markdown, '0-01')).toBe(
      '- 0-01 Company name [OPEN] — Acme Inc., a Delaware C-corp.'
    );
  });

  it('returns both ref lists empty for a workbook with no D/E/F content', () => {
    const rows = buildFilledWorkbookRows(SAMPLE_ARTICLE, {
      '0-01': { response: 'Acme Inc.', status: 'CLOSED' },
    });
    const { statusContradictions, commentsSourcedAnswers } = extractIrlMarkdownFromRows(rows);
    expect(statusContradictions).toEqual([]);
    expect(commentsSourcedAnswers).toEqual([]);
  });
});
