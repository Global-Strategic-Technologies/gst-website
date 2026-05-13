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
import { createLimiter } from './ratelimit/limiter';
import { tooManyRequestsResponse, withRateLimitHeaders } from './ratelimit/headers';
import { captureMessage, sentryOptions, tagRequest, withSentry } from './observability/sentry';
import { buildHealthPayload } from './observability/health';
import { refreshRadarSnapshot } from './cron/radar-refresh';

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

  // Upstash Redis — Q13 / Path 2 (two-database architecture).
  //   Inoreader DB:  Read-Only token; shared `inoreader:*` keys (OAuth tokens
  //                  written by the website). Storage-layer Q4 enforcement.
  //   MCP DB:        Standard token; Worker-owned `mcp:*` keys (rate-limit
  //                  counters, circuit breaker, health probe, status cache).
  // See src/lib/upstash-clients.ts for the helper factories that consume these.
  UPSTASH_INOREADER_REST_URL?: string;
  UPSTASH_INOREADER_REST_TOKEN?: string;
  UPSTASH_MCP_REST_URL?: string;
  UPSTASH_MCP_REST_TOKEN?: string;

  // Inoreader OAuth — copied from Vercel env. Worker reads tokens; website
  // remains sole refresh-writer (Q4 / Q13).
  INOREADER_APP_ID?: string;
  INOREADER_APP_KEY?: string;
  INOREADER_ACCESS_TOKEN?: string;
  INOREADER_REFRESH_TOKEN?: string;

  // BL-039: shared secret used to authenticate Worker → website
  // /api/inoreader/refresh POST calls. Same value bound on both sides
  // (wrangler secret put on Worker; Vercel env var on website). The Worker
  // only TRIGGERS refresh via this endpoint — the website remains the sole
  // refresh-writer (Q4 invariant preserved).
  INOREADER_REFRESH_SECRET?: string;

  // Sentry — new project for service:mcp-server (Q6).
  SENTRY_DSN?: string;

  // Build provenance — short SHA injected by `scripts/deploy.mjs` via
  // `wrangler deploy --var GIT_SHA:<sha>`. Surfaced on /health so operators
  // can verify which commit is running on the edge after a deploy.
  // Falls back to 'unknown' when missing (e.g., local `wrangler dev` runs).
  GIT_SHA?: string;

  // Sentry release identifier — injected by `scripts/deploy.mjs` via
  // `wrangler deploy --var SENTRY_RELEASE:<sha>`. Tells Sentry which
  // uploaded source-map bundle matches the running Worker so stack traces
  // resolve to original TypeScript instead of minified `dist/index.js`.
  // Matches GIT_SHA value by convention; separate Env field so the Sentry
  // SDK's `release` option reads from a Sentry-namespaced var.
  SENTRY_RELEASE?: string;

  // Forward-compat: any additional MCP_KEY_* secrets get matched by name.
  [key: string]: unknown;
}

// Note: from BL-032 Phase 4c forward, the MCP handler is built per-request
// rather than per-isolate. The radar-live tools (`search_radar`,
// `get_latest_insights`) capture `env` in handler closures so they can read
// Inoreader credentials and check the circuit breaker. Worker isolates can
// process multiple concurrent requests, so per-request `createServer(env)`
// is the safe pattern. Construction cost is sub-millisecond (registry
// assembly only — no I/O).

