/// <reference types="@cloudflare/workers-types" />

/**
 * Cloudflare Worker entrypoint for the GST MCP server.
 *
 * Architecture: register-once-transport-twice. The `createServer()` factory
 * in `./server.ts` is the single source of truth for the transport-portable
 * tool / resource / prompt registry. The stdio entrypoint (`./index.ts`)
 * additionally calls `registerLocalOnlyTools(server)` to add the offline
 * radar tool + radar Resources (Node-only via radar-snapshot.ts — see
 * BL-032 Q12). This Worker entrypoint never touches those.
 *
 * Streamable HTTP transport is provided by Cloudflare's `agents/mcp`
 * package — `createMcpHandler` adapts an `McpServer` instance to the
 * Worker's Web `Request` / `Response` runtime. Default route is `/mcp`.
 *
 * Request flow (post-Phase-2):
 *   CORS preflight? → 204 with allowed-origin headers
 *   GET /health     → uncached, no auth (Phase 1 stub; Phase 5 replaces with
 *                     real Redis + Inoreader-state liveness check)
 *   ALL other       → bearer-auth (Phase 2) → MCP handler (Phase 1)
 *                     → response wrapped with CORS headers
 *
 * Phase 3 inserts a rate-limiter + Inoreader circuit-breaker between the
 * bearer-auth check and the MCP handler. Phase 5 wires Sentry + structured
 * logs at the boundary.
 *
 * Full design + per-phase plan: src/docs/development/MCP_SERVER_REMOTE_BL-032.md
 */

import { createMcpHandler } from 'agents/mcp';
import { createServer } from './server';
import { authenticate, authFailureResponse } from './auth/bearer';
import { isPreflight, preflightResponse, withCors } from './auth/cors';
import { safeLog } from './auth/safe-logger';

/**
 * Worker environment bindings.
 *
 * `MCP_KEY_<INITIALS>` secrets enumerate at runtime (see auth/bearer.ts) — the
 * `[key: string]: unknown` index signature lets the bearer module iterate any
 * additional `MCP_KEY_*` entries without requiring a typed declaration here.
 * Wrangler-issued secrets that are NOT bearer keys (Upstash, Inoreader,
 * Sentry) carry the typed declarations below.
 */
export interface Env {
  // Bearer keys — one per team member; enumerated at runtime via Object.entries
  // so this list doesn't need updating when a new MCP_KEY_<INITIALS> ships.
  // Listed explicitly only for the soak-week initial roster (Q11/Q13 — just RP).
  MCP_KEY_RP?: string;

  // Upstash Redis — Q13. Worker uses these to read shared `inoreader:*` keys
  // (read-only) and to own `mcp:*` keys (rate-limit counters, etc.). Phase 3
  // is when these get instantiated.
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;

  // Inoreader OAuth — copied from Vercel env. Worker reads tokens; website
  // remains sole refresh-writer (Q4 / Q13).
  INOREADER_APP_ID?: string;
  INOREADER_APP_KEY?: string;
  INOREADER_ACCESS_TOKEN?: string;
  INOREADER_REFRESH_TOKEN?: string;

  // Sentry — new project for service:mcp-server (Q6).
  SENTRY_DSN?: string;

  // Forward-compat: any additional MCP_KEY_* secrets get matched by name.
  [key: string]: unknown;
}

// The MCP handler is created once per Worker isolate (the registry is
// stateless — every tool call is a pure function of its inputs). Each
// inbound request shares the same `McpServer` instance.
const mcp = createMcpHandler(createServer());

const handler: ExportedHandler<Env> = {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    // 1. CORS preflight — never authenticated; never logged (high-volume noise).
    if (isPreflight(request)) {
      return preflightResponse(request);
    }

    // 2. Health endpoint — no auth required, but does emit CORS headers so
    //    browser-based clients can probe it before attempting an MCP handshake.
    if (url.pathname === '/health' && request.method === 'GET') {
      const body = JSON.stringify({
        ok: true,
        phase: 'BL-032 Phase 2 (auth + CORS)',
        version: '0.0.1',
      });
      return withCors(
        new Response(body, { headers: { 'Content-Type': 'application/json' } }),
        origin
      );
    }

    // 3. Bearer-token authentication — every non-health, non-preflight path.
    const auth = authenticate(request, env);
    if (!auth.ok) {
      safeLog({
        event: 'auth.failed',
        path: url.pathname,
        status: auth.status,
        reason: 'bearer-rejected',
      });
      return withCors(authFailureResponse(auth), origin);
    }

    // 4. Authenticated — log + delegate to MCP handler. Phase 3 inserts the
    //    rate-limiter check here. Phase 5 adds tool-name + duration to the log.
    safeLog({
      event: 'mcp.request',
      keyOwner: auth.keyOwner,
      path: url.pathname,
    });

    const response = await mcp(request, env, ctx);
    return withCors(response, origin);
  },
};

export default handler;
