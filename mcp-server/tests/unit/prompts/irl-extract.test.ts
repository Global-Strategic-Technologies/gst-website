/**
 * `gst_irl_extract` — presence-assertion suite.
 *
 * Same philosophy as the sweep's suite: no body-hash pinning; assert the
 * load-bearing structure and let wording breathe. The extract prompt has
 * exactly one body (one optional arg, no branches).
 */

import { describe, it, expect } from 'vitest';
import { irlExtractPrompt, EXTRACT_PROJECTED_TOOLS } from '../../../src/prompts/irl-extract';

function bodyOf(args: Record<string, unknown>): string {
  const parsed = irlExtractPrompt.argsSchema.parse(args);
  return irlExtractPrompt
    .build(parsed as never)
    .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
    .join('\n');
}

const BODY = bodyOf({});
const BODY_ONESHOT = bodyOf({
  filledIrl: `# IRL — TestCo (filled)\n\n${'- 0-01 Company name [CLOSED] — TestCo, Inc. '.repeat(6)}`,
});

describe('gst_irl_extract — registry contract', () => {
  it('declares the expected identity', () => {
    expect(irlExtractPrompt.name).toBe('gst_irl_extract');
    expect(irlExtractPrompt.version).toBe('0.1.0');
    expect(irlExtractPrompt.consumesTargetEvidence).toBeUndefined();
  });

  it('every orchestrates entry appears literally in the body', () => {
    for (const entry of irlExtractPrompt.orchestrates) {
      expect(BODY, `body missing orchestrates entry ${entry}`).toContain(entry);
    }
  });

  it('projects nine tools and calls none — no provenance tools, no VDR embed', () => {
    expect(EXTRACT_PROJECTED_TOOLS).toHaveLength(9);
    expect(BODY).toContain('No tool invocations');
    for (const forbidden of [
      'compose_dossier_envelope',
      'prepare_irl_body',
      'validate_irl_provenance',
      'gst://library/vdr-structure',
    ]) {
      expect(irlExtractPrompt.orchestrates).not.toContain(forbidden);
      expect(BODY, `body must not carry ${forbidden}`).not.toContain(forbidden);
    }
  });
});

describe('gst_irl_extract — trust surface and structure', () => {
  it('argsSchema accepts {} and rejects a sub-200-char filledIrl', () => {
    expect(irlExtractPrompt.argsSchema.safeParse({}).success).toBe(true);
    expect(irlExtractPrompt.argsSchema.safeParse({ filledIrl: 'short' }).success).toBe(false);
  });

  it('carries the shared trusted-arrival prose in the BL-086 register', () => {
    expect(BODY).toContain('Use it as given');
    expect(BODY).toContain('A submission with no accompanying chat message is a normal invocation');
    expect(BODY).not.toMatch(/[Dd]o not ask for confirmation/);
  });

  it('carries the shared completeness check, gates, and engine-math rules', () => {
    expect(BODY).toContain('Completeness check (advisory');
    expect(BODY).toContain('Inclusion gates');
    expect(BODY).toContain('mode: "deepdive"');
    expect(BODY).toContain('Seeding philosophy');
    expect(BODY).toContain('IRL workbook column contract');
  });

  it('emits the v2 record directive and the payload/elided projection', () => {
    expect(BODY).toContain('record: irl-extract');
    expect(BODY).toContain('"recordVersion": "2.0"');
    expect(BODY).toContain('payload: <tool>');
    expect(BODY).toContain('elided: <tool>');
    expect(BODY).not.toContain('irlBodyHash');
  });

  it('run parameters state the workflow, the prompt version, and the sweep cross-pointer', () => {
    expect(BODY).toContain('- Workflow: **extract-only**');
    expect(BODY).toContain(`Prompt version: **${irlExtractPrompt.version}**`);
    expect(BODY).toContain('`_meta.promptVersion`');
    expect(BODY).toContain('gst_irl_sweep');
  });

  it('(J) Gaps & assumptions closes the output as the audit surface', () => {
    expect(BODY).toContain('Gaps & assumptions');
    expect(BODY).toMatch(/nothing here claims server-side verification/i);
  });

  it('the one-shot body carries the supplied IRL verbatim', () => {
    expect(BODY_ONESHOT).toContain('## The populated IRL (verbatim)');
    expect(BODY_ONESHOT).toContain('TestCo, Inc.');
  });
});
