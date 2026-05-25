/**
 * Prompt-body hash stability test for `gst_diligence_sweep`.
 *
 * **Why this test exists** (post-demo audit, 2026-05-22):
 *
 * Most regression tests in `tests/unit/prompts/diligence-sweep.test.ts`
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
 * **What this catches**: any non-trivial change to the `gst_diligence_sweep`
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
import { diligenceSweepPrompt } from '../../src/prompts/diligence-sweep';

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
function hashPromptOutput(args: Parameters<typeof diligenceSweepPrompt.build>[0]): string {
  const result = diligenceSweepPrompt.build(args);
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

// ─── Expected hashes for the v0.0.4 body shape ───────────────────────────
//
// These are the canonical hashes for three representative invocations.
// Update in lockstep with intentional prompt-body changes (the test
// failure message tells you exactly what to paste).
const EXPECTED_HASH_INTERACTIVE =
  '473dcc770ea0c9dcf9e292e43de9843a30a261531f4aa9d548abbd9f9d355eb1';
const EXPECTED_HASH_ONESHOT_MINIMAL =
  'e71a43708b458147b05e760599617f3b7b66ada966dc77cdfd5c62c989c48859';
const EXPECTED_HASH_ONESHOT_FULL =
  'b5c0eadc724051975853bbfbf29912d11ee5da2168567fda46e28077c9b78851';

interface Scenario {
  name: string;
  args: Parameters<typeof diligenceSweepPrompt.build>[0];
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
];

describe('gst_diligence_sweep — prompt-body hash stability', () => {
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
            'The `gst_diligence_sweep` prompt body changed since the hash was committed.',
            'If this change was INTENTIONAL:',
            '',
            '  1. Verify the change matches the v0.0.X version bump described in',
            "     `mcp-server/BREAKING_CHANGES.md`'s most recent entry.",
            '  2. Update the corresponding EXPECTED_HASH_* constant at the top of',
            '     this file to the actual value above.',
            '  3. Regenerate the live-exercise transcript in',
            '     `mcp-server/tests/examples/diligence-sweep.golden.md` against the new body.',
            '  4. Bump `mcp-server/src/prompts/diligence-sweep.ts` `version` field if',
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
    const result = diligenceSweepPrompt.build({});
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
