/**
 * Tests for the scheduled handler's envelope-based Sentry lifecycle
 * (BL-032.76 — supersedes the prior `withMonitor` + `flushSentry` shape).
 *
 * Background (2026-05-19 → 2026-05-26): every cron firing reported
 * `Exception Thrown` on Cloudflare's cron-events dashboard while the
 * underlying radar work succeeded. Root cause traced to the SDK's
 * `wrapScheduledHandler` queueing its own `ctx.waitUntil(flushAndDispose
 * (client))` outside any try/catch we control. The structural fix is to
 * stop wrapping `scheduled` with `withSentry` (the default export now
 * passes `{ fetch }` only) and to use direct envelope POSTs for
 * observability inside the cron path.
 *
 * These tests pin the new contract:
 *   - `withSentry` is called with a handler that has NO `scheduled` key
 *     (regression guard against future re-wrapping)
 *   - Scheduled handler invokes `refreshRadarSnapshot` exactly once
 *   - Success path: `postSentryCheckIn('in_progress')` → `('ok')` with
 *     matching `checkInId`
 *   - Error path: `postSentryCheckIn('in_progress')` → `postSentryEvent`
 *     → `postSentryCheckIn('error')` with matching `checkInId`
 *   - DSN-missing path: handler still completes and `refreshRadarSnapshot`
 *     still runs
 *   - `ctx.waitUntil` always resolves cleanly (no unhandled rejection)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// `@sentry/cloudflare` + `agents/mcp` use the `cloudflare:workers` URL
// scheme internally — Node's default ESM loader rejects it. Mock both
// at the package boundary so importing worker.ts doesn't crash.
const { withSentryMock, mockPostCheckIn, mockPostEvent, mockSafeLog, mockAcquire } = vi.hoisted(
  () => ({
    withSentryMock: vi.fn(<T>(_opts: unknown, handler: T) => handler),
    mockPostCheckIn: vi.fn(),
    mockPostEvent: vi.fn(),
    mockSafeLog: vi.fn(),
    // BL-032.77 dedup mock — default to `true` (lock acquired) so existing
    // happy-path tests run the full handler. Tests that need to exercise
    // the loser path override via `mockAcquire.mockResolvedValueOnce(false)`.
    mockAcquire: vi.fn().mockResolvedValue(true),
  })
);

vi.mock('@sentry/cloudflare', () => ({
  init: vi.fn(),
  captureMessage: vi.fn(),
  captureException: vi.fn(),
  setTag: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
  withMonitor: vi.fn(),
  withSentry: withSentryMock,
}));
vi.mock('agents/mcp', () => ({
  createMcpHandler: () => async () =>
    new Response('{"error":"mcp-mocked-in-this-test"}', { status: 501 }),
}));

vi.mock('../../src/cron/radar-refresh');
vi.mock('../../src/observability/sentry', () => ({
  captureMessage: vi.fn(),
  sentryOptions: vi.fn().mockReturnValue(undefined),
  tagRequest: vi.fn(),
  withSentry: withSentryMock, // pass-through wrap for the default export
}));

vi.mock('../../src/observability/sentry-envelope', () => ({
  postSentryCheckIn: mockPostCheckIn,
  postSentryEvent: mockPostEvent,
}));

vi.mock('../../src/auth/safe-logger', () => ({
  safeLog: mockSafeLog,
}));

vi.mock('../../src/lib/single-flight-lock', () => ({
  acquire: mockAcquire,
  pollForChange: vi.fn(),
  release: vi.fn(),
}));

// Imports MUST come after vi.mock so the mocked modules are wired in.
import { handler } from '../../src/worker';
import workerDefault from '../../src/worker';
import * as cron from '../../src/cron/radar-refresh';
import type { Env } from '../../src/worker';

const FAKE_ENV = {} as Env;
const FAKE_CRON = '0 */6 * * *';
// BL-032.77 dedup tests need a STABLE scheduledTime so the lock key is
// deterministic across the two concurrent invocations of the concurrency
// test. Using a fixed epoch-ms value (2026-05-29T12:00:00Z) means both
// invocations produce the same lock key — which is precisely the property
// the dedup lock relies on (Cloudflare's `ScheduledController.scheduledTime`
// is identical across duplicate invocations of the same fire).
const FAKE_SCHEDULED_TIME = 1_780_056_000_000;

