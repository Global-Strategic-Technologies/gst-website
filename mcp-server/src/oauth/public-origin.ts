/**
 * The Worker's public origin, as CONFIGURATION (ADR-0044).
 *
 * `PUBLIC_ORIGIN` (wrangler.toml, one value per environment) is the single
 * origin the OAuth surface exists on: the authorization server's issuer, the
 * base of the protected resource (`<origin>/mcp`, see `canonicalAudience` in
 * `m2m-token.ts`) and the only origin a token credential is honoured on.
 *
 * It is deliberately NOT inferred from the request. The Worker answers on
 * alias hostnames (`status.mcp.…`) and over cleartext `http`, and an origin
 * read off the request let each of those mint its own issuer, audience and
 * metadata documents. `@cloudflare/workers-oauth-provider` 1.x also binds
 * every token to one configured resource and keeps one set of helpers per
 * `env`, so there can only be one.
 *
 * Provider-free (no `cloudflare:workers` in the import graph) so the node
 * vitest pool can load it.
 */

/** The configured public origin, or `null` when the var is unbound. */
export function publicOrigin(env: { PUBLIC_ORIGIN?: string }): string | null {
  return env.PUBLIC_ORIGIN ? env.PUBLIC_ORIGIN : null;
}

/**
 * Whether this request arrived on the configured public origin — exact
 * match on scheme, host and port. Unbound var ⇒ `false` for every request:
 * the OAuth surface is off rather than guessed at (fail closed).
 */
export function isCanonicalOrigin(url: URL, env: { PUBLIC_ORIGIN?: string }): boolean {
  const configured = publicOrigin(env);
  return configured !== null && url.origin === configured;
}
