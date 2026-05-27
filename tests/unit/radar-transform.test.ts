/**
 * Unit Tests for Radar display helpers.
 *
 * Post-BL-032.8 Phase B (2026-05-17), `transform.ts` no longer transforms
 * raw Inoreader API shapes — the website doesn't call Inoreader directly.
 * Tests cover:
 * - CATEGORIES constant validation
 * - mergeFeed() — unified feed merge with sort-by-annotatedAt for FYI
 * - snapshotToFyiItem() / snapshotToWireItem() — MCP snapshot adapters
 *   (the actively-used transform path; cover HTML strip, truncation,
 *   annotation extraction, fallback semantics)
 */

import {
  mergeFeed,
  CATEGORIES,
  snapshotToFyiItem,
  snapshotToWireItem,
  type RadarSnapshotItem,
} from '@/lib/inoreader/transform';
import type { RadarFyiItem, RadarWireItem } from '@/lib/inoreader/types';

// ---------------------------------------------------------------------------
// CATEGORIES
// ---------------------------------------------------------------------------

describe('CATEGORIES', () => {
  it('should define exactly 4 categories', () => {
    expect(Object.keys(CATEGORIES)).toHaveLength(4);
  });

  it('should have pe-ma, enterprise-tech, ai-automation, security keys', () => {
    expect(Object.keys(CATEGORIES)).toEqual(
      expect.arrayContaining(['pe-ma', 'enterprise-tech', 'ai-automation', 'security'])
    );
  });

  it('should have id, label, and color on each category', () => {
    for (const [key, cat] of Object.entries(CATEGORIES)) {
      expect(cat).toHaveProperty('id', key);
      expect(cat.label).toBeTruthy();
      expect(cat.color).toBeTruthy();
    }
  });

  it('should have valid hex color codes', () => {
    for (const cat of Object.values(CATEGORIES)) {
      expect(cat.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

// ---------------------------------------------------------------------------
// mergeFeed
// ---------------------------------------------------------------------------

describe('mergeFeed', () => {
  function makeFyi(overrides: Partial<RadarFyiItem> = {}): RadarFyiItem {
    return {
      id: 'fyi-1',
      title: 'FYI Article',
      url: 'https://example.com/fyi',
      source: 'Feed',
      sourceUrl: 'https://example.com',
      category: 'enterprise-tech',
      publishedAt: '2024-02-15T10:00:00.000Z',
      annotatedAt: '2024-02-16T12:00:00.000Z',
      highlightedText: 'Key passage',
      gstTake: 'Expert take',
      summary: 'Summary text',
      ...overrides,
    };
  }

  function makeWire(overrides: Partial<RadarWireItem> = {}): RadarWireItem {
    return {
      id: 'wire-1',
      title: 'Wire Article',
      url: 'https://example.com/wire',
      source: 'Feed',
      category: 'enterprise-tech',
      publishedAt: '2024-02-16T10:00:00.000Z',
      ...overrides,
    };
  }

  it('should combine fyi and wire items into a single array', () => {
    const fyi = [makeFyi()];
    const wire = [makeWire()];
    const feed = mergeFeed(fyi, wire);
    expect(feed).toHaveLength(2);
  });

  it('should tag fyi items with kind "fyi"', () => {
    const feed = mergeFeed([makeFyi()], []);
    expect(feed[0].kind).toBe('fyi');
  });

  it('should tag wire items with kind "wire"', () => {
    const feed = mergeFeed([], [makeWire()]);
    expect(feed[0].kind).toBe('wire');
  });

  it('should use annotatedAt as sortDate for FYI items', () => {
    const fyi = makeFyi({ annotatedAt: '2024-02-20T00:00:00.000Z' });
    const feed = mergeFeed([fyi], []);
    expect(feed[0].sortDate).toBe('2024-02-20T00:00:00.000Z');
  });

  it('should use publishedAt as sortDate for Wire items', () => {
    const wire = makeWire({ publishedAt: '2024-02-18T00:00:00.000Z' });
    const feed = mergeFeed([], [wire]);
    expect(feed[0].sortDate).toBe('2024-02-18T00:00:00.000Z');
  });

  it('should sort by sortDate descending (newest first)', () => {
    const fyi = makeFyi({ id: 'fyi-old', annotatedAt: '2024-02-10T00:00:00.000Z' });
    const wire = makeWire({ id: 'wire-new', publishedAt: '2024-02-20T00:00:00.000Z' });
    const feed = mergeFeed([fyi], [wire]);
    expect(feed[0].id).toBe('wire-new');
    expect(feed[1].id).toBe('fyi-old');
  });

  it('should interleave items chronologically by their sort dates', () => {
    const fyi1 = makeFyi({ id: 'fyi-1', annotatedAt: '2024-02-20T00:00:00.000Z' });
    const fyi2 = makeFyi({ id: 'fyi-2', annotatedAt: '2024-02-14T00:00:00.000Z' });
    const wire1 = makeWire({ id: 'wire-1', publishedAt: '2024-02-18T00:00:00.000Z' });
    const wire2 = makeWire({ id: 'wire-2', publishedAt: '2024-02-12T00:00:00.000Z' });

    const feed = mergeFeed([fyi1, fyi2], [wire1, wire2]);
    expect(feed.map((f) => f.id)).toEqual(['fyi-1', 'wire-1', 'fyi-2', 'wire-2']);
  });

  it('should handle empty fyi array', () => {
    const wire = [makeWire({ id: 'w1' }), makeWire({ id: 'w2' })];
    const feed = mergeFeed([], wire);
    expect(feed).toHaveLength(2);
    expect(feed.every((f) => f.kind === 'wire')).toBe(true);
  });

  it('should handle empty wire array', () => {
    const fyi = [makeFyi({ id: 'f1' }), makeFyi({ id: 'f2' })];
    const feed = mergeFeed(fyi, []);
    expect(feed).toHaveLength(2);
    expect(feed.every((f) => f.kind === 'fyi')).toBe(true);
  });

  it('should handle both arrays empty', () => {
    const feed = mergeFeed([], []);
    expect(feed).toHaveLength(0);
  });

  it('should preserve all original fields on FYI items', () => {
    const fyi = makeFyi({ gstTake: 'Practitioner insight' });
    const feed = mergeFeed([fyi], []);
    const item = feed[0];
    expect(item.kind).toBe('fyi');
    if (item.kind === 'fyi') {
      expect(item.gstTake).toBe('Practitioner insight');
      expect(item.highlightedText).toBe('Key passage');
    }
  });
});

// ---------------------------------------------------------------------------
// BL-032.8 Phase 4 — SnapshotItem adapters
//
// Verify the website's adapter functions that turn the MCP Worker's
// /radar/snapshot response into the website's RadarFyiItem / RadarWireItem
// display models. These adapters MUST preserve the display contract that
// the FyiItem / WireItem .astro components depend on — title trim,
// 'Untitled' fallback, source fallback, category fallback, summary HTML
// strip + 250-char truncate, FYI null when no annotation.
// ---------------------------------------------------------------------------

function makeSnapshotItem(overrides: Partial<RadarSnapshotItem> = {}): RadarSnapshotItem {
  return {
    id: 'snap-item-1',
    title: 'Snapshot Article',
    url: 'https://example.com/article',
    source: 'Example Feed',
    sourceUrl: 'https://example.com',
    category: 'pe-ma',
    publishedAt: '2026-05-17T10:00:00Z',
    annotatedAt: '2026-05-17T10:05:00Z',
    summary: '<p>Plain summary text</p>',
    ...overrides,
  };
}

describe('snapshotToFyiItem', () => {
  it('maps a SnapshotItem with annotation into a RadarFyiItem', () => {
    const snap = makeSnapshotItem({
      annotation: { highlightedText: 'key passage', gstTake: 'GST analysis' },
    });

    const fyi = snapshotToFyiItem(snap);

    expect(fyi).not.toBeNull();
    expect(fyi).toMatchObject({
      id: 'snap-item-1',
      title: 'Snapshot Article',
      url: 'https://example.com/article',
      source: 'Example Feed',
      sourceUrl: 'https://example.com',
      category: 'pe-ma',
      publishedAt: '2026-05-17T10:00:00Z',
      annotatedAt: '2026-05-17T10:05:00Z',
      highlightedText: 'key passage',
      gstTake: 'GST analysis',
    });
  });

  it('returns null when the snapshot item has no annotation', () => {
    const snap = makeSnapshotItem({ annotation: undefined });
    expect(snapshotToFyiItem(snap)).toBeNull();
  });

  it('returns null when annotation has neither highlightedText nor gstTake', () => {
    const snap = makeSnapshotItem({ annotation: {} });
    expect(snapshotToFyiItem(snap)).toBeNull();
  });

  it('strips HTML and truncates summary to 250 chars', () => {
    const longSummary = '<p>' + 'a '.repeat(200) + '</p>';
    const snap = makeSnapshotItem({
      summary: longSummary,
      annotation: { highlightedText: 'highlight' },
    });

    const fyi = snapshotToFyiItem(snap);

    expect(fyi).not.toBeNull();
    expect(fyi!.summary).not.toMatch(/<[^>]+>/); // no HTML tags
    expect(fyi!.summary.length).toBeLessThanOrEqual(253); // 250 + '...'
  });

  it('falls back to publishedAt when annotatedAt is missing', () => {
    const snap = makeSnapshotItem({
      annotatedAt: undefined,
      annotation: { highlightedText: 'highlight' },
    });

    const fyi = snapshotToFyiItem(snap);

    expect(fyi).not.toBeNull();
    expect(fyi!.annotatedAt).toBe('2026-05-17T10:00:00Z');
  });

  it('falls back to enterprise-tech when category is null', () => {
    const snap = makeSnapshotItem({
      category: null,
      annotation: { highlightedText: 'highlight' },
    });

    const fyi = snapshotToFyiItem(snap);

    expect(fyi).not.toBeNull();
    expect(fyi!.category).toBe('enterprise-tech');
  });

  it('uses empty string for sourceUrl when MCP snapshot omits it', () => {
    const snap = makeSnapshotItem({
      sourceUrl: undefined,
      annotation: { highlightedText: 'highlight' },
    });

    const fyi = snapshotToFyiItem(snap);

    expect(fyi).not.toBeNull();
    expect(fyi!.sourceUrl).toBe('');
  });

  it("falls back to 'Untitled' / 'Unknown' for blank title/source", () => {
    const snap = makeSnapshotItem({
      title: '',
      source: '',
      annotation: { highlightedText: 'highlight' },
    });

    const fyi = snapshotToFyiItem(snap);

    expect(fyi).not.toBeNull();
    expect(fyi!.title).toBe('Untitled');
    expect(fyi!.source).toBe('Unknown');
  });

  it('trims whitespace from title', () => {
    const snap = makeSnapshotItem({
      title: '  Padded Title  ',
      annotation: { highlightedText: 'highlight' },
    });

    const fyi = snapshotToFyiItem(snap);

    expect(fyi!.title).toBe('Padded Title');
  });
});

describe('snapshotToWireItem', () => {
  it('maps a SnapshotItem into a RadarWireItem (no annotation handling)', () => {
    const snap = makeSnapshotItem({ category: 'enterprise-tech' });

    const wire = snapshotToWireItem(snap);

    expect(wire).toMatchObject({
      id: 'snap-item-1',
      title: 'Snapshot Article',
      url: 'https://example.com/article',
      source: 'Example Feed',
      category: 'enterprise-tech',
      publishedAt: '2026-05-17T10:00:00Z',
    });
  });

  it('falls back to enterprise-tech when category is null', () => {
    const snap = makeSnapshotItem({ category: null });
    expect(snapshotToWireItem(snap).category).toBe('enterprise-tech');
  });

  it("falls back to 'Untitled' / 'Unknown' for blank title/source", () => {
    const snap = makeSnapshotItem({ title: '', source: '' });
    const wire = snapshotToWireItem(snap);
    expect(wire.title).toBe('Untitled');
    expect(wire.source).toBe('Unknown');
  });

  it('trims whitespace from title', () => {
    const snap = makeSnapshotItem({ title: '  Wire Title  ' });
    expect(snapshotToWireItem(snap).title).toBe('Wire Title');
  });

  it('ignores annotation field even if present (Wire is non-annotated tier)', () => {
    const snap = makeSnapshotItem({
      annotation: { highlightedText: 'should be ignored', gstTake: 'also ignored' },
    });
    const wire = snapshotToWireItem(snap);
    // RadarWireItem shape has no annotation field — TypeScript prevents
    // access, but assert the runtime shape too.
    expect((wire as unknown as { annotation?: unknown }).annotation).toBeUndefined();
    expect((wire as unknown as { highlightedText?: unknown }).highlightedText).toBeUndefined();
  });
});
