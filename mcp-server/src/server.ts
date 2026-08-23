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
import {
  createWorkerCachedSnapshotReader,
  createWorkerSnapshotReader,
} from './content/radar-snapshot-reader-worker';
import {
  NO_FRESH_CURATED_ITEMS,
  SNAPSHOT_MISSING_STDIO,
  SNAPSHOT_UNAVAILABLE_REMOTE,
} from './content/radar-messages';
import type { SnapshotReader } from './content/radar-snapshot-reader';
import { registerPrompts } from './prompts/_registry';
import { DEFAULT_SCOPES } from './auth/scopes';
import {
  InMemoryIrlBodyCache,
  InMemoryToolCallCounters,
  NoopSink,
  UpstashIrlBodyCache,
  type CountersScope,
  type IrlBodyCache,
  type MetricsContext,
  UpstashRunCallCounters,
  type RunCallCounters,
} from './metrics/_index';
import {
  InMemoryIrlBodyProvenanceStore,
  UpstashIrlBodyProvenanceStore,
  type IrlBodyProvenanceStore,
} from './cache/irl-body-provenance';
import { computeIrlBodyHash } from './schemas/compose-dossier-envelope';
import { createCacheStore } from './lib/upstash-cache-store';
import type { Env } from './env';

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
   * SnapshotReader used for PROMPT embeds on the stdio path.
   *
   * Supplied by the stdio entrypoint (`index.ts`), never resolved here: the
   * stdio reader is backed by node:fs, and importing it in this module would
   * put the filesystem reader back into the Worker bundle — which is exactly
   * how `gst_radar_brief_today` came to fail remotely with a -32603.
   *
   * Ignored when `radarSource === 'worker'`; the Worker builds its own
   * cache-only reader from `env`. Omitted by tests, in which case a prompt
   * needing the snapshot renders its "unavailable" block.
   */
  radarReader?: SnapshotReader;

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
   * BL-123 — test override for the IRL body provenance store, mirroring
   * {@link irlBodyCache}. Production (stdio + Worker entrypoints) must NOT set
   * this; the auto-construction below owns the stdio-vs-Worker discriminator.
   *
   * Without this seam the `irlSource` cap path would only be exercisable
   * against real Upstash, which is precisely the kind of untestable branch
   * that ships wrong.
   */
  irlBodyProvenance?: import('./cache/irl-body-provenance').IrlBodyProvenanceStore;

  /**
   * BL-121 — test override for the durable run-scoped counters, mirroring
   * {@link irlBodyCache}. Production (stdio + Worker entrypoints) must NOT set
   * this; the auto-construction below owns the stdio-vs-Worker discriminator.
   *
   * Integration tests use it to drive the **Worker topology** — two
   * `createServer` calls, each with its own in-process map, sharing one
   * durable store — which is the shape the BL-071 identity actually has to
   * survive. Hand-building two `MetricsContext`s instead would re-encode the
   * topology by assertion and could not catch a wiring fault in this file,
   * which is where BL-121's bug lived.
   */
  runCounters?: RunCallCounters;

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
 * BL-121 — the three tools whose calls belong to an identifiable IRL run.
 *
 * `validate_irl_provenance` is the one the BL-071 identity counts;
 * `compose_dossier_envelope` is both a writer and the reader (its own exit
 * write is what a later re-call reads back); `prepare_irl_body` earns its
 * place as a **store-liveness canary** — a run with a durable row for it
 * proves the store was reachable at least once. Note the canary is absent
 * exactly where the strongest provenance path runs: prepop runs are told to
 * skip `prepare_irl_body` entirely.
 */
const RUN_KEYED_TOOLS = new Set([
  'validate_irl_provenance',
  'compose_dossier_envelope',
  'prepare_irl_body',
]);

/**
 * Resolve the durable run key for a tool call, or `undefined` when the call
 * belongs to no run (every non-IRL tool, and any IRL call whose args carry
 * neither a hash nor a body).
 *
 * **Key by the bytes the call actually operated on — so an inline `filledIrl`
 * wins over the bound hash.** The count answers exactly one question: *how
 * many calls verified the bytes compose is about to submit?* A validate call
 * that received `filledIrl` verified THAT body (`validate-irl-provenance.ts`
 * gives it precedence for matching and never cross-checks it against the
 * supplied hash), so it belongs in the composed run's count if and only if
 * those bytes hash to the composed body.
 *
 * Keying such a call by the bound hash instead would credit the composed run
 * with a verification that ran on **different bytes** — the identity would
 * close over work that never touched the submitted body. That is a false
 * green, which is the one failure mode this whole change refuses. (It also
 * costs nothing in the common case: when the inline body and the bound hash
 * agree, both branches produce the same key and there is no split at all.
 * A split happens only on real disagreement, which is precisely when the two
 * calls belong to two different bodies.)
 *
 * When a legitimate split occurs the composed run's count comes up short.
 * **That is a true signal, not a lost count** — the model verified bytes it
 * did not submit — and the prompt names it as one of the causes of a short
 * count.
 *
 * Re-hashing a body of up to 200KB per call duplicates what
 * `prepare_irl_body` computes anyway; deliberate, and cheap beside the
 * round-trip it guards.
 */
