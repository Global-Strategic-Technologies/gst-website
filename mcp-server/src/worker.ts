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
import { authenticate, authFailureResponse, shouldCaptureAuthFailure } from './auth/bearer';
import { isPreflight, preflightResponse, withCors } from './auth/cors';
import { safeLog } from './auth/safe-logger';
import { hasScope } from './auth/scopes';
import { createLimiter } from './ratelimit/limiter';
import { tooManyRequestsResponse, withRateLimitHeaders } from './ratelimit/headers';
import {
  captureException,
  captureMessage,
  flushSentry,
  sentryOptions,
  tagRequest,
  withMonitor,
  withSentry,
} from './observability/sentry';
import { buildHealthPayload } from './observability/health';
import { refreshRadarSnapshot } from './cron/radar-refresh';
import { readWireLive, readFyiLive } from './content/radar-live-store';

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

  // BL-032.8 Phase 3 — narrow-scope bearer for the website's `/hub/radar`
  // SSR consumer. Carries only `resource:radar:read` via the companion
  // `MCP_KEY_WEBSITE_RADAR_SCOPES` env var (JSON-encoded scope array, per
  // bearer.ts:120 contract). Same key-discovery loop as the full MCP keys;
  // the scope subset narrows the grant. See:
  // src/docs/development/MCP_SERVER_RADAR_UNIFICATION_BL-032_8.md § Phase 3
  MCP_KEY_WEBSITE_RADAR?: string;
  MCP_KEY_WEBSITE_RADAR_SCOPES?: string;

  // Upstash Redis — single MCP DB (post-BL-032.8 Phase B). All Inoreader-related
  // state (OAuth tokens, rate-limit counters, circuit breaker, status cache,
  // radar caches) lives under the `mcp:*` namespace in this database. The
  // historical website-shared "Inoreader DB" (`inoreader:*` keys, Read-Only
  // token, `UPSTASH_INOREADER_REST_*` bindings) was retired in Phase B
  // alongside the website's direct Inoreader client. See upstash-clients.ts.
  UPSTASH_MCP_REST_URL?: string;
  UPSTASH_MCP_REST_TOKEN?: string;

  // Inoreader OAuth — Worker is sole refresh-writer post-BL-032.8 Phase B.
  // `INOREADER_APP_ID` + `INOREADER_APP_KEY` identify the registered Inoreader
  // app to the OAuth endpoint. `INOREADER_ACCESS_TOKEN` /
  // `INOREADER_REFRESH_TOKEN` are env-var fallbacks for the Upstash-stored
  // tokens (read priority: `mcp:inoreader:*` MCP DB → these env vars).
  // See `inoreader-token-store.ts` for the read cascade.
  INOREADER_APP_ID?: string;
  INOREADER_APP_KEY?: string;
  INOREADER_ACCESS_TOKEN?: string;
  INOREADER_REFRESH_TOKEN?: string;

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

/**
 * Path-matching predicate for the routed-paths allowlist. Anything that
 * doesn't return true here gets a 404 before the auth path runs (see the
 * fetch handler step 3 comment for rationale + Sentry-noise impact).
 *
 *   - `/mcp`             — exact + sub-paths: `agents/mcp`'s
 *                          `createMcpHandler` serves the JSON-RPC endpoint
 *                          at `/mcp` and may use sub-paths for session
 *                          resume. Prefix match keeps that surface intact.
 *   - `/radar/snapshot`  — exact: single GET endpoint, no sub-paths.
 *   - `/health`          — handled before this check; included here only
 *                          for documentation completeness (the predicate
 *                          isn't consulted for `/health` requests).
 */
function isRoutedPath(pathname: string): boolean {
  if (pathname === '/mcp' || pathname.startsWith('/mcp/')) return true;
  if (pathname === '/radar/snapshot') return true;
  return false;
}

