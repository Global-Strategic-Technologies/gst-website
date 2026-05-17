/**
 * Worker-specific Inoreader API client (BL-032 Phase 4a; renamed in BL-032.8).
 *
 * **History**: this file was `inoreader-worker.ts` until BL-032.8 Phase 1
 * (2026-05-17), when it was renamed `inoreader-client.ts` as part of the
 * module-split refactor. The split clarifies responsibilities:
 *
 *   - This file (`inoreader-client.ts`): HTTP client — Inoreader API calls,
 *     retry on 401, structured failure mapping.
 *   - [`inoreader-token-store.ts`](./inoreader-token-store.ts): Upstash token
 *     I/O (Q4 single-writer invariant lives here).
 *   - [`inoreader-bl039-fallback.ts`](./inoreader-bl039-fallback.ts): the
 *     `triggerWebsiteRefresh` fallback path — Phase A only, deleted in Phase B.
 *   - [`single-flight-lock.ts`](./single-flight-lock.ts): generic Upstash
 *     SET-NX-EX primitive — used by Phase 2's `inoreader-oauth.ts`.
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
 *      it does NOT refresh OAuth tokens today. BL-032.8 Phase 2 introduces a
 *      Worker-owned refresh path (writes `mcp:inoreader:*` keys in the MCP
 *      DB); the website's `inoreader:*` keys retire in Phase B.
 *   3. Workers have no filesystem; the website client's dev-mode cache
 *      (`src/lib/inoreader/cache.ts`) wouldn't apply anyway.
 *
 * **Failure modes are structured** (vs. the website client's `null`-on-fail):
 * radar tools need to distinguish "token stale, refresh needed" from
 * "Inoreader 429, open the circuit breaker" from "network timeout" — each
 * surfaces a different response to the user.
 */

import type { InoreaderStreamResponse, InoreaderItem } from '../../../src/lib/inoreader/types';
import { readAccessToken } from './inoreader-token-store';
import { triggerWebsiteRefresh } from './inoreader-bl039-fallback';
import { refreshAccessToken } from './inoreader-oauth';
import type { Env } from '../worker';

const API_BASE = 'https://www.inoreader.com/reader/api/0';
const FETCH_TIMEOUT_MS = 5_000;

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

/**
 * Diagnostic headers Inoreader returns on every authenticated response
 * (success OR 429). Documented at
 * https://www.inoreader.com/developers/rate-limiting and confirmed via
 * the 2026-05-15 BL-032.6 demo-day RCA — when these are missing from a
 * Sentry event, RCA shifts from a 30-second header read to a multi-hour
 * dashboard hunt (see BL-032_5_TESTING_FINDINGS.md § T.Z.3).
 *
 * All five fields are present on a typical 429; we keep them optional so
 * proxies that strip CORS-exposed headers don't break the type.
 */
export interface RateLimitInfo {
  /** Daily Zone-1 quota for this app (reads — tag/list, stream/contents, etc.). */
  readonly zone1Limit?: number;
  /** Zone-1 usage so far today (resets daily; same window as `resetAfterSeconds`). */
  readonly zone1Usage?: number;
  /** Daily Zone-2 quota for this app (writes — edit-tag, mark-as-read, etc.). */
  readonly zone2Limit?: number;
  /** Zone-2 usage so far today. */
  readonly zone2Usage?: number;
  /** Seconds until BOTH zone counters reset (Inoreader rolls them together). */
  readonly resetAfterSeconds?: number;
}

