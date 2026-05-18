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
const { mockGet, mockSet, mockDel, MockRedis } = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockSet = vi.fn();
  const mockDel = vi.fn();
  class MockRedis {
    get = mockGet;
    set = mockSet;
    del = mockDel;
  }
  return { mockGet, mockSet, mockDel, MockRedis };
});

vi.mock('@upstash/redis', () => ({
  Redis: MockRedis,
}));

import {
  fetchAnnotatedItems,
  fetchAllStreams,
  fetchFolderStream,
} from '../../src/lib/inoreader-client';
import type { Env } from '../../src/worker';

const baseEnv: Env = {
  INOREADER_APP_ID: 'test-app-id',
  INOREADER_APP_KEY: 'test-app-key',
  INOREADER_ACCESS_TOKEN: 'env-access-token',
  // Inoreader DB (read-only) — only DB this module talks to.
  UPSTASH_INOREADER_REST_URL: 'https://inoreader-db.upstash.io',
  UPSTASH_INOREADER_REST_TOKEN: 'test-inoreader-readonly',
  // MCP DB also bound so test fixtures look like a real prod env, even
  // though `inoreader-client.ts` doesn't read from this DB.
  UPSTASH_MCP_REST_URL: 'https://mcp-db.upstash.io',
  UPSTASH_MCP_REST_TOKEN: 'test-mcp-standard',
};

const fetchSpy = vi.fn();

