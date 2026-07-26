/**
 * BL-033 Slice 5 — the 80%-consumed soft-limit `notifications/message` emit
 * inside `withMetricsCore`.
 *
 * The wrapper reads the boundary's already-computed rate-limit result from
 * `MetricsContext.rateLimit` and, when some bucket is ≥80% spent, writes a
 * best-effort warning onto the request's SSE stream via `extra.sendNotification`.
 * These tests pin: fires at/under the 0.20 threshold, silent above it, never
 * throws when the notifier is absent or rejects, and is gated to tool calls.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  withMetricsCore,
  type MetricsContext,
  type RateLimitCheck,
} from '../../../src/metrics/with-metrics';
import { NoopSink } from '../../../src/metrics/_index';

const baseCtx = (rateLimit?: RateLimitCheck): MetricsContext => ({
  sink: new NoopSink(),
  rateLimit,
});

const rl = (minRemainingRatio: number): RateLimitCheck => ({
  tier: 'minute',
  limit: 30,
  remaining: Math.round(30 * minRemainingRatio),
  resetAt: Date.now() + 30_000,
  minRemainingRatio,
});

/** A tool-handler `extra` carrying a `sendNotification` spy. */
const extraWith = (send: (n: unknown) => unknown) => ({ sendNotification: vi.fn(send) });

// Mirrors an MCP tool callback's `(args, extra)` arity so `withMetricsCore`
// infers a 2-arg wrapper the tests can invoke with an `extra`.
const ok = async (_input?: unknown, _extra?: unknown) => ({
  content: [{ type: 'text', text: 'ok' }],
});

describe('withMetricsCore soft-limit warning', () => {
  it('emits notifications/message when a bucket is ≥80% consumed (ratio ≤ 0.20)', async () => {
    const extra = extraWith(() => Promise.resolve());
    const wrapped = withMetricsCore(
      'tool_invocation',
      'search_portfolio',
      baseCtx(rl(0.1)),
      () => 'success',
      ok
    );

    await wrapped({ q: 'x' }, extra);

    expect(extra.sendNotification).toHaveBeenCalledTimes(1);
    const notif = extra.sendNotification.mock.calls[0]![0] as {
      method: string;
      params: {
        level: string;
        logger: string;
        data: { tier: string; remaining: number; limit: number };
      };
    };
    expect(notif.method).toBe('notifications/message');
    expect(notif.params.level).toBe('warning');
    expect(notif.params.logger).toBe('ratelimit');
    expect(notif.params.data.tier).toBe('minute');
    expect(notif.params.data.limit).toBe(30);
  });

  it('fires exactly at the 0.20 threshold boundary', async () => {
    const extra = extraWith(() => Promise.resolve());
    const wrapped = withMetricsCore('tool_invocation', 't', baseCtx(rl(0.2)), () => 'success', ok);
    await wrapped({}, extra);
    expect(extra.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('does NOT emit when headroom is above 20% remaining', async () => {
    const extra = extraWith(() => Promise.resolve());
    const wrapped = withMetricsCore('tool_invocation', 't', baseCtx(rl(0.5)), () => 'success', ok);
    await wrapped({}, extra);
    expect(extra.sendNotification).not.toHaveBeenCalled();
  });

  it('does NOT emit when no rateLimit context is present (stdio / graceful-skip)', async () => {
    const extra = extraWith(() => Promise.resolve());
    const wrapped = withMetricsCore(
      'tool_invocation',
      't',
      baseCtx(undefined),
      () => 'success',
      ok
    );
    await wrapped({}, extra);
    expect(extra.sendNotification).not.toHaveBeenCalled();
  });

  it('is gated to tool_invocation — a resource_read never warns', async () => {
    const extra = extraWith(() => Promise.resolve());
    const wrapped = withMetricsCore(
      'resource_read',
      'gst://x',
      baseCtx(rl(0.05)),
      () => 'success',
      ok
    );
    await wrapped({}, extra);
    expect(extra.sendNotification).not.toHaveBeenCalled();
  });

  it('never throws when the handler exposes no sendNotification (non-SSE / zero-arg)', async () => {
    const wrapped = withMetricsCore('tool_invocation', 't', baseCtx(rl(0.05)), () => 'success', ok);
    // Only a plain input arg, no extra with sendNotification.
    await expect(wrapped({ q: 'x' })).resolves.toEqual({ content: [{ type: 'text', text: 'ok' }] });
  });

  it('never breaks the tool call when sendNotification rejects', async () => {
    const extra = extraWith(() => Promise.reject(new Error('stream closed')));
    const wrapped = withMetricsCore('tool_invocation', 't', baseCtx(rl(0.05)), () => 'success', ok);
    await expect(wrapped({}, extra)).resolves.toEqual({ content: [{ type: 'text', text: 'ok' }] });
    expect(extra.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('never breaks the tool call when sendNotification throws synchronously', async () => {
    const extra = extraWith(() => {
      throw new Error('boom');
    });
    const wrapped = withMetricsCore('tool_invocation', 't', baseCtx(rl(0.05)), () => 'success', ok);
    await expect(wrapped({}, extra)).resolves.toEqual({ content: [{ type: 'text', text: 'ok' }] });
  });
});
