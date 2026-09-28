/**
 * IRL extractor — the page script's DOM-free logic (ADR-0042).
 *
 * The extraction itself is `src/utils/irl/extract-markdown.mjs`, shared with
 * the operator CLI. This file turns its result into what the page shows: the
 * download filename, the status line, the diagnostics row and the advisory.
 * Unit-tested by `tests/unit/irl-extractor-logic.test.ts`.
 */
import type { ExtractIrlMarkdownResult } from '../../utils/irl/extract-markdown.mjs';

/**
 * The claude.ai web prompt-argument ceiling. Above this the body still
 * converts and is still valid — only the web client refuses to carry it as
 * a prompt arg, and Desktop does not. Advisory, never an error: the CLI
 * treats it the same way.
 */
export const WEB_PROMPT_ARG_CEILING = 57_000;

/** What the page renders for a workbook that converted to at least one row. */
export interface ExtractionSummary {
  filename: string;
  status: string;
  diag: {
    bullets: string;
    sections: string;
    bytes: string;
    comments: string;
    contradictions: string;
  };
  /** `null` hides the advisory. */
  advisory: string | null;
}

export function summarizeExtraction(
  result: ExtractIrlMarkdownResult,
  sheetName: string,
  fileName: string
): ExtractionSummary {
  const byteLength = new TextEncoder().encode(result.markdown).length;
  const kb = Math.round((byteLength / 1024) * 10) / 10;
  const sections = result.sectionsSeen.length;

  // Two advisories, neither of them an error. An unfilled template converts
  // successfully into a body of `<NO RESPONSE>` rows — the CLI does the same
  // — so the honest signal is "nothing here is answered yet", not a failure.
  const unanswered = result.markdown.split('— <NO RESPONSE>').length - 1;
  let advisory: string | null = null;
  if (unanswered === result.bulletCount) {
    advisory =
      `All ${result.bulletCount} rows are unanswered, so this looks like a template that has ` +
      'not been filled in yet. It converted, but there is nothing in it to sweep.';
  } else if (byteLength > WEB_PROMPT_ARG_CEILING) {
    advisory =
      `${byteLength.toLocaleString()} bytes exceeds the ~57,000-byte ceiling for a ` +
      'claude.ai web prompt argument. The body is still valid; paste it in the desktop app.';
  }

  return {
    filename: fileName.replace(/\.xlsx$/i, '') + '.md',
    status:
      `Read “${sheetName}”: ${result.bulletCount} ` +
      `${result.bulletCount === 1 ? 'request' : 'requests'} across ` +
      `${sections} ${sections === 1 ? 'section' : 'sections'}`,
    diag: {
      bullets: String(result.bulletCount),
      sections: sections ? result.sectionsSeen.join(' ') : 'none',
      bytes: `${kb} KB`,
      comments: String(result.commentsSourcedAnswers.length),
      contradictions: String(result.statusContradictions.length),
    },
    advisory,
  };
}
