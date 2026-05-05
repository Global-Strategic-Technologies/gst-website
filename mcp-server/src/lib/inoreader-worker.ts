/**
 * Worker-specific Inoreader API client (BL-032 Phase 4a).
 *
 * **Why a fork instead of reusing src/lib/inoreader/client.ts** (deviation
 * from Q4 Option A's "generalize via adapters" plan, recorded in the BL-032
 * doc's Q4 Resolved stanza):
 *
 *   1. The existing eslint `no-restricted-imports` rule blocks
 *      `mcp-server/src/**` from importing `src/lib/inoreader/client.ts` —
 *      put in place during BL-031.5 to enforce the local-stdio
 *      budget-protection invariant. Removing the rule to share the client
 *      would inflate the website-regression surface significantly.
 *   2. The Worker is **read-only** for `inoreader:*` Upstash keys (Q13) —
 *      it does NOT refresh OAuth tokens. The website remains the sole
 *      refresh-writer. The shared-client refactor would have to add a
 *      "read-only mode" flag and disable refresh for Worker callers, which
 *      is most of the website client's complexity.
 *   3. Workers have no filesystem; the website client's dev-mode cache
 *      (`src/lib/inoreader/cache.ts`) wouldn't apply anyway.
 *
 * The fork is small (~200 lines) and bounded — both clients share the
 * `InoreaderStreamResponse` type from `src/lib/inoreader/types.ts` (no
 * Astro imports), so response shapes stay in sync. Inoreader API endpoints
 * are stable; the maintenance cost of two clients is dominated by
 * "occasionally update the URL string in two places."
 *
 * **Failure modes are structured** (vs. the website client's `null`-on-fail):
 * radar tools need to distinguish "token stale, refresh needed" from
 * "Inoreader 429, open the circuit breaker" from "network timeout" — each
 * surfaces a different response to the user.
 */

import type { InoreaderStreamResponse, InoreaderItem } from '../../../src/lib/inoreader/types';
import { createInoreaderClient } from './upstash-clients';
import type { Env } from '../worker';

const API_BASE = 'https://www.inoreader.com/reader/api/0';
const FETCH_TIMEOUT_MS = 5_000;

/** Shared Upstash key (read-only on Worker side per Q13). */
const KV_ACCESS_TOKEN_KEY = 'inoreader:access_token';

// ---------------------------------------------------------------------------
// Result types — structured failures so the radar tools can branch.
// ---------------------------------------------------------------------------

export type InoreaderFailureReason =
  | 'config-missing' // Inoreader app credentials not bound on env
  | 'token-missing' // No access token in Upstash AND no env fallback
  | 'token-stale' // Inoreader returned 401; website needs to refresh
  | 'inoreader-rate-limit' // Inoreader returned 429 — open the circuit breaker
  | 'upstream-error' // Inoreader returned other non-2xx
  | 'network-timeout'; // fetch threw / aborted

export interface InoreaderSuccess {
  readonly ok: true;
  readonly data: InoreaderStreamResponse;
}

export interface InoreaderFailure {
  readonly ok: false;
  readonly status: number;
  readonly reason: InoreaderFailureReason;
  readonly message: string;
}

export type InoreaderResult = InoreaderSuccess | InoreaderFailure;

interface ResolvedConfig {
  readonly appId: string;
  readonly appKey: string;
  readonly accessToken: string;
}

// ---------------------------------------------------------------------------
// Config resolution — Upstash (shared `inoreader:*` keys, read-only) → env fallback.
// ---------------------------------------------------------------------------

