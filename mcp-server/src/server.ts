/**
 * Transport-portable MCP server factory.
 *
 * This factory registers the surface that runs on BOTH the stdio entrypoint
 * (`src/index.ts`) and the Cloudflare Worker entrypoint (`src/worker.ts`).
 * Tools and Resources registered here MUST be Workers-compatible — no
 * `node:fs` / `node:crypto` / `node:path` at module load time.
 *
 * Stdio-only registrations (radar offline tool + radar Resources, which use
 * `node:*` via radar-snapshot.ts) live in [`tools/_local-only.ts`](./tools/_local-only.ts)
 * and are called only from `src/index.ts`. See BL-032 Q12 in
 * `mcp-server/src/docs/ARCHITECTURE.md` for the rationale.
 */

import { McpServer } from '@modelcontextprotocol/server';
import { registerDiligenceTool } from './tools/diligence';
import { registerPortfolioTools } from './tools/portfolio';
import { registerIcgTool } from './tools/icg';
import { registerTechparTool } from './tools/techpar';
import { registerTechDebtTool } from './tools/tech-debt';
import { registerRegulationsTool } from './tools/regulations';
import { registerRadarLiveTools } from './tools/radar-live';
import { registerGenerateIrlXlsxTool } from './tools/generate-information-request-list-xlsx';
import { registerListIrlRequestsTool } from './tools/list-irl-requests';
import { registerValidateIrlProvenanceTool } from './tools/validate-irl-provenance';
import { registerComposeDossierEnvelopeTool } from './tools/compose-dossier-envelope';
import { registerPrepareIrlBodyTool } from './tools/prepare-irl-body';
import { registerLibraryResources } from './resources/library';
import { registerRegulationResources } from './resources/regulations';
import { registerRadarResources } from './resources/radar';
import { createWorkerSnapshotReader } from './content/radar-snapshot-reader-worker';
import { registerPrompts } from './prompts/_registry';
import { DEFAULT_SCOPES } from './auth/scopes';
import {
  InMemoryIrlBodyCache,
  InMemoryToolCallCounters,
  NoopSink,
  UpstashIrlBodyCache,
  type IrlBodyCache,
  type MetricsContext,
} from './metrics/_index';
import { createCacheStore } from './lib/upstash-cache-store';
import type { Env } from './worker';

/**
 * Per-request options threaded into the server registry by the
 * Worker fetch handler. Stdio callers pass `{}` (defaults below).
 *
 * Named `ServerFactoryOptions` rather than `ServerContext` (BL-106): the MCP
 * SDK v2 exports its own `ServerContext` — the per-request handler context
 * carrying `mcpReq` / `http` — and a file importing both would have to alias
 * one. These are different things; the names should say so.
 */
export interface ServerFactoryOptions {
  /**
   * Scope set granted to this request's caller. Defaults to
   * `DEFAULT_SCOPES` (full grant — stdio entrypoint, single user).
   * The Worker passes `auth.scopes` from the bearer-auth result so
   * scope-gated handlers can `assertScope()` at the top of their bodies.
   */
  scopes?: readonly string[];
  /**
   * Whether to register radar Resources on this server instance.
   *
   *   - `'worker'`: register radar Resources using the Upstash-backed
   *     reader (`createWorkerSnapshotReader`). Used by the Worker fetch
   *     handler.
   *   - omitted / `undefined`: skip radar Resource registration here.
   *     The stdio path registers them in `tools/_local-only.ts` with
   *     the node:fs-backed reader instead.
   *
   * Avoids double-registration in stdio + Upstash-bound dev runs.
   */
  radarSource?: 'worker';

  /**
   * BL-032.75 Phase 1 — typed-metric emission sink. Each Tool / Resource /
   * Prompt registration wraps its handler with the appropriate
   * `withXxxMetrics` HOF so every invocation emits one event to this sink.
   *
   * Worker passes an `AnalyticsEngineSink(env.METRICS)`; stdio omits the
   * field and gets `NoopSink` (no-op emission, no AE binding required).
   * Tests inject `InMemorySink` to assert on emitted events.
   */
  metricsSink?: import('./metrics/_index').MetricSink;

