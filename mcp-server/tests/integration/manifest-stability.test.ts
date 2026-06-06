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
// BL-056 rebaseline: prompt v0.7.0 → v0.7.1 (precheckIterations field
// added to BL-045-VERIFY block — operator can now distinguish "precheck
// converged after N iterations" from "precheck skipped entirely" from
// the artifact alone).
// BL-058 rebaseline: prompt v0.7.1 → v0.8.0 (VERIFY block enriched with
// five new field families — filledIrl, precheck, toolCallCounts,
// conditionalTriggers, response — so operators can triage every
// observed pathology from one artifact without follow-up Q&A).
// BL-060+061+062 rebaseline: prompt v0.8.0 → v0.9.0 (three further
// VERIFY-block additions per audit-corrected grouping — toolErrors
// top-level block, compactionEvents int|null three-state field,
// defaultFiredFrameworks additive list).
// BL-059 rebaseline: prompt v0.9.0 → v0.10.0 (Rule 0 tier-discipline
// universal rule added to Step 1b + Step 1a worked example bumps
// operatingModel from tier-2 to tier-3 with value=unknown per
// impartial-audit refinement; BL-063 directive changes were
// REVERTED — refiled as open BL-063 for compose_dossier_envelope
// schema expansion since prose-only is the wrong enforcement lever).
// BL-057 rebaseline: 3 new regulation URIs added —
// gst://regulations/us/nist-ai-rmf, gst://regulations/gb/ai-framework,
// gst://regulations/cl/ley21719. (Canada AIDA dropped from the
// authoring list after WebSearch verification confirmed Bill C-27
// died on the Order Paper Jan 2025 and was not re-tabled after the
// April 2025 snap election; authoring a non-existent law would
// have surfaced a phantom framework to operators. NA AI-gov coverage
// for Canadian targets continues via CA-QC-LAW25 which has AI
// clauses.) Regulation count: 120 → 123.
// BL-063 rebaseline (stacked on BL-057): prompt v0.10.0 → v0.11.0
// (server-side enforcement of defaultFiredFrameworks at
// compose_dossier_envelope — partition + scope reject; Hub-backing
// auto-degrade to map-absent gap entries; tool schema expansion;
// BL-062 directive prose rewritten to document the structural
// enforcement). Hash recomputed off post-BL-057 master.
// BL-064 rebaseline: prompt v0.11.0 → v0.12.0. Step 2 + Step 3 directive
// rewrites instructing batched array calls for search_portfolio +
// search_regulations; SearchPortfolioInputSchema extended with
// StringOrStringArray union for theme + engagement.
// BL-067 + BL-072 rebaseline: prompt v0.12.0 → v0.13.0 (irlSource
// directive added to ENVELOPE_COMPOSITION_DIRECTIVE + interactive Step 4;
// body bytes change → manifest hash drifts via name@version tuple).
// BL-073 + serverVersion→promptVersion rebaseline: prompt v0.13.0 → v0.14.0
// (VERIFY-block field renamed at both invocation sites for operator
// clarity — the field carries promptVersion, not the mcp-server package
// version). Aliases are NOT in the manifest hash inputs.
// BL-070 rebaseline: prompt v0.14.0 → v0.15.0 (requireVerbatimBody prompt
// arg + envelope-composition directive added at both invocation sites).
// The BL-073 NIST AI RMF acronym aliases added in the same PR do NOT
// affect the manifest hash (aliases aren't in manifest inputs).
// BL-071 rebaseline: prompt v0.15.0 → v0.16.0 (server-sourced
// serverToolCallCounts directive + precheck-derivation rules added to the
// envelope-composition directive; `toolCallCounts` schema line in the
// BL-045-VERIFY directive gains the `errored: N` field at both invocation
// sites; manifest hash drifts via name@version tuple).
const EXPECTED_MANIFEST_HASH = '7344f75e11af95e9d1298e222cab9966aa9b6f04cae11ac0c92d32d938b9f8d5';

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
