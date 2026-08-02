/**
 * BL-047 T2 — Worker-served Inoreader OAuth re-auth flow.
 *
 * Replaces the 15-min terminal-session recovery in `scripts/inoreader-auth.mjs`
 * with a 1-click mobile browser flow. Operator gets paged for
 * `oauth-refresh-invalid-refresh-token` → taps a link → pastes admin
 * key into a minimal HTML form → bounces to Inoreader consent → bounces
 * back to `/callback` → tokens written + chain replaced → done.
 *
 * **Production-only by Inoreader-tier constraint**: the registered
 * Inoreader app accepts ONE redirect URI. We register the production
 * URL only (`https://mcp.globalstrategic.tech/admin/inoreader/reauth/callback`).
 * Staging cannot exercise the live OAuth flow; staging tests use mocks.
 *
 * **Flow** (`/start` → Inoreader → `/callback`):
 *
 *   1. Operator hits GET `/start` — returns minimal HTML login form
 *   2. Operator pastes `MCP_ADMIN_KEY` from password manager, submits
 *   3. POST `/start` validates key (constant-time), mints 32-char hex
 *      nonce, sets HttpOnly Secure cookie carrying nonce, stores
 *      `mcp:inoreader:reauth-state:<nonce>` in Upstash with 5-min TTL,
 *      302s to Inoreader's `/oauth2/auth` URL with `state=<nonce>`
 *   4. Operator clicks Approve on Inoreader consent screen
 *   5. Inoreader 302s to GET `/callback?code=...&state=<nonce>`
 *   6. `/callback` validates: URL state matches Upstash entry (GETDEL
 *      atomic, one-shot) AND cookie nonce matches URL state (CSRF
 *      defense — binds the flow to the operator's browser session)
 *   7. `/callback` acquires `REFRESH_LOCK_KEY` (race-safety against
 *      in-flight cron refresh), POSTs `/oauth2/token` with
 *      `grant_type=authorization_code`, writes new tokens to Upstash,
 *      evicts the grace-window cache (B1 — old-chain tokens are now
 *      chain-dead), releases lock, returns self-contained HTML success
 *      page (no external resources — Referer leak defense for `code`)
 *
 * **Failure surfaces** (each fires a distinct Sentry event tag):
 *
 *   - `admin-reauth-state-rejected` — bad state, expired state, cookie
 *     mismatch, replay attempt. No tokens minted. Operator restarts at
 *     `/start`. Capture-only; daily debounce
 *   - `admin-reauth-token-exchange-failed` — Inoreader rejected the
 *     code (expired, `redirect_uri` mismatch — should never happen
 *     in steady state). Paging-class
 *   - `admin-reauth-persist-failed` — Inoreader returned tokens but
 *     `writeRefreshToken` / `writeAccessToken` failed. Operator has a
 *     stranded valid chain in Inoreader; must re-run `/start` within
 *     ~5 min before the new chain rotates further. Paging-class with
 *     explicit guidance in the response HTML
 */

import { acquire, release } from '../lib/single-flight-lock';
import { writeAccessToken, writeRefreshToken } from '../lib/inoreader-token-store';
import { createMcpClient } from '../lib/upstash-clients';
import { captureMessageEnvelope } from '../observability/sentry-envelope';
import { safeLog } from '../auth/safe-logger';
import { clearPreviousToken } from '../lib/inoreader-oauth-grace-cache';
import {
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
} from '../lib/inoreader-oauth-reauth-exchange';
import {
  buildSessionClearCookie,
  buildSessionCookie,
  mintNonce,
  readSessionCookie,
  validateAdminKey,
} from './admin-auth';
import { escapeHtml, htmlShell } from '../lib/html-shell';
import type { Env } from '../worker';

const REFRESH_LOCK_KEY = 'mcp:inoreader:refresh-lock';
const REFRESH_LOCK_TTL_S = 30;
const STATE_KEY_PREFIX = 'mcp:inoreader:reauth-state:';
const STATE_TTL_S = 300;

// ---------------------------------------------------------------------------
// GET /start — login form
// ---------------------------------------------------------------------------

