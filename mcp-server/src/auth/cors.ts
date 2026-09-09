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
 * Audit date: 2026-09-07 (BL-155 Slice 2 — added the STAGING-ONLY extra-origin
 * list for the trial signup endpoint, see `corsHeadersForEnv`; production origin
 * list unchanged since 2026-05-17, BL-032.8 Phase 3; request headers since
 * 2026-08-03, BL-106). Origins:
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

import { safeLog } from './safe-logger';

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

/**
 * BL-155 Slice 2 — staging-only extra origins for the trial signup form,
 * which is served from Vercel previews and `localhost` while Slice 3 is
 * built. Read from `TRIAL_EXTRA_ORIGINS` (comma-separated) and honoured
 * ONLY when `ENV_NAME === 'staging'`; production's set above is untouched.
 *
 * Entries are exact origins, or ONE-LABEL suffix patterns written as
 * `*-<team>.vercel.app` (Vercel preview hosts are a single label, so the
 * suffix must include the team slug). Residual: the match is a plain suffix,
 * so a foreign team whose slug happens to END in `-<team>` (`x-<team>`) also
 * passes — accepted because the list is staging-only and the endpoint is
 * reachable without a browser anyway. A bare `*.vercel.app` — or any pattern
 * whose suffix begins with `.` — would let every Vercel-hosted site drive the
 * staging mint and read the credential, so it is rejected at parse and
 * logged, never honoured. `*` alone is a wildcard and forbidden above.
 */
export function parseExtraOrigins(env: EnvLike): { exact: Set<string>; suffixes: string[] } {
  const exact = new Set<string>();
  const suffixes: string[] = [];
  if (env.ENV_NAME !== 'staging' || typeof env.TRIAL_EXTRA_ORIGINS !== 'string') {
    return { exact, suffixes };
  }
  for (const raw of env.TRIAL_EXTRA_ORIGINS.split(',')) {
    const entry = raw.trim();
    if (!entry) continue;
    if (entry.includes('*')) {
      // Must be `https://*-something.tld`-shaped: https, the `*` followed by
      // `-` (same label), never `*.` (would match any subdomain) or a bare `*`.
      if (!/^https:\/\/\*-[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(entry)) {
        rejectedExtraOrigin(entry);
        continue;
      }
      suffixes.push(entry.slice('https://*'.length).toLowerCase());
    } else if (/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(entry)) {
      exact.add(entry);
    } else {
      rejectedExtraOrigin(entry);
    }
  }
  return { exact, suffixes };
}

function rejectedExtraOrigin(entry: string): void {
  // Operator misconfiguration, surfaced in `wrangler tail`; the entry is
  // config, not user input, so echoing (a bounded prefix of) it is safe.
  safeLog({ event: 'cors.extra-origin-rejected', reason: entry.slice(0, 80), success: false });
}

/** The subset of `Env` this module reads; structural so tests need no full Env. */
export interface EnvLike {
  ENV_NAME?: string;
  TRIAL_EXTRA_ORIGINS?: string;
}

function extraOriginAllowed(origin: string, env: EnvLike): boolean {
  const { exact, suffixes } = parseExtraOrigins(env);
  if (exact.has(origin)) return true;
  if (!origin.startsWith('https://')) return false;
  const host = origin.slice('https://'.length);
  return suffixes.some((s) => host.endsWith(s) && host.length > s.length && !host.includes('/'));
}

/**
 * Env-aware CORS headers: `corsHeadersFor` plus the staging extra-origin list.
 * Used by the preflight branch and the trial signup branch ONLY — every
 * authenticated path keeps `corsHeadersFor` / `withCors` unchanged.
 */
export function corsHeadersForEnv(origin: string | null, env: EnvLike): Record<string, string> {
  if (!origin) return {};
  if (ALLOWED_ORIGINS.has(origin)) return corsHeadersFor(origin);
  if (extraOriginAllowed(origin, env)) {
    // Same header set as an allowlisted origin, echoing this one.
    return { ...corsHeadersFor([...ALLOWED_ORIGINS][0]!), 'Access-Control-Allow-Origin': origin };
  }
  return { Vary: 'Origin' };
}

/** True if this is a CORS preflight request. */
export function isPreflight(request: Request): boolean {
  return (
    request.method === 'OPTIONS' && request.headers.get('Access-Control-Request-Method') !== null
  );
}

/** Build the 204 response for a CORS preflight. */
export function preflightResponse(request: Request, env: EnvLike = {}): Response {
  const origin = request.headers.get('Origin');
  return new Response(null, {
    status: 204,
    headers: corsHeadersForEnv(origin, env),
  });
}

/** `withCors` for the trial signup branch — honours the staging extra origins. */
export function withTrialCors(response: Response, origin: string | null, env: EnvLike): Response {
  return applyHeaders(response, corsHeadersForEnv(origin, env));
}

/**
 * Return a copy of `response` with CORS headers added (or no-op if origin
 * is null / disallowed). Always constructs a new Response — Workers' Response
 * objects can have immutable headers in some code paths, so we don't mutate
 * `response.headers` in place.
 */
export function withCors(response: Response, origin: string | null): Response {
  return applyHeaders(response, corsHeadersFor(origin));
}

function applyHeaders(response: Response, corsHeaders: Record<string, string>): Response {
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
