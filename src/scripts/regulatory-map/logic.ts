/**
 * Regulatory Map — the page script's DOM-free logic (ADR-0042).
 *
 * The map, panel, search and timeline wiring share state created after the
 * page's top-level data fetch, so they stay together in `index.ts`. What lives
 * here takes only data: the client search index and its matching, the
 * category filter over the region map, the timeline ordering, and the HTML
 * for regulation cards, search-result rows and timeline entries. Unit-tested by `tests/unit/regulatory-map-logic.test.ts`.
 *
 * Words come from the `regulatory-map` catalog through `s()`, and region
 * names through `regionName` (BL-153 Tier B). With no island — the English
 * page, and jsdom tests — both fall back to English, so English output is
 * unchanged. Dates and counts follow `pageLang()` unless a caller passes `lang`.
 */
import type { Regulation } from '../../types/regulatory-map';
import { escapeHtml } from '../../utils/escape-html';
import { REGULATION_CATEGORY_CSS } from '../../utils/regulation-categories';
import { buildRegulationSearchText } from '../../utils/regulation-search-text';
import { alpha3ToName } from '../../utils/countryCodeMap';
import { stateCodeToName } from '../../utils/fipsToStateCode';
import { provinceCodeToName } from '../../utils/canadianProvinceMap';
import { formatDate, pluralKey } from '../../i18n/formatters';
import { pageLang } from '../tool-strings';
import { hasString, s, sHtml } from './strings';

/**
 * A region's English name: a US state, a Canadian province, or a country by
 * alpha-3 code. Analytics reports this one, whatever the page language.
 */
export function regionNameEn(code: string): string | undefined {
  return stateCodeToName[code] ?? provinceCodeToName[code] ?? alpha3ToName[code];
}

/**
 * A region's name in the page language: `region.<code>` from the island
 * (the `regulatory-map-geo` namespace), else the English name.
 */
export function regionName(code: string): string | undefined {
  const key = `region.${code}`;
  return hasString(key) ? s(key) : regionNameEn(code);
}

/** Lowercase with accents removed, so `protecao` finds `Proteção`. */
export function foldForSearch(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

/**
 * One row of `/data/reg-index.json` (prerendered by
 * `src/pages/data/reg-index.json.ts`), fetched at runtime. Mirrors
 * `RegulationIndexEntry` in `src/utils/fetchRegulations.ts` — add fields to
 * both. Declared here rather than imported because that module reaches
 * `astro:content` and must stay out of the browser bundle.
 */
export interface RegIndexEntry {
  id: string;
  name: string;
  /** The English name, on a translated index only: search and analytics read it. */
  nameEn?: string;
  aliases?: string[];
  effectiveDate: string;
  status?: 'not-in-force';
  category: string;
  regions: string[];
}

export interface SearchableReg {
  reg: RegIndexEntry;
  searchText: string;
}

/**
 * A translated index also searches the English name, so "GDPR" or "Consumer
 * Privacy Act" finds a regulation on any page. Accents are folded on both sides.
 */
export function buildSearchIndex(regs: readonly RegIndexEntry[]): SearchableReg[] {
  return regs.map((reg) => {
    let text = buildRegulationSearchText(reg);
    if (reg.nameEn) text += ' ' + buildRegulationSearchText({ name: reg.nameEn });
    return { reg, searchText: foldForSearch(text) };
  });
}

/**
 * Every whitespace-separated term must appear in a regulation's search text
 * (raw substring, accents folded, no ranking), within the active category
 * unless it is 'all'.
 */
export function searchRegulations(
  index: readonly SearchableReg[],
  query: string,
  activeCategory: string
): RegIndexEntry[] {
  if (!query.trim()) return [];
  const terms = foldForSearch(query).split(/\s+/).filter(Boolean);
  return index
    .filter(({ searchText, reg }) => {
      if (activeCategory !== 'all' && reg.category !== activeCategory) return false;
      return terms.every((term) => searchText.includes(term));
    })
    .map(({ reg }) => reg);
}

/** The region → regulation-ids map narrowed to one category; regions left empty drop out. */
export function filterRegionMap(
  regionMap: Record<string, string[]>,
  regById: Record<string, RegIndexEntry>,
  activeCategory: string
): Record<string, string[]> {
  if (activeCategory === 'all') return regionMap;
  const filtered: Record<string, string[]> = {};
  for (const [code, ids] of Object.entries(regionMap)) {
    const matching = ids.filter((id) => regById[id]?.category === activeCategory);
    if (matching.length > 0) filtered[code] = matching;
  }
  return filtered;
}

/** Oldest effective date first, without mutating the input. */
export function sortByEffectiveDate(regs: readonly RegIndexEntry[]): RegIndexEntry[] {
  return [...regs].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
}

export function renderRegulationCard(reg: Regulation, lang: string = pageLang()): string {
  // The data stores bare YYYY-MM-DD, which parses as UTC midnight. Formatting
  // in the visitor's zone put every date a day early west of UTC.
  const date = formatDate(new Date(reg.effectiveDate), lang, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });

  let html = `
          <div class="brutal-reg-card">
              <h3 class="brutal-reg-card__name">${escapeHtml(reg.name)}</h3>
              <p class="brutal-reg-card__date">${
                reg.status === 'not-in-force'
                  ? sHtml('js.card.enacted', { date })
                  : sHtml('js.card.effective', { date })
              }</p>
              <p class="brutal-reg-card__summary">${escapeHtml(reg.summary)}</p>`;

  if (reg.scope) {
    html += `<p class="brutal-reg-card__scope">${sHtml('js.card.scope', { scope: reg.scope })}</p>`;
  }

  if (reg.keyRequirements && reg.keyRequirements.length > 0) {
    html += '<ul class="brutal-reg-card__requirements">';
    for (const req of reg.keyRequirements) {
      html += `<li>${escapeHtml(req)}</li>`;
    }
    html += '</ul>';
  }

  if (reg.penalties) {
    html += `<p class="brutal-reg-card__penalties">${sHtml('js.card.penalties', { penalties: reg.penalties })}</p>`;
  }

  html += '</div>';
  return html;
}

