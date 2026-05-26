/**
 * Unit tests for the Inoreader egress accounting wrapper (BL-032.75 Phase 0).
 *
 * These tests pin the contract surface that the rest of Phase 0 builds on:
 *
 *   - Every received response increments the per-category counter exactly once.
 *   - Zone-1 categories (`cron-radar`, `live-radar`, `http-radar-snapshot`,
 *     `401-retry`) also increment the daily Zone-1 total. `oauth-refresh`
 *     does NOT — `/oauth2/token` is not in either Inoreader Zone table
 *     (verified 2026-05-26 against the docs).
 *   - 429 responses DO increment (Inoreader counts the 429 itself per the
 *     X-Reader-Zone1-Usage header populated on 429s, per
 *     `inoreader-client.ts:69-70` comment).
 *   - Drift detection: when the local counter and the observed
 *     `X-Reader-Zone1-Usage` disagree by >2, a Sentry message fires so the
 *     missing or extra call surfaces to an operator.
 *   - Best-effort: Upstash unreachable never throws — counter is a guard
 *     rail, not auth.
 *   - TTL is set on first-write so the key auto-rolls at UTC midnight.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { redisIncr, redisGet, redisExpire, MockRedis, captureMessageMock, safeLogMock } = vi.hoisted(
  () => {
    const redisIncr = vi.fn();
    const redisGet = vi.fn();
    const redisExpire = vi.fn();
    const captureMessageMock = vi.fn();
    const safeLogMock = vi.fn();
    class MockRedis {
      incr = redisIncr;
      get = redisGet;
      expire = redisExpire;
    }
    return { redisIncr, redisGet, redisExpire, MockRedis, captureMessageMock, safeLogMock };
  }
);

vi.mock('@upstash/redis', () => ({ Redis: MockRedis }));
vi.mock('../../../src/observability/sentry', () => ({
  captureMessage: captureMessageMock,
}));
vi.mock('../../../src/auth/safe-logger', () => ({ safeLog: safeLogMock }));

import {
  recordInoreaderEgress,
  readInoreaderSpend,
  totalSpendKey,
  categorySpendKey,
  categoryCountsAgainstZone1,
  INOREADER_EGRESS_CATEGORIES,
  type InoreaderEgressCategory,
} from '../../../src/lib/inoreader-egress';
import type { Env } from '../../../src/worker';

const env: Env = {
  UPSTASH_MCP_REST_URL: 'https://mcp.upstash.io',
  UPSTASH_MCP_REST_TOKEN: 'token',
};

beforeEach(() => {
  redisIncr.mockReset();
  redisGet.mockReset();
  redisExpire.mockReset();
  captureMessageMock.mockReset();
  safeLogMock.mockReset();
});

describe('recordInoreaderEgress: counter increments', () => {
  it('increments the per-category counter on a 200 response', async () => {
    redisIncr.mockResolvedValue(5);

    await recordInoreaderEgress({ env, category: 'live-radar', status: 200 });

    // First INCR is the per-category key; second is the Zone-1 total.
    expect(redisIncr).toHaveBeenCalledWith(categorySpendKey('live-radar'));
  });

  it('increments BOTH per-category AND Zone-1 total for Zone-1 categories', async () => {
    redisIncr.mockResolvedValueOnce(3).mockResolvedValueOnce(12);

    await recordInoreaderEgress({ env, category: 'cron-radar', status: 200 });

    // Behavior contract: both keys tick exactly once. Order is intentionally
    // not pinned — a future Promise.all refactor is free to reorder them
    // without breaking this test.
    expect(redisIncr).toHaveBeenCalledTimes(2);
    expect(redisIncr).toHaveBeenCalledWith(categorySpendKey('cron-radar'));
    expect(redisIncr).toHaveBeenCalledWith(totalSpendKey());
  });

  it('skips the Zone-1 total for oauth-refresh (per-category only)', async () => {
    redisIncr.mockResolvedValueOnce(1);

    await recordInoreaderEgress({ env, category: 'oauth-refresh', status: 200 });

    expect(redisIncr).toHaveBeenCalledTimes(1);
    expect(redisIncr).toHaveBeenCalledWith(categorySpendKey('oauth-refresh'));
    expect(redisIncr).not.toHaveBeenCalledWith(totalSpendKey());
  });

  it('counts a 429 response (Inoreader populates X-Reader-Zone1-Usage on 429s)', async () => {
    redisIncr.mockResolvedValueOnce(2).mockResolvedValueOnce(7);

    await recordInoreaderEgress({
      env,
      category: 'live-radar',
      status: 429,
      zone1UsageHeader: 7,
    });

    // Both the per-category counter and the Zone-1 total must tick on a 429
    // to stay synchronized with Inoreader's own counter.
    expect(redisIncr).toHaveBeenCalledTimes(2);
  });

  it('counts a 5xx response (best-effort — Inoreader received the call)', async () => {
    redisIncr.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    await recordInoreaderEgress({ env, category: 'live-radar', status: 503 });

    expect(redisIncr).toHaveBeenCalledTimes(2);
  });

  it('counts a 401-retry as its own category', async () => {
    redisIncr.mockResolvedValueOnce(1).mockResolvedValueOnce(11);

    await recordInoreaderEgress({ env, category: '401-retry', status: 200 });

    expect(redisIncr).toHaveBeenCalledWith(categorySpendKey('401-retry'));
    expect(redisIncr).toHaveBeenCalledWith(totalSpendKey());
  });
});

describe('recordInoreaderEgress: TTL', () => {
  it('sets TTL on the per-category key when INCR returns 1 (first write today)', async () => {
    redisIncr.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    await recordInoreaderEgress({ env, category: 'live-radar', status: 200 });

    // Both first-writes get TTL. 25h covers a full UTC day + roll-over slack.
    expect(redisExpire).toHaveBeenCalledWith(categorySpendKey('live-radar'), 25 * 60 * 60);
    expect(redisExpire).toHaveBeenCalledWith(totalSpendKey(), 25 * 60 * 60);
  });

  it('does NOT set TTL when INCR returns > 1 (key already exists today)', async () => {
    redisIncr.mockResolvedValueOnce(5).mockResolvedValueOnce(20);

    await recordInoreaderEgress({ env, category: 'live-radar', status: 200 });

    expect(redisExpire).not.toHaveBeenCalled();
  });
});

describe('recordInoreaderEgress: drift detection', () => {
  it('emits inoreader.spend.drift when counter - observed > 2', async () => {
    // Counter says 20, Inoreader observed 15 → drift = +5 (we counted more
    // than Inoreader did — likely double-incrementing somewhere).
    redisIncr.mockResolvedValueOnce(2).mockResolvedValueOnce(20);

    await recordInoreaderEgress({
      env,
      category: 'live-radar',
      status: 200,
      zone1UsageHeader: 15,
    });

    // Behavior contract: warning-severity capture with the diagnostic payload.
    // Positional arg shape is NOT pinned — a future signature consolidation
    // (e.g. options-object) should not break this test as long as the
    // payload fields surface.
    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    const args = captureMessageMock.mock.calls[0];
    expect(args).toEqual(
      expect.arrayContaining([
        'inoreader.spend.drift',
        'warning',
        expect.objectContaining({ counter: 20, observed: 15, drift: 5 }),
      ])
    );
  });

  it('emits inoreader.spend.drift when observed - counter > 2 (we missed calls)', async () => {
    // Counter says 5, Inoreader observed 12 → drift = -7 (we missed calls
    // — some untracked egress path is bypassing the wrapper).
    redisIncr.mockResolvedValueOnce(1).mockResolvedValueOnce(5);

    await recordInoreaderEgress({
      env,
      category: 'live-radar',
      status: 200,
      zone1UsageHeader: 12,
    });

    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    const args = captureMessageMock.mock.calls[0];
    expect(args).toEqual(expect.arrayContaining([expect.objectContaining({ drift: -7 })]));
  });

  it('does NOT emit drift when |drift| <= 2 (race tolerance)', async () => {
    redisIncr.mockResolvedValueOnce(1).mockResolvedValueOnce(10);

    await recordInoreaderEgress({
      env,
      category: 'live-radar',
      status: 200,
      zone1UsageHeader: 9, // drift = +1, within tolerance
    });

    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it('does NOT check drift when zone1UsageHeader is undefined', async () => {
    redisIncr.mockResolvedValueOnce(1).mockResolvedValueOnce(50);

    await recordInoreaderEgress({ env, category: 'live-radar', status: 200 });

    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it('does NOT check drift for oauth-refresh (not Zone-1)', async () => {
    redisIncr.mockResolvedValueOnce(1);

    await recordInoreaderEgress({
      env,
      category: 'oauth-refresh',
      status: 200,
      zone1UsageHeader: 999, // ignored — OAuth doesn't contribute to Zone-1
    });

    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  // Boundary case: first call of the day → Inoreader's counter is at 0 BEFORE
  // ours ticks. Our counter post-INCR is 1, observed=0 → drift=1, below the
  // threshold. The Number.isFinite(0) guard must let this through (not
  // confuse 0 with "missing header"). Audit gap §3.1.
  it('treats zone1UsageHeader: 0 as a real reading (not a missing header)', async () => {
    redisIncr.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    await recordInoreaderEgress({
      env,
      category: 'cron-radar',
      status: 200,
      zone1UsageHeader: 0,
    });

    // drift = 1 - 0 = 1; within tolerance, no message.
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it('emits drift when zone1UsageHeader: 0 but counter has drifted', async () => {
    // Pathological case: counter says 10, Inoreader observed 0 (e.g. quota
    // reset on Inoreader's side but our counter hasn't rolled). drift = 10,
    // well above the threshold.
    redisIncr.mockResolvedValueOnce(1).mockResolvedValueOnce(10);

    await recordInoreaderEgress({
      env,
      category: 'cron-radar',
      status: 200,
      zone1UsageHeader: 0,
    });

    expect(captureMessageMock).toHaveBeenCalledTimes(1);
  });
});

// Audit gap §3.4 / §3.5: the egress module emits structured logs on every
// call (operators rely on these via `wrangler tail`). Without these
// assertions, removing the safeLog lines from production passes 100% of
// tests — so the breadcrumb contract was silently untested.
describe('recordInoreaderEgress: safeLog breadcrumbs', () => {
  it('emits an inoreader.egress breadcrumb on the success path with the call shape', async () => {
    redisIncr.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    await recordInoreaderEgress({
      env,
      category: 'live-radar',
      status: 200,
      zone1UsageHeader: 5,
      source: 'fetchAnnotatedItems',
    });

    expect(safeLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'inoreader.egress',
        category: 'live-radar',
        status: 200,
        success: true,
        zone1Usage: 5,
      })
    );
  });

  it('emits success: false on a 4xx response', async () => {
    redisIncr.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    await recordInoreaderEgress({ env, category: 'live-radar', status: 429 });

    expect(safeLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'inoreader.egress', status: 429, success: false })
    );
  });

  it('emits the inoreader.egress.counter-write-failed breadcrumb when INCR rejects', async () => {
    redisIncr.mockRejectedValueOnce(new Error('upstash unreachable'));

    await recordInoreaderEgress({ env, category: 'live-radar', status: 200 });

    // First log line is the per-call breadcrumb; second is the failure
    // notice. Operators alert on the second pattern.
    expect(safeLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'inoreader.egress.counter-write-failed',
        category: 'live-radar',
        success: false,
      })
    );
  });
});

describe('recordInoreaderEgress: best-effort failure handling', () => {
  it('does not throw when Upstash creds are not bound', async () => {
    const emptyEnv: Env = {};

    await expect(
      recordInoreaderEgress({ env: emptyEnv, category: 'live-radar', status: 200 })
    ).resolves.toBeUndefined();

    expect(redisIncr).not.toHaveBeenCalled();
  });

  it('does not throw when INCR rejects (Upstash unreachable)', async () => {
    redisIncr.mockRejectedValueOnce(new Error('upstash unreachable'));

    await expect(
      recordInoreaderEgress({ env, category: 'live-radar', status: 200 })
    ).resolves.toBeUndefined();
  });

  it('does not throw when expire rejects (counter set but TTL failed)', async () => {
    redisIncr.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    redisExpire.mockRejectedValueOnce(new Error('upstash flap'));

    await expect(
      recordInoreaderEgress({ env, category: 'live-radar', status: 200 })
    ).resolves.toBeUndefined();
  });
});

describe('readInoreaderSpend', () => {
  it('returns 0 totals when Upstash creds are not bound', async () => {
    const result = await readInoreaderSpend({});

    expect(result.total).toBe(0);
    for (const cat of INOREADER_EGRESS_CATEGORIES) {
      expect(result.byCategory[cat]).toBe(0);
    }
  });

  it('returns the parsed total + per-category counts', async () => {
    redisGet.mockImplementation(async (key: string) => {
      if (key === totalSpendKey()) return 42;
      if (key === categorySpendKey('cron-radar')) return 24;
      if (key === categorySpendKey('live-radar')) return 12;
      if (key === categorySpendKey('http-radar-snapshot')) return 4;
      if (key === categorySpendKey('oauth-refresh')) return 8;
      if (key === categorySpendKey('401-retry')) return 2;
      return null;
    });

    const result = await readInoreaderSpend(env);

    expect(result.total).toBe(42);
    expect(result.byCategory).toEqual({
      'cron-radar': 24,
      'live-radar': 12,
      'http-radar-snapshot': 4,
      'oauth-refresh': 8,
      '401-retry': 2,
    });
  });

  it('coerces string-typed counter values returned by Upstash', async () => {
    redisGet.mockImplementation(async (key: string) => {
      if (key === totalSpendKey()) return '99';
      if (key === categorySpendKey('cron-radar')) return '50';
      return null;
    });

    const result = await readInoreaderSpend(env);

    expect(result.total).toBe(99);
    expect(result.byCategory['cron-radar']).toBe(50);
    // Missing counters default to 0 rather than NaN.
    expect(result.byCategory['live-radar']).toBe(0);
  });

  it('returns zeros when Upstash throws', async () => {
    redisGet.mockRejectedValue(new Error('upstash unreachable'));

    const result = await readInoreaderSpend(env);

    expect(result.total).toBe(0);
    for (const cat of INOREADER_EGRESS_CATEGORIES) {
      expect(result.byCategory[cat]).toBe(0);
    }
  });
});

describe('categoryCountsAgainstZone1', () => {
  it.each<[InoreaderEgressCategory, boolean]>([
    ['cron-radar', true],
    ['live-radar', true],
    ['http-radar-snapshot', true],
    ['401-retry', true],
    ['oauth-refresh', false],
  ])('%s -> %s', (cat, expected) => {
    expect(categoryCountsAgainstZone1(cat)).toBe(expected);
  });
});
