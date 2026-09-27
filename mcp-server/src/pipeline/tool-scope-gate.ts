/**
 * Tool-scope gate (BL-166, ADR-0041) — the pipeline seam where a `tools/call`
 * is checked against the caller's tool scopes.
 *
 * Before this, no `tools/call` path checked a tool scope at all: a
 * `tool:search_portfolio` grant could call any tool, and `tool:*` reached the
 * radar tools by prefix. Now each call needs:
 *   - `tool:radar:<name>` for a radar tool (`RADAR_TOOLS`) — covered by
 *     `tool:radar:*` but NOT by `tool:*`, since radar is an explicit
 *     namespace in `hasScope`;
 *   - `tool:<name>` for every other tool — covered by `tool:*`.
 *
 * Runs AFTER the tier gate (`tier-gate.ts`), which is unchanged and still the
 * trial radar deny: a legacy trial grant can HOLD `tool:radar:*` (old prefix
 * matching let a trial that asked for it be granted it), so the scope check
 * alone would let it through. Runs BEFORE the limiter, so a refused call
 * consumes no rate-limit token, and before the MCP handler, so no stream
 * starts.
 *
 * Same response shape as the tier gate: HTTP 200 carrying a JSON-RPC `-32002`
 * from `MissingScopeError`, echoing the request id. `data.missingScope` is
 * `tool:radar:*` for a radar tool (the grant a client would ask for) and
 * `tool:<name>` otherwise. An unknown tool name called by a narrow grant is
 * refused as `tool:<name>` rather than reaching the SDK's unknown-tool error;
 * that is harmless and pinned by the unit tests.
 *
 * Pure: no env, no I/O, no provider imports — unit-tested without mocks.
 */

import type { AuthSuccess } from '../auth/bearer';
import { hasScope, MissingScopeError, SCOPES } from '../auth/scopes';
import { toolClassFor, type ToolCall } from '../dispatch/extract-tool-name';

/** The scope a call to `name` requires. */
export function requiredToolScope(name: string): string {
  return toolClassFor(name) === 'radar' ? `tool:radar:${name}` : `tool:${name}`;
}

/** The scope a refusal names: the grant a client would request to fix it. */
function missingScopeFor(name: string): string {
  return toolClassFor(name) === 'radar' ? SCOPES.TOOL_RADAR_ALL : `tool:${name}`;
}

/** A tool-scope refusal: the scope it names plus the JSON-RPC response. */
export interface ToolScopeDenial {
  readonly missingScope: string;
  readonly response: Response;
}

/**
 * Returns the refusal for a `tools/call` the caller's scopes do not cover, or
 * `null` when the request may proceed (including every non-`tools/call`).
 */
export function toolScopeDenial(auth: AuthSuccess, call: ToolCall | null): ToolScopeDenial | null {
  if (!call || hasScope(auth.scopes, requiredToolScope(call.name))) return null;
  const missingScope = missingScopeFor(call.name);
  const error = new MissingScopeError(missingScope, auth.scopes).toJsonRpcError();
  return {
    missingScope,
    response: new Response(JSON.stringify({ jsonrpc: '2.0', id: call.id, error }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  };
}
