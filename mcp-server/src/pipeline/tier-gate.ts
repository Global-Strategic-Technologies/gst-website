/**
 * Tier-scoped tool gate (BL-155 Slice 2b) — the pipeline seam where a
 * `trial` identity is refused the radar tools.
 *
 * Why a TIER check and not a scope: `hasScope` matches by prefix, so the
 * `tool:*` every client holds already covers `tool:radar:search_radar`. A
 * scope assertion inside the radar tools would be satisfied by every trial
 * grant and contain nothing (SELF_SERVE_TRIAL_BL-155.md § Slice 2 records
 * the two rejected mechanisms). Until a per-tool scope catalog exists, the
 * tier is the only signal that distinguishes a trial from a pilot.
 *
 * Why it matters: radar is the Inoreader-funded product the operator gates
 * commercially. Handing strangers free radar is a pricing decision made by
 * accident, not a cost incident (radar calls are ~99% cache hits — see
 * `ratelimit/tiers.ts`).
 *
 * Why JSON-RPC and not HTTP 403: the caller is an MCP client mid
 * `tools/call`. A transport-level 403 reads as a broken connection; a
 * `-32002` error with `missingScope` is the same legible refusal the radar
 * Resource already emits via `MissingScopeError`. The `data.missingScope`
 * names `tool:radar:*` while the caller may hold `tool:*` — that is
 * deliberate: it names the capability being withheld in the vocabulary
 * clients already parse, not a scope they could request.
 *
 * Placement: `handle-authenticated.ts` calls this BEFORE the limiter, so a
 * refused call consumes no radar-window token, and before the MCP handler,
 * so no SSE stream starts. Only `tools/call` bodies can be classed `radar`,
 * and those are plain JSON-RPC POSTs.
 *
 * Pure: no env, no I/O, no provider imports — unit-tested without mocks.
 */

import type { AuthSuccess } from '../auth/bearer';
import { MissingScopeError } from '../auth/scopes';
import { toolClassFor, type ToolCall } from '../dispatch/extract-tool-name';

export const TRIAL_TIER = 'trial';
const RADAR_TOOL_SCOPE = 'tool:radar:*';

/**
 * Returns the JSON-RPC refusal for a trial identity calling a radar tool,
 * or `null` when the request may proceed.
 */
export function trialRadarDenial(auth: AuthSuccess, call: ToolCall | null): Response | null {
  if (auth.tier !== TRIAL_TIER || !call || toolClassFor(call.name) !== 'radar') return null;
  const error = new MissingScopeError(RADAR_TOOL_SCOPE, auth.scopes).toJsonRpcError();
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: call.id, error }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
