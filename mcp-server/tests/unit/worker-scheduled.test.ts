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
const { withSentryMock, mockPostCheckIn, mockPostEvent, mockSafeLog } = vi.hoisted(() => ({
  withSentryMock: vi.fn(<T>(_opts: unknown, handler: T) => handler),
  mockPostCheckIn: vi.fn(),
  mockPostEvent: vi.fn(),
  mockSafeLog: vi.fn(),
}));

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

// Imports MUST come after vi.mock so the mocked modules are wired in.
import { handler } from '../../src/worker';
import workerDefault from '../../src/worker';
import * as cron from '../../src/cron/radar-refresh';
import type { Env } from '../../src/worker';

const FAKE_ENV = {} as Env;
const FAKE_CRON = '0 */6 * * *';

function makeScheduledEvent(): ScheduledController {
  return {
    cron: FAKE_CRON,
    scheduledTime: Date.now(),
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
