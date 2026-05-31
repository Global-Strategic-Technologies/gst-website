/**
 * BL-047 T2 — `authorization_code` grant helper for the in-browser
 * re-auth flow at `/admin/inoreader/reauth/callback`.
 *
 * This is the OAuth 2.0 § 4.1.3 exchange that converts the `code` query
 * param from Inoreader's 302 redirect into a fresh `(access_token,
 * refresh_token)` pair. It's a sibling to `inoreader-oauth.ts` which
 * handles the `refresh_token` grant — DIFFERENT grant type, different
 * call site, different recovery semantics (this one mints a NEW chain
 * from scratch).
 *
 * **`redirect_uri` is byte-exact match per OAuth 2.0 § 4.1.3**: the
 * value MUST match what was sent to `/oauth2/auth` at `/start` exactly
 * or Inoreader returns `invalid_grant`. Both sites read from the same
 * `INOREADER_REDIRECT_URI` env var, defaulting to the production URL.
 *
 * **No grace-window caching** at this layer: this code path runs
 * exactly once per recovery and the previous chain (cached or
 * otherwise) is being deliberately retired. The `/callback` handler
 * calls `clearPreviousToken()` after a successful exchange.
 */

import { recordInoreaderEgress } from './inoreader-egress';
import type { Env } from '../worker';

const OAUTH_TOKEN_URL = 'https://www.inoreader.com/oauth2/token';
const TOKEN_FETCH_TIMEOUT_MS = 8_000;

export type ExchangeResult =
  | {
      readonly ok: true;
      readonly accessToken: string;
      readonly refreshToken: string;
      readonly expiresIn: number;
    }
  | {
      readonly ok: false;
      readonly reason:
        | 'inoreader-error' // Network / non-2xx / non-JSON / missing fields
        | 'config-missing' // INOREADER_APP_ID / KEY / REDIRECT_URI unbound
        | 'invalid-grant'; // Inoreader rejected the code (expired, replayed, redirect_uri mismatch)
      readonly message: string;
    };

/**
 * Exchange an Inoreader `authorization_code` for fresh tokens. Never
 * throws — the caller (`/callback` handler) gets a discriminated
 * `ExchangeResult` for explicit branching on each failure mode.
 */
export async function exchangeAuthorizationCode(env: Env, code: string): Promise<ExchangeResult> {
  const appId = env.INOREADER_APP_ID;
  const appKey = env.INOREADER_APP_KEY;
  const redirectUri = env.INOREADER_REDIRECT_URI;
  if (!appId || !appKey || !redirectUri) {
    return {
      ok: false,
      reason: 'config-missing',
      message:
        'Inoreader OAuth env not fully bound on the Worker. Required: INOREADER_APP_ID, INOREADER_APP_KEY, INOREADER_REDIRECT_URI.',
    };
  }

  const body = new URLSearchParams({
    code,
    redirect_uri: redirectUri,
    client_id: appId,
    client_secret: appKey,
    grant_type: 'authorization_code',
    scope: 'read',
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
    return {
      ok: false,
      reason: 'inoreader-error',
      message: `Inoreader /oauth2/token network error: ${(e as Error).message}`,
    };
  } finally {
    clearTimeout(timeoutId);
  }

  // Egress accounting — mirrors the `inoreader-oauth.ts` refresh path.
  // `/oauth2/token` is not in Zone-1; record under `'oauth-refresh'`
  // for consistency (the category captures all /oauth2/token traffic
  // including authorization_code grants).
  await recordInoreaderEgress({
    env,
    category: 'oauth-refresh',
    status: res.status,
    source: 'reauth-callback',
  });

  if (!res.ok) {
    const bodyText = await safeReadText(res);
    const isInvalidGrant = res.status === 401 || /invalid_grant/.test(bodyText);
    return {
      ok: false,
      reason: isInvalidGrant ? 'invalid-grant' : 'inoreader-error',
      message: `Inoreader /oauth2/token returned ${res.status}: ${bodyText.slice(0, 200)}`,
    };
  }

  type TokenResponse = {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  let parsed: TokenResponse;
  try {
    parsed = (await res.json()) as TokenResponse;
  } catch (e) {
    return {
      ok: false,
      reason: 'inoreader-error',
      message: `Non-JSON body from /oauth2/token: ${(e as Error).message}`,
    };
  }

  if (!parsed.access_token || !parsed.refresh_token) {
    return {
      ok: false,
      reason: 'inoreader-error',
      message: 'Inoreader /oauth2/token response missing access_token or refresh_token.',
    };
  }

  return {
    ok: true,
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token,
    expiresIn: parsed.expires_in ?? 3600,
  };
}

/**
 * Build the Inoreader OAuth authorization URL the operator's browser
 * is 302'd to from `/start`. Exported for unit testing + so `/start`
 * doesn't reach into the OAuth URL string assembly inline.
 */
export function buildAuthorizationUrl(env: Env, state: string): string | null {
  const appId = env.INOREADER_APP_ID;
  const redirectUri = env.INOREADER_REDIRECT_URI;
  if (!appId || !redirectUri) return null;
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'read',
    state,
  });
  return `https://www.inoreader.com/oauth2/auth?${params.toString()}`;
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
