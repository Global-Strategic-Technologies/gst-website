/**
 * Prompt-body hash stability test for `gst_irl_ingestion`.
 *
 * **Why this test exists** (post-demo audit, 2026-05-22):
 *
 * Most regression tests in `tests/unit/prompts/irl-ingestion.test.ts`
 * are string-presence assertions (`expect(text).toContain('...')`,
 * `expect(text).toMatch(/.../)`). Per
 * [`src/docs/testing/TEST_BEST_PRACTICES.md`] § 2, this is the classic
 * "testing UI presence, not behavior" anti-pattern adapted to text — it
 * catches when a literal string disappears but not when the surrounding
 * directive subtly weakens (e.g., the v0.0.2 `Capture` → v0.0.3 `Surface`
 * verb change that the model treated differently).
 *
 * This test takes the structural-fix approach: hash the entire rendered
 * prompt-body output for representative argument sets, and require any
 * change to land in CI with a deliberate hash bump. Same pattern as
 * `manifest-stability.test.ts`, applied to prompt bodies.
 *
 * **What this catches**: any non-trivial change to the `gst_irl_ingestion`
 * prompt body — including the kind of soft-directive regressions that
 * existing string-match tests miss. The diagnostic forces the change
 * author to (1) verify the body change is intentional and (2) update the
 * hashes here.
 *
 * It used to say (2) was "regenerate the live-exercise transcript in the
 * golden file". That instruction was stale and is removed (BL-112): the
 * golden file itself records, as a statement of constraint under BL-108,
 * that it is a **historical transcript, not a current-body snapshot** —
 * re-recording needs a human-driven live exercise against a real MCP
 * client and cannot happen in-session or in CI, and nothing depends on it
 * being current (`golden-snapshots.test.ts` asserts existence, four
 * frontmatter keys and `promptName` — never `version` or body). Telling
 * authors to do the impossible is how the un-actioned "PENDING re-record"
 * marker sat there from BL-045 to BL-108.
 *
 * **When to update the EXPECTED hashes**: when you've intentionally
 * changed the prompt body — e.g., a v0.0.X version bump landed via the
 * BL-032 / BL-043 prompt-iteration discipline. The test failure message
 * surfaces the actual hashes so you can paste them in.
 *
 * **Failure mode this is NOT designed for**: this test is INTENTIONALLY
 * brittle. Every comma change breaks it. That's the point — the only
 * way to land a prompt-body change is to explicitly acknowledge it.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { irlIngestionPrompt } from '../../src/prompts/irl-ingestion';

/** Stable representative filledIrl payload — short, deterministic, kept under 500 chars so the hash output is reproducible across machines. */
const STABLE_FILLED_IRL = `# IRL — TestCo (returned 2026-05-22)

## 00 — Basics
- Company name: TestCo, Inc.
- Engagement context: buy-side review
- Annual recurring revenue: $45.2M
- Business model: B2B SaaS

## 02 — Software Architecture
- Engineering FTE count: 58 total — 38 product + 8 SRE + 3 security + 7 data + 2 platform DX
- Average fully-loaded engineering salary: $232k US

## 04 — SDLC
- MTTR: P0 2.4h, P1 7.8h
`;

/**
 * Hash a prompt build() result deterministically. Concatenates every
 * text and resource content block in order, joining with a newline so
 * resource embeddings contribute to the hash too.
 */
function hashPromptOutput(args: Parameters<typeof irlIngestionPrompt.build>[0]): string {
  const result = irlIngestionPrompt.build(args);
  const canonical = result.messages
    .map((m) => {
      if (m.content.type === 'text') return m.content.text;
      if (m.content.type === 'resource') {
        // Include URI + a hash of the resource body (embedded Library
        // article content). This means Library article changes also
        // trigger this test — which is the desired behavior, since the
        // sweep's behavior depends on the embedded article shape.
        const r = m.content.resource;
        // The MCP SDK types `resource` as a union of `{ text }` vs `{ blob }`
        // variants. Narrow with `'text' in r` to access the text variant.
        const text = 'text' in r && typeof r.text === 'string' ? r.text : '';
        const bodyHash = createHash('sha256').update(text).digest('hex').slice(0, 16);
        return `[resource:${r.uri}#${bodyHash}]`;
      }
      return '';
    })
    .join('\n---\n');
  return createHash('sha256').update(canonical).digest('hex');
}

