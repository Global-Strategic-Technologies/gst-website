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
import { irlRequestKey } from '../../utils/irl/customize-article';
import type { IRLArticle } from '../../utils/irl/types';

/** A translation for `key`, or undefined when the page carries none. */
export type StringLookup = (key: string) => string | undefined;

export function localizeIrlArticle(article: IRLArticle, lookup: StringLookup): IRLArticle {
  return {
    ...article,
    intro: lookup('article.intro') ?? article.intro,
    sections: article.sections.map((section) => ({
      ...section,
      title: lookup(`section.${section.number}.title`) ?? section.title,
      bullets: section.bullets.map((bullet, i) => ({
        ...bullet,
        text: lookup(`req.${irlRequestKey(section.number, bullet, i + 1)}`) ?? bullet.text,
      })),
    })),
  };
}

export function localizedXlsxLabels(lookup: StringLookup): IRLXlsxLabels {
  const en = IRL_XLSX_LABELS_EN;
  const pick = (key: string, fallback: string) => lookup(`xlsx.${key}`) ?? fallback;
  const [h1, h2, h3, h4, h5, h6, h7] = en.columnHeaders;
  const instructions = lookup('xlsx.instructions');
  return {
    columnHeaders: [
      pick('header.1', h1),
      pick('header.2', h2),
      pick('header.3', h3),
      pick('header.4', h4),
      pick('header.5', h5),
      pick('header.6', h6),
      pick('header.7', h7),
    ],
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
