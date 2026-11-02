// @vitest-environment jsdom
/**
 * IRL Extractor script words on an es or pt page (BL-153 Tier B): the
 * `data-irl-ext-strings` island beats the English catalog and numbers follow
 * `<html lang>`, while the markdown itself is never translated. With no island
 * (the English page) `tests/unit/irl-extractor-logic.test.ts` pins the English.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { WEB_PROMPT_ARG_CEILING } from '../../src/utils/irl/extract-markdown.mjs';
import type { ExtractIrlMarkdownResult } from '../../src/utils/irl/extract-markdown.mjs';
import { summarizeExtraction } from '../../src/scripts/information-request-list-extractor/logic';
import {
  SCRIPT_STRING_KEYS,
  resetStringsForTest,
} from '../../src/scripts/information-request-list-extractor/strings';

const catalog = (code: string): Record<string, string> =>
  JSON.parse(
    readFileSync(
      resolve(__dirname, `../../src/i18n/${code}/information-request-list-extractor.json`),
      'utf-8'
    )
  );

const result = (over: Partial<ExtractIrlMarkdownResult> = {}): ExtractIrlMarkdownResult => ({
  markdown: '- 0-01 Name [CLOSED] — Acme\n- 0-02 Other [CLOSED] — Beta\n',
  bulletCount: 2,
  sectionsSeen: ['00'],
  commentsSourcedAnswers: [],
  statusContradictions: [],
  ...over,
});

const blank = (bulletCount: number) =>
  result({ bulletCount, markdown: '- 0-01 Name [OPEN] — <NO RESPONSE>\n'.repeat(bulletCount) });

function page(lang: string, code: string) {
  document.documentElement.lang = lang;
  document.body.innerHTML = '';
  const island = document.createElement('script');
  island.type = 'application/json';
  island.setAttribute('data-irl-ext-strings', '');
  const all = catalog(code);
  island.textContent = JSON.stringify(
    Object.fromEntries(SCRIPT_STRING_KEYS.map((key) => [key, all[key]]))
  );
  document.body.append(island);
  resetStringsForTest();
}

afterEach(() => {
  document.documentElement.lang = '';
  document.body.innerHTML = '';
  resetStringsForTest();
});

describe.each([
  ['es', 'es', 'Se leyó “IRL”: 2 solicitudes en 1 sección', 'ninguna'],
  ['pt-BR', 'pt-BR', '“IRL” lida: 2 solicitações em 1 seção', 'nenhuma'],
])('IRL Extractor strings — the %s island wins', (lang, code, status, none) => {
  beforeEach(() => page(lang, code));

  it('translates the status line', () => {
    expect(summarizeExtraction(result(), 'IRL', 'a.xlsx').status).toBe(status);
  });

  it('translates "none" and writes the size with a decimal comma', () => {
    const { diag } = summarizeExtraction(result({ sectionsSeen: [] }), 'IRL', 'a.xlsx');
    expect(diag.sections).toBe(none);
    expect(diag.bytes).toBe('0,1 KB');
  });

  it('keeps the filename and the section numbers as they are', () => {
    const out = summarizeExtraction(result({ sectionsSeen: ['00', '09'] }), 'IRL', 'a.xlsx');
    expect(out.filename).toBe('a.md');
    expect(out.diag.sections).toBe('00 09');
  });

  it('groups both numbers in the ceiling advisory the same way', () => {
    const markdown = 'x'.repeat(WEB_PROMPT_ARG_CEILING + 1);
    const { advisory } = summarizeExtraction(result({ markdown }), 'IRL', 'a.xlsx');
    const fmt = new Intl.NumberFormat(lang);
    expect(advisory).toContain(fmt.format(WEB_PROMPT_ARG_CEILING + 1));
    expect(advisory).toContain(fmt.format(WEB_PROMPT_ARG_CEILING));
  });

  it('carries a distinct translation for each unanswered-row count', () => {
    const one = summarizeExtraction(blank(1), 'IRL', 'a.xlsx').advisory;
    const many = summarizeExtraction(blank(3), 'IRL', 'a.xlsx').advisory;
    expect(one).toBe(catalog(code)['js.advisory.unanswered.one']);
    expect(many).toBe(catalog(code)['js.advisory.unanswered.other'].replace('{count}', '3'));
  });
});

describe('IRL Extractor strings — the English page', () => {
  it('words a single unanswered row in the singular', () => {
    const { advisory } = summarizeExtraction(blank(1), 'IRL', 'a.xlsx');
    expect(advisory).toContain('The only row is unanswered');
    expect(advisory).not.toContain('All 1 rows');
  });

  it('prints both ceiling numbers in the page language, not the browser locale', () => {
    document.documentElement.lang = 'en';
    const markdown = 'x'.repeat(WEB_PROMPT_ARG_CEILING + 1);
    const { advisory } = summarizeExtraction(result({ markdown }), 'IRL', 'a.xlsx');
    const fmt = new Intl.NumberFormat('en');
    expect(advisory).toContain(`${fmt.format(WEB_PROMPT_ARG_CEILING + 1)} bytes`);
    expect(advisory).toContain(`~${fmt.format(WEB_PROMPT_ARG_CEILING)}-byte`);
  });
});

describe('IRL Extractor strings — the island keys', () => {
  it('finds script keys, so the parity cases above are not vacuous', () => {
    expect(SCRIPT_STRING_KEYS).toContain('js.status.read');
    expect(SCRIPT_STRING_KEYS.every((key) => key.startsWith('js.'))).toBe(true);
  });
});