// ─── Expected hashes for the gst_irl_ingestion@0.1.0 body shape ─────────
//
// These are the canonical hashes for three representative invocations.
// Update in lockstep with intentional prompt-body changes (the test
// failure message tells you exactly what to paste).
//
// Re-baselined under BL-045 PR B for the rename + scenario-neutral
// description + version 0.1.0. Body shape otherwise structurally
// identical to gst_diligence_sweep@0.0.5 at this point; subsequent
// PR B commits (mode args, inclusion gates, JSON fences, meta fence,
// provenance footer, gap list, etc.) will re-baseline again.
// BL-045 PR B body-rewrite scenarios — design doc § Body rendering strategy
// raises the scenario count from 3 to 5 so both mode branches (full +
// extract-only) are independently hash-locked.
// Re-baselined for BL-049 prompt v0.5.0:
//   - Interactive body: Step-0 xlsx ingestion path + xlsx-canonicalized
//     args + BL-045-VERIFY block schema.
//   - One-shot bodies (full mode, verbose): ENVELOPE_COMPOSITION_DIRECTIVE
//     gained irlBodyHash/irlSource/receipt input fields; new
//     BL_045_VERIFY_DIRECTIVE appended after envelope.
//   - Extract-only bodies (verbose): BL_045_VERIFY_DIRECTIVE appended.
//   - lastReviewedAt bumped 2026-06-01 → 2026-06-04 (no body hash impact
//     unless body builders embed the date — they currently don't).
// Rebaselined for v0.13.1 + BL-055 hash-bind discipline split
// (prompt 0.6.2 → 0.7.0). BL-053 array-form coaching + tier-discipline
// message improvements (post-merge code-review follow-ups):
//   - ENVELOPE_PRECHECK_DIRECTIVE (oneshot verbose) gains a paragraph
//     coaching the model on when to use the BL-053 array-form citation
//     and warning against the demote-to-singles dodge that would
//     undercut the strict any-unverified-wins aggregation rule.
//   - INTERACTIVE_BODY Step 3a gains a single-sentence array-form
//     mention for symmetry with the standalone directive.
//   - tier-mismatch and tier-fabrication auto-append messages branch
//     on derived tier so partner-supplied arrays receive an accurate
//     diagnostic (not "not a substring of the IRL body") and array-form
//     failures surface the element count.
// 3 envelope-bearing verbose body shapes drift; extract-only + compact
// paths don't include the precheck directive so their hashes are unchanged.
// Rebaselined for BL-056 prompt v0.7.0 → v0.7.1: precheckIterations field
// added to both BL-045-VERIFY block schemas (oneshot + interactive) plus
// one rule bullet in each rules section. All seven hashes drift because
// the verify-block schema and its rules section appear in every body
// path (full/extract-only × verbose/compact × interactive).
// Rebaselined for BL-058 prompt v0.7.1 → v0.8.0: enriched VERIFY block.
// Five new field families added to both verify-block schemas (filledIrl,
// precheck, toolCallCounts, conditionalTriggers, response) replacing the
// flat precheckIterations / conditionalTriggersFired / gatesElided forms;
// matching rule-discipline prose added/expanded. All seven body hashes
// + the manifest hash drift because the verify-block schema appears in
// every body path.
// Rebaselined for BL-060+061+062 prompt v0.8.0 → v0.9.0: three
// additional VERIFY-block fields landing in one PR per audit-corrected
// grouping. toolErrors (BL-060) — top-level per-attempt failure log
// partitioned from precheck.errorsEncountered with arithmetic ground-
// truth check. compactionEvents (BL-061) — int|null three-state field
// in response: block with epistemic-honesty correction (null preferable
// to 0 under uncertainty). defaultFiredFrameworks (BL-062) — additive
// list in conditionalTriggers: block resolving the considered:-vocabulary
// collision between BL-058's broad name and the directive's narrow
// conditional-trigger taxonomy (Option A chosen; Option B rejected as
// breaking change to BL-058 consumers).
// Rebaselined for BL-059 prompt v0.9.0 → v0.10.0: Rule 0 tier-discipline
// universal rule added to Step 1b (generate_diligence_agenda coaching) +
// Step 1a worked example bumps operatingModel from tier-2 to tier-3 +
// value to "unknown" per impartial-audit refinement (illustrates the
// schema-enforced value=unknown ⇒ tier=3 coupling that drove ~2 retries
// per call in the 2026-06-04 retest). BL-063 directive changes that
// were initially in this branch were REVERTED — server-side enforcement
// is the right lever per audit; refiled as open BL-063 for
// compose_dossier_envelope schema expansion. As a result, only the 3
// one-shot body hashes drift (Step 1a/1b live in buildFullBody);
// interactive and extract-only body hashes are unchanged.
// Rebaselined for BL-063 prompt v0.10.0 → v0.11.0: server-side
// enforcement of defaultFiredFrameworks shipped (partition + scope
// reject; Hub-backing auto-degrade to map-absent gap entries). The
// prompt body's BL-062 directive prose at the verify-block site is
// rewritten to document the now-structural enforcement (model knows
// the tool will reject/auto-append). The prose change lives in both
// verify-block sites (one-shot directive + interactive Step 5) so
// ALL 7 body hashes drift this rebaseline.
// Rebaselined for BL-064 prompt v0.11.0 → v0.12.0: batch-call discipline
// for search_regulations + search_portfolio. Step 2 + Step 3 directives
// rewritten to instruct ONE call with array filters (`theme: [...]`,
// `engagement: [...]`, `jurisdiction: [...]`, `category: [...]`) instead
// of N sequential per-arg calls. Interactive body Step 2b + Step 2c
// also rewritten. Extract-only body bullets at lines 926-927 changed
// but extract-only build path doesn't embed those bullets (verified by
// hash test — only the 4 full-body / interactive scenarios drift; the 3
// extract-only scenarios stay stable).
// BL-067 + BL-072 rebaseline (prompt 0.12.0 → 0.13.0): Step 4 of the
// interactive body and the shared ENVELOPE_COMPOSITION_DIRECTIVE
// gained an `irlSource` directive sentence + the irlSource arg in the
// listed envelope inputs. Only the 3 verbose-mode bodies (interactive
// + one-shot minimal + one-shot full) drift; compact-mode bodies skip
// the envelope directive entirely (per directive header "BLOCKING —
// full mode + verbose verbosity only"), so the COMPACT + EXTRACT_ONLY
// hashes are unchanged.
// BL-073 + rename rebaseline (prompt 0.13.0 → 0.14.0): the BL-045-VERIFY
// directive's YAML field `serverVersion:` was renamed to `promptVersion:`
// at BOTH invocation sites (one-shot line 459 + interactive line 946)
// with expanded inline guidance ("NOT the mcp-server package version").
// The verify directive ships in EVERY body shape, so all 7 hashes drift
// in this rebaseline (not just the 3 verbose-mode ones that BL-067+BL-072
// touched).
// BL-070 rebaseline (prompt 0.14.0 → 0.15.0): added requireVerbatimBody
// arg + envelope-composition directive at both invocation sites.
// Verbose-mode bodies drift (interactive + one-shot minimal + one-shot
// full); compact-mode + extract-only skip the envelope directive entirely
// per its header (BLOCKING — full mode + verbose verbosity only).
// BL-071 rebaseline (prompt 0.15.0 → 0.16.0): server-sourced
// serverToolCallCounts directive added to the envelope-composition directive
// (verbose paths) AND the `toolCallCounts` schema line in the
// BL-045-VERIFY directive (every body shape) — now carries the BL-071
// `errored: N` field + a "copy VERBATIM from compose_dossier_envelope
// output `serverToolCallCounts`" comment + precheck-derivation rule. Because
// the verify directive ships in EVERY body, ALL 7 hashes drift.
// BL-076 rebaseline (prompt 0.16.0 → 0.17.0): body-by-hash directive added
// to the envelope-composition directive AND interactive Step 4. Instructs
// the model to call `prepare_irl_body` first + drop `filledIrl` from the
// `compose_dossier_envelope` arg list. The 3 verbose-mode body shapes
// (interactive + one-shot minimal + one-shot full) drift; compact + extract-
// only paths skip the envelope-composition directive per its header
// (`BLOCKING — full mode + verbose verbosity only`).
// BL-086 L0+L1 rebaseline (prompt v0.18.0, unchanged version): L0 cosmetic
// vocabulary cleanup + L1 mode-conditional prose removal. Both halves touch
// verbose-mode shared directives (ENVELOPE_PRECHECK_DIRECTIVE +
// ENVELOPE_COMPOSITION_DIRECTIVE) and the interactive Step 4. Only the 3
// verbose-mode bodies drift (interactive + one-shot minimal + one-shot full);
// compact + extract-only paths skip the envelope-composition directive per its
// header (`BLOCKING — full mode + verbosity verbose only`). promptVersion stays
// at 0.18.0 — L0/L1 are not promptVersion-bumpable per the BL-086 doc.
// BL-086 L2 rebaseline (prompt v0.18.0 → v0.19.0): the Step 1a / 4a / 6a
// worked-example JSON megapayloads are now elided by default and gated behind
// the new `embedToolWorkedExamples` arg. The examples live ONLY in
// buildOneShotBody and are NOT verbosity-gated, so all three one-shot bodies
// drift (minimal + full + full-compact); interactive and the 3 extract-only
// bodies are unchanged. (The BL-086 design doc's "all 7 drift" prediction was
// inaccurate — extract-only does not embed these blocks.)
// authorialIntentLine reword rebaseline (prompt v0.19.0 → v0.20.0): the shared
// authorial-intent preamble (embed.ts) was reworded to drop the "proceed
// without hedging about prompt provenance" injection-tell that triggered a
// live v4.7+ refusal (2026-06-30). The preamble leads EVERY body variant, so
// all 7 hashes drift this time (interactive + 3 one-shot + 3 extract-only).
// IRL decoupling rebaseline (prompt v0.20.0 → v0.21.0): the second (IRL taxonomy)
// embed moved off the gst://library/information-request-list article onto the
// decoupled generator source (inline label gst://irl/source). All 7 hashes drift
// — the embedded resource block (URI + body hash) is present in every body shape,
// and the "embedded for taxonomy reference" provenance sentence was reworded in
// both the one-shot and interactive bodies. (The VDR embed is unchanged.)
// Rebaselined 2026-07-08 (per-question removal / BL-044.5 branch): the prior
// committed generator-source bundle was a stale Windows regen carrying CRLF
// escapes in the embedded body; CI regenerates deterministically to LF (the
// codegen normalizes, `generate-regulations-index.mjs:226,267`). The clean
// LF bundle is now committed and these hashes match what CI produces. The
// gst_information_request_list embed-strip means the new skip-if tag itself
// does NOT change the tag-free bytes (the prompt embed-strip unit test locks
// that) — this rebaseline is line-ending hygiene, not a body-semantics change.
// BL-049 closeout rebaseline (prompt v0.21.0 → v0.21.1, 2026-07-09): the stale
// `promptVersion: "0.4.0"` literal in META_JSON_FENCE_DIRECTIVE was replaced
// with a server-derived placeholder. That directive appears only in the
// one-shot and extract-only bodies, so 6 of 7 hashes drift — the interactive
// hash is unchanged (deliberately NOT interpolating the live version constant,
// which would churn these hashes on every future version bump).
// BL-108 rebaseline (prompt v0.21.1, UNCHANGED version, 2026-08-04): Step 2's
// portfolio-theme examples were invented values — `"Financial Services"` in the
// seed list and `["Healthcare", "Life Sciences"]` in the worked example — neither
// of which is a real theme, in a sentence that instructs the model NOT to guess at
// labels. The stale "57-engagement" count was dropped rather than corrected to 65,
// so it cannot rot again (interpolating the live count would couple these hashes to
// `projects.json`, reddening CI on a routine portfolio edit that never touched the
// server). Step 2 lives ONLY in `buildOneShotBody`, and the interactive body's
// equivalent (Step 2b) carries no invented values, so exactly the 3 one-shot hashes
// drift — minimal + full + full-compact.
//
// promptVersion deliberately NOT bumped, following the BL-086 L0/L1 precedent
// above: every directive, its semantics and its structure are untouched: only
// illustrative data values changed. Contrast BL-064, which DID bump (0.11.0 →
// 0.12.0) for this same line — it *introduced* the batched-array directive, a
// structural rewrite. Preserving that batching clause verbatim is precisely what
// keeps this edit in the no-bump class; delete it and the bump is owed. Holding the
// version steady also keeps the resource/prompt manifest hash unchanged.
//
// BL-112 rebaseline (prompt v0.21.1 → v0.22.0, 2026-08-06): this one IS a bump, and
// the line above says why. Step 3's worked example moved `limit: 50` → `limit: 20`,
// which alone would be the no-bump class — but the edit also ADDS directives (keep
// `limit` at or near its default; on `returned < totalMatched`, narrow by category
// and issue a second batched call rather than raising `limit`), and that recovery
// path supersedes the old absolute "batched into a single call". New semantics, so
// the bump is owed under this file's own rule, and `EXPECTED_MANIFEST_HASH` in
// manifest-stability.test.ts moves with it.
//
// Why the edit: `search_regulations` at `limit: 50` returns ~153,200 characters —
// 1.07x the 143,027-character response that already exceeded a real client's
// tool-result ceiling (BL-109). The prompt was instructing a call that lands past a
// known failure point, in a client-facing dossier workflow. Same 3 one-shot hashes
// drift; the interactive body carries no Step 3 worked example.
//
// Deidentification rebaseline (prompt v0.22.0 → v0.22.1, server 0.48.1): the
// engagement previously named as the worked-example client is a real client;
// all occurrences were renamed to the SanFran code name. Byte-only rename in
// the Step 3 / extraction-rules worked examples — no directive or semantic
// change, so by this file's own rule the edit is bump-optional; the bump was
// taken anyway because the served bytes changed in a client-visible surface
// and the discipline pins every served-body change to a version. 6 of 7
// hashes drift (the interactive body carries no worked examples).
// BL-119 cycle 5 rebaseline (prompt v0.22.1 → v0.22.2, server 0.49.1):
// doubt-handling directive added to the prepop body-submission block — proceed
// on the `**Body-binding hash:**` directive when a client delivers the expanded
// prompt as an attached document, probe with `validate_irl_provenance` rather
// than reconstruct, and report `partner-paste-verbatim` honestly on a genuine
// cache miss. Added by a real 57KB Desktop run that succeeded only after
// operator intervention. The directive lives in the **verbose-only envelope
// block**, so exactly the 2 one-shot verbose bodies drift (minimal + full);
// interactive, both extract-only bodies and both compact bodies are unchanged.
// Note the limit of that signal: interactive and the compact bodies drop the
// whole verbose envelope block via the `isVerbose` gate, so an edit anywhere
// inside precheck-or-composition produces this same 2-of-7 signature. It
// confirms the edit stayed inside that block; it does not by itself localize
// it to the prepop directives.
// BL-120 rebaseline (prompt v0.22.2 → v0.22.3, server 0.49.2): the workbook
// column contract — seven columns, D/E/F carry authored content, Comments joins
// Response into one contiguous answer span, Source/Note stay outside the answer
// slot — plus the fill-ratio counting order and the substantive-answer wording
// on inclusion gates 2/4/6. **All 7 hashes drift**, which is itself the check:
// the contract is deliberately unconditional, so a 6-of-7 or 4-of-7 signature
// here would mean it failed to reach a served body. Interactive is included
// even though it carries neither pre-flight nor gates, because its own VERIFY
// block admits `xlsx-reconstruction` — a path that can reconstruct from a
// workbook has to know the workbook's shape.
//
// Re-baselined once more inside the same version (still 0.22.3) after code
// review: the envelope schema's fill-ratio field descriptions still defined the
// numerator as Response cells, section (A)'s completeness sentence still said
// "Response cells filled", and the contract was silent on three things the
// extractor does (empty Status reads as OPEN, cells are trimmed, the operator
// script adds a title/metadata preamble the model does not). Prompt-body bytes
// moved; no name@version tuple did, so EXPECTED_MANIFEST_HASH is unchanged.
//
// And a THIRD time, still 0.22.3: the review-fix commit rewrote `joinAnswerSpan`'s
// period rule but left the contract stating the rule it replaced — 6 of 12
// realistic cell endings diverged, so a contract-following model would have
// produced different bytes from the script on exactly the inputs the rewrite
// existed to fix. The contract now states the shipped rule, and
// `irl-ingestion-fixtures.test.ts` asserts that sentence so the next rewrite
// cannot skip it silently.
//
// BL-121 rebaseline (prompt v0.22.3 → v0.22.4, server 0.49.3): `countersScope`
// added to the VERIFY schema, and the BL-071 precheck identities restated as
// scope-conditional — on the remote Worker `createServer` runs per HTTP request,
// so the per-request counter map could never satisfy them and the prompt was
// telling operators to fail runs on a check that could not pass. Also pins the
// transport-classed `errorsEncountered` subset closed (`transport-timeout`,
// `transport-disconnect`) so the reconciliation stays arithmetic, and qualifies
// the `toolErrors` count identity by scope.
// **All 7 hashes drift**, and that is the check: the VERIFY schema and its
// discipline rules ship from both builders regardless of verbosity, and the
// interactive body carries its own complete copy of both. A 5-of-7 or 2-of-7
// signature here would mean an edit failed to reach a served body — which is
// precisely the defect class this change is fixing, one layer down.
//
// Re-baselined once IN PLACE, still 0.22.4 (unpushed, so no bytes have been
// served — the bump-vs-rebaseline rule in BREAKING_CHANGES.md permits this).
// Code review found the counter guidance asymmetric: three causes were given
// for a count SHORT of the model's memory and none for a count LONG of it,
// while the model was told not to adjust the numbers. Since the run key is the
// IRL body hash and the row lives 4h, a repeat ingestion of identical bytes
// accumulates onto the same row — so a long count is reachable in ordinary
// operation and the model had no sanctioned way to report it. All 7 drift
// again; the `run` scope definition now states the window and the body-keying
// in every body.
const EXPECTED_HASH_INTERACTIVE =
  '5fe608381f499d9bcb0182c3125f7e21da2414d76a25db378751f7b84646a29c';
