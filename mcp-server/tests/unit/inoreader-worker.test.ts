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
  UPSTASH_REDIS_REST_URL: 'https://test.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'test-mcp-worker-token',
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

  it('skips Upstash entirely when its credentials are missing (env-only path)', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(makeStreamResponse([])));

    await fetchAnnotatedItems(
      { ...baseEnv, UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined },
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
