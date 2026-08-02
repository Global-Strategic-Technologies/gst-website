/**
 * Admin endpoints for OAuth client management (BL-033 Slice 2).
 *
 * Mounted at /admin/oauth/clients* THROUGH the provider's defaultHandler
 * (not directly in worker.ts) because the provider injects
 * `env.OAUTH_PROVIDER` (OAuthHelpers) only into handlers it invokes —
 * and client records live in the library's KV store via those helpers.
 *
 * Gate: `Authorization: Bearer <MCP_ADMIN_KEY>` — the same single admin
 * credential that gates the Inoreader re-auth flow; deliberately a
 * distinct family from team `MCP_KEY_*` bearers (team keys do NOT grant
 * admin). Constant-time compared via validateAdminKey.
 *
 * Surface (JSON in/out):
 *   GET    /admin/oauth/clients           — list registered clients
 *   POST   /admin/oauth/clients           — create pre-registered client
 *            body: { clientName, redirectUris: string[],
 *                    tokenEndpointAuthMethod? ('client_secret_basic' |
 *                    'client_secret_post' | 'none'; default basic) }
 *            → 201 { client } — clientSecret present ONLY in this
 *              response (library stores a hash; unrecoverable later).
 *   DELETE /admin/oauth/clients/<id>      — delete client (existing
 *            grants orphan and purge via the library's sweeps; token
 *            validity ends at access-token expiry ≤1h).
 *
 * M2M client records (`mcp:oauth:m2m-client:*`) are managed by the
 * /admin/oauth/m2m-clients* branch added in the M2M phase.
 */

import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { validateAdminKey } from './admin-auth';
import { safeLog } from '../auth/safe-logger';
import {
  createM2mClient,
  deleteM2mClient,
  getM2mClient,
  listM2mClients,
  type M2mJwk,
} from '../oauth/m2m-clients';
import { ASSIGNABLE_TIERS, isAssignableTier } from '../ratelimit/tiers';
import type { Env } from '../worker';

type EnvWithHelpers = Env & { OAUTH_PROVIDER: OAuthHelpers };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Extract + validate the admin bearer; null = pass, Response = reject. */
export function requireAdmin(request: Request, env: Env): Response | null {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!token || !validateAdminKey(token, env)) {
    safeLog({
      event: 'admin.oauth.rejected',
      keyOwner: 'ADMIN',
      reason: 'bad-admin-key',
      success: false,
      errorCode: 'unauthorized',
    });
    return json({ error: 'unauthorized', message: 'Valid MCP_ADMIN_KEY bearer required' }, 401);
  }
  return null;
}

export async function handleAdminOauthClients(
  request: Request,
  env: EnvWithHelpers
): Promise<Response> {
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  const url = new URL(request.url);
  const rest = url.pathname.slice('/admin/oauth/clients'.length);

  if (rest === '' || rest === '/') {
    if (request.method === 'GET') {
      const result = await env.OAUTH_PROVIDER.listClients();
      // Never echo secret hashes; surface the operational fields only.
      const clients = result.items.map((c) => ({
        clientId: c.clientId,
        clientName: c.clientName,
        redirectUris: c.redirectUris,
        tokenEndpointAuthMethod: c.tokenEndpointAuthMethod,
        registrationDate: c.registrationDate,
      }));
      return json({ clients, cursor: result.cursor ?? null });
    }
    if (request.method === 'POST') {
      let body: {
        clientName?: string;
        redirectUris?: string[];
        tokenEndpointAuthMethod?: string;
      };
      try {
        body = await request.json();
      } catch {
        return json({ error: 'bad-request', message: 'Body must be JSON' }, 400);
      }
      if (!body.clientName || !Array.isArray(body.redirectUris) || body.redirectUris.length === 0) {
        return json(
          { error: 'bad-request', message: 'clientName and non-empty redirectUris[] required' },
          400
        );
      }
      const client = await env.OAUTH_PROVIDER.createClient({
        clientName: body.clientName,
        redirectUris: body.redirectUris,
        tokenEndpointAuthMethod: body.tokenEndpointAuthMethod ?? 'client_secret_basic',
      });
      safeLog({
        event: 'admin.oauth.client-created',
        keyOwner: 'ADMIN',
        reason: `client=${client.clientId}`,
        success: true,
      });
      // clientSecret is visible ONLY here — the library stores a hash.
      return json({ client }, 201);
    }
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, POST' } });
  }

  const idMatch = rest.match(/^\/([^/]+)$/);
  if (idMatch) {
    const clientId = decodeURIComponent(idMatch[1]!);
    if (request.method === 'DELETE') {
      const existing = await env.OAUTH_PROVIDER.lookupClient(clientId);
      if (!existing) return json({ error: 'not-found', message: 'Unknown clientId' }, 404);
      await env.OAUTH_PROVIDER.deleteClient(clientId);
      safeLog({
        event: 'admin.oauth.client-deleted',
        keyOwner: 'ADMIN',
        reason: `client=${clientId}`,
        success: true,
      });
      return json({ deleted: clientId });
    }
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'DELETE' } });
  }

  return json({ error: 'not-found', message: 'Unknown admin OAuth route' }, 404);
}

