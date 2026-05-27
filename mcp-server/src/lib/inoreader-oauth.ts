/**
 * Inoreader OAuth refresh — Worker-direct path (BL-032.8 Phase 2).
 *
 * Single-flight refresh of the Inoreader access token via Inoreader's
 * `/oauth2/token` endpoint, coordinated cross-isolate via Upstash SET-NX-EX
 * so concurrent callers don't fan out into multiple `/oauth2/token` POSTs.
 *
 * **What this replaces**: the BL-039 round-trip through the website's
 * `/api/inoreader/refresh` endpoint ([`inoreader-bl039-fallback.ts`](./inoreader-bl039-fallback.ts)).
 * That module remains in Phase A as a soak-safety fallback; Phase B
 * deletes it once production observation confirms the Worker-direct path
 * is reliable.
 *
 * **Single-flight contract**: see [`single-flight-lock.ts`](./single-flight-lock.ts).
 * Lock key is `mcp:inoreader:refresh-lock`, TTL 10s (forces release even
 * on Worker crash). Losers of the acquire race poll `mcp:inoreader:access_token`
 * for change with 15s timeout — long enough to cover the ~1s `/oauth2/token`
 * round-trip plus some headroom, short enough to keep tail latencies bounded.
 *
 * **Persistence**: token I/O is delegated to [`inoreader-token-store.ts`](./inoreader-token-store.ts).
 * Refresh token is written BEFORE access token, and only when the value
 * differs from the previously-stored refresh token (conditional rotation
 * per Phase 0 Q0.2). The access token is written last with TTL = `expires_in − 60s`.
 *
 * **Error taxonomy** (see Sentry severity mapping in the BL-032.8 impl doc):
 *   - `invalid-refresh-token` — Inoreader 401 + `invalid_grant`. Token is
 *     dead; manual OAuth re-link required. Paging-class Sentry alert.
 *   - `inoreader-error` — Inoreader 5xx, 429, or other non-success.
 *     Retryable next time the caller hits 401. Warning-level Sentry.
 *   - `upstash-write-failed` — refresh succeeded but persistence failed.
 *     Token is lost from this isolate; next call will re-refresh. Error-
 *     level Sentry — actionable but not paging.
 *   - `lock-timeout` — peer holds the lock and didn't finish in 15s.
 *     Usually transient; caller surfaces the original token-stale to user.
 *   - `token-missing` — no refresh token in any of the read tiers. Manual
 *     OAuth bootstrap required. Critical Sentry.
 *
 * **Observability**: every invocation emits a `safeLog` entry with
 * `event: 'oauth.refresh.<outcome>'`, plus a `source` tag distinguishing
 * cron from live-tool calls. Sentry `captureMessage` fires on
 * actionable (warning+) outcomes.
 */

import { acquire, pollForChange, release } from './single-flight-lock';
import {
  readRefreshToken,
  writeAccessToken,
  writeRefreshToken,
  KV_MCP_ACCESS_TOKEN_KEY,
} from './inoreader-token-store';
import { captureMessageEnvelope } from '../observability/sentry-envelope';
import { safeLog } from '../auth/safe-logger';
import { recordInoreaderEgress } from './inoreader-egress';
import type { Env } from '../worker';

/** Inoreader OAuth token-refresh endpoint. */
const OAUTH_TOKEN_URL = 'https://www.inoreader.com/oauth2/token';

/** Wall-clock timeout for the /oauth2/token POST. ~1s in practice; 8s caps tail. */
const TOKEN_FETCH_TIMEOUT_MS = 8_000;

/** Upstash key the lock uses; namespaced under mcp:* per Worker convention. */
const REFRESH_LOCK_KEY = 'mcp:inoreader:refresh-lock';

/** Lock TTL — long enough to cover the slow path (~1s + Upstash writes), short enough that a crashed lock-holder unblocks the next attempt quickly. */
const LOCK_TTL_SECONDS = 10;

