/**
 * BL-140 conformance suite — the acceptance criterion's proof.
 *
 * "The emitted artifact is a valid input to the frozen path with zero
 * downstream edits … proven by running the emitted artifact through the
 * existing extractor and pre-flight exactly as they stand."
 *
 * Every import from the frozen path here is the REAL surface, unmodified:
 * `extractIrlMarkdownFromRows` from `scripts/extract-irl-markdown.mjs`
 * (the `npm run irl:extract` engine) and `runIrlProvenanceCheck` /
 * `extractExcerpt` from `schemas/validate-irl-provenance.ts`. Nothing is
 * mocked or re-implemented except C4's fillRatio arithmetic, which is
 * prompt PROSE, not code — and C4 binds its re-statement to the rendered
 * `gst_irl_ingestion` body so prompt drift fails this suite.
 */

import * as XLSX from 'xlsx-js-style';

import { extractIrlMarkdownFromRows } from '../../../scripts/extract-irl-markdown.mjs';
import {
  extractExcerpt,
  runIrlProvenanceCheck,
} from '../../../src/schemas/validate-irl-provenance';
import { irlIngestionPrompt } from '../../../src/prompts/irl-ingestion';
import { minimalArgsFor } from '../../helpers/prompt-args';
import {
  handleFillIrlXlsxTool,
  type FillIrlXlsxInput,
} from '../../../src/tools/fill-information-request-list-xlsx';
import { parseToolResult, type CallToolResultPayload } from '../../helpers/tool-envelope';

const FILL_A = {
  ref: '0-01',
  fileLocation: 'VDR/00/entity-chart.pdf, page 1',
  comments: 'Delaware C-corp, single operating entity.',
};
const FILL_B = {
  ref: '1-01',
  fileLocation: '[inferred from product-overview.pdf + demo session]',
  comments: 'Single multi-tenant SaaS surface, browser-only delivery.',
};

interface FillPayload {
  base64: string;
  bulletCount: number;
  filledRowCount: number;
  filledRefs: string[];
}

