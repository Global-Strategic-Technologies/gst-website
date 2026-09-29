/**
 * Regulatory Map — the page script's DOM-free logic (ADR-0042).
 *
 * The map, panel, search and timeline wiring share state created after the
 * page's top-level data fetch, so they stay together in `index.ts`. What lives
 * here takes only data: the client search index and its matching, the
 * category filter over the region map, the timeline ordering, and the
 * regulation-card HTML. Unit-tested by `tests/unit/regulatory-map-logic.test.ts`.
 */
import type { Regulation } from '../../types/regulatory-map';
import { escapeHtml } from '../../utils/escape-html';
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
  const date = new Date(reg.effectiveDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
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
