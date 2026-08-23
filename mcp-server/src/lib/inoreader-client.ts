/**
 * Worker-specific Inoreader API client (BL-032 Phase 4a; renamed in BL-032.8
 * Phase 1; BL-039 fallback removed in BL-032.8 Phase B).
 *
 * **Responsibilities**: HTTP client — Inoreader API calls, retry on 401
 * via the Worker-direct OAuth refresh path, structured failure mapping.
 * The sibling modules cover orthogonal concerns:
 *
 *   - [`inoreader-token-store.ts`](./inoreader-token-store.ts): Upstash token
 *     I/O (Q4 single-writer invariant lives here — Worker is sole writer
 *     post-Phase-B).
 *   - [`inoreader-oauth.ts`](./inoreader-oauth.ts): OAuth refresh module —
 *     single-flight via Upstash lock + persistence.
 *   - [`single-flight-lock.ts`](./single-flight-lock.ts): generic Upstash
 *     SET-NX-EX primitive — used by `inoreader-oauth.ts`.
 *
 * **Why a fork instead of reusing src/lib/inoreader/client.ts** (historical
 * context — the website-side client was DELETED in Phase B; this fork is
 * now the only Inoreader client in the codebase, but the original Q4 Option-A
 * "generalize via adapters" alternative was rejected for these reasons):
 *
 *   1. The existing eslint `no-restricted-imports` rule blocks
 *      `mcp-server/src/**` from importing the (now-deleted) website client.
 *      The rule was put in place during BL-031.5 to enforce the local-stdio
 *      budget-protection invariant; it's retained as a forward-compat guard.
 *   2. The Worker is the SOLE refresh-writer (Q4 invariant relocated in
 *      Phase 2 / consolidated in Phase B). Both the website's old client
 *      AND its dev-mode cache have retired.
 *
 * **Failure modes are structured** (vs. the original website client's
 * `null`-on-fail): radar tools need to distinguish "token stale, refresh
 * needed" from "Inoreader 429, open the circuit breaker" from "network
 * timeout" — each surfaces a different response to the user.
 */

import type { InoreaderStreamResponse, InoreaderItem } from '../../../src/lib/inoreader/types';
import { readAccessToken } from './inoreader-token-store';
import { refreshAccessToken } from './inoreader-oauth';
import {
  recordInoreaderEgress,
  categoryCountsAgainstZone1,
  type InoreaderEgressCategory,
} from './inoreader-egress';
import { AnalyticsEngineSink, emit } from '../metrics/_index';
import type { Env } from '../env';

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
 * dashboard hunt (see src/docs/adr/0006-inoreader-zone1-budget-protection.md; trace: _archive/BL-032_5_TESTING_FINDINGS.md § T.Z.3).
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
        'No Inoreader access token available. Upstash key mcp:inoreader:access_token is empty and INOREADER_ACCESS_TOKEN env fallback is not set.',
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

/**
 * `egressMeta` (BL-032.75 Phase 0): when supplied, the call is recorded by
 * the egress accounting wrapper after the Response is received. Skipped when
 * undefined to keep older test paths and direct callers unchanged. The
 * recorder is best-effort and never throws; missing Upstash creds are a
 * graceful no-op.
 *
 * Network errors / abort timeouts deliberately do NOT record — nothing
 * reached Inoreader's quota counter, so we don't tick ours either.
 */
/**
 * Parse the `X-Reader-Zone1-Usage` header off an Inoreader response into a
 * non-negative finite number, or `undefined` when the header is absent or
 * unusable. BL-032.75 Phase 0 audit fix C3.
 *
 * Defensive against three real cases:
 *   - **Missing** (`headers.get` returns `null` — proxy stripped it)
 *   - **Present but empty** (`""` — observed historically on some edge
 *     responses; `Number("")` is `0` and `Number.isFinite(0)` is true, so
 *     a naive parse would treat the absence as a real zero reading and
 *     trigger drift detection against a fake baseline)
 *   - **Non-numeric / negative** (Inoreader returning garbage on a degraded
 *     path; `Number("abc")` is `NaN`)
 *
 * All three collapse to `undefined` so the recorder skips drift detection
 * rather than treating noise as a real reading. Tests live in
 * `tests/unit/lib/inoreader-client-parse-zone1-header.test.ts`.
 */
