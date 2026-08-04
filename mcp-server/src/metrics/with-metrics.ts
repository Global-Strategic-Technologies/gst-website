/**
 * BL-032.75 Phase 1 — `withMetrics` HOF.
 *
 * Wraps an MCP handler at registration time so every invocation emits one
 * metric event to the bound `MetricSink`. Single-chokepoint pattern —
 * mirrors Phase 0's `fetchInoreaderTracked` chokepoint at `singleFetch`.
 *
 * Three variants for the three MCP surfaces (Tool / Resource / Prompt) —
 * each knows how to detect success vs error for its surface's result
 * convention, and emits the right `event_type`. Underneath, all three
 * use the same `withMetricsCore` generic so timing + error handling stays
 * single-source.
 *
 * Usage at registration site (Phase 1 Step 4 will wire these in):
 * ```ts
 * server.registerTool(
 *   'search_radar',
 *   config,
 *   withToolMetrics('search_radar', ctx, handleSearchRadar),
 * );
 * ```
 *
 * `ctx` carries the `MetricSink` and the per-request `keyOwner`. Both come
 * from `createServer(env, { metricsSink, keyOwner })` — the Worker builds
 * the MCP server fresh per-request, so closures capture per-request state
 * (no AsyncLocalStorage / no new request-context primitive — the existing
 * pattern is sufficient).
 *
 * **Failure mode**: emission failures are best-effort. `guard.ts` rejects
 * invalid events with a `safeLog` line; the sink itself never throws.
 * Wrapped handlers behave identically to unwrapped ones from the caller's
 * perspective — wall-clock cost is one `Date.now()` + one synchronous
 * `sink.write()`.
 */
import { safeLog } from '../auth/safe-logger';
import { guardEvent } from './guard';
import type { EventType, MetricEvent } from './_schema';
import type { MetricSink } from './sinks/_interface';
import type { IrlBodyCache } from '../cache/irl-body-cache';
import type { AuditContext } from '../audit/audit-sink';
import { newEntryId } from '../audit/redaction';
import { AUDIT_SCHEMA_VERSION, type AuditEntry, type AuditOutcome } from '../audit/entry';

export interface MetricsContext {
  readonly sink: MetricSink;
  readonly keyOwner?: string;
  /**
   * BL-071 — optional server-arithmetic counter accumulator. When present,
   * `withToolMetrics` records one `attempted` event at wrap entry (BEFORE
   * inner runs) and one `success` | `rejected` | `errored` event at wrap
   * exit. The `compose_dossier_envelope` handler reads the snapshot at
   * envelope-build time and emits it as `serverToolCallCounts` so the model
   * can copy it verbatim into the BL-045-VERIFY block (closing the empirical
   * drift where the model self-narrated `toolCallCounts` and either fabricated
   * a tool call or omitted one).
   *
   * Scope: process-lifetime in the stdio path (one counter map per Claude
   * Desktop session); per-request in the Worker path (each fetch handler
   * builds a fresh `InMemoryToolCallCounters`). Undefined in tests / default
   * NOOP context — backward-compatible no-op.
   */
  readonly counters?: ToolCallCounters;
  /**
   * BL-076 — optional IRL-body cache. When present, `prepare_irl_body` writes
   * the body keyed by its canonical 16-hex hash on every call;
   * `compose_dossier_envelope` reads from the same cache to re-hydrate the
   * body for internal provenance verification (the body is no longer in the
   * compose tool's input schema). Cache miss throws `Bl076BodyCacheMissError`
   * with an actionable diagnostic. Undefined in tests / default NOOP context
   * — backward-compatible no-op (engine tests pass `filledIrl` directly and
   * bypass the cache entirely). See
   * `src/docs/adr/0002-irl-body-by-hash-cache.md`.
   *
   * Scoping (matches BL-071 `counters` pattern):
   *   - stdio: process-lifetime in-memory LRU (one per Claude Desktop session)
   *   - Worker: per-request `UpstashIrlBodyCache` (cross-isolate persistence
   *     in shared KV; MUST be Upstash-backed — in-memory in Worker mode would
   *     silently miss across isolate rotations).
   */
  readonly irlBodyCache?: IrlBodyCache;
  /**
   * BL-033 Slice 3a — optional compliance audit carrier. When present,
   * `withMetricsCore` builds a full `AuditEntry` (incl. input params +
   * output byte-size) for every `tool_invocation` and enqueues it to the
   * audit Queue via the fire-and-forget `AuditSink`. Deliberately SEPARATE
   * from `sink` (the AE ops path) — input params must never reach AE / Sentry
   * / Cloudflare logs (ADR-0009). Undefined in stdio / tests / when the
   * `AUDIT_QUEUE` binding is absent (→ no-op). Gated to tools this slice.
   */
  readonly audit?: AuditContext;
  /**
   * BL-033 Slice 5 — the boundary's rate-limit result for this request.
   * When some bucket is ≥80% consumed (`minRemainingRatio <= 0.20`),
   * `withMetricsCore` emits a best-effort `notifications/message` warning on
   * the request's SSE stream so a compliant agent can throttle itself before
   * the hard 429. Undefined for stdio / tests / graceful-skip (→ no warning).
   * The always-present `RateLimit-*` headers are the guaranteed fallback.
   */
  readonly rateLimit?: RateLimitCheck;
}

