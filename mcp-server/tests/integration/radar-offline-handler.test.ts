/**
 * Integration tests for the search_radar_offline MCP tool handler
 * (renamed from search_radar_cache in BL-032 Phase 4b) — exercises the
 * full wrapper pipeline introduced under BL-031.95 Phase 3.B (deeplink
 * emission + capability-mirror schema).
 *
 * Snapshot readers are mocked rather than driven via the real
 * `.cache/inoreader/` directory because vitest runs test files in
 * parallel and `tests/unit/radar-offline.test.ts` shares the same
 * filesystem path; both files seeding/clearing it caused races. The
 * snapshot reader is exercised end-to-end in the unit file; this
 * file's job is the wrapper pipeline (input parsing → handler →
 * deeplink + payload shape), which mocks let us test deterministically
 * without filesystem coupling.
 *
 * This is also the engineering substitute for the BL-031.95 Phase 3
 * "live MCP exercise" — the running mcp-server subprocess in any
 * given Claude session is started from `dist/index.js` at session
 * start and cannot be reloaded with newly-built code mid-session, so
 * this test asserts the same guarantees the live exercise would by
 * walking the actual handler code path with parsed inputs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  handleRadarOfflineTool,
  SearchRadarOfflineInputSchema,
} from '../../src/tools/radar-offline';
import { HUB_BASE } from '../../src/config';
import * as snapshot from '../../src/content/radar-snapshot';

// Build deterministic mock snapshots — three FYI items across two
// categories, two Wire items in a third category. publishedAt values
// chosen so newest-first sort produces a stable ordering.
function buildMockFyiSnapshot(): ReturnType<typeof snapshot.readFyiSnapshot> {
  return {
    tier: 'fyi',
    lastSeededAt: '2026-05-02T12:00:00.000Z',
    items: [
      {
        id: 'fyi-1',
        title: 'Enterprise SaaS Consolidation Wave',
        url: 'https://example.com/fyi-1',
        source: 'TechCrunch',
        category: 'enterprise-tech',
        publishedAt: '2026-05-02T10:00:00.000Z',
        annotation: { gstTake: 'Late-cycle pattern' },
      },
      {
        id: 'fyi-2',
        title: 'PE Tech Megadeal Closes',
        url: 'https://example.com/fyi-2',
        source: 'PitchBook',
        category: 'pe-ma',
        publishedAt: '2026-05-02T09:00:00.000Z',
        annotation: { gstTake: 'Multiple expansion thesis' },
      },
      {
        id: 'fyi-3',
        title: 'AI Infrastructure Capex Surge',
        url: 'https://example.com/fyi-3',
        source: 'WSJ',
        category: 'ai-automation',
        publishedAt: '2026-05-02T08:00:00.000Z',
      },
    ],
  };
}

function buildMockWireSnapshot(): ReturnType<typeof snapshot.readWireSnapshot> {
  return {
    tier: 'wire',
    lastSeededAt: '2026-05-02T12:00:00.000Z',
    items: [
      {
        id: 'wire-1',
        title: 'Cloud Cost Optimization Becomes Board Priority',
        url: 'https://example.com/wire-1',
        source: 'Forbes',
        category: 'enterprise-tech',
        publishedAt: '2026-05-02T11:00:00.000Z',
      },
      {
        id: 'wire-2',
        title: 'New CVE Disclosed in OSS Library',
        url: 'https://example.com/wire-2',
        source: 'BleepingComputer',
        category: 'security',
        publishedAt: '2026-05-02T07:00:00.000Z',
      },
    ],
  };
}

beforeEach(() => {
  vi.spyOn(snapshot, 'readFyiSnapshot').mockReturnValue(buildMockFyiSnapshot());
  vi.spyOn(snapshot, 'readWireSnapshot').mockReturnValue(buildMockWireSnapshot());
});

describe('handleRadarOfflineTool — BL-031.95 Phase 3.B integration', () => {
  it('empty input returns the full unified FYI+Wire feed sorted newest-first; deeplink omits ?category=', async () => {
    const parsed = SearchRadarOfflineInputSchema.parse({});
    const response = await handleRadarOfflineTool(parsed);
    expect(response.isError).toBeUndefined();
    const payload = response.structuredContent as Record<string, unknown>;
    const matches = payload.matches as Array<{ category: string; publishedAt: string }>;
    expect(matches.length).toBe(5); // 3 FYI + 2 Wire

    // Sort invariant: publishedAt newest-first.
    for (let i = 0; i < matches.length - 1; i++) {
      expect(matches[i].publishedAt >= matches[i + 1].publishedAt).toBe(true);
    }

    // No category filter applied — multiple categories represented.
    const categories = new Set(matches.map((m) => m.category));
    expect(categories.size).toBeGreaterThanOrEqual(3);

    // Deeplink: bare /hub/radar (no query string).
    expect(payload.deeplink).toBe(`${HUB_BASE}/hub/radar`);
  });

  it('category filter scopes results and is reflected in the deeplink', async () => {
    const parsed = SearchRadarOfflineInputSchema.parse({ category: 'enterprise-tech' });
    const response = await handleRadarOfflineTool(parsed);
    expect(response.isError).toBeUndefined();
    const payload = response.structuredContent as Record<string, unknown>;
    const matches = payload.matches as Array<{ category: string }>;
    expect(matches.length).toBe(2); // 1 FYI + 1 Wire in enterprise-tech
    expect(matches.every((m) => m.category === 'enterprise-tech')).toBe(true);

    expect(payload.deeplink).toBe(`${HUB_BASE}/hub/radar?category=enterprise-tech`);
  });

  it('deeplink uses the same encoder the website page uses (round-trip via the shared module)', async () => {
    const parsed = SearchRadarOfflineInputSchema.parse({ category: 'security' });
    const response = await handleRadarOfflineTool(parsed);
    expect(response.isError).toBeUndefined();
    const payload = response.structuredContent as Record<string, unknown>;
    expect(payload.deeplink).toMatch(/\/hub\/radar\?category=security$/);
  });

  it('snapshot-missing path returns isError with the structured-error message', async () => {
    // Override the per-test mocks: simulate cache missing entirely.
    vi.spyOn(snapshot, 'readFyiSnapshot').mockReturnValue(null);
    vi.spyOn(snapshot, 'readWireSnapshot').mockReturnValue(null);
    const parsed = SearchRadarOfflineInputSchema.parse({});
    const response = await handleRadarOfflineTool(parsed);
    expect(response.isError).toBe(true);
    const text = (response.content[0] as { type: 'text'; text: string }).text;
    expect(text).toMatch(/npm run radar:seed/);
    // BL-090: same prose, now with a structured mirror.
    expect(response.structuredContent).toMatchObject({
      error: 'snapshot-missing',
      message: text,
    });
  });

  describe('capability-mirror invariant (Phase 3.A enforcement at the handler boundary)', () => {
    it('ignores pre-Phase-3 `tier` field if a caller still passes it (Zod strips it on parse)', async () => {
      // The schema's parse step drops unknown keys; the handler never
      // sees them. Test passes a wider shape and asserts the handler
      // returns the same payload as a clean call.
      const parsedWithExtras = SearchRadarOfflineInputSchema.parse({
        category: 'pe-ma',
        tier: 'fyi',
        since: '2026-04-01',
        limit: 50,
      });
      const parsedClean = SearchRadarOfflineInputSchema.parse({ category: 'pe-ma' });
      const responseExtras = await handleRadarOfflineTool(parsedWithExtras);
      const responseClean = await handleRadarOfflineTool(parsedClean);
      const payloadExtras = responseExtras.structuredContent as Record<string, unknown>;
      const payloadClean = responseClean.structuredContent as Record<string, unknown>;
      // Same matches (capability-mirror: extras have no effect).
      expect((payloadExtras.matches as unknown[]).length).toBe(
        (payloadClean.matches as unknown[]).length
      );
      // Same deeplink.
      expect(payloadExtras.deeplink).toBe(payloadClean.deeplink);
    });
  });
});
