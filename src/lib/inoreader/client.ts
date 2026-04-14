/**
 * Inoreader API client for the GST Radar.
 *
 * Handles authentication, automatic token refresh, and data fetching.
 * Called at render time by the Radar page (SSR with ISR caching).
 *
 * Token persistence: On refresh, both access and refresh tokens are saved
 * to Upstash Redis so they survive across serverless invocations. Falls back
 * to environment variables when Redis is unavailable (dev mode, tests).
 *
 * API Reference: https://www.inoreader.com/developers/
 */

import type { InoreaderStreamResponse, InoreaderItem } from './types';
import { buildCacheKey, getCachedResponse, setCachedResponse } from './cache';
import * as Sentry from '@sentry/node';

const API_BASE = 'https://www.inoreader.com/reader/api/0';
const OAUTH_BASE = 'https://www.inoreader.com/oauth2';
const FETCH_TIMEOUT_MS = 10_000;

// Resolve server-side env vars from process.env (Vercel runtime) with
// import.meta.env fallback (Astro dev server loads .env there, not process.env).
function env(key: string): string | undefined {
  return process.env[key] || (import.meta as Record<string, Record<string, string>>).env?.[key];
}

// ---------------------------------------------------------------------------
// Upstash Redis — lazy-loaded, gracefully degrades when unavailable
// ---------------------------------------------------------------------------

const KV_ACCESS_TOKEN_KEY = 'inoreader:access_token';
const KV_REFRESH_TOKEN_KEY = 'inoreader:refresh_token';
const KV_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

type RedisStore = {
  get: <T>(key: string) => Promise<T | null>;
  set: (key: string, value: unknown, opts?: { ex?: number }) => Promise<unknown>;
};
let _redisInstance: RedisStore | null | undefined; // undefined = not yet attempted

async function getRedis(): Promise<RedisStore | null> {
  if (_redisInstance !== undefined) return _redisInstance;
  try {
    const { Redis } = await import('@upstash/redis');
    const url = env('KV_REST_API_URL') || env('UPSTASH_REDIS_REST_URL');
    const token = env('KV_REST_API_TOKEN') || env('UPSTASH_REDIS_REST_TOKEN');
    if (!url || !token) {
      _redisInstance = null;
      return null;
    }
    _redisInstance = new Redis({ url, token }) as unknown as RedisStore;
    return _redisInstance;
  } catch (error) {
    Sentry.captureException(error, { tags: { area: 'redis-connection' } });
    _redisInstance = null;
    return null;
  }
}

async function loadTokensFromKV(): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
}> {
  try {
    const store = await getRedis();
    if (!store) return { accessToken: null, refreshToken: null };
    const [accessToken, refreshToken] = await Promise.all([
      store.get<string>(KV_ACCESS_TOKEN_KEY),
      store.get<string>(KV_REFRESH_TOKEN_KEY),
    ]);
    if (accessToken) {
      console.log('[Radar] Loaded tokens from KV store');
    }
    return { accessToken, refreshToken };
  } catch (error) {
    console.warn(`[Radar] KV read failed, falling back to env vars: ${(error as Error).message}`);
    Sentry.captureException(error, { tags: { area: 'redis-connection' } });
    return { accessToken: null, refreshToken: null };
  }
}

async function saveTokensToKV(accessToken: string, refreshToken: string): Promise<void> {
  try {
    const store = await getRedis();
    if (!store) return;
    await Promise.all([
      store.set(KV_ACCESS_TOKEN_KEY, accessToken, { ex: KV_TOKEN_TTL_SECONDS }),
      store.set(KV_REFRESH_TOKEN_KEY, refreshToken, { ex: KV_TOKEN_TTL_SECONDS }),
    ]);
    console.log('[Radar] Tokens persisted to KV store');
  } catch (error) {
    console.warn(`[Radar] KV write failed (non-fatal): ${(error as Error).message}`);
    Sentry.captureException(error, { tags: { area: 'redis-connection' } });
  }
}

// ---------------------------------------------------------------------------
// Token state — in-memory caches populated per serverless invocation
// ---------------------------------------------------------------------------

export interface ClientConfig {
  appId: string;
  appKey: string;
  accessToken: string;
  refreshToken: string;
}

/** In-memory cache of the refreshed access token for the lifetime of this SSR invocation */
let refreshedAccessToken: string | null = null;

/** KV-loaded tokens, populated once per invocation */
let kvTokensLoaded = false;
let kvAccessToken: string | null = null;
let kvRefreshToken: string | null = null;

/** Reset all token caches. Exported for test cleanup only. */
export function resetTokenCache(): void {
  refreshedAccessToken = null;
  kvTokensLoaded = false;
  kvAccessToken = null;
  kvRefreshToken = null;
  _redisInstance = undefined;
}

