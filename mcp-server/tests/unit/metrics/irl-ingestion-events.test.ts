/**
 * Unit tests for the BL-045 PR B metric emitters in
 * `src/metrics/irl-ingestion-events.ts`.
 *
 * Pattern: in-memory sink captures emitted events; each test asserts the
 * shape that downstream Grafana SQL will read (event_type, name, outcome).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  emitGateElided,
  emitIrlRunVerdicts,
  emitWrongIrlDetected,
} from '../../../src/metrics/irl-ingestion-events';
import type { MetricsContext } from '../../../src/metrics/with-metrics';
import { NAME_VALUES, type MetricEvent } from '../../../src/metrics/_schema';
import { ORCHESTRATED_TOOLS } from '../../../src/prompts/irl-ingestion';

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

// BL-157 wired these from `compose_dossier_envelope`; the handler path is
// covered in `tests/integration/bl-071-precheck-derivation.test.ts`.
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

  it('drops a model-invented tool name (NAME_VALUES pin)', () => {
    emitGateElided(ctx, 'totally_made_up_tool');
    expect(sink.events).toHaveLength(0);
  });

  it('pins exactly the orchestrated tools that have a gate', () => {
    // `compose_dossier_envelope` is orchestrated but is the envelope step
    // itself, never gated. Any other drift means the pin is stale.
    const gated = ORCHESTRATED_TOOLS.filter((t) => t !== 'compose_dossier_envelope');
    expect([...(NAME_VALUES.gate_elided ?? [])].sort()).toEqual([...gated].sort());
  });
});

describe('emitIrlRunVerdicts', () => {
  let ctx: MetricsContext;
  let sink: Sink;
  beforeEach(() => {
    ({ ctx, sink } = makeCtx());
  });

  it("emits the verdict it is given and one event per elided gate on a run's first compose", () => {
    emitIrlRunVerdicts(ctx, {
      verdict: 'partial',
      elidedTools: ['search_radar', 'compute_techpar'],
      priorSucceeded: 0,
    });
    expect(sink.events.map((e) => [e.event_type, e.outcome, e.name])).toEqual([
      ['wrong_irl_detected', 'partial', 'gst_irl_ingestion'],
      ['gate_elided', 'elided', 'search_radar'],
      ['gate_elided', 'elided', 'compute_techpar'],
    ]);
  });

  it('skips the verdict when it is null (incoherent counts) but still emits gates', () => {
    emitIrlRunVerdicts(ctx, { verdict: null, elidedTools: ['search_radar'], priorSucceeded: 0 });
    expect(sink.events.map((e) => e.event_type)).toEqual(['gate_elided']);
  });

  it('emits verdict only when no gate was elided', () => {
    emitIrlRunVerdicts(ctx, { verdict: 'ok', elidedTools: [], priorSucceeded: 0 });
    expect(sink.events.map((e) => e.event_type)).toEqual(['wrong_irl_detected']);
  });

  it('emits nothing on a re-call (an earlier compose in the run succeeded)', () => {
    emitIrlRunVerdicts(ctx, { verdict: 'ok', elidedTools: ['search_radar'], priorSucceeded: 1 });
    expect(sink.events).toHaveLength(0);
  });
});
