/**
 * CORS allowlist for the MCP Worker (BL-032 Phase 2 — resolves Q5).
 *
 * MCP clients fall into two camps:
 *
 * 1. **Native apps** (Claude Desktop, Cursor, Claude Code CLI) — make
 *    direct fetches without an `Origin` header. CORS doesn't apply; we
 *    emit no `Access-Control-Allow-*` headers and let the browser-CORS
 *    machinery be a no-op.
 * 2. **Web-based clients** (claude.ai when wired to remote MCP, ChatGPT
 *    web when using its Connectors UI) — fire fetches from a webpage's
 *    JavaScript context with an `Origin` header. The browser blocks the
 *    response unless we explicitly allow that origin.
 *
 * The seed allowlist below was authored against publicly-documented
 * client origins. **Each row needs ground-truth verification** when its
 * client is actually pointed at production — load the client, observe
 * the `Origin` header in `wrangler tail`, confirm it matches. Update the
 * list + the audit-date below as new clients are verified.
 *
 * NEVER use `Access-Control-Allow-Origin: *` here — the BACKLOG explicitly
 * forbids it, and a wildcard would let any website read MCP responses on
 * a user's behalf.
 *
 * Audit date: 2026-08-03 (BL-106 — added the `Mcp-Method` / `Mcp-Name` request
 * headers required by protocol revision 2026-07-28; origin list unchanged since
 * 2026-05-17, BL-032.8 Phase 3). Origins:
 *   - https://claude.ai          — Claude.ai web UI with remote MCP connector
 *   - https://chatgpt.com        — ChatGPT web with MCP Connectors
 *   - https://cursor.sh          — Cursor (when used in browser mode; native CLI has no Origin)
 *   - https://globalstrategic.tech — GST website (Vercel) — primarily server-to-server
 *                                   SSR (no Origin header → CORS path no-op), but
 *                                   listed so any future client-side fetch from the
 *                                   website to /radar/snapshot has a viable path
 *   - https://www.globalstrategic.tech — Same; www-prefixed variant
 *
 * To add an origin: paste the new value into ALLOWED_ORIGINS, bump the
 * audit-date comment, and document the verification method in
 * [`ARCHITECTURE.md` § CORS (Q5)](../docs/ARCHITECTURE.md#cors-q5) — the
 * CORS contract lives there. (This pointer previously named `AUTH.md`,
 * which has no CORS section; corrected in BL-106.)
 */

const ALLOWED_ORIGINS: ReadonlySet<string> = new Set([
  'https://claude.ai',
  'https://chatgpt.com',
  'https://cursor.sh',
  'https://globalstrategic.tech',
  'https://www.globalstrategic.tech',
]);

/** Origin-aware CORS headers. Empty object when origin is null or disallowed. */
export function corsHeadersFor(origin: string | null): Record<string, string> {
  // No Origin → not a browser-initiated CORS request; emit no CORS headers.
  // (`Vary: Origin` is also unnecessary because there's no per-origin variation
  // to communicate to caches.)
  if (!origin) return {};

  // Disallowed origin → emit no Access-Control-Allow-* headers. The browser
  // will block the response. We DO NOT 4xx the request — the request itself
  // is valid; only the cross-origin read is denied. Native callers using a
  // disallowed origin string still get the response (their non-browser fetch
  // ignores the absence of CORS headers).
  if (!ALLOWED_ORIGINS.has(origin)) return { Vary: 'Origin' };

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    // `Mcp-Method` / `Mcp-Name` became REQUIRED on every Streamable HTTP POST
    // in protocol revision 2026-07-28 (SEP-2243), so a browser-based client on
    // that revision fails at the preflight without them — before any MCP
    // traffic flows. `Mcp-Session-Id` is retained for 2025-era clients.
    //
    // `Mcp-Param-*` (SEP-2243 custom headers) is deliberately ABSENT: CORS has
    // no wildcard-prefix form for Allow-Headers (the only wildcard is a bare
    // `*`, forbidden above), and those headers are emitted only for tools that
    // declare `x-mcp-header` in their inputSchema — which BL-106 declined. If a
    // tool ever adopts `x-mcp-header`, this list cannot express it and the
    // preflight must instead echo `Access-Control-Request-Headers`.
    'Access-Control-Allow-Headers':
      'Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Mcp-Method, Mcp-Name',
    'Access-Control-Expose-Headers': 'Mcp-Session-Id, Mcp-Protocol-Version, WWW-Authenticate',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/** True if this is a CORS preflight request. */
export function isPreflight(request: Request): boolean {
  return (
    request.method === 'OPTIONS' && request.headers.get('Access-Control-Request-Method') !== null
  );
}

/** Build the 204 response for a CORS preflight. */
export function preflightResponse(request: Request): Response {
  const origin = request.headers.get('Origin');
  return new Response(null, {
    status: 204,
    headers: corsHeadersFor(origin),
  });
}

/**
 * Return a copy of `response` with CORS headers added (or no-op if origin
 * is null / disallowed). Always constructs a new Response — Workers' Response
 * objects can have immutable headers in some code paths, so we don't mutate
 * `response.headers` in place.
 */
export function withCors(response: Response, origin: string | null): Response {
  const corsHeaders = corsHeadersFor(origin);
  if (Object.keys(corsHeaders).length === 0) return response;

  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    newHeaders.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

/** Exported for testing only. Do not import from runtime code. */
export const __ALLOWED_ORIGINS_FOR_TESTS = ALLOWED_ORIGINS;