/**
 * Minimal shape of a rate-limit `CheckResult` this module needs for the
 * soft-limit warning — mirrored locally to avoid importing the limiter
 * (and its `@upstash/ratelimit` dependency) into the metrics module.
 */
export interface RateLimitCheck {
  readonly tier: string;
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt: number;
  readonly minRemainingRatio?: number;
  /**
   * The bucket that owns `minRemainingRatio` (the proportional-closest to its
   * cliff) — which may differ from the binding bucket named by the fields
   * above. The soft-limit warning reports THIS bucket so the agent throttles
   * the window that is actually under pressure. Falls back to the top-level
   * fields when absent (fixtures / legacy callers).
   */
  readonly nearestLimit?: {
    readonly tier: string;
    readonly limit: number;
    readonly remaining: number;
    readonly resetAt: number;
  };
}

/**
 * BL-071 — server-arithmetic tool-call counter taxonomy.
 *
 * Four states per tool, tracked separately so the BL-045-VERIFY-block
 * arithmetic identity `precheck.iterations === validate_irl_provenance.succeeded`
 * (and friends) is derivable from the snapshot the envelope tool emits.
 *
 * `attempted` is recorded at wrap entry — strictly BEFORE `inner` runs —
 * so the envelope tool's OWN snapshot includes its own in-flight attempt
 * (audit M1: prevents the confusing `attempted: 0, succeeded: 0` shape
 * the envelope tool would otherwise show for itself).
 *
 * `succeeded` / `rejected` / `errored` are recorded at wrap exit:
 *   - `succeeded`: inner returned without `isError`
 *   - `rejected`: inner returned a result with `isError === true` (structured rejection)
 *   - `errored`: inner threw (transport/internal failure)
 */
export type ToolCallCounterEvent = 'attempted' | 'success' | 'rejected' | 'errored';

export interface ToolCallCounterEntry {
  attempted: number;
  succeeded: number;
  rejected: number;
  errored: number;
}

export interface ToolCallCounters {
  record(toolName: string, event: ToolCallCounterEvent): void;
  snapshot(): Record<string, ToolCallCounterEntry>;
}

/**
 * Default in-process accumulator. Map mutations are safe because:
 *   (a) stdio = single JS event loop — no true parallelism in tool handler
 *       bodies; the MCP SDK serializes tool invocations per server instance.
 *   (b) Worker counters are per-request — each request gets a fresh
 *       `InMemoryToolCallCounters` so no cross-request contention.
 * The `attempted`-at-wrap-entry record and the snapshot read inside the
 * envelope tool body are therefore not racing.
 */
export class InMemoryToolCallCounters implements ToolCallCounters {
  private readonly counters = new Map<string, ToolCallCounterEntry>();

  record(toolName: string, event: ToolCallCounterEvent): void {
    const cur = this.counters.get(toolName) ?? {
      attempted: 0,
      succeeded: 0,
      rejected: 0,
      errored: 0,
    };
    if (event === 'attempted') cur.attempted++;
    else if (event === 'success') cur.succeeded++;
    else if (event === 'rejected') cur.rejected++;
    else cur.errored++;
    this.counters.set(toolName, cur);
  }

