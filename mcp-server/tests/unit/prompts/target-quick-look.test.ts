import { describe, it, expect } from 'vitest';
import { targetQuickLookPrompt } from '../../../src/prompts/target-quick-look';

const VALID_ARGS = {
  targetName: 'Acme Corp',
  productType: 'b2b-saas',
  arr: 25_000_000,
  // Canonical funding stage (BL-031.87) — replaces the portfolio-style
  // 'Scaling Growth' literal. Each downstream tool's wrapper translates
  // this canonical value to its native enum locally.
  stage: 'series-b' as const,
  hqJurisdiction: 'us-ca',
};

describe('gst_target_quick_look', () => {
  it('uses the gst_ slash-menu prefix', () => {
    expect(targetQuickLookPrompt.name).toMatch(/^gst_/);
  });

  it('argsSchema parses a representative payload', () => {
    expect(targetQuickLookPrompt.argsSchema.safeParse(VALID_ARGS).success).toBe(true);
  });

  it('argsSchema rejects negative arr', () => {
    expect(targetQuickLookPrompt.argsSchema.safeParse({ ...VALID_ARGS, arr: -1 }).success).toBe(
      false
    );
  });

  it('argsSchema rejects empty hqJurisdiction', () => {
    expect(
      targetQuickLookPrompt.argsSchema.safeParse({ ...VALID_ARGS, hqJurisdiction: '' }).success
    ).toBe(false);
  });

  it('build() returns at least one message', () => {
    const parsed = targetQuickLookPrompt.argsSchema.parse(VALID_ARGS);
    expect(targetQuickLookPrompt.build(parsed).messages.length).toBeGreaterThanOrEqual(1);
  });

  it('message body mentions every orchestrates entry literally', () => {
    const parsed = targetQuickLookPrompt.argsSchema.parse(VALID_ARGS);
    const allText = targetQuickLookPrompt
      .build(parsed)
      .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
      .join('\n');
    for (const ref of targetQuickLookPrompt.orchestrates) {
      expect(allText, `body should mention ${ref}`).toContain(ref);
    }
  });

  it('accepts arr as a numeric string (Claude Desktop wire shape)', () => {
    const r = targetQuickLookPrompt.argsSchema.safeParse({
      ...VALID_ARGS,
      arr: '25000000',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.arr).toBe(25_000_000);
  });

  it('accepts arr as an actual number (forward-compat)', () => {
    const r = targetQuickLookPrompt.argsSchema.safeParse(VALID_ARGS);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.arr).toBe(VALID_ARGS.arr);
  });

  it('normalizes case variants on the canonical stage enum (case-tolerance contract)', () => {
    const r = targetQuickLookPrompt.argsSchema.safeParse({
      ...VALID_ARGS,
      stage: 'Series-B', // canonical (after enumFromWire normalization): 'series-b'
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.stage).toBe('series-b');
  });

  it('accepts every canonical funding-stage value (BL-031.87 contract)', () => {
    for (const canonical of ['seed', 'series-a', 'series-b', 'series-c', 'pe', 'enterprise']) {
      const r = targetQuickLookPrompt.argsSchema.safeParse({ ...VALID_ARGS, stage: canonical });
      expect(r.success, `canonical stage '${canonical}' should parse`).toBe(true);
    }
  });

  it('rejects portfolio-style growth-stage values (BL-031.87 contract enforces canonical layer)', () => {
    // Pre-BL-031.87 the prompt accepted portfolio-enum values like
    // 'Scaling Growth'. Post-BL-031.87, the canonical layer is the
    // contract — portfolio enum values must be rejected so callers
    // adopt the canonical taxonomy.
    expect(
      targetQuickLookPrompt.argsSchema.safeParse({ ...VALID_ARGS, stage: 'Scaling Growth' }).success
    ).toBe(false);
  });

  it("instructs the model on the 'not sure' (-1) ICG fallback", () => {
    const parsed = targetQuickLookPrompt.argsSchema.parse(VALID_ARGS);
    const allText = targetQuickLookPrompt
      .build(parsed)
      .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
      .join('\n');
    expect(allText).toContain('-1');
    expect(allText).toMatch(/not\s*sure/i);
    expect(allText.toLowerCase()).toContain('never skip');
  });

  it('enumerates every ICG question ID by domain (regression guard for V2 finding #3)', () => {
    // The model must use schema-canonical compound IDs (q<domain>_<index>)
    // — the engine silently ignores unknown keys, so flat IDs (q1, q2, ...)
    // produce a misleading no-answer baseline. Mirrors the 20 IDs declared
    // in src/data/infrastructure-cost-governance/domains.ts.
    const parsed = targetQuickLookPrompt.argsSchema.parse(VALID_ARGS);
    const allText = targetQuickLookPrompt
      .build(parsed)
      .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
      .join('\n');
    const expected = [
      'q1_1',
      'q1_2',
      'q1_3',
      'q2_1',
      'q2_2',
      'q2_3',
      'q2_4',
      'q3_1',
      'q3_2',
      'q3_3',
      'q4_1',
      'q4_2',
      'q4_3',
      'q5_1',
      'q5_2',
      'q5_3',
      'q6_1',
      'q6_2',
      'q6_3',
      'q6_4',
    ];
    expect(expected.length).toBe(20);
    for (const id of expected) {
      expect(allText, `body should mention ICG question ID ${id}`).toContain(id);
    }
    expect(allText).toContain('20 questions');
  });
});
