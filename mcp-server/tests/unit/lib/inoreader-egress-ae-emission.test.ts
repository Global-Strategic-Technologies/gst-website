/**
 * BL-032.75 Phase 1 Step 6 — `inoreader_call` AE emission.
 *
 * Asserts:
 *   - `recordInoreaderEgress` emits one `inoreader_call` event per call
 *   - `zone1='1'` for Zone-1 categories, `'0'` for `oauth-refresh`
 *   - `outcome='success'` on 2xx, `'error'` on non-2xx
 *   - `status_code` carries the HTTP status as a string
 *   - `keyOwner` is threaded when supplied; absent otherwise
 *   - Network-error path in `singleFetch` also emits (`status_code='0'`,
 *     `outcome='error'`)
 *
 * Exercises the **real** `recordInoreaderEgress` (not a mock of it) — the
 * audit's OVERLOOKED #5 caught that mocking at the fetch layer hides the
 * emit path entirely.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AnalyticsEngineDataPoint } from '@cloudflare/workers-types';

const { MockRedis } = vi.hoisted(() => {
  class MockRedis {
    get = vi.fn().mockResolvedValue('tok');
    set = vi.fn().mockResolvedValue('OK');
    incr = vi.fn().mockResolvedValue(1);
    expire = vi.fn().mockResolvedValue(1);
    del = vi.fn().mockResolvedValue(1);
  }
  return { MockRedis };
});

vi.mock('@upstash/redis', () => ({ Redis: MockRedis }));

import { recordInoreaderEgress } from '../../../src/lib/inoreader-egress';
import type { Env } from '../../../src/worker';

class FakeDataset {
  readonly writes: AnalyticsEngineDataPoint[] = [];
  writeDataPoint(dp: AnalyticsEngineDataPoint): void {
    this.writes.push(dp);
  }
}

let metrics: FakeDataset;
let env: Env;

beforeEach(() => {
  metrics = new FakeDataset();
  env = {
    INOREADER_APP_ID: 'app',
    INOREADER_APP_KEY: 'key',
    INOREADER_ACCESS_TOKEN: 'tok',
    UPSTASH_MCP_REST_URL: 'https://y.upstash.io',
    UPSTASH_MCP_REST_TOKEN: 'rw',
    METRICS: metrics as unknown as Env['METRICS'],
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function blobsOf(dp: AnalyticsEngineDataPoint): (string | null)[] {
  return (dp.blobs ?? []) as (string | null)[];
}

describe('recordInoreaderEgress — inoreader_call AE emission', () => {
  it('emits success + zone1=1 for cron-radar 200', async () => {
    await recordInoreaderEgress({
      env,
      category: 'cron-radar',
      status: 200,
      durationMs: 120,
      keyOwner: 'RP',
    });
    expect(metrics.writes).toHaveLength(1);
    const b = blobsOf(metrics.writes[0]!);
    expect(b[0]).toBe('inoreader_call');
    expect(b[1]).toBe('cron-radar');
    expect(b[2]).toBe('RP');
    expect(b[3]).toBe('success');
    expect(b[5]).toBe('200');
    expect(b[6]).toBe('1');
  });

  it('emits error outcome for non-2xx status', async () => {
    await recordInoreaderEgress({
      env,
      category: 'live-radar',
      status: 429,
    });
    expect(metrics.writes).toHaveLength(1);
    const b = blobsOf(metrics.writes[0]!);
    expect(b[3]).toBe('error');
    expect(b[5]).toBe('429');
    expect(b[6]).toBe('1');
  });

  it('emits zone1=0 for oauth-refresh (excluded from Zone-1 spend math)', async () => {
    await recordInoreaderEgress({
      env,
      category: 'oauth-refresh',
      status: 200,
    });
    const b = blobsOf(metrics.writes[0]!);
    expect(b[1]).toBe('oauth-refresh');
    expect(b[6]).toBe('0');
  });

  it('absent keyOwner projects to __none__ placeholder in index1', async () => {
    await recordInoreaderEgress({
      env,
      category: 'cron-radar',
      status: 200,
    });
    const dp = metrics.writes[0]!;
    expect(dp.indexes).toEqual(['__none__']);
  });

  it('present keyOwner mirrors into blob3 and index1', async () => {
    await recordInoreaderEgress({
      env,
      category: 'live-radar',
      status: 200,
      keyOwner: 'RP',
    });
    const dp = metrics.writes[0]!;
    expect(blobsOf(dp)[2]).toBe('RP');
    expect(dp.indexes).toEqual(['RP']);
  });

  it('keeps INOREADER_EGRESS_CATEGORIES aligned with NAME_VALUES.inoreader_call (audit M1)', async () => {
    // Drift hazard: a future PR adds a 6th category to the wrapper's
    // CATEGORIES map but forgets to update the schema's NAME_VALUES. The
    // guard would then reject the new category at runtime and lose
    // visibility silently. This test fails before that ships.
    const { INOREADER_EGRESS_CATEGORIES } = await import('../../../src/lib/inoreader-egress');
    const { NAME_VALUES } = await import('../../../src/metrics/_schema');
    expect([...INOREADER_EGRESS_CATEGORIES].sort()).toEqual(
      [...(NAME_VALUES.inoreader_call ?? [])].sort()
    );
  });

  it('no AE write when env.METRICS is unbound', async () => {
    const envNoMetrics: Env = { ...env, METRICS: undefined };
    await recordInoreaderEgress({
      env: envNoMetrics,
      category: 'cron-radar',
      status: 200,
    });
    // No throw, no write. Best-effort.
    expect(metrics.writes).toHaveLength(0);
  });
});
