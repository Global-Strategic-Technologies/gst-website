/**
 * Unit Tests for Radar Transform Functions
 *
 * Tests the pure transformation functions in src/lib/inoreader/transform.ts:
 * - CATEGORIES constant validation
 * - toWireItem() — compact wire display model
 * - toFyiItem() — FYI item with annotation extraction
 * - mergeFeed() — unified feed merge with sort-by-annotatedAt for FYI
 * - Category inference (tested indirectly through public API)
 * - HTML stripping, entity decoding, text truncation
 */

import { toFyiItem, toWireItem, mergeFeed, CATEGORIES } from '@/lib/inoreader/transform';
import type { InoreaderItem, InoreaderAnnotation } from '@/lib/inoreader/types';
import type { RadarFyiItem, RadarWireItem } from '@/lib/inoreader/types';

/** Factory for creating InoreaderItem test fixtures with sensible defaults. */
function makeItem(overrides: Partial<InoreaderItem> = {}): InoreaderItem {
  return {
    id: 'tag:google.com,2005:reader/item/test-id-001',
    title: 'Test Article Title',
    published: 1708000000,
    canonical: [{ href: 'https://example.com/article' }],
    alternate: [{ href: 'https://example.com/alt', type: 'text/html' }],
    origin: {
      streamId: 'feed/http://example.com/feed',
      title: 'Example Feed',
      htmlUrl: 'https://example.com',
    },
    summary: { content: '<p>Article summary text</p>' },
    categories: [],
    ...overrides,
  };
}

function makeAnnotation(overrides: Partial<InoreaderAnnotation> = {}): InoreaderAnnotation {
  return {
    id: 1,
    start: 0,
    end: 100,
    added_on: 1708100000,
    text: 'Highlighted passage from the article',
    note: 'This is the GST Take on this article.',
    ...overrides,
  };
}

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
// toWireItem
// ---------------------------------------------------------------------------

describe('toWireItem', () => {
  it('should transform a basic item with all fields', () => {
    const item = makeItem();
    const result = toWireItem(item);

    expect(result).toEqual({
      id: item.id,
      title: 'Test Article Title',
      url: 'https://example.com/article',
      source: 'Example Feed',
      category: 'enterprise-tech', // default when no category signals
      publishedAt: expect.any(String),
    });
  });

  it('should use canonical URL when available', () => {
    const item = makeItem({
      canonical: [{ href: 'https://canonical.example.com' }],
      alternate: [{ href: 'https://alternate.example.com', type: 'text/html' }],
    });
    const result = toWireItem(item);
    expect(result.url).toBe('https://canonical.example.com');
  });

  it('should fall back to alternate URL when no canonical', () => {
    const item = makeItem({
      canonical: undefined,
      alternate: [{ href: 'https://alternate.example.com', type: 'text/html' }],
    });
    const result = toWireItem(item);
    expect(result.url).toBe('https://alternate.example.com');
  });

  it('should return empty string URL when no canonical or alternate', () => {
    const item = makeItem({
      canonical: undefined,
      alternate: undefined,
    });
    const result = toWireItem(item);
    expect(result.url).toBe('');
  });

  it('should default title to Untitled when title is empty', () => {
    const item = makeItem({ title: '' });
    const result = toWireItem(item);
    expect(result.title).toBe('Untitled');
  });

  it('should trim whitespace from title', () => {
    const item = makeItem({ title: '  Padded Title  ' });
    const result = toWireItem(item);
    expect(result.title).toBe('Padded Title');
  });

  it('should use origin title as source', () => {
    const item = makeItem({
      origin: { streamId: 'feed/test', title: 'My Feed', htmlUrl: 'https://feed.com' },
    });
    const result = toWireItem(item);
    expect(result.source).toBe('My Feed');
  });

  it('should default source to Unknown when origin is missing', () => {
    const item = makeItem({ origin: undefined as any });
    const result = toWireItem(item);
    expect(result.source).toBe('Unknown');
  });

  it('should convert published Unix timestamp to ISO string', () => {
    const item = makeItem({ published: 1708000000 });
    const result = toWireItem(item);
    const date = new Date(result.publishedAt);
    expect(date.getTime()).toBe(1708000000 * 1000);
  });

  it('should produce a valid ISO 8601 publishedAt string', () => {
    const item = makeItem();
    const result = toWireItem(item);
    expect(() => new Date(result.publishedAt)).not.toThrow();
    expect(new Date(result.publishedAt).toISOString()).toBe(result.publishedAt);
  });
});