/** Cross-isolate poll for the lock-loser path. 15s > LOCK_TTL_SECONDS so a successful refresh has time to land before we declare lock-timeout. */
const POLL_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 200;

/**
 * Source label for observability — distinguishes which surface triggered
 * the refresh. Cron path is the proactive TTL-watch case; live-tool is
 * reactive (401-driven retry); manual is operator-invoked (a future
 * `/admin/refresh-token` endpoint, not in BL-032.8 scope).
 */
export type RefreshSource = 'cron' | 'live-tool' | 'manual';

export type RefreshResult =
  | {
      readonly ok: true;
      readonly accessToken: string;
      readonly expiresAt: number;
      readonly refreshSource: 'fresh' | 'cached-by-peer';
    }
  | {
      readonly ok: false;
      readonly reason:
        | 'invalid-refresh-token'
        | 'inoreader-error'
        | 'upstash-write-failed'
        | 'lock-timeout'
        | 'token-missing';
      readonly message: string;
    };

interface InoreaderTokenResponse {
  readonly access_token: string;
  readonly refresh_token?: string;
  readonly expires_in?: number;
  readonly token_type?: string;
  readonly scope?: string;
}

/**
 * Refresh the Inoreader access token. Single-flight via Upstash lock.
 *
 * Happy path:
 *   1. Acquire `mcp:inoreader:refresh-lock` (SET NX EX 10).
 *   2. Read current refresh_token from inoreader-token-store.
 *   3. POST form-encoded body to Inoreader /oauth2/token.
 *   4. Parse response; if refresh_token rotated, write the new one first
 *      (so a crash between writes preserves the only credential that can
 *      rebuild the access token).
 *   5. Write access_token with TTL = expires_in − 60s.
 *   6. Release lock.
 *
 * Loser path (lock not acquired): poll `mcp:inoreader:access_token` for
 * change up to 15s; return `cached-by-peer` if it changes, `lock-timeout`
 * if not.
 *
 * Never throws — all paths return a discriminated union.
 */
export async function refreshAccessToken(env: Env, source: RefreshSource): Promise<RefreshResult> {
  const startedAt = Date.now();

  // Lock acquisition. If we lose the race, route to poll path.
  const acquired = await acquire(env, REFRESH_LOCK_KEY, LOCK_TTL_SECONDS);
  if (!acquired) {
    return await waitForPeerRefresh(env, source, startedAt);
  }

  try {
    return await performRefresh(env, source, startedAt);
  } finally {
    // Best-effort release. The lock TTL is the safety net for any path
    // that throws unexpectedly between acquire and finally.
    await release(env, REFRESH_LOCK_KEY);
  }
}

async function waitForPeerRefresh(
  env: Env,
  source: RefreshSource,
  startedAt: number
): Promise<RefreshResult> {
  const newToken = await pollForChange<string>(env, KV_MCP_ACCESS_TOKEN_KEY, {
    timeoutMs: POLL_TIMEOUT_MS,
    intervalMs: POLL_INTERVAL_MS,
  });
  const durationMs = Date.now() - startedAt;

  if (newToken) {
    safeLog({
      event: 'oauth.refresh.cached-by-peer',
      reason: source,
      durationMs,
      success: true,
    });
    return {
      ok: true,
      accessToken: newToken,
      // expires_in unknown on this path — we trust the writer set the TTL
      // correctly and report expiresAt as "unknown but valid" by returning
      // the current time + 60s (the lock TTL floor). Live callers compute
      // their own retry budgets; this number is for log/test inspection.
      expiresAt: Date.now() + LOCK_TTL_SECONDS * 1000,
      refreshSource: 'cached-by-peer',
    };
  }

  // Peer didn't finish in 15s — surface as lock-timeout. Caller (cron or
  // live-tool) decides whether to retry or surface token-stale to user.
  safeLog({
    event: 'oauth.refresh.lock-timeout',
    reason: source,
    durationMs,
    success: false,
    errorCode: 'lock-timeout',
  });
  return {
    ok: false,
    reason: 'lock-timeout',
    message: `Peer refresh did not complete within ${POLL_TIMEOUT_MS}ms; surfacing lock-timeout`,
  };
}

