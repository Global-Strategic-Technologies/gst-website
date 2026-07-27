/**
 * Integration tests for the live radar tools — search_radar +
 * get_latest_insights (BL-032 Phase 4c).
 *
 * Mocks `@upstash/redis` (Upstash KV — both the cache layer for radar
 * results AND the OAuth-token read in inoreader-token-store) and global
 * `fetch` (Inoreader API). Exercises:
 *
 *   - Happy path: cache miss → Inoreader fetch → cache write → result
 *   - Cache hit: cached result returned without Inoreader call
 *   - Inoreader 429: failureResponse opens the circuit breaker + returns
 *     structured isError envelope
 *   - Circuit-already-open: tool short-circuits before any Inoreader call
 *   - search_radar category filter (capability-mirror with offline)
 *   - get_latest_insights limit/category filtering
 *   - Token-stale path: structured error, breaker NOT opened
 *
 * The tools are exercised via direct `handleSearchRadar` / `handleGet
 * LatestInsights` calls rather than the MCP transport — same handler
 * code path, much faster, no need to spin up a Worker per test.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock `@upstash/redis` — the inoreader-token-store, cache-store, AND
// circuit-breaker modules all instantiate Redis. A single MockRedis
// satisfies all three.
const { redisGet, redisSet, redisDel, redisTtl, MockRedis } = vi.hoisted(() => {
  const redisGet = vi.fn();
  const redisSet = vi.fn();
  const redisDel = vi.fn();
  const redisTtl = vi.fn();
  class MockRedis {
    get = redisGet;
    set = redisSet;
    del = redisDel;
    ttl = redisTtl;
  }
  return { redisGet, redisSet, redisDel, redisTtl, MockRedis };
});

vi.mock('@upstash/redis', () => ({ Redis: MockRedis }));

import { handleSearchRadar, handleGetLatestInsights } from '../../src/tools/radar-live';
import type { Env } from '../../src/worker';

// The radar tool handlers return a discriminated success/error union:
// `{ content, isError: true }` OR `{ content, structuredContent }`.
// Tests access `.isError` and `.structuredContent` without narrowing — the
// `wide` helper widens to a flat shape that supports both accessors in a
// single cast, keeping test code readable.
type WideResult = {
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  content?: Array<{ type: string; text: string }>;
};
const wide = <T>(r: T): T & WideResult => r as unknown as T & WideResult;

const TEST_KEY = 'test-mcp-key-rp';
const baseEnv: Env = {
  MCP_KEY_RP: TEST_KEY,
  INOREADER_APP_ID: 'test-app-id',
  INOREADER_APP_KEY: 'test-app-key',
  INOREADER_ACCESS_TOKEN: 'env-access-token',
  // Single MCP DB (post-BL-032.8 Phase B). The shared MockRedis collapses
  // all clients onto the same spies; `redisGet` dispatches by key
  // (`mcp:inoreader:*` for OAuth, `mcp:radar:cache:*` for cache,
  // `mcp:radar:circuit-open` for breaker).
  UPSTASH_MCP_REST_URL: 'https://mcp-db.upstash.io',
  UPSTASH_MCP_REST_TOKEN: 'test-mcp-standard',
};

const fetchSpy = vi.fn();

beforeEach(() => {
  redisGet.mockReset();
  redisSet.mockReset();
  redisDel.mockReset();
  redisTtl.mockReset();
  fetchSpy.mockReset();
  vi.stubGlobal('fetch', fetchSpy);

  // Default: empty cache, circuit closed, OAuth token comes from Upstash.
  redisGet.mockImplementation(async (key: string) => {
    if (key === 'mcp:inoreader:access_token') return 'upstash-access-token';
    return null; // cache misses + circuit closed
  });
  redisTtl.mockResolvedValue(-2); // -2 = key doesn't exist (circuit closed)
  redisSet.mockResolvedValue('OK');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

// Anchor fixture timestamps to a recent, always-fresh base so the FYI
// freshness gate (filterFreshFyi: drops annotations > 30 days old) never
// removes them. The `published` argument is a small relative-recency rank
// (higher = newer); we offset it from a base ~1 day ago, preserving the
// ordering the sort-assertions rely on while keeping every item well inside
// the 30-day window. Mirrors the `Date.now()`-anchoring in
// tests/fixtures/radar-mock-data.ts.
const RECENT_BASE_S = Math.floor(Date.now() / 1000) - 100_000;

function makeInoreaderItem(
  id: string,
  published: number,
  category: 'GST-PE-MA' | 'GST-Enterprise-Tech' | 'GST-AI-Automation' | 'GST-Security',
  hasAnnotation = false
) {
  const publishedTs = RECENT_BASE_S + published;
  return {
    id,
    title: `Title ${id}`,
    published: publishedTs,
    origin: { streamId: 's', title: 'Source', htmlUrl: 'https://example.com' },
    canonical: [{ href: `https://example.com/${id}` }],
    categories: [`user/-/label/${category}`],
    annotations: hasAnnotation
      ? [{ id: 1, start: 0, end: 10, added_on: publishedTs, text: 'highlight', note: 'GST take' }]
      : undefined,
  };
}

function setupHappyInoreaderResponses(
  fyiItems: ReturnType<typeof makeInoreaderItem>[],
  wireFolders: { folder: string; items: ReturnType<typeof makeInoreaderItem>[] }[] = []
) {
  // search_radar issues TWO parallel calls: readWireLive (which calls
  // fetchAllStreams → tag-list + folder fetches) and readFyiLive (which
  // calls fetchAnnotatedItems). The mock fetch handler routes by URL.
  fetchSpy.mockImplementation(async (url: string | URL) => {
    const urlStr = typeof url === 'string' ? url : url.toString();

    if (urlStr.includes('annotated')) {
      return jsonResponse({
        direction: 'ltr',
        id: 'annotated',
        updated: Date.now() / 1000,
        items: fyiItems,
      });
    }
    if (urlStr.includes('tag/list')) {
      return jsonResponse({
        tags: wireFolders.map((f) => ({ id: `user/-/label/${f.folder}` })),
      });
    }
    // Folder fetch — find by label
    for (const f of wireFolders) {
      if (urlStr.includes(encodeURIComponent(`user/-/label/${f.folder}`))) {
        return jsonResponse({
          direction: 'ltr',
          id: f.folder,
          updated: Date.now() / 1000,
          items: f.items,
        });
      }
    }
    return jsonResponse({ direction: 'ltr', id: 'empty', updated: 0, items: [] });
  });
}

// ---------------------------------------------------------------------------
// search_radar — happy path + filter
// ---------------------------------------------------------------------------

describe('search_radar — happy path', () => {
  it('merges FYI + Wire, dedupes by URL, sorts newest-first, emits deeplink', async () => {
    const fyi = [makeInoreaderItem('fyi-1', 200, 'GST-PE-MA', true)];
    const wire = [
      { folder: 'GST-PE-MA', items: [makeInoreaderItem('wire-pema-1', 100, 'GST-PE-MA')] },
      {
        folder: 'GST-Enterprise-Tech',
        items: [makeInoreaderItem('wire-ent-1', 300, 'GST-Enterprise-Tech')],
      },
    ];
    setupHappyInoreaderResponses(fyi, wire);

    const result = await handleSearchRadar(baseEnv, {});

    expect(wide(result).isError).toBeUndefined();
    expect(wide(result).structuredContent).toBeDefined();
    const payload = wide(result).structuredContent as {
      matches: Array<{ id: string; tier: string; publishedAt: string }>;
      totalMatched: number;
      deeplink: string;
      liveInfo: { wireCacheHit: boolean; fyiCacheHit: boolean };
    };
    expect(payload.totalMatched).toBe(3);
    // Newest-first: wire-ent-1 (published 300) → fyi-1 (200) → wire-pema-1 (100)
    expect(payload.matches.map((m) => m.id)).toEqual(['wire-ent-1', 'fyi-1', 'wire-pema-1']);
    expect(payload.deeplink).toBe('https://globalstrategic.tech/hub/radar');
    expect(payload.liveInfo.wireCacheHit).toBe(false);
    expect(payload.liveInfo.fyiCacheHit).toBe(false);
  });

  it('filters by category', async () => {
    const fyi = [
      makeInoreaderItem('fyi-pema', 100, 'GST-PE-MA', true),
      makeInoreaderItem('fyi-ent', 200, 'GST-Enterprise-Tech', true),
    ];
    setupHappyInoreaderResponses(fyi, []);

    const result = await handleSearchRadar(baseEnv, { category: 'pe-ma' });

    const payload = wide(result).structuredContent as {
      matches: Array<{ id: string; category: string }>;
      deeplink: string;
    };
    expect(payload.matches).toHaveLength(1);
    expect(payload.matches[0].id).toBe('fyi-pema');
    expect(payload.deeplink).toBe('https://globalstrategic.tech/hub/radar?category=pe-ma');
  });

  it('writes results to cache on miss (subsequent calls would hit cache)', async () => {
    setupHappyInoreaderResponses([makeInoreaderItem('fyi-1', 1, 'GST-PE-MA', true)], []);

    await handleSearchRadar(baseEnv, {});

    // Should have written both cache keys (wire + fyi).
    const setKeys = redisSet.mock.calls.map((c) => c[0]);
    expect(setKeys).toContain('mcp:radar:cache:wire');
    expect(setKeys).toContain('mcp:radar:cache:fyi');
  });
});

// ---------------------------------------------------------------------------
// search_radar — cache hit
// ---------------------------------------------------------------------------

describe('search_radar — cache hit path', () => {
  it('returns cached items without invoking Inoreader fetch', async () => {
    // Fresh annotatedAt so the read-time freshness gate keeps the cached
    // item (cache holds raw items; filterFreshFyi runs on read).
    const recentIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const cachedFyi = {
      tier: 'fyi',
      items: [
        {
          id: 'cached-fyi-1',
          title: 'Cached',
          url: 'https://example.com/cached',
          source: 'CachedSrc',
          category: 'pe-ma',
          publishedAt: recentIso,
          annotatedAt: recentIso,
          annotation: { highlightedText: 'h', gstTake: 't' },
        },
      ],
      fetchedAt: recentIso,
    };
    const cachedWire = { tier: 'wire', items: [], fetchedAt: recentIso };

    redisGet.mockImplementation(async (key: string) => {
      if (key === 'mcp:radar:cache:wire') return { storedAt: Date.now(), data: cachedWire };
      if (key === 'mcp:radar:cache:fyi') return { storedAt: Date.now(), data: cachedFyi };
      if (key === 'mcp:inoreader:access_token') return 'upstash-access-token';
      return null;
    });

    const result = await handleSearchRadar(baseEnv, {});

    expect(wide(result).isError).toBeUndefined();
    const payload = wide(result).structuredContent as {
      matches: Array<{ id: string }>;
      liveInfo: { wireCacheHit: boolean; fyiCacheHit: boolean };
    };
    expect(payload.matches.map((m) => m.id)).toEqual(['cached-fyi-1']);
    expect(payload.liveInfo.wireCacheHit).toBe(true);
    expect(payload.liveInfo.fyiCacheHit).toBe(true);

    // No Inoreader fetch should have occurred (only the OAuth token read,
    // which goes through redisGet, not fetch).
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// BL-091 — circuit open: serve cached data (degraded) instead of a hard 503
// ---------------------------------------------------------------------------

describe('radar tools — circuit open, cache warm (BL-091 degraded path)', () => {
  const recentIso = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();

  /** Seed: breaker OPEN (1h left) + whichever cache blobs the test supplies. */
  function seed(opts: { wire?: unknown; fyi?: unknown }) {
    redisGet.mockImplementation(async (key: string) => {
      if (key === 'mcp:radar:circuit-open') return 'inoreader-429';
      if (key === 'mcp:inoreader:access_token') return 'upstash-access-token';
      if (key === 'mcp:radar:cache:wire' && opts.wire)
        return { storedAt: Date.now(), data: opts.wire };
      if (key === 'mcp:radar:cache:fyi' && opts.fyi)
        return { storedAt: Date.now(), data: opts.fyi };
      return null;
    });
    redisTtl.mockResolvedValue(3600);
  }

  const fyiItem = (id: string) => ({
    id,
    title: `T ${id}`,
    url: `https://example.com/${id}`,
    source: 'Src',
    category: 'pe-ma',
    publishedAt: recentIso(),
    annotatedAt: recentIso(),
    annotation: { highlightedText: 'h', gstTake: 't' },
  });

  it('search_radar serves the cached snapshot flagged degraded, with NO Inoreader call', async () => {
    seed({
      wire: { tier: 'wire', items: [], fetchedAt: recentIso() },
      fyi: { tier: 'fyi', items: [fyiItem('warm-1')], fetchedAt: recentIso() },
    });

    const result = await handleSearchRadar(baseEnv, {});

    // The whole point: a warm cache is served instead of a 503.
    expect(wide(result).isError).toBeUndefined();
    const payload = wide(result).structuredContent as {
      matches: Array<{ id: string }>;
      liveInfo: { degraded: boolean; retryAfterSeconds?: number; fyiCacheHit: boolean };
    };
    expect(payload.matches.map((m) => m.id)).toEqual(['warm-1']);
    expect(payload.liveInfo.degraded).toBe(true);
    expect(payload.liveInfo.retryAfterSeconds).toBe(3600);
    expect(payload.liveInfo.fyiCacheHit).toBe(true);
    // The invariant that must hold in EVERY breaker-open case.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('serves the one warm tier when the other is cache-empty, nulling the absent tier', async () => {
    // Wire warm, FYI absent entirely.
    seed({
      wire: {
        tier: 'wire',
        items: [{ ...fyiItem('warm-wire'), annotation: undefined, annotatedAt: undefined }],
        fetchedAt: recentIso(),
      },
    });

    const result = await handleSearchRadar(baseEnv, {});

    expect(wide(result).isError).toBeUndefined();
    const payload = wide(result).structuredContent as {
      matches: Array<{ id: string }>;
      liveInfo: {
        degraded: boolean;
        wireCacheHit: boolean | null;
        wireFetchedAt: string | null;
        fyiCacheHit: boolean | null;
        fyiFetchedAt: string | null;
      };
    };
    expect(payload.matches.map((m) => m.id)).toEqual(['warm-wire']);
    expect(payload.liveInfo.degraded).toBe(true);
    expect(payload.liveInfo.wireCacheHit).toBe(true);
    // Absent tier reports null rather than a fabricated timestamp/flag.
    expect(payload.liveInfo.fyiCacheHit).toBeNull();
    expect(payload.liveInfo.fyiFetchedAt).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('get_latest_insights returns an empty-but-successful result when the cached FYI has aged out', async () => {
    // Cache holds RAW items; the read-time freshness gate drops anything
    // older than the FYI age cap, so this yields zero items — an accurate
    // "no fresh insights", NOT an error.
    const ancient = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    seed({
      fyi: {
        tier: 'fyi',
        items: [{ ...fyiItem('stale-1'), publishedAt: ancient, annotatedAt: ancient }],
        fetchedAt: recentIso(),
      },
    });

    const result = await handleGetLatestInsights(baseEnv, {});

    expect(wide(result).isError).toBeUndefined();
    const payload = wide(result).structuredContent as {
      returned: number;
      liveInfo: { degraded: boolean };
    };
    expect(payload.returned).toBe(0);
    expect(payload.liveInfo.degraded).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('get_latest_insights serves warm cached FYI flagged degraded', async () => {
    seed({ fyi: { tier: 'fyi', items: [fyiItem('warm-fyi')], fetchedAt: recentIso() } });

    const result = await handleGetLatestInsights(baseEnv, {});

    expect(wide(result).isError).toBeUndefined();
    const payload = wide(result).structuredContent as {
      items: Array<{ id: string }>;
      liveInfo: { degraded: boolean; cacheHit: boolean | null };
    };
    expect(payload.items.map((i) => i.id)).toEqual(['warm-fyi']);
    expect(payload.liveInfo.degraded).toBe(true);
    expect(payload.liveInfo.cacheHit).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('marks degraded=false on the normal path (breaker closed)', async () => {
    fetchSpy.mockImplementation(async (url: string) => {
      if (String(url).includes('tag/list')) return jsonResponse({ tags: [] });
      return jsonResponse({ items: [] });
    });

    const result = await handleSearchRadar(baseEnv, {});

    const payload = wide(result).structuredContent as { liveInfo: { degraded: boolean } };
    expect(payload.liveInfo.degraded).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// search_radar — failure modes
//
// NOTE (BL-091): the two circuit-open cases below run with the default empty
// cache, so they are the **cold-cache** regression — the one state that still
// returns a hard 503. The warm-cache behavior lives in the degraded-path
// describe above.
// ---------------------------------------------------------------------------

describe('search_radar — failure modes', () => {
  it('Inoreader 429 → opens circuit breaker, returns isError envelope with reason=inoreader-rate-limit', async () => {
    fetchSpy.mockResolvedValue(new Response('too many', { status: 429 }));

    const result = await handleSearchRadar(baseEnv, {});

    expect(wide(result).isError).toBe(true);
    const errorPayload = JSON.parse((result.content[0] as { text: string }).text) as {
      error: string;
      status: number;
    };
    expect(errorPayload.error).toBe('inoreader-rate-limit');
    expect(errorPayload.status).toBe(429);

    // Circuit breaker should have been opened (set call to mcp:radar:circuit-open).
    const circuitWrite = redisSet.mock.calls.find((c) => c[0] === 'mcp:radar:circuit-open');
    expect(circuitWrite).toBeDefined();
    // TTL roughly 6h (21600s).
    expect((circuitWrite![2] as { ex: number }).ex).toBe(6 * 60 * 60);
  });

  it('circuit already open → 503 envelope; Inoreader fetch never happens', async () => {
    redisGet.mockImplementation(async (key: string) => {
      if (key === 'mcp:radar:circuit-open') return 'inoreader-429';
      if (key === 'mcp:inoreader:access_token') return 'upstash-access-token';
      return null;
    });
    redisTtl.mockResolvedValue(3600); // 1h remaining on circuit

    const result = await handleSearchRadar(baseEnv, {});

    expect(wide(result).isError).toBe(true);
    const errorPayload = JSON.parse((result.content[0] as { text: string }).text) as {
      error: string;
      status: number;
      retryAfterSeconds: number;
    };
    expect(errorPayload.error).toBe('service_unavailable');
    expect(errorPayload.status).toBe(503);
    expect(errorPayload.retryAfterSeconds).toBe(3600);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('token-stale → isError envelope; circuit NOT opened (tokens are website concern)', async () => {
    fetchSpy.mockResolvedValue(new Response('unauthorized', { status: 401 }));

    const result = await handleSearchRadar(baseEnv, {});

    expect(wide(result).isError).toBe(true);
    const errorPayload = JSON.parse((result.content[0] as { text: string }).text) as {
      error: string;
    };
    expect(errorPayload.error).toBe('token-stale');

    // Circuit must NOT have been opened — token issues are not the same as
    // budget exhaustion. Website refreshes; Worker retries on next call.
    const circuitWrite = redisSet.mock.calls.find((c) => c[0] === 'mcp:radar:circuit-open');
    expect(circuitWrite).toBeUndefined();
  });

  it('config-missing when Inoreader app creds are absent', async () => {
    const env: Env = { ...baseEnv, INOREADER_APP_ID: undefined };

    const result = await handleSearchRadar(env, {});

    expect(wide(result).isError).toBe(true);
    const errorPayload = JSON.parse((result.content[0] as { text: string }).text) as {
      error: string;
    };
    expect(errorPayload.error).toBe('config-missing');
  });
});

// ---------------------------------------------------------------------------
// get_latest_insights
// ---------------------------------------------------------------------------

describe('get_latest_insights', () => {
  it('returns FYI items only, respects limit + category filter, newest-first', async () => {
    const fyi = [
      makeInoreaderItem('fyi-pema-1', 100, 'GST-PE-MA', true),
      makeInoreaderItem('fyi-pema-2', 200, 'GST-PE-MA', true),
      makeInoreaderItem('fyi-ent-1', 300, 'GST-Enterprise-Tech', true),
    ];
    setupHappyInoreaderResponses(fyi, []);

    const result = await handleGetLatestInsights(baseEnv, { category: 'pe-ma', limit: 5 });

    expect(wide(result).isError).toBeUndefined();
    const payload = wide(result).structuredContent as {
      items: Array<{ id: string }>;
      returned: number;
    };
    // Descending by publishedAt: fyi-pema-2 (200) before fyi-pema-1 (100).
    expect(payload.items.map((i) => i.id)).toEqual(['fyi-pema-2', 'fyi-pema-1']);
    expect(payload.returned).toBe(2);
  });

  it('sorts strictly newest-first even when feed order disagrees (T.B.10.a regression)', async () => {
    // Inoreader's "annotated" stream returned same-day items in arrival
    // order, not publication order — soak T.B.10.a / 2026-05-10 caught
    // 4/16 5:56pm appearing before 4/16 7:56pm in the response. The handler
    // must sort by publishedAt descending, mirroring search_radar.
    const fyi = [
      makeInoreaderItem('older-same-day', 100, 'GST-PE-MA', true),
      makeInoreaderItem('newer-same-day', 150, 'GST-PE-MA', true),
      makeInoreaderItem('next-day', 200, 'GST-PE-MA', true),
    ];
    setupHappyInoreaderResponses(fyi, []);

    const result = await handleGetLatestInsights(baseEnv, {});

    const payload = wide(result).structuredContent as { items: Array<{ id: string }> };
    expect(payload.items.map((i) => i.id)).toEqual([
      'next-day',
      'newer-same-day',
      'older-same-day',
    ]);
  });

  it('default limit is 10', async () => {
    const fyi = Array.from({ length: 15 }, (_, i) =>
      makeInoreaderItem(`fyi-${i}`, 100 + i, 'GST-PE-MA', true)
    );
    setupHappyInoreaderResponses(fyi, []);

    const result = await handleGetLatestInsights(baseEnv, {});

    const payload = wide(result).structuredContent as { returned: number };
    expect(payload.returned).toBe(10);
  });

  it('circuit-open short-circuits get_latest_insights too', async () => {
    redisGet.mockImplementation(async (key: string) => {
      if (key === 'mcp:radar:circuit-open') return 'inoreader-429';
      if (key === 'mcp:inoreader:access_token') return 'upstash-access-token';
      return null;
    });
    redisTtl.mockResolvedValue(3600);

    const result = await handleGetLatestInsights(baseEnv, {});

    expect(wide(result).isError).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