// ---------------------------------------------------------------------------
// toWireItem — Category Inference
// ---------------------------------------------------------------------------

describe('toWireItem - Category Inference', () => {
  // Priority 1: Explicit gst-* tags
  describe('Priority 1: gst-* tags', () => {
    it('should infer pe-ma from gst-pe-ma tag', () => {
      const item = makeItem({ categories: ['user/123/label/gst-pe-ma'] });
      expect(toWireItem(item).category).toBe('pe-ma');
    });

    it('should infer security from gst-security tag', () => {
      const item = makeItem({ categories: ['user/123/label/gst-security'] });
      expect(toWireItem(item).category).toBe('security');
    });

    it('should infer ai-automation from gst-ai-automation tag', () => {
      const item = makeItem({ categories: ['user/123/label/gst-ai-automation'] });
      expect(toWireItem(item).category).toBe('ai-automation');
    });

    it('should ignore gst- tags that do not match a known category', () => {
      const item = makeItem({ categories: ['user/123/label/gst-nonexistent'] });
      expect(toWireItem(item).category).toBe('enterprise-tech'); // default
    });
  });

  // Priority 2: GST-* folder labels
  describe('Priority 2: GST-* folder labels', () => {
    it('should infer pe-ma from GST-PE-MA folder', () => {
      const item = makeItem({ categories: ['user/123/label/GST-PE-MA'] });
      expect(toWireItem(item).category).toBe('pe-ma');
    });

    it('should infer enterprise-tech from GST-Enterprise-Tech folder', () => {
      const item = makeItem({ categories: ['user/123/label/GST-Enterprise-Tech'] });
      expect(toWireItem(item).category).toBe('enterprise-tech');
    });

    it('should infer ai-automation from GST-AI-Automation folder', () => {
      const item = makeItem({ categories: ['user/123/label/GST-AI-Automation'] });
      expect(toWireItem(item).category).toBe('ai-automation');
    });

    it('should infer security from GST-Security folder', () => {
      const item = makeItem({ categories: ['user/123/label/GST-Security'] });
      expect(toWireItem(item).category).toBe('security');
    });

  });

  // Priority 3: Title keyword matching
  describe('Priority 3: Title keywords', () => {
    it('should infer pe-ma from title containing "private equity"', () => {
      const item = makeItem({ title: 'Private Equity Fund Raises $2B' });
      expect(toWireItem(item).category).toBe('pe-ma');
    });

    it('should infer pe-ma from title containing "acquisition"', () => {
      const item = makeItem({ title: 'Major Acquisition Closes Today' });
      expect(toWireItem(item).category).toBe('pe-ma');
    });

    it('should infer pe-ma from title containing "buyout"', () => {
      const item = makeItem({ title: 'Leveraged Buyout of Software Firm' });
      expect(toWireItem(item).category).toBe('pe-ma');
    });

    it('should infer security from title containing "cyber"', () => {
      const item = makeItem({ title: 'Cyber Attacks Reach New Heights' });
      expect(toWireItem(item).category).toBe('security');
    });

    it('should infer security from title containing "vulnerability"', () => {
      const item = makeItem({ title: 'Critical Vulnerability Discovered in OpenSSL' });
      expect(toWireItem(item).category).toBe('security');
    });

    it('should infer ai-automation from title containing "artificial intelligence"', () => {
      const item = makeItem({ title: 'Artificial Intelligence Reshapes Enterprise' });
      expect(toWireItem(item).category).toBe('ai-automation');
    });

    it('should infer ai-automation from title containing "LLM"', () => {
      const item = makeItem({ title: 'New LLM Benchmark Released' });
      expect(toWireItem(item).category).toBe('ai-automation');
    });

  });

  // Priority 4: Default
  it('should default to enterprise-tech when no category signals found', () => {
    const item = makeItem({ title: 'Generic Technology News Article', categories: [] });
    expect(toWireItem(item).category).toBe('enterprise-tech');
  });

  // Priority ordering
  it('should prefer gst-* tag over folder label', () => {
    const item = makeItem({
      categories: [
        'user/123/label/gst-security',
        'user/123/label/GST-AI-Automation',
      ],
    });
    expect(toWireItem(item).category).toBe('security');
  });

  it('should prefer folder label over title keyword', () => {
    const item = makeItem({
      title: 'Major Acquisition in Healthcare',
      categories: ['user/123/label/GST-Security'],
    });
    expect(toWireItem(item).category).toBe('security');
  });
});

