/**
 * BL-157 — the WIRING guard: proves the two refusal emitters are actually
 * invoked from the pipeline, on the right branches, with the right values.
 *
 * `tests/unit/metrics/pipeline-events.test.ts` proves the emitters produce
 * correct data points. That is not the same claim: an emitter nothing calls
 * has exactly the observability of no emitter at all, which is the failure
 * this whole change exists to fix. Hence a test that drives the real handler.
 *
 * **Why `agents/mcp/server` is mocked.** `handle-authenticated.ts` had no unit
 * test before this — the only test naming it (`tests/unit/oauth/api-handler`)
 * mocks the module wholesale — and importing it un-mocked under vitest's
 * `environment: 'node'` HANGS (measured: a bare `await import(...)` times out
 * at 5s; with this one mock in place the same import resolves in ~1.5s). The
 * culprit is the `agents/mcp/server` module-scope import, which expects the
 * workerd runtime. Mocking that one dependency is deliberately preferred over
 * an `unstable_dev` worker test: BL-149 tracks `unstable_dev` as the flakiest
 * harness in this suite, and nothing asserted here needs a real Worker — both
 * refusal paths return BEFORE any MCP handler is constructed.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ExecutionContext } from '@cloudflare/workers-types';

// `createMcpHandler` returns the fetch handler itself, not an object wrapping
// one — the pipeline calls the result directly as `mcp(request, env, ctx)`.
vi.mock('agents/mcp/server', () => ({
  createMcpHandler: vi.fn(() => vi.fn(async () => new Response('ok'))),
}));

// `vi.mock` is hoisted above every `const`, so the doubles it closes over must
// be created by `vi.hoisted` rather than declared here — otherwise the factory
// runs first and dies on a TDZ `ReferenceError`.
const { check, limiter } = vi.hoisted(() => {
  const check = vi.fn();
  return { check, limiter: vi.fn((): { check: typeof check } | null => ({ check })) };
});
vi.mock('../../../src/ratelimit/limiter', () => ({ createLimiter: limiter }));

import { handleAuthenticated } from '../../../src/pipeline/handle-authenticated';
import type { AuthSuccess } from '../../../src/auth/bearer';
import type { Env } from '../../../src/env';

const aePoints: { blobs: (string | null)[]; doubles: number[]; indexes: string[] }[] = [];
const metricsDataset = {
  writeDataPoint: vi.fn((dp: (typeof aePoints)[number]) => {
    aePoints.push(dp);
  }),
};

const env = () => ({ METRICS: metricsDataset }) as unknown as Env;
const ctx = () => ({ waitUntil() {}, passThroughOnException() {} }) as unknown as ExecutionContext;

/** A `tools/call` for the named tool, which is what the tier gate inspects. */
const toolCall = (name: string) =>
  new Request('https://mcp.test/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name } }),
  });

const trialAuth: AuthSuccess = {
  ok: true,
  keyOwner: 'OAUTH:M2M:TRIAL',
  scopes: ['tool:*'],
  tier: 'trial',
  rateLimitSubject: 'OAUTH:m2m_trial_abc',
};

const paidAuth: AuthSuccess = {
  ok: true,
  keyOwner: 'OAUTH:M2M:ACME',
  scopes: ['tool:*'],
  tier: 'paid',
  rateLimitSubject: 'OAUTH:m2m_acme_xyz',
};

/** Events of one type, flattened to the fields these assertions care about. */
const eventsOfType = (type: string) =>
  aePoints
    .filter((dp) => dp.blobs[0] === type)
    .map((dp) => ({
      name: dp.blobs[1],
      outcome: dp.blobs[3],
      status_code: dp.blobs[5],
      client_ref: dp.blobs[7],
      index: dp.indexes[0],
    }));

const allowed = (over: Partial<Record<string, unknown>> = {}) => ({
  allowed: true,
  limit: 60,
  remaining: 40,
  resetAt: Date.now() + 60_000,
  tier: 'minute',
  minRemainingRatio: 0.67,
  ...over,
});

beforeEach(() => {
  aePoints.length = 0;
  metricsDataset.writeDataPoint.mockClear();
  check.mockReset();
  limiter.mockReset();
  limiter.mockReturnValue({ check });
});

describe('tier denial → tier_denial event', () => {
  it('emits when a trial identity is refused a radar tool', async () => {
    check.mockResolvedValue(allowed());

    await handleAuthenticated(toolCall('search_radar'), env(), ctx(), trialAuth);

    expect(eventsOfType('tier_denial')).toEqual([
      {
        name: 'search_radar',
        outcome: 'denied',
        status_code: '200',
        client_ref: 'OAUTH:m2m_trial_abc',
        index: 'OAUTH:M2M:TRIAL',
      },
    ]);
  });

  it('emits nothing when a non-trial tier calls the same tool', async () => {
    // The gate is a TIER gate. If this ever emits, the denial has widened to
    // paying customers — a commercial incident, not a metrics one.
    check.mockResolvedValue(allowed());

    await handleAuthenticated(toolCall('search_radar'), env(), ctx(), paidAuth);

    expect(eventsOfType('tier_denial')).toEqual([]);
  });

  it('does not consume a rate-limit token — the gate precedes the limiter', async () => {
    // Ordering assertion, not a metrics one: a refusal that burned a
    // radar-window token would let a trial exhaust its own limits on calls it
    // was never allowed to make.
    check.mockResolvedValue(allowed());

    await handleAuthenticated(toolCall('search_radar'), env(), ctx(), trialAuth);

    expect(check).not.toHaveBeenCalled();
  });
});

