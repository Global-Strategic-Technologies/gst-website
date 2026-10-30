// @vitest-environment jsdom
/**
 * IRL Generator script words on an es or pt page (BL-153 Tier B): the
 * `data-irl-strings` island beats the English fallbacks — the
 * `information-request-list-generator` catalog for the script's words, the
 * parsed source and `IRL_XLSX_LABELS_EN` for the workbook. With no island
 * (the English page) everything resolves to the English it always had. The
 * workbook built from these is round-tripped in tests/integration/irl-pipeline.test.ts.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseIrlArticle } from '../../src/utils/irl/parse-article';
import { IRL_XLSX_LABELS_EN } from '../../src/utils/irl/generate-xlsx';
import {
  localizeIrlArticle,
  localizedXlsxLabels,
} from '../../src/scripts/information-request-list-generator/logic';
import {
  hasString,
  resetStringsForTest,
  s,
} from '../../src/scripts/information-request-list-generator/strings';

const article = parseIrlArticle(
  readFileSync(resolve(__dirname, '../../src/data/irl/information-request-list.md'), 'utf-8')
);
const lookup = (key: string) => (hasString(key) ? s(key) : undefined);

function island(strings: Record<string, string>) {
  document.body.innerHTML = `<script type="application/json" data-irl-strings>${JSON.stringify(strings)}</script>`;
  resetStringsForTest();
}

afterEach(() => {
  document.body.innerHTML = '';
  resetStringsForTest();
});

describe('IRL Generator strings — no island (the English page)', () => {
  it('reads the English catalog for the script words', () => {
    expect(s('js.autoSkipped', { context: s('context.value-creation') })).toBe(
      'auto · Value Creation'
    );
    expect(s('js.noSections')).toBe('Select at least one section to include.');
  });

  it('leaves the article and the workbook labels English', () => {
    expect(localizeIrlArticle(article, lookup)).toEqual(article);
    expect(localizedXlsxLabels(lookup)).toEqual(IRL_XLSX_LABELS_EN);
  });
});

describe('IRL Generator strings — the island wins', () => {
  it('translates the script words', () => {
    island({ 'js.autoSkipped': 'auto · {context}', 'context.buy-side': 'Lado comprador' });
    expect(s('js.autoSkipped', { context: s('context.buy-side') })).toBe('auto · Lado comprador');
  });

  it('swaps request text, section titles and the intro by key, keeping the rest', () => {
    island({
      'article.intro': 'Introducción.',
      'section.00.title': 'Datos básicos',
      'req.00-01': 'Nombre de la empresa',
    });
    const out = localizeIrlArticle(article, lookup);
    expect(out.intro).toBe('Introducción.');
    expect(out.title).toBe(article.title);
    expect(out.sections[0].title).toBe('Datos básicos');
    expect(out.sections[0].bullets[0].text).toBe('Nombre de la empresa');
    expect(out.sections[0].bullets[1].text).toBe(article.sections[0].bullets[1].text);
    expect(out.sections[0].bullets[1].skipIf).toEqual(article.sections[0].bullets[1].skipIf);
  });

  it('builds the workbook labels from the island', () => {
    island({
      'xlsx.header.2': 'Solicitud',
      'xlsx.instructions': 'Instrucciones\n\nLas {sectionCount} áreas',
      'xlsx.statusError': 'El estado debe ser OPEN, PARTIAL o CLOSED.',
    });
    const labels = localizedXlsxLabels(lookup);
    expect(labels.columnHeaders[1]).toBe('Solicitud');
    expect(labels.columnHeaders[0]).toBe('Reference');
    expect(labels.instructionsLines).toEqual(['Instrucciones', '', 'Las {sectionCount} áreas']);
    expect(labels.statusError).toBe('El estado debe ser OPEN, PARTIAL o CLOSED.');
    expect(labels.statusPrompt).toBe(IRL_XLSX_LABELS_EN.statusPrompt);
  });
});