function makeScheduledEvent(scheduledTime: number = FAKE_SCHEDULED_TIME): ScheduledController {
  return {
    cron: FAKE_CRON,
    scheduledTime,
    type: 'scheduled',
    noRetry: () => {},
  } as unknown as ScheduledController;
}

function makeCtx(): { ctx: ExecutionContext; waitUntilPromises: Promise<unknown>[] } {
  const waitUntilPromises: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (p: Promise<unknown>) => {
      waitUntilPromises.push(p);
    },
    passThroughOnException: () => {},
    props: {},
  } as unknown as ExecutionContext;
  return { ctx, waitUntilPromises };
}

describe('worker default export — withSentry wraps fetch only (BL-032.76 regression guard)', () => {
  it('withSentry is called with a handler literal that has NO scheduled key', () => {
    // Load-bearing assertion against the 2026-05-19 incident shape. The
    // SDK's `wrapScheduledHandler` queues its own ctx.waitUntil flush
    // outside our control; passing a handler literal with `scheduled`
    // attached re-introduces the broken cron status reporting. The
    // default export MUST pass `{ fetch }` only.
    expect(withSentryMock).toHaveBeenCalled();
    const [, passedHandler] = withSentryMock.mock.calls[0]!;
    expect(passedHandler).toHaveProperty('fetch');
    expect(passedHandler).not.toHaveProperty('scheduled');
  });

  it('the default export still has both fetch and scheduled (composed after withSentry)', () => {
    expect(workerDefault).toHaveProperty('fetch');
    expect(workerDefault).toHaveProperty('scheduled');
    expect(typeof workerDefault.scheduled).toBe('function');
  });
});

describe('worker.ts scheduled handler — BL-047 T1 alert-rule synthetic branch', () => {
  // The synthetic cron (`0 14 * * 1`) MUST short-circuit before any
  // radar-refresh work runs. A regression that lets the synthetic firing
  // through to refreshRadarSnapshot would double the cron's Inoreader
  // spend every Monday — a measurable Zone-1 burn against the 100/day cap.
  beforeEach(() => {
    mockPostCheckIn.mockReset();
    mockPostEvent.mockReset();
    mockSafeLog.mockReset();
    vi.mocked(cron.refreshRadarSnapshot).mockReset();
    mockAcquire.mockReset();
    mockAcquire.mockResolvedValue(true);
  });

  it('synthetic cron expression fires postSentryEvent with alert-rule-synthetic tag and skips radar-refresh', async () => {
    const syntheticEvent = {
      cron: '0 14 * * 1',
      scheduledTime: FAKE_SCHEDULED_TIME,
      type: 'scheduled',
      noRetry: () => {},
    } as unknown as ScheduledController;

    const { ctx, waitUntilPromises } = makeCtx();
    handler.scheduled!(syntheticEvent, FAKE_ENV, ctx);
    await Promise.all(waitUntilPromises);

    // Synthetic emits exactly one tagged event.
    expect(mockPostEvent).toHaveBeenCalledTimes(1);
    expect(mockPostEvent).toHaveBeenCalledWith(
      FAKE_ENV,
      expect.objectContaining({
        level: 'info',
        message: expect.stringContaining('alert-rule-synthetic'),
        tags: expect.objectContaining({
          event: 'alert-rule-synthetic',
          'alert-rule-synthetic': '1',
        }),
      })
    );

    // Critical regression guard: radar-refresh MUST NOT run on the
    // synthetic cron. Otherwise the synthetic doubles Inoreader spend.
    expect(cron.refreshRadarSnapshot).not.toHaveBeenCalled();
    expect(mockPostCheckIn).not.toHaveBeenCalled();
    expect(mockAcquire).not.toHaveBeenCalled();
  });

  it('radar-refresh cron expression does NOT fire the synthetic event', async () => {
    vi.mocked(cron.refreshRadarSnapshot).mockResolvedValue({
      kind: 'success',
      wireItems: 5,
      fyiItems: 3,
      callsConsumed: 6,
    });

    const { ctx, waitUntilPromises } = makeCtx();
    handler.scheduled!(makeScheduledEvent(), FAKE_ENV, ctx);
    await Promise.all(waitUntilPromises);

    // No alert-rule-synthetic tagged event should appear from the
    // radar-refresh path. (postSentryEvent fires on error only — here we
    // assert it's not called with the synthetic tag.)
    const syntheticCalls = mockPostEvent.mock.calls.filter(([, body]) => {
      const tags = (body as { tags?: Record<string, unknown> }).tags;
      return tags && tags['alert-rule-synthetic'] !== undefined;
    });
    expect(syntheticCalls).toHaveLength(0);
    expect(cron.refreshRadarSnapshot).toHaveBeenCalledTimes(1);
  });
});

