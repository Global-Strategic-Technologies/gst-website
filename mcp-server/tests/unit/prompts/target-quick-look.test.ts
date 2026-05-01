import { describe, it, expect } from 'vitest';
import { targetQuickLookPrompt } from '../../../src/prompts/target-quick-look';

const VALID_ARGS = {
  targetName: 'Acme Corp',
  productType: 'b2b-saas',
  arr: 25_000_000,
  stage: 'Scaling Growth' as const,
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
});
