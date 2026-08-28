/// <reference types="@cloudflare/workers-types" />
// ^ DO NOT REMOVE. This directive is load-bearing twice over, and neither
// reason is visible from this file alone:
//
//   1. It is what makes `@types/node` stand down so the fetch globals resolve
//      to Workers shapes. `@types/node/web-globals/fetch.d.ts` gates every
//      fetch global on `typeof globalThis extends { onmessage: any }`; this
//      package's `index.d.ts:17` is `declare var onmessage: never`, which
//      fails that test. Without the directive `ExportedHandler` is TS2304 and
//      `Request`/`Response` revert to Node's undici shapes.
//   2. The `cloudflare:*` ambient modules are declared ONLY in `index.d.ts`,
//      and `@cloudflare/workers-oauth-provider` imports `WorkerEntrypoint`
//      from `"cloudflare:workers"`.
//
// The cost is that `index.d.ts` is a global SCRIPT which also declares
// `Buffer`, `process` and `global`, shadowing `@types/node` program-wide.
// That is why `Env` lives in `./env.ts` (severing the one inbound edge from
// the website's root program) and why bare `Buffer`/`process` are banned
// repo-wide by eslint. Full rationale: ADR-0020.
//
// Scoped `import type { … } from '@cloudflare/workers-types'` resolves to
// `index.ts` — a module, not a global script — and is always safe. Prefer it.

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
 * Architecture reference: mcp-server/src/docs/ARCHITECTURE.md
 */

import { authenticate, authFailureResponse, shouldCaptureAuthFailure } from './auth/bearer';
import { isPreflight, preflightResponse, withCors } from './auth/cors';
import { resolveHostRoute } from './dispatch/host-route';
import { safeLog } from './auth/safe-logger';
import { captureMessage, sentryOptions, withSentry } from './observability/sentry';
import { AnalyticsEngineSink, emit } from './metrics/_index';
import type { RefreshOutcome } from './cron/radar-refresh';
import { postSentryCheckIn, postSentryEvent } from './observability/sentry-envelope';
import { runAlertEvaluation, ALERT_EVALUATOR_CRON } from './observability/alert-evaluator';
import { buildStatusHtml } from './observability/status-page';
import { buildHealthPayload } from './observability/health';
import { runAclSelfCheckOnce } from './observability/acl-selfcheck';
import {
  handleReauthCallback,
  handleReauthStartGet,
  handleReauthStartPost,
} from './admin/inoreader-reauth';
import { acquire } from './lib/single-flight-lock';
import { refreshRadarSnapshot } from './cron/radar-refresh';
import { handleAuthenticated } from './pipeline/handle-authenticated';
import { consumeAuditBatch, type AuditEntry } from './audit/_index';
import { oauthProvider } from './oauth/provider';
import { handleClientCredentialsToken, M2M_TOKEN_PREFIX, verifyM2mToken } from './oauth/m2m-token';
import type { Env } from './env';

/**
 * Re-export of the Worker environment bindings, which live in `./env` so that
 * importing `Env` does not drag this file's `/// <reference types=…>`
 * directive — and the global `Buffer`/`process`/`global` shadowing it carries
 * — into every program that touches mcp-server. See `./env.ts` for the full
 * rationale and ADR-0020.
 *
 * Nothing under `src/` may import `Env` from here (enforced by
 * `tests/integration/mcp-root-program-boundary.test.ts`); this export exists
 * for the mcp-server test suite, which is not in the website's root program
 * and imports `Env` from `../../src/worker` throughout.
 */
export type { Env } from './env';

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

/**
 * BL-033 Slice 2 — OAuth surface paths delegated to the embedded
 * authorization server (oauth/provider.ts) BEFORE the route allowlist
 * and BEFORE authenticate(): the metadata documents are public by spec,
 * and /authorize + /token + /admin/oauth/* carry their own auth
 * semantics (consent-page key form, client credentials, admin bearer).
 * `/oauth/introspect` is admin-gated inside its handler.
 */
function isOAuthSurfacePath(pathname: string): boolean {
  if (pathname === '/authorize' || pathname === '/token') return true;
  if (pathname.startsWith('/.well-known/')) return true;
  if (pathname.startsWith('/admin/oauth/')) return true;
  if (pathname === '/oauth/introspect') return true;
  return false;
}

