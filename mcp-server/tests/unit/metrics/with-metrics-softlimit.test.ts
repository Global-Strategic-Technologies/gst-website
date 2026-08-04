/**
 * BL-033 Slice 5 — the 80%-consumed soft-limit `notifications/message` emit
 * inside `withMetricsCore`.
 *
 * The wrapper reads the boundary's already-computed rate-limit result from
 * `MetricsContext.rateLimit` and, when some bucket is ≥80% spent, writes a
 * best-effort warning onto the request's SSE stream via `ctx.mcpReq.notify`.
 * These tests pin: fires at/under the 0.20 threshold, silent above it, never
 * throws when the notifier is absent or rejects, and is gated to tool calls.
 *
 * BL-106 — the fake below moved from SDK v1's flat `{ sendNotification }` to
 * v2's nested `{ mcpReq: { notify } }`. That rename is exactly why these tests
 * are load-bearing: before the migration they built their own v1-shaped fake,
 * so they would have kept passing while production — reading a field the SDK
 * no longer supplies — silently stopped emitting the warning altogether. When
 * these four went red on the swap, that WAS the structural fix proving itself.
 * Keep the fake shaped like the real `ServerContext`; do not loosen it.
 */
import { describe, it, expect, vi, type Mock } from 'vitest';
import type { ServerContext } from '@modelcontextprotocol/server';
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

/**
 * An SDK `ServerContext` carrying a `mcpReq.notify` spy. The spy is hoisted
 * onto the returned object as `notify` so assertions stay readable, but the
 * shape the production code reads is the nested one.
 *
 * The return type is annotated as `Pick<ServerContext, 'mcpReq'>` so the fake
 * is described in the SDK's own vocabulary rather than an invented shape. Be
 * precise about what that does and does not buy: the object literal goes
 * through a double cast (building a real `ServerContext['mcpReq']` — `id`,
 * `method`, `requestState`, `signal`, `send` — would be pure noise here), so
 * **this file is not the guard**. The guard is the `Pick<ServerContext,
 * 'mcpReq'>` in `src/metrics/with-metrics.ts`: an SDK rename breaks
 * `findMcpNotifier` at compile time in production code, which is what stops
 * the v1→v2 silent loss from recurring (BL-106).
 */
const extraWith = (
  send: (n: unknown) => unknown
): Pick<ServerContext, 'mcpReq'> & {
  notify: Mock;
} => {
  const notify = vi.fn(send);
  return { notify, mcpReq: { notify } } as unknown as Pick<ServerContext, 'mcpReq'> & {
    notify: Mock;
  };
};

// Mirrors an MCP tool callback's `(args, ctx)` arity so `withMetricsCore`
// infers a 2-arg wrapper the tests can invoke with a context. The SDK passes
// its context LAST on every overload, which is the position production reads.
const ok = async (_input?: unknown, _ctx?: unknown) => ({
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

    expect(extra.notify).toHaveBeenCalledTimes(1);
    const notif = extra.notify.mock.calls[0]![0] as {
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

  it('reports the ratio-tripping bucket (nearestLimit), not the binding bucket', async () => {
    // Binding bucket is the minute tier (absolute-fewest remaining, 50 < 100), but
    // the day bucket is proportionally closer to its cliff (100/1000 = 0.10 vs the
    // minute's 50/60 = 0.83) and is what tripped the warning. The agent must be told
    // to throttle the DAY window — this is exactly what the real picker produces.
    const extra = extraWith(() => Promise.resolve());
    const ctx: MetricsContext = {
      sink: new NoopSink(),
      rateLimit: {
        tier: 'minute', // binding (absolute-fewest remaining)
        limit: 60,
        remaining: 50,
        resetAt: Date.now() + 30_000,
        minRemainingRatio: 0.1,
        nearestLimit: { tier: 'day', limit: 1000, remaining: 100, resetAt: Date.now() + 3_600_000 },
      },
    };
    const wrapped = withMetricsCore('tool_invocation', 't', ctx, () => 'success', ok);
    await wrapped({}, extra);

    const data = (extra.notify.mock.calls[0]![0] as { params: { data: Record<string, unknown> } })
      .params.data;
    expect(data.tier).toBe('day');
    expect(data.limit).toBe(1000);
    expect(data.remaining).toBe(100);
  });

  it('fires exactly at the 0.20 threshold boundary', async () => {
    const extra = extraWith(() => Promise.resolve());
    const wrapped = withMetricsCore('tool_invocation', 't', baseCtx(rl(0.2)), () => 'success', ok);
    await wrapped({}, extra);
    expect(extra.notify).toHaveBeenCalledTimes(1);
  });

  it('does NOT emit when headroom is above 20% remaining', async () => {
    const extra = extraWith(() => Promise.resolve());
    const wrapped = withMetricsCore('tool_invocation', 't', baseCtx(rl(0.5)), () => 'success', ok);
    await wrapped({}, extra);
    expect(extra.notify).not.toHaveBeenCalled();
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
    expect(extra.notify).not.toHaveBeenCalled();
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
    expect(extra.notify).not.toHaveBeenCalled();
  });

  it('never throws when the handler context exposes no notifier (non-SSE / zero-arg)', async () => {
    const wrapped = withMetricsCore('tool_invocation', 't', baseCtx(rl(0.05)), () => 'success', ok);
    // Only a plain input arg — no trailing ServerContext, so no notifier.
    await expect(wrapped({ q: 'x' })).resolves.toEqual({ content: [{ type: 'text', text: 'ok' }] });
  });

  it('never breaks the tool call when notify rejects', async () => {
    const extra = extraWith(() => Promise.reject(new Error('stream closed')));
    const wrapped = withMetricsCore('tool_invocation', 't', baseCtx(rl(0.05)), () => 'success', ok);
    await expect(wrapped({}, extra)).resolves.toEqual({ content: [{ type: 'text', text: 'ok' }] });
    expect(extra.notify).toHaveBeenCalledTimes(1);
  });

  it('never breaks the tool call when notify throws synchronously', async () => {
    const extra = extraWith(() => {
      throw new Error('boom');
    });
    const wrapped = withMetricsCore('tool_invocation', 't', baseCtx(rl(0.05)), () => 'success', ok);
    await expect(wrapped({}, extra)).resolves.toEqual({ content: [{ type: 'text', text: 'ok' }] });
  });
});