/** Run the fill tool, decode the workbook, run the FROZEN extractor over it. */
async function fillAndExtract(input: FillIrlXlsxInput) {
  const result = (await handleFillIrlXlsxTool(input)) as CallToolResultPayload;
  expect(result.isError).not.toBe(true);
  const payload = parseToolResult<FillPayload>(result, { textOmit: ['base64'] });
  const binary = atob(payload.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const wb = XLSX.read(bytes, { type: 'array' });
  const sheet = wb.Sheets['Information Request List'];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as (string | number)[][];
  return { payload, extraction: extractIrlMarkdownFromRows(rows) };
}

/** The bullet line for a given workbook ref out of extracted markdown. */
function bulletLine(markdown: string, ref: string): string {
  const line = markdown.split('\n').find((l) => l.startsWith(`- ${ref} `));
  expect(line, `bullet line for ${ref}`).toBeDefined();
  return line!;
}

describe('BL-140 conformance — the frozen extractor reads the emitted artifact', () => {
  it('C1: a filled row renders its E answer in the answer span and its D reference inside (Source: …)', async () => {
    const { extraction } = await fillAndExtract({ fills: [FILL_A, FILL_B] });
    const line = bulletLine(extraction.markdown, '0-01');
    // Shape: `- <ref> <request> [OPEN] — <E answer> (Source: <D>)` — no Note group.
    expect(line).toMatch(
      /^- 0-01 .+ \[OPEN\] — Delaware C-corp, single operating entity\. \(Source: VDR\/00\/entity-chart\.pdf, page 1\)$/
    );
    // Bracketed non-document origin renders the same way.
    const lineB = bulletLine(extraction.markdown, '1-01');
    expect(lineB).toContain(
      '— Single multi-tenant SaaS surface, browser-only delivery. (Source: [inferred from product-overview.pdf + demo session])'
    );
  });

  it('C2: an unfilled row renders <NO RESPONSE> with no suffix — blank rows ARE the follow-up ask', async () => {
    const { extraction } = await fillAndExtract({ fills: [FILL_A] });
    const line = bulletLine(extraction.markdown, '0-02');
    expect(line).toMatch(/\[OPEN\] — <NO RESPONSE>$/);
    expect(line).not.toContain('(Source:');
    expect(line).not.toContain('(Note:');
  });

  it('C3: no status contradictions; commentsSourcedAnswers lists exactly the filled refs (expected frozen behavior)', async () => {
    const { payload, extraction } = await fillAndExtract({ fills: [FILL_A, FILL_B] });
    // Status stays OPEN everywhere and the fill writes content, so the
    // contradiction list (content-empty + CLOSED/PARTIAL) is empty by construction.
    expect(extraction.statusContradictions).toEqual([]);
    // Every fill answers in E with G empty — so every filled ref lands on the
    // extractor's Comments-sourced operator note. That is EXPECTED, not a
    // defect: the answers live in E by operator ruling, and the note is the
    // frozen path's honest report of that. Recorded in
    // `src/docs/tools/irl-fill/CONTRACT.md` § Accepted residuals.
    expect([...extraction.commentsSourcedAnswers].sort()).toEqual(payload.filledRefs);
  });

  it('C6: a union re-run extends without overwriting — run A ⊂ run B, nothing removed', async () => {
    const runA = await fillAndExtract({ fills: [FILL_A] });
    const extendedA = {
      ref: FILL_A.ref,
      fileLocation: `${FILL_A.fileLocation}; [inferred from filing history]`,
      comments: `${FILL_A.comments} Confirmed against the FY2025 filing.`,
    };
    const runB = await fillAndExtract({ fills: [extendedA, FILL_B] });

    const lineA = bulletLine(runA.extraction.markdown, '0-01');
    const lineB = bulletLine(runB.extraction.markdown, '0-01');
    // The original answer prose and the original D segment both survive verbatim…
    expect(lineB).toContain(FILL_A.comments);
    expect(lineB).toContain(FILL_A.fileLocation);
    // …with the new segment appended after the '; ' separator.
    expect(lineB).toContain(
      '(Source: VDR/00/entity-chart.pdf, page 1; [inferred from filing history])'
    );
    // And run A's answer span is a strict prefix of run B's (extend, not rewrite).
    // Anchor on the status group: request text may itself contain ' — '.
    const answerOf = (line: string): string => line.match(/\[[A-Z]+\] — (.*)$/)![1];
    expect(answerOf(lineB).startsWith(FILL_A.comments)).toBe(true);
    expect(answerOf(lineA).startsWith(FILL_A.comments)).toBe(true);
    // Nothing removed: every ref filled in A is still filled in B.
    expect(runB.payload.filledRefs).toEqual(expect.arrayContaining(runA.payload.filledRefs));
  });
});

describe('BL-140 conformance — pre-flight arithmetic (C4)', () => {
  // The substantive-cell rule is PROMPT PROSE (irl-ingestion.ts, the
  // wrong-IRL detector pre-flight), not server code — the schema field it
  // feeds is model-supplied (BL-130). This test SIMULATES the prose rule.
  // To keep the simulation honest it first binds the contiguous rule
  // clause to the rendered prompt body: if the prompt's placeholder set
  // drifts, the binding fails before the simulation can go stale.
  const RULE_CLAUSE =
    'Substantive = not blank AND not just `"n/a"` / `"not yet tracked"` / `"open"` / `"--"` / `"TBD"` / one-character placeholders.';
  const PLACEHOLDERS = new Set(['n/a', 'not yet tracked', 'open', '--', 'tbd']);

  function isSubstantive(answer: string): boolean {
    const trimmed = answer.trim();
    if (trimmed.length === 0 || trimmed === '<NO RESPONSE>') return false;
    if (trimmed.length === 1) return false;
    return !PLACEHOLDERS.has(trimmed.toLowerCase());
  }

  it('binds the placeholder rule to the rendered gst_irl_ingestion body (drift detector)', () => {
    const rendered = irlIngestionPrompt
      .build(minimalArgsFor('gst_irl_ingestion') as never)
      .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
      .join('\n');
    expect(rendered).toContain(RULE_CLAUSE);
  });

  it('counts exactly the filled rows as substantive — and the rule, not this tool, decides', async () => {
    // Third fill carries an E of "n/a": schema-valid, written to the cell,
    // counted by filledRowCount — but NOT substantive under the frozen rule.
    const { payload, extraction } = await fillAndExtract({
      fills: [
        FILL_A,
        FILL_B,
        { ref: '0-02', fileLocation: 'VDR/00/register.pdf, page 3', comments: 'n/a' },
      ],
    });
    const bulletLines = extraction.markdown.split('\n').filter((l) => /^- \d{1,2}-\d{2} /.test(l));
    // Vacuity floor: the walk must actually iterate the canonical list
    // (precedent: the probed-count floors in bl-124-desktop-usability).
    expect(bulletLines.length).toBeGreaterThan(60);
    expect(bulletLines.length).toBe(payload.bulletCount);

    const substantive = bulletLines.filter((l) => {
      // Anchor on the status group: request text may itself contain ' — '.
      const m = l.match(/\[[A-Z]+\] — (.*)$/);
      expect(m, `answer span in: ${l}`).not.toBeNull();
      const answer = m![1].replace(/ \(Source: .*$/, '').replace(/ \(Note: .*$/, '');
      return isSubstantive(answer);
    }).length;

    // 3 rows filled; the "n/a" row does not count. fillRatio would be
    // substantive / bulletCount — far under the 15% HALT threshold for this
    // sparse fixture, which is the pre-flight grading the populated workbook
    // by exactly the same rules as a target-returned one.
    expect(payload.filledRowCount).toBe(3);
    expect(substantive).toBe(2);
    expect(substantive / payload.bulletCount).toBeLessThan(0.15);
  });
});

describe('BL-140 conformance — provenance matching (C5)', () => {
  it('a citation quoting the E answer verifies against the extracted body', async () => {
    const { extraction } = await fillAndExtract({ fills: [FILL_A] });
    const result = runIrlProvenanceCheck({
      filledIrl: extraction.markdown,
      citations: [{ path: 'corporate.structure', citation: `Section 00 — ${FILL_A.comments}` }],
    });
    expect(result.verdicts[0].status).toBe('verified');
  });

  it('an en-dash inside D is harmless: the row extracts and the answer still verifies', async () => {
    const enDashFill = {
      ref: '0-01',
      fileLocation: 'board-minutes–2026.pdf, item 3', // en-dash U+2013: legal by grammar
      comments: 'Quarterly board cadence with two independent directors.',
    };
    const { extraction } = await fillAndExtract({ fills: [enDashFill] });
    expect(bulletLine(extraction.markdown, '0-01')).toContain(
      '(Source: board-minutes–2026.pdf, item 3)'
    );
    const result = runIrlProvenanceCheck({
      filledIrl: extraction.markdown,
      citations: [{ path: 'governance.cadence', citation: `Section 00 — ${enDashFill.comments}` }],
    });
    expect(result.verdicts[0].status).toBe('verified');
  });

  it('control: the em-dash collapse the D grammar exists to prevent', () => {
    // extractExcerpt anchors on the LAST em-dash in a citation. Were an
    // em-dash allowed into D, a model quoting the rendered bullet would
    // carry it into the citation and everything before it would never be
    // checked — the wrong-vendor false-verification demonstrated in
    // tests/integration/irl-ingestion-fixtures.test.ts. The schema makes
    // that unreachable from this tool; this control pins the mechanism the
    // ban is traceable to.
    expect(extractExcerpt('Section 00 — TechDebt.pdf — page 4')).toBe('page 4');
    expect(extractExcerpt('Section 00 — a clean citation with one dash')).toBe(
      'a clean citation with one dash'
    );
  });
});
