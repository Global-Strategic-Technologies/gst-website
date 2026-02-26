/**
 * Integration Tests for Radar Data Flow
 *
 * Tests the data pipeline from raw Inoreader responses to display-ready models,
 * replicating the category balancing, deduplication, and sorting logic from
 * src/pages/hub/radar/index.astro (lines 52-101).
 *
 * Uses a RadarDataFlowSimulator that mirrors the page's two-pass algorithm,
 * following the WizardNavigationSimulator pattern from
 * tests/integration/diligence-wizard-navigation.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { toFeaturedItem, toStreamItem, CATEGORIES } from '@/lib/inoreader/transform';
import type {
  InoreaderItem,
  InoreaderAnnotation,
  RadarFeaturedItem,
  RadarStreamItem,
} from '@/lib/inoreader/types';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

let itemCounter = 0;

function makeItem(overrides: Partial<InoreaderItem> = {}): InoreaderItem {
  const id = overrides.id ?? `item-${++itemCounter}`;
  return {
    id,
    title: overrides.title ?? `Article ${id}`,
    published: overrides.published ?? 1708000000,
    canonical: overrides.canonical ?? [{ href: `https://example.com/${id}` }],
    alternate: overrides.alternate,
    origin: overrides.origin ?? {
      streamId: 'feed/http://example.com/feed',
      title: 'Example Feed',
      htmlUrl: 'https://example.com',
    },
    summary: overrides.summary ?? { content: '<p>Summary</p>' },
    categories: overrides.categories ?? [],
    annotations: overrides.annotations,
  };
}

function makeAnnotation(overrides: Partial<InoreaderAnnotation> = {}): InoreaderAnnotation {
  return {
    id: 1,
    start: 0,
    end: 100,
    added_on: 1708100000,
    text: 'Highlighted text',
    note: 'GST Take note',
    ...overrides,
  };
}

/**
 * Create N items assigned to a specific category via GST-* folder label.
 * Items are created with descending published timestamps so newest is first.
 */
function makeCategoryItems(
  category: string,
  count: number,
  baseTimestamp: number = 1708000000,
): InoreaderItem[] {
  const folderMap: Record<string, string> = {
    'pe-ma': 'GST-PE-MA',
    'enterprise-tech': 'GST-Enterprise-Tech',
    'ai-automation': 'GST-AI-Automation',
    'security': 'GST-Security',
    'verticals': 'GST-Verticals',
  };
  const folder = folderMap[category] || 'GST-Enterprise-Tech';

  return Array.from({ length: count }, (_, i) =>
    makeItem({
      id: `${category}-${i}`,
      published: baseTimestamp - i * 100,
      categories: [`user/123/label/${folder}`],
      canonical: [{ href: `https://example.com/${category}-${i}` }],
    }),
  );
}

// ---------------------------------------------------------------------------
// RadarDataFlowSimulator
// ---------------------------------------------------------------------------

/**
 * Replicates the data pipeline from index.astro:
 * 1. Transform annotated items → featured
 * 2. Deduplicate stream items (remove URLs in featured)
 * 3. Two-pass category balancing with MIN_PER_CATEGORY and MAX_STREAM cap
 * 4. Final chronological sort
 */
class RadarDataFlowSimulator {
  static readonly MIN_PER_CATEGORY = 3;
  static readonly MAX_STREAM = 30;

  /**
   * Process annotated items into featured display models.
   * Mirrors index.astro lines 42-47.
   */
  processFeatured(annotatedItems: InoreaderItem[]): RadarFeaturedItem[] {
    return annotatedItems
      .map(toFeaturedItem)
      .filter((item): item is RadarFeaturedItem => item !== null);
  }