const EXPECTED_HASH_ONESHOT_MINIMAL =
  'b16c284d6761632608eb2e4af499af7dd1002c0aad00e7b14651d984c3b9143c';
const EXPECTED_HASH_ONESHOT_FULL =
  'b0aa927acef8072304f21102d767671d364a91b70e355baeb942672bded3eb98';
const EXPECTED_HASH_EXTRACT_ONLY_MINIMAL =
  '41256accaa53fe7089305fec9637c2b40d0898659256016ca866fd734d5eea8a';
const EXPECTED_HASH_EXTRACT_ONLY_FULL =
  '211bdb9ba930c94ffe2bdde5e57737e5483e7756f881cdeb8a3dca8c199f9ac4';
// BL-045 PR B audit M1 — compact-verbosity coverage. Verbose-default
// scenarios above don't catch a regression where compact mode silently
// gains a verbose-only directive (PER_SECTION_JSON_FENCE_DIRECTIVE,
// PROVENANCE_FOOTER_DIRECTIVE, PROVENANCE_CITATION_SELF_CHECK_DIRECTIVE).
// These two scenarios hash-lock the compact-mode bodies.
// Rebaselined for BL-055 hash-bind discipline split (prompt 0.5.2 → 0.5.3).
// Compact bodies include the directive annotations + verify-block schema
// expansion same as verbose.
// BL-120: both compact bodies drift too — the column contract sits outside the
// `isVerbose` gate by design.
const EXPECTED_HASH_ONESHOT_FULL_ENHANCED =
  '419f1d71b3afa07c5027cd7e9a6a2f6a34d81f2150eb49dc904e1c784d74975e';
