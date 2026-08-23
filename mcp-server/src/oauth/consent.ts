/**
 * OAuth consent surface — GET/POST /authorize (BL-033 Slice 2).
 *
 * Identity model: OAuth is a *delegation layer over the existing key
 * roster*. The person consenting proves identity by submitting their
 * existing `MCP_KEY_*` value into the form (validated via the same
 * constant-time `matchToken` core the Authorization header uses); the
 * resulting grant carries `keyOwner = OAUTH:<owner>` and scopes bounded
 * by that key's scopes. No separate user directory exists — deferred to
 * the Access-upstream-IdP trigger in ADR-0008.
 *
 * CSRF defense (parameterized from the admin reauth pattern — the
 * admin-auth cookie helpers are hardcoded to the reauth cookie name/path
 * so this module builds its own): double-submit cookie nonce + one-shot
 * server-side nonce (5-min TTL, get-then-delete). The nonce lives in
 * OAUTH_KV — deliberately NOT the reauth flow's Upstash store: all OAuth
 * state shares one substrate, consent keeps working through an Upstash
 * outage, and miniflare's local KV makes the flow integration-testable.
 * Trade-off vs Upstash GETDEL: KV get+delete is not atomic, so a
 * replayed POST inside the propagation window isn't server-side-blocked
 * — acceptable because the double-submit cookie (attacker needs the
 * HttpOnly cookie value) is the primary defense; the server-side nonce
 * is TTL + tab-reuse hygiene. Recorded in ADR-0008.
 *
 * Clickjacking defense: every HTML response carries
 * `X-Frame-Options: DENY` + `Content-Security-Policy: frame-ancestors
 * 'none'` — the consent page is a classic UI-redress target, and the
 * website-side header stack (vercel.json / middleware) does not govern
 * Worker-served HTML.
 *
 * The original authorize query string round-trips through a hidden
 * field; POST re-parses it with `parseAuthRequest` against a
 * reconstructed URL so the library — not us — stays the source of truth
 * for redirect_uri validation and code minting.
 */

import type { AuthRequest, ClientInfo, OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { matchToken } from '../auth/bearer';
import { hasScope, SCOPE_DESCRIPTIONS } from '../auth/scopes';
import { safeLog, scrubUrlForLog } from '../auth/safe-logger';
import { mintNonce } from '../admin/admin-auth';
import { escapeHtml, htmlShell } from '../lib/html-shell';
import { oauthKeyOwner } from './key-owner';
import type { Env } from '../env';

/**
 * Granted scopes = requested ∩ key scopes, wildcard-aware (a request
 * for `tool:search_portfolio` passes when the key owns `tool:*`).
 * Empty request → the key's full scope set (the delegation ceiling).
 * Exported for unit testing.
 */
export function grantedScopesFor(
  requested: readonly string[],
  keyScopes: readonly string[]
): string[] {
  return requested.length > 0 ? requested.filter((s) => hasScope(keyScopes, s)) : [...keyScopes];
}

const CONSENT_COOKIE = 'mcp_oauth_consent';
const CONSENT_COOKIE_TTL_S = 300;
const NONCE_KEY_PREFIX = 'mcp:oauth:consent-nonce:';

type EnvWithHelpers = Env & { OAUTH_PROVIDER: OAuthHelpers };

/** Security headers every consent HTML response carries. */
const CONSENT_HTML_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'Content-Type': 'text/html; charset=utf-8',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
  'Cache-Control': 'no-store',
});

function htmlResponse(body: string, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(body, {
    status,
    headers: { ...CONSENT_HTML_HEADERS, ...extraHeaders },
  });
}

function buildConsentCookie(nonce: string): string {
  return `${CONSENT_COOKIE}=${nonce}; Max-Age=${CONSENT_COOKIE_TTL_S}; Path=/authorize; HttpOnly; Secure; SameSite=Lax`;
}

function buildConsentClearCookie(): string {
  return `${CONSENT_COOKIE}=; Max-Age=0; Path=/authorize; HttpOnly; Secure; SameSite=Lax`;
}

function readConsentCookie(request: Request): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  const m = header.match(new RegExp(`(?:^|;\\s*)${CONSENT_COOKIE}=([A-Fa-f0-9]+)`));
  return m ? m[1]! : null;
}

function clientDisplayName(client: ClientInfo): string {
  return client.clientName ?? client.clientId;
}

