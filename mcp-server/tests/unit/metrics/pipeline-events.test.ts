/**
 * BL-157 — guards for the two pipeline refusal emitters.
 *
 * Asserts against a fake `AnalyticsEngineDataset` binding rather than a
 * `MetricSink` double, because these emitters take `env` and construct their
 * own `AnalyticsEngineSink` (the deliberate `trial/signup.ts` idiom — at both
 * call sites no sink exists yet). There is no sink to inject, so the dataset
 * binding is the seam. That is the stronger assertion anyway: it pins the
 * final POSITIONAL column map, not the pre-serialization `MetricEvent`, so a
 * blob-slot reshuffle fails here rather than silently re-labelling every
 * dashboard panel. Fake shape lifted from `tests/unit/trial/signup.test.ts`.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  emitRateLimitDecision,
  emitScopeDenial,
  emitTierDenial,
} from '../../../src/metrics/pipeline-events';
import { AnalyticsEngineSink } from '../../../src/metrics/_index';
import { BLOB_SLOTS, NAME_VALUES } from '../../../src/metrics/_schema';
import type { Env } from '../../../src/env';

const aePoints: { blobs: (string | null)[]; doubles: number[]; indexes: string[] }[] = [];
const metricsDataset = {
  writeDataPoint: vi.fn((dp: (typeof aePoints)[number]) => {
    aePoints.push(dp);
  }),
};
const envWith = (metrics: unknown) => ({ METRICS: metrics }) as unknown as Env;
const env = () => envWith(metricsDataset);

/**
 * Read a captured point by FIELD NAME, resolved through `BLOB_SLOTS` rather
 * than by hardcoded index — so the assertions below describe the schema
 * instead of duplicating it.
 */
const field = (dp: (typeof aePoints)[number], name: string): string | null => {
  const spec = BLOB_SLOTS.find((b) => b.field === name);
  if (!spec) throw new Error(`no blob slot named ${name}`);
  return dp.blobs[spec.slot - 1] ?? null;
};

beforeEach(() => {
  aePoints.length = 0;
  metricsDataset.writeDataPoint.mockClear();
});

describe('emitRateLimitDecision', () => {
  it('writes one deny point carrying the refusing bucket and a 429', () => {
    emitRateLimitDecision(env(), {
      keyOwner: 'OAUTH:M2M:TRIAL',
      clientRef: 'OAUTH:m2m_abc123',
      outcome: 'deny',
      responsibleTier: 'radar-minute',
    });

    expect(aePoints).toHaveLength(1);
    const dp = aePoints[0];
    expect(field(dp, 'event_type')).toBe('rate_limit_decision');
    expect(field(dp, 'outcome')).toBe('deny');
    expect(field(dp, 'name')).toBe('radar-minute');
    expect(field(dp, 'status_code')).toBe('429');
    expect(field(dp, 'client_ref')).toBe('OAUTH:m2m_abc123');
    // keyOwner is mirrored into the AE index — the property ADR-0031 rests on.
    expect(dp.indexes).toEqual(['OAUTH:M2M:TRIAL']);
  });

  it('omits status_code on throttle, because the request has not resolved yet', () => {
    // The throttled request PROCEEDS. Writing a speculative '200' here would
    // be indistinguishable from a measured one on the dashboard.
    emitRateLimitDecision(env(), {
      keyOwner: 'INTERNAL',
      outcome: 'throttle',
      responsibleTier: 'day',
    });

    expect(aePoints).toHaveLength(1);
    expect(field(aePoints[0], 'outcome')).toBe('throttle');
    expect(field(aePoints[0], 'status_code')).toBeNull();
  });

  it('omits client_ref for identities that have none', () => {
    // Static bearer keys have no per-client identity; the column must be
    // absent rather than an empty string, or the distinct-actives count counts a phantom.
    emitRateLimitDecision(env(), {
      keyOwner: 'MCP_KEY_WEBSITE_RADAR',
      outcome: 'deny',
      responsibleTier: 'minute',
    });
    expect(field(aePoints[0], 'client_ref')).toBeNull();
  });
});

describe('emitTierDenial', () => {
  it('writes one point naming the refused tool, at HTTP 200', () => {
    emitTierDenial(env(), {
      keyOwner: 'OAUTH:M2M:TRIAL',
      clientRef: 'OAUTH:m2m_abc123',
      toolName: 'search_radar',
    });

    expect(aePoints).toHaveLength(1);
    const dp = aePoints[0];
    expect(field(dp, 'event_type')).toBe('tier_denial');
    expect(field(dp, 'outcome')).toBe('denied');
    // The commercial signal: WHICH gated tool the trial reached for.
    expect(field(dp, 'name')).toBe('search_radar');
    // Deliberately 200 — the gate returns JSON-RPC -32002 inside an HTTP 200
    // so the caller reads a refusal, not a broken connection. If this ever
    // becomes a 4xx, `tier-gate.ts` changed contract and clients care.
    expect(field(dp, 'status_code')).toBe('200');
    expect(field(dp, 'client_ref')).toBe('OAUTH:m2m_abc123');
  });
});

