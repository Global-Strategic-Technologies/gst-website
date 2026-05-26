/**
 * Regression test for the scheduled handler's Sentry error-capture path.
 *
 * Background (2026-05-25 incident): Cloudflare's dashboard reported 13
 * cron `outcome: exception` events in 24h while Sentry's Issues view
 * showed zero corresponding events. Root cause: the prior shape of
 * `worker.ts:scheduled` was `try { … } finally { … }` with no `catch` —
 * exceptions thrown by `refreshRadarSnapshot` (or its dependencies)
 * escaped `ctx.waitUntil`'s promise without ever being captured by
 * Sentry. The current implementation wraps the cron in `withMonitor`
 * (Sentry Crons check-in) and adds an outer `catch` that calls
 * `captureException` for the stack trace.
 *
 * This test exists because:
 *   1. No existing test exercised the scheduled handler at all — the
 *      cron-handler suite (`tests/unit/cron/radar-refresh.test.ts`)
 *      covers `refreshRadarSnapshot` in isolation; it never asked
 *      "what does the worker do if refreshRadarSnapshot rejects?"
 *   2. Two future regressions are possible: someone removes the catch
 *      (returns to the silent-Sentry state) OR someone changes the
 *      withMonitor invocation in a way that breaks the re-throw
 *      contract this code relies on. Both must fail this test loudly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// `@sentry/cloudflare` + `agents/mcp` use the `cloudflare:workers` URL
// scheme internally — Node's default ESM loader rejects it. Mock both at
// the package boundary so importing worker.ts doesn't crash. (Same
// pattern as `tests/integration/radar-snapshot-endpoint.test.ts`.)
vi.mock('@sentry/cloudflare', () => ({
  init: vi.fn(),
  captureMessage: vi.fn(),
  captureException: vi.fn(),
  setTag: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
  withMonitor: vi.fn(),
  withSentry: <T>(_opts: unknown, handler: T) => handler,
}));
vi.mock('agents/mcp', () => ({
  createMcpHandler: () => async () =>
    new Response('{"error":"mcp-mocked-in-this-test"}', { status: 501 }),
}));

// Stub the observability + cron modules so the handler picks up mockable
// versions of our own wrappers (the @sentry/cloudflare mock above
// satisfies sentry.ts's own imports during module load).
vi.mock('../../src/cron/radar-refresh');
vi.mock('../../src/observability/sentry', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  flushSentry: vi.fn().mockResolvedValue(true),
  sentryOptions: vi.fn().mockReturnValue(undefined),
  tagRequest: vi.fn(),
  withMonitor: vi.fn(),
  withSentry: <T>(_opts: unknown, h: T) => h, // pass-through wrap for the default export
}));

// Imports MUST come after vi.mock so the mocked modules are wired in.
import { handler } from '../../src/worker';
import * as sentry from '../../src/observability/sentry';
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

describe('worker.ts scheduled handler — Sentry error capture (2026-05-25 regression)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default: withMonitor is a pass-through that runs its callback verbatim.
    // Individual tests override this to simulate Sentry's re-throw behavior.
    vi.mocked(sentry.withMonitor).mockImplementation(async (_slug: string, cb: () => unknown) =>
      cb()
    );
    vi.mocked(sentry.flushSentry).mockResolvedValue(true);
  });

  it('captures the exception via captureException when refreshRadarSnapshot rejects', async () => {
    const inoreaderError = new Error('Inoreader 503 Service Unavailable');
    vi.mocked(cron.refreshRadarSnapshot).mockRejectedValue(inoreaderError);

    const { ctx, waitUntilPromises } = makeCtx();
    handler.scheduled!(makeScheduledEvent(), FAKE_ENV, ctx);
    await Promise.all(waitUntilPromises);

    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    expect(sentry.captureException).toHaveBeenCalledWith(inoreaderError, {
      source: 'cron.scheduled',
      cron: FAKE_CRON,
    });
  });

  it('always calls flushSentry, even on failure', async () => {
    vi.mocked(cron.refreshRadarSnapshot).mockRejectedValue(new Error('upstream failure'));

    const { ctx, waitUntilPromises } = makeCtx();
    handler.scheduled!(makeScheduledEvent(), FAKE_ENV, ctx);
    await Promise.all(waitUntilPromises);

    expect(sentry.flushSentry).toHaveBeenCalledTimes(1);
  });

  it('does NOT capture exception on the success path', async () => {
    vi.mocked(cron.refreshRadarSnapshot).mockResolvedValue({
      kind: 'success',
      wireItems: 5,
      fyiItems: 3,
      callsConsumed: 6,
    });

    const { ctx, waitUntilPromises } = makeCtx();
    handler.scheduled!(makeScheduledEvent(), FAKE_ENV, ctx);
    await Promise.all(waitUntilPromises);

    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.flushSentry).toHaveBeenCalledTimes(1);
  });

  it('does NOT capture exception when refreshRadarSnapshot returns a non-error envelope', async () => {
    // The `partial-both-failed` outcome means both tiers failed but
    // refreshRadarSnapshot caught them internally and returned a result
    // envelope — the scheduled handler should NOT double-report.
    vi.mocked(cron.refreshRadarSnapshot).mockResolvedValue({
      kind: 'partial-both-failed',
      wireReason: 'inoreader-rate-limit',
      fyiReason: 'inoreader-rate-limit',
    });

    const { ctx, waitUntilPromises } = makeCtx();
    handler.scheduled!(makeScheduledEvent(), FAKE_ENV, ctx);
    await Promise.all(waitUntilPromises);

    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it('invokes withMonitor with the runtime cron expression from the ScheduledController', async () => {
    // The cron schedule passed to Sentry must match the schedule that
    // actually fired. We pull it from `event.cron` (Cloudflare's runtime
    // truth) rather than hardcoding so a `wrangler.toml` schedule edit
    // doesn't silently desync from Sentry's monitor config.
    vi.mocked(cron.refreshRadarSnapshot).mockResolvedValue({
      kind: 'success',
      wireItems: 0,
      fyiItems: 0,
      callsConsumed: 0,
    });

    const { ctx, waitUntilPromises } = makeCtx();
    handler.scheduled!(makeScheduledEvent(), FAKE_ENV, ctx);
    await Promise.all(waitUntilPromises);

    expect(sentry.withMonitor).toHaveBeenCalledTimes(1);
    const [slug, _callback, config] = vi.mocked(sentry.withMonitor).mock.calls[0];
    expect(slug).toBe('radar-refresh');
    expect(config).toMatchObject({
      schedule: { type: 'crontab', value: FAKE_CRON },
      timezone: 'UTC',
    });
  });

  it('swallows the re-thrown exception so ctx.waitUntil resolves cleanly (no unhandled rejection escapes Cloudflare runtime)', async () => {
    // This is the load-bearing assertion against the 2026-05-25 incident
    // shape. If the catch is removed, the promise rejects → Cloudflare
    // reports outcome:exception → Sentry has no event. The test would
    // fail because `await Promise.all` would itself throw.
    vi.mocked(cron.refreshRadarSnapshot).mockRejectedValue(new Error('any throw'));

    const { ctx, waitUntilPromises } = makeCtx();
    handler.scheduled!(makeScheduledEvent(), FAKE_ENV, ctx);

    // The IIFE inside ctx.waitUntil must resolve, NOT reject. If the
    // handler regresses to a no-catch shape, this awaits a rejected
    // promise and the test fails loudly with the original error.
    await expect(Promise.all(waitUntilPromises)).resolves.toBeDefined();
  });

  it('swallows throws from flushSentry so Cloudflare sees outcome:ok even on Sentry-side failures (2026-05-25 18:00 UTC regression)', async () => {
    // 0.3.12 introduced the catch around refreshRadarSnapshot but left
    // `await flushSentry()` in the finally block unguarded. Cloudflare's
    // cron dashboard continued to report `exception` on every firing
    // because Sentry SDK flush failures (ingest network blips, quota
    // rejections, internal SDK errors) propagated past the IIFE.
    // Confirmed via the 2026-05-25 dashboard: cron successfully made
    // the Inoreader call (/health.inoreaderObservedAt updated), but
    // Cloudflare still reported Error.
    //
    // The 0.3.13 fix is an outer try/catch around the entire IIFE body
    // that swallows Sentry-plumbing throws. This test forces flushSentry
    // to reject and asserts ctx.waitUntil still resolves cleanly.
    vi.mocked(cron.refreshRadarSnapshot).mockResolvedValue({
      kind: 'success',
      wireItems: 5,
      fyiItems: 3,
      callsConsumed: 6,
    });
    vi.mocked(sentry.flushSentry).mockRejectedValue(new Error('sentry ingest unreachable'));

    const { ctx, waitUntilPromises } = makeCtx();
    handler.scheduled!(makeScheduledEvent(), FAKE_ENV, ctx);

    await expect(Promise.all(waitUntilPromises)).resolves.toBeDefined();
  });

  it('swallows throws from captureException so flushSentry-then-resolve still happens (defense-in-depth)', async () => {
    // Lower-probability path than the flushSentry case but covered by
    // the same outer catch. If captureException somehow throws (Sentry
    // SDK getting into a bad scope, fetch failure mid-capture), the
    // finally block still runs flushSentry and ctx.waitUntil resolves.
    vi.mocked(cron.refreshRadarSnapshot).mockRejectedValue(new Error('upstream failure'));
    vi.mocked(sentry.captureException).mockImplementation(() => {
      throw new Error('sentry capture internal error');
    });

    const { ctx, waitUntilPromises } = makeCtx();
    handler.scheduled!(makeScheduledEvent(), FAKE_ENV, ctx);

    await expect(Promise.all(waitUntilPromises)).resolves.toBeDefined();
  });
});