function scopeListHtml(scopes: readonly string[]): string {
  const items = scopes
    .map((s) => {
      const desc = SCOPE_DESCRIPTIONS[s];
      return `<li><code>${escapeHtml(s)}</code>${
        desc ? ` <span class="scope-desc">— ${escapeHtml(desc)}</span>` : ''
      }</li>`;
    })
    .join('\n');
  return `<ul>${items}</ul>`;
}

function consentFormPage(
  client: ClientInfo,
  scopes: readonly string[],
  authParams: string,
  nonce: string,
  errorMessage: string | null
): string {
  const errorBlock = errorMessage ? `<p class="error">${escapeHtml(errorMessage)}</p>` : '';
  const scopeBlock =
    scopes.length > 0
      ? `<p><strong>${escapeHtml(clientDisplayName(client))}</strong> is requesting access to:</p>${scopeListHtml(scopes)}`
      : `<p><strong>${escapeHtml(clientDisplayName(client))}</strong> is requesting access with your key's full scope set.</p>`;
  return htmlShell(
    'GST MCP — Authorize Access',
    `
<h1>Authorize access to the GST MCP server</h1>
${errorBlock}
${scopeBlock}
<form method="POST" action="/authorize" autocomplete="off">
  <input type="hidden" name="auth_params" value="${escapeHtml(authParams)}">
  <input type="hidden" name="nonce" value="${escapeHtml(nonce)}">
  <label for="mcp_key">Your MCP key (proves who is granting this access)</label>
  <input type="password" id="mcp_key" name="mcp_key" autocomplete="current-password" required>
  <button type="submit" name="decision" value="approve">Approve</button>
  <button type="submit" name="decision" value="deny" class="deny" formnovalidate>Deny</button>
</form>
<p class="scope-desc">Approving lets this client call the GST MCP server as you, limited to the scopes above (never beyond your key's own scopes). Access tokens expire after 1 hour and refresh automatically until you revoke the grant.</p>
`
  );
}

function consentErrorPage(message: string): string {
  return htmlShell(
    'GST MCP — Authorization Error',
    `<h1>Authorization error</h1><p class="error">${escapeHtml(message)}</p>`
  );
}

/** GET /authorize — parse, validate client, render the consent form. */
export async function handleAuthorizeGet(request: Request, env: EnvWithHelpers): Promise<Response> {
  let authRequest: AuthRequest;
  try {
    authRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
  } catch (e) {
    return htmlResponse(
      consentErrorPage(`Invalid authorization request: ${(e as Error).message}`),
      400
    );
  }

  const client = await env.OAUTH_PROVIDER.lookupClient(authRequest.clientId);
  if (!client) {
    return htmlResponse(consentErrorPage('Unknown client. The client_id is not registered.'), 400);
  }

  if (!env.OAUTH_KV) {
    return htmlResponse(consentErrorPage('OAUTH_KV not bound — cannot mint consent session.'), 503);
  }
  const nonce = mintNonce();
  try {
    await env.OAUTH_KV.put(`${NONCE_KEY_PREFIX}${nonce}`, '1', {
      expirationTtl: CONSENT_COOKIE_TTL_S,
    });
  } catch (e) {
    return htmlResponse(
      consentErrorPage(`Could not persist consent session: ${(e as Error).message}`),
      503
    );
  }

  safeLog({
    event: 'oauth.authorize.form',
    keyOwner: 'OAUTH',
    path: scrubUrlForLog(request.url),
    success: true,
  });

  const authParams = new URL(request.url).search;
  return htmlResponse(consentFormPage(client, authRequest.scope, authParams, nonce, null), 200, {
    'Set-Cookie': buildConsentCookie(nonce),
  });
}

