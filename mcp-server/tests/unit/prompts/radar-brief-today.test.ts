import { describe, it, expect } from 'vitest';
import { radarBriefTodayPrompt } from '../../../src/prompts/radar-brief-today';
import { embedFyiRadarSnapshot } from '../../../src/prompts/embed';
import type { SnapshotTier } from '../../../src/content/radar-transform';

/**
 * Sentinel wording, not the real constants — these assertions are about WHICH
 * message the embed selects, and pinning the production text here would make
 * them fail on every copy edit.
 */
const MESSAGES = { unavailable: 'UNAVAILABLE-SENTINEL', empty: 'EMPTY-SENTINEL' };

const TIER: SnapshotTier = {
  tier: 'fyi',
  items: [
    {
      id: 'tag:google.com,2005:reader/item/0001',
      title: 'Kubernetes won the container decade',
      url: 'https://example.test/k8s',
      source: 'Example Wire',
      category: 'enterprise-tech',
      publishedAt: '2026-07-15T18:17:02.000Z',
      annotatedAt: '2026-07-15T20:01:28.000Z',
    },
  ],
  lastSeededAt: '2026-08-07T18:00:34.000Z',
};

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

  it('discriminates the degraded path STRUCTURALLY, not by phrase', () => {
    const parsed = radarBriefTodayPrompt.argsSchema.parse({});
    const allText = radarBriefTodayPrompt
      .build(parsed)
      .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
      .join('\n');
    // The body used to tell the model to look for the literal phrase
    // 'Radar snapshot not found'. That phrase is the STDIO message; on the
    // Worker the degraded text says something else entirely, so the
    // stop-and-surface instruction silently failed on the one transport
    // where the snapshot is most likely to be unavailable — leaving the
    // model free to fabricate items. Key on the block being TEXT instead.
    expect(allText).toContain('TEXT block');
    expect(allText.toLowerCase()).toContain('verbatim');
    expect(allText.toLowerCase()).toContain('fabricate');
    // And the stdio-only remediation must not be baked into the body: a
    // remote user has no repo to run it in.
    expect(allText).not.toContain('radar:seed');
  });

  it('omits the second message entirely when no embed is supplied', () => {
    const parsed = radarBriefTodayPrompt.argsSchema.parse({});
    // Unreachable in production — `_registry.ts` always resolves a block for
    // a `needsFyiSnapshot` prompt. Pinned because the alternative (falling
    // back to a constant inside the prompt module) would mean choosing the
    // wording without knowing the transport.
    expect(radarBriefTodayPrompt.build(parsed).messages).toHaveLength(1);
  });

  it('splices a supplied embed as the second message', () => {
    const parsed = radarBriefTodayPrompt.argsSchema.parse({});
    const result = radarBriefTodayPrompt.build(parsed, embedFyiRadarSnapshot(TIER, MESSAGES));
    expect(result.messages).toHaveLength(2);
    const second = result.messages[1].content;
    expect(second.type).toBe('resource');
    if (second.type === 'resource') {
      expect(second.resource.uri).toBe('gst://radar/fyi/latest');
    }
  });

  describe('embedFyiRadarSnapshot — three distinct states', () => {
    it('null tier → the transport-supplied "unavailable" text', () => {
      const block = embedFyiRadarSnapshot(null, MESSAGES);
      expect(block.type).toBe('text');
      if (block.type === 'text') expect(block.text).toBe(MESSAGES.unavailable);
    });

    it('tier present but zero items → the "empty" text, not "unavailable"', () => {
      // Worker-only in practice: `radar-snapshot.ts` documents that the FYI
      // freshness gate is deliberately NOT applied offline, so a stdio reader
      // cannot produce an aged-out empty tier. Exercised at the embed level
      // for exactly that reason.
      const block = embedFyiRadarSnapshot({ ...TIER, items: [] }, MESSAGES);
      expect(block.type).toBe('text');
      if (block.type === 'text') expect(block.text).toBe(MESSAGES.empty);
    });

    it('tier with items → an embedded resource carrying the snapshot', () => {
      const block = embedFyiRadarSnapshot(TIER, MESSAGES);
      expect(block.type).toBe('resource');
      if (block.type === 'resource') {
        expect(block.resource.uri).toBe('gst://radar/fyi/latest');
        // The resource union is text-or-blob; the snapshot is always the
        // text arm, but narrow rather than assert it.
        expect('text' in block.resource).toBe(true);
        if ('text' in block.resource) {
          expect(block.resource.text).toContain('Kubernetes won the container decade');
        }
      }
    });
  });

  describe('BL-031.95 Phase 3.A — capability-mirror invariant', () => {
    // The prompt's argsSchema mirrors the /hub/radar website's filter UI:
    // a single optional `category` field. The earlier `sinceHours`
    // argument was removed in v0.0.2 because the underlying cache has a
    // 24h TTL and the website surfaces no time filter. These tests lock
    // the contract.

    it('prompt is at v0.0.4 (Step-2 discriminator made structural so the degraded path works on the Worker; v0.0.3 was the Phase-5 deeplink surface)', () => {
      expect(radarBriefTodayPrompt.version).toBe('0.0.4');
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
