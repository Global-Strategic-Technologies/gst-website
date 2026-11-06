/**
 * The portfolio's fixed labels in a page locale (BL-153 Tier B).
 *
 * `projects.json` stays English: the MCP server returns it verbatim, and the
 * filter engine, URL params and analytics all read the English values. A page
 * shows those values translated at render by key. Each `theme.*`, `stage.*`,
 * `category.*` and `type.*` value in the English `ma-portfolio` catalog equals
 * the data value exactly, so the English catalog is the value-to-key map.
 * `tests/unit/portfolio-labels.test.ts` pins the two together.
 *
 * Server-only, because `t.ts` must stay out of the client bundle: import this
 * from `.astro` frontmatter, never from a `<script>`.
 */
import type { Locale } from '../i18n/locales';
import { EN, useTranslations } from '../i18n/t';

export const LABEL_KINDS = ['theme', 'stage', 'category', 'type'] as const;
export type LabelKind = (typeof LABEL_KINDS)[number];

const ENGLISH: Record<string, string> = EN['ma-portfolio'];

/** Every `[key, English value]` of one kind, in catalog order. */
export function labelEntries(kind: LabelKind): [string, string][] {
  return Object.entries(ENGLISH).filter(([key]) => key.startsWith(`${kind}.`));
}

/**
 * A function from an English data value to its label in `locale`. An absent
 * value gives an empty string, because `engagementType` and `engagementCategory`
 * are optional in the schema. A value with no catalog entry throws, failing the
 * build rather than showing a blank or an untranslated label.
 */
export function portfolioLabeler(locale: Locale) {
  const { t } = useTranslations(locale, 'ma-portfolio');
  return (kind: LabelKind, value: string | undefined | null): string => {
    if (!value) return '';
    const entry = labelEntries(kind).find(([, english]) => english === value);
    if (!entry) throw new Error(`i18n: no ma-portfolio label for ${kind} "${value}"`);
    return (t as (key: string) => string)(entry[0]);
  };
}

/** The label maps the project modal's inline script reads, keyed by English value. */
export function portfolioLabelIsland(locale: Locale): Record<string, Record<string, string>> {
  const label = portfolioLabeler(locale);
  return Object.fromEntries(
    LABEL_KINDS.map((kind) => [
      kind,
      Object.fromEntries(labelEntries(kind).map(([, value]) => [value, label(kind, value)])),
    ])
  );
}
