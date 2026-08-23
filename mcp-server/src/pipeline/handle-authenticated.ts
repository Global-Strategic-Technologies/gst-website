/**
 * Post-authentication request pipeline — everything that happens AFTER a
 * caller has proven identity, regardless of HOW they proved it.
 *
 * Extracted from worker.ts (BL-033 Slice 2) so the static-bearer path
 * (worker.ts), the OAuth token path (oauth/api-handler.ts), and the M2M
 * JWT path (worker.ts) all converge on one pipeline: Sentry tagging →
 * per-key rate limit → /radar/snapshot convenience endpoint → per-request
 * MCP handler → structured request log → rate-limit + CORS headers.
 *
 * The `AuthSuccess` contract ({ keyOwner, scopes }) is the seam: whatever
 * produced it, everything downstream — limiter buckets, AE metrics
 * attribution (blob3), safeLog lines, Sentry tags, scope gating — behaves
 * identically. Living in its own module (not worker.ts) breaks the
 * would-be import cycle worker.ts → oauth/* → worker.ts.
 */

// Narrowed from `agents/mcp` (BL-106): that barrel carries the whole Durable
// Object / RPC / event-store surface including the now-`@deprecated`,
// feature-frozen `McpAgent`. `agents/mcp/server` exports only the stateless
// handler and is the target Cloudflare's own deprecation notice names.
import type { ExecutionContext } from '@cloudflare/workers-types';
import { createMcpHandler } from 'agents/mcp/server';
import { createServer } from '../server';
import type { AuthSuccess } from '../auth/bearer';
import { withCors } from '../auth/cors';
import { safeLog } from '../auth/safe-logger';
import { hasScope } from '../auth/scopes';
import { createLimiter } from '../ratelimit/limiter';
import { resolveTierLimits } from '../ratelimit/tiers';
import {
  reasonForTier,
  rateLimitPolicyHeader,
  tooManyRequestsResponse,
  withRateLimitHeaders,
} from '../ratelimit/headers';
import { extractToolName, toolClassFor } from '../dispatch/extract-tool-name';
import { tagRequest } from '../observability/sentry';
import { AnalyticsEngineSink } from '../metrics/_index';
import { QueueAuditSink, newRequestId, truncateIp, type AuditContext } from '../audit/_index';
import {
  readWireLive,
  readFyiLive,
  readWireCached,
  readFyiCached,
  type LiveTierResult,
  type CachedTierResult,
} from '../content/radar-live-store';
import { isCircuitOpen } from '../ratelimit/circuit-breaker';
import { handleInoreaderFailure } from '../lib/inoreader-failure-handler';
import type { Env } from '../env';

