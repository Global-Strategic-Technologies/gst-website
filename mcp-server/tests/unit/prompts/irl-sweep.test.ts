/**
 * `gst_irl_sweep` — presence-assertion suite.
 *
 * **Deliberately NO body-hash suite.** Byte-pinning was part of the disease
 * the trust-the-operator rebuild removes: every prose touch on the old
 * prompt forced a rebaseline commit across hand-synced hash constants.
 * These assertions guard the load-bearing STRUCTURE — every orchestrated
 * surface named, every engine-math rule present, the inference and gap-list
 * instructions carried — while letting wording breathe.
 *
 * v0.2.0: the sweep has ONE argument and ONE behavior (full sweep). The
 * former `mode: extract-only` is its own prompt, `gst_irl_extract`, with
 * its own suite.
 */

import { describe, it, expect } from 'vitest';
import { irlSweepPrompt, SWEEP_ORCHESTRATED_TOOLS } from '../../../src/prompts/irl-sweep';

const FILLED = [
  '# Information Request List — TestCo (filled)',
  '',
  '> Target: TestCo, Inc.',
  '> Engagement context: Sell-side',
  '',
  '- 0-01 Company name (legal entity + brand if different) [CLOSED] — TestCo, Inc.',
  '- 0-03 Annual recurring revenue [CLOSED] — $45.2M USD annualized.',
  '- 2-04 Engineering FTE count [CLOSED] — Engineering ~42: Development 33, Infra/DevOps 9.',
  '- 3-02 Monthly hosting spend [CLOSED] — ~$290K/mo hosting, Azure.',
].join('\n');

function bodyOf(args: Record<string, unknown>): string {
  const parsed = irlSweepPrompt.argsSchema.parse(args);
  return irlSweepPrompt
    .build(parsed as never)
    .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
    .join('\n');
}

const FULL = bodyOf({});
const FULL_ONESHOT = bodyOf({ filledIrl: FILLED });

