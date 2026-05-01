/**
 * Regulatory Map deep-link round-trip parity test.
 *
 * Proves the encoder util at `src/utils/regulatory-map-url.ts` is shared
 * between the website page (which imports it) and the MCP wrapper. The
 * filter URL we build must decode back to the same filter state via the
 * util's `decodeFilters`.
 */

import { describe, it, expect } from 'vitest';
import { buildRegulatoryMapDeeplink, jurisdictionToRegion } from '../../../src/tools/regulations';
import { decodeFilters } from '../../../../src/utils/regulatory-map-url';

describe('Regulatory Map deep-link', () => {
  it('produces a URL on the HUB_BASE with both filter params when supplied', () => {
    const url = buildRegulatoryMapDeeplink({ region: 'eu', filter: 'data-privacy' });
    expect(url).toMatch(/^https?:\/\/[^/]+\/hub\/tools\/regulatory-map\/\?.+$/);
    expect(url).toContain('region=eu');
    expect(url).toContain('filter=data-privacy');
  });

  it('produces a clean URL (no query string) when no filters are supplied', () => {
    const url = buildRegulatoryMapDeeplink({});
    expect(url).toMatch(/^https?:\/\/[^/]+\/hub\/tools\/regulatory-map\/$/);
  });

  it('round-trips through the website decoder byte-identically', () => {
    const url = buildRegulatoryMapDeeplink({ region: 'us-ca', filter: 'ai-governance' });
    const search = new URL(url).search;
    const decoded = decodeFilters(search);
    expect(decoded.region).toBe('us-ca');
    expect(decoded.filter).toBe('ai-governance');
  });

  it('drops unknown filter values (matches the page validation behaviour)', () => {
    const url = buildRegulatoryMapDeeplink({ region: 'eu', filter: 'made-up-category' });
    expect(url).toContain('region=eu');
    expect(url).not.toContain('filter=');
  });

  it('omits filter when value is the literal "all"', () => {
    const url = buildRegulatoryMapDeeplink({ region: 'eu', filter: 'all' });
    expect(url).toContain('region=eu');
    expect(url).not.toContain('filter=');
  });
});

describe('jurisdictionToRegion (page-format normalization)', () => {
  // Regression guard for V2 finding #2 — the page's regionMap is keyed by
  // ISO 3166-1 alpha-3 for countries (`USA`, `GBR`) and uppercase ISO
  // 3166-2 for subnational (`US-CA`, `CA-QC`). MCP `entry.jurisdiction`
  // arrives as lowercase alpha-2 / lowercase subnational, so a deep-link
  // built directly from it silently fails to select the region on page load.

  it('maps lowercase country alpha-2 codes to uppercase alpha-3', () => {
    expect(jurisdictionToRegion('us')).toBe('USA');
    expect(jurisdictionToRegion('gb')).toBe('GBR');
    expect(jurisdictionToRegion('ca')).toBe('CAN');
    expect(jurisdictionToRegion('br')).toBe('BRA');
    expect(jurisdictionToRegion('jp')).toBe('JPN');
  });

  it('uppercases subnational codes', () => {
    expect(jurisdictionToRegion('us-ca')).toBe('US-CA');
    expect(jurisdictionToRegion('us-ny')).toBe('US-NY');
    expect(jurisdictionToRegion('ca-qc')).toBe('CA-QC');
    expect(jurisdictionToRegion('ca-ab')).toBe('CA-AB');
  });

  it('returns null for aggregate jurisdictions (no single SVG path to select)', () => {
    expect(jurisdictionToRegion('eu')).toBeNull();
    expect(jurisdictionToRegion('global')).toBeNull();
  });

  it('returns null for unknown country codes (defensive default)', () => {
    expect(jurisdictionToRegion('xx')).toBeNull();
    expect(jurisdictionToRegion('')).toBeNull();
  });

  it('end-to-end: an MCP-emitted deep-link decodes to the page-canonical region', () => {
    // The page's restoreFromUrl looks up `path[data-state-code="${region}"]`
    // case-sensitively. The MCP deep-link must therefore emit the page's
    // canonical uppercase form so that lookup matches.
    const url = buildRegulatoryMapDeeplink({
      region: jurisdictionToRegion('us-ca'),
      filter: 'data-privacy',
    });
    expect(decodeFilters(new URL(url).search).region).toBe('US-CA');
  });
});