// Radar-refresh cron expression — mirrored in wrangler.toml
// [env.production] triggers. Hoisted (BL-032.75 Phase 3) so the scheduled
// dispatch matches each registered cron explicitly instead of treating
// radar as the unconditional else-branch. (Line comment because the
// expression contains the block-comment terminator sequence.)
const RADAR_CRON = '0 */6 * * *';

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
   * **Envelope-direct observability** (BL-032.76 — replaces the prior
   * `withMonitor` + `captureException` + `flushSentry` stack as of
   * 2026-05-26):
   *
   *   - Sentry Crons check-ins are sent via direct envelope POST
   *     (`postSentryCheckIn`) — `in_progress` at start, then `ok` /
   *     `error` paired by `check_in_id`.
   *   - Failures emit a Sentry event via direct envelope POST
   *     (`postSentryEvent`) for the stack trace.
   *   - NO `@sentry/cloudflare` SDK calls on this code path. The SDK
   *     remains in use for the fetch handler only (see default export
   *     at the bottom of this file — `withSentry({ fetch })` splits
   *     the surface so the scheduled handler stays SDK-free).
   *
   * **Why the SDK is bypassed here**: from 2026-05-19 through 2026-05-26,
   * every cron firing reported `Exception Thrown` on Cloudflare's cron
   * dashboard while the underlying radar work succeeded. The SDK's
   * `wrapScheduledHandler` queues its own `ctx.waitUntil(flushAndDispose
   * (client))` outside any try/catch we control; something in that
   * queued promise rejects under Workers-runtime conditions. Three
   * in-tree fix attempts (Day-3 flush, withMonitor layering, outer
   * try/catch around the IIFE) did not resolve the symptom; upstream
   * check found no documented workaround or config flag. The structural
   * fix is to stop wrapping `scheduled` with `withSentry`. See
   * `src/observability/sentry-envelope.ts` for the helper rationale.
   */
  async scheduled(event, env, ctx): Promise<void> {
    ctx.waitUntil(
      (async () => {
        const startedAt = Date.now();
        // Outer safety net (defense-in-depth). The envelope helpers in
        // `sentry-envelope.ts` carry a "never throws" contract, but a
        // future refactor that breaks that contract would re-introduce
        // the 2026-05-19 incident shape (rejection escapes ctx.waitUntil
        // → Cloudflare reports `Exception Thrown`). Wrapping the whole
        // body guarantees ctx.waitUntil resolves regardless of helper
        // regressions. Anything that lands here is intentionally dropped
        // — the safeLog inside the inner catch is the operator-visible
        // signal on the failure path.
        try {
          // BL-032.75 Phase 3 — SLO alert evaluator (15-min cadence).
          // Same double-fire dedup discipline as the radar path below;
          // distinct lock-key prefix so the two crons can never collide
          // even at the :00 overlap (event.cron disambiguates). The
          // evaluator itself never throws and emits its own cron_outcome
          // AE event; the dedup loser emits `deduplicated` here so
          // double-fire frequency stays observable for this cron too.
          if (event.cron === ALERT_EVALUATOR_CRON) {
            const evalLockKey = `mcp:lock:cron-alert-evaluator:${event.cron}:${event.scheduledTime}`;
            const evalAcquired = await acquire(env, evalLockKey, 300);
            if (!evalAcquired) {
              safeLog({
                event: 'cron.scheduled.deduplicated',
                reason: 'peer-holds-lock',
                success: true,
                durationMs: Date.now() - startedAt,
                cron: event.cron,
                scheduledTime: event.scheduledTime,
              });
              if (env.METRICS) {
                emit(new AnalyticsEngineSink(env.METRICS), {
                  event_type: 'cron_outcome',
                  name: 'alert-evaluator',
                  outcome: 'deduplicated',
                  duration_ms: Date.now() - startedAt,
                });
              }
              return;
            }
            await runAlertEvaluation(env);
            return;
          }

          // Explicit-dispatch guard (BL-032.75 Phase 3 restructure): the
          // radar path below historically ran as the unconditional `else`.
          // With more than one registered cron, an unrecognized expression (e.g.
          // a wrangler.toml edit that didn't update the matching constant)
          // must NOT silently burn Inoreader budget on the radar path.
          if (event.cron !== RADAR_CRON) {
            safeLog({
              event: 'cron.scheduled.unknown-cron',
              success: false,
              errorCode: 'unknown-cron-expression',
              reason: `no handler registered for cron: ${event.cron}`,
              cron: event.cron,
            });
            return;
          }

          // BL-032.77 — Cloudflare's `ScheduledController` may invoke the
          // scheduled handler multiple times for the same scheduled fire
          // (documented platform behavior; see
          // https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/
          // and the "cached-by-peer" observation in production on 2026-05-29).
          // Both invocations share `event.scheduledTime` (epoch ms of the
          // scheduled fire, NOT wall-clock at invocation), so we use it as the
          // dedup key. `event.cron` is included so a future second cron entry
          // in `wrangler.toml` doesn't collide on the same scheduledTime.
          //
          // Lock TTL of 5 min outlasts any plausible firing duration (typical:
          // 2-10 seconds; worst case bounded by Inoreader's per-request caps).
          // Fail-open semantics in `acquire`: if Upstash is unreachable, both
          // invocations run — better to occasionally double-fetch Inoreader
          // than to silently skip a firing during an Upstash outage.
          //
          // Loser path emits one `cron_outcome` AE event with outcome
          // `'deduplicated'` so the dataset reflects how often Cloudflare
          // double-fires; without it, dedup'd invocations would be invisible
          // and we'd lose the ability to detect a regression in CF's behavior.
          const lockKey = `mcp:lock:cron-radar-refresh:${event.cron}:${event.scheduledTime}`;
          const acquired = await acquire(env, lockKey, 300);
          if (!acquired) {
            safeLog({
              event: 'cron.scheduled.deduplicated',
              reason: 'peer-holds-lock',
              success: true,
              durationMs: Date.now() - startedAt,
              cron: event.cron,
              scheduledTime: event.scheduledTime,
            });
            if (env.METRICS) {
              emit(new AnalyticsEngineSink(env.METRICS), {
                event_type: 'cron_outcome',
                name: 'radar-refresh',
                outcome: 'deduplicated',
                duration_ms: Date.now() - startedAt,
              });
            }
            return;
          }

          // The cron expression in the Crons check-in MUST match
          // wrangler.toml's `[triggers] crons` entry — `event.cron` is
          // the runtime source of truth so a wrangler.toml edit doesn't
          // silently desync the Sentry-side monitor config.
          const checkInId = await postSentryCheckIn(
            env,
            'radar-refresh',
            'in_progress',
            event.cron
          );
          try {
            const refreshOutcome = await refreshRadarSnapshot(env);
            await postSentryCheckIn(env, 'radar-refresh', 'ok', event.cron, checkInId);
            // BL-032.77 Fix C — emit cron_outcome to AE so the dataset
            // populates even when no MCP RPC traffic is flowing (the
            // common case: website's `/radar/snapshot` SSR uses HTTP,
            // not MCP RPC; cron is the only reliable AE-write source).
            //
            // `refreshRadarSnapshot` returns a discriminated `RefreshOutcome`
            // (it doesn't throw on partial/skipped failures); ALL non-throw
            // returns hit this branch. Map each `kind` to the schema's
            // `OUTCOME_VALUES.cron_outcome` so the dashboard distinguishes
            // success from partial / skipped / error rather than reporting
            // every non-throw as "success."
            //
            // Best-effort: env.METRICS may be undefined in test contexts;
            // routing through `emit()` so the schema guard catches drift
            // (e.g. a future RefreshOutcome.kind addition without a
            // matching outcome value).
            if (env.METRICS) {
              emit(new AnalyticsEngineSink(env.METRICS), {
                event_type: 'cron_outcome',
                name: 'radar-refresh',
                outcome: refreshOutcomeToAe(refreshOutcome),
                duration_ms: Date.now() - startedAt,
              });
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            safeLog({
              event: 'cron.scheduled.error',
              success: false,
              reason: msg.slice(0, 200),
              durationMs: Date.now() - startedAt,
            });
            await postSentryEvent(env, {
              level: 'error',
              message: `cron.radar-refresh.error: ${msg}`,
              tags: { event: 'cron.scheduled', cron: event.cron },
              extra: { source: 'cron.scheduled', cron: event.cron },
            });
            await postSentryCheckIn(env, 'radar-refresh', 'error', event.cron, checkInId);
            // BL-032.77 Fix C — uncaught-throw error path. Distinct from
            // `RefreshOutcome.kind === 'error'` which is handled above via
            // `refreshOutcomeToAe` (refreshRadarSnapshot returns errors
            // structurally; reaching this catch means something blew up
            // outside its try/catch — uncaught exception, isolate fault,
            // helper-contract regression).
            if (env.METRICS) {
              emit(new AnalyticsEngineSink(env.METRICS), {
                event_type: 'cron_outcome',
                name: 'radar-refresh',
                outcome: 'error',
                duration_ms: Date.now() - startedAt,
              });
            }
          }
        } catch {
          // Helper-contract regression. No further recovery — the work
          // either succeeded (visible via /health) or its failure was
          // captured by the inner catch before this outer one fired.
        }
      })()
    );
  },

  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    // BL-041: one-shot ACL self-check per deploy. Fire-and-forget via
    // waitUntil — first isolate to win the Upstash gate runs the probe;
    // every other request no-ops cheaply at the gate. Result lands in
    // `mcp:acl-selfcheck:result:<gitSha>` and is surfaced by /health.
    // Never blocks the request path; fail-open if Upstash is down.
    ctx.waitUntil(runAclSelfCheckOnce(env).catch(() => undefined));

    // 1. CORS preflight — never authenticated; never logged (high-volume noise).
    if (isPreflight(request)) {
      return preflightResponse(request);
    }

    // 1.5. Host aliases — MUST stay ahead of every path-based branch below.
    //      `/health`, the `/status` arm and `isOAuthSurfacePath` all dispatch on
    //      path alone with no hostname test, so a docs-alias branch placed among
    //      them would serve the health payload, the status page and the OAuth
    //      surface on a documentation hostname. `tests/unit/dispatch/
    //      host-route.test.ts` asserts this ordering against the source.
    const hostRoute = resolveHostRoute(url);
    if (hostRoute) {
      return Response.redirect(hostRoute.location, hostRoute.status);
    }

    // 2. Health endpoint — no auth required, but does emit CORS headers so
    //    browser-based clients can probe it before attempting an MCP handshake.
    //    Phase 5: returns the BACKLOG-specified shape with cached
    //    Inoreader-status (never burns budget — Q8) + Upstash reachability probe.
    if (url.pathname === '/health' && request.method === 'GET') {
      const payload = await buildHealthPayload(env);
      return withCors(Response.json(payload), origin);
    }

    // 2.1. Status page (BL-032.75 Phase 3; panels extended in BL-033 Slice 4)
    //      — public HTML over the health payload + the evaluator's cached
    //      alert summary + precomputed status metrics (no live AE on the
    //      render path). No auth (health is already unauthenticated and shows
    //      strictly more). `Cache-Control: max-age=60` sets client/downstream
    //      caching (browsers + uptime monitors that honor it); it does NOT by
    //      itself trigger Cloudflare edge caching of a Worker Response (that
    //      needs the Cache API) — the render is cheap regardless (cached reads,
    //      no live AE). BL-033 Slice 4 also fronts this at
    //      `status.mcp.globalstrategic.tech`: serve status at the subdomain
    //      root as well as the apex `/status` path. This check precedes the
    //      `isRoutedPath` 404 gate, so the subdomain root is intercepted here.
    if (
      (url.pathname === '/status' ||
        (url.hostname.startsWith('status.') && url.pathname === '/')) &&
      request.method === 'GET'
    ) {
      const html = await buildStatusHtml(env);
      return withCors(
        new Response(html, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=60',
          },
        }),
        origin
      );
    }

    // 2.3. BL-033 Slice 2 — OAuth surface (embedded AS as a sub-router).
    //      /authorize + /token + /.well-known/* + /admin/oauth/* delegate
    //      to the workers-oauth-provider instance; the provider routes
    //      /authorize and /admin/oauth/* back into our defaultHandler
    //      (consent page, admin client CRUD) with env.OAUTH_PROVIDER
    //      injected, and implements /token + both metadata documents
    //      itself. Slotted BEFORE the route allowlist (these paths are
    //      not in isRoutedPath) and BEFORE authenticate() — metadata is
    //      public by spec; /authorize and /token carry their own auth
    //      semantics. grant_type=client_credentials is intercepted ahead
    //      of delegation (library has no such grant — see oauth/m2m-token).
    //      Responses re-wrap with OUR CORS policy: browser-based clients
    //      (claude.ai) must POST /token cross-origin.
    if (isOAuthSurfacePath(url.pathname)) {
      // client_credentials intercept — the library's grant model has no
      // such grant (verified v0.8.2); oauth/m2m-token.ts issues the
      // self-contained `mcp_m2m_*` JWTs. Body is read from a clone so
      // other grants reach the provider with the stream intact.
      if (url.pathname === '/token' && request.method === 'POST') {
        const probe = await request.clone().text();
        if (new URLSearchParams(probe).get('grant_type') === 'client_credentials') {
          return withCors(await handleClientCredentialsToken(request, env), origin);
        }
      }
      const resp = await oauthProvider.fetch(request, env as never, ctx);
      return withCors(resp, origin);
    }

    // 2.5. BL-047 T2 — Inoreader OAuth re-auth flow. Admin-gated browser
    //      surface. Slotted BEFORE the known-route allowlist (which would
    //      404 these otherwise) AND BEFORE the standard `authenticate()`
    //      call (admin uses `MCP_ADMIN_KEY` form submission, not
    //      `MCP_KEY_*` Bearer). Also bypasses the per-key rate limiter
    //      since these are operator-driven rare-recovery endpoints.
    if (url.pathname === '/admin/inoreader/reauth/start') {
      if (request.method === 'GET') return handleReauthStartGet(env);
      if (request.method === 'POST') return handleReauthStartPost(request, env);
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { Allow: 'GET, POST' },
      });
    }
    if (url.pathname === '/admin/inoreader/reauth/callback') {
      if (request.method !== 'GET') {
        return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } });
      }
      return handleReauthCallback(request, env);
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

    // 4. Authentication — dual validation, cheap-first (BL-033 Slice 2).
    //    (1) Static MCP_KEY_* scan: constant-time, zero I/O, byte-identical
    //        to the pre-OAuth behavior for every existing consumer.
    //    (2) OAuth access token: only attempted when a bearer WAS presented
    //        but matched no static key (`invalid-token`). The provider
    //        validates against its KV store and, on success, invokes the
    //        api-handler which runs the same handleAuthenticated pipeline.
    //        (`malformed-scopes` does NOT delegate — a static key DID
    //        match; that's an operator config error, not an OAuth token.)
    //    (3) M2M `mcp_m2m_*` JWT verification slots between (1) and (2)
    //        in the M2M phase.
    //    auth.failed telemetry fires ONLY after every path has failed —
    //    a valid OAuth token must never be logged as an auth failure.
    const auth = authenticate(request, env);
    if (auth.ok) {
      // 5. Post-auth pipeline — Sentry tagging, rate limiting,
      //    /radar/snapshot, MCP-handler dispatch, request logging,
      //    RL + CORS headers (pipeline/handle-authenticated.ts).
      return handleAuthenticated(request, env, ctx, auth);
    }
    if (auth.reason === 'invalid-token') {
      // (2) M2M self-contained JWT — zero-I/O local HMAC verify; the
      //     `mcp_m2m_` prefix is ours, so a failed verify falls straight
      //     through to the 401 (never to the provider).
      const rawBearer = (request.headers.get('Authorization') ?? '').slice('Bearer '.length).trim();
      if (rawBearer.startsWith(M2M_TOKEN_PREFIX)) {
        const m2mAuth = await verifyM2mToken(rawBearer, env, url.origin);
        if (m2mAuth) return handleAuthenticated(request, env, ctx, m2mAuth);
      } else {
        const oauthResp = await oauthProvider.fetch(request, env as never, ctx);
        // Anything but a 401 means the provider recognized the token and
        // the api-handler already ran the full pipeline; a 401 falls
        // through to OUR challenge shape below (legacy JSON body +
        // RFC 9728 resource_metadata pointer). CORS-wrap on the way out —
        // a provider error response (e.g. audience mismatch) still needs
        // our allow-origin headers for browser-based clients.
        if (oauthResp.status !== 401) return withCors(oauthResp, origin);
      }
    }
    {
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
      // `url.origin` powers the RFC 9728 resource_metadata pointer on
      // token-present failures (see authFailureResponse).
      return withCors(authFailureResponse(auth, url.origin), origin);
    }
  },
};