describe('worker.ts scheduled handler — envelope check-in lifecycle (BL-032.76)', () => {
  beforeEach(() => {
    mockPostCheckIn.mockReset();
    mockPostEvent.mockReset();
    mockSafeLog.mockReset();
    // Default: postSentryCheckIn returns a fresh id on in_progress,
    // returns same id on closing check-ins.
    mockPostCheckIn.mockImplementation(
      async (_env, _slug, _status, _schedule, checkInId) => checkInId ?? 'fake-id-abc'
    );
    vi.mocked(cron.refreshRadarSnapshot).mockReset();
    // BL-032.77 — default to lock acquired so existing tests below run the
    // full handler. Dedup-specific tests reset and override.
    mockAcquire.mockReset();
    mockAcquire.mockResolvedValue(true);
  });

  it('success path: in_progress → ok with matching checkInId', async () => {
    vi.mocked(cron.refreshRadarSnapshot).mockResolvedValue({
      kind: 'success',
      wireItems: 5,
      fyiItems: 3,
      callsConsumed: 6,
    });

    const { ctx, waitUntilPromises } = makeCtx();
    handler.scheduled!(makeScheduledEvent(), FAKE_ENV, ctx);
    await Promise.all(waitUntilPromises);

    expect(mockPostCheckIn).toHaveBeenCalledTimes(2);
    expect(mockPostCheckIn).toHaveBeenNthCalledWith(
      1,
      FAKE_ENV,
      'radar-refresh',
      'in_progress',
      FAKE_CRON
    );
    expect(mockPostCheckIn).toHaveBeenNthCalledWith(
      2,
      FAKE_ENV,
      'radar-refresh',
      'ok',
      FAKE_CRON,
      'fake-id-abc'
    );
    expect(mockPostEvent).not.toHaveBeenCalled();
    expect(cron.refreshRadarSnapshot).toHaveBeenCalledTimes(1);
  });

  it('error path: in_progress → postSentryEvent → error with matching checkInId', async () => {
    const upstreamErr = new Error('Inoreader 503 Service Unavailable');
    vi.mocked(cron.refreshRadarSnapshot).mockRejectedValue(upstreamErr);

    const { ctx, waitUntilPromises } = makeCtx();
    handler.scheduled!(makeScheduledEvent(), FAKE_ENV, ctx);
    await Promise.all(waitUntilPromises);

    expect(mockPostCheckIn).toHaveBeenCalledTimes(2);
    expect(mockPostCheckIn).toHaveBeenNthCalledWith(
      1,
      FAKE_ENV,
      'radar-refresh',
      'in_progress',
      FAKE_CRON
    );
    expect(mockPostEvent).toHaveBeenCalledTimes(1);
    expect(mockPostEvent).toHaveBeenCalledWith(
      FAKE_ENV,
      expect.objectContaining({
        level: 'error',
        message: expect.stringContaining('Inoreader 503 Service Unavailable'),
        tags: expect.objectContaining({ event: 'cron.scheduled', cron: FAKE_CRON }),
      })
    );
    expect(mockPostCheckIn).toHaveBeenNthCalledWith(
      2,
      FAKE_ENV,
      'radar-refresh',
      'error',
      FAKE_CRON,
      'fake-id-abc'
    );

    // safeLog contract — the operator-visible diagnostic line that
    // `wrangler tail` surfaces. If a refactor drops this emit, the
    // structured-log channel goes silent on cron errors. Reason is
    // truncated to 200 chars so an oversized stack doesn't bloat the
    // log line.
    expect(mockSafeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'cron.scheduled.error',
        success: false,
        reason: expect.stringContaining('Inoreader 503 Service Unavailable'),
      })
    );

    // Ordering invariant: in_progress fires before refreshRadarSnapshot
    // is awaited; postSentryEvent fires before the closing check-in.
    const inProgressOrder = mockPostCheckIn.mock.invocationCallOrder[0]!;
    const eventOrder = mockPostEvent.mock.invocationCallOrder[0]!;
    const errorOrder = mockPostCheckIn.mock.invocationCallOrder[1]!;
    expect(inProgressOrder).toBeLessThan(eventOrder);
    expect(eventOrder).toBeLessThan(errorOrder);
  });

  it('DSN-missing path: handler still runs refreshRadarSnapshot and propagates undefined checkInId to the closing check-in', async () => {
    // When SENTRY_DSN is unbound, the envelope helpers short-circuit
    // and return undefined. The handler must still invoke the underlying
    // work — observability gracefully degrades; correctness does not.
    mockPostCheckIn.mockResolvedValue(undefined);
    vi.mocked(cron.refreshRadarSnapshot).mockResolvedValue({
      kind: 'success',
      wireItems: 1,
      fyiItems: 0,
      callsConsumed: 5,
    });

    const { ctx, waitUntilPromises } = makeCtx();
    handler.scheduled!(makeScheduledEvent(), FAKE_ENV, ctx);
    await Promise.all(waitUntilPromises);

    expect(cron.refreshRadarSnapshot).toHaveBeenCalledTimes(1);
    // Closing check-in is attempted (also a no-op without DSN) and
    // receives the undefined checkInId we got back from the opener.
    // Pinning the boundary here so a refactor that defaults the id
    // (e.g. `checkInId ?? generateNew()`) doesn't silently change the
    // contract DSN-bound callers depend on.
    expect(mockPostCheckIn).toHaveBeenCalledTimes(2);
    expect(mockPostCheckIn).toHaveBeenNthCalledWith(
      2,
      FAKE_ENV,
      'radar-refresh',
      'ok',
      FAKE_CRON,
      undefined
    );
  });

  it('postSentryEvent rejection does NOT escape ctx.waitUntil (observability never fails the cron)', async () => {
    // Symptom-side of the BL-032.76 incident: the SDK's queued
    // ctx.waitUntil for the auto-flush rejected and produced Cloudflare
    // `Exception Thrown`. The envelope helpers are documented as
    // best-effort/never-throw — but if a future refactor breaks that
    // contract (e.g. removes the try/catch in postEnvelope), the cron
    // status reporting would regress to the 2026-05-19 shape.
    //
    // This test forces an envelope helper to reject and asserts the
    // outer handler still resolves cleanly.
    vi.mocked(cron.refreshRadarSnapshot).mockRejectedValue(new Error('upstream'));
    mockPostEvent.mockRejectedValue(new Error('sentry ingest 502'));

    const { ctx, waitUntilPromises } = makeCtx();
    handler.scheduled!(makeScheduledEvent(), FAKE_ENV, ctx);

    await expect(Promise.all(waitUntilPromises)).resolves.toBeDefined();
  });

  it('ctx.waitUntil always resolves cleanly even when refreshRadarSnapshot rejects', async () => {
    // Load-bearing — this is the symptom side of the 2026-05-19 incident.
    // The IIFE inside ctx.waitUntil MUST resolve, NEVER reject, regardless
    // of what `refreshRadarSnapshot` does. The catch in scheduled() is the
    // safety net.
    vi.mocked(cron.refreshRadarSnapshot).mockRejectedValue(new Error('any throw'));

    const { ctx, waitUntilPromises } = makeCtx();
    handler.scheduled!(makeScheduledEvent(), FAKE_ENV, ctx);

    await expect(Promise.all(waitUntilPromises)).resolves.toBeDefined();
  });
});

