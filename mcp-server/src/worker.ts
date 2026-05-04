/// <reference types="@cloudflare/workers-types" />

/**
 * Cloudflare Worker entrypoint for the GST MCP server (BL-032 Phase 1).
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
 * Phase 1 scope: minimal `/health` stub + delegation to MCP handler.
 * Phase 2 (auth) wraps this in a bearer-token middleware. Phase 3
 * (rate-limit) chains an Upstash sliding-window check before the MCP
 * handler runs. Phase 5 (observability) replaces the health stub with
 * a real Redis + Inoreader-state liveness check.
 *
 * Full design + per-phase plan: src/docs/development/MCP_SERVER_REMOTE_BL-032.md
 */

import { createMcpHandler } from 'agents/mcp';
import { createServer } from './server';

// Phase 1 placeholder Env shape. Phase 2-5 add typed bindings; Phase 6 wires
// secrets via `wrangler secret put` per `wrangler.toml`.
export interface Env {
  MCP_KEY_RP?: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  INOREADER_APP_ID?: string;
  INOREADER_APP_KEY?: string;
  INOREADER_ACCESS_TOKEN?: string;
  INOREADER_REFRESH_TOKEN?: string;
  SENTRY_DSN?: string;
}

// The MCP handler is created once per Worker isolate (the registry is
// stateless — every tool call is a pure function of its inputs). Each
// inbound request shares the same `McpServer` instance.
const mcp = createMcpHandler(createServer());

const handler: ExportedHandler<Env> = {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);

    // Phase 1: minimal health stub — uncached, no auth.
    // Phase 5 replaces this with the BACKLOG-specified shape:
    //   { ok, version, gitSha, redis: 'ok'|'degraded', inoreader: 'ok'|'degraded' }
    if (url.pathname === '/health' && request.method === 'GET') {
      return Response.json({
        ok: true,
        phase: 'BL-032 Phase 1 (transport spike)',
        version: '0.0.1',
      });
    }

    // Default MCP route is /mcp. Phase 2 wraps this in bearer-token middleware;
    // Phase 3 chains rate-limit + circuit-breaker checks before delegation.
    return mcp(request, env, ctx);
  },
};

export default handler;
