/**
 * Inoreader API client for the GST Radar.
 *
 * Handles authentication, automatic token refresh, and data fetching.
 * Called at render time by the Radar page (SSR with ISR caching).
 *
 * API Reference: https://www.inoreader.com/developers/
 */

import type { InoreaderStreamResponse, InoreaderItem } from './types';

const API_BASE = 'https://www.inoreader.com/reader/api/0';
const OAUTH_BASE = 'https://www.inoreader.com/oauth2';

export interface ClientConfig {
  appId: string;
  appKey: string;
  accessToken: string;
  refreshToken: string;
}

/** In-memory cache of the refreshed access token for the lifetime of this SSR invocation */
let refreshedAccessToken: string | null = null;

/** Reset the token cache. Exported for test cleanup only. */
export function resetTokenCache(): void {
  refreshedAccessToken = null;
}

function getConfig(): ClientConfig {
  const appId = import.meta.env.INOREADER_APP_ID;
  const appKey = import.meta.env.INOREADER_APP_KEY;
  const accessToken = refreshedAccessToken || import.meta.env.INOREADER_ACCESS_TOKEN;
  const refreshToken = import.meta.env.INOREADER_REFRESH_TOKEN;

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
    'Authorization': `Bearer ${config.accessToken}`,
    'AppId': config.appId,
    'AppKey': config.appKey,
    'Accept': 'application/json',
  };
}

/**
 * Attempt to refresh the access token using the refresh token.
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
      return null;
    }

    const data = await response.json();
    console.log('[Radar] Access token refreshed successfully');
    return data.access_token;
  } catch (error) {
    console.error(`[Radar] Token refresh request failed: ${(error as Error).message}`);
    return null;
  }
}

/**
 * Make an authenticated API request with automatic token refresh on 401.
 */
async function authenticatedFetch(url: string, config: ClientConfig): Promise<Response | null> {
  const response = await fetch(url, { headers: buildHeaders(config) });

  if (response.status === 401) {
    console.warn('[Radar] Access token expired, attempting refresh...');
    const newToken = await refreshAccessToken(config);
    if (!newToken) return null;

    // Cache the new token for subsequent calls in this render
    refreshedAccessToken = newToken;
    const updatedConfig = { ...config, accessToken: newToken };

    const retryResponse = await fetch(url, { headers: buildHeaders(updatedConfig) });
    if (!retryResponse.ok) {
      console.error(`[Radar] Request failed after token refresh: ${retryResponse.status}`);
      return null;
    }
    return retryResponse;
  }

  return response;
}

/**
 * Fetch annotated articles (Tier 2: Featured items).
 * Returns articles where Reid has added highlights and notes.
 */
export async function fetchAnnotatedItems(
  count: number = 30,
  configOverride?: ClientConfig,
): Promise<InoreaderStreamResponse | null> {
  const config = configOverride ?? getConfig();
  const streamId = encodeURIComponent('user/-/state/com.google/annotated');

  const url = `${API_BASE}/stream/contents/${streamId}?` + new URLSearchParams({
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

    return await response.json();
  } catch (error) {
    console.error(`[Radar] Inoreader request failed: ${(error as Error).message}`);
    return null;
  }
}

/**
 * Fetch stream items for a specific folder (Tier 1: Automated stream).
 * Stream ID format for folders: user/-/label/FolderName
 */
export async function fetchFolderStream(
  folderName: string,
  count: number = 20,
  configOverride?: ClientConfig,
): Promise<InoreaderStreamResponse | null> {
  const config = configOverride ?? getConfig();
  const streamId = encodeURIComponent(`user/-/label/${folderName}`);

  const url = `${API_BASE}/stream/contents/${streamId}?` + new URLSearchParams({
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

    return await response.json();
  } catch (error) {
    console.error(`[Radar] Folder fetch failed: ${(error as Error).message}`);
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
  configOverride?: ClientConfig,
): Promise<InoreaderStreamResponse | null> {
  const config = configOverride ?? getConfig();

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

    return {
      direction: 'ltr',
      id: 'gst-radar-merged',
      updated: Date.now() / 1000,
      items: allItems,
    };
  } catch (error) {
    console.error(`[Radar] Stream fetch failed: ${(error as Error).message}`);
    return null;
  }
}