import { refreshOutcomeToAe } from '../../src/worker';
import type { RefreshOutcome } from '../../src/cron/radar-refresh';

describe('refreshOutcomeToAe — RefreshOutcome.kind → cron_outcome enum mapping (BL-032.77 Fix C)', () => {
  // Pins every `RefreshOutcome.kind` to its `OUTCOME_VALUES.cron_outcome`
  // mapping. Catches the partial-as-success bug the closeout audit flagged:
  // worker.ts used to discard the RefreshOutcome and emit `'success'` for
  // every non-throw return, so `partial-both-failed` (both tiers down) was
  // reported to AE as a success. The audit's exhaustive `never` check at
  // the bottom of `refreshOutcomeToAe` is the compile-time safety net; this
  // test is the runtime safety net.

  it('kind=success → outcome=success', () => {
    const outcome: RefreshOutcome = {
      kind: 'success',
      wireItems: 5,
      fyiItems: 3,
      callsConsumed: 6,
    };
    expect(refreshOutcomeToAe(outcome)).toBe('success');
  });

  it('kind=partial-one-tier-ok → outcome=partial (cache half-fresh, not an error)', () => {
    const outcome: RefreshOutcome = {
      kind: 'partial-one-tier-ok',
      wireOk: true,
      fyiOk: false,
      callsConsumed: 5,
    };
    expect(refreshOutcomeToAe(outcome)).toBe('partial');
  });

  it('kind=partial-both-failed → outcome=error (both tiers down; user-visible staleness)', () => {
    const outcome: RefreshOutcome = {
      kind: 'partial-both-failed',
      wireReason: 'upstream-503',
      fyiReason: 'upstream-503',
    };
    expect(refreshOutcomeToAe(outcome)).toBe('error');
  });

  it('kind=skipped reason=circuit-open → outcome=skipped-circuit', () => {
    const outcome: RefreshOutcome = { kind: 'skipped', reason: 'circuit-open' };
    expect(refreshOutcomeToAe(outcome)).toBe('skipped-circuit');
  });

  it('kind=skipped reason=day-cap-reached → outcome=skipped-budget', () => {
    const outcome: RefreshOutcome = {
      kind: 'skipped',
      reason: 'day-cap-reached',
      counter: 94,
    };
    expect(refreshOutcomeToAe(outcome)).toBe('skipped-budget');
  });

  it('kind=error → outcome=error', () => {
    const outcome: RefreshOutcome = { kind: 'error', message: 'boom' };
    expect(refreshOutcomeToAe(outcome)).toBe('error');
  });

  it('every mapped outcome is in OUTCOME_VALUES.cron_outcome (no schema drift)', async () => {
    // Cross-check that the strings refreshOutcomeToAe returns are all
    // accepted by the schema guard. A future widening of `RefreshOutcome`
    // without a matching schema enum entry would surface here.
    const { OUTCOME_VALUES } = await import('../../src/metrics/_schema');
    const outcomes: RefreshOutcome[] = [
      { kind: 'success', wireItems: 0, fyiItems: 0, callsConsumed: 0 },
      { kind: 'partial-one-tier-ok', wireOk: true, fyiOk: false, callsConsumed: 0 },
      { kind: 'partial-both-failed', wireReason: 'r', fyiReason: 'r' },
      { kind: 'skipped', reason: 'circuit-open' },
      { kind: 'skipped', reason: 'day-cap-reached' },
      { kind: 'error', message: 'x' },
    ];
    for (const outcome of outcomes) {
      const ae = refreshOutcomeToAe(outcome);
      expect(OUTCOME_VALUES.cron_outcome).toContain(ae);
    }
  });
});

