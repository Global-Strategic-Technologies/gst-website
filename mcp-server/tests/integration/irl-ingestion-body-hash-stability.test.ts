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
 * author to (1) verify the body change is intentional, (2) regenerate
 * the live-exercise transcript in the golden file, and (3) update the
 * hashes here.
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
const EXPECTED_HASH_INTERACTIVE =
  '6c4bd6e58375c74b8a8bf8bf0ea955fd9449782991a9fc1b9556c2fd75573709';
const EXPECTED_HASH_ONESHOT_MINIMAL =
  'f1c7a82b2be0f40bb189028ef858d2cf224ad4d60eafd0d99a62132f0acdf729';
const EXPECTED_HASH_ONESHOT_FULL =
  'cb19d5c500a9441abdc82f09cc3302214a2019dee7f74d713b661c9b771fda5c';
const EXPECTED_HASH_EXTRACT_ONLY_MINIMAL =
  '91c0ba7f2af9bba7785a495e72da2dd8f759f0a775e5262eed805a6c0f67151a';
const EXPECTED_HASH_EXTRACT_ONLY_FULL =
  '8ae7233f48dc054db7e89b74d5d842df31f529ca79b1d654e605358d66ed0f9b';
// BL-045 PR B audit M1 — compact-verbosity coverage. Verbose-default
// scenarios above don't catch a regression where compact mode silently
// gains a verbose-only directive (PER_SECTION_JSON_FENCE_DIRECTIVE,
// PROVENANCE_FOOTER_DIRECTIVE, PROVENANCE_CITATION_SELF_CHECK_DIRECTIVE).
// These two scenarios hash-lock the compact-mode bodies.
// Rebaselined for BL-055 hash-bind discipline split (prompt 0.5.2 → 0.5.3).
// Compact bodies include the directive annotations + verify-block schema
// expansion same as verbose.
const EXPECTED_HASH_ONESHOT_FULL_COMPACT =
  'ca28dad47ed8056bd6a3d02cef5241770f16e9394a66d8a1de89b2bee257e669';
const EXPECTED_HASH_EXTRACT_ONLY_FULL_COMPACT =
  '114d59487290d10f81e6bea895f1f266023264252978091523bbb5c04d874e81';

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
  {
    name: 'one-shot full + verbosity=compact (audit M1)',
    args: {
      targetName: 'TestCo',
      filledIrl: STABLE_FILLED_IRL,
      transactionContext: 'buy-side',
      partnerLead: 'Reid Peryam',
      projectCodeName: 'Cygnet',
      verbosity: 'compact',
    },
    expected: EXPECTED_HASH_ONESHOT_FULL_COMPACT,
  },
  {
    name: 'extract-only full + verbosity=compact (audit M1)',
    args: {
      targetName: 'TestCo',
      filledIrl: STABLE_FILLED_IRL,
      transactionContext: 'value-creation',
      partnerLead: 'Reid Peryam',
      projectCodeName: 'Cygnet',
      mode: 'extract-only',
      verbosity: 'compact',
    },
    expected: EXPECTED_HASH_EXTRACT_ONLY_FULL_COMPACT,
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
