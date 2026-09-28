/**
 * Tier-scoped tool gate (BL-155 Slice 2b) — the pipeline seam where a
 * `trial` identity is refused the radar tools.
 *
 * Why a TIER check as well as a scope: since BL-166 (ADR-0041) radar is an
 * explicit scope — `tool:*` no longer covers `tool:radar:*` — and the tool-
 * scope gate (`tool-scope-gate.ts`) runs right after this one. But a trial
 * grant can still HOLD `tool:radar:*`: before BL-166, prefix matching let a
 * `tool:*` trial that asked for it at consent or `/token` be granted it, and
 * PRM `scopes_supported` advertises it. Those legacy grants live on until
 * revoked, so the scope gate alone would let them through. This tier deny is
 * unconditional — every trial-tier radar call is refused whatever its scopes
 * — which is what keeps the published trial "None" radar cells true (the
 * archived SELF_SERVE_TRIAL_BL-155.md § Slice 2 records the original design).
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
 * names `tool:radar:*` even when the caller holds it (a legacy trial) —
 * that is deliberate: it names the capability being withheld in the
 * vocabulary clients already parse, and the tool-scope gate names the same
 * scope for a non-trial caller without it.
 *
 * Placement: `handle-authenticated.ts` calls this BEFORE the tool-scope gate
 * and the limiter, so a
 * refused call consumes no radar-window token, and before the MCP handler,
 * so no SSE stream starts. Only `tools/call` bodies can be classed `radar`,
 * and those are plain JSON-RPC POSTs.
 *
 * Pure: no env, no I/O, no provider imports — unit-tested without mocks.
 */

import type { AuthSuccess } from '../auth/bearer';
import { MissingScopeError, SCOPES } from '../auth/scopes';
import { toolClassFor, type ToolCall } from '../dispatch/extract-tool-name';

export const TRIAL_TIER = 'trial';

/**
 * Returns the JSON-RPC refusal for a trial identity calling a radar tool,
 * or `null` when the request may proceed.
 */
export function trialRadarDenial(auth: AuthSuccess, call: ToolCall | null): Response | null {
  if (auth.tier !== TRIAL_TIER || !call || toolClassFor(call.name) !== 'radar') return null;
  const error = new MissingScopeError(SCOPES.TOOL_RADAR_ALL, auth.scopes).toJsonRpcError();
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: call.id, error }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
