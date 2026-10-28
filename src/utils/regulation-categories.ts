/**
 * Regulatory Map category vocabulary — the single source for the four
 * regulation category ids and their CSS modifiers. Their display words live
 * in the `regulatory-map` catalog (`category.<id>`, `js.category.<id>`), so
 * every page language labels them (BL-153).
 *
 * A zero-import leaf on purpose (no Zod): `regulatory-map-url.ts` and the
 * `/hub/tools/regulatory-map/` page bundle import it, and must not pull Zod
 * into the client. `src/schemas/regulatory-map.ts` builds the Zod enum from it
 * and re-exports it for the MCP server, whose descriptions interpolate the
 * list — so adding a category here changes the MCP wire surface and ships with
 * a server version bump.
 */

export const REGULATION_CATEGORY_VALUES = [
  'data-privacy',
  'ai-governance',
  'industry-compliance',
  'cybersecurity',
] as const;

export type RegulationCategoryId = (typeof REGULATION_CATEGORY_VALUES)[number];

/**
 * CSS modifier per category — the `--<modifier>` suffix on the page's
 * category classes (e.g. `brutal-search__category--privacy`).
 */
export const REGULATION_CATEGORY_CSS: Readonly<Record<RegulationCategoryId, string>> = {
  'data-privacy': 'privacy',
  'ai-governance': 'ai',
  'industry-compliance': 'industry',
  cybersecurity: 'cyber',
};
