/**
 * BL-109 — the shared radar wire bound.
 *
 * This function is the mirror between `/hub/radar` and the MCP `search_radar` tool. It
 * was inline in `RadarFeed.astro` with **zero** test coverage, while the tool applied no
 * bound at all — which is how `search_radar` came to return ~46 wire items where the
 * page renders 30, and to blow a client's tool-result ceiling.
 *
 * Every fixture here is deliberately **larger than `MAX_WIRE`**. The existing radar
 * suites use 2-5 item fixtures, which is why the missing bound was invisible to them.
 */
import { describe, it, expect } from 'vitest';
import {
  boundWireItems,
  MAX_WIRE,
  MIN_PER_CATEGORY,
  type BoundableWireItem,
} from '../../src/utils/radar-feed-bounds';

const CATEGORIES = ['pe-ma', 'enterprise-tech', 'ai-automation', 'security'] as const;

/** Newest first: item 0 is the most recent. */
function makeItems(
  count: number,
  categoryAt: (i: number) => string | null = (i) => CATEGORIES[i % CATEGORIES.length]
): BoundableWireItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    category: categoryAt(i),
    publishedAt: new Date(Date.UTC(2026, 0, 1) - i * 3_600_000).toISOString(),
  }));
}

describe('boundWireItems', () => {
  it('caps the result at MAX_WIRE', () => {
    expect(boundWireItems(makeItems(60), CATEGORIES)).toHaveLength(MAX_WIRE);
  });

  it('returns everything when the input is already under the cap', () => {
    const items = makeItems(12);
    expect(boundWireItems(items, CATEGORIES)).toHaveLength(12);
  });

  it('guarantees MIN_PER_CATEGORY for a category whose items are all old', () => {
    // `security` items are the OLDEST in the feed, so a purely chronological cut would
    // drop them entirely. This quota is the reason the two-pass pick exists — and the
    // reason the bound must be applied before any category filter.
    const items: BoundableWireItem[] = [
      ...makeItems(50, () => 'pe-ma'),
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `sec-${i}`,
        category: 'security',
        publishedAt: new Date(Date.UTC(2020, 0, 1) - i * 3_600_000).toISOString(),
      })),
    ];

    const bounded = boundWireItems(items, CATEGORIES);

    expect(bounded).toHaveLength(MAX_WIRE);
    expect(bounded.filter((i) => i.category === 'security')).toHaveLength(MIN_PER_CATEGORY);
  });

  it('returns chronological order even though pass 1 emits in category order', () => {
    const bounded = boundWireItems(makeItems(60), CATEGORIES);
    const dates = bounded.map((i) => new Date(i.publishedAt).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });

  it('sorts defensively — unsorted input yields the same set as sorted input', () => {
    // The live path pre-sorts; the offline snapshot path does not. The two-pass pick is
    // order-sensitive, so the function sorts on entry rather than inheriting an unstated
    // precondition from one of its two callers.
    const sorted = makeItems(60);
    const shuffled = [...sorted].reverse();

    const fromSorted = boundWireItems(sorted, CATEGORIES).map((i) => i.id);
    const fromShuffled = boundWireItems(shuffled, CATEGORIES).map((i) => i.id);

    expect(fromShuffled).toEqual(fromSorted);
  });

  it('does not mutate its input', () => {
    const items = makeItems(40);
    const before = items.map((i) => i.id);
    boundWireItems(items, CATEGORIES);
    expect(items.map((i) => i.id)).toEqual(before);
  });

  it('tolerates null categories (uncategorised items fill chronologically)', () => {
    const items = makeItems(40, () => null);
    const bounded = boundWireItems(items, CATEGORIES);
    expect(bounded).toHaveLength(MAX_WIRE);
    expect(bounded.every((i) => i.category === null)).toBe(true);
  });

  it('is generic over any item carrying id/category/publishedAt', () => {
    // The website passes RadarWireItem, the server passes SnapshotItem. Extra fields
    // must survive untouched — the tool relies on that to keep `summary`/`annotation`.
    const items = makeItems(40).map((i) => ({ ...i, extra: `payload-${i.id}` }));
    const bounded = boundWireItems(items, CATEGORIES);
    expect(bounded[0].extra).toBe(`payload-${bounded[0].id}`);
  });
});
