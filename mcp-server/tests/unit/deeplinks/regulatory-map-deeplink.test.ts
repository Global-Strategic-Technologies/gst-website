/**
 * Regulatory Map deep-link round-trip parity test.
 *
 * Proves the encoder util at `src/utils/regulatory-map-url.ts` is shared
 * between the website page (which imports it) and the MCP wrapper. The
 * filter URL we build must decode back to the same filter state via the
 * util's `decodeFilters`.
 */

import { describe, it, expect } from 'vitest';
import { buildRegulatoryMapDeeplink } from '../../../src/tools/regulations';
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
