import { describe, it, expect } from 'vitest';
import { radarBriefTodayPrompt } from '../../../src/prompts/radar-brief-today';

describe('gst_radar_brief_today', () => {
  it('uses the gst_ slash-menu prefix', () => {
    expect(radarBriefTodayPrompt.name).toMatch(/^gst_/);
  });

  it('argsSchema accepts an empty payload (sinceHours optional; default applied at build time)', () => {
    const result = radarBriefTodayPrompt.argsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      // sinceHours is optional in the schema; the default (24) is applied
      // by build() rather than by .default() because Zod's .default fires
      // only when input is undefined and our preprocess turns "" into
      // undefined too late. See V7 trial (a) regression discussion.
      expect(result.data.sinceHours).toBeUndefined();
    }
  });

  it('argsSchema accepts an empty-string sinceHours (Claude Desktop empty form field)', () => {
    const result = radarBriefTodayPrompt.argsSchema.safeParse({ sinceHours: '' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sinceHours).toBeUndefined();
    }
  });

  it('argsSchema accepts an empty-string category (Claude Desktop empty form field)', () => {
    const result = radarBriefTodayPrompt.argsSchema.safeParse({ category: '' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBeUndefined();
    }
  });

  it('build() applies the 24-hour default when sinceHours is undefined', () => {
    const parsed = radarBriefTodayPrompt.argsSchema.parse({});
    const allText = radarBriefTodayPrompt
      .build(parsed)
      .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
      .join('\n');
    expect(allText).toContain('last 24 hour');
    expect(allText).toContain('within the last 24 hours');
  });

  it('build() respects an explicit sinceHours value', () => {
    const parsed = radarBriefTodayPrompt.argsSchema.parse({ sinceHours: 72 });
    const allText = radarBriefTodayPrompt
      .build(parsed)
      .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
      .join('\n');
    expect(allText).toContain('last 72 hour');
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

  it('normalizes category case variants (Enterprise-Tech -> enterprise-tech)', () => {
    const r = radarBriefTodayPrompt.argsSchema.safeParse({ category: 'Enterprise-Tech' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.category).toBe('enterprise-tech');
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

  it('accepts sinceHours as a numeric string (Claude Desktop wire shape)', () => {
    const r = radarBriefTodayPrompt.argsSchema.safeParse({ sinceHours: '48' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.sinceHours).toBe(48);
  });

  it('accepts sinceHours as an actual number (forward-compat)', () => {
    const r = radarBriefTodayPrompt.argsSchema.safeParse({ sinceHours: 48 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.sinceHours).toBe(48);
  });

  it('handles snapshot-missing path explicitly (instructs the model not to fabricate)', () => {
    const parsed = radarBriefTodayPrompt.argsSchema.parse({});
    const allText = radarBriefTodayPrompt
      .build(parsed)
      .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
      .join('\n');
    expect(allText.toLowerCase()).toContain('radar snapshot not found');
    expect(allText.toLowerCase()).toContain('fabricate');
  });

  it('embeds the FYI radar snapshot as the second message (or surfaces structured-error text when missing)', () => {
    const parsed = radarBriefTodayPrompt.argsSchema.parse({});
    const result = radarBriefTodayPrompt.build(parsed);
    expect(result.messages.length).toBeGreaterThanOrEqual(2);
    const second = result.messages[1].content;
    // Either an embedded snapshot (cache present) or the structured-error text
    // block (cache deleted) — both are valid; the prompt body teaches the
    // model to discriminate.
    expect(['resource', 'text']).toContain(second.type);
    if (second.type === 'resource') {
      expect(second.resource.uri).toBe('gst://radar/fyi/latest');
    } else if (second.type === 'text') {
      expect(second.text.toLowerCase()).toContain('radar snapshot not found');
    }
  });
});
