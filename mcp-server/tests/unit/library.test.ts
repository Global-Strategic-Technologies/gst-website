/**
 * Tests for the Library Resource loader.
 *
 * The article bodies are parallel canonical texts (digests of the live
 * website pages); see the `<article>.md` frontmatter for the drift policy.
 */

import { LIBRARY_ENTRIES, loadLibraryByUri } from '../../src/content/library-loader';

describe('LIBRARY_ENTRIES', () => {
  it('exposes all three library articles with text/markdown mime type', () => {
    expect(LIBRARY_ENTRIES.length).toBe(3);
    const slugs = LIBRARY_ENTRIES.map((e) => e.slug).sort();
    expect(slugs).toEqual(['business-architectures', 'information-request-list', 'vdr-structure']);
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

  it('the information-request-list body includes the 00 prelude and every VDR-9 section heading', () => {
    const entry = LIBRARY_ENTRIES.find((e) => e.slug === 'information-request-list');
    expect(entry).toBeDefined();
    const body = entry!.body;
    for (const heading of [
      '00 — Basics',
      '01 — Product',
      '02 — Software Architecture',
      '03 — Infrastructure & Operations',
      '04 — SDLC',
      '05 — Data, Analytics & AI',
      '06 — Security',
      '07 — People & Organization',
      '08 — Corporate IT',
      '09 — Governance & Compliance',
    ]) {
      expect(body).toContain(heading);
    }
  });
});

describe('loadLibraryByUri', () => {
  it('resolves all three canonical Library URIs', () => {
    expect(loadLibraryByUri('gst://library/business-architectures')).not.toBeNull();
    expect(loadLibraryByUri('gst://library/vdr-structure')).not.toBeNull();
    expect(loadLibraryByUri('gst://library/information-request-list')).not.toBeNull();
  });

  it('returns null for an unknown slug', () => {
    expect(loadLibraryByUri('gst://library/nope')).toBeNull();
  });
});
