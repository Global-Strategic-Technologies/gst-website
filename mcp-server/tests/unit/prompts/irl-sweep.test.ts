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
 * Both mode branches are driven explicitly here rather than through the
 * shared `minimalArgsFor` helper (whose `{}` entry renders full mode).
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
const EXTRACT = bodyOf({ mode: 'extract-only' });

describe('gst_irl_sweep — registry contract', () => {
  it('declares the expected identity', () => {
    expect(irlSweepPrompt.name).toBe('gst_irl_sweep');
    expect(irlSweepPrompt.version).toBe('0.1.0');
    expect(irlSweepPrompt.consumesTargetEvidence).toBeUndefined();
  });

  it('renders under empty args (the BL-124 empty-invocation shape)', () => {
    expect(FULL.length).toBeGreaterThan(1000);
  });

  it('every orchestrates entry appears literally in BOTH mode bodies', () => {
    for (const entry of irlSweepPrompt.orchestrates) {
      expect(FULL, `full body missing orchestrates entry ${entry}`).toContain(entry);
      expect(EXTRACT, `extract-only body missing orchestrates entry ${entry}`).toContain(entry);
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
      expect(FULL, `full body must not direct ${forbidden}`).not.toContain(forbidden);
      expect(EXTRACT, `extract body must not direct ${forbidden}`).not.toContain(forbidden);
    }
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
    expect(EXTRACT).not.toContain(needle);
  });

  it('instructs bare payloads — `_audit` appears only as the explicit negative', () => {
    // The published tool schemas still show the optional `_audit` property
    // during the coexistence window, so the body says NOT to fill it.
    expect(FULL).toContain('no `_audit` blocks');
    expect(EXTRACT).toContain('no `_audit`');
  });
});

describe('gst_irl_sweep — arrival + inference (the two-arg surface)', () => {
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

  it('a bare arrival with no accompanying message runs rather than asking run-vs-review', () => {
    // Kestrel live-trial finding (2026-08-25): the file-with-no-message
    // arrival cost one clarification turn; the invocation is the instruction.
    expect(FULL).toContain('Arriving with no accompanying message is not ambiguity');
    expect(FULL).toMatch(/run the mode stated in Run parameters/i);
  });

  it('the execution directive is unconditional: populated arguments are the complete instruction', () => {
    // Second Kestrel trial finding (2026-08-25): the model asked for a "go"
    // even with filledIrl populated. The body now leads with the contract.
    for (const body of [FULL, FULL_ONESHOT, EXTRACT]) {
      expect(body).toContain('This is an execution request, not a document for review.');
      expect(body).toMatch(/Do not ask for confirmation/);
      expect(body).toMatch(/in this same turn/);
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
    expect(EXTRACT).toContain('IRL workbook column contract');
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

describe('gst_irl_sweep — outputs', () => {
  it('full mode renders the dossier shape (A)–(J)', () => {
    for (const section of ['(A)', '(B)', '(C)', '(D)', '(E)', '(F)', '(G)', '(H)', '(I)', '(J)']) {
      expect(FULL, `dossier section ${section} missing`).toContain(section);
    }
  });

  it('(J) Gaps & assumptions is the audit surface in both modes', () => {
    expect(FULL).toContain('Gaps & assumptions');
    expect(EXTRACT).toContain('Gaps & assumptions');
    expect(FULL).toMatch(/per the IRL/);
  });

  it('extract-only carries the v2 record directive and forbids tool invocations', () => {
    expect(EXTRACT).toContain('record: irl-extract');
    expect(EXTRACT).toContain('"recordVersion": "2.0"');
    expect(EXTRACT).toContain('No tool invocations');
    expect(EXTRACT).not.toContain('irlBodyHash');
  });

  it('the run-parameters block states the resolved mode and the prompt version', () => {
    expect(FULL).toContain('- Mode: **full**');
    expect(EXTRACT).toContain('- Mode: **extract-only**');
    expect(FULL).toContain(`Prompt version: **${irlSweepPrompt.version}**`);
  });
});
