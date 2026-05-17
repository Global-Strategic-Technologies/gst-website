/**
 * Bearer-token authentication for the MCP Worker (BL-032 Phase 2).
 *
 * Each team member's bearer token is stored as a Wrangler secret named
 * `MCP_KEY_<INITIALS>` (e.g. `MCP_KEY_RP`). On every request the Worker
 * compares the `Authorization: Bearer <token>` header value against ALL
 * `MCP_KEY_*` secrets present on the `env` binding; the matching secret's
 * suffix (`RP`) is the **key owner** logged on the request line for
 * attribution. The full token is never logged, returned, or otherwise
 * surfaced — the matched env-var name is sufficient identity.
 *
 * Operational reference: `mcp-server/src/docs/operations/AUTH.md`.
 *
 * Phase 2 scope: validate header → return success-or-structured-401.
 * Phase 3 (rate limit) reads the keyOwner string from the success result
 * and uses it as the per-key bucket identifier. Phase 5 (observability)
 * adds the keyOwner to the structured log line.
 *
 * Why API key not OAuth (Q-deferred-to-BL-033): for an internal team of
 * <10, `wrangler secret put` is the simplest safe revocation surface.
 * OAuth 2.1 is BL-033's external-pilot concern.
 */

import { DEFAULT_SCOPES } from './scopes';

const BEARER_PREFIX = 'Bearer ';
const KEY_NAME_PREFIX = 'MCP_KEY_';

/** Successful auth — request is allowed; keyOwner identifies the team member. */
export interface AuthSuccess {
  readonly ok: true;
  /** Stripped suffix of the matched secret name. E.g. `MCP_KEY_RP` → `RP`. */
  readonly keyOwner: string;
  /**
   * Scope set granted to this key. For BL-032.5 every matched key
   * receives `DEFAULT_SCOPES` (full grant). BL-033 introduces per-key
   * variation via OAuth-issued tokens; the field shape stays the same.
   * Handlers gate access via `assertScope(auth.scopes, required)`.
   */
  readonly scopes: readonly string[];
}

/** Failed auth — Worker should respond with the carried 401 envelope. */
export interface AuthFailure {
  readonly ok: false;
  readonly status: 401;
  readonly bodyText: string;
  readonly headers: Readonly<Record<string, string>>;
}

export type AuthResult = AuthSuccess | AuthFailure;

const DEFAULT_401_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'WWW-Authenticate': 'Bearer realm="gst-mcp"',
  'Content-Type': 'application/json',
});

function unauthorized(reason: string): AuthFailure {
  return {
    ok: false,
    status: 401,
    bodyText: JSON.stringify({ error: 'unauthorized', message: reason }),
    headers: DEFAULT_401_HEADERS,
  };
}

/**
 * Validate the request's Authorization header against the env's
 * `MCP_KEY_*` secrets.
 *
 * The `env` parameter is intentionally typed `Record<string, unknown>`
 * rather than the worker's strict `Env` interface — it lets this module
 * enumerate every binding at runtime via `Object.entries(env)` regardless
 * of how the type is declared. Wrangler-secret values arrive as strings;
 * non-string bindings (KV namespaces, R2 buckets, etc.) get filtered out
 * by the type-guard inside the loop.
 */
export function authenticate(request: Request, env: Record<string, unknown>): AuthResult {
  const auth = request.headers.get('Authorization');
  if (!auth) return unauthorized('Missing Authorization header');
  // HTTP runtimes normalize trailing whitespace on header values, so
  // `Authorization: Bearer ` arrives as `"Bearer"` (no trailing space).
  // Route the bare-scheme and whitespace-only-token cases to the empty-
  // token branch so operators see a clearer 401 message.
  if (auth === 'Bearer' || /^Bearer\s+$/.test(auth)) return unauthorized('Empty Bearer token');
  if (!auth.startsWith(BEARER_PREFIX))
    return unauthorized('Authorization header must use Bearer scheme');

  const token = auth.slice(BEARER_PREFIX.length).trim();
  if (!token) return unauthorized('Empty Bearer token');

  for (const [name, value] of Object.entries(env)) {
    if (typeof value !== 'string') continue;
    if (!name.startsWith(KEY_NAME_PREFIX)) continue;
    // Skip the `_SCOPES` companion env vars during the token-match scan —
    // they're metadata for OTHER keys (e.g. `MCP_KEY_FOO_SCOPES` describes
    // the scopes for `MCP_KEY_FOO`). Treating them as keys would let any
    // caller authenticate by sending the JSON-encoded scope array as a
    // bearer token, which is wrong (and a leaky-ish information disclosure).
    if (name.endsWith(SCOPES_SUFFIX)) continue;
    if (value === token) {
      const owner = name.slice(KEY_NAME_PREFIX.length);
      const result = resolveKeyScopes(env, name);
      if (!result.ok) {
        // Malformed `_SCOPES` companion var — fail loud at auth time rather
        // than silently falling back to DEFAULT_SCOPES. An operator who
        // mistyped JSON in a Worker secret should see the failure
        // immediately, not discover it via a downstream scope-mismatch.
        return unauthorized(`Bearer key ${owner} has malformed _SCOPES JSON: ${result.message}`);
      }
      return {
        ok: true,
        keyOwner: owner,
        scopes: result.scopes,
      };
    }
  }

  return unauthorized('Invalid Bearer token');
}

/** Suffix for the optional per-key scope-subset companion env var. */
const SCOPES_SUFFIX = '_SCOPES';

/**
 * BL-032.8 Phase 2 — optional per-key scope subset.
 *
 * When `MCP_KEY_<OWNER>_SCOPES` is bound on the env (JSON-encoded string
 * array), narrow the resolved scope set to that subset. When absent, the
 * key carries `DEFAULT_SCOPES` (the BL-032.5 behavior).
 *
 * **Why narrow keys**: enables the website's `MCP_KEY_WEBSITE_RADAR` to
 * carry only `['resource:radar:read']` instead of the full Tool / Prompt
 * / Resource grant — limits blast radius if the website's env leaks
 * AND keeps audit logs clean (radar-snapshot reads don't pollute
 * tool-call telemetry).
 *
 * Returns `{ ok: true, scopes }` on success or `{ ok: false, message }` on
 * malformed JSON. The malformed case is deliberately surfaced so the
 * caller can fail loud at auth time. The `ok` discriminator on both
 * variants is what lets the caller's `if (!result.ok)` narrow cleanly
 * (an asymmetric union with `'ok' in result` only narrows on the truthy
 * branch and trips TypeScript's strict-narrowing under `tsc --noEmit`).
 */
type ScopeResolution = { ok: true; scopes: readonly string[] } | { ok: false; message: string };

function resolveKeyScopes(env: Record<string, unknown>, keyName: string): ScopeResolution {
  const scopesEnvVar = `${keyName}${SCOPES_SUFFIX}`;
  const raw = env[scopesEnvVar];
  if (typeof raw !== 'string') {
    return { ok: true, scopes: DEFAULT_SCOPES };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return { ok: false, message: 'must be a JSON-encoded string array' };
    }
    if (!parsed.every((s) => typeof s === 'string' && s.length > 0)) {
      return { ok: false, message: 'all elements must be non-empty strings' };
    }
    return { ok: true, scopes: parsed as readonly string[] };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/** Build a `Response` from an `AuthFailure` envelope. */
export function authFailureResponse(failure: AuthFailure): Response {
  return new Response(failure.bodyText, {
    status: failure.status,
    headers: failure.headers,
  });
}
