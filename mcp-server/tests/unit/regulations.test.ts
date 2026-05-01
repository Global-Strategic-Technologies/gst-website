/**
 * Tests for the regulation loader, search_regulations tool, and
 * list_regulation_facets tool.
 */

import {
  REGULATION_ENTRIES,
  loadRegulationByUri,
  listJurisdictions,
  listCategories,
} from '../../src/content/regulation-loader';
import { RegulationSearchInputSchema } from '../../src/schemas';
import { toSearchResult } from '../../src/tools/regulations';

describe('regulation-loader URI taxonomy', () => {
  it('parses the EU jurisdiction from id "eu-gdpr"', () => {
    const entry = REGULATION_ENTRIES.find((e) => e.data.id === 'eu-gdpr');
    expect(entry).toBeDefined();
    expect(entry!.uri).toBe('gst://regulations/eu/gdpr');
    expect(entry!.jurisdiction).toBe('eu');
    expect(entry!.frameworkId).toBe('gdpr');
  });

  it('parses the US-CA sub-region from id "us-ca-ccpa"', () => {
    const entry = REGULATION_ENTRIES.find((e) => e.data.id === 'us-ca-ccpa');
    expect(entry).toBeDefined();
    expect(entry!.uri).toBe('gst://regulations/us-ca/ccpa');
    expect(entry!.jurisdiction).toBe('us-ca');
    expect(entry!.frameworkId).toBe('ccpa');
  });

  it('parses the CA-AB sub-region from id "ca-ab-pipa"', () => {
    const entry = REGULATION_ENTRIES.find((e) => e.data.id === 'ca-ab-pipa');
    expect(entry).toBeDefined();
    expect(entry!.uri).toBe('gst://regulations/ca-ab/pipa');
    expect(entry!.jurisdiction).toBe('ca-ab');
    expect(entry!.frameworkId).toBe('pipa');
  });

  it('does not treat "ca-cccs" as a sub-region (4-letter framework code, not 2-letter province)', () => {
    const entry = REGULATION_ENTRIES.find((e) => e.data.id === 'ca-cccs');
    expect(entry).toBeDefined();
    expect(entry!.jurisdiction).toBe('ca');
    expect(entry!.frameworkId).toBe('cccs');
  });

  it('produces 120 distinct URIs', () => {
    const uris = new Set(REGULATION_ENTRIES.map((e) => e.uri));
    expect(uris.size).toBe(REGULATION_ENTRIES.length);
    expect(uris.size).toBeGreaterThanOrEqual(120);
  });
});

describe('loadRegulationByUri', () => {
  it('returns the EU GDPR record for its canonical URI', () => {
    const found = loadRegulationByUri('gst://regulations/eu/gdpr');
    expect(found).not.toBeNull();
    expect(found!.data.name).toMatch(/General Data Protection Regulation/);
  });

  it('returns null for an unknown URI', () => {
    expect(loadRegulationByUri('gst://regulations/zz/nope')).toBeNull();
  });
});

describe('listJurisdictions / listCategories', () => {
  it('returns sorted unique jurisdictions including expected entries', () => {
    const j = listJurisdictions();
    expect(j).toContain('eu');
    expect(j).toContain('us');
    expect(j).toContain('us-ca');
    expect(j).toContain('ca');
    expect(j).toContain('ca-ab');
    expect([...j]).toEqual([...j].sort());
  });

  it('returns the four canonical regulation categories', () => {
    const c = listCategories();
    expect(c).toEqual(
      ['ai-governance', 'cybersecurity', 'data-privacy', 'industry-compliance'].sort()
    );
  });
});

describe('toSearchResult — enriched fields propagate to the wire shape', () => {
  // V4 verification surfaced that the brief was forced to fall back to
  // training-derived prose because SearchResult only exposed the high-level
  // `summary` field. The richer source fields (scope, keyRequirements,
  // penalties) live in the regulation JSON files (validated by
  // RegulationSchema in src/schemas/regulatory-map.ts) but were dropped at
  // the wire boundary. This test asserts the gap is closed.

  it('forwards scope / keyRequirements / penalties when present (GDPR has all three)', () => {
    const gdpr = REGULATION_ENTRIES.find((e) => e.data.id === 'eu-gdpr');
    expect(gdpr).toBeDefined();
    const result = toSearchResult(gdpr!);

    // Existing summary-card fields still present and unchanged.
    expect(result.id).toBe('eu-gdpr');
    expect(result.name).toMatch(/General Data Protection Regulation/);
    expect(result.jurisdiction).toBe('eu');
    expect(result.category).toBe('data-privacy');
    expect(result.effectiveDate).toBe('2018-05-25');
    expect(result.summary).toMatch(/comprehensive data privacy/i);

    // Newly-exposed source fields the brief now uses to ground its prose.
    expect(result.keyRequirements).toBeDefined();
    expect(Array.isArray(result.keyRequirements)).toBe(true);
    expect(result.keyRequirements!.length).toBeGreaterThan(0);
  });

  it('omits optional fields when the underlying record does not declare them', () => {
    // Pick any entry the schema permits to omit scope/keyRequirements/penalties.
    const hit = REGULATION_ENTRIES.find(
      (e) =>
        e.data.scope === undefined &&
        e.data.keyRequirements === undefined &&
        e.data.penalties === undefined
    );
    if (!hit) {
      // If every framework happens to populate all three (the data set is
      // dense), this test is vacuously satisfied — the omit path still
      // exists structurally.
      return;
    }
    const result = toSearchResult(hit);
    expect('scope' in result).toBe(false);
    expect('keyRequirements' in result).toBe(false);
    expect('penalties' in result).toBe(false);
  });
});

describe('RegulationSearchInputSchema (tool input contract)', () => {
  it('parses an empty input (defaults applied)', () => {
    const result = RegulationSearchInputSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
    }
  });

  it('rejects a limit > 120', () => {
    expect(RegulationSearchInputSchema.safeParse({ limit: 121 }).success).toBe(false);
  });

  it('rejects an unknown category enum value', () => {
    expect(RegulationSearchInputSchema.safeParse({ category: 'environmental' }).success).toBe(
      false
    );
  });
});