  /**
   * Process raw stream items into balanced, deduplicated display models.
   * Mirrors index.astro lines 57-97.
   */
  processStream(
    rawItems: InoreaderItem[],
    featured: RadarFeaturedItem[],
  ): RadarStreamItem[] {
    // Dedup: exclude items whose URL already appears in featured
    const featuredUrls = new Set(featured.map(f => f.url));
    const allStreamItems = rawItems
      .filter(item => {
        const url = item.canonical?.[0]?.href || item.alternate?.[0]?.href || '';
        return !featuredUrls.has(url);
      })
      .map(toStreamItem);

    // Two-pass category balancing
    const picked = new Set<string>();
    const result: RadarStreamItem[] = [];

    // Pass 1: guarantee MIN_PER_CATEGORY per category
    const categoryKeys = Object.keys(CATEGORIES);
    for (const cat of categoryKeys) {
      let count = 0;
      for (const item of allStreamItems) {
        if (item.category === cat && count < RadarDataFlowSimulator.MIN_PER_CATEGORY) {
          picked.add(item.id);
          result.push(item);
          count++;
        }
      }
    }

    // Pass 2: fill remaining slots chronologically
    for (const item of allStreamItems) {
      if (result.length >= RadarDataFlowSimulator.MAX_STREAM) break;
      if (!picked.has(item.id)) {
        result.push(item);
      }
    }

    // Final chronological sort
    return result.sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let sim: RadarDataFlowSimulator;

beforeEach(() => {
  itemCounter = 0;
  sim = new RadarDataFlowSimulator();
});

// ---------------------------------------------------------------------------
// Featured Processing
// ---------------------------------------------------------------------------

describe('Featured Processing', () => {
  it('should filter out items without annotations', () => {
    const items = [
      makeItem({ annotations: [makeAnnotation()] }),
      makeItem({ annotations: [] }),
      makeItem({ annotations: undefined }),
    ];
    const featured = sim.processFeatured(items);
    expect(featured).toHaveLength(1);
  });

  it('should transform annotated items into display models', () => {
    const items = [
      makeItem({
        title: 'Featured Article',
        annotations: [makeAnnotation({ note: 'Great insight' })],
      }),
    ];
    const featured = sim.processFeatured(items);
    expect(featured[0].title).toBe('Featured Article');
    expect(featured[0].gstTake).toBe('Great insight');
  });

  it('should preserve all annotated items', () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      makeItem({
        id: `ann-${i}`,
        annotations: [makeAnnotation({ note: `Take ${i}` })],
        canonical: [{ href: `https://example.com/ann-${i}` }],
      }),
    );
    const featured = sim.processFeatured(items);
    expect(featured).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// Stream Deduplication
// ---------------------------------------------------------------------------

describe('Stream Deduplication', () => {
  it('should remove stream items whose URL appears in featured', () => {
    const featured: RadarFeaturedItem[] = [{
      id: 'f1',
      title: 'Featured',
      url: 'https://example.com/shared-url',
      source: 'Feed',
      sourceUrl: '',
      category: 'enterprise-tech',
      publishedAt: new Date().toISOString(),
      annotatedAt: new Date().toISOString(),
      highlightedText: 'text',
      gstTake: 'take',
      summary: 'summary',
    }];

    const rawItems = [
      makeItem({ canonical: [{ href: 'https://example.com/shared-url' }] }),
      makeItem({ canonical: [{ href: 'https://example.com/unique-url' }] }),
    ];

    const stream = sim.processStream(rawItems, featured);
    expect(stream).toHaveLength(1);
    expect(stream[0].url).toBe('https://example.com/unique-url');
  });

  it('should check alternate URL for dedup when canonical is missing', () => {
    const featured: RadarFeaturedItem[] = [{
      id: 'f1',
      title: 'Featured',
      url: 'https://example.com/alt-url',
      source: 'Feed',
      sourceUrl: '',
      category: 'enterprise-tech',
      publishedAt: new Date().toISOString(),
      annotatedAt: new Date().toISOString(),
      highlightedText: 'text',
      gstTake: 'take',
      summary: 'summary',
    }];

    // Build item directly to ensure canonical is truly absent (factory defaults it)
    const rawItems: InoreaderItem[] = [{
      id: 'alt-only',
      title: 'Alt Only Article',
      published: 1708000000,
      alternate: [{ href: 'https://example.com/alt-url', type: 'text/html' }],
      origin: { streamId: 'feed/test', title: 'Feed', htmlUrl: 'https://example.com' },
      summary: { content: 'Summary' },
      categories: [],
    }];

    const stream = sim.processStream(rawItems, featured);
    expect(stream).toHaveLength(0);
  });

  it('should keep all items when featured is empty', () => {
    const rawItems = [makeItem(), makeItem()];
    const stream = sim.processStream(rawItems, []);
    expect(stream).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Category Balancing
// ---------------------------------------------------------------------------

describe('Category Balancing', () => {
  it('should guarantee MIN_PER_CATEGORY (3) items per category', () => {
    // Create 10 items for enterprise-tech and exactly 3 for each other category
    const items = [
      ...makeCategoryItems('enterprise-tech', 10, 1710000000), // newest
      ...makeCategoryItems('pe-ma', 3, 1705000000),
      ...makeCategoryItems('ai-automation', 3, 1704000000),
      ...makeCategoryItems('security', 3, 1703000000),
      ...makeCategoryItems('verticals', 3, 1702000000), // oldest
    ];

    const stream = sim.processStream(items, []);

    // Count items per category
    const counts: Record<string, number> = {};
    for (const item of stream) {
      counts[item.category] = (counts[item.category] || 0) + 1;
    }

    // We supplied exactly 3 for each non-ET category — all 3 must appear
    expect(counts['pe-ma']).toBe(3);
    expect(counts['ai-automation']).toBe(3);
    expect(counts['security']).toBe(3);
    expect(counts['verticals']).toBe(3);
    // ET has 10 available; 3 guaranteed + up to 7 more in pass 2
    expect(counts['enterprise-tech']).toBeGreaterThan(3);
  });

  it('should respect MAX_STREAM (30) cap', () => {
    // Create 50 items
    const items = [
      ...makeCategoryItems('enterprise-tech', 20, 1710000000),
      ...makeCategoryItems('pe-ma', 10, 1709000000),
      ...makeCategoryItems('ai-automation', 10, 1708000000),
      ...makeCategoryItems('security', 5, 1707000000),
      ...makeCategoryItems('verticals', 5, 1706000000),
    ];

    const stream = sim.processStream(items, []);
    expect(stream.length).toBeLessThanOrEqual(30);
  });

  it('should fill remaining slots chronologically after pass 1', () => {
    // 5 categories × 3 = 15 guaranteed, leaves 15 remaining slots
    const items = [
      ...makeCategoryItems('enterprise-tech', 20, 1710000000),
      ...makeCategoryItems('pe-ma', 3, 1705000000),
      ...makeCategoryItems('ai-automation', 3, 1704000000),
      ...makeCategoryItems('security', 3, 1703000000),
      ...makeCategoryItems('verticals', 3, 1702000000),
    ];

    const stream = sim.processStream(items, []);

    // Should have 15 guaranteed + 15 fill = 30 total (capped)
    // enterprise-tech has 20 items but only 3 are guaranteed; the rest fill from its pool
    expect(stream.length).toBeLessThanOrEqual(30);

    // enterprise-tech should have more than MIN_PER_CATEGORY because it fills remaining slots
    const etCount = stream.filter(s => s.category === 'enterprise-tech').length;
    expect(etCount).toBeGreaterThan(3);
  });

  it('should not include duplicate items across pass 1 and pass 2', () => {
    const items = [
      ...makeCategoryItems('enterprise-tech', 10, 1710000000),
      ...makeCategoryItems('pe-ma', 5, 1709000000),
      ...makeCategoryItems('ai-automation', 5, 1708000000),
      ...makeCategoryItems('security', 5, 1707000000),
      ...makeCategoryItems('verticals', 5, 1706000000),
    ];

    const stream = sim.processStream(items, []);
    const ids = stream.map(s => s.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it('should sort final output chronologically (newest first)', () => {
    const items = [
      ...makeCategoryItems('enterprise-tech', 5, 1710000000),
      ...makeCategoryItems('pe-ma', 5, 1709000000),
      ...makeCategoryItems('security', 5, 1708000000),
      ...makeCategoryItems('ai-automation', 5, 1707000000),
      ...makeCategoryItems('verticals', 5, 1706000000),
    ];

    const stream = sim.processStream(items, []);

    for (let i = 1; i < stream.length; i++) {
      const prev = new Date(stream[i - 1].publishedAt).getTime();
      const curr = new Date(stream[i].publishedAt).getTime();
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });

  it('should handle category with fewer than MIN_PER_CATEGORY items gracefully', () => {
    const items = [
      ...makeCategoryItems('enterprise-tech', 10, 1710000000),
      ...makeCategoryItems('pe-ma', 1, 1709000000), // only 1 item
      ...makeCategoryItems('security', 3, 1708000000),
    ];

    const stream = sim.processStream(items, []);

    const pemaCount = stream.filter(s => s.category === 'pe-ma').length;
    expect(pemaCount).toBe(1); // only 1 available
  });

  it('should handle single category dominance', () => {
    // 40 enterprise-tech items, 0 from other categories
    const items = makeCategoryItems('enterprise-tech', 40, 1710000000);

    const stream = sim.processStream(items, []);
    expect(stream.length).toBe(30); // capped at MAX_STREAM
    expect(stream.every(s => s.category === 'enterprise-tech')).toBe(true);
  });

  it('should include verticals even when all other categories have newer items', () => {
    // This is the exact bug scenario that was fixed
    const items = [
      ...makeCategoryItems('enterprise-tech', 15, 1710000000), // newest
      ...makeCategoryItems('ai-automation', 15, 1709000000),
      ...makeCategoryItems('security', 15, 1708000000),
      ...makeCategoryItems('pe-ma', 15, 1707000000),
      ...makeCategoryItems('verticals', 15, 1700000000), // much older
    ];

    const stream = sim.processStream(items, []);

    const verticalsCount = stream.filter(s => s.category === 'verticals').length;
    expect(verticalsCount).toBeGreaterThanOrEqual(3);
  });

  it('should handle exact boundary of 30 items with 5 categories × 6 each', () => {
    const items = [
      ...makeCategoryItems('enterprise-tech', 6, 1710000000),
      ...makeCategoryItems('pe-ma', 6, 1709000000),
      ...makeCategoryItems('ai-automation', 6, 1708000000),
      ...makeCategoryItems('security', 6, 1707000000),
      ...makeCategoryItems('verticals', 6, 1706000000),
    ];

    const stream = sim.processStream(items, []);
    expect(stream.length).toBe(30); // exactly at cap
  });
});

// ---------------------------------------------------------------------------
// Edge Cases
// ---------------------------------------------------------------------------

describe('Edge Cases', () => {
  it('should return empty array when no items provided', () => {
    const stream = sim.processStream([], []);
    expect(stream).toHaveLength(0);
  });

  it('should return empty featured when all items lack annotations', () => {
    const items = [makeItem(), makeItem(), makeItem()];
    const featured = sim.processFeatured(items);
    expect(featured).toHaveLength(0);
  });

  it('should handle combined featured + stream dedup correctly', () => {
    // Item A appears in both annotated and stream feeds
    const sharedUrl = 'https://example.com/shared';

    const annotatedItems = [
      makeItem({
        id: 'annotated-1',
        canonical: [{ href: sharedUrl }],
        annotations: [makeAnnotation()],
      }),
    ];

    const rawStreamItems = [
      makeItem({ id: 'stream-1', canonical: [{ href: sharedUrl }] }),
      makeItem({ id: 'stream-2', canonical: [{ href: 'https://example.com/other' }] }),
    ];

    const featured = sim.processFeatured(annotatedItems);
    const stream = sim.processStream(rawStreamItems, featured);

    expect(featured).toHaveLength(1);
    expect(stream).toHaveLength(1);
    expect(stream[0].url).toBe('https://example.com/other');
  });

  it('should handle items with no URL gracefully in dedup', () => {
    const rawItems = [
      makeItem({ canonical: undefined, alternate: undefined }),
    ];

    // Featured has empty URL too — should not match and remove
    const featured: RadarFeaturedItem[] = [{
      id: 'f1',
      title: 'Featured',
      url: 'https://example.com/some-url',
      source: 'Feed',
      sourceUrl: '',
      category: 'enterprise-tech',
      publishedAt: new Date().toISOString(),
      annotatedAt: new Date().toISOString(),
      highlightedText: 'text',
      gstTake: 'take',
      summary: 'summary',
    }];

    const stream = sim.processStream(rawItems, featured);
    expect(stream).toHaveLength(1);
  });

  it('should handle all items being deduped (stream becomes empty)', () => {
    const sharedUrl = 'https://example.com/same';
    const featured: RadarFeaturedItem[] = [{
      id: 'f1',
      title: 'Featured',
      url: sharedUrl,
      source: 'Feed',
      sourceUrl: '',
      category: 'enterprise-tech',
      publishedAt: new Date().toISOString(),
      annotatedAt: new Date().toISOString(),
      highlightedText: 'text',
      gstTake: 'take',
      summary: 'summary',
    }];

    const rawItems = [
      makeItem({ canonical: [{ href: sharedUrl }] }),
      makeItem({ canonical: [{ href: sharedUrl }] }),
    ];

    const stream = sim.processStream(rawItems, featured);
    expect(stream).toHaveLength(0);
  });

  it('should work with fewer total items than MAX_STREAM', () => {
    const items = [
      ...makeCategoryItems('enterprise-tech', 2, 1710000000),
      ...makeCategoryItems('pe-ma', 2, 1709000000),
    ];

    const stream = sim.processStream(items, []);
    expect(stream).toHaveLength(4);
  });

  it('should preserve category assignment through the full pipeline', () => {
    const items = [
      makeItem({
        id: 'sec-item',
        categories: ['user/123/label/GST-Security'],
        canonical: [{ href: 'https://example.com/security-article' }],
      }),
    ];

    const stream = sim.processStream(items, []);
    expect(stream[0].category).toBe('security');
  });
});

// ---------------------------------------------------------------------------
// Full Pipeline (Featured + Stream together)
// ---------------------------------------------------------------------------

describe('Full Pipeline', () => {
  it('should process a realistic mixed feed correctly', () => {
    // Annotated items (become featured)
    const annotatedItems = Array.from({ length: 5 }, (_, i) =>
      makeItem({
        id: `featured-${i}`,
        title: `Featured Article ${i}`,
        canonical: [{ href: `https://example.com/featured-${i}` }],
        annotations: [makeAnnotation({ note: `Take ${i}` })],
        published: 1710000000 - i * 100,
      }),
    );

    // Stream items (some overlap with featured URLs)
    const streamItems = [
      // Duplicate of featured-0
      makeItem({
        id: 'stream-dup',
        canonical: [{ href: 'https://example.com/featured-0' }],
        published: 1710000000,
        categories: ['user/123/label/GST-Enterprise-Tech'],
      }),
      // Unique items across categories
      ...makeCategoryItems('enterprise-tech', 8, 1709500000),
      ...makeCategoryItems('pe-ma', 6, 1709000000),
      ...makeCategoryItems('ai-automation', 6, 1708500000),
      ...makeCategoryItems('security', 6, 1708000000),
      ...makeCategoryItems('verticals', 6, 1707500000),
    ];

    const featured = sim.processFeatured(annotatedItems);
    const stream = sim.processStream(streamItems, featured);

    // Featured: all 5 annotated items
    expect(featured).toHaveLength(5);

    // Stream: duplicate removed, capped at 30
    expect(stream.length).toBeLessThanOrEqual(30);

    // No featured URLs in stream
    const featuredUrls = new Set(featured.map(f => f.url));
    for (const item of stream) {
      expect(featuredUrls.has(item.url)).toBe(false);
    }

    // All 5 categories represented
    const categories = new Set(stream.map(s => s.category));
    expect(categories.size).toBe(5);

    // Chronological order
    for (let i = 1; i < stream.length; i++) {
      expect(new Date(stream[i - 1].publishedAt).getTime())
        .toBeGreaterThanOrEqual(new Date(stream[i].publishedAt).getTime());
    }

    // No duplicate IDs
    const ids = stream.map(s => s.id);
    expect(ids.length).toBe(new Set(ids).size);
  });
});
