/**
 * Regulatory Map — the page script's DOM-free logic (ADR-0042).
 *
 * The map, panel, search and timeline wiring share state created after the
 * page's top-level data fetch, so they stay together in `index.ts`. What lives
 * here takes only data: the client search index and its matching, the
 * category filter over the region map, the timeline ordering, and the HTML
 * for regulation cards, search-result rows and timeline entries. Unit-tested by `tests/unit/regulatory-map-logic.test.ts`.
 */
import type { Regulation } from '../../types/regulatory-map';
import { escapeHtml } from '../../utils/escape-html';
import {
  REGULATION_CATEGORY_CSS,
  REGULATION_CATEGORY_SHORT_LABELS,
} from '../../utils/regulation-categories';
import { buildRegulationSearchText } from '../../utils/regulation-search-text';

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
  aliases?: string[];
  effectiveDate: string;
  category: string;
  regions: string[];
}

export interface SearchableReg {
  reg: RegIndexEntry;
  searchText: string;
}

export function buildSearchIndex(regs: readonly RegIndexEntry[]): SearchableReg[] {
  return regs.map((reg) => ({ reg, searchText: buildRegulationSearchText(reg) }));
}

/**
 * Every whitespace-separated term must appear in a regulation's search text
 * (raw substring, no ranking), within the active category unless it is 'all'.
 */
export function searchRegulations(
  index: readonly SearchableReg[],
  query: string,
  activeCategory: string
): RegIndexEntry[] {
  if (!query.trim()) return [];
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
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

export function renderRegulationCard(reg: Regulation): string {
  // The data stores bare YYYY-MM-DD, which parses as UTC midnight. Formatting
  // in the visitor's zone put every date a day early west of UTC.
  const date = new Date(reg.effectiveDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });

  let html = `
          <div class="brutal-reg-card">
              <h3 class="brutal-reg-card__name">${escapeHtml(reg.name)}</h3>
              <p class="brutal-reg-card__date">Effective: ${escapeHtml(date)}</p>
              <p class="brutal-reg-card__summary">${escapeHtml(reg.summary)}</p>`;

  if (reg.scope) {
    html += `<p class="brutal-reg-card__scope">Applies to: ${escapeHtml(reg.scope)}</p>`;
  }

  if (reg.keyRequirements && reg.keyRequirements.length > 0) {
    html += '<ul class="brutal-reg-card__requirements">';
    for (const req of reg.keyRequirements) {
      html += `<li>${escapeHtml(req)}</li>`;
    }
    html += '</ul>';
  }

  if (reg.penalties) {
    html += `<p class="brutal-reg-card__penalties">Penalties: ${escapeHtml(reg.penalties)}</p>`;
  }

  html += '</div>';
  return html;
}

// Widened to string keys: the index's `category` is a plain string, and an
// unknown one falls back below rather than failing to type-check.
const CATEGORY_CSS: Record<string, string> = REGULATION_CATEGORY_CSS;
const CATEGORY_LABELS: Record<string, string> = REGULATION_CATEGORY_SHORT_LABELS;

const SEARCH_RESULT_LIMIT = 15;

/** The search dropdown's rows: the first 15 matches, then an overflow line. */
export function renderSearchResultRows(results: readonly RegIndexEntry[]): string {
  let html = results
    .slice(0, SEARCH_RESULT_LIMIT)
    .map((reg, i) => {
      const catColor = CATEGORY_CSS[reg.category] ?? 'privacy';
      const catLabel = CATEGORY_LABELS[reg.category] ?? reg.category;
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
                      <span class="brutal-search__result-regions">${regionCount} region${regionCount !== 1 ? 's' : ''}</span>
                  </span>
              </div>`;
    })
    .join('');

  if (results.length > SEARCH_RESULT_LIMIT) {
    html += `<div class="brutal-search__overflow">${results.length - SEARCH_RESULT_LIMIT} more results\u2026</div>`;
  }
  return html;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TIMELINE_NAME_MAX = 35;

/**
 * The timeline's year groups for regulations already in chronological order.
 * An entry dated after `today` (YYYY-MM-DD) is marked upcoming; names over 35
 * characters are cut to 33 plus an ellipsis. Dates are read from the string,
 * never through `Date`, so no time zone can shift them.
 */
export function renderTimelineGroups(regs: readonly RegIndexEntry[], today: string): string {
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
      const isUpcoming = reg.effectiveDate > today;
      const catClass = CATEGORY_CSS[reg.category] ?? 'privacy';
      const [y, m] = reg.effectiveDate.split('-');
      const shortDate = `${MONTHS[parseInt(m, 10) - 1]} ${y}`;
      const truncName =
        reg.name.length > TIMELINE_NAME_MAX
          ? reg.name.slice(0, TIMELINE_NAME_MAX - 2) + '\u2026'
          : reg.name;
      html += `
                  <button type="button" class="brutal-timeline-entry brutal-timeline-entry--${catClass}${isUpcoming ? ' brutal-timeline-entry--upcoming' : ''}"
                       data-reg-id="${escapeHtml(reg.id)}"
                       aria-pressed="false"
                       aria-label="${escapeHtml(reg.name)}, ${shortDate}"
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