  /**
   * BL-032.75 Phase 1 — bearer-key attribution (stripped `MCP_KEY_*`
   * suffix). Per-request; threaded into every metric event via the
   * `withXxxMetrics` HOF's `MetricsContext.keyOwner`. Omitted for stdio
   * + cron paths (events emit with `keyOwner = undefined`, projected to
   * `KEYOWNER_PLACEHOLDER` in AE's `index1` column).
   */
  keyOwner?: string;

  /**
   * BL-076 — optional `IrlBodyCache` override for tests. When provided,
   * `createServer` uses this instance verbatim instead of constructing
   * a stdio/Worker cache from `env`. Production code (stdio entrypoint,
   * Worker entrypoint) must NOT set this; the auto-construction logic
   * enforces the in-memory vs Upstash discriminator. Tests that drive
   * `createServer` with a Worker-mode `metricsSink` but no Upstash bindings
   * (e.g., `tests/integration/metrics-emission.test.ts`) pass an explicit
   * `InMemoryIrlBodyCache()` here.
   */
  irlBodyCache?: import('./metrics/_index').IrlBodyCache;

  /**
   * BL-033 Slice 3a — per-request compliance-audit carrier. The Worker passes
   * `{ sink: QueueAuditSink, requestId, ipPrefix, keyOwner }`; stdio / tests /
   * unbound-`AUDIT_QUEUE` omit it (→ no audit emission). Threaded into
   * `MetricsContext.audit` so the `withMetricsCore` chokepoint enqueues a
   * full audit entry per tool call — a path SEPARATE from `metricsSink`
   * (input params must never reach AE / Sentry / ops logs; ADR-0009).
   */
  audit?: import('./audit/_index').AuditContext;

  /**
   * BL-033 Slice 5 — the boundary's already-computed rate-limit result for
   * this request. Threaded into `MetricsContext.rateLimit` so the
   * `withMetricsCore` chokepoint can emit the 80%-consumed soft-limit
   * `notifications/message` warning without a second Upstash round-trip.
   * Omitted for stdio / tests / graceful-skip (→ no warning).
   */
  rateLimit?: import('./ratelimit/limiter').CheckResult;
}

/**
 * Build a transport-portable MCP server registry.
 *
 * The optional `env` parameter is passed through to live radar tools
 * (BL-032 Phase 4c) so they can read Inoreader credentials and check
 * the circuit breaker per request. The Worker calls
 * `createServer(env, { scopes, radarSource: 'worker' })` inside its
 * fetch handler (env + per-request scopes captured in handler closures).
 * The stdio entrypoint calls `createServer()` with no env; radar Tools
 * still register but return a `config-missing` error envelope when
 * Inoreader creds aren't bound at the runtime level.
 */