const EXPECTED_HASH_ONESHOT_FULL_DEBUG =
  '192f5a9cb1da4ff6e8b650ed38b0c82ffc28a0c3e30a65a67b219b2131faec9c';
const EXPECTED_HASH_INTERACTIVE_DEBUG =
  'd09bed893d4c1b5865396783b319c720a67192f4cbc1e15039d2dd049fb3ad75';
// extract-only is exempt from the audit gate, so its body is byte-identical at
// every level. Reference the constant rather than repeating the literal: that
// makes the scenario name's claim structural instead of two values that can
// silently drift apart.
const EXPECTED_HASH_EXTRACT_ONLY_FULL_DEBUG = EXPECTED_HASH_EXTRACT_ONLY_FULL;

interface Scenario {
  name: string;
  args: Parameters<typeof irlIngestionPrompt.build>[0];
  expected: string;
}

const SCENARIOS: Scenario[] = [
  {
    name: 'interactive (no args)',
    args: {},
    expected: EXPECTED_HASH_INTERACTIVE,
  },
  {
    name: 'one-shot minimal (filledIrl only)',
    args: { filledIrl: STABLE_FILLED_IRL },
    expected: EXPECTED_HASH_ONESHOT_MINIMAL,
  },
  {
    name: 'one-shot full (all five args)',
    args: {
      targetName: 'TestCo',
      filledIrl: STABLE_FILLED_IRL,
      transactionContext: 'buy-side',
      partnerLead: 'Reid Peryam',
      projectCodeName: 'Cygnet',
    },
    expected: EXPECTED_HASH_ONESHOT_FULL,
  },
  {
    name: 'extract-only minimal (filledIrl + mode)',
    args: { filledIrl: STABLE_FILLED_IRL, mode: 'extract-only' },
    expected: EXPECTED_HASH_EXTRACT_ONLY_MINIMAL,
  },
  {
    name: 'extract-only full (all five args + mode)',
    args: {
      targetName: 'TestCo',
      filledIrl: STABLE_FILLED_IRL,
      transactionContext: 'value-creation',
      partnerLead: 'Reid Peryam',
      projectCodeName: 'Cygnet',
      mode: 'extract-only',
    },
    expected: EXPECTED_HASH_EXTRACT_ONLY_FULL,
  },
  // BL-122 — the two `verbosity: compact` scenarios are replaced by coverage of
  // all three audit levels. `standard` is the default and is already covered by
  // the minimal/full scenarios above, so these pin the two levels that ADD to
  // it, plus an interactive body at debug (the path that could not honour the
  // level at all until the builder conversion).
  {
    name: 'one-shot full + auditLevel=enhanced',
    args: {
      targetName: 'TestCo',
      filledIrl: STABLE_FILLED_IRL,
      transactionContext: 'buy-side',
      partnerLead: 'Reid Peryam',
      projectCodeName: 'Cygnet',
      auditLevel: 'enhanced',
    },
    expected: EXPECTED_HASH_ONESHOT_FULL_ENHANCED,
  },
  {
    name: 'one-shot full + auditLevel=debug',
    args: {
      targetName: 'TestCo',
      filledIrl: STABLE_FILLED_IRL,
      transactionContext: 'buy-side',
      partnerLead: 'Reid Peryam',
      projectCodeName: 'Cygnet',
      auditLevel: 'debug',
    },
    expected: EXPECTED_HASH_ONESHOT_FULL_DEBUG,
  },
  {
    name: 'interactive + auditLevel=debug',
    args: { auditLevel: 'debug' },
    expected: EXPECTED_HASH_INTERACTIVE_DEBUG,
  },
  {
    name: 'extract-only full + auditLevel=debug (exempt: identical shape at every level)',
    args: {
      targetName: 'TestCo',
      filledIrl: STABLE_FILLED_IRL,
      transactionContext: 'value-creation',
      partnerLead: 'Reid Peryam',
      projectCodeName: 'Cygnet',
      mode: 'extract-only',
      auditLevel: 'debug',
    },
    expected: EXPECTED_HASH_EXTRACT_ONLY_FULL_DEBUG,
  },
];