/**
 * M2M client management — /admin/oauth/m2m-clients* (BL-033 Slice 2).
 * Same admin gate; records live in our own OAUTH_KV namespace (see
 * oauth/m2m-clients.ts). The clientSecret appears ONLY in the creation
 * response; deleting a record blocks re-issuance (already-minted tokens
 * carry ≤1h residual validity — introspection reports them inactive).
 */
export async function handleAdminM2mClients(request: Request, env: Env): Promise<Response> {
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  if (!env.OAUTH_KV) {
    return json({ error: 'server-error', message: 'OAUTH_KV not bound' }, 503);
  }

  const url = new URL(request.url);
  const rest = url.pathname.slice('/admin/oauth/m2m-clients'.length);

  if (rest === '' || rest === '/') {
    if (request.method === 'GET') {
      const records = await listM2mClients(env.OAUTH_KV);
      // Never echo secret hashes or key material.
      const clients = records.map((r) => ({
        clientId: r.clientId,
        name: r.name,
        allowedScopes: r.allowedScopes,
        tier: r.tier,
        hasJwks: Boolean(r.jwks),
        createdAt: r.createdAt,
      }));
      return json({ clients });
    }
    if (request.method === 'POST') {
      let body: {
        name?: string;
        allowedScopes?: string[];
        tier?: string;
        jwks?: { keys: M2mJwk[] };
      };
      try {
        body = await request.json();
      } catch {
        return json({ error: 'bad-request', message: 'Body must be JSON' }, 400);
      }
      if (!body.name || !Array.isArray(body.allowedScopes) || body.allowedScopes.length === 0) {
        return json(
          { error: 'bad-request', message: 'name and non-empty allowedScopes[] required' },
          400
        );
      }
      // BL-033 Slice 5: reject a mistyped tier up front. Without this a typo
      // resolves fail-generous to `internal` (60/1000) — LOOSER than
      // `free-pilot` — silently defeating abuse containment. Omitting `tier`
      // is fine; it defaults to `free-pilot` in `createM2mClient`.
      if (body.tier !== undefined && !isAssignableTier(body.tier)) {
        return json(
          {
            error: 'bad-request',
            message: `tier must be one of ${ASSIGNABLE_TIERS.join(', ')} (or omitted → free-pilot)`,
          },
          400
        );
      }
      const { record, clientSecret } = await createM2mClient(env.OAUTH_KV, {
        name: body.name,
        allowedScopes: body.allowedScopes,
        tier: body.tier,
        jwks: body.jwks,
      });
      safeLog({
        event: 'admin.oauth.m2m-client-created',
        keyOwner: 'ADMIN',
        reason: `client=${record.clientId}`,
        success: true,
      });
      // clientSecret is visible ONLY here — only its hash is stored.
      return json(
        {
          client: {
            clientId: record.clientId,
            name: record.name,
            allowedScopes: record.allowedScopes,
            tier: record.tier,
            createdAt: record.createdAt,
          },
          clientSecret,
        },
        201
      );
    }
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, POST' } });
  }

  const idMatch = rest.match(/^\/([^/]+)$/);
  if (idMatch) {
    const clientId = decodeURIComponent(idMatch[1]!);
    if (request.method === 'DELETE') {
      const existing = await getM2mClient(env.OAUTH_KV, clientId);
      if (!existing) return json({ error: 'not-found', message: 'Unknown clientId' }, 404);
      await deleteM2mClient(env.OAUTH_KV, clientId);
      safeLog({
        event: 'admin.oauth.m2m-client-deleted',
        keyOwner: 'ADMIN',
        reason: `client=${clientId}`,
        success: true,
      });
      return json({ deleted: clientId });
    }
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'DELETE' } });
  }

  return json({ error: 'not-found', message: 'Unknown admin OAuth route' }, 404);
}
