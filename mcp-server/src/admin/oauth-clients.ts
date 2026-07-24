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
