import { describe, it, expect } from 'vitest';
import { radarBriefTodayPrompt } from '../../../src/prompts/radar-brief-today';

describe('gst_radar_brief_today', () => {
  it('uses the gst_ slash-menu prefix', () => {
    expect(radarBriefTodayPrompt.name).toMatch(/^gst_/);
  });

  it('argsSchema accepts an empty payload (category optional; no other fields)', () => {
    const result = radarBriefTodayPrompt.argsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBeUndefined();
    }
  });

  it('argsSchema accepts an empty-string category (Claude Desktop empty form field)', () => {
    const result = radarBriefTodayPrompt.argsSchema.safeParse({ category: '' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBeUndefined();
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

  it('normalizes category case variants (Enterprise-Tech -> enterprise-tech)', () => {
    const r = radarBriefTodayPrompt.argsSchema.safeParse({ category: 'Enterprise-Tech' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.category).toBe('enterprise-tech');
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

  describe('BL-031.95 Phase 3.A — capability-mirror invariant', () => {
    // The prompt's argsSchema mirrors the /hub/radar website's filter UI:
    // a single optional `category` field. The earlier `sinceHours`
    // argument was removed in v0.0.2 because the underlying cache has a
    // 24h TTL and the website surfaces no time filter. These tests lock
    // the contract.

    it('prompt is at v0.0.2 (post-Phase-3.A capability-mirror refactor)', () => {
      expect(radarBriefTodayPrompt.version).toBe('0.0.2');
    });

    it('argsSchema rejects pre-Phase-3 `sinceHours` field (no longer accepted)', () => {
      // Zod by default strips unknown keys rather than rejecting outright;
      // this assertion verifies sinceHours is dropped, locking the
      // capability-mirror invariant.
      const result = radarBriefTodayPrompt.argsSchema.safeParse({ sinceHours: 48 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as Record<string, unknown>).sinceHours).toBeUndefined();
      }
    });

    it('body does not reference a sinceHours / time-window filter', () => {
      const parsed = radarBriefTodayPrompt.argsSchema.parse({});
      const allText = radarBriefTodayPrompt
        .build(parsed)
        .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
        .join('\n')
        .toLowerCase();
      // Pre-Phase-3 body said "within the last X hours" — that phrase
      // should be gone. The body now references the cache's natural
      // 24h TTL via "24-hour TTL" wording.
      expect(allText).not.toContain('within the last');
      expect(allText).not.toContain('sincehours');
    });
  });
});
