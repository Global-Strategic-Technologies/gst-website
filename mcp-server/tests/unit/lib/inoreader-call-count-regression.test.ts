/**
 * BL-032.75 Phase 0 — regression test pinning the per-cron HTTP call count
 * that the radar-refresh soft-cap math depends on.
 *
 * `cron/radar-refresh.ts` defines:
 *   CALLS_PER_WIRE   = 5  // 1 tag-list + 4 folder fetches
 *   CALLS_PER_FYI    = 1  // 1 annotated-items fetch
 *   CALLS_PER_REFRESH = 6 // sum, used by the day-cap pre-flight guard
 *
 * If a future change adds a 5th GST-* folder, a second annotated-items
 * variant, or a new auxiliary call, the constants must be updated in
 * lockstep — otherwise the cron will silently overshoot the daily Zone-1
 * cap. This test asserts the actual HTTP call count matches the constants
 * so a drift fails CI loudly.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { mockGet, mockSet, MockRedis } = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockSet = vi.fn();
  class MockRedis {
    get = mockGet;
    set = mockSet;
    incr = vi.fn().mockResolvedValue(5);
    expire = vi.fn().mockResolvedValue(1);
    del = vi.fn().mockResolvedValue(1);
  }
  return { mockGet, mockSet, MockRedis };
});

vi.mock('@upstash/redis', () => ({ Redis: MockRedis }));

import { fetchAllStreams, fetchAnnotatedItems } from '../../../src/lib/inoreader-client';
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
  mockGet.mockResolvedValue('tok');
  mockSet.mockResolvedValue('OK');
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function streamResponse(): Response {
  return new Response(JSON.stringify({ direction: 'ltr', id: 's', updated: 0, items: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function tagList(folders: string[]): Response {
  return new Response(JSON.stringify({ tags: folders.map((f) => ({ id: `user/-/label/${f}` })) }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('per-cron HTTP call count regression (BL-032.75 Phase 0)', () => {
  it('one cron refresh issues exactly 6 outbound HTTP calls (CALLS_PER_REFRESH math)', async () => {
    // Mirror production: 4 GST-prefixed folders.
    fetchSpy.mockResolvedValueOnce(
      tagList(['GST-pe-ma', 'GST-enterprise-tech', 'GST-ai-automation', 'GST-security', 'Other'])
    );
    // 4 folder fetches.
    for (let i = 0; i < 4; i++) fetchSpy.mockResolvedValueOnce(streamResponse());
    // 1 annotated-items fetch.
    fetchSpy.mockResolvedValueOnce(streamResponse());

    await fetchAllStreams(env, 'GST-', 15);
    await fetchAnnotatedItems(env, 30);

    // 1 tag-list + 4 folders + 1 annotated = 6. If this changes, the
    // soft-cap constants in cron/radar-refresh.ts MUST update too.
    expect(fetchSpy).toHaveBeenCalledTimes(6);
  });

  it('CALLS_PER_WIRE accounting: tag-list + N folder fetches', async () => {
    fetchSpy.mockResolvedValueOnce(
      tagList(['GST-pe-ma', 'GST-enterprise-tech', 'GST-ai-automation', 'GST-security'])
    );
    for (let i = 0; i < 4; i++) fetchSpy.mockResolvedValueOnce(streamResponse());

    await fetchAllStreams(env, 'GST-', 15);

    // 1 + 4 = 5. The constant `CALLS_PER_WIRE = 5` depends on this shape.
    expect(fetchSpy).toHaveBeenCalledTimes(5);
  });

  it('CALLS_PER_FYI accounting: exactly 1 outbound call per fetchAnnotatedItems', async () => {
    fetchSpy.mockResolvedValueOnce(streamResponse());

    await fetchAnnotatedItems(env, 30);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