export function parseZone1UsageHeader(res: Response): number | undefined {
  const raw = res.headers.get('X-Reader-Zone1-Usage');
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

async function singleFetch(
  url: string,
  config: ResolvedConfig,
  egressMeta?: {
    env: Env;
    category: InoreaderEgressCategory;
    source?: string;
    keyOwner?: string;
  }
): Promise<Response | InoreaderFailure> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const res = await fetch(url, { headers: buildAuthHeaders(config), signal: controller.signal });
    if (egressMeta) {
      const zone1UsageHeader = parseZone1UsageHeader(res);
      await recordInoreaderEgress({
        env: egressMeta.env,
        category: egressMeta.category,
        status: res.status,
        durationMs: Date.now() - startedAt,
        ...(zone1UsageHeader !== undefined ? { zone1UsageHeader } : {}),
        ...(egressMeta.source ? { source: egressMeta.source } : {}),
        ...(egressMeta.keyOwner ? { keyOwner: egressMeta.keyOwner } : {}),
      });
    }
    return res;
  } catch (e) {
    // Network-timeout / abort / DNS failure path. Audit fix B1: emit a
    // failure egress record so AE captures the call. `status: 0` is the
    // convention for "no response received" — distinct from a real
    // Inoreader 504. The Upstash counter intentionally does NOT increment
    // here (Inoreader counted nothing, so neither should we), so the
    // emit happens in a parallel branch outside `recordInoreaderEgress`.
    if (egressMeta?.env.METRICS) {
      emit(new AnalyticsEngineSink(egressMeta.env.METRICS), {
        event_type: 'inoreader_call',
        name: egressMeta.category,
        outcome: 'error',
        status_code: '0',
        zone1: categoryCountsAgainstZone1(egressMeta.category) ? '1' : '0',
        duration_ms: Date.now() - startedAt,
        ...(egressMeta.keyOwner ? { keyOwner: egressMeta.keyOwner } : {}),
      });
    }
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
 * Recovery cascade on Inoreader 401 (post-Phase-B — single path):
 *
 *   Worker-direct refresh via `refreshAccessToken('live-tool')` from
 *   [`inoreader-oauth.ts`](./inoreader-oauth.ts). Single-flight via Upstash
 *   lock; writes new tokens to MCP DB; retry the original Inoreader call
 *   once with the fresh token. If the refresh itself fails (for any reason
 *   — invalid-refresh-token, upstash-write-failed, lock-timeout,
 *   inoreader-error, token-missing) the original 401 surfaces to the
 *   caller as `token-stale`. The BL-039 website-refresh fallback was
 *   retired in Phase B once the 7-day Phase A soak proved the Worker-
 *   direct path stable.
 */
async function authenticatedFetch(
  env: Env,
  url: string,
  config: ResolvedConfig,
  egressCategory?: InoreaderEgressCategory,
  source?: string,
  keyOwner?: string
): Promise<Response | InoreaderFailure> {
  const egressMeta = egressCategory
    ? {
        env,
        category: egressCategory,
        ...(source ? { source } : {}),
        ...(keyOwner ? { keyOwner } : {}),
      }
    : undefined;

  const first = await singleFetch(url, config, egressMeta);
  if (!(first instanceof Response)) return first;
  if (first.status !== 401) return first;

  const refreshResult = await refreshAccessToken(env, 'live-tool');
  if (refreshResult.ok) {
    return retryWithFreshConfig(
      env,
      url,
      first,
      egressCategory ? { env, source, keyOwner } : undefined
    );
  }

  // Refresh failed — surface original 401 as token-stale. No fallback path
  // exists post-Phase-B; the substrate is single-writer by design.
  return first;
}

/**
 * Re-resolve config (pick up newly-written access token from Upstash),
 * then retry the original request exactly once.
 *
 * `originalFirstAttempt` is returned when config re-resolution unexpectedly
 * fails — better to surface the original 401 envelope shape than to mask
 * the failure.
 */
async function retryWithFreshConfig(
  env: Env,
  url: string,
  originalFirstAttempt: Response,
  retryEgressMeta?: { env: Env; source?: string; keyOwner?: string }
): Promise<Response | InoreaderFailure> {
  const reResolved = await resolveConfig(env);
  if ('ok' in reResolved && !reResolved.ok) {
    return originalFirstAttempt;
  }
  // BL-032.75 Phase 0: the retry leg is always categorized as '401-retry',
  // regardless of the original caller's category. This lets dashboards
  // isolate auth-churn from real traffic.
  const retryMeta = retryEgressMeta
    ? {
        env: retryEgressMeta.env,
        category: '401-retry' as InoreaderEgressCategory,
        ...(retryEgressMeta.source ? { source: retryEgressMeta.source } : {}),
        ...(retryEgressMeta.keyOwner ? { keyOwner: retryEgressMeta.keyOwner } : {}),
      }
    : undefined;
  return await singleFetch(url, reResolved as ResolvedConfig, retryMeta);
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
        'Inoreader access token is stale. The Worker attempts a refresh + single retry on the failing call path (authenticatedFetch); a token-stale envelope here means that retry also failed or refresh was not viable.',
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
export async function fetchAnnotatedItems(
  env: Env,
  count: number = 30,
  egressCategory?: InoreaderEgressCategory,
  keyOwner?: string
): Promise<InoreaderResult> {
  const config = await resolveConfig(env);
  if ('ok' in config && !config.ok) return config;

  const streamId = encodeURIComponent('user/-/state/com.google/annotated');
  const url =
    `${API_BASE}/stream/contents/${streamId}?` +
    new URLSearchParams({ n: String(count), annotations: '1', output: 'json' }).toString();

  const res = await authenticatedFetch(
    env,
    url,
    config as ResolvedConfig,
    egressCategory,
    'fetchAnnotatedItems',
    keyOwner
  );
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
  count: number = 20,
  egressCategory?: InoreaderEgressCategory,
  keyOwner?: string
): Promise<InoreaderResult> {
  const config = await resolveConfig(env);
  if ('ok' in config && !config.ok) return config;

  const streamId = encodeURIComponent(`user/-/label/${folderName}`);
  const url =
    `${API_BASE}/stream/contents/${streamId}?` +
    new URLSearchParams({ n: String(count), output: 'json' }).toString();

  const res = await authenticatedFetch(
    env,
    url,
    config as ResolvedConfig,
    egressCategory,
    'fetchFolderStream',
    keyOwner
  );
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
  countPerFolder: number = 15,
  egressCategory?: InoreaderEgressCategory,
  keyOwner?: string
): Promise<InoreaderResult> {
  const config = await resolveConfig(env);
  if ('ok' in config && !config.ok) return config;
  const cfg = config as ResolvedConfig;

  // 1. Tags list — find all GST-prefixed folder IDs.
  const tagsUrl = `${API_BASE}/tag/list?output=json`;
  const tagsRes = await authenticatedFetch(env, tagsUrl, cfg, egressCategory, 'tag-list', keyOwner);
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
      return fetchFolderStreamWithConfig(env, cfg, label, countPerFolder, egressCategory, keyOwner);
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
  count: number,
  egressCategory?: InoreaderEgressCategory,
  keyOwner?: string
): Promise<InoreaderResult> {
  const streamId = encodeURIComponent(`user/-/label/${folderName}`);
  const url =
    `${API_BASE}/stream/contents/${streamId}?` +
    new URLSearchParams({ n: String(count), output: 'json' }).toString();
  const res = await authenticatedFetch(
    env,
    url,
    config,
    egressCategory,
    `folder:${folderName}`,
    keyOwner
  );
  if (!(res instanceof Response)) return res;
  if (!res.ok) return await mapHttpStatus(res);
  return parseStream(res);
}