// Default export — wraps `fetch` with Sentry, leaves `scheduled` bare.
//
// BL-032.76 (2026-05-26): the SDK's `wrapScheduledHandler` queues its
// own `ctx.waitUntil(flushAndDispose(client))` outside any try/catch we
// control, producing Cloudflare `Exception Thrown` on every cron firing
// regardless of whether our work succeeded. The fix is structural:
// `withSentry` mutates the passed handler object in place and only
// touches keys present on it, so passing `{ fetch }` avoids the
// scheduled-handler wrap entirely. The bare `handler.scheduled`
// reference becomes the default-export's `scheduled`, owning its own
// envelope-based Sentry lifecycle (see the `scheduled` method
// docstring + `src/observability/sentry-envelope.ts`).
//
// When `SENTRY_DSN` isn't bound, `sentryOptions` returns undefined and
// `withSentry` passes the fetch handler through unchanged.
const wrappedFetch = withSentry(sentryOptions, { fetch: handler.fetch! }).fetch;

// BL-033 Slice 3a — audit-log queue consumer. Like `scheduled`, it stays
// OUTSIDE the `withSentry({ fetch })` wrap and owns its own SDK-free
// Sentry-envelope lifecycle. Unlike `scheduled`, it must NEVER swallow a
// failure: `consumeAuditBatch` re-queues the batch (`retryAll`) on any error
// so no audit record is silently dropped (see its docstring + ADR-0009).
// Currently DEAD code by configuration (ADR-0014: no [[queues.consumers]]
// binding exists, so the platform never invokes `queue`). Retained
// deliberately so re-enabling the pipeline is a wrangler.toml-only revert.
export default {
  fetch: wrappedFetch,
  scheduled: handler.scheduled,
  queue: (batch, env, ctx) => consumeAuditBatch(batch, env, ctx),
} satisfies ExportedHandler<Env, AuditEntry>;

