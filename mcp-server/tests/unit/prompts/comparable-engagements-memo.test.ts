import { describe, it, expect } from 'vitest';
import { comparableEngagementsMemoPrompt } from '../../../src/prompts/comparable-engagements-memo';

const VALID_ARGS = {
  targetDescription:
    'Mid-market B2B SaaS, vertical-specific, 50 employees, $20M ARR, scaling growth.',
};

describe('gst_comparable_engagements_memo', () => {
  it('uses the gst_ slash-menu prefix', () => {
    expect(comparableEngagementsMemoPrompt.name).toMatch(/^gst_/);
  });

  it('argsSchema parses a minimal payload (only targetDescription)', () => {
    expect(comparableEngagementsMemoPrompt.argsSchema.safeParse(VALID_ARGS).success).toBe(true);
  });

  it('argsSchema rejects too-short targetDescription', () => {
    expect(
      comparableEngagementsMemoPrompt.argsSchema.safeParse({ targetDescription: 'short' }).success
    ).toBe(false);
  });

  it('argsSchema accepts optional theme + engagementCategory', () => {
    expect(
      comparableEngagementsMemoPrompt.argsSchema.safeParse({
        ...VALID_ARGS,
        theme: 'data-platform',
        engagementCategory: 'Buy-Side',
      }).success
    ).toBe(true);
  });

  it('build() returns at least one message', () => {
    const parsed = comparableEngagementsMemoPrompt.argsSchema.parse(VALID_ARGS);
    expect(comparableEngagementsMemoPrompt.build(parsed).messages.length).toBeGreaterThanOrEqual(1);
  });

  it('message body mentions every orchestrates entry literally', () => {
    const parsed = comparableEngagementsMemoPrompt.argsSchema.parse(VALID_ARGS);
    const allText = comparableEngagementsMemoPrompt
      .build(parsed)
      .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
      .join('\n');
    for (const ref of comparableEngagementsMemoPrompt.orchestrates) {
      expect(allText).toContain(ref);
    }
  });

  it('normalizes engagementCategory case variants (V3 finding — "Buy-side" → "Buy-Side")', () => {
    for (const variant of ['Buy-side', 'buy-side', 'BUY-SIDE']) {
      const r = comparableEngagementsMemoPrompt.argsSchema.safeParse({
        ...VALID_ARGS,
        engagementCategory: variant,
      });
      expect(r.success, `variant=${variant} should normalize to "Buy-Side"`).toBe(true);
      if (r.success) expect(r.data.engagementCategory).toBe('Buy-Side');
    }
  });
});