/**
 * Resolve credentials with priority: in-memory refresh > KV store > env vars.
 */
async function getConfig(): Promise<ClientConfig> {
  // Load from KV once per serverless invocation
  if (!kvTokensLoaded) {
    const kvTokens = await loadTokensFromKV();
    kvAccessToken = kvTokens.accessToken;
    kvRefreshToken = kvTokens.refreshToken;
    kvTokensLoaded = true;
  }

  const appId = env('INOREADER_APP_ID');
  const appKey = env('INOREADER_APP_KEY');
  const accessToken = refreshedAccessToken || kvAccessToken || env('INOREADER_ACCESS_TOKEN');
  const refreshToken = kvRefreshToken || env('INOREADER_REFRESH_TOKEN');

  if (!appId || !appKey || !accessToken) {
    throw new Error(
      'Inoreader credentials not configured. ' +
        'Set INOREADER_APP_ID, INOREADER_APP_KEY, and INOREADER_ACCESS_TOKEN.'
    );
  }

  return { appId, appKey, accessToken, refreshToken: refreshToken || '' };
}

function buildHeaders(config: ClientConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.accessToken}`,
    AppId: config.appId,
    AppKey: config.appKey,
    Accept: 'application/json',
  };
}

/**
 * Attempt to refresh the access token using the refresh token.
 * Persists both new tokens to KV for future invocations.
 * Returns the new access token or null on failure.
 */
async function refreshAccessToken(config: ClientConfig): Promise<string | null> {
  if (!config.refreshToken) {
    console.error('[Radar] No refresh token available. Run: node scripts/inoreader-auth.mjs setup');
    return null;
  }

  try {
    const response = await fetch(`${OAUTH_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.appId,
        client_secret: config.appKey,
        refresh_token: config.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      console.error(`[Radar] Token refresh failed: ${response.status}`);
      Sentry.captureMessage(`Inoreader token refresh failed: ${response.status}`, {
        level: 'error',
        tags: { area: 'inoreader-api' },
      });
      return null;
    }

    const data = await response.json();
    const newAccessToken: string = data.access_token;
    const newRefreshToken: string | undefined = data.refresh_token;
    console.log('[Radar] Access token refreshed successfully');

    // Persist both tokens to KV for future serverless invocations
    if (newRefreshToken) {
      await saveTokensToKV(newAccessToken, newRefreshToken);
      kvAccessToken = newAccessToken;
      kvRefreshToken = newRefreshToken;
    }

    return newAccessToken;
  } catch (error) {
    console.error(`[Radar] Token refresh request failed: ${(error as Error).message}`);
    Sentry.captureException(error, { tags: { area: 'inoreader-api' } });
    return null;
  }
}

/**
 * Make an authenticated API request with automatic token refresh on 401.
 */
async function authenticatedFetch(url: string, config: ClientConfig): Promise<Response | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { headers: buildHeaders(config), signal: controller.signal });

    if (response.status === 401) {
      console.warn('[Radar] Access token expired, attempting refresh...');
      const newToken = await refreshAccessToken(config);
      if (!newToken) return null;

      // Cache the new token for subsequent calls in this render
      refreshedAccessToken = newToken;
      const updatedConfig = { ...config, accessToken: newToken };

      const retryResponse = await fetch(url, {
        headers: buildHeaders(updatedConfig),
        signal: controller.signal,
      });
      if (!retryResponse.ok) {
        console.error(`[Radar] Request failed after token refresh: ${retryResponse.status}`);
        Sentry.captureMessage(
          `Inoreader request failed after token refresh: ${retryResponse.status}`,
          {
            level: 'error',
            tags: { area: 'inoreader-api' },
          }
        );
        return null;
      }
      return retryResponse;
    }

    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch annotated articles (Tier 2: FYI items).
 * Returns articles where Reid has added highlights and notes.
 */
