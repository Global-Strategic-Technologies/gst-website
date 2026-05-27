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
import { guardEvent } from './guard';
import type { EventType, MetricEvent } from './_schema';
import type { MetricSink } from './sinks/_interface';

export interface MetricsContext {
  readonly sink: MetricSink;
  readonly keyOwner?: string;
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
  inner: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    const startedAt = Date.now();
    try {
      const result = await inner(...args);
      emit(ctx.sink, {
        event_type: eventType,
        name,
        keyOwner: ctx.keyOwner,
        outcome: detectOutcome(result),
        duration_ms: Date.now() - startedAt,
      });
      return result;
    } catch (err) {
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
 */
export function withToolMetrics<
  TArgs extends readonly unknown[],
  TResult extends { isError?: boolean },
>(
  name: string,
  ctx: MetricsContext,
  inner: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  return withMetricsCore(
    'tool_invocation',
    name,
    ctx,
    (result) => (result.isError ? 'error' : 'success'),
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
  inner: (...args: TArgs) => Promise<TResult>
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
  inner: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  return withMetricsCore('prompt_invocation', name, ctx, () => 'success', inner);
}

/**
 * Best-effort emission. `guardEvent` validates against the schema; rejected
 * events are silently dropped (with a `safeLog` line from inside the guard).
 * `sink.write` is contractually non-throwing — see `sinks/_interface.ts`.
 */
function emit(sink: MetricSink, event: MetricEvent): void {
  const validated = guardEvent(event);
  if (validated !== null) {
    sink.write(validated);
  }
}
