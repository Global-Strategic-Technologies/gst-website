/**
 * BL-032.75 Phase 1 — AnalyticsEngineSink tests (M5 from the Steps 1-3
 * adversarial audit).
 *
 * Covers:
 *   - Normal-path write: `writeDataPoint` called with the projected shape
 *   - Failure-path swallowing: when `writeDataPoint` throws, the sink does
 *     NOT propagate
 *   - First-failure logging: a single safeLog line is emitted per sink
 *     instance on the first throw (M5 — prevents silent loss of visibility
 *     across an entire deploy from a misconfigured binding)
 */
import { describe, expect, it, vi } from 'vitest';
import type { AnalyticsEngineDataset } from '@cloudflare/workers-types';
import { AnalyticsEngineSink } from '../../../../src/metrics/sinks/analytics-engine';

function makeMockDataset(throwsOnWrite = false): AnalyticsEngineDataset {
  return {
    writeDataPoint: vi.fn(() => {
      if (throwsOnWrite) throw new Error('mock substrate error');
    }),
  } as unknown as AnalyticsEngineDataset;
}

describe('AnalyticsEngineSink', () => {
  it('writes the projected data point to the bound dataset', () => {
    const dataset = makeMockDataset(false);
    const sink = new AnalyticsEngineSink(dataset);
    sink.write({ event_type: 'tool_invocation', name: 'a', keyOwner: 'RP', outcome: 'success' });
    expect(dataset.writeDataPoint).toHaveBeenCalledOnce();
    const dp = (dataset.writeDataPoint as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(dp.blobs[0]).toBe('tool_invocation');
    expect(dp.blobs[1]).toBe('a');
    expect(dp.blobs[2]).toBe('RP');
    expect(dp.blobs[3]).toBe('success');
    expect(dp.indexes).toEqual(['RP']);
  });

  it('does NOT throw when the dataset write throws (best-effort contract)', () => {
    const dataset = makeMockDataset(true);
    const sink = new AnalyticsEngineSink(dataset);
    expect(() =>
      sink.write({ event_type: 'tool_invocation', name: 'a', outcome: 'success' })
    ).not.toThrow();
  });

  it('M5: only one safeLog line per sink instance even after many write failures', () => {
    // Adversarial-audit M5: a misconfigured binding could throw on every
    // write. We want exactly one signal (so the post-deploy soak catches
    // "we lost AE visibility"), not N logs flooding `wrangler tail`.
    const dataset = makeMockDataset(true);
    const sink = new AnalyticsEngineSink(dataset);
    // Spy on console.log since safeLog emits there. The actual safeLog
    // assertion happens via the count: dataset.writeDataPoint is called
    // for every write, but the log line only emits on the first failure.
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    for (let i = 0; i < 5; i++) {
      sink.write({ event_type: 'tool_invocation', name: `t${i}`, outcome: 'success' });
    }
    expect(dataset.writeDataPoint).toHaveBeenCalledTimes(5);
    const failureLogs = consoleSpy.mock.calls.filter((call) => {
      const arg = call[0];
      return typeof arg === 'string' && arg.includes('metrics.sink.write_failed');
    });
    expect(failureLogs).toHaveLength(1);
    consoleSpy.mockRestore();
  });
});
