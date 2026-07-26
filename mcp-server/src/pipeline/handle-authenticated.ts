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

import { createMcpHandler } from 'agents/mcp';
import { createServer } from '../server';
import type { AuthSuccess } from '../auth/bearer';
import { withCors } from '../auth/cors';
import { safeLog } from '../auth/safe-logger';
import { hasScope } from '../auth/scopes';
import { createLimiter } from '../ratelimit/limiter';
import { reasonForTier, tooManyRequestsResponse, withRateLimitHeaders } from '../ratelimit/headers';
import { extractToolName, toolClassFor } from '../dispatch/extract-tool-name';
import { tagRequest } from '../observability/sentry';
import { AnalyticsEngineSink } from '../metrics/_index';
import { QueueAuditSink, newRequestId, truncateIp, type AuditContext } from '../audit/_index';
import { readWireLive, readFyiLive } from '../content/radar-live-store';
import type { Env } from '../worker';

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
  const limiter = createLimiter(env);
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
      const withRl = rlResult ? withRateLimitHeaders(resp, rlResult) : resp;
      return withCors(withRl, origin);
    }
    // BL-032.75 Phase 0: tag this SSR endpoint's egress separately from
    // MCP-tool live calls. Lets dashboards distinguish website cache-miss
    // bursts (e.g. during redeploys) from real MCP-tool traffic.
    const [wire, fyi] = await Promise.all([
      readWireLive(env, { source: 'http-snapshot', keyOwner: auth.keyOwner }),
      readFyiLive(env, 30, { source: 'http-snapshot', keyOwner: auth.keyOwner }),
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

  const mcp = createMcpHandler(
    createServer(env, {
      scopes: auth.scopes,
      radarSource: 'worker',
      metricsSink,
      keyOwner: auth.keyOwner,
      audit,
    })
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
  });

  const withRl = rlResult ? withRateLimitHeaders(response, rlResult) : response;
  return withCors(withRl, origin);
}