/**
 * Map a `RefreshOutcome` (5 kinds, plus the `skipped` sub-reason) to
 * the pinned `OUTCOME_VALUES.cron_outcome` enum. Exhaustive `never`
 * check at the end so a future kind addition becomes a compile error
 * rather than a silent fall-through.
 *
 * Mapping rationale:
 *   - `success`              → `'success'`
 *   - `partial-one-tier-ok`  → `'partial'` (one tier refreshed; cache
 *                              is half-fresh; informational)
 *   - `partial-both-failed`  → `'error'`   (both tiers down; alertable)
 *   - `skipped circuit-open` → `'skipped-circuit'`
 *   - `skipped day-cap-...`  → `'skipped-budget'`
 *   - `error`                → `'error'`
 *
 * If `OUTCOME_VALUES.cron_outcome` is later widened (e.g. distinguish
 * `partial-both-failed` from `error`), update this map AND the
 * snapshot test in `tests/unit/metrics/schema.test.ts`.
 *
 * Exported so the unit test in `tests/unit/worker-scheduled.test.ts`
 * can pin the mapping per-case.
 */
export function refreshOutcomeToAe(outcome: RefreshOutcome): string {
  switch (outcome.kind) {
    case 'success':
      return 'success';
    case 'partial-one-tier-ok':
      return 'partial';
    case 'partial-both-failed':
      return 'error';
    case 'skipped':
      return outcome.reason === 'circuit-open' ? 'skipped-circuit' : 'skipped-budget';
    case 'error':
      return 'error';
    default: {
      const _exhaustive: never = outcome;
      return _exhaustive;
    }
  }
}
