/**
 * Radar category vocabulary — the single source for the four `/hub/radar`
 * categories and their display labels.
 *
 * A zero-import leaf on purpose: the website (`radar-url.ts`,
 * `lib/inoreader/transform.ts`) and the MCP server (`content/radar-transform.ts`,
 * `resources/radar.ts`, the radar tool and prompt descriptions) all import it,
 * so it must stay free of Zod, `node:*` and any display code. Adding a category
 * here changes the MCP wire surface (every description that enumerates the
 * list is interpolated from `RADAR_CATEGORIES`), so it ships with a server
 * version bump.
 */

export const RADAR_CATEGORIES = ['pe-ma', 'enterprise-tech', 'ai-automation', 'security'] as const;

export type RadarCategoryId = (typeof RADAR_CATEGORIES)[number];

export const RADAR_CATEGORY_LABELS: Readonly<Record<RadarCategoryId, string>> = {
  'pe-ma': 'PE & M&A',
  'enterprise-tech': 'Enterprise Tech',
  'ai-automation': 'AI & Automation',
  security: 'Security',
};
