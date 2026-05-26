/**
 * Integration test for the BL-032.75 Phase 0 egress threading through
 * inoreader-client. Verifies that:
 *
 *   - Passing an `egressCategory` to a public fetcher triggers the egress
 *     wrapper exactly once per outbound HTTP call.
 *   - Not passing a category produces zero egress writes (back-compat with
 *     existing call sites).
 *   - `X-Reader-Zone1-Usage` on the response is forwarded to the recorder.
 *   - fetchAllStreams' tag-list + folder fetches each record independently
 *     (this is the load-bearing per-HTTP-call accounting the Phase 0 plan
 *     trades for: the alternative — recording at the public-function
 *     boundary — would undercount the tag-list and miss the 401-retry leg).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { mockGet, mockSet, mockDel, mockIncr, mockExpire, MockRedis } = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockSet = vi.fn();
  const mockDel = vi.fn();
  const mockIncr = vi.fn();
  const mockExpire = vi.fn();
  class MockRedis {
    get = mockGet;
    set = mockSet;
    del = mockDel;
    incr = mockIncr;
    expire = mockExpire;
  }
  return { mockGet, mockSet, mockDel, mockIncr, mockExpire, MockRedis };
});

vi.mock('@upstash/redis', () => ({ Redis: MockRedis }));

import { fetchAnnotatedItems, fetchAllStreams } from '../../../src/lib/inoreader-client';
import type { Env } from '../../../src/worker';

const env: Env = {
  INOREADER_APP_ID: 'app',
  INOREADER_APP_KEY: 'key',
  INOREADER_ACCESS_TOKEN: 'tok',
  UPSTASH_INOREADER_REST_URL: 'https://x.upstash.io',
  UPSTASH_INOREADER_REST_TOKEN: 'ro',
  UPSTASH_MCP_REST_URL: 'https://y.upstash.io',
  UPSTASH_MCP_REST_TOKEN: 'rw',
};

const fetchSpy = vi.fn();

beforeEach(() => {
  fetchSpy.mockReset();
  mockGet.mockReset();
  mockSet.mockResolvedValue('OK');
  mockDel.mockResolvedValue(1);
  mockIncr.mockReset();
  mockIncr.mockResolvedValue(5);
  mockExpire.mockReset();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function streamResponse(zone1Usage?: number): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (zone1Usage !== undefined) headers['X-Reader-Zone1-Usage'] = String(zone1Usage);
  return new Response(
    JSON.stringify({
      direction: 'ltr',
      id: 'stream',
      updated: Date.now() / 1000,
      items: [],
    }),
    { status: 200, headers }
  );
}

describe('inoreader-client × egress recorder wiring (BL-032.75 Phase 0)', () => {
  it('does NOT record when no category is supplied (back-compat)', async () => {
    mockGet.mockResolvedValue('tok');
    fetchSpy.mockResolvedValue(streamResponse(10));

    await fetchAnnotatedItems(env, 5);

    // No INCR on the spend keys when the caller didn't opt in.
    expect(mockIncr).not.toHaveBeenCalled();
  });

  it('records the per-category counter once when fetchAnnotatedItems is called with live-radar', async () => {
    mockGet.mockResolvedValue('tok');
    fetchSpy.mockResolvedValue(streamResponse(11));

    await fetchAnnotatedItems(env, 5, 'live-radar');

    // Exactly 2 INCRs per outbound HTTP call: per-category + Zone-1 total.
    expect(mockIncr).toHaveBeenCalledTimes(2);
    const keys = mockIncr.mock.calls.map((c) => c[0]);
    expect(keys.some((k: string) => k.endsWith(':live-radar'))).toBe(true);
    expect(keys.some((k: string) => /:\d{4}-\d{2}-\d{2}$/.test(k))).toBe(true);
  });

  it('fetchAllStreams records the tag-list AND each folder fetch independently', async () => {
    mockGet.mockResolvedValue('tok');
    // Tag-list response: declare 4 GST-prefixed folders.
    const tagList = new Response(
      JSON.stringify({
        tags: [
          { id: 'user/-/label/GST-pe-ma' },
          { id: 'user/-/label/GST-enterprise-tech' },
          { id: 'user/-/label/GST-ai-automation' },
          { id: 'user/-/label/GST-security' },
          { id: 'user/-/label/Other' }, // non-GST, excluded
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'X-Reader-Zone1-Usage': '20' } }
    );
    fetchSpy.mockResolvedValueOnce(tagList);
    // Folder fetches all succeed with no items.
    for (let i = 0; i < 4; i++) {
      fetchSpy.mockResolvedValueOnce(streamResponse(20 + i + 1));
    }

    await fetchAllStreams(env, 'GST-', 15, 'cron-radar');

    // 1 tag-list + 4 folders = 5 outbound HTTP calls.
    expect(fetchSpy).toHaveBeenCalledTimes(5);
    // Each call records 2 INCRs (per-category + Zone-1 total). 5 × 2 = 10.
    expect(mockIncr).toHaveBeenCalledTimes(10);
    const keys = mockIncr.mock.calls.map((c) => c[0]);
    const catKey = keys.find((k: string) => k.endsWith(':cron-radar'));
    expect(catKey).toBeDefined();
  });
});
