/**
 * Token introspection — POST /oauth/introspect (BL-033 Slice 2,
 * AC:247). RFC 7662-shaped response, gated behind `MCP_ADMIN_KEY`
 * (the AC asks for "a separate admin scope"; the admin credential is
 * already a distinct family from team/client bearers — interpretation
 * recorded at the BACKLOG AC disposition). Mounted through the provider
 * defaultHandler so `env.OAUTH_PROVIDER.unwrapToken()` is available for
 * library-issued tokens.
 *
 * Dispatch by token shape:
 *   - `mcp_m2m_*` — local JWT verify + **client-record cross-check**: a
 *     revoked (deleted) client's not-yet-expired token verifies
 *     cryptographically but reports `active: false`, so an operator
 *     investigating a revocation sees the truth, not the ≤1h residual.
 *   - anything else — the library's KV-backed token store via
 *     `unwrapToken` (null → inactive).
 *
 * Per RFC 7662 §2.2 every failure mode about the TOKEN (unknown,
 * expired, revoked, malformed) is `{ active: false }` with 200 — no
 * oracle about why. Only caller-auth failures 401.
 */

import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { requireAdmin } from '../admin/oauth-clients';
import { getM2mClient } from './m2m-clients';
import { canonicalAudience, verifyM2mTokenClaims, M2M_TOKEN_PREFIX } from './m2m-token';
import type { Env } from '../worker';

type EnvWithHelpers = Env & { OAUTH_PROVIDER: OAuthHelpers };

interface IntrospectionResponse {
  active: boolean;
  client_id?: string;
  scope?: string;
  sub?: string;
  exp?: number;
  iat?: number;
  token_type?: string;
}

function json(body: IntrospectionResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

const INACTIVE: IntrospectionResponse = { active: false };

export async function handleIntrospection(
  request: Request,
  env: EnvWithHelpers
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
  }
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  let token: string;
  const contentType = request.headers.get('Content-Type') ?? '';
  try {
    if (contentType.includes('application/json')) {
      token = ((await request.json()) as { token?: string }).token ?? '';
    } else {
      token = new URLSearchParams(await request.text()).get('token') ?? '';
    }
  } catch {
    return json(INACTIVE);
  }
  if (!token) return json(INACTIVE);

  const origin = new URL(request.url).origin;

  // --- M2M self-contained tokens -------------------------------------
  if (token.startsWith(M2M_TOKEN_PREFIX)) {
    if (!env.OAUTH_M2M_SIGNING_KEY || !env.OAUTH_KV) return json(INACTIVE);
    const claims = await verifyM2mTokenClaims(
      token,
      env.OAUTH_M2M_SIGNING_KEY,
      canonicalAudience(origin)
    );
    if (!claims) return json(INACTIVE);
    // Revocation cross-check: deleted client ⇒ inactive, even though
    // the signature verifies for up to the residual hour.
    const record = await getM2mClient(env.OAUTH_KV, claims.sub);
    if (!record) return json(INACTIVE);
    return json({
      active: true,
      client_id: claims.sub,
      scope: claims.scope,
      sub: claims.sub,
      exp: claims.exp,
      iat: claims.iat,
      token_type: 'bearer',
    });
  }

  // --- Library-issued (auth-code / refresh) tokens -------------------
  const summary = await env.OAUTH_PROVIDER.unwrapToken(token).catch(() => null);
  if (!summary) return json(INACTIVE);
  if (summary.expiresAt * 1000 < Date.now()) return json(INACTIVE);
  return json({
    active: true,
    client_id: summary.grant.clientId,
    scope: summary.grant.scope.join(' '),
    sub: summary.userId,
    exp: summary.expiresAt,
    iat: summary.createdAt,
    token_type: 'bearer',
  });
}