  snapshot(): Record<string, ToolCallCounterEntry> {
    const out: Record<string, ToolCallCounterEntry> = {};
    for (const [name, entry] of this.counters) {
      out[name] = { ...entry };
    }
    return out;
  }
}

/**
 * BL-071 — counter-taxonomy projection. Distinct from the existing
 * 2-way `detectOutcome` (success/error) so the sink-event taxonomy
 * stays unchanged (additive). Tools that throw → 'errored';
 * tools that return `isError: true` → 'rejected'; everything else
 * → 'success'.
 */
type CounterOutcome = 'success' | 'rejected' | 'errored';
function detectCounterOutcome<TResult>(
  result: TResult | undefined,
  threw: boolean
): CounterOutcome {
  if (threw) return 'errored';
  if (result && (result as { isError?: boolean }).isError === true) return 'rejected';
  return 'success';
}

/**
 * Minimal structural view of the SDK v2 `ServerContext` fields we use.
 *
 * BL-106 — this replaced a duck-typing scan (`findMcpExtra`) that looked for
 * the first argument carrying a `sendNotification` function. That worked under
 * SDK v1's flat `RequestHandlerExtra`, but v2 renamed and nested the notifier
 * to `ctx.mcpReq.notify`. Because `maybeWarnSoftLimit` is contractually
 * non-throwing, the scan would have returned `undefined` forever and the
 * 80%-consumed warning would have died **silently** — no type error, and no
 * test failure either, since the soft-limit tests build their own fake.
 *
 * The fix is structural rather than defensive: the SDK passes its context as
 * the LAST argument on every tool callback overload, so we read that position
 * and let the shape be a type obligation. If a future SDK moves the notifier
 * again, the assertion in `with-metrics-softlimit.test.ts` fails loudly
 * instead of the warning quietly disappearing.
 */
interface McpServerContextView {
  mcpReq?: {
    notify?: (notification: unknown) => unknown;
  };
}

/**
 * Read the MCP handler context off the trailing argument.
 *
 * The SDK invokes tool callbacks as `(args, ctx)` for tools with an input
 * schema and `(ctx)` for zero-arg tools — in both shapes the context is last.
 * Returns `undefined` when the trailing arg carries no notifier (stdio without
 * a notification channel, or a unit test calling the handler directly).
 */
function findMcpNotifier(args: readonly unknown[]): McpServerContextView | undefined {
  const last = args[args.length - 1];
  if (
    last &&
    typeof last === 'object' &&
    typeof (last as McpServerContextView).mcpReq?.notify === 'function'
  ) {
    return last as McpServerContextView;
  }
  return undefined;
}

/**
 * BL-033 Slice 5 — emit the 80%-consumed soft-limit warning, best-effort.
 * When some rate-limit bucket is ≥80% spent (`minRemainingRatio <= 0.20`),
 * write a `notifications/message` onto this request's SSE stream so a
 * compliant agent can throttle itself before the hard 429. NEVER throws:
 * a missing `logging` capability, a non-SSE client, or an aborted request is
 * a visibility loss, not a tool-call failure. The always-present
 * `RateLimit-*` headers are the guaranteed fallback for clients that don't
 * consume interim notifications.
 */
function maybeWarnSoftLimit(rl: RateLimitCheck | undefined, args: readonly unknown[]): void {
  if (!rl || rl.minRemainingRatio == null || rl.minRemainingRatio > 0.2) return;
  const notify = findMcpNotifier(args)?.mcpReq?.notify;
  if (!notify) return;
  // Report the bucket that TRIPPED the ratio (`nearestLimit`), not the binding
  // bucket in the top-level fields — they can differ (binding = absolute-fewest;
  // ratio = proportional-fewest), and the agent should throttle the window that
  // is actually under pressure. Fall back to the top-level fields if absent.
  const b = rl.nearestLimit ?? rl;
  try {
    const resetSeconds = Math.max(0, Math.ceil((b.resetAt - Date.now()) / 1000));
    void Promise.resolve(
      notify({
        method: 'notifications/message',
        params: {
          level: 'warning',
          logger: 'ratelimit',
          data: {
            message:
              `Approaching rate limit (tier ${b.tier}): ${b.remaining} of ` +
              `${b.limit} remaining in the active window, resets in ${resetSeconds}s.`,
            tier: b.tier,
            limit: b.limit,
            remaining: b.remaining,
            resetSeconds,
          },
        },
      })
    ).catch(() => {
      /* best-effort — notification delivery failure never breaks the call */
    });
  } catch {
    /* best-effort — never break the tool call */
  }
}

