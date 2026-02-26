/**
 * Unit Tests for Radar Inoreader API Client
 *
 * Tests the fetch-based API client in src/lib/inoreader/client.ts:
 * - fetchAnnotatedItems() — annotated stream fetching
 * - fetchFolderStream() — single folder fetching
 * - fetchAllStreams() — folder discovery, parallel fetch, dedup, sort
 * - Token refresh on 401 responses
 * - Error handling for network failures and bad responses
 *
 * Uses config injection (configOverride param) to bypass import.meta.env.
 * Uses vi.stubGlobal('fetch', ...) to mock HTTP requests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchAnnotatedItems,
  fetchFolderStream,
  fetchAllStreams,
  resetTokenCache,
} from '@/lib/inoreader/client';
import type { ClientConfig } from '@/lib/inoreader/client';

const TEST_CONFIG: ClientConfig = {
  appId: 'test-app-id',
  appKey: 'test-app-key',
  accessToken: 'test-access-token',
  refreshToken: 'test-refresh-token',
};

/** Create a mock Response object. */
function mockResponse(body: any, init: { ok?: boolean; status?: number; statusText?: string } = {}) {
  const { ok = true, status = 200, statusText = 'OK' } = init;
  return {
    ok,
    status,
    statusText,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

/** Minimal Inoreader stream response for testing. */
function mockStreamResponse(items: any[] = []) {
  return {
    direction: 'ltr',
    id: 'test-stream',
    updated: Date.now() / 1000,
    items,
  };
}

/** Minimal Inoreader item for testing. */
function mockItem(overrides: Record<string, any> = {}) {
  return {
    id: overrides.id ?? 'item-1',
    title: overrides.title ?? 'Test Item',
    published: overrides.published ?? 1708000000,
    canonical: overrides.canonical ?? [{ href: `https://example.com/${overrides.id ?? 'item-1'}` }],
    alternate: overrides.alternate,
    origin: overrides.origin ?? { streamId: 'feed/test', title: 'Test Feed', htmlUrl: 'https://example.com' },
    summary: overrides.summary ?? { content: 'Summary' },
    categories: overrides.categories ?? [],
  };
}

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
  resetTokenCache();
});

// ---------------------------------------------------------------------------
// fetchAnnotatedItems
// ---------------------------------------------------------------------------

describe('fetchAnnotatedItems', () => {
  it('should call fetch with correct annotated stream URL', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse()));

    await fetchAnnotatedItems(30, TEST_CONFIG);

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/stream/contents/');
    expect(calledUrl).toContain('com.google%2Fannotated');
  });

  it('should include authorization headers in request', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse()));

    await fetchAnnotatedItems(30, TEST_CONFIG);

    const calledOptions = mockFetch.mock.calls[0][1] as RequestInit;
    const headers = calledOptions.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-access-token');
    expect(headers['AppId']).toBe('test-app-id');
    expect(headers['AppKey']).toBe('test-app-key');
  });

  it('should return parsed JSON on successful response', async () => {
    const streamData = mockStreamResponse([mockItem()]);
    mockFetch.mockResolvedValueOnce(mockResponse(streamData));

    const result = await fetchAnnotatedItems(30, TEST_CONFIG);
    expect(result).toEqual(streamData);
  });

  it('should return null when response is not ok', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, { ok: false, status: 500, statusText: 'Server Error' }));

    const result = await fetchAnnotatedItems(30, TEST_CONFIG);
    expect(result).toBeNull();
  });

  it('should return null when fetch throws a network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

    const result = await fetchAnnotatedItems(30, TEST_CONFIG);
    expect(result).toBeNull();
  });

  it('should pass count parameter as n query param', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse()));

    await fetchAnnotatedItems(10, TEST_CONFIG);

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('n=10');
  });

  it('should include annotations=1 in query params', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse()));

    await fetchAnnotatedItems(30, TEST_CONFIG);

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('annotations=1');
  });
});

// ---------------------------------------------------------------------------
// fetchFolderStream
// ---------------------------------------------------------------------------

describe('fetchFolderStream', () => {
  it('should encode folder name in stream URL', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse()));

    await fetchFolderStream('GST-AI-Automation', 15, TEST_CONFIG);

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('user%2F-%2Flabel%2FGST-AI-Automation');
  });

  it('should return parsed JSON on success', async () => {
    const streamData = mockStreamResponse([mockItem()]);
    mockFetch.mockResolvedValueOnce(mockResponse(streamData));

    const result = await fetchFolderStream('GST-PE-MA', 15, TEST_CONFIG);
    expect(result).toEqual(streamData);
  });

  it('should return null when response is not ok', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, { ok: false, status: 404 }));

    const result = await fetchFolderStream('GST-Nonexistent', 15, TEST_CONFIG);
    expect(result).toBeNull();
  });

  it('should return null when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

    const result = await fetchFolderStream('GST-PE-MA', 15, TEST_CONFIG);
    expect(result).toBeNull();
  });

  it('should pass count as n query param', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse()));

    await fetchFolderStream('GST-Security', 5, TEST_CONFIG);

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('n=5');
  });
});

// ---------------------------------------------------------------------------
// fetchAllStreams
// ---------------------------------------------------------------------------

