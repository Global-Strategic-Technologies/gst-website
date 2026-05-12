/**
 * Tests for the Library Resource loader.
 *
 * The article bodies are parallel canonical texts (digests of the live
 * website pages); see the `<article>.md` frontmatter for the drift policy.
 */

import { LIBRARY_ENTRIES, loadLibraryByUri } from '../../src/content/library-loader';

describe('LIBRARY_ENTRIES', () => {
  it('exposes both library articles with text/markdown mime type', () => {
    expect(LIBRARY_ENTRIES.length).toBe(2);
    const slugs = LIBRARY_ENTRIES.map((e) => e.slug).sort();
    expect(slugs).toEqual(['business-architectures', 'vdr-structure']);
    for (const e of LIBRARY_ENTRIES) {
      expect(e.mimeType).toBe('text/markdown');
      expect(e.uri).toBe(`gst://library/${e.slug}`);
      expect(e.body.length).toBeGreaterThan(500);
    }
  });

  it('the business-architectures body contains the five layers', () => {
    const entry = LIBRARY_ENTRIES.find((e) => e.slug === 'business-architectures');
    expect(entry).toBeDefined();
    const body = entry!.body;
    expect(body).toMatch(/Layer 1[ —-]+Software Architecture/i);
    expect(body).toMatch(/Layer 2[ —-]+Operational Architecture/i);
    expect(body).toMatch(/Layer 3[ —-]+Product Architecture/i);
    expect(body).toMatch(/Layer 4[ —-]+Organizational Architecture/i);
    expect(body).toMatch(/Layer 5[ —-]+Industry .{0,12}Regulatory/i);
  });

  it('the vdr-structure body lists all nine folder categories', () => {
    const entry = LIBRARY_ENTRIES.find((e) => e.slug === 'vdr-structure');
    expect(entry).toBeDefined();
    const body = entry!.body;
    for (const folder of [
      'Product',
      'Software Architecture',
      'Infrastructure & Operations',
      'SDLC',
      'Data, Analytics & AI',
      'Security',
      'People & Organization',
      'Corporate IT',
      'Governance & Compliance',
    ]) {
      expect(body).toContain(folder);
    }
  });
});

describe('loadLibraryByUri', () => {
  it('resolves both canonical Library URIs', () => {
    expect(loadLibraryByUri('gst://library/business-architectures')).not.toBeNull();
    expect(loadLibraryByUri('gst://library/vdr-structure')).not.toBeNull();
  });

  it('returns null for an unknown slug', () => {
    expect(loadLibraryByUri('gst://library/nope')).toBeNull();
  });
});