describe('gst_irl_ingestion — prompt-body hash stability', () => {
  for (const scenario of SCENARIOS) {
    it(`hash matches the committed value for: ${scenario.name}`, () => {
      const actual = hashPromptOutput(scenario.args);
      if (actual !== scenario.expected) {
        throw new Error(
          [
            `Prompt-body hash drift detected for scenario: ${scenario.name}`,
            '',
            `  Expected: ${scenario.expected}`,
            `  Actual:   ${actual}`,
            '',
            'The `gst_irl_ingestion` prompt body changed since the hash was committed.',
            'If this change was INTENTIONAL:',
            '',
            '  1. Verify the change matches the v0.0.X version bump described in',
            "     `mcp-server/BREAKING_CHANGES.md`'s most recent entry.",
            '  2. Update the corresponding EXPECTED_HASH_* constant at the top of',
            '     this file to the actual value above.',
            '  3. Regenerate the live-exercise transcript in',
            '     `mcp-server/tests/examples/irl-ingestion.golden.md` against the new body.',
            '  4. Bump `mcp-server/src/prompts/irl-ingestion.ts` `version` field if',
            '     not already bumped, and `mcp-server/package.json` version per the',
            '     semver-as-contract discipline.',
            '',
            'If this change was NOT intentional, the prompt body was edited inadvertently',
            '(merge conflict, copy-paste error, etc.) — revert the change.',
          ].join('\n')
        );
      }
      expect(actual).toBe(scenario.expected);
    });
  }

  it('hash is deterministic across multiple invocations (sanity)', () => {
    for (const scenario of SCENARIOS) {
      const a = hashPromptOutput(scenario.args);
      const b = hashPromptOutput(scenario.args);
      expect(a).toBe(b);
    }
  });

  it('rejects empty resource bodies (regression: the Library article must be embedded)', () => {
    // The hash incorporates embedded Library resource bodies. If the
    // codegen step fails and the article body is empty, the resource
    // hash will be the empty-string hash — which would silently corrupt
    // the prompt-body hash. This test guards that boundary.
    const result = irlIngestionPrompt.build({});
    for (const msg of result.messages) {
      if (msg.content.type === 'resource') {
        const r = msg.content.resource;
        expect('text' in r).toBe(true);
        if ('text' in r) {
          expect(typeof r.text).toBe('string');
          expect(r.text.length).toBeGreaterThan(500);
        }
      }
    }
  });
});
