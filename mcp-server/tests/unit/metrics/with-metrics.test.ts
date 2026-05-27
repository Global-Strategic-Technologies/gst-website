/**
 * BL-032.75 Phase 1 — withMetrics HOF tests.
 *
 * Covers all three surface-specific variants + the generic core. Asserts
 * the wrapped handler behaves identically to unwrapped (same args, same
 * return, same throw), and that one correctly-shaped event lands in the
 * sink per invocation.
 */
import { describe, expect, it, vi } from 'vitest';
import { InMemorySink } from '../../../src/metrics/sinks/in-memory';
import {
  withMetricsCore,
  withPromptMetrics,
  withResourceMetrics,
  withToolMetrics,
  type MetricsContext,
} from '../../../src/metrics/with-metrics';

function makeCtx(keyOwner?: string): { sink: InMemorySink; ctx: MetricsContext } {
  const sink = new InMemorySink();
  return { sink, ctx: { sink, keyOwner } };
}

describe('withToolMetrics', () => {
  it('emits one tool_invocation event with success on a clean result', async () => {
    const { sink, ctx } = makeCtx('RP');
    const inner = vi.fn().mockResolvedValue({ isError: false, content: [] });
    const wrapped = withToolMetrics('search_radar', ctx, inner);
    await wrapped({ tier: 'wire' });

    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]).toMatchObject({
      event_type: 'tool_invocation',
      name: 'search_radar',
      keyOwner: 'RP',
      outcome: 'success',
    });
    expect(sink.events[0].duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('emits outcome=error when result.isError is true (MCP convention)', async () => {
    const { sink, ctx } = makeCtx('RP');
    const wrapped = withToolMetrics('search_radar', ctx, async () => ({
      isError: true,
      content: [],
    }));
    await wrapped();
    expect(sink.events[0].outcome).toBe('error');
  });

  it('emits outcome=error AND rethrows when inner throws', async () => {
    const { sink, ctx } = makeCtx('RP');
    const wrapped = withToolMetrics('search_radar', ctx, async () => {
      throw new Error('boom');
    });
    await expect(wrapped()).rejects.toThrow('boom');
    expect(sink.events[0].outcome).toBe('error');
  });

  it('forwards the inner result unchanged', async () => {
    const { ctx } = makeCtx();
    const expected = { isError: false, content: [{ type: 'text', text: 'ok' }] };
    const wrapped = withToolMetrics('a', ctx, async () => expected);
    const result = await wrapped();
    expect(result).toBe(expected);
  });

  it('forwards all positional arguments to the inner handler', async () => {
    const { ctx } = makeCtx();
    const inner = vi.fn().mockResolvedValue({});
    const wrapped = withToolMetrics('a', ctx, inner);
    await wrapped({ x: 1 }, { extra: 'stuff' });
    expect(inner).toHaveBeenCalledWith({ x: 1 }, { extra: 'stuff' });
  });

  it('emits keyOwner=undefined when ctx has none (stdio path)', async () => {
    const { sink, ctx } = makeCtx();
    const wrapped = withToolMetrics('a', ctx, async () => ({}));
    await wrapped();
    expect(sink.events[0].keyOwner).toBeUndefined();
  });

  it('measures duration_ms across an awaited inner', async () => {
    const { sink, ctx } = makeCtx();
    const wrapped = withToolMetrics('a', ctx, async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return {};
    });
    await wrapped();
    expect(sink.events[0].duration_ms).toBeGreaterThanOrEqual(8);
  });
});

describe('withResourceMetrics', () => {
  it('emits one resource_read with name = URI on success', async () => {
    const { sink, ctx } = makeCtx('RP');
    const wrapped = withResourceMetrics('gst://library/vdr-structure', ctx, async () => ({
      contents: [],
    }));
    await wrapped();
    expect(sink.events[0]).toMatchObject({
      event_type: 'resource_read',
      name: 'gst://library/vdr-structure',
      keyOwner: 'RP',
      outcome: 'success',
    });
  });

  it('emits outcome=error on throw, rethrows', async () => {
    const { sink, ctx } = makeCtx();
    const wrapped = withResourceMetrics('gst://x/y', ctx, async () => {
      throw new Error('missing');
    });
    await expect(wrapped()).rejects.toThrow('missing');
    expect(sink.events[0].outcome).toBe('error');
  });
});

describe('withPromptMetrics', () => {
  it('emits one prompt_invocation on success', async () => {
    const { sink, ctx } = makeCtx('RP');
    const wrapped = withPromptMetrics('gst_target_quick_look', ctx, async () => ({
      messages: [],
    }));
    await wrapped();
    expect(sink.events[0]).toMatchObject({
      event_type: 'prompt_invocation',
      name: 'gst_target_quick_look',
      keyOwner: 'RP',
      outcome: 'success',
    });
  });

  it('emits outcome=error on throw, rethrows', async () => {
    const { sink, ctx } = makeCtx();
    const wrapped = withPromptMetrics('p', ctx, async () => {
      throw new Error('bad');
    });
    await expect(wrapped()).rejects.toThrow('bad');
    expect(sink.events[0].outcome).toBe('error');
  });
});

describe('withMetricsCore (generic)', () => {
  it('uses the supplied detectOutcome to project the result outcome', async () => {
    const { sink, ctx } = makeCtx();
    const wrapped = withMetricsCore<[number], number>(
      'tool_invocation',
      't',
      ctx,
      (n) => (n > 0 ? 'success' : 'error'),
      async (n) => n * 2
    );
    await wrapped(3); // success
    await wrapped(-1); // error
    expect(sink.events.map((e) => e.outcome)).toEqual(['success', 'error']);
  });

  it('drops a malformed event without throwing (guard rejects)', async () => {
    // Force a bad outcome via a detectOutcome that returns a typo.
    const { sink, ctx } = makeCtx();
    const wrapped = withMetricsCore<[], void>(
      'tool_invocation',
      't',
      ctx,
      () => 'sucess', // typo — not in OUTCOME_VALUES.tool_invocation
      async () => undefined
    );
    await wrapped();
    // Guard rejects the event; sink stays empty. The inner still runs.
    expect(sink.events).toHaveLength(0);
  });
});