async function resolveConfig(env: Env): Promise<ResolvedConfig | InoreaderFailure> {
  const appId = env.INOREADER_APP_ID;
  const appKey = env.INOREADER_APP_KEY;

  if (!appId || !appKey) {
    return {
      ok: false,
      status: 500,
      reason: 'config-missing',
      message:
        'Inoreader credentials (INOREADER_APP_ID + INOREADER_APP_KEY) are not bound on the Worker env.',
    };
  }

  // Try Upstash first — Inoreader DB, Read-Only access (Q13 / Path 2).
  // This is the SOLE place in the codebase that reads `inoreader:*` keys;
  // a leaked Read-Only token cannot mutate them (storage-layer Q4 enforcement).
  let accessToken: string | null = null;
  const inoreaderRedis = createInoreaderClient(env);
  if (inoreaderRedis) {
    try {
      accessToken = await inoreaderRedis.get<string>(KV_ACCESS_TOKEN_KEY);
    } catch {
      // Inoreader DB unreachable; fall through to env fallback.
    }
  }

  // Env fallback (initial seed value used by the website on first call).
  accessToken = accessToken ?? env.INOREADER_ACCESS_TOKEN ?? null;

  if (!accessToken) {
    return {
      ok: false,
      status: 500,
      reason: 'token-missing',
      message:
        'No Inoreader access token available. Upstash key inoreader:access_token is empty and INOREADER_ACCESS_TOKEN env fallback is not set.',
    };
  }

  return { appId, appKey, accessToken };
}

function buildAuthHeaders(config: ResolvedConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.accessToken}`,
    AppId: config.appId,
    AppKey: config.appKey,
    Accept: 'application/json',
  };
}

// ---------------------------------------------------------------------------
// Low-level fetch with timeout + structured error mapping.
// ---------------------------------------------------------------------------

async function authenticatedFetch(
  url: string,
  config: ResolvedConfig
): Promise<Response | InoreaderFailure> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: buildAuthHeaders(config), signal: controller.signal });
    return res;
  } catch (e) {
    return {
      ok: false,
      status: 504,
      reason: 'network-timeout',
      message: `Inoreader request failed: ${(e as Error).message}`,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function mapHttpStatus(status: number, statusText: string): InoreaderFailure {
  if (status === 401) {
    return {
      ok: false,
      status: 401,
      reason: 'token-stale',
      message:
        'Inoreader access token is stale. The website-side ISR will refresh on its next call; retry the Worker call after that.',
    };
  }
  if (status === 429) {
    return {
      ok: false,
      status: 429,
      reason: 'inoreader-rate-limit',
      message: `Inoreader rate limit exceeded: ${status} ${statusText}`,
    };
  }
  return {
    ok: false,
    status,
    reason: 'upstream-error',
    message: `Inoreader API returned ${status} ${statusText}`,
  };
}

async function parseStream(res: Response): Promise<InoreaderResult> {
  try {
    const data = (await res.json()) as InoreaderStreamResponse;
    return { ok: true, data };
  } catch (e) {
    return {
      ok: false,
      status: 502,
      reason: 'upstream-error',
      message: `Inoreader response was not valid JSON: ${(e as Error).message}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Public API — one entry per radar surface the Worker exposes.
// ---------------------------------------------------------------------------

/**
 * Fetch annotated articles (FYI tier — items with a GST highlight + Take).
 * Mirrors the website client's `fetchAnnotatedItems` — same URL, same
 * response type, structured failures instead of `null`.
 */
export async function fetchAnnotatedItems(env: Env, count: number = 30): Promise<InoreaderResult> {
  const config = await resolveConfig(env);
  if ('ok' in config && !config.ok) return config;

  const streamId = encodeURIComponent('user/-/state/com.google/annotated');
  const url =
    `${API_BASE}/stream/contents/${streamId}?` +
    new URLSearchParams({ n: String(count), annotations: '1', output: 'json' }).toString();

  const res = await authenticatedFetch(url, config as ResolvedConfig);
  if (!(res instanceof Response)) return res;
  if (!res.ok) return mapHttpStatus(res.status, res.statusText);
  return parseStream(res);
}

/**
 * Fetch one folder's stream (Wire tier — automated category feed).
 * Internal helper for `fetchAllStreams`; exposed for tests.
 */
export async function fetchFolderStream(
  env: Env,
  folderName: string,
  count: number = 20
): Promise<InoreaderResult> {
  const config = await resolveConfig(env);
  if ('ok' in config && !config.ok) return config;

  const streamId = encodeURIComponent(`user/-/label/${folderName}`);
  const url =
    `${API_BASE}/stream/contents/${streamId}?` +
    new URLSearchParams({ n: String(count), output: 'json' }).toString();

  const res = await authenticatedFetch(url, config as ResolvedConfig);
  if (!(res instanceof Response)) return res;
  if (!res.ok) return mapHttpStatus(res.status, res.statusText);
  return parseStream(res);
}