// ---------------------------------------------------------------------------
// toFyiItem
// ---------------------------------------------------------------------------

describe('toFyiItem', () => {
  it('should return null when item has no annotations', () => {
    const item = makeItem({ annotations: [] });
    expect(toFyiItem(item)).toBeNull();
  });

  it('should return null when annotations field is undefined', () => {
    const item = makeItem({ annotations: undefined });
    expect(toFyiItem(item)).toBeNull();
  });

  it('should transform item with a single annotation', () => {
    const annotation = makeAnnotation();
    const item = makeItem({ annotations: [annotation] });
    const result = toFyiItem(item);

    expect(result).not.toBeNull();
    expect(result!.title).toBe('Test Article Title');
    expect(result!.url).toBe('https://example.com/article');
    expect(result!.source).toBe('Example Feed');
    expect(result!.highlightedText).toBe('Highlighted passage from the article');
    expect(result!.gstTake).toBe('This is the GST Take on this article.');
  });

  it('should merge highlight and note from separate annotations', () => {
    const highlightOnly = makeAnnotation({ id: 1, note: '', text: 'Key passage from article' });
    const noteOnly = makeAnnotation({ id: 2, text: '', note: 'The real take' });
    const item = makeItem({ annotations: [highlightOnly, noteOnly] });
    const result = toFyiItem(item);

    expect(result!.highlightedText).toBe('Key passage from article');
    expect(result!.gstTake).toBe('The real take');
  });

  it('should use first non-empty text and first non-empty note across annotations', () => {
    const noNote = makeAnnotation({ id: 1, note: '', text: 'Highlight without note' });
    const withNote = makeAnnotation({ id: 2, note: 'The real take', text: 'Highlight with note' });
    const item = makeItem({ annotations: [noNote, withNote] });
    const result = toFyiItem(item);

    expect(result!.highlightedText).toBe('Highlight without note');
    expect(result!.gstTake).toBe('The real take');
  });

  it('should use first annotation text when none have notes', () => {
    const ann1 = makeAnnotation({ id: 1, note: '', text: 'First highlight' });
    const ann2 = makeAnnotation({ id: 2, note: '', text: 'Second highlight' });
    const item = makeItem({ annotations: [ann1, ann2] });
    const result = toFyiItem(item);

    expect(result!.highlightedText).toBe('First highlight');
  });

  it('should extract highlightedText from annotation text', () => {
    const annotation = makeAnnotation({ text: 'Key insight from the article' });
    const item = makeItem({ annotations: [annotation] });
    const result = toFyiItem(item);
    expect(result!.highlightedText).toBe('Key insight from the article');
  });

  it('should extract gstTake from annotation note', () => {
    const annotation = makeAnnotation({ note: 'Practitioner perspective on this trend' });
    const item = makeItem({ annotations: [annotation] });
    const result = toFyiItem(item);
    expect(result!.gstTake).toBe('Practitioner perspective on this trend');
  });

  it('should strip HTML tags from summary', () => {
    const item = makeItem({
      summary: { content: '<p><strong>Bold</strong> text with <a href="#">links</a></p>' },
      annotations: [makeAnnotation()],
    });
    const result = toFyiItem(item);
    expect(result!.summary).toBe('Bold text with links');
  });

  it('should decode HTML entities in summary', () => {
    const item = makeItem({
      summary: { content: 'AT&amp;T says &lt;hello&gt; &amp; &quot;goodbye&quot; it&#39;s&nbsp;done' },
      annotations: [makeAnnotation()],
    });
    const result = toFyiItem(item);
    expect(result!.summary).toContain('AT&T');
    expect(result!.summary).toContain('<hello>');
    expect(result!.summary).toContain('"goodbye"');
    expect(result!.summary).toContain("it's");
  });

  it('should truncate summary at word boundary when over 250 chars', () => {
    const longText = 'The quick brown fox jumps over the lazy dog. '.repeat(10); // ~450 chars
    const item = makeItem({
      summary: { content: longText },
      annotations: [makeAnnotation()],
    });
    const result = toFyiItem(item);
    expect(result!.summary.length).toBeLessThanOrEqual(260);
    expect(result!.summary).toMatch(/\.\.\.$/);
    // Should end with a complete word before the ellipsis (space before truncation point)
    const withoutEllipsis = result!.summary.replace(/\.\.\.$/, '').trim();
    const lastChar = withoutEllipsis[withoutEllipsis.length - 1];
    // Last char should be a period or word-ending char (not a space indicating mid-word cut)
    expect(lastChar).not.toBe(' ');
  });

  it('should not truncate summary under 250 chars', () => {
    const shortText = 'Short summary text.';
    const item = makeItem({
      summary: { content: shortText },
      annotations: [makeAnnotation()],
    });
    const result = toFyiItem(item);
    expect(result!.summary).toBe(shortText);
    expect(result!.summary).not.toContain('...');
  });

  it('should fall back to content.content when summary is missing', () => {
    const item = makeItem({
      summary: undefined,
      content: { content: '<p>Content fallback text</p>' },
      annotations: [makeAnnotation()],
    });
    const result = toFyiItem(item);
    expect(result!.summary).toBe('Content fallback text');
  });

  it('should convert annotation added_on to ISO annotatedAt string', () => {
    const annotation = makeAnnotation({ added_on: 1708100000 });
    const item = makeItem({ annotations: [annotation] });
    const result = toFyiItem(item);
    const date = new Date(result!.annotatedAt);
    expect(date.getTime()).toBe(1708100000 * 1000);
    expect(date.toISOString()).toBe(result!.annotatedAt);
  });

  it('should use the most recent annotation timestamp for annotatedAt', () => {
    const older = makeAnnotation({ id: 1, added_on: 1708100000, text: 'Highlight' });
    const newer = makeAnnotation({ id: 2, added_on: 1708200000, note: 'Comment' });
    const item = makeItem({ annotations: [older, newer] });
    const result = toFyiItem(item);
    const date = new Date(result!.annotatedAt);
    expect(date.getTime()).toBe(1708200000 * 1000);
  });

  it('should assign category using the same inference rules as toWireItem (shared inferCategory)', () => {
    const item = makeItem({
      categories: ['user/123/label/GST-Security'],
      annotations: [makeAnnotation()],
    });
    const result = toFyiItem(item);
    expect(result!.category).toBe('security');
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
    expect(feed.map(f => f.id)).toEqual(['fyi-1', 'wire-1', 'fyi-2', 'wire-2']);
  });

  it('should handle empty fyi array', () => {
    const wire = [makeWire({ id: 'w1' }), makeWire({ id: 'w2' })];
    const feed = mergeFeed([], wire);
    expect(feed).toHaveLength(2);
    expect(feed.every(f => f.kind === 'wire')).toBe(true);
  });

  it('should handle empty wire array', () => {
    const fyi = [makeFyi({ id: 'f1' }), makeFyi({ id: 'f2' })];
    const feed = mergeFeed(fyi, []);
    expect(feed).toHaveLength(2);
    expect(feed.every(f => f.kind === 'fyi')).toBe(true);
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