export function handleReauthStartGet(env: Env): Response {
  if (!env.MCP_ADMIN_KEY) {
    return new Response(loginErrorPage('MCP_ADMIN_KEY not configured.'), {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
  return new Response(loginFormPage(null), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// ---------------------------------------------------------------------------
// POST /start — validate admin key, set cookie, mint state, 302 to Inoreader
// ---------------------------------------------------------------------------

export async function handleReauthStartPost(request: Request, env: Env): Promise<Response> {
  if (!env.MCP_ADMIN_KEY) {
    return new Response(loginErrorPage('MCP_ADMIN_KEY not configured.'), {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  let formBody: URLSearchParams;
  try {
    const text = await request.text();
    formBody = new URLSearchParams(text);
  } catch {
    return new Response(loginFormPage('Could not parse form submission.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const submitted = formBody.get('admin_key') ?? '';
  if (!validateAdminKey(submitted, env)) {
    safeLog({
      event: 'admin.reauth.start.rejected',
      keyOwner: 'ADMIN',
      reason: 'bad-admin-key',
      success: false,
    });
    return new Response(loginFormPage('Incorrect admin key.'), {
      status: 401,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const nonce = mintNonce();

  // Persist state in Upstash so `/callback` can validate it without
  // depending on cookies alone (cookie is for browser-session binding;
  // Upstash is for one-shot + TTL enforcement).
  const redis = createMcpClient(env);
  if (!redis) {
    return new Response(
      loginErrorPage(
        'Upstash MCP client not bound on the Worker env — cannot persist OAuth state.'
      ),
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
  try {
    await redis.set(`${STATE_KEY_PREFIX}${nonce}`, '1', { ex: STATE_TTL_S });
  } catch (e) {
    return new Response(
      loginErrorPage(
        `Could not persist OAuth state to Upstash: ${(e as Error).message}. Retry from /start.`
      ),
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  const authUrl = buildAuthorizationUrl(env, nonce);
  if (!authUrl) {
    return new Response(
      loginErrorPage(
        'Inoreader app credentials or INOREADER_REDIRECT_URI not bound on the Worker env.'
      ),
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  safeLog({
    event: 'admin.reauth.start.success',
    keyOwner: 'ADMIN',
    success: true,
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl,
      'Set-Cookie': buildSessionCookie(nonce),
    },
  });
}

// ---------------------------------------------------------------------------
// GET /callback — exchange code, write tokens, render success page
// ---------------------------------------------------------------------------

export async function handleReauthCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieNonce = readSessionCookie(request);

  if (!code || !state || !cookieNonce || cookieNonce !== state) {
    await emitStateRejected(env, {
      reason: !code
        ? 'missing-code'
        : !state
          ? 'missing-state'
          : !cookieNonce
            ? 'missing-cookie'
            : 'cookie-state-mismatch',
    });
    return new Response(callbackErrorPage('State validation failed. Restart from /start.'), {
      status: 403,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Set-Cookie': buildSessionClearCookie(),
      },
    });
  }

  // Atomic GETDEL of the Upstash state entry — one-shot consumption
  // defends against replay. `@upstash/redis` exposes `getdel` which
  // maps to Redis `GETDEL` (Redis 6.2+); Upstash supports it.
  const redis = createMcpClient(env);
  if (!redis) {
    await emitStateRejected(env, { reason: 'upstash-unavailable' });
    return new Response(callbackErrorPage('Upstash MCP client not bound on the Worker env.'), {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
  let storedState: string | null;
  try {
    storedState = (await redis.getdel(`${STATE_KEY_PREFIX}${state}`)) as string | null;
  } catch (e) {
    await emitStateRejected(env, { reason: 'upstash-error', message: (e as Error).message });
    return new Response(
      callbackErrorPage(`Upstash GETDEL failed: ${(e as Error).message}. Restart from /start.`),
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
  if (!storedState) {
    await emitStateRejected(env, { reason: 'state-expired-or-replayed' });
    return new Response(callbackErrorPage('State expired or already used. Restart from /start.'), {
      status: 403,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Set-Cookie': buildSessionClearCookie(),
      },
    });
  }

  // Acquire the refresh lock so an in-flight cron refresh doesn't
  // overwrite the fresh tokens we're about to write. Fail-open: if
  // Upstash is unreachable, `acquire` returns true (same semantics as
  // the cron path).
  const acquired = await acquire(env, REFRESH_LOCK_KEY, REFRESH_LOCK_TTL_S);
  // The lock is best-effort — even if a peer is holding it, we
  // proceed; the worst case is a race where one of us overwrites the
  // other's tokens, and since both successfully exchanged with
  // Inoreader, both token pairs are valid in the chain (within the
  // grace window). Document for the runbook.
  try {
    const exchange = await exchangeAuthorizationCode(env, code);
    if (!exchange.ok) {
      const message = exchange.message;
      await captureMessageEnvelope(
        env,
        `oauth-reauth-token-exchange-failed: ${message.slice(0, 200)}`,
        'error',
        { reason: exchange.reason },
        'admin-reauth-token-exchange-failed',
        { 'oauth.reason': exchange.reason }
      );
      safeLog({
        event: 'admin.reauth.callback.token-exchange-failed',
        keyOwner: 'ADMIN',
        reason: exchange.reason,
        success: false,
      });
      return new Response(
        callbackErrorPage(`Token exchange with Inoreader failed (${exchange.reason}). ${message}`),
        { status: 502, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    const refreshOk = await writeRefreshToken(env, exchange.refreshToken);
    const accessOk = await writeAccessToken(env, exchange.accessToken, exchange.expiresIn);
    if (!refreshOk || !accessOk) {
      // B3 from the audit: Inoreader minted a valid chain; we failed to
      // persist. Operator MUST re-run /start before the new chain rotates
      // further or that fresh chain orphans too. Never display tokens.
      await captureMessageEnvelope(
        env,
        'oauth-reauth-persist-failed: tokens received from Inoreader but Upstash persistence failed',
        'error',
        { refreshOk, accessOk },
        'admin-reauth-persist-failed',
        { 'oauth.reason': 'persist-failed' }
      );
      safeLog({
        event: 'admin.reauth.callback.persist-failed',
        keyOwner: 'ADMIN',
        success: false,
        errorCode: 'persist-failed',
      });
      return new Response(callbackPersistFailedPage(), {
        status: 500,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Set-Cookie': buildSessionClearCookie(),
        },
      });
    }

    // Successful chain mint. Evict the in-isolate grace-window cache —
    // the previously-cached token is from the OLD chain and is now
    // chain-dead. Other isolates' caches expire naturally via 60s TTL
    // (residual cost: 1-2 wasted Inoreader calls per stale isolate per
    // recovery; accepted under KISS rather than chain-epoch tracking).
    clearPreviousToken();

    safeLog({
      event: 'admin.reauth.callback.success',
      keyOwner: 'ADMIN',
      success: true,
    });
    await captureMessageEnvelope(
      env,
      'oauth-reauth-success: Inoreader chain reset via T2 in-browser flow',
      'info',
      { occurredAt: new Date().toISOString() },
      'admin-reauth-callback-success'
    );

    return new Response(callbackSuccessPage(), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Set-Cookie': buildSessionClearCookie(),
      },
    });
  } finally {
    if (acquired) {
      await release(env, REFRESH_LOCK_KEY);
    }
  }
}

async function emitStateRejected(
  env: Env,
  ctx: { reason: string; message?: string }
): Promise<void> {
  safeLog({
    event: 'admin.reauth.callback.state-rejected',
    reason: ctx.reason,
    success: false,
    errorCode: 'state-rejected',
  });
  await captureMessageEnvelope(
    env,
    `admin-reauth-state-rejected: ${ctx.reason}`,
    'warning',
    ctx.message ? { message: ctx.message } : undefined,
    'admin-reauth-state-rejected',
    { 'oauth.reason': ctx.reason }
  );
}

// ---------------------------------------------------------------------------
// Self-contained HTML — shell + escaping shared via lib/html-shell.ts
// (extracted in BL-033 Slice 2 when the OAuth consent page became the
// second consumer; no-external-resources rationale documented there).
// ---------------------------------------------------------------------------

function loginFormPage(errorMessage: string | null): string {
  const errorBlock = errorMessage ? `<p class="error">${escapeHtml(errorMessage)}</p>` : '';
  return htmlShell(
    'MCP — Inoreader Re-Auth',
    `
<h1>Inoreader OAuth Re-Auth</h1>
${errorBlock}
<form method="POST" action="/admin/inoreader/reauth/start" autocomplete="off">
  <label for="admin_key">Admin key</label>
  <input type="password" id="admin_key" name="admin_key" autocomplete="current-password" required>
  <button type="submit">Continue to Inoreader</button>
</form>
<p>After authorizing on Inoreader, you will be returned here with fresh tokens written automatically.</p>
`
  );
}

function loginErrorPage(message: string): string {
  return htmlShell(
    'MCP — Configuration Error',
    `<h1>Configuration error</h1><p class="error">${escapeHtml(message)}</p>`
  );
}

function callbackSuccessPage(): string {
  return htmlShell(
    'MCP — Re-Auth Complete',
    `<h1>Re-auth complete</h1>
<p class="success">Inoreader tokens written successfully. The Worker will use the new chain on its next refresh.</p>
<p>You may close this tab.</p>`
  );
}

function callbackErrorPage(message: string): string {
  return htmlShell(
    'MCP — Re-Auth Failed',
    `<h1>Re-auth failed</h1>
<p class="error">${escapeHtml(message)}</p>
<p><a href="/admin/inoreader/reauth/start">Restart</a></p>`
  );
}

function callbackPersistFailedPage(): string {
  return htmlShell(
    'MCP — Persistence Failed',
    `<h1>Tokens received but not persisted</h1>
<p class="error">Inoreader minted a fresh chain but the Worker could not write it to Upstash. This is a recoverable state.</p>
<p><strong>Action required within ~5 minutes</strong>: re-run <a href="/admin/inoreader/reauth/start">/admin/inoreader/reauth/start</a> to mint another chain before the unpersisted one rotates further. Once the new flow succeeds, the stranded chain self-invalidates.</p>`
  );
}