/**
 * Generic core. Wraps an async function; emits one event of the given type
 * with outcome derived from the result (or `error` on throw).
 *
 * Exported for direct testing — production code calls the named variants
 * (`withToolMetrics`, `withResourceMetrics`, `withPromptMetrics`) below.
 */
export function withMetricsCore<TArgs extends readonly unknown[], TResult>(
  eventType: EventType,
  name: string,
  ctx: MetricsContext,
  detectOutcome: (result: TResult) => string,
  // Accepts sync OR async inner. Some SDK callback shapes (e.g. MCP prompts)
  // are typed `TResult | Promise<TResult>`; `await` works for both.
  inner: (...args: TArgs) => TResult | Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    const startedAt = Date.now();

    // BL-033 Slice 3a — build + enqueue a compliance audit entry. Gated to
    // tool_invocation (input arg shapes differ on resource/prompt surfaces).
    // Best-effort and fully wrapped: audit capture must NEVER break the tool
    // call. Input params + output size go ONLY to the audit sink, never to
    // the AE `emit()` path below.
    //
    // Perf note: when `ctx.audit` is bound, `outputBytes` costs one extra
    // synchronous `JSON.stringify(result)` on the response path (a second
    // serialization on top of the SDK's own) — so the "one Date.now() + one
    // sink.write" cost the module docstring quotes for metrics-only mode does
    // NOT hold with audit enabled. Acceptable at pilot volume; revisit (defer
    // the size computation, or approximate) if a large-result tool shows up
    // hot in the latency probe.
    const recordAudit = (
      outcome: AuditOutcome,
      result: TResult | undefined,
      errorCode?: string
    ): void => {
      const audit = ctx.audit;
      if (!audit || eventType !== 'tool_invocation') return;
      try {
        let outputBytes = 0;
        if (result !== undefined) {
          try {
            outputBytes = new TextEncoder().encode(JSON.stringify(result)).length;
          } catch {
            outputBytes = -1; // non-serializable / cyclic — size unknown.
          }
        }
        const entry: AuditEntry = {
          schemaVersion: AUDIT_SCHEMA_VERSION,
          entryId: newEntryId(),
          requestId: audit.requestId,
          tsIso: new Date().toISOString(),
          keyOwner: audit.keyOwner,
          ipPrefix: audit.ipPrefix,
          toolName: name,
          inputParams: args[0],
          outputBytes,
          durationMs: Date.now() - startedAt,
          outcome,
          ...(errorCode ? { errorCode } : {}),
        };
        audit.sink.write(entry);
      } catch {
        // Audit capture is best-effort — a build/emit fault is a visibility
        // loss, never a tool-call failure.
      }
    };

    // BL-071 — record `attempted` BEFORE inner runs so the envelope tool's
    // own snapshot includes its own in-flight attempt. Only meaningful for
    // tool_invocation; resource/prompt counters not in scope today.
    // BL-033 Slice 5 — same gate emits the soft-limit warning at wrap entry
    // (the ratio is already known from the boundary; deterministic, before
    // any tool work).
    if (eventType === 'tool_invocation') {
      ctx.counters?.record(name, 'attempted');
      maybeWarnSoftLimit(ctx.rateLimit, args);
    }
    try {
      const result = await inner(...args);
      if (eventType === 'tool_invocation') {
        ctx.counters?.record(name, detectCounterOutcome(result, false));
      }
      // B1 fix: detectOutcome MUST NOT take down the caller. A buggy projection
      // (e.g. accessing a field on an unexpected result shape) defaults to
      // 'success' so the handler's real return value still propagates. The
      // safeLog line surfaces the projection bug for operators without
      // converting a successful handler call into a thrown error.
      let outcome: string;
      try {
        outcome = detectOutcome(result);
      } catch (projectionErr) {
        outcome = 'success';
        safeLog({
          event: 'metrics.detect-outcome.threw',
          tool: name,
          reason: projectionErr instanceof Error ? projectionErr.message.slice(0, 200) : 'unknown',
          success: false,
          errorCode: 'metrics-detect-outcome',
        });
      }
      emit(ctx.sink, {
        event_type: eventType,
        name,
        keyOwner: ctx.keyOwner,
        outcome,
        duration_ms: Date.now() - startedAt,
      });
      // Audit outcome is the coarse success/error (a structured `isError`
      // rejection maps to 'error'); no errorCode on the non-throw path.
      recordAudit(outcome === 'error' ? 'error' : 'success', result);
      return result;
    } catch (err) {
      if (eventType === 'tool_invocation') {
        ctx.counters?.record(name, detectCounterOutcome(undefined, true));
      }
      emit(ctx.sink, {
        event_type: eventType,
        name,
        keyOwner: ctx.keyOwner,
        outcome: 'error',
        duration_ms: Date.now() - startedAt,
      });
      recordAudit('error', undefined, err instanceof Error ? err.name : 'error');
      throw err;
    }
  };
}

