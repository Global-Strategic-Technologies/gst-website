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

const {
  redisIncr,
  redisGet,
  redisMget,
  redisExpire,
  redisSet,
  MockRedis,
  captureMessageMock,
  safeLogMock,
} = vi.hoisted(() => {
  const redisIncr = vi.fn();
  const redisGet = vi.fn();
  const redisMget = vi.fn();
  const redisExpire = vi.fn();
  const redisSet = vi.fn();
  const captureMessageMock = vi.fn();
  const safeLogMock = vi.fn();
  class MockRedis {
    incr = redisIncr;
    get = redisGet;
    mget = redisMget;
    expire = redisExpire;
    set = redisSet;
  }
  return {
    redisIncr,
    redisGet,
    redisMget,
    redisExpire,
    redisSet,
    MockRedis,
    captureMessageMock,
    safeLogMock,
  };
});

vi.mock('@upstash/redis', () => ({ Redis: MockRedis }));
vi.mock('../../../src/observability/sentry-envelope', () => ({
  captureMessageEnvelope: captureMessageMock,
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
  redisMget.mockReset();
  redisExpire.mockReset();
  redisSet.mockReset();
  captureMessageMock.mockReset();
  safeLogMock.mockReset();
  // Default: drift debounce flag SETs successfully (first-of-day path).
  // Tests that want "already alerted today" override this.
  redisSet.mockResolvedValue('OK');
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

describe('recordInoreaderEgress: TTL (always-EXPIRE, audit fix C1)', () => {
  it('re-issues EXPIRE on every INCR — both first write and subsequent writes', async () => {
    // First call of the day.
    redisIncr.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    await recordInoreaderEgress({ env, category: 'live-radar', status: 200 });

    expect(redisExpire).toHaveBeenCalledWith(categorySpendKey('live-radar'), 25 * 60 * 60);
    expect(redisExpire).toHaveBeenCalledWith(totalSpendKey(), 25 * 60 * 60);
    expect(redisExpire).toHaveBeenCalledTimes(2);

    redisExpire.mockClear();

    // Subsequent call — INCR returns > 1. EXPIRE STILL fires (eventually-
    // consistent TTL repairs any prior INCR-without-EXPIRE eviction). This
    // is the load-bearing assertion that closes audit C1.
    redisIncr.mockResolvedValueOnce(5).mockResolvedValueOnce(20);
    await recordInoreaderEgress({ env, category: 'live-radar', status: 200 });

    expect(redisExpire).toHaveBeenCalledTimes(2);
    expect(redisExpire).toHaveBeenCalledWith(categorySpendKey('live-radar'), 25 * 60 * 60);
    expect(redisExpire).toHaveBeenCalledWith(totalSpendKey(), 25 * 60 * 60);
  });

  it('only EXPIREs the per-category key for non-Zone-1 categories (oauth-refresh)', async () => {
    redisIncr.mockResolvedValueOnce(1);

    await recordInoreaderEgress({ env, category: 'oauth-refresh', status: 200 });

    expect(redisExpire).toHaveBeenCalledWith(categorySpendKey('oauth-refresh'), 25 * 60 * 60);
    expect(redisExpire).toHaveBeenCalledTimes(1); // no total-key EXPIRE
  });
});

describe('recordInoreaderEgress: drift detection', () => {
  it('emits inoreader.spend.drift when counter - observed > 6', async () => {
    // BL-032.77: threshold raised 2 → 6 (one cron firing's parallel Zone-1
    // count). Counter says 20, Inoreader observed 12 → drift = +8 (above
    // the raised threshold). Real over-counting / double-increment would
    // persist; one-off races resolve under daily debounce.
    redisIncr.mockResolvedValueOnce(2).mockResolvedValueOnce(20);

    await recordInoreaderEgress({
      env,
      category: 'live-radar',
      status: 200,
      zone1UsageHeader: 12,
    });

    // Behavior contract: warning-severity capture with the diagnostic payload.
    // The leading `env` arg is pinned positionally so a regression that
    // drops env (and falls back to a no-DSN no-op envelope call) fails CI
    // rather than passing silently via arrayContaining. The remaining
    // fields use `arrayContaining` so a future signature consolidation
    // (e.g. options-object) can land without breaking this test as long
    // as the diagnostic surfaces.
    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    const args = captureMessageMock.mock.calls[0];
    expect(args[0]).toBe(env);
    expect(args).toEqual(
      expect.arrayContaining([
        'inoreader.spend.drift',
        'warning',
        expect.objectContaining({ counter: 20, observed: 12, drift: 8 }),
      ])
    );
  });

  it('emits inoreader.spend.drift when observed - counter > 6 (we missed calls)', async () => {
    // Counter says 3, Inoreader observed 12 → drift = -9 (above the raised
    // threshold). Real uncounted egress path would surface this way.
    redisIncr.mockResolvedValueOnce(1).mockResolvedValueOnce(3);

    await recordInoreaderEgress({
      env,
      category: 'live-radar',
      status: 200,
      zone1UsageHeader: 12,
    });

    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    const args = captureMessageMock.mock.calls[0];
    expect(args[0]).toBe(env);
    expect(args).toEqual(expect.arrayContaining([expect.objectContaining({ drift: -9 })]));
  });

  it('does NOT emit drift when |drift| <= 6 (parallel-cron race tolerance)', async () => {
    // BL-032.77 fix: a cron firing's 6 parallel Zone-1 calls produce drift
    // of up to ±5 transiently due to Inoreader's eventual-consistency on
    // header reads. The 2026-05-28 production event had drift=3 — must NOT
    // alert at the new threshold.
    redisIncr.mockResolvedValueOnce(1).mockResolvedValueOnce(4);

    await recordInoreaderEgress({
      env,
      category: 'live-radar',
      status: 200,
      zone1UsageHeader: 1, // drift = +3, the actual 2026-05-28 production value
    });

    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it('does NOT emit drift at the exact threshold boundary (drift = +6)', async () => {
    redisIncr.mockResolvedValueOnce(1).mockResolvedValueOnce(10);

    await recordInoreaderEgress({
      env,
      category: 'live-radar',
      status: 200,
      zone1UsageHeader: 4, // drift = +6, exactly at threshold
    });

    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it('does NOT emit drift at the negative-boundary (drift = -6)', async () => {
    // Closeout-audit fix: the `±6` boundary needs explicit negative coverage.
    // `Math.abs(drift) <= 6` is symmetric; this pins the symmetry so a
    // future refactor that drops the `Math.abs` doesn't silently change
    // the negative-side semantics.
    redisIncr.mockResolvedValueOnce(1).mockResolvedValueOnce(4);

    await recordInoreaderEgress({
      env,
      category: 'live-radar',
      status: 200,
      zone1UsageHeader: 10, // drift = -6, exactly at threshold
    });

    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it('DOES emit drift at the first-alerting value (drift = +7)', async () => {
    // Closeout-audit fix: pins the first value that DOES alert above the
    // raised threshold. The original `< 6` vs `<= 6` semantic distinction
    // matters at the boundary; this catches it.
    redisIncr.mockResolvedValueOnce(1).mockResolvedValueOnce(10);

    await recordInoreaderEgress({
      env,
      category: 'live-radar',
      status: 200,
      zone1UsageHeader: 3, // drift = +7, just above threshold
    });

    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    const args = captureMessageMock.mock.calls[0];
    expect(args).toEqual(expect.arrayContaining([expect.objectContaining({ drift: 7 })]));
  });

  it('DOES emit drift at the first-alerting negative value (drift = -7)', async () => {
    redisIncr.mockResolvedValueOnce(1).mockResolvedValueOnce(3);

    await recordInoreaderEgress({
      env,
      category: 'live-radar',
      status: 200,
      zone1UsageHeader: 10, // drift = -7, just above threshold (negative side)
    });

    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    const args = captureMessageMock.mock.calls[0];
    expect(args).toEqual(expect.arrayContaining([expect.objectContaining({ drift: -7 })]));
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

// Audit fix S4: drift detection is daily-debounced so a persistent
// drift over the day produces ONE Sentry event, not 100+.
describe('recordInoreaderEgress: drift daily debounce (audit fix S4)', () => {
  it('SETs the drift-alerted flag with NX + EX before emitting captureMessage', async () => {
    redisIncr.mockResolvedValueOnce(1).mockResolvedValueOnce(20);

    await recordInoreaderEgress({
      env,
      category: 'live-radar',
      status: 200,
      zone1UsageHeader: 10, // drift = +10
    });

    // The flag SET is atomic NX+EX so a parallel isolate competing for
    // the same flag can't double-emit.
    expect(redisSet).toHaveBeenCalledWith(
      expect.stringMatching(/^mcp:inoreader:drift-alerted:\d{4}-\d{2}-\d{2}$/),
      '1',
      expect.objectContaining({ nx: true, ex: 25 * 60 * 60 })
    );
    expect(captureMessageMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT emit captureMessage when the flag is already set today (SET NX returns null)', async () => {
    redisSet.mockResolvedValue(null); // peer already SET the flag today
    redisIncr.mockResolvedValueOnce(1).mockResolvedValueOnce(50);

    await recordInoreaderEgress({
      env,
      category: 'live-radar',
      status: 200,
      zone1UsageHeader: 10, // drift = +40
    });

    // Counter and EXPIRE still fire — only the Sentry side is debounced.
    expect(redisIncr).toHaveBeenCalledTimes(2);
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it('fails open silently when the flag SET throws (no captureMessage, no rethrow)', async () => {
    redisSet.mockRejectedValue(new Error('upstash flap'));
    redisIncr.mockResolvedValueOnce(1).mockResolvedValueOnce(50);

    await expect(
      recordInoreaderEgress({
        env,
        category: 'live-radar',
        status: 200,
        zone1UsageHeader: 10,
      })
    ).resolves.toBeUndefined();

    // Better to lose one drift event than to fire 100× during an Upstash flap.
    expect(captureMessageMock).not.toHaveBeenCalled();
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
        // Audit fix S3: dedicated egressSource field, NOT the `tool` field.
        // Downstream Sentry queries filtering `tool = "search_radar"` stay
        // clean if a future contributor adds tool-name carriage on the
        // same event.
        egressSource: 'fetchAnnotatedItems',
      })
    );
    // Belt-and-suspenders: the `tool` field MUST NOT carry an egress
    // call-site value, even though the LogEvent type technically allows it.
    const call = safeLogMock.mock.calls.find(([arg]) => arg?.event === 'inoreader.egress');
    expect(call?.[0]?.tool).toBeUndefined();
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

describe('readInoreaderSpend (MGET — audit fix S2)', () => {
  it('returns 0 totals when Upstash creds are not bound', async () => {
    const result = await readInoreaderSpend({});

    expect(result.total).toBe(0);
    for (const cat of INOREADER_EGRESS_CATEGORIES) {
      expect(result.byCategory[cat]).toBe(0);
    }
  });

  it('uses a single MGET round-trip for total + all categories', async () => {
    // Returns: [total, ...categories in INOREADER_EGRESS_CATEGORIES order].
    redisMget.mockResolvedValue([42, 24, 12, 4, 8, 2]);

    const result = await readInoreaderSpend(env);

    expect(redisMget).toHaveBeenCalledTimes(1);
    // Per-category GETs must NOT be issued — the whole point of MGET.
    expect(redisGet).not.toHaveBeenCalled();

    expect(result.total).toBe(42);
    expect(result.byCategory).toEqual({
      'cron-radar': 24,
      'live-radar': 12,
      'http-radar-snapshot': 4,
      'oauth-refresh': 8,
      '401-retry': 2,
    });
  });

  it('passes the keys to MGET in [total, ...categories] order', async () => {
    redisMget.mockResolvedValue([0, 0, 0, 0, 0, 0]);

    await readInoreaderSpend(env);

    const args = redisMget.mock.calls[0];
    expect(args[0]).toBe(totalSpendKey());
    // Subsequent args mirror INOREADER_EGRESS_CATEGORIES order so the
    // destructure on the way out reconstructs the right byCategory map.
    INOREADER_EGRESS_CATEGORIES.forEach((cat, i) => {
      expect(args[i + 1]).toBe(categorySpendKey(cat));
    });
  });

  it('coerces string-typed counter values returned by Upstash', async () => {
    redisMget.mockResolvedValue(['99', '50', null, null, null, null]);

    const result = await readInoreaderSpend(env);

    expect(result.total).toBe(99);
    expect(result.byCategory['cron-radar']).toBe(50);
    // Missing counters default to 0 rather than NaN.
    expect(result.byCategory['live-radar']).toBe(0);
  });

  it('returns zeros when MGET throws', async () => {
    redisMget.mockRejectedValue(new Error('upstash unreachable'));

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
