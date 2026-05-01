import { describe, it, expect } from 'vitest';
import { radarBriefTodayPrompt } from '../../../src/prompts/radar-brief-today';

describe('gst_radar_brief_today', () => {
  it('uses the gst_ slash-menu prefix', () => {
    expect(radarBriefTodayPrompt.name).toMatch(/^gst_/);
  });

  it('argsSchema accepts an empty payload (uses defaults)', () => {
    const result = radarBriefTodayPrompt.argsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sinceHours).toBe(24);
    }
  });

  it('argsSchema accepts a category filter', () => {
    expect(
      radarBriefTodayPrompt.argsSchema.safeParse({ category: 'enterprise-tech' }).success
    ).toBe(true);
  });

  it('argsSchema rejects an unknown category', () => {
    expect(
      radarBriefTodayPrompt.argsSchema.safeParse({ category: 'made-up-category' }).success
    ).toBe(false);
  });

  it('argsSchema clamps sinceHours to the documented max (168)', () => {
    expect(radarBriefTodayPrompt.argsSchema.safeParse({ sinceHours: 200 }).success).toBe(false);
    expect(radarBriefTodayPrompt.argsSchema.safeParse({ sinceHours: 168 }).success).toBe(true);
  });

  it('build() returns at least one message', () => {
    const parsed = radarBriefTodayPrompt.argsSchema.parse({});
    expect(radarBriefTodayPrompt.build(parsed).messages.length).toBeGreaterThanOrEqual(1);
  });

  it('message body mentions every orchestrates entry literally', () => {
    const parsed = radarBriefTodayPrompt.argsSchema.parse({});
    const allText = radarBriefTodayPrompt
      .build(parsed)
      .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
      .join('\n');
    for (const ref of radarBriefTodayPrompt.orchestrates) {
      expect(allText).toContain(ref);
    }
  });

  it('handles snapshot-missing path explicitly (instructs the model not to fabricate)', () => {
    const parsed = radarBriefTodayPrompt.argsSchema.parse({});
    const allText = radarBriefTodayPrompt
      .build(parsed)
      .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
      .join('\n');
    expect(allText.toLowerCase()).toContain('snapshot is missing');
    expect(allText.toLowerCase()).toContain('fabricate');
  });
});
