/**
 * BL-032.75 Phase 1 — `MetricSink` interface.
 *
 * Vendor-neutral abstraction over the metric-emission destination. Lets
 * production code use `AnalyticsEngineSink` (writes to Cloudflare AE) while
 * tests use `InMemorySink` (collects events into an array for assertion).
 *
 * Adding a sink: implement this interface, export it from `sinks/`, and
 * pass an instance into `createServer(env, { metricsSink })`. No emitter or
 * registry code needs to change.
 *
 * The ~30 LOC interface is forward-thinking insurance — if we ever want to
 * dual-write to a second backend (e.g. Datadog, Honeycomb) or migrate off
 * AE, the change lives in one file. Vitest's `InMemorySink` is a direct
 * payoff: assertions become `expect(sink.events).toContainEqual(...)` rather
 * than mocking the Cloudflare binding.
 */
import type { MetricEvent } from '../_schema';

export interface MetricSink {
  /**
   * Record one metric event. Must be non-throwing — emission failures are
   * a "loss of visibility into visibility" event, not a request failure
   * (see BL-032.76 sentry-envelope pattern). Sinks log internally if
   * they need to.
   *
   * AE writes are non-blocking by design — implementations should not
   * await network I/O. The interface is sync to enforce this at the
   * type level.
   */
  write(event: MetricEvent): void;
}

/**
 * No-op sink — emits nothing, never throws. Used when `metricsSink` is not
 * passed to `createServer` (e.g. the stdio entrypoint, or unit tests that
 * don't care about emission).
 *
 * Preferred over `null`/`undefined` checks at every emit site: handlers
 * always have a sink, the sink may just do nothing.
 */
export class NoopSink implements MetricSink {
  write(_event: MetricEvent): void {
    // Intentionally empty.
  }
}