export interface InoreaderFailure {
  readonly ok: false;
  readonly status: number;
  readonly reason: InoreaderFailureReason;
  readonly message: string;
  /**
   * Populated on `inoreader-rate-limit` (429) responses when Inoreader
   * returned the `X-Reader-Zone*` headers. T.Z.3 (BL-032.7) — capturing
   * these in the envelope lets downstream Sentry callers attach them as
   * structured tags rather than baking them into the message string.
   */
  readonly rateLimitInfo?: RateLimitInfo;
  /**
   * First ~200 chars of the Inoreader response body on a 429. T.Z.3
   * (BL-032.7) — the headers carry the quantitative signal; the body
   * occasionally carries a human-readable hint ("App over daily limit",
   * "User over daily limit", etc.) that distinguishes app-level from
   * user-level exhaustion. Optional because empty/binary bodies and
   * proxy-stripped responses are real failure modes we don't want to
   * crash the RCA path on.
   */
  readonly bodyExcerpt?: string;
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

  // Token I/O delegated to inoreader-token-store (Q4 single-writer invariant
  // home). readAccessToken handles Upstash read + env fallback in one place.
  const accessToken = await readAccessToken(env);
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

async function singleFetch(
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

/**
 * Authenticated fetch with self-healing on 401 (BL-032.8 Phase 2 — Phase A).
 *
 * Recovery cascade on Inoreader 401:
 *
 *   1. **Primary** — Worker-direct refresh via `refreshAccessToken('live-tool')`
 *      from [`inoreader-oauth.ts`](./inoreader-oauth.ts). Single-flight via
 *      Upstash lock; writes new tokens to MCP DB.
 *   2. **Fallback (Phase A only)** — Only when (1) returned
 *      `reason: 'inoreader-error'` (transient upstream issue). Call the
 *      website's `/api/inoreader/refresh` endpoint
 *      ([`inoreader-bl039-fallback.ts`](./inoreader-bl039-fallback.ts)).
 *      Provides soak-window safety net against bugs in the new primary path.
 *
 * For any other `refreshAccessToken` failure reason
 * (`invalid-refresh-token` / `upstash-write-failed` / `lock-timeout` /
 * `token-missing`), do NOT fall back to BL-039 — those reasons mean
 * credentials are dead, our infra is degraded, or a peer is already
 * refreshing. The BL-039 path would either hit the same Inoreader-side
 * rejection (invalid-refresh-token) or fight the in-flight peer
 * (lock-timeout / write-failed). In all those cases, surface the original
 * 401 to the caller as `token-stale`.
 *
 * Phase B deletes the BL-039 fallback branch entirely; primary becomes
 * the sole path.
 */
async function authenticatedFetch(
  env: Env,
  url: string,
  config: ResolvedConfig
): Promise<Response | InoreaderFailure> {
  const first = await singleFetch(url, config);
  if (!(first instanceof Response)) return first;
  if (first.status !== 401) return first;

  // Primary: Worker-direct refresh (BL-032.8 Phase 2).
  const refreshResult = await refreshAccessToken(env, 'live-tool');
  if (refreshResult.ok) {
    return retryWithFreshConfig(env, url, first);
  }

  // Fallback to BL-039 ONLY for transient Inoreader-side failures.
  // Other reasons (invalid-refresh-token / upstash-write-failed /
  // lock-timeout / token-missing) are non-recoverable via the website
  // path — see docstring rationale above.
  if (refreshResult.reason === 'inoreader-error') {
    const refreshed = await triggerWebsiteRefresh(env);
    if (refreshed) return retryWithFreshConfig(env, url, first);
  }

  // All recovery paths exhausted; surface original 401 as token-stale.
  return first;
}

/**
 * Re-resolve config (pick up newly-written access token from Upstash),
 * then retry the original request exactly once. Used by both the primary
 * and BL-039 fallback success paths so the retry semantics stay
 * identical regardless of which refresh path succeeded.
 *
 * `originalFirstAttempt` is returned when config re-resolution unexpectedly
 * fails — better to surface the original 401 envelope shape than to mask
 * the failure.
 */
async function retryWithFreshConfig(
  env: Env,
  url: string,
  originalFirstAttempt: Response
): Promise<Response | InoreaderFailure> {
  const reResolved = await resolveConfig(env);
  if ('ok' in reResolved && !reResolved.ok) {
    return originalFirstAttempt;
  }
  return await singleFetch(url, reResolved as ResolvedConfig);
}

/**
 * Parse Inoreader's documented rate-limit headers off a Response. All
 * fields are optional — missing or non-numeric headers return undefined
 * for that field rather than throwing.
 *
 * Header reference (https://www.inoreader.com/developers/rate-limiting):
 *   X-Reader-Zone1-Limit, X-Reader-Zone1-Usage
 *   X-Reader-Zone2-Limit, X-Reader-Zone2-Usage
 *   X-Reader-Limits-Reset-After
 */
function parseRateLimitHeaders(res: Response): RateLimitInfo {
  const num = (name: string): number | undefined => {
    const raw = res.headers.get(name);
    if (raw == null) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    zone1Limit: num('X-Reader-Zone1-Limit'),
    zone1Usage: num('X-Reader-Zone1-Usage'),
    zone2Limit: num('X-Reader-Zone2-Limit'),
    zone2Usage: num('X-Reader-Zone2-Usage'),
    resetAfterSeconds: num('X-Reader-Limits-Reset-After'),
  };
}

/**
 * Best-effort read of the first ~200 chars of a non-2xx response body.
 * Used on 429 only (T.Z.3 — BL-032.7) so RCA in Sentry can see if the
 * body distinguishes "App over daily limit" from "User over daily
 * limit" or carries an Inoreader-side error string. Returns undefined
 * on read failure (already-consumed stream, empty body, abort, etc.)
 * rather than throwing — diagnostic enrichment must never crash the
 * failure path.
 */
const BODY_EXCERPT_MAX_CHARS = 200;
async function readBodyExcerpt(res: Response): Promise<string | undefined> {
  try {
    const text = await res.text();
    if (!text) return undefined;
    return text.slice(0, BODY_EXCERPT_MAX_CHARS);
  } catch {
    return undefined;
  }
}

async function mapHttpStatus(res: Response): Promise<InoreaderFailure> {
  const { status, statusText } = res;
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
    const rateLimitInfo = parseRateLimitHeaders(res);
    const bodyExcerpt = await readBodyExcerpt(res);
    return {
      ok: false,
      status: 429,
      reason: 'inoreader-rate-limit',
      message: `Inoreader rate limit exceeded: ${status} ${statusText}`,
      rateLimitInfo,
      ...(bodyExcerpt ? { bodyExcerpt } : {}),
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

  const res = await authenticatedFetch(env, url, config as ResolvedConfig);
  if (!(res instanceof Response)) return res;
  if (!res.ok) return await mapHttpStatus(res);
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

  const res = await authenticatedFetch(env, url, config as ResolvedConfig);
  if (!(res instanceof Response)) return res;
  if (!res.ok) return await mapHttpStatus(res);
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
  const tagsRes = await authenticatedFetch(env, tagsUrl, cfg);
  if (!(tagsRes instanceof Response)) return tagsRes;
  if (!tagsRes.ok) return await mapHttpStatus(tagsRes);

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
  //    re-resolve N times. `env` is also passed for BL-039 refresh-retry
  //    semantics inside authenticatedFetch.
  const results = await Promise.allSettled(
    folders.map((folderId) => {
      const label = folderId.split('/').pop()!;
      return fetchFolderStreamWithConfig(env, cfg, label, countPerFolder);
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
  env: Env,
  config: ResolvedConfig,
  folderName: string,
  count: number
): Promise<InoreaderResult> {
  const streamId = encodeURIComponent(`user/-/label/${folderName}`);
  const url =
    `${API_BASE}/stream/contents/${streamId}?` +
    new URLSearchParams({ n: String(count), output: 'json' }).toString();
  const res = await authenticatedFetch(env, url, config);
  if (!(res instanceof Response)) return res;
  if (!res.ok) return await mapHttpStatus(res);
  return parseStream(res);
}