/** POST /authorize — CSRF check, key validation, grant completion. */
export async function handleAuthorizePost(
  request: Request,
  env: EnvWithHelpers
): Promise<Response> {
  let form: URLSearchParams;
  try {
    form = new URLSearchParams(await request.text());
  } catch {
    return htmlResponse(consentErrorPage('Could not parse form submission.'), 400);
  }

  const authParams = form.get('auth_params') ?? '';
  const formNonce = form.get('nonce') ?? '';
  const cookieNonce = readConsentCookie(request);
  const decision = form.get('decision') ?? 'deny';
  const submittedKey = form.get('mcp_key') ?? '';

  // Re-parse the round-tripped authorize params through the library so
  // it remains the source of truth for request validation + redirect_uri.
  const url = new URL(request.url);
  let authRequest: AuthRequest;
  try {
    authRequest = await env.OAUTH_PROVIDER.parseAuthRequest(
      new Request(`${url.origin}/authorize${authParams}`)
    );
  } catch (e) {
    return htmlResponse(
      consentErrorPage(`Invalid authorization request: ${(e as Error).message}`),
      400
    );
  }
  const client = await env.OAUTH_PROVIDER.lookupClient(authRequest.clientId);
  if (!client) {
    return htmlResponse(consentErrorPage('Unknown client. The client_id is not registered.'), 400);
  }

  // CSRF: cookie nonce must match the hidden-field nonce AND burn
  // one-shot in Upstash (GETDEL — a replayed POST finds nothing).
  if (!cookieNonce || !formNonce || cookieNonce !== formNonce) {
    safeLog({
      event: 'oauth.consent.rejected',
      keyOwner: 'OAUTH',
      reason: 'nonce-mismatch',
      success: false,
      errorCode: 'csrf',
    });
    return htmlResponse(
      consentErrorPage('Consent session invalid or expired. Restart the flow from your client.'),
      400,
      {
        'Set-Cookie': buildConsentClearCookie(),
      }
    );
  }
  if (!env.OAUTH_KV) {
    return htmlResponse(consentErrorPage('OAUTH_KV not bound.'), 503);
  }
  const burned = await env.OAUTH_KV.get(`${NONCE_KEY_PREFIX}${cookieNonce}`);
  if (burned !== null) {
    // One-shot: burn on read. Not atomic (see module header trade-off);
    // the double-submit cookie is the primary CSRF defense.
    await env.OAUTH_KV.delete(`${NONCE_KEY_PREFIX}${cookieNonce}`);
  }
  if (burned === null) {
    safeLog({
      event: 'oauth.consent.rejected',
      keyOwner: 'OAUTH',
      reason: 'nonce-expired-or-replayed',
      success: false,
      errorCode: 'csrf',
    });
    return htmlResponse(
      consentErrorPage(
        'Consent session expired or already used. Restart the flow from your client.'
      ),
      400,
      {
        'Set-Cookie': buildConsentClearCookie(),
      }
    );
  }

  // Deny path — spec-shaped error redirect back to the (validated) client.
  if (decision !== 'approve') {
    const redirect = new URL(authRequest.redirectUri);
    redirect.searchParams.set('error', 'access_denied');
    if (authRequest.state) redirect.searchParams.set('state', authRequest.state);
    safeLog({
      event: 'oauth.consent.denied',
      keyOwner: 'OAUTH',
      success: true,
    });
    return new Response(null, {
      status: 302,
      headers: { Location: redirect.toString(), 'Set-Cookie': buildConsentClearCookie() },
    });
  }

  // Identity: the submitted MCP key IS the user credential. Same
  // constant-time scan as the Authorization-header path.
  const keyMatch = matchToken(submittedKey.trim(), env as Record<string, unknown>);
  if (!keyMatch.ok) {
    safeLog({
      event: 'oauth.consent.rejected',
      keyOwner: 'OAUTH',
      reason: 'key-invalid',
      success: false,
      errorCode: 'unauthorized',
    });
    // Re-arm a fresh nonce so the user can retry without restarting the
    // whole client flow (the previous nonce burned above).
    const retryNonce = mintNonce();
    try {
      await env.OAUTH_KV.put(`${NONCE_KEY_PREFIX}${retryNonce}`, '1', {
        expirationTtl: CONSENT_COOKIE_TTL_S,
      });
    } catch {
      return htmlResponse(
        consentErrorPage('Could not restart consent session. Restart the flow from your client.'),
        503
      );
    }
    return htmlResponse(
      consentFormPage(
        client,
        authRequest.scope,
        authParams,
        retryNonce,
        'That MCP key was not recognized.'
      ),
      401,
      { 'Set-Cookie': buildConsentCookie(retryNonce) }
    );
  }

  const grantedScopes = grantedScopesFor(authRequest.scope, keyMatch.scopes);
  if (authRequest.scope.length > 0 && grantedScopes.length === 0) {
    return htmlResponse(
      consentErrorPage(
        'None of the requested scopes are covered by that key. Ask the operator to broaden the key or narrow the client request.'
      ),
      403
    );
  }

  const userId = keyMatch.keyOwner;
  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: authRequest,
    userId,
    scope: grantedScopes,
    metadata: { consentedAt: new Date().toISOString() },
    props: {
      keyOwner: oauthKeyOwner(userId),
      userId,
      scopes: grantedScopes,
      authKind: 'oauth',
    },
  });

  safeLog({
    event: 'oauth.consent.approved',
    keyOwner: oauthKeyOwner(userId),
    success: true,
  });

  return new Response(null, {
    status: 302,
    headers: { Location: redirectTo, 'Set-Cookie': buildConsentClearCookie() },
  });
}
