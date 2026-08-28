/**
 * Unit tests for the IRL section catalog — the self-documenting section list
 * embedded in the `generate_information_request_list_xlsx` tool and the
 * `gst_irl_create` prompt's section-number argument describes.
 *
 * The catalog is derived from the canonical article, so these assertions also
 * guard that the tool/prompt arg documentation can never silently drift from
 * the real sections.
 */

import { describe, it, expect } from 'vitest';
import { irlSectionCatalog } from '../../../src/content/irl-section-catalog';

describe('irlSectionCatalog', () => {
  const catalog = irlSectionCatalog();

  it('enumerates every canonical section as "NN Title"', () => {
    // Endpoints + a mid-list entry: proves the full range is present, not just
    // the two endpoints the old hardcoded describe listed.
    expect(catalog).toContain('00 Basics');
    expect(catalog).toContain('02 Software Architecture');
    expect(catalog).toContain('05 Data, Analytics & AI');
    expect(catalog).toContain('09 Governance & Compliance');
  });

  it('lists all ten two-digit section numbers', () => {
    for (const n of ['00', '01', '02', '03', '04', '05', '06', '07', '08', '09']) {
      expect(catalog, `missing section ${n}`).toMatch(new RegExp(`\\b${n} `));
    }
    // Exactly ten " · "-joined entries.
    expect(catalog.split(' · ')).toHaveLength(10);
  });

  it('does not fall back — the bundled article body is present at import time', () => {
    expect(catalog).not.toContain('see the canonical article');
  });
});
