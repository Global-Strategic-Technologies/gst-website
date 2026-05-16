/**
 * Unit tests for the Worker-specific Inoreader client (BL-032 Phase 4a).
 *
 * Mocks `fetch` globally to return canned Inoreader responses; mocks the
 * `@upstash/redis` constructor at the module boundary so token-resolution
 * paths are testable without a live Upstash project. Covers:
 *
 *   - resolveConfig branches: env-only, Upstash-cached-token, fallback chain
 *   - failure-mode mapping: 401 → token-stale, 429 → inoreader-rate-limit,
 *     5xx → upstream-error, fetch throw → network-timeout
 *   - fetchAnnotatedItems happy path + each failure mode
 *   - fetchAllStreams: tag-list discovery + parallel folder fetches +
 *     dedupe + sort
 *   - fetchAllStreams 429 propagation (any folder 429 wins, opens breaker
 *     in caller)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock @upstash/redis BEFORE the module-under-test imports it. `vi.mock()`
// is hoisted to the top of the file by vitest, so we use `vi.hoisted()` to
// lift the mock-fn reference alongside it. Wrap as a plain class so `new
// Redis(...)` works through the mock (vi.fn() with mockImplementation
// returning a value doesn't always behave as a constructor under vitest's
// ESM mocking).
const { mockGet, MockRedis } = vi.hoisted(() => {
  const mockGet = vi.fn();
  class MockRedis {
    get = mockGet;
  }
  return { mockGet, MockRedis };
});

vi.mock('@upstash/redis', () => ({
  Redis: MockRedis,
}));

import {
  fetchAnnotatedItems,
  fetchAllStreams,
  fetchFolderStream,
} from '../../src/lib/inoreader-worker';
import type { Env } from '../../src/worker';

const baseEnv: Env = {
  INOREADER_APP_ID: 'test-app-id',
  INOREADER_APP_KEY: 'test-app-key',
  INOREADER_ACCESS_TOKEN: 'env-access-token',
  // Inoreader DB (read-only) — only DB this module talks to.
  UPSTASH_INOREADER_REST_URL: 'https://inoreader-db.upstash.io',
  UPSTASH_INOREADER_REST_TOKEN: 'test-inoreader-readonly',
  // MCP DB also bound so test fixtures look like a real prod env, even
  // though `inoreader-worker.ts` doesn't read from this DB.
  UPSTASH_MCP_REST_URL: 'https://mcp-db.upstash.io',
  UPSTASH_MCP_REST_TOKEN: 'test-mcp-standard',
};

const fetchSpy = vi.fn();

beforeEach(() => {
  fetchSpy.mockReset();
  mockGet.mockReset();
  vi.stubGlobal('fetch', fetchSpy);
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

function makeStreamResponse(items: { id: string; published: number; canonicalHref?: string }[]) {
  return {
    direction: 'ltr',
    id: 'test-stream',
    updated: Date.now() / 1000,
    items: items.map((it) => ({
      id: it.id,
      title: `Title ${it.id}`,
      published: it.published,
      origin: { streamId: 's', title: 'src', htmlUrl: 'https://example.com' },
      categories: [],
      canonical: it.canonicalHref ? [{ href: it.canonicalHref }] : undefined,
    })),
  };
}

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

describe('resolveConfig (via fetchAnnotatedItems entry point)', () => {
  it('returns config-missing when INOREADER_APP_ID is absent', async () => {
    mockGet.mockResolvedValue('upstash-token');
    const result = await fetchAnnotatedItems({ ...baseEnv, INOREADER_APP_ID: undefined }, 5);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('config-missing');
    expect(result.status).toBe(500);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('prefers Upstash token over env fallback', async () => {
    mockGet.mockResolvedValue('upstash-token');
    fetchSpy.mockResolvedValue(jsonResponse(makeStreamResponse([])));

    await fetchAnnotatedItems(baseEnv, 5);

    // First diagnose whether mockGet was called at all — the mock-binding
    // can fail silently if vi.hoisted didn't lift the reference correctly.
    expect(mockGet).toHaveBeenCalledWith('inoreader:access_token');
    const call = fetchSpy.mock.calls[0]!;
    const headers = call[1].headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer upstash-token');
  });

  it('falls back to env token when Upstash returns null', async () => {
    mockGet.mockResolvedValue(null);
    fetchSpy.mockResolvedValue(jsonResponse(makeStreamResponse([])));

    await fetchAnnotatedItems(baseEnv, 5);

    const headers = fetchSpy.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer env-access-token');
  });

  it('falls back to env token when Upstash throws (treats network error as miss)', async () => {
    mockGet.mockRejectedValue(new Error('upstash unreachable'));
    fetchSpy.mockResolvedValue(jsonResponse(makeStreamResponse([])));

    await fetchAnnotatedItems(baseEnv, 5);

    const headers = fetchSpy.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer env-access-token');
  });

  it('returns token-missing when both Upstash and env fallback are empty', async () => {
    mockGet.mockResolvedValue(null);
    const result = await fetchAnnotatedItems({ ...baseEnv, INOREADER_ACCESS_TOKEN: undefined }, 5);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('token-missing');
  });

  it('skips Inoreader DB entirely when its credentials are missing (env-only path)', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(makeStreamResponse([])));

    await fetchAnnotatedItems(
      {
        ...baseEnv,
        UPSTASH_INOREADER_REST_URL: undefined,
        UPSTASH_INOREADER_REST_TOKEN: undefined,
      },
      5
    );

    expect(mockGet).not.toHaveBeenCalled();
    const headers = fetchSpy.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer env-access-token');
  });
});

// ---------------------------------------------------------------------------
// fetchAnnotatedItems — failure-mode mapping
// ---------------------------------------------------------------------------

describe('fetchAnnotatedItems — happy path + failure modes', () => {
  beforeEach(() => {
    mockGet.mockResolvedValue('upstash-token');
  });

  it('returns ok=true with parsed stream on 200', async () => {
    const stream = makeStreamResponse([
      { id: 'item-1', published: 1000, canonicalHref: 'https://example.com/1' },
    ]);
    fetchSpy.mockResolvedValue(jsonResponse(stream));

    const result = await fetchAnnotatedItems(baseEnv, 5);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.items).toHaveLength(1);
    expect(result.data.items[0].id).toBe('item-1');
  });

  it('maps 401 to token-stale', async () => {
    fetchSpy.mockResolvedValue(new Response('unauthorized', { status: 401 }));

    const result = await fetchAnnotatedItems(baseEnv, 5);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(401);
    expect(result.reason).toBe('token-stale');
    expect(result.message).toMatch(/website-side will refresh|website-side ISR/i);
  });

  it('maps 429 to inoreader-rate-limit', async () => {
    fetchSpy.mockResolvedValue(new Response('too many', { status: 429 }));

    const result = await fetchAnnotatedItems(baseEnv, 5);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(429);
    expect(result.reason).toBe('inoreader-rate-limit');
  });

  // T.Z.3 (BL-032.7) — 429 envelope carries Inoreader's documented
  // rate-limit headers so downstream callers can attach them as Sentry
  // tags. RCA on the next 429 should be a 30-second tag read, not a
  // multi-hour Inoreader dashboard hunt.
  it('429 envelope includes parsed X-Reader-Zone* headers as rateLimitInfo', async () => {
    fetchSpy.mockResolvedValue(
      new Response('too many', {
        status: 429,
        headers: {
          'X-Reader-Zone1-Limit': '100',
          'X-Reader-Zone1-Usage': '100',
          'X-Reader-Zone2-Limit': '100',
          'X-Reader-Zone2-Usage': '17',
          'X-Reader-Limits-Reset-After': '14823',
        },
      })
    );

    const result = await fetchAnnotatedItems(baseEnv, 5);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('inoreader-rate-limit');
    expect(result.rateLimitInfo).toEqual({
      zone1Limit: 100,
      zone1Usage: 100,
      zone2Limit: 100,
      zone2Usage: 17,
      resetAfterSeconds: 14823,
    });
  });

  it('429 envelope handles missing rate-limit headers gracefully (proxy strip)', async () => {
    // Sanity check: if a CDN / proxy strips the X-Reader-* headers,
    // rateLimitInfo should still be present (envelope shape stable) but
    // every field undefined — NOT throw, NOT crash, NOT have literal
    // "undefined" strings showing up in the Sentry tags downstream.
    fetchSpy.mockResolvedValue(new Response('too many', { status: 429 }));

    const result = await fetchAnnotatedItems(baseEnv, 5);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rateLimitInfo).toEqual({
      zone1Limit: undefined,
      zone1Usage: undefined,
      zone2Limit: undefined,
      zone2Usage: undefined,
      resetAfterSeconds: undefined,
    });
  });

  it('maps other non-2xx to upstream-error', async () => {
    fetchSpy.mockResolvedValue(new Response('server error', { status: 503 }));

    const result = await fetchAnnotatedItems(baseEnv, 5);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(503);
    expect(result.reason).toBe('upstream-error');
  });

  it('maps fetch throw to network-timeout', async () => {
    fetchSpy.mockRejectedValue(new Error('aborted'));

    const result = await fetchAnnotatedItems(baseEnv, 5);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(504);
    expect(result.reason).toBe('network-timeout');
  });

  it('maps invalid JSON to upstream-error', async () => {
    fetchSpy.mockResolvedValue(
      new Response('<html>not json</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    );

    const result = await fetchAnnotatedItems(baseEnv, 5);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('upstream-error');
  });
});

// ---------------------------------------------------------------------------
// fetchAllStreams — tags discovery + parallel folder fetches
// ---------------------------------------------------------------------------

describe('fetchAllStreams', () => {
  beforeEach(() => {
    mockGet.mockResolvedValue('upstash-token');
  });

  it('discovers GST-prefixed folders, merges results, dedupes by canonical URL, sorts newest-first', async () => {
    const tagsResponse = jsonResponse({
      tags: [
        { id: 'user/-/label/GST-PE-MA' },
        { id: 'user/-/label/GST-Enterprise-Tech' },
        { id: 'user/-/label/Other-Folder' }, // should be filtered out
      ],
    });
    const peMaStream = makeStreamResponse([
      { id: 'a', published: 100, canonicalHref: 'https://example.com/a' },
      { id: 'b', published: 200, canonicalHref: 'https://example.com/b' },
    ]);
    const entStream = makeStreamResponse([
      { id: 'b-dup', published: 200, canonicalHref: 'https://example.com/b' }, // dupe of b
      { id: 'c', published: 300, canonicalHref: 'https://example.com/c' },
    ]);

    fetchSpy
      .mockResolvedValueOnce(tagsResponse)
      .mockResolvedValueOnce(jsonResponse(peMaStream))
      .mockResolvedValueOnce(jsonResponse(entStream));

    const result = await fetchAllStreams(baseEnv, 'GST-', 15);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 4 calls expected: tags + 2 folders (Other-Folder filtered out)
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    // 3 unique items (b-dup deduped); sorted newest-first by `published`.
    expect(result.data.items.map((i) => i.id)).toEqual(['c', 'b', 'a']);
  });

  it('returns inoreader-rate-limit immediately when ANY folder fetch returns 429', async () => {
    const tagsResponse = jsonResponse({
      tags: [{ id: 'user/-/label/GST-PE-MA' }, { id: 'user/-/label/GST-Security' }],
    });
    fetchSpy
      .mockResolvedValueOnce(tagsResponse)
      .mockResolvedValueOnce(jsonResponse(makeStreamResponse([{ id: 'a', published: 1 }])))
      .mockResolvedValueOnce(new Response('too many', { status: 429 }));

    const result = await fetchAllStreams(baseEnv);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('inoreader-rate-limit');
  });

  it('returns empty merged stream when no GST-prefixed folders exist (not a failure)', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ tags: [{ id: 'user/-/label/Personal' }] }));

    const result = await fetchAllStreams(baseEnv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.items).toEqual([]);
  });

  it('proceeds with successful folders if some folders fail with non-429 errors (soft-fail)', async () => {
    const tagsResponse = jsonResponse({
      tags: [{ id: 'user/-/label/GST-PE-MA' }, { id: 'user/-/label/GST-Security' }],
    });
    fetchSpy
      .mockResolvedValueOnce(tagsResponse)
      .mockResolvedValueOnce(jsonResponse(makeStreamResponse([{ id: 'a', published: 1 }])))
      .mockResolvedValueOnce(new Response('server error', { status: 503 }));

    const result = await fetchAllStreams(baseEnv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.items.map((i) => i.id)).toEqual(['a']);
  });

  it('propagates 429 from the tags-list fetch (cant discover folders)', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('too many', { status: 429 }));

    const result = await fetchAllStreams(baseEnv);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('inoreader-rate-limit');
  });
});

// ---------------------------------------------------------------------------
// fetchFolderStream
// ---------------------------------------------------------------------------

describe('fetchFolderStream', () => {
  it('builds the correct URL for a folder label', async () => {
    mockGet.mockResolvedValue('upstash-token');
    fetchSpy.mockResolvedValue(jsonResponse(makeStreamResponse([])));

    await fetchFolderStream(baseEnv, 'GST-PE-MA', 25);

    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain(encodeURIComponent('user/-/label/GST-PE-MA'));
    expect(url).toContain('n=25');
  });
});

// ---------------------------------------------------------------------------
// BL-039 — self-healing refresh on Inoreader 401
// ---------------------------------------------------------------------------
//
// The Worker's authenticatedFetch should:
//   1. On Inoreader 401 + INOREADER_REFRESH_SECRET set → POST the website
//      refresh endpoint, then retry the original Inoreader request ONCE.
//   2. On any failure of the refresh path (endpoint 503/502/4xx, network
//      error, missing secret) → surface the original 401 as `token-stale`.
//   3. Never retry more than once (no infinite loops).
//   4. Never invoke the refresh path on non-401 responses (no unnecessary
//      website calls).

const REFRESH_URL = 'https://globalstrategic.tech/api/inoreader/refresh';

const bl039Env: Env = {
  ...baseEnv,
  INOREADER_REFRESH_SECRET: 'test-shared-secret',
};

/** Helper: route fetch calls by URL — Inoreader vs refresh endpoint. */
function routeFetch(opts: {
  inoreader: Response[]; // consumed in order
  refresh?: Response | Error; // single response (refresh is called at most once)
}) {
  let inoreaderIdx = 0;
  fetchSpy.mockImplementation(async (url: string) => {
    if (url === REFRESH_URL) {
      if (!opts.refresh) {
        throw new Error('Unexpected refresh call — no refresh response configured');
      }
      if (opts.refresh instanceof Error) throw opts.refresh;
      return opts.refresh;
    }
    const next = opts.inoreader[inoreaderIdx++];
    if (!next) throw new Error(`Inoreader call ${inoreaderIdx} unmocked`);
    return next;
  });
}