// Widened to string keys: the index's `category` is a plain string, and an
// unknown one falls back below rather than failing to type-check.
const CATEGORY_CSS: Record<string, string> = REGULATION_CATEGORY_CSS;

/** A category's short chip label (`js.category.<id>`); an unknown id shows as itself. */
function categoryShortLabel(category: string): string {
  const key = `js.category.${category}`;
  return hasString(key) ? s(key) : category;
}

/** "N regions", in the page language. */
export function regionCountLabel(n: number, lang: string = pageLang()): string {
  return s(`js.regionCount.${pluralKey(n, lang)}`, { count: n });
}

const SEARCH_RESULT_LIMIT = 15;

/** The search dropdown's rows: the first 15 matches, then an overflow line. */
export function renderSearchResultRows(
  results: readonly RegIndexEntry[],
  lang: string = pageLang()
): string {
  let html = results
    .slice(0, SEARCH_RESULT_LIMIT)
    .map((reg, i) => {
      const catColor = CATEGORY_CSS[reg.category] ?? 'privacy';
      const catLabel = categoryShortLabel(reg.category);
      const regionCount = reg.regions.length;
      return `
              <div class="brutal-search__result"
                   role="option"
                   id="search-result-${i}"
                   data-reg-id="${escapeHtml(reg.id)}"
                   tabindex="-1">
                  <span class="brutal-search__result-name">${escapeHtml(reg.name)}</span>
                  <span class="brutal-search__result-meta">
                      <span class="brutal-search__category brutal-search__category--${catColor}">${escapeHtml(catLabel)}</span>
                      <span class="brutal-search__result-regions">${escapeHtml(regionCountLabel(regionCount, lang))}</span>
                  </span>
              </div>`;
    })
    .join('');

  if (results.length > SEARCH_RESULT_LIMIT) {
    const more = results.length - SEARCH_RESULT_LIMIT;
    html += `<div class="brutal-search__overflow">${sHtml(`js.moreResults.${pluralKey(more, lang)}`, { count: more })}</div>`;
  }
  return html;
}

// Entries carry no aria-label: the accessible name is the visible text (name
// + date), which WCAG 2.5.3 Label in Name requires — a full-name label fails it
// whenever the visible name is truncated. The full name still reaches AT as the
// description, via `title`.
const TIMELINE_NAME_MAX = 35;

/**
 * The timeline's year groups for regulations already in chronological order.
 * An entry dated after `today` (YYYY-MM-DD), or enacted but not yet in force
 * (`status: 'not-in-force'`), is marked upcoming; names over 35
 * characters are cut to 33 plus an ellipsis. The year and month are read from
 * the string and formatted as a UTC date, so no time zone can shift them.
 */
export function renderTimelineGroups(
  regs: readonly RegIndexEntry[],
  today: string,
  lang: string = pageLang()
): string {
  const monthYear = new Intl.DateTimeFormat(lang, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const byYear = new Map<number, RegIndexEntry[]>();
  for (const reg of regs) {
    const year = parseInt(reg.effectiveDate.slice(0, 4));
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push(reg);
  }

  let html = '';
  for (const [year, group] of byYear) {
    html += `<div class="brutal-timeline-year-group">`;
    html += `<span class="brutal-timeline-year">${year}</span>`;
    html += `<div class="brutal-timeline-year-entries">`;
    for (const reg of group) {
      // An enacted law with no commencement date is upcoming however old its enactment date.
      const isUpcoming = reg.status === 'not-in-force' || reg.effectiveDate > today;
      const catClass = CATEGORY_CSS[reg.category] ?? 'privacy';
      const [y, m] = reg.effectiveDate.split('-');
      const shortDate = escapeHtml(
        monthYear.format(new Date(Date.UTC(parseInt(y, 10), parseInt(m, 10) - 1, 1)))
      );
      const truncName =
        reg.name.length > TIMELINE_NAME_MAX
          ? reg.name.slice(0, TIMELINE_NAME_MAX - 2) + '\u2026'
          : reg.name;
      html += `
                  <button type="button" class="brutal-timeline-entry brutal-timeline-entry--${catClass}${isUpcoming ? ' brutal-timeline-entry--upcoming' : ''}"
                       data-reg-id="${escapeHtml(reg.id)}"
                       aria-pressed="false"
                       title="${escapeHtml(reg.name)} \u2014 ${shortDate}">
                      <span class="brutal-timeline-dot brutal-timeline-dot--${catClass}${isUpcoming ? ' brutal-timeline-dot--upcoming' : ''}"></span>
                      <span class="brutal-timeline-entry__name">${escapeHtml(truncName)}</span>
                      <span class="brutal-timeline-entry__date">${shortDate}</span>
                  </button>`;
    }
    html += `</div></div>`;
  }
  return html;
}