const handler: ExportedHandler<Env> = {
  /**
   * Hourly Cron handler (BL-032.5 Phase 4). Refreshes the Upstash radar
   * snapshot cache so MCP Resource consumers see snapshots that are at
   * most 60 minutes stale, independent of read traffic. Budget guards
   * (circuit breaker + daily soft cap) live inside `refreshRadarSnapshot`;
   * we just delegate here. The scheduled handler has no response surface
   * — return value is ignored by Cloudflare.
   */
  async scheduled(_event, env, ctx): Promise<void> {
    ctx.waitUntil(refreshRadarSnapshot(env));
  },

  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    // 1. CORS preflight — never authenticated; never logged (high-volume noise).
    if (isPreflight(request)) {
      return preflightResponse(request);
    }

    // 2. Health endpoint — no auth required, but does emit CORS headers so
    //    browser-based clients can probe it before attempting an MCP handshake.
    //    Phase 5: returns the BACKLOG-specified shape with cached
    //    Inoreader-status (never burns budget — Q8) + Upstash reachability probe.
    if (url.pathname === '/health' && request.method === 'GET') {
      const payload = await buildHealthPayload(env);
      return withCors(Response.json(payload), origin);
    }

    // 3. Bearer-token authentication — every non-health, non-preflight path.
    const auth = authenticate(request, env);
    if (!auth.ok) {
      safeLog({
        event: 'auth.failed',
        path: url.pathname,
        status: auth.status,
        reason: 'bearer-rejected',
        success: false,
        errorCode: 'unauthorized',
      });
      // Sentry breadcrumb so SENTRY_MANUAL_SETUP.md Alert #2 fires.
      // Message intentionally stable so Sentry groups all auth.failed
      // events together — a probing burst becomes one issue, not N.
      // `eventTag: 'auth.failed'` mirrors safeLog's `event` field so
      // alert rules can filter via tag (`The event's tag {event} equals
      // {auth.failed}`) instead of message-content match.
      captureMessage(
        'auth.failed bearer-rejected',
        'warning',
        {
          path: url.pathname,
          status: auth.status,
        },
        'auth.failed'
      );
      return withCors(authFailureResponse(auth), origin);
    }

    // Tag the Sentry scope with keyOwner + path. No-op when SENTRY_DSN
    // isn't bound; per-request scope so tags only attach to THIS request's
    // events.
    tagRequest(auth.keyOwner, url.pathname);

    // 4. Per-key rate limit (Phase 3). Sliding-window check via Upstash;
    //    null → graceful skip (Upstash creds not bound — fail open with a
    //    warning). Phase 4 adds a stricter parallel bucket for radar tools.
    const limiter = createLimiter(env);
    let rlResult = null;
    if (limiter) {
      rlResult = await limiter.check(auth.keyOwner);
      if (!rlResult.allowed) {
        safeLog({
          event: 'ratelimit.exceeded',
          keyOwner: auth.keyOwner,
          path: url.pathname,
          status: 429,
          reason: `tier=${rlResult.tier}`,
          success: false,
          errorCode: 'rate-limit',
        });
        return withCors(tooManyRequestsResponse(rlResult), origin);
      }
    } else {
      safeLog({
        event: 'ratelimit.skipped',
        keyOwner: auth.keyOwner,
        path: url.pathname,
        reason: 'upstash-not-bound',
      });
    }

    // 5. Authenticated + within rate limit — log + delegate to MCP handler.
    //    Wall-clock timing recorded via durationMs for Phase 5 observability.
    //    Tool-name extraction at the Worker boundary requires request.clone()
    //    + JSON-RPC parse; deferred to BL-032.75 maturity work.
    const startedAt = Date.now();

    // Build the MCP handler per-request — radar-live tools (Phase 4c) capture
    // `env` in their closures for circuit-breaker checks + Inoreader fetches.
    // BL-032.5 Phase 3: pass `scopes` from the auth result so scope-gated
    // handlers (radar Resources) can assertScope at the top of their bodies,
    // and `radarSource: 'worker'` so radar Resources register with the
    // Upstash-backed reader (the stdio reader uses node:fs and isn't bundled
    // for the Worker).
    const mcp = createMcpHandler(createServer(env, { scopes: auth.scopes, radarSource: 'worker' }));
    const response = await mcp(request, env, ctx);
    const durationMs = Date.now() - startedAt;

    safeLog({
      event: 'mcp.request',
      keyOwner: auth.keyOwner,
      path: url.pathname,
      status: response.status,
      durationMs,
      success: response.status < 400,
    });

    const withRl = rlResult ? withRateLimitHeaders(response, rlResult) : response;
    return withCors(withRl, origin);
  },
};

// Wrap the handler with Sentry. Returns the same ExportedHandler shape;
// when SENTRY_DSN isn't bound, sentryOptions returns undefined and
// withSentry passes through to the underlying handler unchanged.
export default withSentry(sentryOptions, handler);