/**
 * Fetch all GST radar folders in parallel; merge + dedupe + sort newest-first.
 * Mirrors the website client's `fetchAllStreams`.
 *
 * Implementation detail: tags-list fetch + N parallel folder fetches, where
 * N = number of GST-prefixed folders. On Inoreader, this currently means
 * 4 folders (pe-ma, enterprise-tech, ai-automation, security) → 5 total
 * Inoreader requests per call. The Worker rate limits radar Tools at
 * 5 req/min per key, so a single call lands within budget; the radar-live
 * tool layer adds an Upstash response cache (Phase 4c) to amortize.
 */
export async function fetchAllStreams(
  env: Env,
  folderPrefix: string = 'GST-',
  countPerFolder: number = 15
): Promise<InoreaderResult> {
  const config = await resolveConfig(env);
  if ('ok' in config && !config.ok) return config;
  const cfg = config as ResolvedConfig;

  // 1. Tags list — find all GST-prefixed folder IDs.
  const tagsUrl = `${API_BASE}/tag/list?output=json`;
  const tagsRes = await authenticatedFetch(tagsUrl, cfg);
  if (!(tagsRes instanceof Response)) return tagsRes;
  if (!tagsRes.ok) return mapHttpStatus(tagsRes.status, tagsRes.statusText);

  let tagsData: { tags?: Array<{ id: string }> };
  try {
    tagsData = (await tagsRes.json()) as { tags?: Array<{ id: string }> };
  } catch (e) {
    return {
      ok: false,
      status: 502,
      reason: 'upstream-error',
      message: `Inoreader tag-list response was not valid JSON: ${(e as Error).message}`,
    };
  }

  const folders = (tagsData.tags ?? [])
    .map((t) => t.id)
    .filter((id) => {
      const label = id.split('/').pop() ?? '';
      return label.startsWith(folderPrefix);
    });

  if (folders.length === 0) {
    // No matching folders — return an empty merged stream rather than failing.
    return {
      ok: true,
      data: {
        direction: 'ltr',
        id: 'gst-radar-merged',
        updated: Date.now() / 1000,
        items: [],
      },
    };
  }

  // 2. Parallel folder fetches. Pass the resolved config to each so we don't
  //    re-resolve N times.
  const results = await Promise.allSettled(
    folders.map((folderId) => {
      const label = folderId.split('/').pop()!;
      return fetchFolderStreamWithConfig(cfg, label, countPerFolder);
    })
  );

  // 3. Pick the FIRST hard failure — if any folder hit Inoreader's 429, we
  //    propagate that immediately so the radar-live tool can open the
  //    circuit breaker. Other failures (timeouts, 5xx on one folder) are
  //    soft — we proceed with whatever folders succeeded.
  for (const r of results) {
    if (r.status === 'fulfilled' && !r.value.ok && r.value.reason === 'inoreader-rate-limit') {
      return r.value;
    }
  }

  // 4. Merge successful folder results.
  const seen = new Set<string>();
  const allItems: InoreaderItem[] = [];

  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value.ok) continue;
    for (const item of r.value.data.items) {
      const url = item.canonical?.[0]?.href || item.alternate?.[0]?.href || item.id;
      if (!seen.has(url)) {
        seen.add(url);
        allItems.push(item);
      }
    }
  }

  allItems.sort((a, b) => b.published - a.published);

  return {
    ok: true,
    data: {
      direction: 'ltr',
      id: 'gst-radar-merged',
      updated: Date.now() / 1000,
      items: allItems,
    },
  };
}

/** Internal — same as fetchFolderStream but with an already-resolved config. */
async function fetchFolderStreamWithConfig(
  config: ResolvedConfig,
  folderName: string,
  count: number
): Promise<InoreaderResult> {
  const streamId = encodeURIComponent(`user/-/label/${folderName}`);
  const url =
    `${API_BASE}/stream/contents/${streamId}?` +
    new URLSearchParams({ n: String(count), output: 'json' }).toString();
  const res = await authenticatedFetch(url, config);
  if (!(res instanceof Response)) return res;
  if (!res.ok) return mapHttpStatus(res.status, res.statusText);
  return parseStream(res);
}
