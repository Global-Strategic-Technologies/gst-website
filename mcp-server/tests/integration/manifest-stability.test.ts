/**
 * Manifest-stability hash test (BL-032.5 Phase 4).
 *
 * Once an MCP client has pinned `gst://library/vdr-structure` or invoked
 * `gst_target_quick_look` in a long-running conversation, the URI / prompt
 * name becomes a public contract — silently renaming it breaks every
 * pinned context across every authenticated client.
 *
 * This test computes a deterministic sha256 over the registry shape:
 *   - All Library URIs (sorted)
 *   - All Regulation URIs (sorted)
 *   - All Radar URIs (sorted)
 *   - All prompt name + version tuples (sorted)
 *
 * If the hash drifts from `EXPECTED_MANIFEST_HASH`, the test fails with a
 * clear message instructing the operator to:
 *   1. Document the rename in `mcp-server/BREAKING_CHANGES.md`
 *   2. Update `EXPECTED_MANIFEST_HASH` here AND the matching line in
 *      `BREAKING_CHANGES.md`
 *   3. Bump `mcp-server/package.json` version (semver-as-contract)
 *
 * Companion to the per-family checks in
 * `resource-uri-stability.test.ts` (which assert specific URIs +
 * counts + canaries). This test catches the union — a rename that
 * keeps the per-family count constant still trips the manifest hash.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { LIBRARY_ENTRIES } from '../../src/content/library-loader';
import { REGULATION_ENTRIES } from '../../src/content/regulation-loader';
import { RADAR_URIS } from '../../src/resources/radar';
import { ALL_PROMPTS } from '../../src/prompts/_registry';

/**
 * The canonical manifest hash for the current registry shape. This MUST
 * match the value in `mcp-server/BREAKING_CHANGES.md`. Update both in
 * lockstep when the registry shape changes.
 */
// v0.13.1 partial-revert rebaseline: extract_irl_from_xlsx tool removed
// (cross-host Claude Desktop topology blocks bytes delivery — deferred
// indefinitely; revisit blueprint at
// src/docs/development/MCP_SERVER_IRL_XLSX_CANONICALIZATION_BL-049.md;
// pending MCP spec primitive or Claude Desktop attachment-to-host
// bridge); prompt v0.5.0 → v0.5.1 (Step-0 directive removed,
// BL-045-VERIFY directive tightened per BL-052). Kept from BL-049:
// tier-fabrication enum + deriveTier (v11 Finding B closure — empirically
// validated in v12 partner-paste live exercise 2026-06-04).
const EXPECTED_MANIFEST_HASH = 'c6a2a57b210a233bd167063e4acd78e327e00454b2646d79002934f243336fb4';

function computeManifestHash(): string {
  const libraryUris = LIBRARY_ENTRIES.map((e) => e.uri).sort();
  const regulationUris = REGULATION_ENTRIES.map((e) => e.uri).sort();
  const radarUris = [...RADAR_URIS].sort();
  const promptManifest = ALL_PROMPTS.map((p) => `${p.name}@${p.version}`).sort();

  // Deterministic stringify — explicit join + separator so prompt versions
  // don't accidentally collide with URI characters.
  const canonical = JSON.stringify({
    library: libraryUris,
    regulations: regulationUris,
    radar: radarUris,
    prompts: promptManifest,
  });

  return createHash('sha256').update(canonical).digest('hex');
}

describe('manifest-stability hash', () => {
  it('matches the value committed to BREAKING_CHANGES.md', () => {
    const actual = computeManifestHash();
    if (actual !== EXPECTED_MANIFEST_HASH) {
      // Surface a long-form diagnostic so the operator knows exactly what
      // to do. The test framework will show this error on failure.
      throw new Error(
        [
          'Manifest stability hash drift detected.',
          '',
          `  Expected: ${EXPECTED_MANIFEST_HASH}`,
          `  Actual:   ${actual}`,
          '',
          'The set of Library / Regulation / Radar URIs OR prompt name+version',
          'tuples has changed. If this was intentional:',
          '',
          '  1. Document the change in `mcp-server/BREAKING_CHANGES.md` (one',
          '     bullet under a new "## <version>" section describing what',
          '     was added, renamed, or removed).',
          '  2. Update `EXPECTED_MANIFEST_HASH` in this test file to:',
          `       ${actual}`,
          '  3. Update the `## Current manifest hash` line in',
          '     `BREAKING_CHANGES.md` to the same value.',
          '  4. Bump `mcp-server/package.json` version (semver-as-contract).',
          '',
          'If this was NOT intentional, revert the registry change.',
        ].join('\n')
      );
    }
    expect(actual).toBe(EXPECTED_MANIFEST_HASH);
  });

  it('hash is deterministic across runs (sanity)', () => {
    const a = computeManifestHash();
    const b = computeManifestHash();
    expect(a).toBe(b);
  });

  it('current manifest hash covers all four registry sources', () => {
    // Smoke-test that all four arrays feed into the hash. Catches a
    // future refactor that accidentally drops one source.
    expect(LIBRARY_ENTRIES.length).toBeGreaterThan(0);
    expect(REGULATION_ENTRIES.length).toBeGreaterThan(0);
    expect(RADAR_URIS.length).toBeGreaterThan(0);
    expect(ALL_PROMPTS.length).toBeGreaterThan(0);
  });
});
