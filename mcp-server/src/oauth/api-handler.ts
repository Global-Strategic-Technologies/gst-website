/**
 * OAuth API handler (BL-033 Slice 2) — invoked by workers-oauth-provider
 * AFTER it has validated an access token on an `apiRoute` path
 * (`/mcp`, `/radar/snapshot`). The decrypted grant `props` arrive on
 * `ctx.props`; this adapter rebuilds the `AuthSuccess` contract and
 * hands off to the shared post-auth pipeline, so OAuth callers get
 * byte-identical downstream behavior (rate limits keyed on
 * `OAUTH:<user>`, AE attribution, scope gating) to static-key callers.
 *
 * BL-155 Slice 2b: a KV-backed consent grant (trial credential pasted at
 * the consent page) additionally carries `tier`, `expiresAt` and
 * `rateLimitSubject`. `tier` and `rateLimitSubject` are threaded onto the
 * `AuthSuccess`; `expiresAt` is the HARD STOP — a validated token whose
 * grant is past expiry is refused here, on every request, with zero KV.
 * The exchange callback (`token-exchange.ts`) clamps token TTLs so this
 * rarely fires, but a TTL is a bound and this is the check.
 */

import type { ExecutionContext } from '@cloudflare/workers-types';
import type { AuthSuccess } from '../auth/bearer';
import { safeLog } from '../auth/safe-logger';
import { effectiveScopes } from '../auth/scopes';
import { handleAuthenticated } from '../pipeline/handle-authenticated';
import type { Env } from '../env';

/** Shape written by consent.ts `completeAuthorization({ props })`. */
export interface OAuthGrantProps {
  keyOwner: string;
  userId: string;
  scopes: string[];
  authKind: 'oauth';
  /** BL-155 — present only on KV-backed (trial / converted) consent grants. */
  tier?: string;
  /** BL-155 — ISO instant the grant must not be honoured past. */
  expiresAt?: string;
  /** BL-155 — per-client limiter identifier (see `AuthSuccess.rateLimitSubject`). */
  rateLimitSubject?: string;
  /**
   * BL-166 — grant-model marker (`SCOPE_MODEL`), stamped by every consent
   * since radar became an explicit scope. Absent on older grants, which
   * `effectiveScopes` treats as legacy (they keep every tool, and radar unless trial).
   */
  scopeModel?: number;
}

function unauthorized(message: string): Response {
  return new Response(JSON.stringify({ error: 'unauthorized', message }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
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
      return unauthorized('Malformed grant properties');
    }
    if (typeof props.expiresAt === 'string' && Date.parse(props.expiresAt) <= Date.now()) {
      safeLog({
        event: 'oauth.grant.expired',
        keyOwner: props.keyOwner,
        success: false,
        errorCode: 'expired',
      });
      return unauthorized('Grant has expired');
    }
    // BL-166 — scopes as the grant actually carries them. A pre-BL-166 grant
    // (no `scopeModel`) was consented when no tools/call checked a tool scope,
    // so it could call every tool, and radar unless trial; `effectiveScopes`
    // restores exactly that (`tool:*`, plus `tool:radar:*` unless trial).
    // Props are encrypted per token and cannot be rewritten in place, which
    // is why this is a read-time rule rather than a migration (ADR-0041).
    const auth: AuthSuccess = {
      ok: true,
      keyOwner: props.keyOwner,
      scopes: effectiveScopes(props.scopes, {
        scopeModel: props.scopeModel,
        ...(typeof props.tier === 'string' ? { tier: props.tier } : {}),
      }),
      ...(typeof props.tier === 'string' ? { tier: props.tier } : {}),
      ...(typeof props.rateLimitSubject === 'string'
        ? { rateLimitSubject: props.rateLimitSubject }
        : {}),
    };
    return handleAuthenticated(request, env, ctx, auth);
  },
};