async function performRefresh(
  env: Env,
  source: RefreshSource,
  startedAt: number
): Promise<RefreshResult> {
  const refreshToken = await readRefreshToken(env);
  if (!refreshToken) {
    const result: RefreshResult = {
      ok: false,
      reason: 'token-missing',
      message:
        'No Inoreader refresh token available. Upstash mcp:inoreader:refresh_token + INOREADER_REFRESH_TOKEN env are both empty. Manual OAuth re-link required.',
    };
    await logAndCapture(env, result, source, Date.now() - startedAt);
    return result;
  }

  const appId = env.INOREADER_APP_ID;
  const appKey = env.INOREADER_APP_KEY;
  if (!appId || !appKey) {
    // Treat config-missing as inoreader-error since the caller's fallback
    // path (BL-039) might still work if the website has the credentials.
    const result: RefreshResult = {
      ok: false,
      reason: 'inoreader-error',
      message:
        'Inoreader credentials (INOREADER_APP_ID + INOREADER_APP_KEY) not bound on the Worker env.',
    };
    await logAndCapture(env, result, source, Date.now() - startedAt);
    return result;
  }

  // Build form-encoded body per Inoreader's documented contract (Phase 0
  // Context7 confirmed). URLSearchParams stringifies into
  // application/x-www-form-urlencoded shape natively.
  const body = new URLSearchParams({
    client_id: appId,
    client_secret: appKey,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TOKEN_FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
      signal: controller.signal,
    });
  } catch (e) {
    // No Response — the call aborted (timeout) or threw before reaching
    // Inoreader. The egress wrapper is intentionally NOT invoked here,
    // for BOTH counters it would have touched:
    //
    //   - Zone-1 total: `oauth-refresh` doesn't contribute anyway, so this
    //     branch is moot for the Zone-1 dashboard.
    //   - Per-category `oauth-refresh` counter: skipping aligns with the
    //     same rule the Zone-1 path follows ("nothing reached Inoreader,
    //     nothing was counted by them"). If we ticked here, the
    //     `oauth-refresh` rate would over-count auth churn during
    //     network-degraded windows — exactly when an operator would be
    //     reading the counter to diagnose.
    //
    // Documented at BL-032.75 Phase 0 audit fix M3.
    const result: RefreshResult = {
      ok: false,
      reason: 'inoreader-error',
      message: `Inoreader /oauth2/token network error: ${(e as Error).message}`,
    };
    await logAndCapture(env, result, source, Date.now() - startedAt);
    return result;
  } finally {
    clearTimeout(timeoutId);
  }

  // BL-032.75 Phase 0: record the OAuth POST as an 'oauth-refresh' egress
  // event. /oauth2/token is not in either Inoreader Zone table at
  // https://www.inoreader.com/developers/rate-limiting (verified 2026-05-26
  // — Zone tables cover /reader/api/0/* endpoints only). The recorder
  // increments the per-category counter but EXCLUDES this from the Zone-1
  // total, so OAuth refresh churn doesn't pollute spend dashboards.
  // Best-effort — recorder failures never propagate.
  await recordInoreaderEgress({
    env,
    category: 'oauth-refresh',
    status: res.status,
    source: `refresh-${source}`,
  });

  if (!res.ok) {
    // Differentiate invalid_grant from other failures. Inoreader returns
    // `{"error":"invalid_grant"}` in the body on a dead refresh_token;
    // we read the body once to inspect, then map.
    const bodyText = await safeReadText(res);
    const isInvalidGrant = res.status === 401 || /invalid_grant/.test(bodyText);
    const result: RefreshResult = isInvalidGrant
      ? {
          ok: false,
          reason: 'invalid-refresh-token',
          message: `Inoreader rejected refresh_token (status ${res.status}, body excerpt: ${bodyText.slice(0, 200)}). Manual OAuth re-link required.`,
        }
      : {
          ok: false,
          reason: 'inoreader-error',
          message: `Inoreader /oauth2/token returned ${res.status} ${res.statusText} (body excerpt: ${bodyText.slice(0, 200)})`,
        };
    await logAndCapture(env, result, source, Date.now() - startedAt);
    return result;
  }

  let parsed: InoreaderTokenResponse;
  try {
    parsed = (await res.json()) as InoreaderTokenResponse;
  } catch (e) {
    const result: RefreshResult = {
      ok: false,
      reason: 'inoreader-error',
      message: `Inoreader /oauth2/token returned non-JSON body: ${(e as Error).message}`,
    };
    await logAndCapture(env, result, source, Date.now() - startedAt);
    return result;
  }

  if (!parsed.access_token) {
    const result: RefreshResult = {
      ok: false,
      reason: 'inoreader-error',
      message: 'Inoreader /oauth2/token response had no access_token field',
    };
    await logAndCapture(env, result, source, Date.now() - startedAt);
    return result;
  }

  // Persistence ordering: refresh_token first (only if rotated), then
  // access_token. A crash between the two writes preserves the credential
  // that can rebuild the access token.
  if (parsed.refresh_token && parsed.refresh_token !== refreshToken) {
    const refreshOk = await writeRefreshToken(env, parsed.refresh_token);
    if (!refreshOk) {
      const result: RefreshResult = {
        ok: false,
        reason: 'upstash-write-failed',
        message:
          'Refresh succeeded but rotated refresh_token persistence failed; token is now in an inconsistent state.',
      };
      await logAndCapture(env, result, source, Date.now() - startedAt);
      return result;
    }
  }

  const accessOk = await writeAccessToken(env, parsed.access_token, parsed.expires_in);
  if (!accessOk) {
    const result: RefreshResult = {
      ok: false,
      reason: 'upstash-write-failed',
      message: 'Refresh succeeded but access_token persistence failed; next call will re-refresh.',
    };
    await logAndCapture(env, result, source, Date.now() - startedAt);
    return result;
  }

  const expiresIn = parsed.expires_in ?? 3600;
  const result: RefreshResult = {
    ok: true,
    accessToken: parsed.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
    refreshSource: 'fresh',
  };
  await logAndCapture(env, result, source, Date.now() - startedAt);
  return result;
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

