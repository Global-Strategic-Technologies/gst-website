/**
 * M2M token branch (BL-033 Slice 2) — `POST /token` with
 * `grant_type=client_credentials`, intercepted in worker.ts BEFORE
 * provider delegation (the library's grant model has no
 * client_credentials — verified against v0.8.2; see ADR-0008).
 *
 * Client authentication, two modes:
 *   - `private_key_jwt` (RFC 7523 client assertion; preferred per the
 *     MCP oauth-client-credentials extension): ES256 JWT signed by the
 *     client's registered key (inline JWKS on the client record), max
 *     5-minute lifetime, `jti` replayed-assertion check via a one-shot
 *     KV write. No secret ever crosses the wire.
 *   - `client_secret_post` / `client_secret_basic`: SHA-256 hash
 *     compare, constant-time.
 *
 * Issued token: a SELF-CONTAINED HS256 JWT (`mcp_m2m_` + compact JWS,
 * signed with OAUTH_M2M_SIGNING_KEY). Claims: iss, sub=client_id, aud
 * (canonical `<origin>/mcp`), scope ⊆ allowedScopes, keyOwner
 * (`M2M:<NAME>`), exp=+1h, iat, jti. NO refresh token (per extension —
 * clients re-exchange on expiry).
 *
 * Why self-contained instead of the library's KV-opaque tokens: KV is
 * eventually consistent (~60s cross-colo) — a token minted at one colo
 * and used immediately at another would 401; local HMAC verification is
 * zero-I/O and trivially inside Claude's 10s token-endpoint budget.
 * Trade-off: revocation = delete the client record (blocks re-issuance;
 * ≤1h residual validity on already-minted tokens — introspection
 * cross-checks the record so revoked clients report inactive) or rotate
 * the signing key (kills every M2M token immediately). ADR-0008.
 */

import type { AuthSuccess } from '../auth/bearer';
import { hasScope } from '../auth/scopes';
import { safeLog } from '../auth/safe-logger';
import { getM2mClient, keyOwnerFor, verifyM2mSecret, type M2mJwk } from './m2m-clients';
import type { Env } from '../worker';

export const M2M_TOKEN_PREFIX = 'mcp_m2m_';
export const M2M_TOKEN_TTL_S = 3600;
const ASSERTION_MAX_LIFETIME_S = 300;
const JTI_KEY_PREFIX = 'mcp:oauth:m2m-jti:';
const CLIENT_ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';

// ---------------------------------------------------------------------------
// Compact-JWS helpers (WebCrypto only — Worker-portable)
// ---------------------------------------------------------------------------

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  // Explicit ArrayBuffer allocation — satisfies WebCrypto's BufferSource
  // under TS 5.7+ generic Uint8Array typing.
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function encodeJson(obj: unknown): string {
  return b64urlEncode(new TextEncoder().encode(JSON.stringify(obj)));
}

function decodeJson<T>(part: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(b64urlDecode(part))) as T;
  } catch {
    return null;
  }
}

