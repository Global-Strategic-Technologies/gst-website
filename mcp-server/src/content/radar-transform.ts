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
  /**
   * Source feed's homepage URL — populated when Inoreader provides
   * `item.origin.htmlUrl`. Optional because it's not always present and
   * existing offline-tool consumers don't require it. Added in BL-032.8
   * Phase 4 so the website's `/hub/radar` SSR can render the source name
   * as a clickable link.
   */
  readonly sourceUrl?: string;
  readonly category: RadarCategory | null;
  readonly publishedAt: string;
  /**
   * Timestamp of the most-recent annotation (FYI items only). Optional —
   * unset for Wire items and for FYI items lacking annotations. Added in
   * BL-032.8 Phase 4 so the website's chronological merge can sort FYI
   * items by annotation date rather than publication date.
   */
  readonly annotatedAt?: string;
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
 * Age in whole days of the OLDEST item in a result set, computed from
 * `publishedAt`. Returns `null` when the input is empty (distinguishes
 * "no items" from "items dated today") and when no item has a parseable
 * timestamp (defensive — Inoreader items are expected to always carry a
 * published date, but the helper degrades gracefully rather than throw).
 *
 * Surfaced on radar tool payloads (BL-031.95 / BL-032.75 follow-up) so an
 * agent / operator can immediately see whether a returned feed is fresh
 * or stale without scanning every item's date. Useful for:
 *
 *   - the website's `/hub/radar` SSR badge ("oldest item: 3 days ago")
 *   - MCP tool callers deciding whether to re-fetch
 *   - Sentry alert rules in BL-032.75 Phase 3 (alert when oldest > 14d)
 *
 * Days are floor-divided rolling 24h buckets, not UTC midnight buckets —
 * an item published 23 hours ago is 0 days old, not 1. This matches
 * common "N days ago" colloquial usage.
 *
 * Pure: no clock side-effects beyond `Date.now()`; pass `now` to make
 * tests deterministic.
 */
export function oldestItemDaysAgo(
  items: ReadonlyArray<{ readonly publishedAt: string }>,
  now: number = Date.now()
): number | null {
  if (items.length === 0) return null;
  let oldestMs: number | null = null;
  for (const item of items) {
    const ms = Date.parse(item.publishedAt);
    if (!Number.isFinite(ms)) continue;
    if (oldestMs === null || ms < oldestMs) oldestMs = ms;
  }
  if (oldestMs === null) return null;
  return Math.max(0, Math.floor((now - oldestMs) / 86_400_000));
}

/**
 * Curated-item freshness caps (BL — Radar FYI time-limited pinning).
 *
 * FYI ("curated") items are Inoreader-annotated articles. Historically they
 * had NO time-based expiry: an item stayed visible until 30 *newer*
 * annotations pushed it out of the fetch window, so a curated take could
 * float in the feed for months. These constants bound that: a curated item
 * ages out `FYI_MAX_AGE_DAYS` after its annotation, and at most
 * `FYI_MAX_COUNT` FYI items ever render. Applied via `filterFreshFyi` in
 * `readFyiLive` (every live Worker consumer routes through it). The offline
 * snapshot tier is intentionally exempt — see `radar-snapshot.ts`.
 */
export const FYI_MAX_AGE_DAYS = 30;
export const FYI_MAX_COUNT = 15;

/**
 * Curated (FYI) freshness gate. Age is measured from `annotatedAt` (fallback
 * `publishedAt`) — the product rule is "expire 30 days after *annotation*",
 * not publication. Drops items older than `maxAgeDays` OR carrying an
 * unparseable date (a retention filter must not leak items it cannot prove
 * are fresh — the opposite defensiveness from `oldestItemDaysAgo`, which
 * skips malformed dates when *measuring* age), then keeps the newest
 * `maxCount` by annotation date.
 *
 * Boundary compares milliseconds directly (`now - ts <= maxAgeMs`): an item
 * annotated exactly `maxAgeDays` ago is kept; `maxAgeDays` + 1ms is dropped.
 * Future-dated annotations pass (negative age) and sort first, matching the
 * future-clamp philosophy in `oldestItemDaysAgo`.
 *
 * Pure: pass `now` to make tests deterministic.
 */
export function filterFreshFyi(
  items: readonly SnapshotItem[],
  opts: { maxAgeDays: number; maxCount: number } = {
    maxAgeDays: FYI_MAX_AGE_DAYS,
    maxCount: FYI_MAX_COUNT,
  },
  now: number = Date.now()
): SnapshotItem[] {
  const maxAgeMs = opts.maxAgeDays * 86_400_000;
  const keyMs = (it: SnapshotItem): number => Date.parse(it.annotatedAt ?? it.publishedAt);
  return items
    .filter((it) => {
      const ts = keyMs(it);
      if (!Number.isFinite(ts)) return false; // drop undate-able curated items
      return now - ts <= maxAgeMs;
    })
    .slice()
    .sort((a, b) => keyMs(b) - keyMs(a)) // newest-first BY annotation date
    .slice(0, opts.maxCount);
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
  // For FYI items, take the most-recent annotation's `added_on` timestamp.
  // Pre-Phase-4 the website used this as the chronological-merge sort key;
  // surfacing it here preserves that ordering when the website becomes a
  // downstream consumer.
  const latestAnnotation =
    tier === 'fyi' && item.annotations && item.annotations.length > 0
      ? item.annotations.reduce((latest, a) => (a.added_on > latest.added_on ? a : latest))
      : undefined;
  return {
    id: item.id,
    title: item.title,
    url,
    source: item.origin.title,
    sourceUrl: item.origin.htmlUrl || undefined,
    category: categorizeItem(item),
    publishedAt: toIsoDate(item.published),
    annotatedAt: latestAnnotation ? toIsoDate(latestAnnotation.added_on) : undefined,
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