async function logAndCapture(
  env: Env,
  result: RefreshResult,
  source: RefreshSource,
  durationMs: number
): Promise<void> {
  if (result.ok) {
    safeLog({
      event: 'oauth.refresh.success',
      reason: source,
      durationMs,
      success: true,
    });
    return;
  }

  safeLog({
    event: `oauth.refresh.${result.reason}`,
    reason: source,
    durationMs,
    success: false,
    errorCode: result.reason,
  });

  // Sentry severity mapping:
  //   invalid-refresh-token → error (paging-class — operator must re-link)
  //   upstash-write-failed  → error (high, but not paging)
  //   inoreader-error       → warning (transient; BL-039 fallback or next-call retry)
  //   lock-timeout          → no Sentry (handled in waitForPeerRefresh)
  //   token-missing         → error (operator bootstrap required)
  if (result.reason === 'lock-timeout') return;

  const level: 'error' | 'warning' = result.reason === 'inoreader-error' ? 'warning' : 'error';

  await captureMessageEnvelope(
    env,
    `oauth-refresh-${result.reason}`,
    level,
    {
      source,
      message: result.message,
      durationMs,
    },
    `oauth.refresh.${result.reason}`,
    {
      'oauth.source': source,
      'oauth.reason': result.reason,
    }
  );
}
