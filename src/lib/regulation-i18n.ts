/**
 * The Regulatory Map's data in a page locale (BL-153 Tier B).
 *
 * The regulation files (`src/data/regulatory-map/*.json`) stay English: the
 * MCP server bundles them and returns them verbatim. An es or pt page reads
 * the same records with the prose swapped in from the `regulatory-map-data`
 * catalog by id (`reg.<id>.name|summary|scope|penalties`, `reg.<id>.req.<n>`).
 * The English mirror of that catalog is kept by
 * `scripts/sync-regulatory-map-catalog.mjs` and pinned by
 * `tests/unit/regulatory-map-catalog.test.ts`.
 *
 * One function, `regulationData(locale)`, builds everything a locale serves —
 * the index, every record and the content version — so the template's `?v=`
 * is a hash of exactly what the `/data/` endpoints return. Server-only: it
 * reaches `astro:content` and `node:crypto`.
 */
import { createHash } from 'node:crypto';
import { isDefaultLocale, type Locale } from '../i18n/locales';
import { useTranslations } from '../i18n/t';
import type { Regulation } from '../types/regulatory-map';
import {
  buildRegulationIndex,
  fetchAllRegulations,
  type RegulationIndex,
} from '../utils/fetchRegulations';

/** A record as an es or pt page receives it: translated prose, plus the English name. */
export type LocalizedRegulation = Regulation & { nameEn?: string };

export function localizeRegulation(reg: Regulation, locale: Locale): LocalizedRegulation {
  if (isDefaultLocale(locale)) return reg;
  const { t } = useTranslations(locale, 'regulatory-map-data');
  const tr = (key: string): string => (t as (key: string) => string)(`reg.${reg.id}.${key}`);
  return {
    ...reg,
    name: tr('name'),
    nameEn: reg.name,
    summary: tr('summary'),
    ...(reg.scope ? { scope: tr('scope') } : {}),
    ...(reg.keyRequirements
      ? { keyRequirements: reg.keyRequirements.map((_, i) => tr(`req.${i + 1}`)) }
      : {}),
    ...(reg.penalties ? { penalties: tr('penalties') } : {}),
  };
}

export interface RegulationData {
  index: RegulationIndex;
  regulations: LocalizedRegulation[];
  /** First 8 hex chars of the SHA-256 of everything above, as served. */
  version: string;
}

// One build per locale: the template and 128 endpoints share it. Not under
// `astro dev`, where a catalog edit must reach the endpoints and the `?v=`
// without a server restart.
const cache = new Map<string, Promise<RegulationData>>();

export function regulationData(locale: Locale): Promise<RegulationData> {
  let data = import.meta.env.DEV ? undefined : cache.get(locale.code);
  if (!data) {
    data = build(locale);
    cache.set(locale.code, data);
  }
  return data;
}

async function build(locale: Locale): Promise<RegulationData> {
  const regulations = (await fetchAllRegulations()).map((reg) => localizeRegulation(reg, locale));
  const index = buildRegulationIndex(regulations);
  const hash = createHash('sha256').update(JSON.stringify(index));
  for (const reg of regulations) hash.update(JSON.stringify(reg));
  return { index, regulations, version: hash.digest('hex').slice(0, 8) };
}

/** Where a locale's index and records are served (see `src/pages/data/`). */
export function regulationDataPaths(locale: Locale): { index: string; base: string } {
  return isDefaultLocale(locale)
    ? { index: '/data/reg-index.json', base: '/data/regulations/' }
    : { index: `/data/reg-index/${locale.path}.json`, base: `/data/regulations/${locale.path}/` };
}
