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

// BL-119 rebaseline: prompt v0.0.4 -> v0.0.5 (gst_radar_brief_today gains
// Step 7, the provenance caveat). Cycle-2 UAT found the brief emitted no
// framing at all for aggregated third-party content — the requirement
// existed in the backlog, the operator runbook and the marketing copy, and
// in no surface that actually produced the content.
/**
 * The canonical manifest hash for the current registry shape. This MUST
 * match the value in `mcp-server/BREAKING_CHANGES.md`. Update both in
 * lockstep when the registry shape changes.
 */
// v0.13.1 partial-revert rebaseline: extract_irl_from_xlsx tool removed
// (cross-host Claude Desktop topology blocks bytes delivery — deferred
// indefinitely; revisit blueprint at
// src/docs/adr/0003-irl-xlsx-canonicalization-hash-bind.md;
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
// BL-076 rebaseline: prompt v0.16.0 → v0.17.0 (body-by-hash directive added
// to the envelope-composition directive + interactive Step 4 — model calls
// `prepare_irl_body` first and passes only `irlBodyHash` to
// `compose_dossier_envelope`. The `filledIrl` field is REMOVED from
// `ComposeDossierEnvelopeInputSchema` — tool names + URIs are unchanged so
// the manifest hash drift is solely the prompt name@version tuple).
// BL-086 L2 (prompt v0.18.0 → v0.19.0): manifest drifts solely from the
// gst_irl_ingestion name@version tuple bump (the new embedToolWorkedExamples
// arg is NOT part of the manifest input — only name@version + URIs are).
// authorialIntentLine reword (prompt v0.19.0 → v0.20.0): manifest drifts again
// solely from the gst_irl_ingestion tuple bump. The shared-preamble reword
// changes other prompts' bodies too, but only irl-ingestion's version bumps,
// so the manifest delta is one tuple.
// IRL decoupling rebaseline: gst_information_request_list v0.0.5 → v0.0.6 (embed +
// section catalog moved off the gst://library/information-request-list article
// onto the decoupled generator source src/data/irl/…). Manifest drifts solely
// from that one prompt name@version tuple — the gst://irl/source embed label is
// NOT a Library/Resource URI, so it is not a manifest input.
// IRL ingestion decoupling rebaseline: gst_irl_ingestion v0.20.0 → v0.21.0 (its
// IRL taxonomy embed also moved onto gst://irl/source so the library page's
// prose/promo no longer leaks into the filled-IRL reconciliation taxonomy).
// Again drifts solely from that one prompt name@version tuple.
// Per-question removal + BL-044.5 directives rebaseline:
// gst_information_request_list v0.0.6 → v0.0.7 (excludeRequests wire arg +
// server-computed omission clause; transactionContext now fires authored
// skip-if directives). Drifts solely from that one prompt name@version tuple —
// the new `list_irl_requests` TOOL is not a manifest input (tools aren't
// hashed), and the tagged source .md does NOT drift the irl-ingestion body
// hashes because embedIrlGeneratorSource strips directive comment lines
// (the embedded bytes are unchanged).
// BL-049 closeout rebaseline: gst_irl_ingestion v0.21.0 → v0.21.1 (stale
// promptVersion literal in META_JSON_FENCE_DIRECTIVE replaced with a
// server-derived placeholder). Drifts solely from that one prompt
// name@version tuple.
// Radar prompt Worker-fix rebaseline: gst_radar_brief_today v0.0.3 → v0.0.4.
// Step 2 of the body stopped keying the degraded path on the literal phrase
// 'Radar snapshot not found' (the stdio message) and now keys on the block
// being TEXT rather than an embedded resource — the phrase never appears in
// the Worker's degraded wording, so the stop-and-surface instruction silently
// failed on the transport where the snapshot is most often unavailable. The
// stdio-only `npm run radar:seed` remediation was dropped from the body for
// the same reason. Drifts solely from that one prompt name@version tuple;
// tool names and URIs are unchanged.
// Deidentification rebaseline (server 0.48.1): gst_irl_ingestion v0.22.0 →
// v0.22.1. The engagement previously named as the worked-example client is a
// real client; every occurrence repo-wide was renamed to the SanFran code
// name. Byte-only rename — no directive, gate, argument, tool, or URI
// changes. Drifts solely from that one prompt name@version tuple.
// Doubt-handling rebaseline (server 0.49.1): gst_irl_ingestion v0.22.1 →
// v0.22.2. A real 57KB Desktop run (BL-119 cycle 5) showed the client
// delivering a large expanded prompt as an attached document, which led the
// model to conclude it was reading a render rather than holding bound
// arguments and to offer a `prepare_irl_body` fallback that silently
// downgrades irlSource from server-witnessed to model-asserted. The body now
// tells it to proceed on the binding hash and to probe rather than
// reconstruct. Body-only change — no argument, tool, or URI changes; drifts
// solely from that one prompt name@version tuple.
// Workbook-column-contract rebaseline (server 0.49.2): gst_irl_ingestion
// v0.22.2 → v0.22.3. The prompt previously said nothing about the xlsx layout,
// so the model-reconstruction path and the operator-side `npm run irl:extract`
// script agreed only by coincidence — and on the first real filled workbook
// they did not, the script discarding 45.2% of the authored characters. Both
// now render the same bullet shape by instruction. Body-only change — no
// argument, tool, or URI changes; drifts solely from that one prompt
// name@version tuple.
// Scope-conditional-counters rebaseline (server 0.49.3): gst_irl_ingestion
// v0.22.3 → v0.22.4. The BL-071 precheck identities were stated flatly, as if
// the server-authoritative counter always spanned the session. On the remote
// Worker `createServer` runs per HTTP request, so the per-request counter map
// could never satisfy them — the prompt was directing operators to fail runs
// on a check that could not pass. The VERIFY block now carries `countersScope`
// and states each identity conditionally. Body-only change — no argument,
// tool, or URI changes; drifts solely from that one prompt name@version tuple.
// Flattened-body-refusal withdrawal (server 0.52.0): gst_irl_ingestion
// v0.24.0 -> v0.25.0 and gst_information_request_list v0.0.7 -> v0.0.8 — two
// tuples, not one. Blank form fields stopped failing prompt attachment across
// both prompts, so both were served new bytes. Recorded late: the 0.52.0 change
// rebaselined this constant without appending here, which is why the comment
// above it described a single-tuple drift while two had moved.
// Run-parameters rebaseline (server 0.53.0): gst_irl_ingestion v0.25.0 ->
// v0.26.0 and gst_information_request_list v0.0.8 -> v0.0.9. Every builder now
// states its resolved mode / auditLevel / transactionContext instead of leaving
// the model to infer them from what rendered, and requireVerbatimBody — inert
// on every path, with zero render-time readers — is stated where a consumer
// exists. Body-only on both prompts; no argument, tool or URI shape changed.
// TechPar mode rebaseline (server 0.54.0): gst_irl_ingestion v0.26.0 ->
// v0.27.0. The prompt named no compute_techpar mode while the tool's `mode` is
// a required enum with no default, so the model chose it per call — and the
// engine reads `rdOpEx` directly in `quick` but synthesizes it from three
// Section-02 components in `deepdive`. Two runs over one IRL took different
// branches and produced an inverted zone verdict. Body-only change on one
// prompt; drifts solely from that tuple.
// IRL extract record (server 0.56.0): SEVEN tuples, and the first entry here
// that is NOT body-only. gst_irl_ingestion v0.28.0 -> v0.29.0, and six consumer
// prompts to v0.1.0 — gst_target_quick_look and gst_comparable_engagements_memo
// and gst_diligence_kickoff and gst_diligence_handoff_memo from v0.0.3,
// gst_architecture_layer_review and gst_regulatory_exposure_brief from v0.0.1.
// The minor bump is the honest grade: these prompts now behave differently
// depending on whether canonical target evidence is in context, which is a
// behavioural change rather than reworded prose.
// TWO `orchestrates` arrays also changed in the same commit and are invisible
// here: gst_target_quick_look and gst_regulatory_exposure_brief each gained
// `list_regulation_facets`, which both bodies already directed as a
// jurisdiction-id recovery call while the manifest under-claimed it. This
// constant hashes prompt `name@version` and resource URIs only — never
// `orchestrates` — so those two edits moved no bytes here, and the
// orchestrates-to-body invariant is what guards them. Written down because it is
// the natural wrong inference: a green run of this test is not evidence that a
// prompt's tool surface held still.
// Arrival flows (server 0.57.0): gst_irl_ingestion v0.29.0 -> v0.30.0. ONE tuple.
// Step 1 stopped asking unconditionally for a filled IRL that may already be
// attached to the invoking message, and the RUN-AUDIT contract gained a
// runScenario selection rule. Body-only on one prompt; no argument, tool or URI
// shape changed, and NO orchestrates array moved — which this hash would not
// have seen either way (it covers name@version and resource URIs only).
// BL-140 (server 0.59.0, 2026-08-23): gst_irl_fill@0.1.0 ADDED — the first new
// prompt tuple since the manifest was baselined at nine. No URI moved; the
// companion tool addition (fill_information_request_list_xlsx) is invisible to
// this hash by design (tools are guarded by protocol-roundtrip's exact list).
// Trust-the-operator rebuild PR1 (server 0.60.0, 2026-08-25): gst_irl_sweep@0.1.0
// ADDED — the eleventh tuple, coexisting with gst_irl_ingestion@0.30.0 during
// the live-verification window. Removal of the old surface (that tuple plus
// the three provenance tools, which this hash never sees) is scheduled for the
// next minor after operator sign-off. No URI moved.
const EXPECTED_MANIFEST_HASH = '0b60a80d9c2c642fa24fb71af4ea3e025731053fa8bc6c9c29db87d55c693b06';

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