describe('gst_irl_sweep — registry contract', () => {
  it('declares the expected identity', () => {
    expect(irlSweepPrompt.name).toBe('gst_irl_sweep');
    expect(irlSweepPrompt.version).toBe('0.2.0');
    expect(irlSweepPrompt.consumesTargetEvidence).toBeUndefined();
  });

  it('renders under empty args (the BL-124 empty-invocation shape)', () => {
    expect(FULL.length).toBeGreaterThan(1000);
  });

  it('every orchestrates entry appears literally in the body', () => {
    for (const entry of irlSweepPrompt.orchestrates) {
      expect(FULL, `body missing orchestrates entry ${entry}`).toContain(entry);
    }
  });

  it('orchestrates nine tools and two embed URIs — no provenance tools', () => {
    expect(SWEEP_ORCHESTRATED_TOOLS).toHaveLength(9);
    for (const forbidden of [
      'compose_dossier_envelope',
      'prepare_irl_body',
      'validate_irl_provenance',
    ]) {
      expect(irlSweepPrompt.orchestrates).not.toContain(forbidden);
      expect(FULL, `body must not direct ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('a stale-client mode argument is stripped, not honored — one behavior only', () => {
    // 0.2.0 removed `mode`; default strip-mode drops the unknown key, so an
    // old-style invocation renders the (only) full-sweep body. The body
    // cross-points at gst_irl_extract for the record workflow.
    const parsed = irlSweepPrompt.argsSchema.parse({ mode: 'extract-only' });
    expect(parsed).not.toHaveProperty('mode');
    expect(FULL).toContain('- Workflow: **full sweep**');
    expect(FULL).toContain('gst_irl_extract');
    expect(FULL).not.toContain('record: irl-extract');
  });
});

describe('gst_irl_sweep — no provenance apparatus', () => {
  it.each([
    ['RUN-AUDIT', 'RUN-AUDIT'],
    ['meta fence', 'fixtureFillRatio'],
    ['body-binding hash', 'Body-binding hash'],
    ['irlSource grading', 'partner-paste-verbatim'],
    ['audit levels', 'auditLevel'],
  ])('the body carries no %s', (_label, needle) => {
    expect(FULL).not.toContain(needle);
    expect(FULL_ONESHOT).not.toContain(needle);
  });

  it('instructs bare payloads — `_audit` appears only as the explicit negative', () => {
    // The published tool schemas still show the optional `_audit` property
    // during the coexistence window, so the body says NOT to fill it.
    expect(FULL).toContain('no `_audit` blocks');
  });
});

describe('gst_irl_sweep — arrival + inference (the one-arg surface)', () => {
  it('argsSchema accepts {} and rejects a sub-200-char filledIrl', () => {
    expect(irlSweepPrompt.argsSchema.safeParse({}).success).toBe(true);
    expect(irlSweepPrompt.argsSchema.safeParse({ filledIrl: 'too short' }).success).toBe(false);
  });

  it('trusts whichever arrival channel is present and asks only when none is', () => {
    expect(FULL).toContain('Use it as given');
    expect(FULL).toContain('ask the user to paste it');
  });

  it('infers target name preamble-first (> Target:, then row 0-01) with the ask-in-conversation fallback', () => {
    expect(FULL).toContain('`> Target:`');
    expect(FULL).toContain('0-01');
    expect(FULL).toMatch(/ask the user for the target name/i);
  });

  it('infers engagement context through the fallthrough chain (canonical header → row 0-02 → universal)', () => {
    expect(FULL).toContain('`> Engagement context:`');
    expect(FULL).toContain('0-02');
    expect(FULL).toMatch(/absent on most pipeline-generated IRLs/i);
    // Kestrel live-trial finding (2026-08-25): a free-text header (an
    // engagement title) must NOT force universal voice past a specific 0-02.
    expect(FULL).toMatch(/NOT a context label.*fall through to row 0-02/i);
    expect(FULL).toMatch(/beats a non-canonical header/i);
  });

  it('states run completeness declaratively — the BL-086 register, no do-not-ask imperatives', () => {
    // Kestrel trials 2-3 (2026-08-25): "do not ask for confirmation" prose
    // pattern-matched to injection and TRIGGERED the confirmation pause it
    // tried to prevent — the same lesson embed.ts records for the original
    // authorial-intent line. The body states the facts (submission = the
    // operator's "run this") and leaves the model's judgment intact.
    for (const body of [FULL, FULL_ONESHOT]) {
      expect(body).toContain('Run completeness.');
      expect(body).toMatch(/how an operator says "run this"/);
      expect(body).toContain(
        'A submission with no accompanying chat message is a normal invocation'
      );
      // The injection-shaped imperatives must NOT come back.
      expect(body).not.toMatch(/[Dd]o not ask for confirmation/);
      expect(body).not.toMatch(/do not stop to ask/);
    }
  });

  it('universal-voice fallback fires on absent OR Unspecified, keyed on display labels', () => {
    expect(FULL).toContain('Unspecified');
    expect(FULL).toContain('Sell-side');
    expect(FULL).toContain('Value Creation');
    expect(FULL).toMatch(/universal voice/i);
  });

  it('the one-shot body carries the supplied IRL verbatim', () => {
    expect(FULL_ONESHOT).toContain('## The populated IRL (verbatim)');
    expect(FULL_ONESHOT).toContain('- 0-03 Annual recurring revenue');
  });
});

describe('gst_irl_sweep — retained engine-math structure', () => {
  it('carries the workbook column contract', () => {
    expect(FULL).toContain('IRL workbook column contract');
  });

  it('the completeness check is advisory with only the blank-template halt', () => {
    expect(FULL).toContain('Halt ONLY if');
    expect(FULL).toContain('below 5%');
    expect(FULL).toMatch(/Otherwise ALWAYS proceed/);
    // The old 15/40% tiering is gone.
    expect(FULL).not.toContain('15-40%');
  });

  it('carries the inclusion gates with the engine-null rationale', () => {
    expect(FULL).toContain('Inclusion gates');
    expect(FULL).toMatch(/returns null when `arr` or `infraHostingAnnual` is zero/);
    expect(FULL).toContain('§04');
  });

  it('carries both conditional regulatory triggers', () => {
    expect(FULL).toContain('EU AI Act');
    expect(FULL).toContain('NIS2');
  });

  it('carries the v2 rule constants (deepdive TechPar, MTTR P1, eng-cost dedup, ICG seeding)', () => {
    expect(FULL).toContain('mode: "deepdive"');
    expect(FULL).toContain('rdOpEx: 0');
    expect(FULL).toMatch(/use P1/i);
    expect(FULL).toContain('engCost');
    expect(FULL).toContain('Seeding philosophy');
  });

  it('carries the ICG empty-first call and the regulations response-size ceiling', () => {
    expect(FULL).toContain('answers: {}');
    expect(FULL).toMatch(/limit.*50/i);
  });

  it('carries the deeplink discipline and the VDR taxonomy for (I) follow-ups', () => {
    expect(FULL).toMatch(/deeplink, copied VERBATIM|deeplink.*VERBATIM/i);
    expect(FULL).toContain('Canonical VDR folder taxonomy');
  });
});

describe('gst_irl_sweep — dossier output', () => {
  it('renders the dossier shape (A)–(J)', () => {
    for (const section of ['(A)', '(B)', '(C)', '(D)', '(E)', '(F)', '(G)', '(H)', '(I)', '(J)']) {
      expect(FULL, `dossier section ${section} missing`).toContain(section);
    }
  });

  it('(J) Gaps & assumptions is the audit surface', () => {
    expect(FULL).toContain('Gaps & assumptions');
    expect(FULL).toMatch(/per the IRL/);
  });

  it('the run-parameters block states the workflow and the prompt version', () => {
    expect(FULL).toContain('- Workflow: **full sweep**');
    expect(FULL).toContain(`Prompt version: **${irlSweepPrompt.version}**`);
  });
});
