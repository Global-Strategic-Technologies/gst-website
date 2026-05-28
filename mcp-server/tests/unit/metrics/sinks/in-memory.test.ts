/**
 * BL-032.75 Phase 1 — InMemorySink contract tests.
 *
 * The contract is small: `write` collects events; `reset` clears them;
 * `ofType` filters. These tests pin that contract so future refactors
 * (e.g. adding a buffered variant) can't quietly break the test-side
 * assertion ergonomics.
 */
import { describe, expect, it } from 'vitest';
import type { MetricEvent } from '../../../../src/metrics/_schema';
import { InMemorySink } from '../../../../src/metrics/sinks/in-memory';
import { NoopSink } from '../../../../src/metrics/sinks/_interface';

describe('InMemorySink', () => {
  it('collects every written event in arrival order', () => {
    const sink = new InMemorySink();
    sink.write({ event_type: 'tool_invocation', name: 'a' });
    sink.write({ event_type: 'tool_invocation', name: 'b' });
    sink.write({ event_type: 'resource_read', name: 'gst://library/' });
    expect(sink.events.map((e) => e.name)).toEqual(['a', 'b', 'gst://library/']);
  });

  it('reset() drops all collected events without re-allocating the array', () => {
    const sink = new InMemorySink();
    const arrayRef = sink.events;
    sink.write({ event_type: 'tool_invocation', name: 'a' });
    sink.reset();
    expect(sink.events).toHaveLength(0);
    // Identity preserved so callers holding a reference to `events` see the
    // reset.
    expect(sink.events).toBe(arrayRef);
  });

  it('ofType filters by event_type discriminator', () => {
    const sink = new InMemorySink();
    sink.write({ event_type: 'tool_invocation', name: 'a' });
    sink.write({ event_type: 'resource_read', name: 'gst://library/' });
    sink.write({ event_type: 'tool_invocation', name: 'b' });
    expect(sink.ofType('tool_invocation').map((e) => e.name)).toEqual(['a', 'b']);
    expect(sink.ofType('resource_read').map((e) => e.name)).toEqual(['gst://library/']);
    expect(sink.ofType('prompt_invocation')).toEqual([]);
  });

  it('preserves event references (no defensive copy)', () => {
    const sink = new InMemorySink();
    const event: MetricEvent = { event_type: 'tool_invocation', name: 'a' };
    sink.write(event);
    expect(sink.events[0]).toBe(event);
  });
});

describe('NoopSink', () => {
  it('never throws on any input', () => {
    const sink = new NoopSink();
    expect(() => sink.write({ event_type: 'tool_invocation' })).not.toThrow();
    expect(() => sink.write({ event_type: 'cron_outcome', name: undefined })).not.toThrow();
  });
});
