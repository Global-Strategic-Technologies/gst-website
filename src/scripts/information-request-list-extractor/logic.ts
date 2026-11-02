/**
 * IRL extractor — the page script's DOM-free logic (ADR-0042).
 *
 * The extraction itself is `src/utils/irl/extract-markdown.mjs`, shared with
 * the operator CLI. This file turns its result into what the page shows: the
 * download filename, the status line, the diagnostics row and the advisory.
 * Unit-tested by `tests/unit/irl-extractor-logic.test.ts`.
 */
import { WEB_PROMPT_ARG_CEILING } from '../../utils/irl/extract-markdown.mjs';
import type { ExtractIrlMarkdownResult } from '../../utils/irl/extract-markdown.mjs';
import { formatNumber, formatPlain, pluralKey } from '../../i18n/formatters';
import { pageLang } from '../tool-strings';
import { s } from './strings';

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
  const lang = pageLang();
  const unanswered = result.markdown.split('— <NO RESPONSE>').length - 1;
  let advisory: string | null = null;
  if (unanswered === result.bulletCount) {
    advisory = s(`js.advisory.unanswered.${pluralKey(result.bulletCount, lang)}`, {
      count: formatPlain(result.bulletCount, lang),
    });
  } else if (byteLength > WEB_PROMPT_ARG_CEILING) {
    advisory = s('js.advisory.ceiling', {
      bytes: formatNumber(byteLength, lang),
      ceiling: formatNumber(WEB_PROMPT_ARG_CEILING, lang),
    });
  }

  return {
    filename: fileName.replace(/\.xlsx$/i, '') + '.md',
    status: s('js.status.read', {
      sheet: sheetName,
      requests: s(`js.status.requests.${pluralKey(result.bulletCount, lang)}`, {
        count: formatPlain(result.bulletCount, lang),
      }),
      // pt-BR's plural rules select `one` for 0, which would print "0 seção".
      sections: s(`js.status.sections.${sections === 0 ? 'other' : pluralKey(sections, lang)}`, {
        count: formatPlain(sections, lang),
      }),
    }),
    diag: {
      bullets: formatPlain(result.bulletCount, lang),
      sections: sections ? result.sectionsSeen.join(' ') : s('js.diag.none'),
      bytes: s('js.diag.bytes', { kb: formatPlain(kb, lang) }),
      comments: formatPlain(result.commentsSourcedAnswers.length, lang),
      contradictions: formatPlain(result.statusContradictions.length, lang),
    },
    advisory,
  };
}
