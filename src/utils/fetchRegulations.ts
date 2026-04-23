import type { Regulation } from '../types/regulatory-map';

/** Lightweight regulation entry for the inline index (no summary/scope/penalties). */
export interface RegulationIndexEntry {
  id: string;
  name: string;
  effectiveDate: string;
  category: string;
  regions: string[];
}

/** Shape of the inline regulation index embedded in the page HTML. */
export interface RegulationIndex {
  /** Region code → array of regulation IDs that apply to that region. */
  regions: Record<string, string[]>;
  /** Deduplicated list of lightweight regulation entries (for timeline, search, map coloring). */
  regs: RegulationIndexEntry[];
}

/**
 * Loads and validates all regulatory JSON files via Astro content collections.
 * Schema validation happens at build time via the collection definition in
 * content.config.ts. Called from the regulations.json.ts API endpoint.
 *
 * Uses dynamic import for astro:content so this module can also be imported
 * in vitest (which only uses getRegulationsByRegion, not this function).
 */
export async function fetchAllRegulations(): Promise<Regulation[]> {
  const { getCollection } = await import('astro:content');
  const entries = await getCollection('regulatory-map');
  return entries.map((entry) => entry.data as Regulation);
}

/**
 * Builds a lookup map from region code to its applicable regulations.
 * Accepts both ISO 3166-1 alpha-3 country codes and ISO 3166-2 US state codes.
 * A single region may have multiple regulations (e.g., an EU member state has GDPR).
 */
export function getRegulationsByRegion(regulations: Regulation[]): Record<string, Regulation[]> {
  const map: Record<string, Regulation[]> = {};

  for (const reg of regulations) {
    for (const code of reg.regions) {
      if (!map[code]) {
        map[code] = [];
      }
      map[code].push(reg);
    }
  }

  return map;
}

/**
 * Builds a lightweight index for the regulatory map page.
 * Contains only the fields needed for map coloring, timeline rendering,
 * and search — full regulation details are fetched on demand per click.
 */
export function buildRegulationIndex(regulations: Regulation[]): RegulationIndex {
  const regions: Record<string, string[]> = {};
  const regs: RegulationIndexEntry[] = regulations.map((r) => ({
    id: r.id,
    name: r.name,
    effectiveDate: r.effectiveDate,
    category: r.category,
    regions: r.regions,
  }));

  for (const reg of regulations) {
    for (const code of reg.regions) {
      (regions[code] ??= []).push(reg.id);
    }
  }

  return { regions, regs };
}