export function createServer(env: Env = {}, ctx: ServerFactoryOptions = {}): McpServer {
  const server = new McpServer(
    {
      name: 'gst-mcp',
      version: '0.1.0',
    },
    // BL-033 Slice 5: declare the `logging` capability so a tool handler may
    // emit the 80%-consumed soft-limit `notifications/message` via
    // `ctx.mcpReq.notify`. Without it the SDK's
    // `assertNotificationCapability` throws "Server does not support logging",
    // which would turn a best-effort soft warning into a failed tool call.
    { capabilities: { logging: {} } }
  );
  const scopes = ctx.scopes ?? DEFAULT_SCOPES;

  // BL-032.75 Phase 1: build the per-request MetricsContext once and thread
  // it to every register*. Stdio path (no metricsSink) gets a per-process
  // context — emission is still no-op (NoopSink) but the BL-071 counter
  // accumulator captures tool-call arithmetic for the
  // `compose_dossier_envelope` `serverToolCallCounts` snapshot. The frozen
  // NOOP_METRICS_CONTEXT singleton stays untouched (used by default-param
  // slots in 14+ register* sites + tests). Worker passes
  // `{ metricsSink: AnalyticsEngineSink(env.METRICS), keyOwner: auth.keyOwner }`.
  //
  // BL-071 scope: process-lifetime in stdio (== one Claude Desktop session);
  // per-request in Worker (each fetch handler builds a fresh
  // `InMemoryToolCallCounters` so requests don't share counter state).
  // BL-076 — IRL body cache. Stdio: in-memory LRU, process-lifetime
  // (matches Claude Desktop session lifecycle). Worker: Upstash KV. The
  // Worker path MUST NOT fall back to in-memory: Cloudflare isolates rotate
  // between requests, so an in-memory cache populated by `prepare_irl_body`
  // would silently miss the subsequent `compose_dossier_envelope` call from
  // a different isolate — so an absent binding must fail loudly (audit R-3).
  //
  // BL-106 — resolution is LAZY. This block used to run eagerly and throw
  // during registration, which the original comment described as failing "at
  // startup time". Under the SDK v2 factory there is no startup: `createServer`
  // runs per request, so an unbound Upstash turned EVERY call into a -32603 —
  // including `tools/list`, and including the fourteen tools that never touch
  // this cache. One tool's runtime dependency was gating the whole surface.
  //
  // Deferring resolution to first use preserves the R-3 invariant exactly (an
  // unbound Worker still throws the same error, with the same message, rather
  // than silently degrading to in-memory) while scoping the blast radius to the
  // two tools that actually read it. Production binds Upstash, so this changes
  // nothing there; it is dev, test, and partial-outage behaviour that improves.
  const irlBodyCache: IrlBodyCache = (() => {
    // Test override path: short-circuit the stdio/Worker discriminator.
    if (ctx.irlBodyCache) {
      return ctx.irlBodyCache;
    }
    if (ctx.metricsSink === undefined) {
      // Stdio.
      return new InMemoryIrlBodyCache();
    }
    // Worker — require Upstash, resolved on first use.
    let resolved: IrlBodyCache | undefined;
    const resolve = (): IrlBodyCache => {
      if (resolved) return resolved;
      const store = createCacheStore(env);
      if (!store) {
        throw new Error(
          'BL-076 requires Upstash bindings in Worker mode: createCacheStore returned null. ' +
            'compose_dossier_envelope fetches the IRL body from a shared cache; an in-memory ' +
            'fallback would silently miss across isolate rotations. Bind UPSTASH_* env vars or ' +
            'switch to stdio.'
        );
      }
      resolved = new UpstashIrlBodyCache(store);
      return resolved;
    };
    return {
      set: (hash, body) => resolve().set(hash, body),
      get: (hash) => resolve().get(hash),
    };
  })();

  const metrics: MetricsContext =
    ctx.metricsSink === undefined
      ? {
          sink: new NoopSink(),
          counters: new InMemoryToolCallCounters(),
          irlBodyCache,
          audit: ctx.audit,
          rateLimit: ctx.rateLimit,
        }
      : {
          sink: ctx.metricsSink,
          keyOwner: ctx.keyOwner,
          counters: new InMemoryToolCallCounters(),
          irlBodyCache,
          audit: ctx.audit,
          rateLimit: ctx.rateLimit,
        };

  // Tools (transport-portable)
  registerDiligenceTool(server, metrics);
  registerPortfolioTools(server, metrics);
  registerIcgTool(server, metrics);
  registerTechparTool(server, metrics);
  registerTechDebtTool(server, metrics);
  registerRegulationsTool(server, metrics);
  registerRadarLiveTools(server, env, metrics);
  registerGenerateIrlXlsxTool(server, metrics);
  registerListIrlRequestsTool(server, metrics);
  registerValidateIrlProvenanceTool(server, metrics);
  registerPrepareIrlBodyTool(server, metrics);
  registerComposeDossierEnvelopeTool(server, metrics);

  // Resources (transport-portable). `env` is threaded so handlers can
  // consult the BL-032.5 server-side cache (see `cache/resource-cache.ts`).
  // Cache is a no-op when Upstash isn't bound.
  registerLibraryResources(server, env, metrics);
  registerRegulationResources(server, env, metrics);

  // BL-032.5 Phase 3: radar Resources are now transport-portable. The
  // Worker passes radarSource='worker' so they register with the Upstash-
  // backed reader. Stdio omits the option; `tools/_local-only.ts`
  // registers them with the node:fs-backed reader separately.
  if (ctx.radarSource === 'worker') {
    registerRadarResources(server, createWorkerSnapshotReader(env), env, scopes, metrics);
  }

  // Prompts
  registerPrompts(server, metrics);

  return server;
}