describe('both emitters — METRICS unbound', () => {
  it('is a no-op rather than a throw when the binding is absent', () => {
    // stdio, local dev and tests all run without the binding. An observability
    // gap must never become a request failure.
    const bare = envWith(undefined);
    expect(() =>
      emitRateLimitDecision(bare, {
        keyOwner: 'K',
        outcome: 'deny',
        responsibleTier: 'minute',
      })
    ).not.toThrow();
    expect(() => emitTierDenial(bare, { keyOwner: 'K', toolName: 't' })).not.toThrow();
    expect(aePoints).toHaveLength(0);
  });
});

describe('emission policy (ADR-0032)', () => {
  it('offers no way to emit an allow', () => {
    // `allow` would fire on every authenticated request, pushing the dataset
    // toward sampling — and `count(DISTINCT blob8)`, which ADR-0031's distinct-trials
    // query depends on, has no sample correction. The type system is the
    // guard: this must remain a compile error, not a convention.
    //
    // Deliberately NOT invoked. `'allow'` is a legal `OUTCOME_VALUES` entry,
    // so calling this would pass `guardEvent` and write a real `allow` point
    // — the test would assert the policy while violating it. `@ts-expect-error`
    // is checked by `tsc`, which never runs the body, so a typed reference is
    // the whole assertion.
    const emitAllow = () =>
      // @ts-expect-error 'allow' is deliberately not an emittable outcome
      emitRateLimitDecision(env(), { keyOwner: 'K', outcome: 'allow', responsibleTier: 'minute' });
    expect(typeof emitAllow).toBe('function');
    expect(aePoints).toHaveLength(0);
  });
});

describe('emitScopeDenial (BL-159)', () => {
  // Takes a SINK, not `env`, unlike the two emitters above — the MCP
  // `resources/read` denial path already holds a `MetricsContext`, while the
  // plain-HTTP one builds a sink from `env`. Tested through a real
  // `AnalyticsEngineSink` over the fake dataset so the assertion still lands on
  // the final positional column map.
  const sink = () => new AnalyticsEngineSink(metricsDataset as never);

  it('writes one point carrying the missing scope and a real 403', () => {
    emitScopeDenial(sink(), {
      keyOwner: 'ACME',
      clientRef: 'OAUTH:m2m_abc',
      missingScope: 'resource:radar:read',
    });

    expect(aePoints).toHaveLength(1);
    const dp = aePoints[0];
    expect(field(dp, 'event_type')).toBe('scope_denial');
    expect(field(dp, 'name')).toBe('resource:radar:read');
    expect(field(dp, 'outcome')).toBe('denied');
    // A real forbidden, where `tier_denial` records '200'. The asymmetry is the
    // point: it is what lets the alert count scope refusals without counting
    // tier refusals, which are a legible JSON-RPC error inside an HTTP 200.
    expect(field(dp, 'status_code')).toBe('403');
    expect(field(dp, 'client_ref')).toBe('OAUTH:m2m_abc');
    expect(dp.indexes).toEqual(['ACME']);
  });

  it('falls back to the keyOwner placeholder when there is no caller identity', () => {
    // The MCP resource handler runs on stdio with NOOP_METRICS_CONTEXT, which
    // carries no keyOwner. AE requires a non-empty index, and `toDataPoint`
    // substitutes the documented sentinel — pinned here because the emitter
    // deliberately widens `keyOwner` to optional to allow this path.
    emitScopeDenial(sink(), { missingScope: 'resource:radar:read' });

    expect(aePoints).toHaveLength(1);
    expect(aePoints[0].indexes).toEqual(['__none__']);
    expect(field(aePoints[0], 'client_ref')).toBeNull();
  });

  it('emits a name that NAME_VALUES pins, so the guard cannot reject it', () => {
    // The runtime guard rejects a `name` outside NAME_VALUES for pinned types.
    // A typo here would drop the event silently and take the alert with it.
    emitScopeDenial(sink(), { keyOwner: 'ACME', missingScope: 'resource:radar:read' });
    expect(NAME_VALUES.scope_denial).toContain(field(aePoints[0], 'name'));
  });
});