function runKeyOf(toolName: string, args: readonly unknown[]): string | undefined {
  if (!RUN_KEYED_TOOLS.has(toolName)) return undefined;
  const payload = args[0];
  if (!payload || typeof payload !== 'object') return undefined;
  const { irlBodyHash, filledIrl } = payload as {
    irlBodyHash?: unknown;
    filledIrl?: unknown;
  };
  if (typeof filledIrl === 'string' && filledIrl.length > 0) return computeIrlBodyHash(filledIrl);
  if (typeof irlBodyHash === 'string' && irlBodyHash.length > 0) return irlBodyHash;
  return undefined;
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

  // BL-123 — server-held provenance for cached IRL bodies, so the envelope can
  // CAP an over-strong `irlSource` claim rather than trusting the model.
  //
  // Takes the body cache's dual-impl SHAPE (stdio gets a real in-process store,
  // because the render and the compose share one process there, so the cap
  // fully works locally) but the counters' FAILURE SEMANTICS: unbound Upstash
  // degrades to `undefined` instead of throwing. A missing body corrupts the
  // dossier; a missing provenance record only weakens an audit claim, and
  // hard-failing every envelope call on a KV outage would be a far worse
  // trade than falling back to the model's assertion labelled unverified.
  //
  // NEVER in-memory on the Worker: isolates rotate between requests, so the
  // render's write would be invisible to the compose and every honest prepop
  // run would silently downgrade.
  const irlBodyProvenance: IrlBodyProvenanceStore | undefined = (() => {
    if (ctx.irlBodyProvenance) return ctx.irlBodyProvenance;
    if (ctx.metricsSink === undefined) return new InMemoryIrlBodyProvenanceStore();
    // `retry: false` — BL-121's lesson, carried over. This store adds one read
    // to `compose_dossier_envelope` and a read-then-write to
    // `prepare_irl_body`, for a value that only labels an audit claim. The SDK
    // default (six attempts, ~4,289 ms of backoff) would put a degraded Upstash
    // on the response path of every one of those calls. Failing quiet is the
    // point; failing quiet AND slow is not.
    const store = createCacheStore(env, { retry: false });
    return store ? new UpstashIrlBodyProvenanceStore(store) : undefined;
  })();

  // BL-121 — durable run-scoped counters, and the regime label that says
  // whether the BL-071 precheck identities can be checked at all.
  //
  // Resolved EAGERLY, unlike the body cache above: `UpstashRunCallCounters
  // .fromEnv` only reads two env bindings (no I/O), so knowing here whether
  // the store exists costs nothing — and `countersScope` has to be decided
  // here, where the transport and the binding are both visible. Deriving it
  // downstream from "did the durable read return rows" would collapse to a
  // constant, because `compose_dossier_envelope` writes its own row before
  // reading, so the key is never empty on the Worker.
  //
  // Unbound Upstash does NOT throw here, deliberately diverging from BL-076's
  // body cache: a missing body corrupts the dossier, a missing counter only
  // weakens a report. Degrade to 'request' and say so.
  //
  // Durable counters are a REMOTE concern only, and the `isStdio` branch is
  // deliberately outermost so that is unambiguous: on stdio the in-process map
  // already spans the whole session ('session' scope), so a durable store adds
  // nothing and would only put network I/O into a local process. A
  // `ctx.runCounters` override supplied WITHOUT a `metricsSink` is therefore
  // ignored by design rather than by accident — the previous ordering accepted
  // the override, then silently declined to thread it below.
  const isStdio = ctx.metricsSink === undefined;
  const runCounters = isStdio
    ? undefined
    : (ctx.runCounters ?? UpstashRunCallCounters.fromEnv(env));
  const countersScope: CountersScope = isStdio ? 'session' : runCounters ? 'run' : 'request';

  // NB: the discriminator is spelled inline here rather than reusing `isStdio`
  // above — a boolean alias does not narrow `ctx.metricsSink` for TypeScript,
  // and the Worker branch needs it narrowed to non-undefined for `sink`.
  const metrics: MetricsContext =
    ctx.metricsSink === undefined
      ? {
          sink: new NoopSink(),
          counters: new InMemoryToolCallCounters(),
          irlBodyCache,
          irlBodyProvenance,
          audit: ctx.audit,
          rateLimit: ctx.rateLimit,
          countersScope,
        }
      : {
          sink: ctx.metricsSink,
          keyOwner: ctx.keyOwner,
          counters: new InMemoryToolCallCounters(),
          irlBodyCache,
          irlBodyProvenance,
          audit: ctx.audit,
          rateLimit: ctx.rateLimit,
          runCounters: runCounters ?? undefined,
          runKeyOf,
          countersScope,
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

  // Prompts. `gst_radar_brief_today` embeds the FYI tier, and both the reader
  // and the degraded-state wording are transport-specific — so they are
  // resolved HERE and passed in, rather than chosen inside the prompt module
  // (which cannot see its transport, and which previously reached for the
  // node:fs reader and broke every remote `prompts/get` with a -32603).
  //
  // Worker: the CACHE-ONLY reader. A prompt expansion is model-initiated, so
  // it must not be able to spend Inoreader budget on a cold cache — see
  // `createWorkerCachedSnapshotReader`.
  //
  // `server.ts` must never import `stdioSnapshotReader`: that would pull
  // node:fs into the Worker bundle, which is the bug class this fix closes.
  // The stdio entrypoint supplies it via `ctx.radarReader` instead.
  registerPrompts(
    server,
    metrics,
    ctx.radarSource === 'worker'
      ? {
          radarReader: createWorkerCachedSnapshotReader(env),
          messages: {
            unavailable: SNAPSHOT_UNAVAILABLE_REMOTE,
            empty: NO_FRESH_CURATED_ITEMS,
          },
        }
      : {
          radarReader: ctx.radarReader,
          messages: { unavailable: SNAPSHOT_MISSING_STDIO, empty: NO_FRESH_CURATED_ITEMS },
        }
  );

  return server;
}
