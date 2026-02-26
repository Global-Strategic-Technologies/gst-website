/**
 * Unit Tests for Radar Transform Functions
 *
 * Tests the pure transformation functions in src/lib/inoreader/transform.ts:
 * - CATEGORIES constant validation
 * - toStreamItem() — compact stream display model
 * - toFeaturedItem() — featured item with annotation extraction
 * - Category inference (tested indirectly through public API)
 * - HTML stripping, entity decoding, text truncation
 */

import { toFeaturedItem, toStreamItem, CATEGORIES } from '@/lib/inoreader/transform';
import type { InoreaderItem, InoreaderAnnotation } from '@/lib/inoreader/types';

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
  it('should define exactly 5 categories', () => {
    expect(Object.keys(CATEGORIES)).toHaveLength(5);
  });

  it('should have pe-ma, enterprise-tech, ai-automation, security, verticals keys', () => {
    expect(Object.keys(CATEGORIES)).toEqual(
      expect.arrayContaining(['pe-ma', 'enterprise-tech', 'ai-automation', 'security', 'verticals'])
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
// toStreamItem
// ---------------------------------------------------------------------------

describe('toStreamItem', () => {
  it('should transform a basic item with all fields', () => {
    const item = makeItem();
    const result = toStreamItem(item);

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
    const result = toStreamItem(item);
    expect(result.url).toBe('https://canonical.example.com');
  });

  it('should fall back to alternate URL when no canonical', () => {
    const item = makeItem({
      canonical: undefined,
      alternate: [{ href: 'https://alternate.example.com', type: 'text/html' }],
    });
    const result = toStreamItem(item);
    expect(result.url).toBe('https://alternate.example.com');
  });

  it('should return empty string URL when no canonical or alternate', () => {
    const item = makeItem({
      canonical: undefined,
      alternate: undefined,
    });
    const result = toStreamItem(item);
    expect(result.url).toBe('');
  });

  it('should default title to Untitled when title is empty', () => {
    const item = makeItem({ title: '' });
    const result = toStreamItem(item);
    expect(result.title).toBe('Untitled');
  });

  it('should trim whitespace from title', () => {
    const item = makeItem({ title: '  Padded Title  ' });
    const result = toStreamItem(item);
    expect(result.title).toBe('Padded Title');
  });

  it('should use origin title as source', () => {
    const item = makeItem({
      origin: { streamId: 'feed/test', title: 'My Feed', htmlUrl: 'https://feed.com' },
    });
    const result = toStreamItem(item);
    expect(result.source).toBe('My Feed');
  });

  it('should default source to Unknown when origin is missing', () => {
    const item = makeItem({ origin: undefined as any });
    const result = toStreamItem(item);
    expect(result.source).toBe('Unknown');
  });

  it('should convert published Unix timestamp to ISO string', () => {
    const item = makeItem({ published: 1708000000 });
    const result = toStreamItem(item);
    const date = new Date(result.publishedAt);
    expect(date.getTime()).toBe(1708000000 * 1000);
  });

  it('should produce a valid ISO 8601 publishedAt string', () => {
    const item = makeItem();
    const result = toStreamItem(item);
    expect(() => new Date(result.publishedAt)).not.toThrow();
    expect(new Date(result.publishedAt).toISOString()).toBe(result.publishedAt);
  });
});

// ---------------------------------------------------------------------------
// toStreamItem — Category Inference
// ---------------------------------------------------------------------------

describe('toStreamItem - Category Inference', () => {
  // Priority 1: Explicit gst-* tags
  describe('Priority 1: gst-* tags', () => {
    it('should infer pe-ma from gst-pe-ma tag', () => {
      const item = makeItem({ categories: ['user/123/label/gst-pe-ma'] });
      expect(toStreamItem(item).category).toBe('pe-ma');
    });

    it('should infer security from gst-security tag', () => {
      const item = makeItem({ categories: ['user/123/label/gst-security'] });
      expect(toStreamItem(item).category).toBe('security');
    });

    it('should infer ai-automation from gst-ai-automation tag', () => {
      const item = makeItem({ categories: ['user/123/label/gst-ai-automation'] });
      expect(toStreamItem(item).category).toBe('ai-automation');
    });

    it('should infer verticals from gst-verticals tag', () => {
      const item = makeItem({ categories: ['user/123/label/gst-verticals'] });
      expect(toStreamItem(item).category).toBe('verticals');
    });

    it('should ignore gst- tags that do not match a known category', () => {
      const item = makeItem({ categories: ['user/123/label/gst-nonexistent'] });
      expect(toStreamItem(item).category).toBe('enterprise-tech'); // default
    });
  });

  // Priority 2: GST-* folder labels
  describe('Priority 2: GST-* folder labels', () => {
    it('should infer pe-ma from GST-PE-MA folder', () => {
      const item = makeItem({ categories: ['user/123/label/GST-PE-MA'] });
      expect(toStreamItem(item).category).toBe('pe-ma');
    });

    it('should infer enterprise-tech from GST-Enterprise-Tech folder', () => {
      const item = makeItem({ categories: ['user/123/label/GST-Enterprise-Tech'] });
      expect(toStreamItem(item).category).toBe('enterprise-tech');
    });

    it('should infer ai-automation from GST-AI-Automation folder', () => {
      const item = makeItem({ categories: ['user/123/label/GST-AI-Automation'] });
      expect(toStreamItem(item).category).toBe('ai-automation');
    });

    it('should infer security from GST-Security folder', () => {
      const item = makeItem({ categories: ['user/123/label/GST-Security'] });
      expect(toStreamItem(item).category).toBe('security');
    });

    it('should infer verticals from GST-Verticals folder', () => {
      const item = makeItem({ categories: ['user/123/label/GST-Verticals'] });
      expect(toStreamItem(item).category).toBe('verticals');
    });
  });

  // Priority 3: Title keyword matching
  describe('Priority 3: Title keywords', () => {
    it('should infer pe-ma from title containing "private equity"', () => {
      const item = makeItem({ title: 'Private Equity Fund Raises $2B' });
      expect(toStreamItem(item).category).toBe('pe-ma');
    });

    it('should infer pe-ma from title containing "acquisition"', () => {
      const item = makeItem({ title: 'Major Acquisition Closes Today' });
      expect(toStreamItem(item).category).toBe('pe-ma');
    });

    it('should infer pe-ma from title containing "buyout"', () => {
      const item = makeItem({ title: 'Leveraged Buyout of Software Firm' });
      expect(toStreamItem(item).category).toBe('pe-ma');
    });

    it('should infer security from title containing "cyber"', () => {
      const item = makeItem({ title: 'Cyber Attacks Reach New Heights' });
      expect(toStreamItem(item).category).toBe('security');
    });

    it('should infer security from title containing "vulnerability"', () => {
      const item = makeItem({ title: 'Critical Vulnerability Discovered in OpenSSL' });
      expect(toStreamItem(item).category).toBe('security');
    });

    it('should infer ai-automation from title containing "artificial intelligence"', () => {
      const item = makeItem({ title: 'Artificial Intelligence Reshapes Enterprise' });
      expect(toStreamItem(item).category).toBe('ai-automation');
    });

    it('should infer ai-automation from title containing "LLM"', () => {
      const item = makeItem({ title: 'New LLM Benchmark Released' });
      expect(toStreamItem(item).category).toBe('ai-automation');
    });

    it('should infer verticals from title containing "healthcare"', () => {
      const item = makeItem({ title: 'Healthcare IT Spending Surges' });
      expect(toStreamItem(item).category).toBe('verticals');
    });

    it('should infer verticals from title containing "fintech"', () => {
      const item = makeItem({ title: 'Fintech Startup Raises Series B' });
      expect(toStreamItem(item).category).toBe('verticals');
    });
  });

  // Priority 4: Default
  it('should default to enterprise-tech when no category signals found', () => {
    const item = makeItem({ title: 'Generic Technology News Article', categories: [] });
    expect(toStreamItem(item).category).toBe('enterprise-tech');
  });

  // Priority ordering
  it('should prefer gst-* tag over folder label', () => {
    const item = makeItem({
      categories: [
        'user/123/label/gst-security',
        'user/123/label/GST-AI-Automation',
      ],
    });
    expect(toStreamItem(item).category).toBe('security');
  });

  it('should prefer folder label over title keyword', () => {
    const item = makeItem({
      title: 'Major Acquisition in Healthcare',
      categories: ['user/123/label/GST-Verticals'],
    });
    expect(toStreamItem(item).category).toBe('verticals');
  });
});

// ---------------------------------------------------------------------------
// toFeaturedItem
// ---------------------------------------------------------------------------

describe('toFeaturedItem', () => {
  it('should return null when item has no annotations', () => {
    const item = makeItem({ annotations: [] });
    expect(toFeaturedItem(item)).toBeNull();
  });

  it('should return null when annotations field is undefined', () => {
    const item = makeItem({ annotations: undefined });
    expect(toFeaturedItem(item)).toBeNull();
  });

  it('should transform item with a single annotation', () => {
    const annotation = makeAnnotation();
    const item = makeItem({ annotations: [annotation] });
    const result = toFeaturedItem(item);

    expect(result).not.toBeNull();
    expect(result!.title).toBe('Test Article Title');
    expect(result!.url).toBe('https://example.com/article');
    expect(result!.source).toBe('Example Feed');
    expect(result!.highlightedText).toBe('Highlighted passage from the article');
    expect(result!.gstTake).toBe('This is the GST Take on this article.');
  });

  it('should prefer annotation with a non-empty note as primary', () => {
    const noNote = makeAnnotation({ id: 1, note: '', text: 'Highlight without note' });
    const withNote = makeAnnotation({ id: 2, note: 'The real take', text: 'Highlight with note' });
    const item = makeItem({ annotations: [noNote, withNote] });
    const result = toFeaturedItem(item);

    expect(result!.gstTake).toBe('The real take');
    expect(result!.highlightedText).toBe('Highlight with note');
  });

  it('should use first annotation when none have notes', () => {
    const ann1 = makeAnnotation({ id: 1, note: '', text: 'First highlight' });
    const ann2 = makeAnnotation({ id: 2, note: '', text: 'Second highlight' });
    const item = makeItem({ annotations: [ann1, ann2] });
    const result = toFeaturedItem(item);

    expect(result!.highlightedText).toBe('First highlight');
  });

  it('should extract highlightedText from annotation text', () => {
    const annotation = makeAnnotation({ text: 'Key insight from the article' });
    const item = makeItem({ annotations: [annotation] });
    const result = toFeaturedItem(item);
    expect(result!.highlightedText).toBe('Key insight from the article');
  });

  it('should extract gstTake from annotation note', () => {
    const annotation = makeAnnotation({ note: 'Practitioner perspective on this trend' });
    const item = makeItem({ annotations: [annotation] });
    const result = toFeaturedItem(item);
    expect(result!.gstTake).toBe('Practitioner perspective on this trend');
  });

  it('should strip HTML tags from summary', () => {
    const item = makeItem({
      summary: { content: '<p><strong>Bold</strong> text with <a href="#">links</a></p>' },
      annotations: [makeAnnotation()],
    });
    const result = toFeaturedItem(item);
    expect(result!.summary).toBe('Bold text with links');
  });

  it('should decode HTML entities in summary', () => {
    const item = makeItem({
      summary: { content: 'AT&amp;T says &lt;hello&gt; &amp; &quot;goodbye&quot; it&#39;s&nbsp;done' },
      annotations: [makeAnnotation()],
    });
    const result = toFeaturedItem(item);
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
    const result = toFeaturedItem(item);
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
    const result = toFeaturedItem(item);
    expect(result!.summary).toBe(shortText);
    expect(result!.summary).not.toContain('...');
  });

  it('should fall back to content.content when summary is missing', () => {
    const item = makeItem({
      summary: undefined,
      content: { content: '<p>Content fallback text</p>' },
      annotations: [makeAnnotation()],
    });
    const result = toFeaturedItem(item);
    expect(result!.summary).toBe('Content fallback text');
  });

  it('should convert annotation added_on to ISO annotatedAt string', () => {
    const annotation = makeAnnotation({ added_on: 1708100000 });
    const item = makeItem({ annotations: [annotation] });
    const result = toFeaturedItem(item);
    const date = new Date(result!.annotatedAt);
    expect(date.getTime()).toBe(1708100000 * 1000);
    expect(date.toISOString()).toBe(result!.annotatedAt);
  });

  it('should assign category using the same inference rules as toStreamItem', () => {
    const item = makeItem({
      categories: ['user/123/label/GST-Security'],
      annotations: [makeAnnotation()],
    });
    const result = toFeaturedItem(item);
    expect(result!.category).toBe('security');
  });
});
