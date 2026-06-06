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
    // BL-071 — record `attempted` BEFORE inner runs so the envelope tool's
    // own snapshot includes its own in-flight attempt. Only meaningful for
    // tool_invocation; resource/prompt counters not in scope today.
    if (eventType === 'tool_invocation') {
      ctx.counters?.record(name, 'attempted');
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
