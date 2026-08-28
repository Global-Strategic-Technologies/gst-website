/**
 * Unit tests for the `gst_irl_create` prompt (BL-140).
 *
 * The load-bearing assertions mirror the operator rulings the body encodes:
 * evidence-inventory-first, the D-cell sourcing grammar taught with
 * examples, unattributable-stays-unwritten, union re-runs, the
 * server-computed scoping payload passed verbatim, and — hardest —
 * stop-at-artifact: the body must forbid invoking the ingestion sweep,
 * never instruct it.
 */

import { irlCreatePrompt } from '../../../src/prompts/irl-create';
import { IRL_SOURCE_EMBED_URI } from '../../../src/prompts/embed';

type Args = Parameters<typeof irlCreatePrompt.build>[0];

function render(args: Record<string, unknown>): string {
  const parsed = irlCreatePrompt.argsSchema.parse(args) as Args;
  return irlCreatePrompt
    .build(parsed)
    .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
    .join('\n');
}

describe('gst_irl_create — registry shape', () => {
  it('carries the registry invariants (name, version, orchestrates, no consumesTargetEvidence)', () => {
    expect(irlCreatePrompt.name).toBe('gst_irl_create');
    expect(irlCreatePrompt.version).toBe('0.3.0');
    expect(irlCreatePrompt.orchestrates).toEqual([
      IRL_SOURCE_EMBED_URI,
      'fill_information_request_list_xlsx',
    ]);
    // Deliberately excluded from the evidence-precedence clause: its upgrade
    // path would instruct the sweep tools, contradicting stop-at-artifact.
    // The biconditional guard in irl-evidence-precedence-clause.test.ts
    // asserts the flag AND the clause absence together.
    expect(irlCreatePrompt.consumesTargetEvidence).toBeUndefined();
  });

  it('returns two messages (body + IRL source embed) in both modes', () => {
    for (const args of [{}, { targetName: 'Acme' }]) {
      const result = irlCreatePrompt.build(irlCreatePrompt.argsSchema.parse(args) as Args);
      expect(result.messages).toHaveLength(2);
      expect(result.messages[1].content.type).not.toBe(undefined);
    }
  });
});

describe('gst_irl_create — one-shot body', () => {
  const body = render({ targetName: 'Acme Corp', transactionContext: 'buy-side' });

  it('names every orchestrates entry', () => {
    expect(body).toContain(IRL_SOURCE_EMBED_URI);
    expect(body).toContain('fill_information_request_list_xlsx');
  });

  it('uses the FILL taxonomy framing, not the generator "reproduce it as-is" framing', () => {
    expect(body).toContain('QUESTION SET to answer, not a template to reproduce');
    expect(body).not.toContain('reproduce it as-is rather than reconciling');
  });

  it('puts the evidence inventory FIRST and scopes sourcing to what is actually present', () => {
    expect(body).toContain('Inventory the evidence');
    expect(body).toContain('if a source is not in front of you, nothing may rest on it');
  });

  it('teaches the D-cell grammar with accept and reject examples', () => {
    // Accept shapes (one of each ruled form).
    expect(body).toContain('TechDebtRegistryAndRoadmap.pdf, page 4, paragraph 2');
    expect(body).toContain('[User stated this Jan 4 2026 2pm in session chat]');
    expect(body).toContain('[inferred from FileA.pdf + FileB.xlsx]');
    // Reject shapes with their reasons.
    expect(body).toContain('never `TechDebt.pdf — page 4`');
    expect(body).toContain('`SOC 2 report (2025)` fails');
  });

  it('rules that bare unattributable inference stays unwritten and blanks are the ask', () => {
    expect(body).toContain('Bare unattributable inference stays unwritten');
    expect(body).toContain('OMIT the row');
    expect(body).toContain('follow-up ask');
  });

  it('carries the union re-run rule (extend, never overwrite)', () => {
    expect(body).toContain('pass the FULL UNION');
    expect(body).toContain('Never drop or rewrite a previously authored fill');
  });

  it('embeds the exact server-computed scoping payload for verbatim pass-through', () => {
    const fence = body.match(/```json\n([\s\S]*?)\n```/);
    expect(fence).not.toBeNull();
    expect(JSON.parse(fence![1])).toEqual({
      targetName: 'Acme Corp',
      transactionContext: 'buy-side',
    });
  });

  it('embeds the valid Reference-id set computed by the same pipeline the tool runs', () => {
    expect(body).toContain('contains exactly these Reference ids');
    // Spot refs from the canonical list; the exact set is pinned elsewhere.
    expect(body).toContain('0-01');
    expect(body).toContain('9-01');
  });

  it('scoping configuration changes the embedded payload AND the ref set', () => {
    const scoped = render({ targetName: 'Acme', includeSections: '01' });
    const fence = scoped.match(/```json\n([\s\S]*?)\n```/);
    expect(JSON.parse(fence![1])).toEqual({ targetName: 'Acme', includeSections: ['01'] });
    // Section 00 removed → its refs are not offered as fillable.
    const refsLine = scoped.split('\n').find((l) => l.includes('exactly these Reference ids'))!;
    expect(refsLine).toContain('1-01');
    expect(refsLine).not.toContain('0-01');
  });

  it('stops at the artifact: forbids the sweep instead of instructing it', () => {
    expect(body).toContain('Stop at the artifact');
    // BOTH ingestion prompts are named in the prohibition. The recommendation
    // moved to `gst_irl_sweep` in 0.3.0, and a guard naming only the one the
    // body no longer recommends would leave the recommended path un-forbidden,
    // which is the exact auto-invocation the checkpoint exists to prevent.
    expect(body).toContain(
      'do NOT invoke `gst_irl_sweep`, `gst_irl_ingestion`, `prepare_irl_body`, or any other tool after the fill call'
    );
    expect(body).toContain('human review checkpoint');
    // The sweep is only ever named as the operator's OWN next step.
    expect(body).toContain('runs `gst_irl_sweep` themselves');
  });

  it('states the base64-only delivery residual (no Hub page for populated workbooks)', () => {
    expect(body).toContain('no Hub download page for populated workbooks');
  });
});

describe('gst_irl_create — interactive body', () => {
  const body = render({});

  it('asks for target, evidence sources, and engagement posture before authoring', () => {
    expect(body).toContain('Which target is this for');
    expect(body).toContain('what evidence should I draw from');
  });

  it('carries the same sourcing rules and stop-at-artifact discipline as one-shot', () => {
    expect(body).toContain('Bare unattributable inference stays unwritten');
    expect(body).toContain('do NOT invoke `gst_irl_sweep`, `gst_irl_ingestion`');
  });
});
