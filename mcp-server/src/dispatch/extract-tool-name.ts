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