beforeEach(() => {
  fetchSpy.mockReset();
  mockGet.mockReset();
  mockSet.mockReset();
  mockDel.mockReset();
  // Default lock + token writes succeed silently. Individual tests that
  // exercise the OAuth-write failure paths override these via mockSet.
  mockSet.mockResolvedValue('OK');
  mockDel.mockResolvedValue(1);
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

  it('prefers Upstash token over env fallback (MCP DB read first per Phase 2 dual-read)', async () => {
    mockGet.mockResolvedValue('upstash-token');
    fetchSpy.mockResolvedValue(jsonResponse(makeStreamResponse([])));

    await fetchAnnotatedItems(baseEnv, 5);

    // Phase 2: readAccessToken tries MCP DB first (mcp:inoreader:access_token);
    // returns immediately on hit. Pre-Phase-2 this hit inoreader:access_token.
    expect(mockGet).toHaveBeenCalledWith('mcp:inoreader:access_token');
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

  it('skips Upstash entirely when both DB credentials are missing (env-only path)', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(makeStreamResponse([])));

    await fetchAnnotatedItems(
      {
        ...baseEnv,
        UPSTASH_INOREADER_REST_URL: undefined,
        UPSTASH_INOREADER_REST_TOKEN: undefined,
        UPSTASH_MCP_REST_URL: undefined,
        UPSTASH_MCP_REST_TOKEN: undefined,
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

  // T.Z.3 (BL-032.7) — body excerpt capture for Sentry `extra`. Inoreader
  // occasionally returns a human-readable hint in the 429 body ("App over
  // daily limit" vs "User over daily limit") that distinguishes app-wide
  // exhaustion from per-user policy enforcement.
  it('429 envelope includes the first ~200 chars of the response body', async () => {
    fetchSpy.mockResolvedValue(
      new Response('App over daily limit. Please retry later.', { status: 429 })
    );

    const result = await fetchAnnotatedItems(baseEnv, 5);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.bodyExcerpt).toBe('App over daily limit. Please retry later.');
  });

  it('429 envelope truncates body excerpt to 200 chars', async () => {
    // 250-char body → only the first 200 chars should land on the envelope.
    const longBody = 'A'.repeat(250);
    fetchSpy.mockResolvedValue(new Response(longBody, { status: 429 }));

    const result = await fetchAnnotatedItems(baseEnv, 5);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.bodyExcerpt).toBe('A'.repeat(200));
    expect(result.bodyExcerpt!.length).toBe(200);
  });

  it('429 envelope omits bodyExcerpt when the body is empty', async () => {
    fetchSpy.mockResolvedValue(new Response('', { status: 429 }));

    const result = await fetchAnnotatedItems(baseEnv, 5);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Stable envelope shape — present-when-meaningful, absent otherwise.
    expect(result.bodyExcerpt).toBeUndefined();
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
// authenticatedFetch self-healing on 401 — Phase 2 architecture
// ---------------------------------------------------------------------------
//
// BL-032.8 Phase 2 changed the recovery cascade on Inoreader 401:
//
//   1. PRIMARY — Worker-direct refresh via refreshAccessToken('live-tool').
//      Reads refresh_token from Upstash, POSTs to inoreader.com/oauth2/token,
//      writes new tokens to MCP DB.
//   2. FALLBACK (Phase A only) — BL-039 round-trip through the website's
//      /api/inoreader/refresh endpoint, but ONLY when primary returned
//      reason: 'inoreader-error' (transient upstream failure).
//
// For any other primary failure reason (invalid-refresh-token,
// upstash-write-failed, lock-timeout, token-missing): surface the original
// 401 as token-stale without trying BL-039 — those reasons aren't
// website-recoverable.

const REFRESH_URL = 'https://globalstrategic.tech/api/inoreader/refresh';
const OAUTH_TOKEN_URL = 'https://www.inoreader.com/oauth2/token';

/** Env with refresh creds for both the primary (refreshAccessToken) AND the BL-039 fallback paths. */
const oauthEnv: Env = {
  ...baseEnv,
  INOREADER_REFRESH_TOKEN: 'test-refresh-token',
  INOREADER_REFRESH_SECRET: 'test-shared-secret',
};

/**
 * Route fetch calls by URL — three distinct channels:
 *   - inoreader: stream API calls (e.g. /reader/api/0/stream/contents/*).
 *     Array consumed in order.
 *   - oauth2Token: response from /oauth2/token. Defaults to 503 so the
 *     primary refreshAccessToken path fails with `inoreader-error`,
 *     which triggers the BL-039 fallback chain we're testing. Set to a
 *     200 JSON response to exercise primary-path success.
 *   - refresh: response from the BL-039 website endpoint. Optional —
 *     tests that expect BL-039 to be skipped pass `undefined`.
 */
function routeFetch(opts: {
  inoreader: Response[];
  oauth2Token?: Response | Error;
  refresh?: Response | Error;
}) {
  let inoreaderIdx = 0;
  fetchSpy.mockImplementation(async (url: string) => {
    if (url === OAUTH_TOKEN_URL) {
      const value = opts.oauth2Token ?? new Response('{"error":"server_error"}', { status: 503 });
      if (value instanceof Error) throw value;
      return value;
    }
    if (url === REFRESH_URL) {
      if (!opts.refresh) {
        throw new Error('Unexpected BL-039 refresh call — no refresh response configured');
      }
      if (opts.refresh instanceof Error) throw opts.refresh;
      return opts.refresh;
    }
    const next = opts.inoreader[inoreaderIdx++];
    if (!next) throw new Error(`Inoreader call ${inoreaderIdx} unmocked`);
    return next;
  });
}

// Primary path: refreshAccessToken (Worker-direct /oauth2/token).
describe('authenticatedFetch — primary refresh path (BL-032.8 Phase 2)', () => {
  beforeEach(() => {
    mockGet.mockResolvedValue('upstash-token');
  });

  it('on 401 → /oauth2/token success → retry succeeds (no BL-039 round-trip)', async () => {
    const stream = makeStreamResponse([
      { id: 'item-1', published: 1000, canonicalHref: 'https://example.com/1' },
    ]);
    routeFetch({
      inoreader: [new Response('unauthorized', { status: 401 }), jsonResponse(stream)],
      oauth2Token: jsonResponse({
        access_token: 'fresh-access',
        refresh_token: 'fresh-refresh',
        expires_in: 3600,
      }),
      // refresh deliberately undefined — BL-039 must NOT be called.
    });

    const result = await fetchAnnotatedItems(oauthEnv, 5);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.items[0].id).toBe('item-1');

    // 3 fetch calls: Inoreader (401) → /oauth2/token (200) → Inoreader (retry 200).
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const calls = fetchSpy.mock.calls.map((c) => c[0]);
    expect(calls[0]).toContain('inoreader.com');
    expect(calls[1]).toBe(OAUTH_TOKEN_URL);
    expect(calls[2]).toContain('inoreader.com');
    // BL-039 fallback explicitly NOT invoked on primary success.
    expect(calls.some((u) => u === REFRESH_URL)).toBe(false);
  });

  it('after primary refresh success, retry uses the freshly-written MCP DB token', async () => {
    // Companion to the BL-039-fallback "fresh-token on retry" test below,
    // but for the PRIMARY path (no fallback): refreshAccessToken writes a
    // new access token to mcp:inoreader:access_token, then retryWithFreshConfig
    // re-resolves and the retry's Authorization header carries the new value.
    //
    // We simulate the in-place token-store update by flipping the MCP
    // access-token read after fetchSpy receives the /oauth2/token POST.
    let mcpAccessToken: string | null = 'stale-primary';
    mockGet.mockImplementation(async (key: string) => {
      if (key === 'mcp:inoreader:access_token') return mcpAccessToken;
      if (key === 'mcp:inoreader:refresh_token') return 'refresh-token-value';
      return null;
    });

    routeFetch({
      inoreader: [
        new Response('unauthorized', { status: 401 }),
        jsonResponse(makeStreamResponse([])),
      ],
      // Primary /oauth2/token succeeds — no BL-039 fallback triggered.
      oauth2Token: jsonResponse({
        access_token: 'primary-fresh-token',
        refresh_token: 'refresh-token-value',
        expires_in: 3600,
      }),
    });

    // Flip the access-token mock when the primary path "writes" to Upstash.
    // We hook on /oauth2/token specifically so the flip lands after the
    // POST returns but before retryWithFreshConfig reads.
    const originalImpl = fetchSpy.getMockImplementation();
    fetchSpy.mockImplementation(async (url: string, init?: RequestInit) => {
      const response = await originalImpl!(url, init);
      if (url === OAUTH_TOKEN_URL) {
        mcpAccessToken = 'primary-fresh-token';
      }
      return response;
    });

    await fetchAnnotatedItems(oauthEnv, 5);

    // No BL-039 call should appear.
    expect(fetchSpy.mock.calls.some((c) => c[0] === REFRESH_URL)).toBe(false);

    const inoreaderCalls = fetchSpy.mock.calls.filter((c) =>
      (c[0] as string).includes('/reader/api/0')
    );
    expect(inoreaderCalls).toHaveLength(2);
    const firstAuth = (inoreaderCalls[0]![1].headers as Record<string, string>).Authorization;
    const retryAuth = (inoreaderCalls[1]![1].headers as Record<string, string>).Authorization;
    expect(firstAuth).toBe('Bearer stale-primary');
    expect(retryAuth).toBe('Bearer primary-fresh-token');
  });

  it('on primary invalid_grant: surfaces token-stale, BL-039 fallback NOT invoked', async () => {
    // Inoreader rejects the refresh_token with invalid_grant — credentials
    // are dead; trying BL-039 would just hit the same rejection through the
    // website. Phase 2 logic must skip the fallback on this reason.
    routeFetch({
      inoreader: [new Response('unauthorized', { status: 401 })],
      oauth2Token: new Response('{"error":"invalid_grant"}', { status: 401 }),
    });

    const result = await fetchAnnotatedItems(oauthEnv, 5);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('token-stale');
    // 2 calls: original Inoreader (401) + /oauth2/token (401). No BL-039.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls.some((c) => c[0] === REFRESH_URL)).toBe(false);
  });
});

// BL-039 — the FALLBACK path (Phase A only; deleted in Phase B).
//
// These tests verify the fallback chain that fires when the primary
// `refreshAccessToken` returns `reason: 'inoreader-error'`. They simulate
// primary failure by mocking /oauth2/token to return 503; the cascade
// then routes through the BL-039 website endpoint.
describe('authenticatedFetch — BL-039 fallback (only on primary inoreader-error)', () => {
  beforeEach(() => {
    mockGet.mockResolvedValue('upstash-token');
  });

  it('primary 503 → BL-039 succeeds → retry succeeds (4 fetch calls in order)', async () => {
    const stream = makeStreamResponse([
      { id: 'item-1', published: 1000, canonicalHref: 'https://example.com/1' },
    ]);
    routeFetch({
      inoreader: [new Response('unauthorized', { status: 401 }), jsonResponse(stream)],
      // oauth2Token defaults to 503 → primary returns inoreader-error
      refresh: new Response('{"ok":true}', { status: 200 }),
    });

    const result = await fetchAnnotatedItems(oauthEnv, 5);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.items[0].id).toBe('item-1');

    expect(fetchSpy).toHaveBeenCalledTimes(4);
    const calls = fetchSpy.mock.calls.map((c) => c[0]);
    expect(calls[0]).toContain('inoreader.com');
    expect(calls[1]).toBe(OAUTH_TOKEN_URL); // primary attempt — 503
    expect(calls[2]).toBe(REFRESH_URL); // fallback
    expect(calls[3]).toContain('inoreader.com'); // retry
  });

  it('passes the shared secret as Bearer Authorization to the BL-039 endpoint', async () => {
    routeFetch({
      inoreader: [
        new Response('unauthorized', { status: 401 }),
        jsonResponse(makeStreamResponse([])),
      ],
      refresh: new Response('{"ok":true}', { status: 200 }),
    });

    await fetchAnnotatedItems(oauthEnv, 5);

    const refreshCall = fetchSpy.mock.calls.find((c) => c[0] === REFRESH_URL)!;
    expect(refreshCall[1].method).toBe('POST');
    expect(refreshCall[1].headers.Authorization).toBe('Bearer test-shared-secret');
  });

  it('on 401 without INOREADER_REFRESH_SECRET + no refresh_token: surfaces token-stale, no fetch beyond original 401', async () => {
    // baseEnv has neither INOREADER_REFRESH_TOKEN nor INOREADER_REFRESH_SECRET.
    // Primary refreshAccessToken aborts at readRefreshToken with `token-missing`
    // (no refresh credentials anywhere); BL-039 is then skipped because the
    // reason isn't `inoreader-error`.
    //
    // Override the suite-level beforeEach which returns 'upstash-token' from
    // every mockGet — we need readRefreshToken to actually return null here
    // to exercise the token-missing path.
    mockGet.mockReset();
    mockGet.mockResolvedValue(null);

    fetchSpy.mockResolvedValue(new Response('unauthorized', { status: 401 }));

    const result = await fetchAnnotatedItems(baseEnv, 5);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('token-stale');
    // 1 call only — primary aborts before any HTTP, no fallback fires.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('primary 503 + BL-039 503: surfaces token-stale (4 calls, no retry)', async () => {
    routeFetch({
      inoreader: [new Response('unauthorized', { status: 401 })],
      refresh: new Response('{"ok":false,"reason":"endpoint-disabled"}', { status: 503 }),
    });

    const result = await fetchAnnotatedItems(oauthEnv, 5);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('token-stale');
    // 3 calls: Inoreader (401) + /oauth2/token (503) + BL-039 (503). No retry.
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('primary 503 + BL-039 502: surfaces token-stale', async () => {
    routeFetch({
      inoreader: [new Response('unauthorized', { status: 401 })],
      refresh: new Response('{"ok":false,"reason":"inoreader-rejected"}', { status: 502 }),
    });

    const result = await fetchAnnotatedItems(oauthEnv, 5);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('token-stale');
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('primary 503 + BL-039 200 + retry ALSO 401: no second retry, surfaces token-stale', async () => {
    routeFetch({
      inoreader: [
        new Response('unauthorized', { status: 401 }),
        new Response('still unauthorized', { status: 401 }),
      ],
      refresh: new Response('{"ok":true}', { status: 200 }),
    });

    const result = await fetchAnnotatedItems(oauthEnv, 5);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('token-stale');
    // 4 calls: Inoreader (401) + /oauth2/token (503) + BL-039 (200) + Inoreader retry (401). No THIRD Inoreader.
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });

  it('primary 503 + BL-039 network error: surfaces token-stale', async () => {
    routeFetch({
      inoreader: [new Response('unauthorized', { status: 401 })],
      refresh: new Error('network unreachable'),
    });

    const result = await fetchAnnotatedItems(oauthEnv, 5);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('token-stale');
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('on non-401 Inoreader response: neither primary nor BL-039 invoked', async () => {
    fetchSpy.mockResolvedValue(new Response('rate-limited', { status: 429 }));

    const result = await fetchAnnotatedItems(oauthEnv, 5);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('inoreader-rate-limit');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls.some((c) => c[0] === OAUTH_TOKEN_URL)).toBe(false);
    expect(fetchSpy.mock.calls.some((c) => c[0] === REFRESH_URL)).toBe(false);
  });

  it('on 200 OK: no refresh path invoked (happy path unaffected)', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(makeStreamResponse([])));

    const result = await fetchAnnotatedItems(oauthEnv, 5);

    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls.some((c) => c[0] === OAUTH_TOKEN_URL)).toBe(false);
    expect(fetchSpy.mock.calls.some((c) => c[0] === REFRESH_URL)).toBe(false);
  });

  it('after successful refresh, retry uses freshly-resolved access token from Upstash', async () => {
    // Phase 2 architecture: readAccessToken queries mcp:inoreader:access_token
    // first. Pre-refresh that key holds the stale token; after BL-039 fallback
    // succeeds, the website writes a fresh value to inoreader:access_token,
    // and we expect the retry's readAccessToken to observe the new value.
    //
    // To simulate this without a real Upstash, we toggle the mock's return
    // for mcp:inoreader:access_token mid-test. The refresh path runs between
    // the two access-token reads.
    let mcpAccessToken: string | null = 'stale-token';
    mockGet.mockImplementation(async (key: string) => {
      if (key === 'mcp:inoreader:access_token') return mcpAccessToken;
      if (key === 'mcp:inoreader:refresh_token') return 'refresh-token-value';
      return null;
    });

    routeFetch({
      inoreader: [
        new Response('unauthorized', { status: 401 }),
        jsonResponse(makeStreamResponse([])),
      ],
      // Primary returns 503 → BL-039 fallback fires. Simulate website
      // writing the fresh token by flipping the mock after the BL-039 call.
      refresh: new Response('{"ok":true}', { status: 200 }),
    });

    // Hook into the refresh-endpoint call to flip the mock state, simulating
    // the website's write to Upstash that the Worker should observe on retry.
    const originalImpl = fetchSpy.getMockImplementation();
    fetchSpy.mockImplementation(async (url: string, init?: RequestInit) => {
      const response = await originalImpl!(url, init);
      if (url === REFRESH_URL) {
        mcpAccessToken = 'fresh-token';
      }
      return response;
    });

    await fetchAnnotatedItems(oauthEnv, 5);

    const inoreaderCalls = fetchSpy.mock.calls.filter((c) =>
      (c[0] as string).includes('/reader/api/0')
    );
    expect(inoreaderCalls).toHaveLength(2);
    const firstAuth = (inoreaderCalls[0]![1].headers as Record<string, string>).Authorization;
    const retryAuth = (inoreaderCalls[1]![1].headers as Record<string, string>).Authorization;
    expect(firstAuth).toBe('Bearer stale-token');
    expect(retryAuth).toBe('Bearer fresh-token');
  });
});
