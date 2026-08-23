/**
 * OAuth API handler (BL-033 Slice 2) — invoked by workers-oauth-provider
 * AFTER it has validated an access token on an `apiRoute` path
 * (`/mcp`, `/radar/snapshot`). The decrypted grant `props` arrive on
 * `ctx.props`; this adapter rebuilds the `AuthSuccess` contract and
 * hands off to the shared post-auth pipeline, so OAuth callers get
 * byte-identical downstream behavior (rate limits keyed on
 * `OAUTH:<user>`, AE attribution, scope gating) to static-key callers.
 */

import type { ExecutionContext } from '@cloudflare/workers-types';
import type { AuthSuccess } from '../auth/bearer';
import { safeLog } from '../auth/safe-logger';
import { handleAuthenticated } from '../pipeline/handle-authenticated';
import type { Env } from '../env';

/** Shape written by consent.ts `completeAuthorization({ props })`. */
export interface OAuthGrantProps {
  keyOwner: string;
  userId: string;
  scopes: string[];
  authKind: 'oauth';
}

export const oauthApiHandler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const props = (ctx as ExecutionContext & { props?: Partial<OAuthGrantProps> }).props;
    if (!props || typeof props.keyOwner !== 'string' || !Array.isArray(props.scopes)) {
      // A token validated by the provider but carrying malformed props
      // means a grant written outside consent.ts's contract — fail
      // closed and loudly rather than defaulting scopes.
      safeLog({
        event: 'oauth.props.malformed',
        keyOwner: 'OAUTH',
        success: false,
        errorCode: 'oauth-props',
      });
      return new Response(
        JSON.stringify({ error: 'unauthorized', message: 'Malformed grant properties' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const auth: AuthSuccess = {
      ok: true,
      keyOwner: props.keyOwner,
      scopes: props.scopes,
    };
    return handleAuthenticated(request, env, ctx, auth);
  },
};