describe('BL-039 — self-healing refresh on 401', () => {
  beforeEach(() => {
    mockGet.mockResolvedValue('upstash-token');
  });

  it('on 401 + secret bound: calls refresh endpoint, then retries Inoreader once and succeeds', async () => {
    const stream = makeStreamResponse([
      { id: 'item-1', published: 1000, canonicalHref: 'https://example.com/1' },
    ]);
    routeFetch({
      inoreader: [
        new Response('unauthorized', { status: 401 }),
        jsonResponse(stream), // retry succeeds
      ],
      refresh: new Response('{"ok":true}', { status: 200 }),
    });

    const result = await fetchAnnotatedItems(bl039Env, 5);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.items[0].id).toBe('item-1');

    // 3 fetch calls in order: Inoreader (401) → refresh (200) → Inoreader (retry 200)
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const calls = fetchSpy.mock.calls.map((c) => c[0]);
    expect(calls[0]).toContain('inoreader.com');
    expect(calls[1]).toBe(REFRESH_URL);
    expect(calls[2]).toContain('inoreader.com');
  });

  it('passes the shared secret as Bearer Authorization to the refresh endpoint', async () => {
    routeFetch({
      inoreader: [
        new Response('unauthorized', { status: 401 }),
        jsonResponse(makeStreamResponse([])),
      ],
      refresh: new Response('{"ok":true}', { status: 200 }),
    });

    await fetchAnnotatedItems(bl039Env, 5);

    const refreshCall = fetchSpy.mock.calls.find((c) => c[0] === REFRESH_URL)!;
    expect(refreshCall[1].method).toBe('POST');
    expect(refreshCall[1].headers.Authorization).toBe('Bearer test-shared-secret');
  });

  it('on 401 without INOREADER_REFRESH_SECRET: no refresh attempt, surfaces token-stale', async () => {
    fetchSpy.mockResolvedValue(new Response('unauthorized', { status: 401 }));

    const result = await fetchAnnotatedItems(baseEnv, 5); // baseEnv has NO refresh secret

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('token-stale');
    // ONE Inoreader call only — no refresh attempt.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('on 401 + refresh endpoint 503 (BL-039 disabled on website): no retry, surfaces token-stale', async () => {
    routeFetch({
      inoreader: [new Response('unauthorized', { status: 401 })],
      refresh: new Response('{"ok":false,"reason":"endpoint-disabled"}', { status: 503 }),
    });

    const result = await fetchAnnotatedItems(bl039Env, 5);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('token-stale');
    // Inoreader (401) + refresh (503) — but NO retry of Inoreader.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('on 401 + refresh endpoint 502 (Inoreader rejected refresh): no retry, surfaces token-stale', async () => {
    routeFetch({
      inoreader: [new Response('unauthorized', { status: 401 })],
      refresh: new Response('{"ok":false,"reason":"inoreader-rejected"}', { status: 502 }),
    });

    const result = await fetchAnnotatedItems(bl039Env, 5);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('token-stale');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('on 401 + refresh 200 + retry ALSO 401: no second retry, surfaces token-stale', async () => {
    routeFetch({
      inoreader: [
        new Response('unauthorized', { status: 401 }),
        new Response('still unauthorized', { status: 401 }),
      ],
      refresh: new Response('{"ok":true}', { status: 200 }),
    });

    const result = await fetchAnnotatedItems(bl039Env, 5);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('token-stale');
    // First Inoreader + refresh + second Inoreader = 3 calls; no THIRD Inoreader.
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('on 401 + refresh endpoint network error: no retry, surfaces token-stale', async () => {
    routeFetch({
      inoreader: [new Response('unauthorized', { status: 401 })],
      refresh: new Error('network unreachable'),
    });

    const result = await fetchAnnotatedItems(bl039Env, 5);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('token-stale');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('on non-401 Inoreader response: refresh endpoint is NOT called', async () => {
    fetchSpy.mockResolvedValue(new Response('rate-limited', { status: 429 }));

    const result = await fetchAnnotatedItems(bl039Env, 5);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('inoreader-rate-limit');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // Refresh URL never appears in the call log.
    expect(fetchSpy.mock.calls.some((c) => c[0] === REFRESH_URL)).toBe(false);
  });

  it('on 200 OK: refresh endpoint is NOT called (happy path unaffected)', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(makeStreamResponse([])));

    const result = await fetchAnnotatedItems(bl039Env, 5);

    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls.some((c) => c[0] === REFRESH_URL)).toBe(false);
  });

  it('after successful refresh, retry uses freshly-resolved access token from Upstash', async () => {
    // First mockGet returns the stale token. After refresh, Upstash has
    // been updated by the website, so the second mockGet returns the new
    // token. authenticatedFetch must re-resolve config before the retry.
    mockGet
      .mockResolvedValueOnce('stale-token-from-upstash') // initial resolveConfig
      .mockResolvedValueOnce('fresh-token-from-upstash'); // re-resolve after refresh

    routeFetch({
      inoreader: [
        new Response('unauthorized', { status: 401 }),
        jsonResponse(makeStreamResponse([])),
      ],
      refresh: new Response('{"ok":true}', { status: 200 }),
    });

    await fetchAnnotatedItems(bl039Env, 5);

    const inoreaderCalls = fetchSpy.mock.calls.filter((c) =>
      (c[0] as string).includes('inoreader.com')
    );
    expect(inoreaderCalls).toHaveLength(2);
    const firstAuth = (inoreaderCalls[0]![1].headers as Record<string, string>).Authorization;
    const retryAuth = (inoreaderCalls[1]![1].headers as Record<string, string>).Authorization;
    expect(firstAuth).toBe('Bearer stale-token-from-upstash');
    expect(retryAuth).toBe('Bearer fresh-token-from-upstash');
  });
});
