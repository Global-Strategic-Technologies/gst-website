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
import {
  applyFilters,
  buildRegulatoryMapDeeplink,
  jurisdictionToRegion,
  pickSingle,
  toSearchResult,
} from '../../src/tools/regulations';
import { HUB_BASE } from '../../src/config';

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

  it('produces 123 distinct URIs', () => {
    const uris = new Set(REGULATION_ENTRIES.map((e) => e.uri));
    expect(uris.size).toBe(REGULATION_ENTRIES.length);
    expect(uris.size).toBeGreaterThanOrEqual(123);
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

describe('applyFilters relevance ranking (search_regulations)', () => {
  it('returns eu-gdpr as the top match for query="GDPR" (regression for T.B.7.a / 2026-05-10)', () => {
    // Background: prior boolean-match implementation iterated REGULATION_ENTRIES
    // in filename-alphabetical order, so BH-PDPL (whose summary mentions GDPR)
    // outranked EU-GDPR for the query "GDPR". The current implementation scores
    // by match quality so the canonical framework wins.
    const results = applyFilters({ query: 'GDPR', limit: 10 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].data.id).toBe('eu-gdpr');
  });

  it('returns eu-gdpr as the top match for query="gdpr" (case-insensitive)', () => {
    const results = applyFilters({ query: 'gdpr', limit: 10 });
    expect(results[0].data.id).toBe('eu-gdpr');
  });

  it('exact id match outranks summary-only mentions', () => {
    // ccpa is an id; many EU/UK regulations reference CCPA in their summaries.
    // The exact-id match must win.
    const results = applyFilters({ query: 'ccpa', limit: 10 });
    expect(results[0].data.id).toBe('us-ca-ccpa');
  });

  it('preserves the deterministic stable order for ties (no query)', () => {
    const all = applyFilters({ limit: 200 });
    const ids = all.map((r) => r.data.id);
    // No-query → no ranking pass; result is the upstream REGULATION_ENTRIES
    // order (filename-alphabetical).
    expect(ids).toEqual([...REGULATION_ENTRIES].map((r) => r.data.id));
  });

  it('returns an empty array when query matches nothing', () => {
    const results = applyFilters({
      query: 'xyzzy-does-not-exist-anywhere',
      limit: 10,
    });
    expect(results).toEqual([]);
  });
});

describe('applyFilters — curated aliases (BL-119 cycle 4 / 2026-08-12)', () => {
  // Background: `aliases` was added in BL-073 for `findMatchedHubFramework`
  // and was read by NOTHING else. `scoreQuery` scored id/name/summary only, so
  // every alias in the corpus was unreachable through search. Because a summary
  // mention is worth 5 and a non-matching record scores 0, a framework that
  // merely NAMED another one in its prose outranked the framework itself:
  // UAT cycle 4 found "Colorado AI Act" returning `us-nist-ai-rmf` — a
  // voluntary federal framework with no statutory penalties — in place of a
  // Colorado statute carrying $20,000 per violation.
  //
  // Each assertion below is bound to the verified pre-fix behaviour, so none of
  // them passes with the alias term removed from `scoreQuery`.

  it('resolves "Colorado AI Act" to the statute, not the framework that mentions it', () => {
    // Before: `us-nist-ai-rmf` at 5, the sole match.
    const results = applyFilters({ query: 'Colorado AI Act', limit: 10 });
    expect(results[0].data.id).toBe('us-co-ai-act');
  });

  it('resolves the partial "Colorado AI" to the statute', () => {
    // Before: `us-nist-ai-rmf` at 5, the sole match.
    const results = applyFilters({ query: 'Colorado AI', limit: 10 });
    expect(results[0].data.id).toBe('us-co-ai-act');
  });

  it('finds the statute when scoped to its own jurisdiction', () => {
    // The decisive isolation from cycle 4: scoped to `us-co`, the exact phrase
    // matched NOTHING before the fix, proving the alias was not in the index
    // rather than merely outranked.
    const results = applyFilters({
      query: 'Colorado AI Act',
      jurisdiction: ['us-co'],
      limit: 10,
    });
    expect(results.map((r) => r.data.id)).toEqual(['us-co-ai-act']);
  });

  it('resolves "EU AI Act" to eu-ai-act, not the Korean framework that mentions it', () => {
    // The second live instance of the same shape — before: `kr-ai-basic-act`
    // at 5, the sole match. The EU record's canonical name is "EU Artificial
    // Intelligence Act (Regulation 2024/1689)", which the query never matched.
    const results = applyFilters({ query: 'EU AI Act', limit: 10 });
    expect(results[0].data.id).toBe('eu-ai-act');
  });

  it('makes frameworks reachable that returned nothing at all', () => {
    // Before: both queries returned zero results.
    expect(applyFilters({ query: 'Australia Privacy Act', limit: 10 })[0].data.id).toBe(
      'au-privacy-act'
    );
    expect(applyFilters({ query: 'NIST AI RMF', limit: 10 })[0].data.id).toBe('us-nist-ai-rmf');
  });

  it('resolves the acronym "CAIA" — the min-length boundary value', () => {
    // Normalizes to exactly 4 characters, the same length as the floor, so
    // tightening the guard to require 5 normalized characters silently
    // un-fixes this. Before: zero results.
    const results = applyFilters({ query: 'CAIA', limit: 10 });
    expect(results[0].data.id).toBe('us-co-ai-act');
  });

  it('ranks gb-dpa second for "gdpr" without displacing eu-gdpr', () => {
    // The alias here is literally "UK GDPR", which is why the alias bucket sits
    // at or below the name weights rather than above them. Before the fix
    // `gb-dpa` scored 5 on a summary mention, tied with nine other records and
    // ordered by filename — it was not second.
    const results = applyFilters({ query: 'gdpr', limit: 10 });
    expect(results[0].data.id).toBe('eu-gdpr');
    expect(results[1].data.id).toBe('gb-dpa');
  });

  it('leaves punctuation-only queries untouched', () => {
    // Normalization strips non-alphanumerics, so these normalize to '' and
    // would `startsWith`-match every alias without the length floor. `"-"`
    // legitimately matches every record today (all ids contain a hyphen); the
    // five alias-bearing records must not be hoisted above the rest.
    expect(applyFilters({ query: '???', limit: 10 })).toEqual([]);

    const hyphen = applyFilters({ query: '-', limit: 200 });
    expect(hyphen.length).toBe(REGULATION_ENTRIES.length);
    expect(hyphen[0].data.id).toBe('ae-pdpl');
  });

  it('pins the length floor from BELOW — a 3-character query does not alias-match', () => {
    // BL-119 cycle 5, Gap X. Every other assertion here pins the floor from
    // ABOVE: `CAIA` and `gdpr` both normalize to exactly 4, so TIGHTENING the
    // floor breaks them loudly. Nothing pinned it from below — LOOSENING it
    // from 4 to 3 would widen alias matching across the whole corpus and every
    // existing test would still pass, because a looser floor only ever adds
    // matches.
    //
    // `cai` is the probe: three normalized characters, and a strict prefix of
    // the normalized alias `caia`. At the current floor it reaches no bucket at
    // all and the corpus returns nothing. At a floor of 3 it would prefix-match
    // that alias and surface the Colorado record. So the pair below brackets
    // the constant exactly — `cai` empty, `caia` resolving.
    expect(applyFilters({ query: 'cai', limit: 10 })).toEqual([]);
    expect(applyFilters({ query: 'caia', limit: 10 })[0].data.id).toBe('us-co-ai-act');
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

// BL-032.75 candidate-BL-040 — `jurisdiction` and `category` accept either
// a single string or an array. Backward-compatible via a Zod union+transform.
// The handler's filterDeeplink omits the corresponding URL param when an
// array has >1 element (capability-mirror with the website's single-select UI).
describe('RegulationSearchInputSchema — array filters (multi-value)', () => {
  it('normalizes a single string jurisdiction to a one-element array', () => {
    const r = RegulationSearchInputSchema.parse({ jurisdiction: 'eu' });
    expect(r.jurisdiction).toEqual(['eu']);
  });

  it('keeps a multi-element jurisdiction array as-is', () => {
    const r = RegulationSearchInputSchema.parse({ jurisdiction: ['eu', 'us'] });
    expect(r.jurisdiction).toEqual(['eu', 'us']);
  });

  it('rejects an empty jurisdiction array (.min(1))', () => {
    const r = RegulationSearchInputSchema.safeParse({ jurisdiction: [] });
    expect(r.success).toBe(false);
  });

  it('keeps a multi-element category array as-is', () => {
    const r = RegulationSearchInputSchema.parse({
      category: ['data-privacy', 'cybersecurity'],
    });
    expect(r.category).toEqual(['data-privacy', 'cybersecurity']);
  });

  it('rejects non-string-non-array jurisdiction with an invalid_union error', () => {
    // Audit-pinned: validates the union (not preprocess) design choice
    // — the union surfaces a clearer error than a single "expected array"
    // message. If a future refactor swaps to z.preprocess this test
    // would break, signaling the design regression.
    const r = RegulationSearchInputSchema.safeParse({ jurisdiction: 42 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].code).toBe('invalid_union');
    }
  });

  it('rejects an array containing invalid category enum values (closes the smuggling path)', () => {
    // The array arm validates each element against RegulationCategorySchema,
    // so invalid enum values inside an array fail just like the single-string
    // arm. Without this, an attacker could smuggle `{category: ['environmental']}`
    // past validation that the string arm rejects.
    const r = RegulationSearchInputSchema.safeParse({ category: ['environmental'] });
    expect(r.success).toBe(false);
  });
});

describe('applyFilters — multi-value array filters', () => {
  it('returns EU + US matches in one call for jurisdiction: ["eu", "us"]', () => {
    const results = applyFilters({ jurisdiction: ['eu', 'us'], limit: 200 });
    const jurisdictions = new Set(results.map((r) => r.jurisdiction));

    // Positive: at least one EU and one US entry surface (jurisdiction
    // codes are equality-matched, so `'us-ca'` does NOT match `'us'` —
    // the test uses entry.jurisdiction, not id-prefix matching, to avoid
    // that confusion).
    expect(jurisdictions.has('eu')).toBe(true);
    expect(jurisdictions.has('us')).toBe(true);

    // Negative — restrictive filter, NOT OR-everything. Every returned
    // entry's jurisdiction must be exactly 'eu' or 'us' (NOT 'us-ca',
    // 'gb', 'ca-ab', etc.). Asserting on the jurisdiction set catches
    // a regression where the filter would let every entry through (a
    // count-only assertion could miss this).
    for (const j of jurisdictions) {
      expect(['eu', 'us']).toContain(j);
    }
  });

  it('returns data-privacy + cybersecurity matches for category array, excluding the other two categories', () => {
    const results = applyFilters({
      category: ['data-privacy', 'cybersecurity'],
      limit: 200,
    });
    const categories = new Set(results.map((r) => r.data.category));

    expect(categories.has('data-privacy')).toBe(true);
    expect(categories.has('cybersecurity')).toBe(true);

    // Negative — restrictive filter must exclude the other two categories
    expect(categories.has('ai-governance')).toBe(false);
    expect(categories.has('industry-compliance')).toBe(false);
  });

  it('AND-combines facets: jurisdiction: ["eu", "us"] AND category: ["data-privacy"] returns only data-privacy entries within EU+US', () => {
    const results = applyFilters({
      jurisdiction: ['eu', 'us'],
      category: ['data-privacy'],
      limit: 200,
    });

    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.data.category).toBe('data-privacy');
      expect(['eu', 'us']).toContain(r.jurisdiction);
    }
  });
});

describe('filterDeeplink — single-value identity + multi-value omission', () => {
  // Re-derive the deeplink the way the handler does so we test the same
  // composition without going through the MCP transport.
  function deeplinkFor(input: { jurisdiction?: string | string[]; category?: string | string[] }) {
    const parsed = RegulationSearchInputSchema.parse(input);
    const singleJur = pickSingle(parsed.jurisdiction);
    const singleCat = pickSingle(parsed.category);
    return buildRegulatoryMapDeeplink({
      region: singleJur ? jurisdictionToRegion(singleJur) : null,
      filter: singleCat ?? null,
    });
  }

  it("string input 'eu' and array input ['eu'] produce byte-identical deeplinks", () => {
    // The most-valuable test in this bundle (per audit) — pins the
    // schema transform's guarantee that single-value callsites get zero
    // observable difference regardless of input shape.
    expect(deeplinkFor({ jurisdiction: 'eu' })).toBe(deeplinkFor({ jurisdiction: ['eu'] }));
  });

  it('multi-value jurisdiction array omits the region query param', () => {
    const url = new URL(deeplinkFor({ jurisdiction: ['eu', 'us'] }));
    expect(url.searchParams.has('region')).toBe(false);
  });

  it('multi-value arrays on BOTH facets collapse to the bare regulatory-map URL (no query params)', () => {
    const url = deeplinkFor({
      jurisdiction: ['eu', 'us'],
      category: ['data-privacy', 'cybersecurity'],
    });
    // Bare URL: hub-base + path with no `?...`. The
    // buildRegulatoryMapDeeplink helper returns the path alone when both
    // region + filter are null.
    expect(url).toBe(`${HUB_BASE}/hub/tools/regulatory-map/`);
  });
});