describe('rate-limit refusals → rate_limit_decision event', () => {
  it('emits a deny naming the bucket that refused', async () => {
    check.mockResolvedValue({
      allowed: false,
      limit: 15,
      remaining: 0,
      resetAt: Date.now() + 30_000,
      tier: 'minute',
      minRemainingRatio: 0,
    });

    await handleAuthenticated(toolCall('search_portfolio'), env(), ctx(), trialAuth);

    expect(eventsOfType('rate_limit_decision')).toEqual([
      {
        name: 'minute',
        outcome: 'deny',
        status_code: '429',
        client_ref: 'OAUTH:m2m_trial_abc',
        index: 'OAUTH:M2M:TRIAL',
      },
    ]);
  });

  it('emits a throttle naming the bucket NEAREST its cliff, not the binding one', async () => {
    // The distinction that makes the metric actionable: the minute bucket
    // binds on absolute remaining, while the day bucket is proportionally
    // closer to exhaustion. The operator must widen the day window.
    check.mockResolvedValue({
      allowed: true,
      limit: 15,
      remaining: 3,
      resetAt: Date.now() + 30_000,
      tier: 'minute',
      minRemainingRatio: 0.05,
      nearestLimit: { tier: 'day', limit: 100, remaining: 5, resetAt: Date.now() + 3_600_000 },
    });

    await handleAuthenticated(toolCall('search_portfolio'), env(), ctx(), trialAuth);

    const events = eventsOfType('rate_limit_decision');
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe('day');
    expect(events[0].outcome).toBe('throttle');
    // Absent by design — the request proceeded, so its status is unknown here.
    expect(events[0].status_code).toBeNull();
  });

  it('emits NOTHING for an allowed request comfortably below the soft limit', async () => {
    // ADR-0032: `allow` is deliberately never emitted. Were it, every
    // authenticated request would write a row and push the dataset toward
    // sampling, which silently degrades ADR-0031's `count(DISTINCT blob8)` query.
    check.mockResolvedValue(allowed({ minRemainingRatio: 0.9 }));

    await handleAuthenticated(toolCall('search_portfolio'), env(), ctx(), paidAuth);

    expect(eventsOfType('rate_limit_decision')).toEqual([]);
  });

  it('emits nothing when the limiter is unavailable (graceful skip)', async () => {
    // Upstash unbound → `createLimiter` returns null → the request fails OPEN.
    // No decision was made, so recording one would be a fabrication: a
    // dashboard showing zero refusals during an Upstash outage must mean
    // "nothing was refused", not "nothing was measured".
    limiter.mockReturnValueOnce(null);

    await handleAuthenticated(toolCall('search_portfolio'), env(), ctx(), paidAuth);

    expect(check).not.toHaveBeenCalled();
    expect(eventsOfType('rate_limit_decision')).toEqual([]);
  });

  it('emits a throttle exactly AT the soft-limit boundary', async () => {
    // The comparison is `<=`, matching the client-facing soft-limit warning.
    // An off-by-one here would make the metric and the warning disagree about
    // what "near the limit" means — the drift SOFT_LIMIT_RATIO exists to stop.
    check.mockResolvedValue(allowed({ minRemainingRatio: 0.2 }));

    await handleAuthenticated(toolCall('search_portfolio'), env(), ctx(), paidAuth);

    expect(eventsOfType('rate_limit_decision').map((e) => e.outcome)).toEqual(['throttle']);
  });
});

describe('scope denial → scope_denial event (BL-159)', () => {
  /** `GET /radar/snapshot` — the plain-HTTP half of the scope gate. */
  const snapshotGet = () =>
    new Request('https://mcp.test/radar/snapshot', {
      method: 'GET',
      headers: { Origin: 'https://globalstrategic.tech' },
    });

  it('emits a 403 scope_denial when the radar scope is missing', async () => {
    // BL-159. Before this, the refusal reached only `safeLog`, so
    // `scope-mismatch-403-rate` — severity `page` — had nothing to read and
    // reported a healthy 0 for its whole life. The MCP `resources/read` half of
    // the same gate is covered in `tests/integration/radar-resources-worker.test.ts`;
    // covering one path only would leave the alert measuring half the surface.
    check.mockResolvedValue(allowed());
    const noRadar: AuthSuccess = { ...paidAuth, scopes: ['tool:*'] };

    const res = await handleAuthenticated(snapshotGet(), env(), ctx(), noRadar);

    expect(res.status).toBe(403);
    expect(eventsOfType('scope_denial')).toEqual([
      {
        name: 'resource:radar:read',
        outcome: 'denied',
        status_code: '403',
        client_ref: 'OAUTH:m2m_acme_xyz',
        index: 'OAUTH:M2M:ACME',
      },
    ]);
  });

  it('emits nothing when the caller holds the scope', async () => {
    // The mirror. An emitter hoisted above the check would manufacture an
    // attack signal out of ordinary traffic and page someone for it.
    check.mockResolvedValue(allowed());
    const withRadar: AuthSuccess = { ...paidAuth, scopes: ['tool:*', 'resource:radar:read'] };

    await handleAuthenticated(snapshotGet(), env(), ctx(), withRadar);

    expect(eventsOfType('scope_denial')).toEqual([]);
  });
});
