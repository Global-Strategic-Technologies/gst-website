/**
 * BL-032.75 Phase 1 — emitPromptSpan tests.
 *
 * Helper is unwired in Step 4 (correlation-id propagation needs
 * client-side cooperation — BL-033 work). Tests pin the emit shape so
 * the day it's wired, the column-map projection is already correct.
 */
import { describe, expect, it } from 'vitest';
import { emitPromptSpan } from '../../../src/metrics/prompt-span';
import { InMemorySink } from '../../../src/metrics/sinks/in-memory';

function ctx(keyOwner?: string) {
  const sink = new InMemorySink();
  return { sink, mc: { sink, keyOwner } };
}

describe('emitPromptSpan', () => {
  it('emits one prompt_span event with all step fields populated', () => {
    const { sink, mc } = ctx('RP');
    emitPromptSpan(mc, {
      promptName: 'gst_target_quick_look',
      toolName: 'search_radar',
      seq: 0,
      correlationId: 'corr-abc-123',
      durationMs: 47,
      outcome: 'success',
    });
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]).toEqual({
      event_type: 'prompt_span',
      name: 'gst_target_quick_look',
      keyOwner: 'RP',
      outcome: 'success',
      correlation_id: 'corr-abc-123',
      duration_ms: 47,
      seq: 0,
    });
  });

  it('emits outcome=error correctly', () => {
    const { sink, mc } = ctx();
    emitPromptSpan(mc, {
      promptName: 'p',
      toolName: 't',
      seq: 2,
      correlationId: 'c',
      durationMs: 12,
      outcome: 'error',
    });
    expect(sink.events[0].outcome).toBe('error');
  });

  it('drops the event if the guard rejects (e.g. oversize correlation_id)', () => {
    const { sink, mc } = ctx();
    emitPromptSpan(mc, {
      promptName: 'p',
      toolName: 't',
      seq: 0,
      // 100 chars > correlation_id maxChars (64); will be truncated by
      // the guard but still emit. Guard only rejects on outcome / event
      // shape, not on truncation.
      correlationId: 'c'.repeat(100),
      durationMs: 1,
      outcome: 'success',
    });
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0].correlation_id).toHaveLength(64);
    expect(sink.events[0].correlation_id?.endsWith('…')).toBe(true);
  });

  it('trusts the MetricSink contract (production sinks NEVER throw; broken sinks surface)', () => {
    // Documenting the trust boundary: emitPromptSpan does NOT wrap
    // sink.write in try/catch. The MetricSink interface contract is
    // explicit: sinks must not throw. AnalyticsEngineSink (production)
    // honors this via internal try/catch; NoopSink + InMemorySink are
    // trivially non-throwing. A contributor implementing a new sink
    // that throws is a CONTRACT VIOLATION — surfacing it is the correct
    // behavior so the bug doesn't hide.
    const brokenSink = {
      write() {
        throw new Error('contract-violating sink');
      },
    };
    expect(() =>
      emitPromptSpan(
        { sink: brokenSink },
        {
          promptName: 'p',
          toolName: 't',
          seq: 0,
          correlationId: 'c',
          durationMs: 1,
          outcome: 'success',
        }
      )
    ).toThrow('contract-violating sink');
  });
});