export async function handleAuthenticated(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  auth: AuthSuccess
): Promise<Response> {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');

  // Tag the Sentry scope with keyOwner + path. No-op when SENTRY_DSN
  // isn't bound; per-request scope so tags only attach to THIS request's
  // events.
  tagRequest(auth.keyOwner, url.pathname);

  // Per-key rate limit (Phase 3 + BL-038). Sliding-window check via
  // Upstash; null → graceful skip (Upstash creds not bound — fail open
  // with a warning). Radar tools (`search_radar`, `get_latest_insights`)
  // additionally consume from a stricter 5/min, 50/day pair keyed under
  // `mcp:ratelimit:radar:*` — BL-038 defense-in-depth for the shared
  // Inoreader budget. Tool name is extracted at the Worker boundary via
  // a cloned-body JSON-RPC parse; non-tools/call requests + parse
  // failures fail-safe to `'general'`.
  const toolName = await extractToolName(request);
  const toolClass = toolClassFor(toolName);
  // BL-033 Slice 5: the client's tier (carried on the M2M token claim;
  // undefined for static keys + OAuth human-consent) selects the four
  // sliding-window ceilings. `RateLimit-Policy` advertises those ceilings
  // on every authenticated response (200 and 429) — the transport-agnostic
  // throttle signal, guaranteed even for clients that don't parse the SSE
  // soft-limit notification.
  const limits = resolveTierLimits(auth.tier);
  const rlPolicy = rateLimitPolicyHeader(limits, toolClass);
  const limiter = createLimiter(env, limits);
  let rlResult = null;
  if (limiter) {
    rlResult = await limiter.check(auth.keyOwner, toolClass);
    if (!rlResult.allowed) {
      safeLog({
        event: 'ratelimit.exceeded',
        keyOwner: auth.keyOwner,
        path: url.pathname,
        status: 429,
        reason: reasonForTier(rlResult.tier),
        success: false,
        errorCode: 'rate-limit',
      });
      return withCors(tooManyRequestsResponse(rlResult, rlPolicy), origin);
    }
  } else {
    safeLog({
      event: 'ratelimit.skipped',
      keyOwner: auth.keyOwner,
      path: url.pathname,
      reason: 'upstash-not-bound',
    });
  }

  // GET /radar/snapshot — lightweight HTTP convenience endpoint
  // (BL-032.8 Phase 3). The website's SSR uses this instead of
  // calling Inoreader directly. Reuses the unified scope catalog
  // via `resource:radar:read` — same scope that gates the MCP
  // `resources/read` of `gst://radar/snapshot`, so a narrow-scope
  // bearer like `MCP_KEY_WEBSITE_RADAR` can serve this endpoint
  // without inflating to the full DEFAULT_SCOPES grant.
  //
  // Slotted AFTER auth + rate-limit so it benefits from both
  // substrates; BEFORE MCP-handler dispatch so plain-HTTP traffic
  // doesn't go through MCP-RPC framing.
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
      const withRl = rlResult ? withRateLimitHeaders(resp, rlResult, rlPolicy) : resp;
      return withCors(withRl, origin);
    }
    // BL-032.75 Phase 0: tag this SSR endpoint's egress separately from
    // MCP-tool live calls. Lets dashboards distinguish website cache-miss
    // bursts (e.g. during redeploys) from real MCP-tool traffic.
    //
    // BL-091 — circuit-breaker discipline. Before this, the SSR path had NO
    // breaker check and would fetch Inoreader live on a cold cache during an
    // open window (a budget leak on the highest-volume consumer). Now: open →
    // cache-only reads, never upstream. Note the response stays **HTTP 200**
    // regardless — the website checks only `res.ok` (`RadarFeed.astro`), so a
    // 5xx here would blank `/hub/radar`; per-tier `ok:false` + the `degraded`
    // flag carry the state instead.
    const breaker = await isCircuitOpen(env);
    const snapshotDegraded = breaker?.open === true;
    let wire: LiveTierResult | CachedTierResult;
    let fyi: LiveTierResult | CachedTierResult;
    if (snapshotDegraded) {
      [wire, fyi] = await Promise.all([readWireCached(env), readFyiCached(env, 30)]);
    } else {
      const [liveWire, liveFyi] = await Promise.all([
        readWireLive(env, { source: 'http-snapshot', keyOwner: auth.keyOwner }),
        readFyiLive(env, 30, { source: 'http-snapshot', keyOwner: auth.keyOwner }),
      ]);
      // BL-091 — this surface can now OPEN the breaker. It is the highest-volume
      // Inoreader consumer and was previously one of two paths that could eat a
      // 429 without tripping it (ADR-0006 T.Z.2 wants *every* call site routed
      // through `handleInoreaderFailure`). Fire-and-forget so the SSR response
      // isn't delayed by the breaker write.
      //
      // Route at most ONE failure per request: `openCircuit` resets the full 6h
      // TTL on every call, and each route also emits a Sentry event — so
      // handling both tiers would double-count the same incident on the
      // highest-volume surface, exactly when the alert matters most.
      const rateLimited = [liveWire, liveFyi].find(
        (tier) => !tier.ok && tier.reason === 'inoreader-rate-limit'
      );
      if (rateLimited && !rateLimited.ok) {
        ctx.waitUntil(handleInoreaderFailure(env, rateLimited, 'http-radar-snapshot'));
      }
      wire = liveWire;
      fyi = liveFyi;
    }
    const payload = JSON.stringify({
      wire,
      fyi,
      degraded: snapshotDegraded,
      ...(snapshotDegraded && breaker?.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: breaker.retryAfterSeconds }
        : {}),
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
    const withRl = rlResult ? withRateLimitHeaders(resp, rlResult, rlPolicy) : resp;
    return withCors(withRl, origin);
  }

  // Authenticated + within rate limit — log + delegate to MCP handler.
  // Wall-clock timing recorded via durationMs for Phase 5 observability.
  // Tool-name extraction at the Worker boundary is now ACTIVE for the
  // rate-limit gate (BL-038, via `extractToolName` above); broader
  // tagging of safeLog events with the resolved tool name remains in
  // BL-032.75 maturity scope.
  const startedAt = Date.now();

  // Build the MCP handler per-request — radar-live tools (Phase 4c) capture
  // `env` in their closures for circuit-breaker checks + Inoreader fetches.
  // BL-032.5 Phase 3: pass `scopes` from the auth result so scope-gated
  // handlers (radar Resources) can assertScope at the top of their bodies,
  // and `radarSource: 'worker'` so radar Resources register with the
  // Upstash-backed reader (the stdio reader uses node:fs and isn't bundled
  // for the Worker).
  //
  // BL-032.75 Phase 1: `metricsSink` is a per-request AnalyticsEngineSink
  // bound to `env.METRICS`. Fall back to omitting the option (→ NoopSink)
  // when the AE binding isn't present (some test contexts). `keyOwner`
  // threads the attribution into every emitted event.
  const metricsSink = env.METRICS ? new AnalyticsEngineSink(env.METRICS) : undefined;

  // BL-033 Slice 3a — per-request audit carrier. `requestId` correlates the
  // request log line with the audit entries emitted for its tool calls;
  // `ipPrefix` is the GDPR-truncated caller IP (last octet zeroed). The audit
  // sink enqueues off the latency path via `ctx.waitUntil`; absent when the
  // `AUDIT_QUEUE` binding isn't bound (→ no audit emission). Full input params
  // captured at the metrics chokepoint go ONLY here, never to AE / Sentry.
  const requestId = newRequestId();
  const ipPrefix = truncateIp(request.headers.get('CF-Connecting-IP'));
  const audit: AuditContext | undefined = env.AUDIT_QUEUE
    ? {
        sink: new QueueAuditSink(env.AUDIT_QUEUE, (p) => ctx.waitUntil(p)),
        requestId,
        ipPrefix,
        keyOwner: auth.keyOwner,
      }
    : undefined;

  // BL-106: the SDK v2 handler takes a FACTORY, not an instance. Our
  // per-request `createServer(env, {...})` construction was already the right
  // shape, so this is a wrapper, not a restructure — the radar-live tools'
  // `env` closure capture is unaffected.
  // Set by the server factory below. Stays `'no-factory-run'` when the handler
  // refuses a request before dispatch — the state that matters most, because a
  // modern-only Worker rejecting every legacy client would otherwise emit no
  // era signal at all.
  let requestEra: 'legacy' | 'modern' | 'no-factory-run' = 'no-factory-run';

  const mcp = createMcpHandler(
    (mcpCtx) => {
      // BL-106 follow-up — the era discriminator, which the original change
      // specified and then dropped. The SDK hands the factory the era it
      // classified this request as, which turns "what protocol version are
      // our callers on?" from an inference into a query. Its absence is why
      // the 0.44.0 regression had to be diagnosed by reproducing symptoms.
      //
      // Captured into the outer scope rather than logged here, so it rides
      // the existing `mcp.request` line below. That is not just tidier: the
      // factory does NOT run for a request the handler refuses (an
      // unsupported protocol version is rejected before dispatch), so a
      // dedicated line inside the factory would go silent in exactly the
      // failure it exists to detect. `no-factory-run` makes that state
      // visible instead of absent.
      requestEra = mcpCtx.era;
      return createServer(env, {
        scopes: auth.scopes,
        radarSource: 'worker',
        metricsSink,
        keyOwner: auth.keyOwner,
        audit,
        // BL-033 Slice 5: hand the boundary's already-computed rate-limit
        // result to the tool wrapper so it can emit the 80%-consumed soft-limit
        // notification WITHOUT a second Upstash round-trip. `null` (graceful
        // skip) → undefined (the optional field), so no warning fires.
        rateLimit: rlResult ?? undefined,
      });
    },
    {
      // Serve BOTH protocol eras. The modern lane handles 2026-07-28; the
      // compatibility lane pins a 2025-era instance from this same factory
      // for clients that open with `initialize`.
      //
      // BL-106 shipped this as `'reject'` (modern-only) on the reasoning that
      // the remote surface had no external clients. That reasoning was about
      // the wrong thing: it asked *who is contractually a client* and not
      // *what does the client software speak*. **Claude Desktop speaks
      // `2025-11-25`** — the spec revision is a week old and its client has
      // not moved — so within hours of the production deploy every tool call
      // failed with `-32022 Unsupported protocol version: 2025-11-25`. The
      // symptom was misleading: Claude Desktop still displayed the tool list
      // from its cache, so it surfaced as "failed to call tool <name>" rather
      // than as a connection error, which points at the tool and not the
      // handshake.
      //
      // The identical active-client argument that kept stdio on its legacy
      // lane (see src/index.ts) applied here too and was not made, because
      // "no external clients" was read as "no clients". Reverted to serving
      // both eras; see ADR-0013's 2026-08-04 amendment.
      //
      // Do NOT flip this back to `'reject'` without first confirming, from
      // telemetry rather than inference, that no caller is opening with
      // `initialize`. The `era` discriminator below is what makes that
      // checkable.
      legacy: 'stateless',

      // `cors.ts` owns origin policy exclusively — these two options are what
      // make that true, and both are load-bearing:
      //
      //  - `allowedOriginHostnames: '*'` disables the handler's OWN origin
      //    gate. Without it the accepted set defaults to the localhost trio
      //    (localhost / 127.0.0.1 / [::1]); `mcp.globalstrategic.tech` is
      //    neither localhost nor *.workers.dev, so EVERY request carrying
      //    `Origin: https://claude.ai` would be answered 403 — precisely the
      //    browser-client case the allowlist exists to serve. The legacy
      //    handler had no such gate, so this would have been a new failure
      //    mode introduced by the migration rather than a pre-existing one.
      //  - `corsOptions: false` stops the handler emitting its own CORS
      //    headers, which default to `Access-Control-Allow-Origin: *`.
      //    `withCors` only overwrites that for allowlisted origins, so
      //    no-Origin and disallowed-origin responses were shipping the
      //    wildcard that ARCHITECTURE.md § CORS (Q5) calls deliberately
      //    forbidden. Pre-existing defect, closed here.
      //
      // Consequence worth knowing: after this the handler performs no origin
      // or host gating at all (host validation also no-ops on a custom
      // domain). `src/auth/cors.ts` is the single origin authority.
      allowedOriginHostnames: '*',
      corsOptions: false,

      // Out-of-band handler errors are otherwise invisible: the SDK answers
      // the client with a bare `-32603 Internal server error` and the reason
      // never reaches our logs. Route it to safeLog so `wrangler tail` shows
      // the cause. Reporting only — this never alters the wire response.
      onerror: (err: Error) => {
        safeLog({
          event: 'mcp.handler.error',
          success: false,
          errorCode: 'mcp-handler-error',
          reason: (err?.message ?? String(err)).slice(0, 300),
        });
      },
    }
  );
  const response = await mcp(request, env, ctx);
  const durationMs = Date.now() - startedAt;

  safeLog({
    event: 'mcp.request',
    keyOwner: auth.keyOwner,
    requestId,
    path: url.pathname,
    status: response.status,
    durationMs,
    success: response.status < 400,
    era: requestEra,
  });

  const withRl = rlResult ? withRateLimitHeaders(response, rlResult, rlPolicy) : response;
  return withCors(withRl, origin);
}