// Exported for direct unit-testing of the scheduled handler's error-capture
// path (see `tests/unit/worker-scheduled.test.ts`). The default export
// remains the canonical wrangler entrypoint (withSentry-wrapped, below).
export const handler: ExportedHandler<Env> = {
  /**
   * Cron handler — refreshes the Upstash radar snapshot cache every 6h so
   * MCP Resource consumers see snapshots that are at most ~6h stale,
   * independent of read traffic. Budget guards (circuit breaker + daily
   * soft cap) live inside `refreshRadarSnapshot`; we just delegate here.
   * The scheduled handler has no response surface — return value is
   * ignored by Cloudflare.
   *
   * **Three-layer Sentry instrumentation** (mirrors Sentry's reference
   * `instrumentCron` pattern; verified against `@sentry/node-core/src/
   * cron/cron.ts`):
   *
   *   1. `withMonitor('radar-refresh', …)` — sends `in_progress` / `ok`
   *      / `error` check-ins to Sentry Crons. Auto-creates the monitor
   *      on first check-in via `upsertMonitorConfig` (the `schedule`
   *      field). Sentry surfaces missed firings + sustained-failure
   *      alerts on its Crons dashboard.
   *   2. **Outer `try/catch`** — `withMonitor` re-throws on callback
   *      rejection (it only marks the check-in; it does NOT call
   *      `captureException`). Without an outer catch, the rejection
   *      escapes `ctx.waitUntil` and Cloudflare reports
   *      `outcome: exception` with zero Sentry signal. The catch calls
   *      `captureException` for the stack trace and then swallows so
   *      `ctx.waitUntil`'s promise resolves cleanly.
   *   3. **`finally { await flushSentry() }`** — `withSentry` auto-
   *      flushes for the fetch handler (anchored on the Response), but
   *      the scheduled handler has no Response. Without an explicit
   *      flush, in-flight Sentry POSTs get killed mid-flight when
   *      Cloudflare reclaims the isolate. Observed dropping ~75% of
   *      cron capture during BL-032.8 Phase B soak Day 3 (commit
   *      4680028, 2026-05-19) — that fix landed the flush; this fix
   *      lands the catch.
   *
   * Bug history (resolves 2026-05-25 incident): Cloudflare dashboard
   * showed 13 cron `outcome: exception` events in 24h. Sentry's Issues
   * view showed zero corresponding events. Root cause: the prior shape
   * had `try { … } finally { … }` with no `catch` clause — exceptions
   * thrown by `refreshRadarSnapshot` propagated past the IIFE, past
   * `ctx.waitUntil`'s promise, into Cloudflare's runtime. The `finally`
   * ran flushSentry but the SDK queue was empty (no capture had been
   * made), so Sentry never saw the error. See
   * `mcp-server/BREAKING_CHANGES.md` 0.3.12 for full context.
   */
  async scheduled(event, env, ctx): Promise<void> {
    ctx.waitUntil(
      (async () => {
        // Outer safety net: every observability call (captureException,
        // flushSentry, even withMonitor's internal Sentry HTTP traffic)
        // can throw under SDK-internal errors, network blips reaching
        // Sentry ingest, or quota rejections. The original v0.3.12 fix
        // caught `refreshRadarSnapshot` rejections but left these Sentry-
        // plumbing throws unguarded — Cloudflare's cron dashboard
        // continued to report `exception` even on firings where the
        // radar work succeeded (verified 2026-05-25 18:00 UTC: /health
        // confirmed inoreaderObservedAt updated, Cloudflare still
        // reported Error). Wrapping the whole IIFE body guarantees
        // ctx.waitUntil sees a clean resolution regardless of which
        // sub-system fails. The inner try/catch/finally still does the
        // useful capture-and-flush work on the happy path.
        try {
          try {
            // Sentry Crons check-in + monitor auto-upsert. The cron
            // expression here MUST match wrangler.toml's `[triggers]
            // crons` entry — `event.cron` is the runtime source of
            // truth so a wrangler.toml edit doesn't silently desync.
            await withMonitor('radar-refresh', () => refreshRadarSnapshot(env), {
              schedule: { type: 'crontab', value: event.cron },
              checkinMargin: 5,
              maxRuntime: 10,
              timezone: 'UTC',
            });
          } catch (err) {
            // `withMonitor` marked the check-in `error` and re-threw.
            // Capture so the stack trace reaches Sentry; swallow so
            // ctx.waitUntil resolves cleanly.
            captureException(err, { source: 'cron.scheduled', cron: event.cron });
          } finally {
            await flushSentry();
          }
        } catch {
          // Belt-and-suspenders. Anything escaping the inner structured
          // cleanup (Sentry SDK internal throw, ingest rejection, flush
          // timeout that rejects rather than resolves false) lands here
          // and is intentionally dropped — there is no further recovery
          // and the radar work either succeeded (visible via /health)
          // or was already captured by the inner catch.
        }
      })()
    );
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

    // 3. Known-route allowlist — anything we don't actually serve gets a
    //    404 before the auth path runs. This kills bot-probe noise
    //    (`/favicon.ico`, `/.env`, `/wp-admin`, `/robots.txt`, etc.) at
    //    the source: no auth attempt, no `auth.failed` Sentry event, no
    //    quota burn. Cloudflare's edge already filters most scanner
    //    traffic; this catches what gets through.
    //
    //    The /mcp path is matched by prefix because the underlying
    //    `agents/mcp` handler may serve sub-paths (e.g. session resume).
    //    /radar/snapshot is exact-match because it's a single endpoint.
    if (!isRoutedPath(url.pathname)) {
      // No safeLog for 404s either — high-volume, low-signal. If we ever
      // need to investigate scanner traffic, Cloudflare's request-log
      // surface (Logpush / Analytics) is the right tool, not Sentry.
      return withCors(new Response('Not Found', { status: 404 }), origin);
    }

    // 4. Bearer-token authentication — every routed, non-health, non-preflight path.
    const auth = authenticate(request, env);
    if (!auth.ok) {
      safeLog({
        event: 'auth.failed',
        path: url.pathname,
        status: auth.status,
        reason: 'bearer-rejected',
        authFailureReason: auth.reason,
        success: false,
        errorCode: 'unauthorized',
      });
      // Sentry capture only for actionable failures — a missing or
      // empty bearer is probe-class behavior (real clients always send
      // one). An `invalid-token` (bearer sent but no key match) or a
      // `malformed-scopes` operator config error IS actionable. See
      // bearer.ts § shouldCaptureAuthFailure for the policy + rationale.
      //
      // Forensics are preserved either way — safeLog above writes a
      // structured line for every 401 that's tailable via `wrangler tail`.
      if (shouldCaptureAuthFailure(auth.reason)) {
        // Message + fingerprint intentionally stable so Sentry groups
        // these events together — a probing burst at a single bad key
        // (e.g. one stale team-member config) becomes one issue, not N.
        captureMessage(
          'auth.failed bearer-rejected',
          'warning',
          {
            path: url.pathname,
            status: auth.status,
            reason: auth.reason,
          },
          'auth.failed'
        );
      }
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

    // 4.5. GET /radar/snapshot — lightweight HTTP convenience endpoint
    //      (BL-032.8 Phase 3). The website's SSR uses this instead of
    //      calling Inoreader directly. Reuses the unified scope catalog
    //      via `resource:radar:read` — same scope that gates the MCP
    //      `resources/read` of `gst://radar/snapshot`, so a narrow-scope
    //      bearer like `MCP_KEY_WEBSITE_RADAR` can serve this endpoint
    //      without inflating to the full DEFAULT_SCOPES grant.
    //
    //      Slotted AFTER auth + rate-limit so it benefits from both
    //      substrates; BEFORE MCP-handler dispatch so plain-HTTP traffic
    //      doesn't go through MCP-RPC framing.
    if (url.pathname === '/radar/snapshot' && request.method === 'GET') {
      const startedAt = Date.now();
      if (!hasScope(auth.scopes, 'resource:radar:read')) {
        const missing = 'resource:radar:read';
        safeLog({
          event: 'radar-snapshot.scope-denied',
          keyOwner: auth.keyOwner,
          path: url.pathname,
          status: 403,
          reason: `missing-scope=${missing}`,
          success: false,
          errorCode: 'missing-scope',
        });
        const body = JSON.stringify({
          error: 'forbidden',
          missingScope: missing,
          ownedScopes: auth.scopes,
        });
        const resp = new Response(body, {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
        const withRl = rlResult ? withRateLimitHeaders(resp, rlResult) : resp;
        return withCors(withRl, origin);
      }
      // BL-032.75 Phase 0: tag this SSR endpoint's egress separately from
      // MCP-tool live calls. Lets dashboards distinguish website cache-miss
      // bursts (e.g. during redeploys) from real MCP-tool traffic.
      const [wire, fyi] = await Promise.all([
        readWireLive(env, { source: 'http-snapshot' }),
        readFyiLive(env, 30, { source: 'http-snapshot' }),
      ]);
      const payload = JSON.stringify({
        wire,
        fyi,
        fetchedAt: new Date().toISOString(),
      });
      const resp = new Response(payload, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
      const durationMs = Date.now() - startedAt;
      safeLog({
        event: 'radar-snapshot.request',
        keyOwner: auth.keyOwner,
        path: url.pathname,
        status: 200,
        durationMs,
        success: true,
      });
      const withRl = rlResult ? withRateLimitHeaders(resp, rlResult) : resp;
      return withCors(withRl, origin);
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
