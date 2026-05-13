/**
 * Scope catalog for the GST MCP server (BL-032.5 Phase 2).
 *
 * Scopes are coarse-grained permissions carried on the bearer-key auth
 * result. A handler that wants to gate access checks the auth's `scopes`
 * array via `hasScope(...)` or `assertScope(...)` before doing work.
 *
 * **For BL-032.5** (internal team only, single shared bearer key per
 * member) every wrangler-issued key is configured with the full
 * `DEFAULT_SCOPES` set — every key can do everything. The scope-check
 * call sites still ship so the discipline is exercised in production
 * traffic from day one; they just never reject anything yet.
 *
 * **For BL-033** (external pilot, per-client OAuth tokens) the same
 * scope strings will appear in OAuth-issued tokens with per-client
 * variation. Strings ship now and never change so external clients
 * don't have to adapt their scope handling later.
 *
 * **Wildcard semantics**: a scope ending in `:*` covers any required
 * scope that starts with the same `prefix:`. So:
 *   - `tool:*`              covers `tool:search_portfolio` etc.
 *   - `tool:radar:*`        covers `tool:radar:search_radar` etc.
 *   - `resource:library:read` is a literal scope (no wildcard).
 * Multi-level wildcards work: `tool:radar:*` matches `tool:radar:foo`
 * but NOT `tool:portfolio:search`.
 */

/** Stable scope strings — never change once shipped. */
export const SCOPES = {
  // Per-family resource read scopes. Each scope ends in `:read` to
  // forward-distinguish read vs. write when (if) we add writeable
  // Resources later.
  RESOURCE_LIBRARY_READ: 'resource:library:read',
  RESOURCE_REGULATIONS_READ: 'resource:regulations:read',
  RESOURCE_RADAR_READ: 'resource:radar:read',
  // Wildcard scopes — used by the default-grants set so BL-032.5 keys
  // cover every Tool/Resource/Prompt without enumerating each name.
  TOOL_ALL: 'tool:*',
  PROMPT_ALL: 'prompt:*',
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];

/**
 * Default scopes granted to every wrangler-issued bearer key in
 * BL-032.5. Covers every Tool, every Prompt, and the three Resource
 * families. Per-key variation is a BL-033 concern.
 */
export const DEFAULT_SCOPES: readonly string[] = Object.freeze([
  SCOPES.TOOL_ALL,
  SCOPES.RESOURCE_LIBRARY_READ,
  SCOPES.RESOURCE_REGULATIONS_READ,
  SCOPES.RESOURCE_RADAR_READ,
  SCOPES.PROMPT_ALL,
]);

/**
 * Test whether an owned scope set covers a required scope.
 *
 * Match order:
 *   1. Exact string match in `owned`.
 *   2. Wildcard match — for each `prefix:*` in `owned`, `required`
 *      passes if it starts with `prefix:`.
 *
 * Pure function; no I/O; safe to call inside any handler.
 */
export function hasScope(owned: readonly string[], required: string): boolean {
  if (owned.includes(required)) return true;
  for (const ownedScope of owned) {
    if (!ownedScope.endsWith(':*')) continue;
    // Strip the trailing '*' but KEEP the ':' so we match on
    // segment boundaries (`tool:*` matches `tool:foo` but not `toolbar`).
    const prefix = ownedScope.slice(0, -1);
    if (required.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Thrown when a handler tries to do work the caller's bearer key
 * doesn't have scope for. Carries the missing scope + the caller's
 * full owned-scopes list so the response error envelope can include
 * actionable diagnostic data.
 *
 * JSON-RPC error code: `-32002`. The JSON-RPC 2.0 spec reserves
 * `-32000`..`-32099` for application server errors; `-32002` is
 * unused elsewhere in this codebase. BL-033's OAuth flow will
 * preserve the same code so external clients don't have to adapt.
 */
export class MissingScopeError extends Error {
  static readonly CODE = -32002;
  readonly missingScope: string;
  readonly ownedScopes: readonly string[];

  constructor(missingScope: string, ownedScopes: readonly string[]) {
    super(`Missing required scope: ${missingScope}`);
    this.name = 'MissingScopeError';
    this.missingScope = missingScope;
    this.ownedScopes = ownedScopes;
  }

  /** Serialize to the shape Worker layer can pass into a JSON-RPC error response. */
  toJsonRpcError(): {
    code: number;
    message: string;
    data: { missingScope: string; ownedScopes: readonly string[] };
  } {
    return {
      code: MissingScopeError.CODE,
      message: this.message,
      data: {
        missingScope: this.missingScope,
        ownedScopes: this.ownedScopes,
      },
    };
  }
}

/**
 * Assert the owned scope set covers the required scope; throw
 * `MissingScopeError` otherwise. Inline this at the top of a handler
 * so the rejection happens BEFORE any side-effectful work runs.
 */
export function assertScope(owned: readonly string[], required: string): void {
  if (!hasScope(owned, required)) {
    throw new MissingScopeError(required, owned);
  }
}
