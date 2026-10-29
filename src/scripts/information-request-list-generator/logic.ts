/**
 * DOM-free helpers for the IRL Generator's localized workbook (BL-153 Tier B).
 *
 * The shared IRL source and the builder's labels stay English (the MCP server
 * returns them verbatim). On an es or pt page the island carries their
 * translations by key from `information-request-list-generator-data`; these
 * helpers swap them in before the article reaches `customizeIrlArticle` and
 * the builder, so a custom request the user typed is never touched. A key the
 * island lacks keeps the English, which is all the English page ever sees.
 */
import { IRL_XLSX_LABELS_EN, type IRLXlsxLabels } from '../../utils/irl/generate-xlsx';
import type { IRLArticle } from '../../utils/irl/types';

/** A translation for `key`, or undefined when the page carries none. */
export type StringLookup = (key: string) => string | undefined;

/** The `NN-II` key of a bullet, as the template and `customizeIrlArticle` build it. */
function requestKey(sectionNumber: string, ordinal: number): string {
  return `${sectionNumber}-${String(ordinal).padStart(2, '0')}`;
}

export function localizeIrlArticle(article: IRLArticle, lookup: StringLookup): IRLArticle {
  return {
    ...article,
    intro: lookup('article.intro') ?? article.intro,
    sections: article.sections.map((section) => ({
      ...section,
      title: lookup(`section.${section.number}.title`) ?? section.title,
      bullets: section.bullets.map((bullet, i) => ({
        ...bullet,
        text: lookup(`req.${requestKey(section.number, bullet.ordinal ?? i + 1)}`) ?? bullet.text,
      })),
    })),
  };
}

export function localizedXlsxLabels(lookup: StringLookup): IRLXlsxLabels {
  const en = IRL_XLSX_LABELS_EN;
  const pick = (key: string, fallback: string) => lookup(`xlsx.${key}`) ?? fallback;
  const headers = en.columnHeaders.map((h, i) => pick(`header.${i + 1}`, h));
  const instructions = lookup('xlsx.instructions');
  return {
    columnHeaders: headers as unknown as IRLXlsxLabels['columnHeaders'],
    instructionsSheetName: pick('instructionsSheetName', en.instructionsSheetName),
    instructionsLines: instructions ? instructions.split('\n') : en.instructionsLines,
    handbackWithTarget: pick('handbackWithTarget', en.handbackWithTarget),
    handbackWithoutTarget: pick('handbackWithoutTarget', en.handbackWithoutTarget),
    statusPromptTitle: pick('statusPromptTitle', en.statusPromptTitle),
    statusPrompt: pick('statusPrompt', en.statusPrompt),
    statusErrorTitle: pick('statusErrorTitle', en.statusErrorTitle),
    statusError: pick('statusError', en.statusError),
  };
}
