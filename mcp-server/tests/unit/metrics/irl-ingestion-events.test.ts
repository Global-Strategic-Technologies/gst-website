/**
 * Unit tests for the BL-045 PR B metric emitters in
 * `src/metrics/irl-ingestion-events.ts`.
 *
 * Pattern: in-memory sink captures emitted events; each test asserts the
 * shape that downstream Grafana SQL will read (event_type, name, outcome).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  emitForceToolsUsed,
  emitGateElided,
  emitWrongIrlDetected,
} from '../../../src/metrics/irl-ingestion-events';
import type { MetricsContext } from '../../../src/metrics/with-metrics';
import type { MetricEvent } from '../../../src/metrics/_schema';

interface Sink {
  events: MetricEvent[];
  write: (e: MetricEvent) => void;
}

function makeCtx(): { ctx: MetricsContext; sink: Sink } {
  const sink: Sink = {
    events: [],
    write(e) {
      this.events.push(e);
    },
  };
  const ctx: MetricsContext = {
    keyOwner: 'RP',
    sink,
  };
  return { ctx, sink };
}

describe('emitForceToolsUsed', () => {
  let ctx: MetricsContext;
  let sink: Sink;
  beforeEach(() => {
    ({ ctx, sink } = makeCtx());
  });

  it('emits one event when forceTools is non-empty', () => {
    emitForceToolsUsed(ctx, ['compute_techpar', 'search_radar']);
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]).toMatchObject({
      event_type: 'force_tools_used',
      name: 'gst_irl_ingestion',
      keyOwner: 'RP',
      outcome: 'applied',
    });
  });

  it('emits nothing when forceTools is undefined', () => {
    emitForceToolsUsed(ctx, undefined);
    expect(sink.events).toHaveLength(0);
  });

  it('emits nothing when forceTools is an empty array', () => {
    emitForceToolsUsed(ctx, []);
    expect(sink.events).toHaveLength(0);
  });

  it('emits exactly one event regardless of array length (counter semantics)', () => {
    emitForceToolsUsed(ctx, [
      'compute_techpar',
      'estimate_tech_debt_cost',
      'assess_infrastructure_cost_governance',
    ]);
    expect(sink.events).toHaveLength(1);
  });
});

describe('emitWrongIrlDetected', () => {
  let ctx: MetricsContext;
  let sink: Sink;
  beforeEach(() => {
    ({ ctx, sink } = makeCtx());
  });

  for (const verdict of ['halt', 'partial', 'ok'] as const) {
    it(`emits one event for verdict "${verdict}"`, () => {
      emitWrongIrlDetected(ctx, verdict);
      expect(sink.events).toHaveLength(1);
      expect(sink.events[0]).toMatchObject({
        event_type: 'wrong_irl_detected',
        name: 'gst_irl_ingestion',
        outcome: verdict,
      });
    });
  }
});

describe('emitGateElided', () => {
  let ctx: MetricsContext;
  let sink: Sink;
  beforeEach(() => {
    ({ ctx, sink } = makeCtx());
  });

  it('carries the elided tool name in `name`', () => {
    emitGateElided(ctx, 'compute_techpar');
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]).toMatchObject({
      event_type: 'gate_elided',
      name: 'compute_techpar',
      outcome: 'elided',
    });
  });

  it('emits one event per call (caller decides cardinality)', () => {
    emitGateElided(ctx, 'compute_techpar');
    emitGateElided(ctx, 'estimate_tech_debt_cost');
    expect(sink.events).toHaveLength(2);
    expect(sink.events.map((e) => e.name)).toEqual(['compute_techpar', 'estimate_tech_debt_cost']);
  });
});
