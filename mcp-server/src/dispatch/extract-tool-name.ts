/**
 * BL-038 — Worker-boundary tool-name extraction for rate-limit dispatch.
 *
 * Reads the JSON-RPC request body and returns the tool name for
 * `tools/call` requests so the rate-limiter can pick the right tier
 * (`'general'` vs `'radar'`). Every other path — `tools/list`, non-JSON,
 * empty body, missing fields, malformed `params` — returns `null` so
 * the caller fail-safes to `'general'` (the broader bucket).
 *
 * Uses `request.clone()` so the original body remains intact for the
 * downstream MCP handler. The clone is cheap; the JSON parse is sub-
 * millisecond on a typical 200-byte MCP request body.
 *
 * BL-038 introduced it for the rate-limit gate (tool-aware radar bucket).
 */

interface JsonRpcRequest {
  readonly id?: unknown;
  readonly method?: string;
  readonly params?: { readonly name?: unknown };
}

/** A parsed `tools/call`: the tool name plus the JSON-RPC request id. */
export interface ToolCall {
  readonly name: string;
  /** Echoed back on a boundary-emitted JSON-RPC error; `null` when absent. */
  readonly id: string | number | null;
}

/**
 * BL-106 — why this still parses the body rather than reading `Mcp-Name`.
 *
 * Protocol revision `2026-07-28` mirrors `params.name` into an `Mcp-Name`
 * header (SEP-2243), which looks like a free replacement for the clone-and-
 * parse below. It is not, for THIS gate.
 *
 * The SDK does cross-check the header against the body and rejects a mismatch
 * with `-32020` — but that happens inside the handler, downstream of the
 * rate-limit decision made from this value. And the header is allowed to carry
 * a base64 sentinel form (`=?base64?…?=`), which the SDK decodes before
 * comparing. A naive header read would therefore see an encoded `search_radar`
 * as an opaque string, miss `RADAR_TOOLS`, and fall through to `'general'` —
 * bypassing the stricter bucket that protects the shared Inoreader budget,
 * for a request the SDK then happily executes.
 *
 * The header's real value is at the EDGE: Cloudflare rules can route and meter
 * per-tool without parsing a body, which is a different layer from this
 * in-Worker gate. Replacing the parse here would trade a correct check for a
 * bypassable one and save a sub-millisecond clone. Left as-is deliberately.
 */
export async function extractToolName(request: Request): Promise<string | null> {
  return (await extractToolCall(request))?.name ?? null;
}

/**
 * BL-155 Slice 2b — the same parse, keeping the request `id` as well, so a
 * boundary refusal (`pipeline/tier-gate.ts`) can be framed as a JSON-RPC
 * error that the client correlates to its call. `extractToolName` delegates
 * here; its contract is unchanged.
 */
export async function extractToolCall(request: Request): Promise<ToolCall | null> {
  return (await inspectToolCalls(request)).call;
}

/** What the boundary gates need from one body parse. */
export interface ToolCallInspection {
  /** The single-object `tools/call`, or `null` (see `extractToolCall`). */
  readonly call: ToolCall | null;
  /**
   * BL-166 — `true` when the body is a JSON-RPC batch ARRAY holding at least
   * one `tools/call`. `call` is always `null` for an array, so without this
   * flag a batched call would slip past the tier gate, the scope gate and the
   * radar rate bucket (the SDK's legacy lane accepts batches).
   */
  readonly batchedToolCall: boolean;
}

/**
 * BL-166 — one clone-and-parse that answers both boundary questions: the
 * single `tools/call` (unchanged `extractToolCall` semantics) and whether the
 * body is a batch containing a `tools/call`, which the pipeline refuses.
 * Kept as a separate field rather than a widened `ToolCall`, so every
 * existing `ToolCall` consumer keeps its exact shape.
 */
export async function inspectToolCalls(request: Request): Promise<ToolCallInspection> {
  const none: ToolCallInspection = { call: null, batchedToolCall: false };
  let bodyText: string;
  try {
    bodyText = await request.clone().text();
  } catch {
    return none;
  }
  if (!bodyText) return none;

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return none;
  }

  if (Array.isArray(parsed)) {
    const batchedToolCall = parsed.some(
      (m) => typeof m === 'object' && m !== null && (m as JsonRpcRequest).method === 'tools/call'
    );
    return { call: null, batchedToolCall };
  }
  if (typeof parsed !== 'object' || parsed === null) return none;

  const message = parsed as JsonRpcRequest;
  if (message.method !== 'tools/call') return none;
  const name = message.params?.name;
  if (typeof name !== 'string') return none;
  const id = message.id;
  return {
    call: { name, id: typeof id === 'string' || typeof id === 'number' ? id : null },
    batchedToolCall: false,
  };
}

/**
 * Tools that consume from the BL-038 stricter radar buckets in addition
 * to the general buckets. Lookup is O(1); extending this Set is the only
 * source-of-truth change required to add a new radar tool to the dispatch.
 *
 * See design doc § Open Q1 for the future-extensibility trade-off around
 * moving this onto the tool-registration object instead.
 */
export const RADAR_TOOLS: ReadonlySet<string> = new Set(['search_radar', 'get_latest_insights']);

/**
 * Resolve a tool name to a rate-limit tool class. Fail-safe: `null` (no
 * tool name extractable) maps to `'general'` so we never gate radar tools
 * more loosely than intended, but we also never block a non-tools/call
 * request through the radar bucket by mistake.
 */
export function toolClassFor(toolName: string | null): 'general' | 'radar' {
  return toolName !== null && RADAR_TOOLS.has(toolName) ? 'radar' : 'general';
}
