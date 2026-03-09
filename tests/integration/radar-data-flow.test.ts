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

// globals: true in vitest.config.ts provides describe, it, expect
import { toFyiItem, toWireItem, mergeFeed, CATEGORIES } from '@/lib/inoreader/transform';
import type {
  InoreaderItem,
  InoreaderAnnotation,
  RadarFyiItem,
  RadarWireItem,
  RadarFeedItem,
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
 * 1. Transform annotated items → FYI
 * 2. Deduplicate wire items (remove URLs in FYI)
 * 3. Two-pass category balancing with MIN_PER_CATEGORY and MAX_WIRE cap
 * 4. Final chronological sort
 */
class RadarDataFlowSimulator {
  static readonly MIN_PER_CATEGORY = 3;
  static readonly MAX_WIRE = 30;

  /**
   * Process annotated items into FYI display models.
   */
  processFyi(annotatedItems: InoreaderItem[]): RadarFyiItem[] {
    return annotatedItems
      .map(toFyiItem)
      .filter((item): item is RadarFyiItem => item !== null);
  }

  /**
   * Process raw items into balanced, deduplicated Wire display models.
   */
  processWire(
    rawItems: InoreaderItem[],
    fyi: RadarFyiItem[],
  ): RadarWireItem[] {
    // Dedup: exclude items whose URL already appears in FYI
    const fyiUrls = new Set(fyi.map(f => f.url));
    const allWireItems = rawItems
      .filter(item => {
        const url = item.canonical?.[0]?.href || item.alternate?.[0]?.href || '';
        return !fyiUrls.has(url);
      })
      .map(toWireItem);

    // Two-pass category balancing
    const picked = new Set<string>();
    const result: RadarWireItem[] = [];

    // Pass 1: guarantee MIN_PER_CATEGORY per category
    const categoryKeys = Object.keys(CATEGORIES);
    for (const cat of categoryKeys) {
      let count = 0;
      for (const item of allWireItems) {
        if (item.category === cat && count < RadarDataFlowSimulator.MIN_PER_CATEGORY) {
          picked.add(item.id);
          result.push(item);
          count++;
        }
      }
    }

    // Pass 2: fill remaining slots chronologically
    for (const item of allWireItems) {
      if (result.length >= RadarDataFlowSimulator.MAX_WIRE) break;
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

describe('Radar Data Flow', () => {
let sim: RadarDataFlowSimulator;

beforeEach(() => {
  itemCounter = 0;
  sim = new RadarDataFlowSimulator();
});

// ---------------------------------------------------------------------------
// FYI Processing
// ---------------------------------------------------------------------------

describe('FYI Processing', () => {
  it('should filter out items without annotations', () => {
    const items = [
      makeItem({ annotations: [makeAnnotation()] }),
      makeItem({ annotations: [] }),
      makeItem({ annotations: undefined }),
    ];
    const fyi = sim.processFyi(items);
    expect(fyi).toHaveLength(1);
  });

  it('should transform annotated items into display models', () => {
    const items = [
      makeItem({
        title: 'FYI Article',
        annotations: [makeAnnotation({ note: 'Great insight' })],
      }),
    ];
    const fyi = sim.processFyi(items);
    expect(fyi[0].title).toBe('FYI Article');
    expect(fyi[0].gstTake).toBe('Great insight');
  });

  it('should preserve all annotated items', () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      makeItem({
        id: `ann-${i}`,
        annotations: [makeAnnotation({ note: `Take ${i}` })],
        canonical: [{ href: `https://example.com/ann-${i}` }],
      }),
    );
    const fyi = sim.processFyi(items);
    expect(fyi).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// Wire Deduplication
// ---------------------------------------------------------------------------

describe('Wire Deduplication', () => {
  it('should remove wire items whose URL appears in FYI', () => {
    const fyi: RadarFyiItem[] = [{
      id: 'f1',
      title: 'FYI Article',
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

    const wire = sim.processWire(rawItems, fyi);
    expect(wire).toHaveLength(1);
    expect(wire[0].url).toBe('https://example.com/unique-url');
  });

  it('should check alternate URL for dedup when canonical is missing', () => {
    const fyi: RadarFyiItem[] = [{
      id: 'f1',
      title: 'FYI Article',
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

    const wire = sim.processWire(rawItems, fyi);
    expect(wire).toHaveLength(0);
  });

  it('should keep all items when FYI is empty', () => {
    const rawItems = [makeItem(), makeItem()];
    const wire = sim.processWire(rawItems, []);
    expect(wire).toHaveLength(2);
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
      ...makeCategoryItems('security', 3, 1703000000), // oldest
    ];

    const wire = sim.processWire(items, []);

    // Count items per category
    const counts: Record<string, number> = {};
    for (const item of wire) {
      counts[item.category] = (counts[item.category] || 0) + 1;
    }

    // We supplied exactly 3 for each non-ET category — all 3 must appear
    expect(counts['pe-ma']).toBe(3);
    expect(counts['ai-automation']).toBe(3);
    expect(counts['security']).toBe(3);
    // ET has 10 available; 3 guaranteed + up to 7 more in pass 2
    expect(counts['enterprise-tech']).toBeGreaterThan(3);
  });

  it('should respect MAX_WIRE (30) cap', () => {
    // Create 50 items
    const items = [
      ...makeCategoryItems('enterprise-tech', 20, 1710000000),
      ...makeCategoryItems('pe-ma', 10, 1709000000),
      ...makeCategoryItems('ai-automation', 10, 1708000000),
      ...makeCategoryItems('security', 10, 1707000000),
    ];

    const wire = sim.processWire(items, []);
    expect(wire.length).toBeLessThanOrEqual(30);
  });

  it('should fill remaining slots chronologically after pass 1', () => {
    // 4 categories × 3 = 12 guaranteed, leaves 18 remaining slots
    const items = [
      ...makeCategoryItems('enterprise-tech', 20, 1710000000),
      ...makeCategoryItems('pe-ma', 3, 1705000000),
      ...makeCategoryItems('ai-automation', 3, 1704000000),
      ...makeCategoryItems('security', 3, 1703000000),
    ];

    const wire = sim.processWire(items, []);

    // Should have 12 guaranteed + 17 fill from ET = 29 total (under cap)
    // enterprise-tech has 20 items but only 3 are guaranteed; the rest fill from its pool
    expect(wire.length).toBeLessThanOrEqual(30);

    // enterprise-tech should have more than MIN_PER_CATEGORY because it fills remaining slots
    const etCount = wire.filter(s => s.category === 'enterprise-tech').length;
    expect(etCount).toBeGreaterThan(3);
  });

  it('should not include duplicate items across pass 1 and pass 2', () => {
    const items = [
      ...makeCategoryItems('enterprise-tech', 10, 1710000000),
      ...makeCategoryItems('pe-ma', 5, 1709000000),
      ...makeCategoryItems('ai-automation', 5, 1708000000),
      ...makeCategoryItems('security', 5, 1707000000),
    ];

    const wire = sim.processWire(items, []);
    const ids = wire.map(s => s.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it('should sort final output chronologically (newest first)', () => {
    const items = [
      ...makeCategoryItems('enterprise-tech', 5, 1710000000),
      ...makeCategoryItems('pe-ma', 5, 1709000000),
      ...makeCategoryItems('security', 5, 1708000000),
      ...makeCategoryItems('ai-automation', 5, 1707000000),
    ];

    const wire = sim.processWire(items, []);

    for (let i = 1; i < wire.length; i++) {
      const prev = new Date(wire[i - 1].publishedAt).getTime();
      const curr = new Date(wire[i].publishedAt).getTime();
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });

  it('should handle category with fewer than MIN_PER_CATEGORY items gracefully', () => {
    const items = [
      ...makeCategoryItems('enterprise-tech', 10, 1710000000),
      ...makeCategoryItems('pe-ma', 1, 1709000000), // only 1 item
      ...makeCategoryItems('security', 3, 1708000000),
    ];

    const wire = sim.processWire(items, []);

    const pemaCount = wire.filter(s => s.category === 'pe-ma').length;
    expect(pemaCount).toBe(1); // only 1 available
  });

  it('should handle single category dominance', () => {
    // 40 enterprise-tech items, 0 from other categories
    const items = makeCategoryItems('enterprise-tech', 40, 1710000000);

    const wire = sim.processWire(items, []);
    expect(wire.length).toBe(30); // capped at MAX_WIRE
    expect(wire.every(s => s.category === 'enterprise-tech')).toBe(true);
  });

  it('should include older categories even when other categories have newer items', () => {
    // This tests that the two-pass algorithm guarantees representation
    const items = [
      ...makeCategoryItems('enterprise-tech', 15, 1710000000), // newest
      ...makeCategoryItems('ai-automation', 15, 1709000000),
      ...makeCategoryItems('pe-ma', 15, 1708000000),
      ...makeCategoryItems('security', 15, 1700000000), // much older
    ];

    const wire = sim.processWire(items, []);

    const securityCount = wire.filter(s => s.category === 'security').length;
    expect(securityCount).toBeGreaterThanOrEqual(3);
  });

  it('should handle exact boundary of 28 items with 4 categories × 7 each', () => {
    const items = [
      ...makeCategoryItems('enterprise-tech', 7, 1710000000),
      ...makeCategoryItems('pe-ma', 7, 1709000000),
      ...makeCategoryItems('ai-automation', 7, 1708000000),
      ...makeCategoryItems('security', 7, 1707000000),
    ];

    const wire = sim.processWire(items, []);
    expect(wire.length).toBe(28); // all items included, under cap
  });
});

// ---------------------------------------------------------------------------
// Edge Cases
// ---------------------------------------------------------------------------

describe('Edge Cases', () => {
  it('should return empty array when no items provided', () => {
    const wire = sim.processWire([], []);
    expect(wire).toHaveLength(0);
  });

  it('should return empty FYI when all items lack annotations', () => {
    const items = [makeItem(), makeItem(), makeItem()];
    const fyi = sim.processFyi(items);
    expect(fyi).toHaveLength(0);
  });

  it('should handle combined FYI + wire dedup correctly', () => {
    // Item A appears in both annotated and wire feeds
    const sharedUrl = 'https://example.com/shared';

    const annotatedItems = [
      makeItem({
        id: 'annotated-1',
        canonical: [{ href: sharedUrl }],
        annotations: [makeAnnotation()],
      }),
    ];

    const rawWireItems = [
      makeItem({ id: 'wire-1', canonical: [{ href: sharedUrl }] }),
      makeItem({ id: 'wire-2', canonical: [{ href: 'https://example.com/other' }] }),
    ];

    const fyi = sim.processFyi(annotatedItems);
    const wire = sim.processWire(rawWireItems, fyi);

    expect(fyi).toHaveLength(1);
    expect(wire).toHaveLength(1);
    expect(wire[0].url).toBe('https://example.com/other');
  });

  it('should handle items with no URL gracefully in dedup', () => {
    const rawItems = [
      makeItem({ canonical: undefined, alternate: undefined }),
    ];

    // FYI has a URL — should not match and remove the no-URL item
    const fyi: RadarFyiItem[] = [{
      id: 'f1',
      title: 'FYI Article',
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

    const wire = sim.processWire(rawItems, fyi);
    expect(wire).toHaveLength(1);
  });

  it('should handle all items being deduped (wire becomes empty)', () => {
    const sharedUrl = 'https://example.com/same';
    const fyi: RadarFyiItem[] = [{
      id: 'f1',
      title: 'FYI Article',
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

    const wire = sim.processWire(rawItems, fyi);
    expect(wire).toHaveLength(0);
  });

  it('should work with fewer total items than MAX_STREAM', () => {
    const items = [
      ...makeCategoryItems('enterprise-tech', 2, 1710000000),
      ...makeCategoryItems('pe-ma', 2, 1709000000),
    ];

    const wire = sim.processWire(items, []);
    expect(wire).toHaveLength(4);
  });

  it('should preserve category assignment through the full pipeline', () => {
    const items = [
      makeItem({
        id: 'sec-item',
        categories: ['user/123/label/GST-Security'],
        canonical: [{ href: 'https://example.com/security-article' }],
      }),
    ];

    const wire = sim.processWire(items, []);
    expect(wire[0].category).toBe('security');
  });
});

// ---------------------------------------------------------------------------
// Full Pipeline (FYI + Wire together)
// ---------------------------------------------------------------------------

describe('Full Pipeline', () => {
  it('should process a realistic mixed feed correctly', () => {
    // Annotated items (become FYI)
    const annotatedItems = Array.from({ length: 5 }, (_, i) =>
      makeItem({
        id: `fyi-${i}`,
        title: `FYI Article ${i}`,
        canonical: [{ href: `https://example.com/fyi-${i}` }],
        annotations: [makeAnnotation({ note: `Take ${i}` })],
        published: 1710000000 - i * 100,
      }),
    );

    // Wire items (some overlap with FYI URLs)
    const wireItems = [
      // Duplicate of fyi-0
      makeItem({
        id: 'wire-dup',
        canonical: [{ href: 'https://example.com/fyi-0' }],
        published: 1710000000,
        categories: ['user/123/label/GST-Enterprise-Tech'],
      }),
      // Unique items across categories
      ...makeCategoryItems('enterprise-tech', 8, 1709500000),
      ...makeCategoryItems('pe-ma', 6, 1709000000),
      ...makeCategoryItems('ai-automation', 6, 1708500000),
      ...makeCategoryItems('security', 6, 1708000000),
    ];

    const fyi = sim.processFyi(annotatedItems);
    const wire = sim.processWire(wireItems, fyi);

    // FYI: all 5 annotated items
    expect(fyi).toHaveLength(5);

    // Wire: duplicate removed, capped at 30
    expect(wire.length).toBeLessThanOrEqual(30);

    // No FYI URLs in wire
    const fyiUrls = new Set(fyi.map(f => f.url));
    for (const item of wire) {
      expect(fyiUrls.has(item.url)).toBe(false);
    }

    // All 4 categories represented
    const categories = new Set(wire.map(s => s.category));
    expect(categories.size).toBe(4);

    // Chronological order
    for (let i = 1; i < wire.length; i++) {
      expect(new Date(wire[i - 1].publishedAt).getTime())
        .toBeGreaterThanOrEqual(new Date(wire[i].publishedAt).getTime());
    }

    // No duplicate IDs
    const ids = wire.map(s => s.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it('should produce a correctly merged unified feed', () => {
    // FYI items with specific annotation timestamps
    const annotatedItems = Array.from({ length: 3 }, (_, i) =>
      makeItem({
        id: `fyi-merge-${i}`,
        title: `FYI Merge ${i}`,
        canonical: [{ href: `https://example.com/fyi-merge-${i}` }],
        annotations: [makeAnnotation({
          note: `Take ${i}`,
          added_on: 1710500000 - i * 50000, // staggered annotation times
        })],
        published: 1708000000 - i * 1000, // older publish dates
      }),
    );

    const wireItems = [
      ...makeCategoryItems('enterprise-tech', 5, 1710000000),
      ...makeCategoryItems('pe-ma', 3, 1709000000),
    ];

    const fyi = sim.processFyi(annotatedItems);
    const wire = sim.processWire(wireItems, fyi);
    const feed = mergeFeed(fyi, wire);

    // All items present
    expect(feed.length).toBe(fyi.length + wire.length);

    // Kind discrimination preserved
    const fyiIds = new Set(fyi.map(f => f.id));
    for (const item of feed) {
      if (fyiIds.has(item.id)) {
        expect(item.kind).toBe('fyi');
      } else {
        expect(item.kind).toBe('wire');
      }
    }

    // Sorted by sortDate descending
    for (let i = 1; i < feed.length; i++) {
      expect(new Date(feed[i - 1].sortDate).getTime())
        .toBeGreaterThanOrEqual(new Date(feed[i].sortDate).getTime());
    }

    // FYI items always included regardless of wire cap
    const fyiInFeed = feed.filter(f => f.kind === 'fyi');
    expect(fyiInFeed).toHaveLength(fyi.length);

    // No duplicate IDs
    const ids = feed.map(f => f.id);
    expect(ids.length).toBe(new Set(ids).size);
  });
});
}); // close Radar Data Flow
