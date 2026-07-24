/**
 * OAuth default handler (BL-033 Slice 2) — receives every provider-
 * delegated request that is NOT a token-validated API call: the
 * /authorize consent surface and the admin client-management endpoints.
 * The provider injects `env.OAUTH_PROVIDER` (OAuthHelpers) before
 * invoking this handler — that injection is why admin client CRUD is
 * mounted here instead of directly in worker.ts.
 */

import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { handleAuthorizeGet, handleAuthorizePost } from './consent';
import { handleAdminM2mClients, handleAdminOauthClients } from '../admin/oauth-clients';
import type { Env } from '../worker';

type EnvWithHelpers = Env & { OAUTH_PROVIDER: OAuthHelpers };

export const oauthDefaultHandler = {
  async fetch(request: Request, env: EnvWithHelpers): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/authorize') {
      if (request.method === 'GET') return handleAuthorizeGet(request, env);
      if (request.method === 'POST') return handleAuthorizePost(request, env);
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, POST' } });
    }

    if (url.pathname.startsWith('/admin/oauth/m2m-clients')) {
      return handleAdminM2mClients(request, env);
    }
    if (url.pathname.startsWith('/admin/oauth/clients')) {
      return handleAdminOauthClients(request, env);
    }

    return new Response('Not Found', { status: 404 });
  },
};
