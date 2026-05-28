/**
 * BL-032.75 Phase 1 — `InMemorySink`.
 *
 * Test sink — collects every written event into an array for vitest
 * assertions. Replaces the alternative of mocking the Cloudflare
 * `AnalyticsEngineDataset` binding (fiddly, brittle to SDK changes).
 *
 * Typical use:
 * ```ts
 * const sink = new InMemorySink();
 * const server = createServer(env, { metricsSink: sink, keyOwner: 'TEST' });
 * await invokeTool(server, 'search_radar', { tier: 'wire' });
 * expect(sink.events).toContainEqual(
 *   expect.objectContaining({ event_type: 'tool_invocation', name: 'search_radar' }),
 * );
 * ```
 *
 * `reset()` lets a single test file share one sink across multiple `it`s
 * without cross-pollution.
 */
import type { MetricEvent } from '../_schema';
import type { MetricSink } from './_interface';

export class InMemorySink implements MetricSink {
  readonly events: MetricEvent[] = [];

  write(event: MetricEvent): void {
    this.events.push(event);
  }

  /**
   * Drop all collected events. Call from `beforeEach` if reusing one sink
   * across tests.
   */
  reset(): void {
    this.events.length = 0;
  }

  /**
   * Convenience filter — events of a single type. Avoids a `filter` boilerplate
   * in every assertion.
   */
  ofType(eventType: MetricEvent['event_type']): MetricEvent[] {
    return this.events.filter((e) => e.event_type === eventType);
  }
}
