import {
  WEB_PROMPT_ARG_CEILING,
  summarizeExtraction,
} from '../../src/scripts/information-request-list-extractor/logic';
import type { ExtractIrlMarkdownResult } from '../../src/utils/irl/extract-markdown.mjs';

function result(overrides: Partial<ExtractIrlMarkdownResult> = {}): ExtractIrlMarkdownResult {
  return {
    markdown: '- 01.1 Org chart — Attached\n- 01.2 Headcount — 42\n',
    bulletCount: 2,
    sectionsSeen: ['01'],
    statusContradictions: [],
    commentsSourcedAnswers: [],
    ...overrides,
  };
}

describe('IRL extractor — summarizeExtraction', () => {
  it('names the download after the workbook, whatever the extension case', () => {
    expect(summarizeExtraction(result(), 'IRL', 'Target IRL.xlsx').filename).toBe('Target IRL.md');
    expect(summarizeExtraction(result(), 'IRL', 'target.XLSX').filename).toBe('target.md');
  });

  it('pluralises the status line', () => {
    expect(summarizeExtraction(result(), 'IRL', 'a.xlsx').status).toBe(
      'Read “IRL”: 2 requests across 1 section'
    );
    const one = result({ bulletCount: 1, sectionsSeen: ['01', '02'] });
    expect(summarizeExtraction(one, 'Sheet1', 'a.xlsx').status).toBe(
      'Read “Sheet1”: 1 request across 2 sections'
    );
  });

  it('fills the diagnostics row, with "none" when no section was seen', () => {
    const r = result({
      sectionsSeen: ['00', '09'],
      commentsSourcedAnswers: ['01.1'],
      statusContradictions: ['01.2', '02.1'],
    });
    expect(summarizeExtraction(r, 'IRL', 'a.xlsx').diag).toEqual({
      bullets: '2',
      sections: '00 09',
      bytes: '0.1 KB', // 54 UTF-8 bytes (each "—" is 3), to one decimal of a KB
      comments: '1',
      contradictions: '2',
    });
    expect(summarizeExtraction(result({ sectionsSeen: [] }), 'IRL', 'a.xlsx').diag.sections).toBe(
      'none'
    );
  });

  it('has no advisory for an answered body under the ceiling', () => {
    expect(summarizeExtraction(result(), 'IRL', 'a.xlsx').advisory).toBeNull();
  });

  it('flags an unfilled template when every row is <NO RESPONSE>', () => {
    const r = result({ markdown: '- 01.1 Org chart — <NO RESPONSE>\n- 01.2 X — <NO RESPONSE>\n' });
    expect(summarizeExtraction(r, 'IRL', 'a.xlsx').advisory).toMatch(/All 2 rows are unanswered/);
  });

  it('flags a body over the web prompt ceiling, counting UTF-8 bytes', () => {
    // "—" is 3 bytes: a string of CEILING/3 + 1 of them is under the ceiling in
    // characters but over it in bytes.
    const markdown = '- 01.1 A — ' + '—'.repeat(Math.ceil(WEB_PROMPT_ARG_CEILING / 3));
    expect(markdown.length).toBeLessThan(WEB_PROMPT_ARG_CEILING);
    const advisory = summarizeExtraction(result({ markdown }), 'IRL', 'a.xlsx').advisory;
    expect(advisory).toMatch(/exceeds the ~57,000-byte ceiling/);
  });

  it('prefers the template advisory when an unfilled body is also over the ceiling', () => {
    const markdown = '- 01.1 A — <NO RESPONSE>'.padEnd(WEB_PROMPT_ARG_CEILING + 10, ' ');
    const r = result({ markdown, bulletCount: 1 });
    expect(summarizeExtraction(r, 'IRL', 'a.xlsx').advisory).toMatch(/unanswered/);
  });
});
