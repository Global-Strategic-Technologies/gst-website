/**
 * Pure transform helpers — Inoreader API shape → MCP-radar shape (BL-032 Phase 4c).
 *
 * **Why this file exists**: `radar-snapshot.ts` has top-level `node:fs` /
 * `node:crypto` imports for snapshot reading (offline tool). The Worker
 * code path can't import that file without pulling Node deps into the
 * Worker bundle. Extracting the pure transform logic here lets both the
 * offline reader (`radar-snapshot.ts`) and the live-store
 * (`radar-live-store.ts`) share it — single source of truth for the
 * `InoreaderItem → SnapshotItem` mapping.
 *
 * Pure functions only — no `node:*`, no fetches, no module-level state.
 * Workers-compatible.
 */

import type { InoreaderItem } from '../../../src/lib/inoreader/types';

export type RadarCategory = 'pe-ma' | 'enterprise-tech' | 'ai-automation' | 'security';

export const FOLDER_TO_CATEGORY: Readonly<Record<string, RadarCategory>> = {
  'GST-PE-MA': 'pe-ma',
  'GST-Enterprise-Tech': 'enterprise-tech',
  'GST-AI-Automation': 'ai-automation',
  'GST-Security': 'security',
};

export const RADAR_CATEGORIES: ReadonlyArray<RadarCategory> = [
  'pe-ma',
  'enterprise-tech',
  'ai-automation',
  'security',
];

export interface SnapshotItem {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly source: string;
  readonly category: RadarCategory | null;
  readonly publishedAt: string;
  readonly summary?: string;
  /** Present only for FYI items (annotated). */
  readonly annotation?: { highlightedText?: string; gstTake?: string };
}

export interface SnapshotTier {
  readonly tier: 'fyi' | 'wire';
  readonly items: readonly SnapshotItem[];
  readonly lastSeededAt: string;
}

/** Categorize an Inoreader item by matching its category labels against GST folder names. */
export function categorizeItem(item: InoreaderItem): RadarCategory | null {
  for (const cat of item.categories ?? []) {
    const folder = cat.split('/').pop();
    if (folder && FOLDER_TO_CATEGORY[folder]) {
      return FOLDER_TO_CATEGORY[folder];
    }
  }
  return null;
}

/** Inoreader publishes Unix-seconds timestamps; SnapshotItem uses ISO 8601 strings. */
export function toIsoDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

/**
 * Transform an Inoreader API item into the SnapshotItem shape both the
 * offline tool and the live tools return. The `tier` parameter is the
 * caller's signal of which feed produced this item — FYI items carry
 * annotations (highlight + GST Take); Wire items don't.
 */
export function toSnapshotItem(item: InoreaderItem, tier: 'fyi' | 'wire'): SnapshotItem {
  const url = item.canonical?.[0]?.href ?? item.alternate?.[0]?.href ?? '';
  const annotation = item.annotations?.[0];
  return {
    id: item.id,
    title: item.title,
    url,
    source: item.origin.title,
    category: categorizeItem(item),
    publishedAt: toIsoDate(item.published),
    summary: item.summary?.content,
    annotation:
      tier === 'fyi' && annotation
        ? {
            highlightedText: annotation.text || undefined,
            gstTake: annotation.note || undefined,
          }
        : undefined,
  };
}
