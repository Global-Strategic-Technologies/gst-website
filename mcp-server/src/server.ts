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
 * `src/docs/development/MCP_SERVER_REMOTE_BL-032.md` for the rationale.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerDiligenceTool } from './tools/diligence';
import { registerPortfolioTools } from './tools/portfolio';
import { registerIcgTool } from './tools/icg';
import { registerTechparTool } from './tools/techpar';
import { registerTechDebtTool } from './tools/tech-debt';
import { registerRegulationsTool } from './tools/regulations';
import { registerRadarLiveTools } from './tools/radar-live';
import { registerGenerateIrlXlsxTool } from './tools/generate-information-request-list-xlsx';
import { registerValidateIrlProvenanceTool } from './tools/validate-irl-provenance';
import { registerLibraryResources } from './resources/library';
import { registerRegulationResources } from './resources/regulations';
import { registerRadarResources } from './resources/radar';
import { createWorkerSnapshotReader } from './content/radar-snapshot-reader-worker';
import { registerPrompts } from './prompts/_registry';
import { DEFAULT_SCOPES } from './auth/scopes';
import { NOOP_METRICS_CONTEXT, type MetricsContext } from './metrics/_index';
import type { Env } from './worker';

/**
 * Per-request context threaded into the server registry by the
 * Worker fetch handler. Stdio callers pass `{}` (defaults below).
 */
export interface ServerContext {
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
export function createServer(env: Env = {}, ctx: ServerContext = {}): McpServer {
  const server = new McpServer({
    name: 'gst-mcp',
    version: '0.1.0',
  });
  const scopes = ctx.scopes ?? DEFAULT_SCOPES;

  // BL-032.75 Phase 1: build the per-request MetricsContext once and thread
  // it to every register*. Stdio path (no metricsSink) gets the frozen
  // NOOP_METRICS_CONTEXT singleton — emission becomes a no-op without
  // changing any callsite shape. Worker passes
  // `{ metricsSink: AnalyticsEngineSink(env.METRICS), keyOwner: auth.keyOwner }`.
  const metrics: MetricsContext =
    ctx.metricsSink === undefined
      ? NOOP_METRICS_CONTEXT
      : { sink: ctx.metricsSink, keyOwner: ctx.keyOwner };

  // Tools (transport-portable)
  registerDiligenceTool(server, metrics);
  registerPortfolioTools(server, metrics);
  registerIcgTool(server, metrics);
  registerTechparTool(server, metrics);
  registerTechDebtTool(server, metrics);
  registerRegulationsTool(server, metrics);
  registerRadarLiveTools(server, env, metrics);
  registerGenerateIrlXlsxTool(server, metrics);
  registerValidateIrlProvenanceTool(server, metrics);

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
