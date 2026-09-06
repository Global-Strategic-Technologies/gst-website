/**
 * OAuthProvider instance (BL-033 Slice 2) — the embedded OAuth 2.1
 * authorization server, mounted as a SUB-ROUTER from worker.ts (never
 * `export default`-wrapped: the hand-rolled pre-auth pipeline — health,
 * status, admin, route allowlist, withSentry wrap — keeps routing
 * control, and static-key traffic never passes through library response
 * shaping). Architecture decision + rejected alternatives: ADR-0008.
 *
 * What the library serves on delegated routes:
 *   /token                                    — issuance/refresh (PKCE S256 only)
 *   /.well-known/oauth-authorization-server   — RFC 8414 AS metadata
 *   /.well-known/oauth-protected-resource     — RFC 9728 PRM
 *   /authorize + /admin/oauth/clients*        — routed to our defaultHandler
 *                                               with env.OAUTH_PROVIDER injected
 *   /mcp, /radar/snapshot (valid token only)  — routed to our apiHandler
 *                                               with grant props on ctx.props
 *
 * grant_type=client_credentials is NOT supported by the library
 * (verified against v0.8.2 types, re-verified at 0.10.3) — worker.ts
 * intercepts that grant before delegation and routes it to
 * oauth/m2m-token.ts.
 *
 * `tokenExchangeCallback` (BL-155 Slice 2b) runs on every auth-code and
 * refresh exchange; non-time-boxed grants exit it untouched. See
 * oauth/token-exchange.ts for the verified 0.10.3 semantics it relies on.
 *
 * DCR (RFC 7591) is disabled by omitting `clientRegistrationEndpoint`
 * — clients are pre-registered via the admin endpoints (createClient)
 * or arrive as CIMD clients (client_id = HTTPS metadata-document URL;
 * requires the global_fetch_strictly_public compat flag, see
 * wrangler.toml).
 */

import { OAuthProvider } from '@cloudflare/workers-oauth-provider';
import { DEFAULT_SCOPES } from '../auth/scopes';
import { oauthApiHandler } from './api-handler';
import { oauthDefaultHandler } from './default-handler';
import { trialTokenExchange } from './token-exchange';

/** Scope strings advertised in AS metadata + PRM (catalog + radar narrowing wildcard). */
export const SCOPES_SUPPORTED: readonly string[] = Object.freeze([
  ...DEFAULT_SCOPES,
  'tool:radar:*',
]);

export const oauthProvider = new OAuthProvider({
  apiRoute: ['/mcp', '/radar/snapshot'],
  // Type casts: the library's handler generics default to Cloudflare.Env;
  // our handlers are typed against the worker's own Env interface.
  apiHandler: oauthApiHandler as never,
  defaultHandler: oauthDefaultHandler as never,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  // No clientRegistrationEndpoint → DCR disabled (BL-033 AC:243; the
  // MCP spec has demoted DCR to MAY — pre-registration + CIMD instead).
  accessTokenTTL: 3600, // 1h — BL-033 AC:246 (also the library default; pinned explicitly)
  // BL-155: binds a time-boxed consent grant to its record's expiresAt
  // (refresh TTL at code exchange, access TTL clamp on both). Returns
  // `undefined` — "no change" — for every grant without one.
  tokenExchangeCallback: (options) => trialTokenExchange(options),
  scopesSupported: [...SCOPES_SUPPORTED],
  // OAuth 2.1 / MCP spec: S256 only — plain PKCE offers no cryptographic
  // protection and every known MCP client sends S256.
  allowPlainPKCE: false,
  clientIdMetadataDocumentEnabled: true,
});
