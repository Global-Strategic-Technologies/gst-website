/**
 * The IRL Generator's English data catalog mirrors the shared IRL source and
 * the workbook builder's English labels (BL-153 Tier B). Both stay English for
 * the MCP server; `information-request-list-generator-data` repeats them by
 * key so the es and pt pages can translate them. This pins the two together:
 * an edit to `src/data/irl/information-request-list.md` (or to
 * `IRL_XLSX_LABELS_EN`) without the catalog fails here, and the es / pt-BR
 * staleness guard then asks for the translations to be revisited.
 *
 * The request keys are positional (`NN-II`), so inserting a bullet shifts
 * every key after it — this compares text per key, so a shift fails loudly
 * (src/data/irl/README.md § Editing a request — translations).
 *
 * It also holds every locale's workbook labels to Excel's limits: a breach
 * opens the recipient's file in repair mode.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseIrlArticle } from '../../src/utils/irl/parse-article';
import { IRL_XLSX_LABELS_EN } from '../../src/utils/irl/generate-xlsx';
import { irlRequestKey } from '../../src/utils/irl/customize-article';
import EN from '../../src/i18n/en/information-request-list-generator-data.json';
import ES from '../../src/i18n/es/information-request-list-generator-data.json';
import PT from '../../src/i18n/pt-BR/information-request-list-generator-data.json';

const SOURCE = readFileSync(
  resolve(__dirname, '../../src/data/irl/information-request-list.md'),
  'utf-8'
);
const article = parseIrlArticle(SOURCE);
const en = EN as Record<string, string>;

function expectedCatalog(): Record<string, string> {
  const out: Record<string, string> = { 'article.intro': article.intro ?? '' };
  for (const section of article.sections) {
    out[`section.${section.number}.title`] = section.title;
    section.bullets.forEach((b, i) => {
      out[`req.${irlRequestKey(section.number, b, i + 1)}`] = b.text;
    });
  }
  const L = IRL_XLSX_LABELS_EN;
  L.columnHeaders.forEach((h, i) => (out[`xlsx.header.${i + 1}`] = h));
  out['xlsx.instructionsSheetName'] = L.instructionsSheetName;
  out['xlsx.instructions'] = L.instructionsLines.join('\n');
  out['xlsx.handbackWithTarget'] = L.handbackWithTarget;
  out['xlsx.handbackWithoutTarget'] = L.handbackWithoutTarget;
  out['xlsx.statusPromptTitle'] = L.statusPromptTitle;
  out['xlsx.statusPrompt'] = L.statusPrompt;
  out['xlsx.statusErrorTitle'] = L.statusErrorTitle;
  out['xlsx.statusError'] = L.statusError;
  return out;
}

describe('IRL Generator catalog — English equals the shared source and labels', () => {
  const expected = expectedCatalog();

  it('mirrors every key of the source and the labels', () => {
    for (const [key, value] of Object.entries(expected)) {
      expect(
        en[key],
        `${key}: update src/i18n/en/information-request-list-generator-data.json`
      ).toBe(value);
    }
  });

  it('carries no key the source and labels lack', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(expected).sort());
  });

  // `IRLSection.intro` is unused today. A section that gains one needs a
  // `section.<NN>.intro` key and `localizeIrlArticle` support first.
  it('has no section intros to translate', () => {
    expect(article.sections.filter((s) => s.intro)).toEqual([]);
  });
});

describe.each([
  ['en', en],
  ['es', ES as Record<string, string>],
  ['pt-BR', PT as Record<string, string>],
])('IRL workbook labels — %s fits Excel', (_locale, catalog) => {
  it('keeps the dropdown text and tab name within Excel limits', () => {
    expect(catalog['xlsx.statusPromptTitle'].length).toBeLessThanOrEqual(32);
    expect(catalog['xlsx.statusErrorTitle'].length).toBeLessThanOrEqual(32);
    expect(catalog['xlsx.statusPrompt'].length).toBeLessThanOrEqual(255);
    expect(catalog['xlsx.statusError'].length).toBeLessThanOrEqual(225);
    const tab = catalog['xlsx.instructionsSheetName'];
    expect(tab.length).toBeGreaterThan(0);
    expect(tab.length).toBeLessThanOrEqual(31);
    expect(tab).not.toMatch(/[[\]:*?/\\]/);
  });

  it("quotes this locale's section 00 header in the Instructions", () => {
    const header = `"00 — ${catalog['section.00.title'].toUpperCase()}"`;
    expect(catalog['xlsx.instructions']).toContain(header);
    expect(catalog['xlsx.instructions']).toContain('{sectionCount}');
  });
});
