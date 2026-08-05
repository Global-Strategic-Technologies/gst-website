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
 * The deferred-work comment at `worker.ts:573-574` referenced this
 * extraction. BL-038 brings it forward for the rate-limit gate; the
 * broader safeLog tagging it once also covered remains for BL-032.75.
 */

interface JsonRpcRequest {
  readonly method?: string;
  readonly params?: { readonly name?: unknown };
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
  let bodyText: string;
  try {
    bodyText = await request.clone().text();
  } catch {
    return null;
  }
  if (!bodyText) return null;

  let parsed: JsonRpcRequest;
  try {
    parsed = JSON.parse(bodyText) as JsonRpcRequest;
  } catch {
    return null;
  }

  if (parsed.method !== 'tools/call') return null;
  const name = parsed.params?.name;
  return typeof name === 'string' ? name : null;
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
