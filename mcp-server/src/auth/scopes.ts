/**
 * Scope catalog for the GST MCP server (BL-032.5 Phase 2).
 *
 * Scopes are coarse-grained permissions carried on the bearer-key auth
 * result. A handler that wants to gate access checks the auth's `scopes`
 * array via `hasScope(...)` or `assertScope(...)` before doing work.
 *
 * **Where scopes are enforced** (since BL-166, ADR-0041): every `tools/call`
 * at the boundary (`pipeline/tool-scope-gate.ts`, after the trial tier gate),
 * the radar Resource, `/radar/snapshot`, and the radar prompt's embed. Static
 * roster keys default to `DEFAULT_SCOPES`; OAuth and M2M clients carry
 * per-client sets. Scope strings never change once shipped, so clients never
 * have to adapt their scope handling.
 *
 * **Wildcard semantics**: a scope ending in `:*` covers any required
 * scope that starts with the same `prefix:`. So:
 *   - `tool:*`              covers `tool:search_portfolio` etc.
 *   - `tool:radar:*`        covers `tool:radar:search_radar` etc.
 *   - `resource:library:read` is a literal scope (no wildcard).
 * Multi-level wildcards work: `tool:radar:*` matches `tool:radar:foo`
 * but NOT `tool:portfolio:search`.
 *
 * **Explicit namespaces (BL-166, ADR-0041)**: a wildcard does NOT reach into
 * a namespace listed in `EXPLICIT_NAMESPACES` unless the wildcard itself sits
 * inside that namespace. So `tool:*` does not cover `tool:radar:search_radar`
 * (nor `tool:radar:*` itself); only `tool:radar:*` or the exact string does.
 * Radar spends the shared Inoreader budget and is granted deliberately, so a
 * broad `tool:*` grant must not carry it by accident.
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
  // BL-166 — the radar tools' own wildcard. `tool:*` does not cover it (see
  // `EXPLICIT_NAMESPACES`), so radar is granted only by naming it.
  TOOL_RADAR_ALL: 'tool:radar:*',
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];

/**
 * Default scopes granted to every wrangler-issued bearer key with no
 * `_SCOPES` override (the team roster and the latency probe). Covers every
 * Tool, every Prompt, the three Resource families, and — since BL-166, when
 * `tool:*` stopped covering radar — the radar tools explicitly.
 */
export const DEFAULT_SCOPES: readonly string[] = Object.freeze([
  SCOPES.TOOL_ALL,
  SCOPES.RESOURCE_LIBRARY_READ,
  SCOPES.RESOURCE_REGULATIONS_READ,
  SCOPES.RESOURCE_RADAR_READ,
  SCOPES.PROMPT_ALL,
  SCOPES.TOOL_RADAR_ALL,
]);

/**
 * BL-155 — the scope set a self-serve trial record is minted with: every
 * catalog scope EXCEPT the two radar scopes (the radar Resource and the
 * radar tools). Since BL-166 excluding `tool:radar:*` here really withholds
 * the radar tools, because `tool:*` no longer covers them; the tier gate in
 * `pipeline/tier-gate.ts` still refuses every trial radar call regardless,
 * which is what covers legacy trial grants that hold `tool:radar:*`. Prompts
 * stay in: a connector user's product experience is the `gst_*` prompts as
 * much as the tools. Pinned by a test that no scope here matches `radar`.
 */
export const TRIAL_SCOPES: readonly string[] = Object.freeze(
  DEFAULT_SCOPES.filter((s) => s !== SCOPES.RESOURCE_RADAR_READ && s !== SCOPES.TOOL_RADAR_ALL)
);

/**
 * Scope strings advertised in AS metadata + PRM, and the ceiling
 * `PATCH /admin/oauth/m2m-clients/:id` validates `allowedScopes` against.
 * Since BL-166 `tool:radar:*` is a member of `DEFAULT_SCOPES`, so this is the
 * same members in the same order. Lives here rather than in
 * `oauth/provider.ts` (which re-exports it) so admin code can import it
 * without pulling the provider's `cloudflare:workers` graph into the node
 * vitest pool. `scripts/provision-client.mjs` carries a mirror; the parity
 * test pins this declaration as text.
 */
export const SCOPES_SUPPORTED: readonly string[] = Object.freeze([...DEFAULT_SCOPES]);