export async function fetchAnnotatedItems(
  count: number = 30,
  configOverride?: ClientConfig
): Promise<InoreaderStreamResponse | null> {
  const useCache = import.meta.env.DEV && !configOverride;
  const cacheKey = useCache ? buildCacheKey('fetchAnnotatedItems', count) : '';
  if (useCache) {
    const cached = getCachedResponse<InoreaderStreamResponse>(cacheKey);
    if (cached) {
      console.log('[Radar] Dev cache hit: fetchAnnotatedItems');
      return cached;
    }
  }

  const config = configOverride ?? (await getConfig());
  const streamId = encodeURIComponent('user/-/state/com.google/annotated');

  const url =
    `${API_BASE}/stream/contents/${streamId}?` +
    new URLSearchParams({
      n: count.toString(),
      annotations: '1',
      output: 'json',
    });

  try {
    const response = await authenticatedFetch(url, config);

    if (!response) return null;

    if (!response.ok) {
      console.error(`[Radar] Inoreader API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data: InoreaderStreamResponse = await response.json();
    if (useCache) {
      setCachedResponse(cacheKey, data);
      console.log('[Radar] Dev cache stored: fetchAnnotatedItems');
    }
    return data;
  } catch (error) {
    console.error(`[Radar] Inoreader request failed: ${(error as Error).message}`);
    Sentry.captureException(error, { tags: { area: 'inoreader-api' } });
    return null;
  }
}

/**
 * Fetch stream items for a specific folder (Tier 1: The Wire).
 * Stream ID format for folders: user/-/label/FolderName
 */
export async function fetchFolderStream(
  folderName: string,
  count: number = 20,
  configOverride?: ClientConfig
): Promise<InoreaderStreamResponse | null> {
  const useCache = import.meta.env.DEV && !configOverride;
  const cacheKey = useCache ? buildCacheKey('fetchFolderStream', folderName, count) : '';
  if (useCache) {
    const cached = getCachedResponse<InoreaderStreamResponse>(cacheKey);
    if (cached) {
      console.log(`[Radar] Dev cache hit: fetchFolderStream(${folderName})`);
      return cached;
    }
  }

  const config = configOverride ?? (await getConfig());
  const streamId = encodeURIComponent(`user/-/label/${folderName}`);

  const url =
    `${API_BASE}/stream/contents/${streamId}?` +
    new URLSearchParams({
      n: count.toString(),
      output: 'json',
    });

  try {
    const response = await authenticatedFetch(url, config);

    if (!response) return null;

    if (!response.ok) {
      console.error(`[Radar] Failed to fetch folder "${folderName}": ${response.status}`);
      return null;
    }

    const data: InoreaderStreamResponse = await response.json();
    if (useCache) {
      setCachedResponse(cacheKey, data);
      console.log(`[Radar] Dev cache stored: fetchFolderStream(${folderName})`);
    }
    return data;
  } catch (error) {
    console.error(`[Radar] Folder fetch failed: ${(error as Error).message}`);
    Sentry.captureException(error, { tags: { area: 'inoreader-api' } });
    return null;
  }
}

/**
 * Fetch all GST Radar folder streams in parallel.
 * Identifies folders by the configured prefix (default: "GST-").
 * Returns a merged, deduplicated, reverse-chronological stream.
 */
export async function fetchAllStreams(
  folderPrefix: string = 'GST-',
  countPerFolder: number = 15,
  configOverride?: ClientConfig
): Promise<InoreaderStreamResponse | null> {
  const useCache = import.meta.env.DEV && !configOverride;
  const cacheKey = useCache ? buildCacheKey('fetchAllStreams', folderPrefix, countPerFolder) : '';
  if (useCache) {
    const cached = getCachedResponse<InoreaderStreamResponse>(cacheKey);
    if (cached) {
      console.log('[Radar] Dev cache hit: fetchAllStreams');
      return cached;
    }
  }

  const config = configOverride ?? (await getConfig());

  const tagsUrl = `${API_BASE}/tag/list?output=json`;

  try {
    const tagsResponse = await authenticatedFetch(tagsUrl, config);
    if (!tagsResponse || !tagsResponse.ok) return null;

    const tagsData = await tagsResponse.json();
    const gstFolders = (tagsData.tags || [])
      .map((t: { id: string }) => t.id)
      .filter((id: string) => {
        const label = id.split('/').pop() || '';
        return label.startsWith(folderPrefix);
      });

    if (gstFolders.length === 0) {
      console.warn(`[Radar] No folders found with prefix "${folderPrefix}"`);
      return null;
    }

    const results = await Promise.allSettled(
      gstFolders.map((folderId: string) => {
        const label = folderId.split('/').pop()!;
        return fetchFolderStream(label, countPerFolder, configOverride);
      })
    );

    const seen = new Set<string>();
    const allItems: InoreaderItem[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        for (const item of result.value.items) {
          const url = item.canonical?.[0]?.href || item.alternate?.[0]?.href || item.id;
          if (!seen.has(url)) {
            seen.add(url);
            allItems.push(item);
          }
        }
      }
    }

    allItems.sort((a, b) => b.published - a.published);

    const merged: InoreaderStreamResponse = {
      direction: 'ltr',
      id: 'gst-radar-merged',
      updated: Date.now() / 1000,
      items: allItems,
    };

    if (useCache) {
      setCachedResponse(cacheKey, merged);
      console.log('[Radar] Dev cache stored: fetchAllStreams');
    }

    return merged;
  } catch (error) {
    console.error(`[Radar] Stream fetch failed: ${(error as Error).message}`);
    Sentry.captureException(error, { tags: { area: 'inoreader-api' } });
    return null;
  }
}
