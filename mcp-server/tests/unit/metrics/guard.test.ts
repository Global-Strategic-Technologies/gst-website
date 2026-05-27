/**
 * BL-032.75 Phase 1 — guard.ts tests.
 *
 * Covers the four rejection paths (unknown event-type, bad outcome, oversize
 * keyOwner, oversize blob payload) and the normalization paths (string
 * truncation with marker).
 */
import { describe, expect, it } from 'vitest';
import { guardEvent } from '../../../src/metrics/guard';

describe('guardEvent — rejections (return null)', () => {
  it('rejects unknown event_type', () => {
    // Cast through unknown — TypeScript would catch this at compile time, but
    // a future runtime path (e.g. JSON.parse of remote config) could produce
    // it. The guard is the last line of defense.
    const result = guardEvent({ event_type: 'not_a_real_event' as never });
    expect(result).toBeNull();
  });

  it('rejects outcome not in the per-type allowlist', () => {
    const result = guardEvent({ event_type: 'tool_invocation', outcome: 'sucess' });
    expect(result).toBeNull();
  });

  it('rejects outcome valid for one type but used on another', () => {
    // `allow` is valid for rate_limit_decision but not for tool_invocation.
    const result = guardEvent({ event_type: 'tool_invocation', outcome: 'allow' });
    expect(result).toBeNull();
  });

  it('rejects keyOwner exceeding the AE 96-byte index cap', () => {
    const result = guardEvent({
      event_type: 'tool_invocation',
      keyOwner: 'X'.repeat(97),
    });
    expect(result).toBeNull();
  });
});

describe('guardEvent — acceptance + normalization', () => {
  it('passes a fully-valid event through unchanged', () => {
    const event = {
      event_type: 'tool_invocation' as const,
      name: 'search_radar',
      keyOwner: 'RP',
      outcome: 'success',
      status_code: '200',
      duration_ms: 142,
    };
    const result = guardEvent(event);
    expect(result).toEqual(event);
  });

  it('accepts an event with no outcome', () => {
    const result = guardEvent({ event_type: 'tool_invocation', name: 'a' });
    expect(result).not.toBeNull();
    expect(result?.outcome).toBeUndefined();
  });

  it('truncates a name longer than its 128-char cap with a … marker', () => {
    const longName = 'x'.repeat(200);
    const result = guardEvent({ event_type: 'tool_invocation', name: longName });
    expect(result).not.toBeNull();
    expect(result?.name).toHaveLength(128);
    expect(result?.name?.endsWith('…')).toBe(true);
    // Truncation preserves the prefix.
    expect(result?.name?.startsWith('x'.repeat(127))).toBe(true);
  });

  it('truncates correlation_id longer than its 64-char cap', () => {
    const longId = 'a'.repeat(80);
    const result = guardEvent({
      event_type: 'prompt_span',
      correlation_id: longId,
      seq: 0,
    });
    expect(result?.correlation_id).toHaveLength(64);
    expect(result?.correlation_id?.endsWith('…')).toBe(true);
  });

  it('does not mutate the input event when truncating', () => {
    const input = { event_type: 'tool_invocation' as const, name: 'x'.repeat(200) };
    const inputName = input.name;
    guardEvent(input);
    expect(input.name).toBe(inputName);
    expect(input.name).toHaveLength(200);
  });

  it('passes a 96-byte ASCII keyOwner (exactly at the cap)', () => {
    const result = guardEvent({
      event_type: 'tool_invocation',
      keyOwner: 'X'.repeat(96),
    });
    expect(result).not.toBeNull();
  });

  it('accepts each canonical outcome value for tool_invocation', () => {
    for (const outcome of ['success', 'error']) {
      const result = guardEvent({ event_type: 'tool_invocation', outcome });
      expect(result).not.toBeNull();
      expect(result?.outcome).toBe(outcome);
    }
  });

  it('accepts each canonical outcome value for rate_limit_decision', () => {
    for (const outcome of ['allow', 'throttle', 'deny']) {
      const result = guardEvent({ event_type: 'rate_limit_decision', outcome });
      expect(result).not.toBeNull();
    }
  });

  it('accepts each canonical outcome value for cron_outcome', () => {
    for (const outcome of ['success', 'error', 'skipped-circuit', 'skipped-budget']) {
      const result = guardEvent({ event_type: 'cron_outcome', outcome });
      expect(result).not.toBeNull();
    }
  });
});