async function hmacKey(signingKey: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signingKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export interface M2mTokenClaims {
  iss: string;
  sub: string;
  aud: string;
  scope: string;
  keyOwner: string;
  exp: number;
  iat: number;
  jti: string;
}

/** Sign the self-contained M2M access token. Exported for unit tests. */
export async function signM2mToken(claims: M2mTokenClaims, signingKey: string): Promise<string> {
  const header = encodeJson({ alg: 'HS256', typ: 'JWT' });
  const payload = encodeJson(claims);
  const key = await hmacKey(signingKey);
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${header}.${payload}`)
  );
  return `${M2M_TOKEN_PREFIX}${header}.${payload}.${b64urlEncode(new Uint8Array(sig))}`;
}

/**
 * Verify an `mcp_m2m_*` token: signature, expiry, audience. Returns the
 * claims on success, null on any failure (caller falls through to the
 * 401 challenge). Zero I/O — safe on the hot path.
 */
export async function verifyM2mTokenClaims(
  token: string,
  signingKey: string,
  expectedAud: string
): Promise<M2mTokenClaims | null> {
  if (!token.startsWith(M2M_TOKEN_PREFIX)) return null;
  const jws = token.slice(M2M_TOKEN_PREFIX.length);
  const parts = jws.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts as [string, string, string];
  const headerObj = decodeJson<{ alg?: string }>(header);
  if (!headerObj || headerObj.alg !== 'HS256') return null;
  const key = await hmacKey(signingKey);
  let valid: boolean;
  try {
    valid = await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlDecode(sig),
      new TextEncoder().encode(`${header}.${payload}`)
    );
  } catch {
    return null;
  }
  if (!valid) return null;
  const claims = decodeJson<M2mTokenClaims>(payload);
  if (!claims) return null;
  if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) return null;
  if (claims.aud !== expectedAud) return null;
  return claims;
}

/** Worker entrypoint for step-2 dual-auth: token → AuthSuccess | null. */
export async function verifyM2mToken(
  token: string,
  env: Env,
  requestOrigin: string
): Promise<AuthSuccess | null> {
  if (!env.OAUTH_M2M_SIGNING_KEY) return null;
  const claims = await verifyM2mTokenClaims(
    token,
    env.OAUTH_M2M_SIGNING_KEY,
    canonicalAudience(requestOrigin)
  );
  if (!claims) return null;
  return {
    ok: true,
    keyOwner: claims.keyOwner,
    scopes: claims.scope.split(' ').filter(Boolean),
  };
}

/** Canonical RFC 8707 resource/audience for this deployment. */
export function canonicalAudience(origin: string): string {
  return `${origin}/mcp`;
}

// ---------------------------------------------------------------------------
// RFC 7523 client-assertion verification (ES256 against inline JWKS)
// ---------------------------------------------------------------------------

interface AssertionClaims {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  jti?: string;
}

async function importEs256Jwk(jwk: M2mJwk): Promise<CryptoKey | null> {
  try {
    return await crypto.subtle.importKey(
      'jwk',
      jwk as JsonWebKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
  } catch {
    return null;
  }
}

/**
 * Verify a private_key_jwt client assertion. Exported for unit tests.
 * Returns the verified claims or null. The caller enforces jti replay
 * (needs KV) and iss/sub == client_id.
 */
export async function verifyClientAssertion(
  assertion: string,
  jwks: { keys: M2mJwk[] },
  expectedAudPrefix: string
): Promise<AssertionClaims | null> {
  const parts = assertion.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts as [string, string, string];
  const headerObj = decodeJson<{ alg?: string; kid?: string }>(header);
  if (!headerObj || headerObj.alg !== 'ES256') return null;
  const candidates = headerObj.kid ? jwks.keys.filter((k) => k.kid === headerObj.kid) : jwks.keys;
  const data = new TextEncoder().encode(`${header}.${payload}`);
  const sigBytes = b64urlDecode(sig);
  let verified = false;
  for (const jwk of candidates) {
    const key = await importEs256Jwk(jwk);
    if (!key) continue;
    try {
      if (await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sigBytes, data)) {
        verified = true;
        break;
      }
    } catch {
      /* try next key */
    }
  }
  if (!verified) return null;
  const claims = decodeJson<AssertionClaims>(payload);
  if (!claims) return null;
  const now = Date.now() / 1000;
  if (typeof claims.exp !== 'number' || claims.exp < now) return null;
  // Short-lived by contract: reject assertions minted with long lifetimes.
  if (typeof claims.iat === 'number' && claims.exp - claims.iat > ASSERTION_MAX_LIFETIME_S) {
    return null;
  }
  // Audience must name this AS (token endpoint or origin).
  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!auds.some((a) => typeof a === 'string' && a.startsWith(expectedAudPrefix))) return null;
  return claims;
}

// ---------------------------------------------------------------------------
// POST /token (grant_type=client_credentials)
// ---------------------------------------------------------------------------

function tokenError(error: string, description: string, status = 400): Response {
  return new Response(JSON.stringify({ error, error_description: description }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function handleClientCredentialsToken(request: Request, env: Env): Promise<Response> {
  if (!env.OAUTH_KV || !env.OAUTH_M2M_SIGNING_KEY) {
    return tokenError('server_error', 'M2M token infrastructure not configured', 503);
  }
  let form: URLSearchParams;
  try {
    form = new URLSearchParams(await request.text());
  } catch {
    return tokenError('invalid_request', 'Body must be application/x-www-form-urlencoded');
  }

  const origin = new URL(request.url).origin;

  // --- Resolve client id + authentication mode ------------------------
  let clientId = form.get('client_id') ?? '';
  let secret = form.get('client_secret') ?? '';
  const basic = request.headers.get('Authorization') ?? '';
  if (basic.startsWith('Basic ')) {
    try {
      const [idPart, secretPart] = atob(basic.slice('Basic '.length)).split(':', 2);
      clientId = decodeURIComponent(idPart ?? '');
      secret = decodeURIComponent(secretPart ?? '');
    } catch {
      return tokenError('invalid_client', 'Malformed Basic authorization header', 401);
    }
  }
  const assertionType = form.get('client_assertion_type');
  const assertion = form.get('client_assertion');

  if (assertionType === CLIENT_ASSERTION_TYPE && assertion) {
    // iss/sub identify the client in the assertion itself.
    const unverified = decodeJson<AssertionClaims>(assertion.split('.')[1] ?? '');
    if (!unverified?.iss) return tokenError('invalid_client', 'Assertion missing iss', 401);
    clientId = unverified.iss;
  }
  if (!clientId) return tokenError('invalid_client', 'client_id required', 401);

  const record = await getM2mClient(env.OAUTH_KV, clientId);
  if (!record) return tokenError('invalid_client', 'Unknown client', 401);

  // --- Authenticate ---------------------------------------------------
  if (assertionType === CLIENT_ASSERTION_TYPE && assertion) {
    if (!record.jwks) {
      return tokenError('invalid_client', 'Client has no registered JWKS for private_key_jwt', 401);
    }
    const claims = await verifyClientAssertion(assertion, record.jwks, origin);
    if (!claims || claims.iss !== clientId || claims.sub !== clientId) {
      safeLog({
        event: 'oauth.m2m.rejected',
        keyOwner: keyOwnerFor(record),
        reason: 'assertion-invalid',
        success: false,
        errorCode: 'invalid_client',
      });
      return tokenError('invalid_client', 'Client assertion verification failed', 401);
    }
    // jti one-shot replay check (KV; short window is acceptable — the
    // assertion also expires within 5 minutes).
    if (claims.jti) {
      const jtiKey = `${JTI_KEY_PREFIX}${clientId}:${claims.jti}`;
      if ((await env.OAUTH_KV.get(jtiKey)) !== null) {
        return tokenError('invalid_client', 'Replayed client assertion (jti already used)', 401);
      }
      await env.OAUTH_KV.put(jtiKey, '1', { expirationTtl: ASSERTION_MAX_LIFETIME_S });
    }
  } else {
    if (!secret || !(await verifyM2mSecret(record, secret))) {
      safeLog({
        event: 'oauth.m2m.rejected',
        keyOwner: keyOwnerFor(record),
        reason: 'secret-invalid',
        success: false,
        errorCode: 'invalid_client',
      });
      return tokenError('invalid_client', 'Client authentication failed', 401);
    }
  }

  // --- RFC 8707 resource validation (when the client sends one) -------
  const resource = form.get('resource');
  if (resource && resource !== canonicalAudience(origin) && resource !== origin) {
    return tokenError('invalid_target', `Unknown resource; expected ${canonicalAudience(origin)}`);
  }

  // --- Scope subset ---------------------------------------------------
  const requested = (form.get('scope') ?? '').split(' ').filter(Boolean);
  const granted =
    requested.length > 0
      ? requested.filter((s) => record.allowedScopes.some((owned) => hasScope([owned], s)))
      : [...record.allowedScopes];
  if (requested.length > 0 && granted.length === 0) {
    return tokenError('invalid_scope', 'No requested scope is allowed for this client');
  }

  // --- Mint -----------------------------------------------------------
  const now = Math.floor(Date.now() / 1000);
  const token = await signM2mToken(
    {
      iss: origin,
      sub: record.clientId,
      aud: canonicalAudience(origin),
      scope: granted.join(' '),
      keyOwner: keyOwnerFor(record),
      exp: now + M2M_TOKEN_TTL_S,
      iat: now,
      jti: crypto.randomUUID(),
    },
    env.OAUTH_M2M_SIGNING_KEY
  );

  safeLog({
    event: 'oauth.m2m.issued',
    keyOwner: keyOwnerFor(record),
    success: true,
  });

  // No refresh_token — per the MCP client-credentials extension, clients
  // re-exchange on expiry.
  return new Response(
    JSON.stringify({
      access_token: token,
      token_type: 'bearer',
      expires_in: M2M_TOKEN_TTL_S,
      scope: granted.join(' '),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
  );
}
