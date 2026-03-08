import { z } from 'zod';
import type { Regulation } from '../types/regulatory-map';

const RegulationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  regions: z.array(
    z.string().regex(/^[A-Z]{3}$|^US-[A-Z]{2}$|^CA-[A-Z]{2}$/, 'Must be ISO 3166-1 alpha-3, US state (US-XX), or CA province (CA-XX)')
  ).min(1),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  summary: z.string().min(1),
  category: z.enum(['data-privacy', 'ai-governance', 'industry-compliance', 'cybersecurity']),
  scope: z.string().min(1).optional(),
  keyRequirements: z.array(z.string()).optional(),
  penalties: z.string().optional(),
});

/**
 * Loads and validates all regulatory JSON files at build time.
 * Called in Astro frontmatter to produce static data for the page.
 */
export async function fetchAllRegulations(): Promise<Regulation[]> {
  const modules = import.meta.glob<{ default: unknown }>('../data/regulatory-map/*.json', {
    eager: true,
  });

  const regulations: Regulation[] = [];

  for (const path in modules) {
    const raw = modules[path].default ?? modules[path];

    try {
      regulations.push(RegulationSchema.parse(raw));
    } catch (error) {
      console.error(`[Build Error] Invalid regulatory data in: ${path}`);
      console.error(error);
      throw new Error(`Invalid regulatory data in ${path}`);
    }
  }

  return regulations;
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