/**
 * BL-033 Slice 2 — human-readable scope descriptions for the OAuth
 * consent page, one per catalog string above. Consent renders whatever a
 * client requests; an unknown scope string falls back to the raw value
 * (escaped) so nothing is hidden. The consent page is English-only.
 */
export const SCOPE_DESCRIPTIONS: Readonly<Record<string, string>> = Object.freeze({
  [SCOPES.TOOL_ALL]:
    'Run all GST analysis tools (diligence, portfolio, TechPar, ICG, IRL), excluding Radar',
  [SCOPES.PROMPT_ALL]: 'Use all GST guided prompts (diligence kickoff, IRL, memos)',
  [SCOPES.RESOURCE_LIBRARY_READ]: 'Read the GST insight library',
  [SCOPES.RESOURCE_REGULATIONS_READ]: 'Read the GST regulatory map',
  [SCOPES.RESOURCE_RADAR_READ]: 'Read the GST Radar market-intelligence feed',
  [SCOPES.TOOL_RADAR_ALL]: 'Run GST Radar live-search tools (consumes the shared Inoreader budget)',
});

/**
 * BL-166 — namespaces a broader wildcard does not reach into. A scope is
 * inside a namespace when it starts with that namespace string. `hasScope`
 * lets an owned wildcard cover a required scope in one of these namespaces
 * only when the wildcard itself is inside the same namespace.
 */
const EXPLICIT_NAMESPACES: readonly string[] = Object.freeze(['tool:radar:']);

/**
 * Test whether an owned scope set covers a required scope.
 *
 * Match order:
 *   1. Exact string match in `owned`.
 *   2. Wildcard match — for each `prefix:*` in `owned`, `required`
 *      passes if it starts with `prefix:`, UNLESS `required` sits in an
 *      explicit namespace (`EXPLICIT_NAMESPACES`) that the wildcard is not
 *      itself inside. So `tool:*` covers `tool:search_portfolio` but not
 *      `tool:radar:search_radar` or `tool:radar:*`.
 *
 * The carve-out is also what stops grant-time escalation: consent
 * (`grantedScopesFor`) and `/token` both filter requested scopes through
 * this function, so a `tool:*` ceiling can no longer be widened to
 * `tool:radar:*` by asking for it.
 *
 * Pure function; no I/O; safe to call inside any handler.
 */
export function hasScope(owned: readonly string[], required: string): boolean {
  if (owned.includes(required)) return true;
  const namespace = EXPLICIT_NAMESPACES.find((ns) => required.startsWith(ns));
  for (const ownedScope of owned) {
    if (!ownedScope.endsWith(':*')) continue;
    // Strip the trailing '*' but KEEP the ':' so we match on
    // segment boundaries (`tool:*` matches `tool:foo` but not `toolbar`).
    const prefix = ownedScope.slice(0, -1);
    if (!required.startsWith(prefix)) continue;
    if (namespace !== undefined && !prefix.startsWith(namespace)) continue;
    return true;
  }
  return false;
}

/**
 * BL-166 — the grant-model marker stamped into OAuth consent props
 * (`OAuthGrantProps.scopeModel`). A grant WITHOUT it was consented before
 * radar became an explicit scope; see `effectiveScopes`.
 */
export const SCOPE_MODEL = 2;

/**
 * The scopes a grant actually carries at request time.
 *
 * A grant stamped with `scopeModel >= SCOPE_MODEL` is used as stored. An
 * unmarked grant is a pre-BL-166 artifact, consented when no `tools/call`
 * checked any tool scope: whatever its stored tool scopes said, it could
 * call every tool, and radar too unless its tier was `trial` (the tier gate
 * refused that). So it keeps exactly that access: `tool:*`, plus
 * `tool:radar:*` unless trial. Only tools are restored; resource and prompt
 * scopes were already enforced (or ungated) and stay as stored.
 *
 * Permanent for as long as unmarked grants live (their props are encrypted
 * per token and cannot be rewritten in place); ADR-0041 records why.
 */
export function effectiveScopes(
  scopes: readonly string[],
  { scopeModel, tier }: { scopeModel?: unknown; tier?: string }
): readonly string[] {
  if (typeof scopeModel === 'number' && scopeModel >= SCOPE_MODEL) return scopes;
  const legacy = [SCOPES.TOOL_ALL, ...(tier === 'trial' ? [] : [SCOPES.TOOL_RADAR_ALL])];
  const missing = legacy.filter((s) => !scopes.includes(s));
  return missing.length === 0 ? scopes : [...scopes, ...missing];
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