describe('worker.ts scheduled handler — single-flight dedup (BL-032.77 cron-firing dedup)', () => {
  // BL-032.77 production discovery (2026-05-29): Cloudflare invokes the
  // scheduled handler multiple times for the same scheduledTime, doubling
  // Zone-1 spend (observed 36/day vs expected 18/day after 3 firings).
  // The dedup lock at the top of the scheduled handler exits losers
  // cleanly before any work. These tests pin the dedup contract.
  beforeEach(() => {
    mockPostCheckIn.mockReset();
    mockPostEvent.mockReset();
    mockSafeLog.mockReset();
    mockPostCheckIn.mockImplementation(
      async (_env, _slug, _status, _schedule, checkInId) => checkInId ?? 'fake-id-abc'
    );
    vi.mocked(cron.refreshRadarSnapshot).mockReset();
    mockAcquire.mockReset();
    mockAcquire.mockResolvedValue(true);
  });

  it('lock acquired → full work runs (regression guard for happy path)', async () => {
    vi.mocked(cron.refreshRadarSnapshot).mockResolvedValue({
      kind: 'success',
      wireItems: 5,
      fyiItems: 3,
      callsConsumed: 6,
    });
    const { ctx, waitUntilPromises } = makeCtx();
    handler.scheduled!(makeScheduledEvent(), FAKE_ENV, ctx);
    await Promise.all(waitUntilPromises);

    expect(mockAcquire).toHaveBeenCalledTimes(1);
    expect(mockAcquire).toHaveBeenCalledWith(
      FAKE_ENV,
      `mcp:lock:cron-radar-refresh:${FAKE_CRON}:${FAKE_SCHEDULED_TIME}`,
      300
    );
    expect(cron.refreshRadarSnapshot).toHaveBeenCalledTimes(1);
    expect(mockPostCheckIn).toHaveBeenCalledTimes(2);
  });

  it('lock NOT acquired → loser path: NO check-ins, NO refresh, NO Sentry event; safeLog emitted with correlation fields', async () => {
    mockAcquire.mockResolvedValueOnce(false);
    const { ctx, waitUntilPromises } = makeCtx();
    handler.scheduled!(makeScheduledEvent(), FAKE_ENV, ctx);
    await Promise.all(waitUntilPromises);

    // Critical: zero side-effects to Sentry, zero work, zero Inoreader.
    expect(cron.refreshRadarSnapshot).not.toHaveBeenCalled();
    expect(mockPostCheckIn).not.toHaveBeenCalled();
    expect(mockPostEvent).not.toHaveBeenCalled();

    // Loser path emits exactly one structured-log line with correlation
    // fields so operators can match a dropped invocation against the
    // winner's logs by scheduledTime.
    expect(mockSafeLog).toHaveBeenCalledTimes(1);
    expect(mockSafeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'cron.scheduled.deduplicated',
        reason: 'peer-holds-lock',
        success: true,
        cron: FAKE_CRON,
        scheduledTime: FAKE_SCHEDULED_TIME,
        durationMs: expect.any(Number),
      })
    );
  });

  it('lock key format pinned: mcp:lock:cron-radar-refresh:<cron>:<scheduledTime>', async () => {
    vi.mocked(cron.refreshRadarSnapshot).mockResolvedValue({
      kind: 'success',
      wireItems: 0,
      fyiItems: 0,
      callsConsumed: 6,
    });
    // Two different scheduledTimes (different firings) — assert distinct
    // lock keys, NOT a single shared key. Regression guard against a
    // future refactor that drops scheduledTime from the key (would
    // re-introduce the double-firing bug).
    const { ctx: ctxA, waitUntilPromises: waA } = makeCtx();
    const { ctx: ctxB, waitUntilPromises: waB } = makeCtx();
    handler.scheduled!(makeScheduledEvent(1_780_056_000_000), FAKE_ENV, ctxA);
    handler.scheduled!(makeScheduledEvent(1_780_077_600_000), FAKE_ENV, ctxB);
    await Promise.all([...waA, ...waB]);

    expect(mockAcquire).toHaveBeenCalledTimes(2);
    expect(mockAcquire.mock.calls[0][1]).toBe(
      `mcp:lock:cron-radar-refresh:${FAKE_CRON}:1780056000000`
    );
    expect(mockAcquire.mock.calls[1][1]).toBe(
      `mcp:lock:cron-radar-refresh:${FAKE_CRON}:1780077600000`
    );
    // TTL pinned at 300s — regression guard against TTL shortening
    // mid-firing or lengthening past the 6h cron cadence.
    expect(mockAcquire.mock.calls[0][2]).toBe(300);
    expect(mockAcquire.mock.calls[1][2]).toBe(300);
  });

  it('concurrency: two parallel invocations of the same scheduledTime → exactly one runs the work', async () => {
    // The core property the dedup lock introduces. Mock SETNX atomicity by
    // returning `true` for the FIRST acquire() call and `false` for the
    // SECOND — modeling Upstash's atomic SET NX where exactly one wins.
    mockAcquire.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    vi.mocked(cron.refreshRadarSnapshot).mockResolvedValue({
      kind: 'success',
      wireItems: 5,
      fyiItems: 3,
      callsConsumed: 6,
    });

    const event = makeScheduledEvent();
    const { ctx: ctxA, waitUntilPromises: waA } = makeCtx();
    const { ctx: ctxB, waitUntilPromises: waB } = makeCtx();
    // Fire BOTH invocations in parallel — same `event` (= same
    // scheduledTime, same cron). This mirrors Cloudflare's actual
    // double-firing behavior observed in production 2026-05-29.
    handler.scheduled!(event, FAKE_ENV, ctxA);
    handler.scheduled!(event, FAKE_ENV, ctxB);
    await Promise.all([...waA, ...waB]);

    // Both invocations attempted to acquire — Upstash SETNX is the arbiter.
    expect(mockAcquire).toHaveBeenCalledTimes(2);

    // Only ONE invocation ran the work — the lock-winner.
    expect(cron.refreshRadarSnapshot).toHaveBeenCalledTimes(1);

    // Only ONE invocation sent Sentry check-ins (the winner's in_progress
    // + ok pair, both with the same checkInId).
    expect(mockPostCheckIn).toHaveBeenCalledTimes(2);
    expect(mockPostCheckIn).toHaveBeenNthCalledWith(
      1,
      FAKE_ENV,
      'radar-refresh',
      'in_progress',
      FAKE_CRON
    );
    expect(mockPostCheckIn).toHaveBeenNthCalledWith(
      2,
      FAKE_ENV,
      'radar-refresh',
      'ok',
      FAKE_CRON,
      'fake-id-abc'
    );

    // The loser invocation emitted exactly one dedup safeLog line.
    const dedupLogs = mockSafeLog.mock.calls.filter(
      (call) => call[0]?.event === 'cron.scheduled.deduplicated'
    );
    expect(dedupLogs).toHaveLength(1);
  });

  it('fail-open: Upstash unreachable (acquire returns true even on no-client) → handler runs full work', async () => {
    // `acquire` in `single-flight-lock.ts` returns `true` when createMcpClient
    // returns null (Upstash creds unbound) — same fail-open semantics as
    // the OAuth refresh lock. Verified at module level here: the handler
    // proceeds to run the work as if the lock were uncontested. The trade-off
    // is intentional: occasional double-firing during an Upstash outage is
    // strictly better than silently skipping a cron firing.
    mockAcquire.mockResolvedValueOnce(true); // simulates "fail-open: no Upstash, just proceed"
    vi.mocked(cron.refreshRadarSnapshot).mockResolvedValue({
      kind: 'success',
      wireItems: 0,
      fyiItems: 0,
      callsConsumed: 6,
    });
    const { ctx, waitUntilPromises } = makeCtx();
    handler.scheduled!(makeScheduledEvent(), FAKE_ENV, ctx);
    await Promise.all(waitUntilPromises);

    expect(cron.refreshRadarSnapshot).toHaveBeenCalledTimes(1);
    expect(mockPostCheckIn).toHaveBeenCalledTimes(2);
  });
});
