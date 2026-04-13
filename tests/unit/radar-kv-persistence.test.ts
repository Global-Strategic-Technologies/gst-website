/**
 * Unit Tests for Radar KV (Upstash Redis) Token Persistence
 *
 * Tests the Redis-backed token persistence layer in src/lib/inoreader/client.ts:
 * - Token priority chain: in-memory refresh > KV store > env vars
 * - Graceful degradation when Redis is unavailable
 * - Token persistence to KV on successful OAuth refresh
 * - One-time KV loading per invocation (kvTokensLoaded flag)
 *
 * These tests call public functions WITHOUT configOverride to exercise
 * the real getConfig() → loadTokensFromKV() → getRedis() code path.
 *
 * Mocking strategy:
 * - @upstash/redis is mocked at module level via vi.mock()
 * - import.meta.env properties are set directly on the env object
 * - global fetch is stubbed to return controlled responses
 */

import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @upstash/redis before any imports that use it
// ---------------------------------------------------------------------------

const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
const MockRedisConstructor = vi.fn().mockImplementation(function () {
  return { get: mockRedisGet, set: mockRedisSet };
});

vi.mock('@upstash/redis', () => ({
  Redis: MockRedisConstructor,
}));

import { fetchAnnotatedItems, resetTokenCache } from '@/lib/inoreader/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** All env keys we might set — cleaned up after each test */
const ENV_KEYS = [
  'INOREADER_APP_ID',
  'INOREADER_APP_KEY',
  'INOREADER_ACCESS_TOKEN',
  'INOREADER_REFRESH_TOKEN',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'DEV',
] as const;

const BASE_ENV: Record<string, string> = {
  INOREADER_APP_ID: 'test-app-id',
  INOREADER_APP_KEY: 'test-app-key',
  INOREADER_ACCESS_TOKEN: 'env-access-token',
  INOREADER_REFRESH_TOKEN: 'env-refresh-token',
  KV_REST_API_URL: 'https://redis.example.com',
  KV_REST_API_TOKEN: 'redis-token',
};

/** Save original values so we can restore them — declared in describe scope */

function setEnv(overrides: Record<string, string> = {}) {
  const merged = { ...BASE_ENV, ...overrides };
  const env = import.meta.env;
  for (const key of ENV_KEYS) {
    if (key in merged) {
      env[key] = merged[key];
    } else {
      delete env[key];
    }
  }
  // Ensure DEV is false so dev-cache is skipped
  env.DEV = false as any;
}