describe('fetchAllStreams', () => {
  const tagsResponse = {
    tags: [
      { id: 'user/123/label/GST-PE-MA' },
      { id: 'user/123/label/GST-Enterprise-Tech' },
      { id: 'user/123/label/other-folder' },
    ],
  };

  it('should fetch tag list first to discover folders', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(tagsResponse)); // tags
    mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse([mockItem({ id: 'a' })]))); // folder 1
    mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse([mockItem({ id: 'b' })]))); // folder 2

    await fetchAllStreams('GST-', 15, TEST_CONFIG);

    const firstUrl = mockFetch.mock.calls[0][0] as string;
    expect(firstUrl).toContain('/tag/list');
  });

  it('should filter tags by folder prefix', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(tagsResponse));
    mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse([mockItem({ id: 'a' })])));
    mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse([mockItem({ id: 'b' })])));

    await fetchAllStreams('GST-', 15, TEST_CONFIG);

    // Should fetch 2 GST- folders (not 'other-folder'), plus 1 tag list call = 3 total
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('should deduplicate items by URL across folders', async () => {
    const duplicateItem = mockItem({ id: 'dup', canonical: [{ href: 'https://example.com/same' }] });
    mockFetch.mockResolvedValueOnce(mockResponse(tagsResponse));
    mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse([duplicateItem])));
    mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse([duplicateItem])));

    const result = await fetchAllStreams('GST-', 15, TEST_CONFIG);
    expect(result!.items).toHaveLength(1);
  });

  it('should sort merged items by published date descending', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(tagsResponse));
    mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse([
      mockItem({ id: 'old', published: 1000000, canonical: [{ href: 'https://example.com/old' }] }),
    ])));
    mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse([
      mockItem({ id: 'new', published: 2000000, canonical: [{ href: 'https://example.com/new' }] }),
    ])));

    const result = await fetchAllStreams('GST-', 15, TEST_CONFIG);
    expect(result!.items[0].id).toBe('new');
    expect(result!.items[1].id).toBe('old');
  });

  it('should return null when tag list fetch fails', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, { ok: false, status: 500 }));

    const result = await fetchAllStreams('GST-', 15, TEST_CONFIG);
    expect(result).toBeNull();
  });

  it('should return null when no folders match prefix', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ tags: [{ id: 'user/123/label/other' }] }));

    const result = await fetchAllStreams('GST-', 15, TEST_CONFIG);
    expect(result).toBeNull();
  });

  it('should handle partial folder failures gracefully', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(tagsResponse));
    mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse([mockItem({ id: 'good' })])));
    mockFetch.mockRejectedValueOnce(new Error('Folder fetch failed'));

    const result = await fetchAllStreams('GST-', 15, TEST_CONFIG);
    expect(result).not.toBeNull();
    expect(result!.items).toHaveLength(1);
    expect(result!.items[0].id).toBe('good');
  });

  it('should use item id for dedup when no canonical or alternate URL', async () => {
    const noUrlItem = mockItem({ id: 'no-url-item', canonical: undefined, alternate: undefined });
    mockFetch.mockResolvedValueOnce(mockResponse(tagsResponse));
    mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse([noUrlItem])));
    mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse([noUrlItem])));

    const result = await fetchAllStreams('GST-', 15, TEST_CONFIG);
    expect(result!.items).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Token Refresh (401 Handling)
// ---------------------------------------------------------------------------

describe('Token Refresh (401 Handling)', () => {
  it('should attempt token refresh on 401 response', async () => {
    // First call: 401
    mockFetch.mockResolvedValueOnce(mockResponse({}, { ok: false, status: 401 }));
    // Token refresh call
    mockFetch.mockResolvedValueOnce(mockResponse({ access_token: 'new-token' }));
    // Retry call with new token
    mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse()));

    await fetchAnnotatedItems(30, TEST_CONFIG);

    // Should have made 3 fetch calls: original, refresh, retry
    expect(mockFetch).toHaveBeenCalledTimes(3);
    const refreshUrl = mockFetch.mock.calls[1][0] as string;
    expect(refreshUrl).toContain('/oauth2/token');
  });

  it('should retry request with new token after successful refresh', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, { ok: false, status: 401 }));
    mockFetch.mockResolvedValueOnce(mockResponse({ access_token: 'refreshed-token' }));
    mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse([mockItem()])));

    const result = await fetchAnnotatedItems(30, TEST_CONFIG);
    expect(result).not.toBeNull();
    expect(result!.items).toHaveLength(1);

    // Retry should use the refreshed token
    const retryOptions = mockFetch.mock.calls[2][1] as RequestInit;
    const retryHeaders = retryOptions.headers as Record<string, string>;
    expect(retryHeaders['Authorization']).toBe('Bearer refreshed-token');
  });

  it('should return null when token refresh fails', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, { ok: false, status: 401 }));
    mockFetch.mockResolvedValueOnce(mockResponse({}, { ok: false, status: 400 }));

    const result = await fetchAnnotatedItems(30, TEST_CONFIG);
    expect(result).toBeNull();
  });

  it('should return null when retry after refresh also fails', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, { ok: false, status: 401 }));
    mockFetch.mockResolvedValueOnce(mockResponse({ access_token: 'new-token' }));
    mockFetch.mockResolvedValueOnce(mockResponse({}, { ok: false, status: 403 }));

    const result = await fetchAnnotatedItems(30, TEST_CONFIG);
    expect(result).toBeNull();
  });

  it('should return null when refresh token is missing', async () => {
    const noRefreshConfig: ClientConfig = { ...TEST_CONFIG, refreshToken: '' };
    mockFetch.mockResolvedValueOnce(mockResponse({}, { ok: false, status: 401 }));

    const result = await fetchAnnotatedItems(30, noRefreshConfig);
    expect(result).toBeNull();
    // Should NOT have called the refresh endpoint
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