/**
 * Wrap a Tool handler. MCP convention: `result.isError === true` → error,
 * otherwise success.
 *
 * Constraint `TResult extends object` (not `{ isError?: boolean }`) — the
 * tighter shape triggers TypeScript's weak-type rejection against
 * `CallToolResult` literals like `{ content: [...] }` which don't carry
 * `isError` until error-path. Runtime cast covers the optional-field read
 * cleanly; SDK type compat verified via `tests/unit/metrics/sdk-integration.test.ts`.
 */
export function withToolMetrics<TArgs extends readonly unknown[], TResult extends object>(
  name: string,
  ctx: MetricsContext,
  inner: (...args: TArgs) => TResult | Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  return withMetricsCore(
    'tool_invocation',
    name,
    ctx,
    (result) => ((result as { isError?: boolean }).isError ? 'error' : 'success'),
    inner
  );
}

/**
 * Wrap a Resource handler. MCP resource handlers throw on error; a returned
 * result is always success. (No `isError` field in `ReadResourceResult`.)
 *
 * Cache-hit/miss distinction belongs to the Resource-cache layer — Phase 4
 * will wire that signal separately if we want `outcome=hit` vs `outcome=miss`
 * granularity; for now `resource_read.outcome` is just `success` / `error`.
 */
export function withResourceMetrics<TArgs extends readonly unknown[], TResult>(
  uri: string,
  ctx: MetricsContext,
  inner: (...args: TArgs) => TResult | Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  return withMetricsCore('resource_read', uri, ctx, () => 'success', inner);
}

/**
 * Wrap a Prompt handler. Prompts throw on error; a returned result is
 * always success. `prompt_span` events (per-step inside a fanout) are
 * emitted separately by `prompt-span.ts` — `withPromptMetrics` only
 * emits the top-level `prompt_invocation`.
 */
export function withPromptMetrics<TArgs extends readonly unknown[], TResult>(
  name: string,
  ctx: MetricsContext,
  inner: (...args: TArgs) => TResult | Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  return withMetricsCore('prompt_invocation', name, ctx, () => 'success', inner);
}

/**
 * Best-effort emission. `guardEvent` validates against the schema; rejected
 * events are silently dropped (with a `safeLog` line from inside the guard).
 * `sink.write` is contractually non-throwing — see `sinks/_interface.ts`.
 */
/**
 * Direct emit for code paths that build a metric event outside the HOF
 * wrappers (e.g. the cron scheduled handler in `worker.ts` — BL-032.77).
 * Routes through `guardEvent` so the schema is enforced uniformly across
 * every emit site; bypassing `guardEvent` (calling `sink.write` directly)
 * would let schema drift ship silently.
 *
 * Best-effort: rejected events drop with a `safeLog` line (the guard's
 * job); the sink itself is contractually non-throwing.
 */
export function emit(sink: MetricSink, event: MetricEvent): void {
  const validated = guardEvent(event);
  if (validated !== null) {
    sink.write(validated);
  }
}