function mockResponse(
  body: any,
  init: { ok?: boolean; status?: number; statusText?: string } = {}
) {
  const { ok = true, status = 200, statusText = 'OK' } = init;
  return {
    ok,
    status,
    statusText,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function mockStreamResponse(items: any[] = []) {
  return {
    direction: 'ltr',
    id: 'test-stream',
    updated: Date.now() / 1000,
    items,
  };
}

function mockItem(overrides: Record<string, any> = {}) {
  return {
    id: overrides.id ?? 'item-1',
    title: overrides.title ?? 'Test Item',
    published: overrides.published ?? 1708000000,
    canonical: overrides.canonical ?? [{ href: `https://example.com/${overrides.id ?? 'item-1'}` }],
    alternate: overrides.alternate,
    origin: overrides.origin ?? {
      streamId: 'feed/test',
      title: 'Test Feed',
      htmlUrl: 'https://example.com',
    },
    summary: overrides.summary ?? { content: 'Summary' },
    categories: overrides.categories ?? [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Radar KV Token Persistence', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  const savedEnv: Record<string, any> = {};
  let warnSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    resetTokenCache();
    mockRedisGet.mockReset();
    mockRedisSet.mockReset();
    MockRedisConstructor.mockClear();

    // Save original env values
    const env = import.meta.env;
    for (const key of ENV_KEYS) {
      savedEnv[key] = env[key];
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();

    // Restore console.warn spy if any test set it (prevents leak on assertion failure)
    if (warnSpy) {
      warnSpy = null;
    }

    // Restore original env values
    const env = import.meta.env;
    for (const key of ENV_KEYS) {
      if (savedEnv[key] !== undefined) {
        env[key] = savedEnv[key];
      } else {
        delete env[key];
      }
    }
  });

  // -------------------------------------------------------------------------
  // Group 1: KV Token Loading (getConfig path without configOverride)
  // -------------------------------------------------------------------------

  describe('KV Token Loading', () => {
    it('should use KV access token over env var when Redis has stored tokens', async () => {
      setEnv();
      mockRedisGet
        .mockResolvedValueOnce('kv-access-token') // access token
        .mockResolvedValueOnce('kv-refresh-token'); // refresh token

      mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse([mockItem()])));

      await fetchAnnotatedItems(10);

      const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer kv-access-token');
    });

    it('should only load from KV once per invocation', async () => {
      setEnv();
      mockRedisGet
        .mockResolvedValueOnce('kv-access-token')
        .mockResolvedValueOnce('kv-refresh-token');

      mockFetch
        .mockResolvedValueOnce(mockResponse(mockStreamResponse()))
        .mockResolvedValueOnce(mockResponse(mockStreamResponse()));

      await fetchAnnotatedItems(10);
      await fetchAnnotatedItems(10);

      // Redis.get should only have been called twice (once for access, once for refresh)
      expect(mockRedisGet).toHaveBeenCalledTimes(2);
    });

    it('should fall back to env vars when KV returns null tokens', async () => {
      setEnv();
      mockRedisGet.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse([mockItem()])));

      await fetchAnnotatedItems(10);

      const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer env-access-token');
    });

    it('should fall back to env vars when Redis env vars are not set', async () => {
      setEnv({ KV_REST_API_URL: '', KV_REST_API_TOKEN: '' });

      mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse([mockItem()])));

      await fetchAnnotatedItems(10);

      expect(mockRedisGet).not.toHaveBeenCalled();

      const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer env-access-token');
    });

    it('should prefer in-memory refreshedAccessToken over KV token', async () => {
      setEnv();
      mockRedisGet
        .mockResolvedValueOnce('kv-access-token')
        .mockResolvedValueOnce('kv-refresh-token');
      mockRedisSet.mockResolvedValue('OK');

      // First call: 401 triggers refresh
      mockFetch.mockResolvedValueOnce(mockResponse({}, { ok: false, status: 401 }));
      // Token refresh response
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          access_token: 'refreshed-in-memory-token',
          refresh_token: 'new-refresh-token',
        })
      );
      // Retry with refreshed token
      mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse([mockItem()])));
      // Second call should use in-memory refreshed token
      mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse([mockItem()])));

      await fetchAnnotatedItems(10);
      await fetchAnnotatedItems(10);

      const secondCallHeaders = mockFetch.mock.calls[3][1].headers as Record<string, string>;
      expect(secondCallHeaders['Authorization']).toBe('Bearer refreshed-in-memory-token');
    });

    it('should throw when all token sources are exhausted', async () => {
      setEnv({
        INOREADER_ACCESS_TOKEN: '',
        KV_REST_API_URL: '',
        KV_REST_API_TOKEN: '',
      });

      await expect(fetchAnnotatedItems(10)).rejects.toThrow('Inoreader credentials not configured');
    });
  });

  // -------------------------------------------------------------------------
  // Group 2: KV Token Persistence on Refresh
  // -------------------------------------------------------------------------

  describe('KV Token Persistence on Refresh', () => {
    it('should save both tokens to KV when refresh returns a new refresh_token', async () => {
      setEnv();
      mockRedisGet.mockResolvedValue(null);
      mockRedisSet.mockResolvedValue('OK');

      // 401 → refresh → retry
      mockFetch.mockResolvedValueOnce(mockResponse({}, { ok: false, status: 401 }));
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
        })
      );
      mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse()));

      await fetchAnnotatedItems(10);

      expect(mockRedisSet).toHaveBeenCalledTimes(2);
      expect(mockRedisSet).toHaveBeenCalledWith('inoreader:access_token', 'new-access', {
        ex: 60 * 60 * 24 * 30,
      });
      expect(mockRedisSet).toHaveBeenCalledWith('inoreader:refresh_token', 'new-refresh', {
        ex: 60 * 60 * 24 * 30,
      });
    });

    it('should NOT save to KV when refresh response omits refresh_token', async () => {
      setEnv();
      mockRedisGet.mockResolvedValue(null);

      mockFetch.mockResolvedValueOnce(mockResponse({}, { ok: false, status: 401 }));
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          access_token: 'new-access',
          // no refresh_token
        })
      );
      mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse()));

      await fetchAnnotatedItems(10);

      expect(mockRedisSet).not.toHaveBeenCalled();
    });

    it('should update in-memory KV cache after successful refresh and persist', async () => {
      setEnv();
      mockRedisGet.mockResolvedValueOnce('old-kv-access').mockResolvedValueOnce('old-kv-refresh');
      mockRedisSet.mockResolvedValue('OK');

      // 401 → refresh with new tokens → retry
      mockFetch.mockResolvedValueOnce(mockResponse({}, { ok: false, status: 401 }));
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          access_token: 'brand-new-access',
          refresh_token: 'brand-new-refresh',
        })
      );
      mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse()));

      await fetchAnnotatedItems(10);

      // The retry (3rd fetch call) should use the refreshed token
      const retryHeaders = mockFetch.mock.calls[2][1].headers as Record<string, string>;
      expect(retryHeaders['Authorization']).toBe('Bearer brand-new-access');
    });

    it('should continue working when KV write fails during refresh', async () => {
      setEnv();
      mockRedisGet.mockResolvedValue(null);
      mockRedisSet.mockRejectedValue(new Error('Redis write timeout'));

      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockResolvedValueOnce(mockResponse({}, { ok: false, status: 401 }));
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
        })
      );
      mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse([mockItem()])));

      const result = await fetchAnnotatedItems(10);

      expect(result).not.toBeNull();
      expect(result!.items).toHaveLength(1);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('KV write failed'));
    });
  });

  // -------------------------------------------------------------------------
  // Group 3: Redis Graceful Degradation
  // -------------------------------------------------------------------------

  describe('Graceful Degradation', () => {
    it('should not throw when KV read fails with network error', async () => {
      setEnv();
      mockRedisGet.mockRejectedValue(new Error('Redis connection refused'));

      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse([mockItem()])));

      const result = await fetchAnnotatedItems(10);

      expect(result).not.toBeNull();
      expect(result!.items).toHaveLength(1);
      const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer env-access-token');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('KV read failed'));
    });

    it('should not throw when KV write fails with network error', async () => {
      setEnv();
      mockRedisGet.mockResolvedValue(null);
      mockRedisSet.mockRejectedValue(new Error('Redis unavailable'));

      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockResolvedValueOnce(mockResponse({}, { ok: false, status: 401 }));
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
        })
      );
      mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse()));

      const result = await fetchAnnotatedItems(10);

      expect(result).not.toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('KV write failed'));
    });

    it('should cache null Redis instance and not re-attempt construction', async () => {
      // First call: Redis env vars present, constructor called once
      setEnv();
      mockRedisGet.mockResolvedValue(null);

      mockFetch
        .mockResolvedValueOnce(mockResponse(mockStreamResponse()))
        .mockResolvedValueOnce(mockResponse(mockStreamResponse()));

      await fetchAnnotatedItems(10);
      expect(MockRedisConstructor).toHaveBeenCalledTimes(1);

      // Second call (same invocation, no resetTokenCache): _redisInstance cached,
      // constructor should NOT be called again
      await fetchAnnotatedItems(10);
      expect(MockRedisConstructor).toHaveBeenCalledTimes(1);
    });

    it('should fall back to env vars when Redis env vars are empty', async () => {
      setEnv({ KV_REST_API_URL: '', KV_REST_API_TOKEN: '' });

      mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse()));

      await fetchAnnotatedItems(10);

      // No Redis env vars → constructor never called, _redisInstance set to null
      expect(MockRedisConstructor).not.toHaveBeenCalled();
      expect(mockRedisGet).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Group 4: resetTokenCache
  // -------------------------------------------------------------------------

  describe('resetTokenCache', () => {
    it('should reset all state so next call re-loads from KV', async () => {
      setEnv();

      // First invocation: KV returns token-A
      mockRedisGet.mockResolvedValueOnce('token-A').mockResolvedValueOnce('refresh-A');

      mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse()));

      await fetchAnnotatedItems(10);

      const firstHeaders = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      expect(firstHeaders['Authorization']).toBe('Bearer token-A');

      // Simulate new serverless invocation
      resetTokenCache();

      // Second invocation: KV returns token-B
      mockRedisGet.mockResolvedValueOnce('token-B').mockResolvedValueOnce('refresh-B');

      mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse()));

      await fetchAnnotatedItems(10);

      const secondHeaders = mockFetch.mock.calls[1][1].headers as Record<string, string>;
      expect(secondHeaders['Authorization']).toBe('Bearer token-B');

      // Redis.get called 4 times total (2 per invocation)
      expect(mockRedisGet).toHaveBeenCalledTimes(4);
    });
  });

  // -------------------------------------------------------------------------
  // Group 5: Edge Cases
  // -------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should support UPSTASH_REDIS_REST_URL as fallback env var name', async () => {
      setEnv({
        KV_REST_API_URL: '',
        KV_REST_API_TOKEN: '',
        UPSTASH_REDIS_REST_URL: 'https://upstash-fallback.example.com',
        UPSTASH_REDIS_REST_TOKEN: 'upstash-fallback-token',
      });

      mockRedisGet
        .mockResolvedValueOnce('upstash-access-token')
        .mockResolvedValueOnce('upstash-refresh-token');

      mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse([mockItem()])));

      await fetchAnnotatedItems(10);

      expect(MockRedisConstructor).toHaveBeenCalledWith({
        url: 'https://upstash-fallback.example.com',
        token: 'upstash-fallback-token',
      });

      const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer upstash-access-token');
    });

    it('should set TTL of 30 days on both token keys', async () => {
      setEnv();
      mockRedisGet.mockResolvedValue(null);
      mockRedisSet.mockResolvedValue('OK');

      mockFetch.mockResolvedValueOnce(mockResponse({}, { ok: false, status: 401 }));
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
        })
      );
      mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse()));

      await fetchAnnotatedItems(10);

      const expectedTTL = 60 * 60 * 24 * 30; // 2592000
      for (const call of mockRedisSet.mock.calls) {
        expect(call[2]).toEqual({ ex: expectedTTL });
      }
    });

    it('should use correct KV key names for tokens', async () => {
      setEnv();
      mockRedisGet.mockResolvedValue(null);
      mockRedisSet.mockResolvedValue('OK');

      mockFetch.mockResolvedValueOnce(mockResponse({}, { ok: false, status: 401 }));
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          access_token: 'x',
          refresh_token: 'y',
        })
      );
      mockFetch.mockResolvedValueOnce(mockResponse(mockStreamResponse()));

      await fetchAnnotatedItems(10);

      const keys = mockRedisSet.mock.calls.map((c: any[]) => c[0]);
      expect(keys).toContain('inoreader:access_token');
      expect(keys).toContain('inoreader:refresh_token');
    });
  });
});
