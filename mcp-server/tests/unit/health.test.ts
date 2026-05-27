/**
 * Unit tests for the Phase 5 /health payload builder (post-BL-032.8 Phase B —
 * single MCP DB).
 *
 * Mocks `@upstash/redis` so we control the MCP DB liveness probe + the
 * Inoreader-status read deterministically. Pure-function tests over
 * `buildHealthPayload(env)` — no Worker boot, no live Inoreader.
 *
 * Tests branch the mock by key:
 *   - `mcp:health:probe`           → MCP probe key
 *   - `mcp:inoreader:last-status`  → cached Inoreader status (MCP DB)
 *   - `mcp:radar:cache:fyi`        → FYI radar cache (snapshot-age probe)
 *
 * The legacy `upstashInoreader` field was removed from the response in Phase B
 * along with the legacy Inoreader DB itself; these tests assert the simplified
 * shape and the corresponding simplified `ok` derivation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { redisGet, redisMget, redisSet, redisDel, MockRedis } = vi.hoisted(() => {
  const redisGet = vi.fn();
  // BL-032.75 Phase 0: readInoreaderSpend uses MGET (one round-trip) for
  // total + per-category counters. The Phase 0 audit-fix S2 swapped the
  // 1+N GETs for a single MGET; the mock follows.
  const redisMget = vi.fn().mockResolvedValue([0, 0, 0, 0, 0, 0]);
  // BL-032.75 T.X.2: probeMcp uses SET-then-DEL (write-then-cleanup) to
  // catch the read-only-token gap that a GET-only probe missed. Default
  // both to resolving OK so existing tests that don't simulate MCP-probe
  // failure stay unchanged — only the failure-path tests override.
  const redisSet = vi.fn().mockResolvedValue('OK');
  const redisDel = vi.fn().mockResolvedValue(1);
  class MockRedis {
    get = redisGet;
    mget = redisMget;
    set = redisSet;
    del = redisDel;
  }
  return { redisGet, redisMget, redisSet, redisDel, MockRedis };
});

vi.mock('@upstash/redis', () => ({ Redis: MockRedis }));

import { buildHealthPayload } from '../../src/observability/health';
import type { Env } from '../../src/worker';

const baseEnv: Env = {
  UPSTASH_MCP_REST_URL: 'https://mcp-db.upstash.io',
  UPSTASH_MCP_REST_TOKEN: 'test-mcp-standard',
};

beforeEach(() => {
  redisGet.mockReset();
  // Reset + re-establish the default-OK behavior for the probeMcp
  // SET/DEL mocks. Without this, a prior test's `mockRejectedValueOnce`
  // can leak into the next test's setup.
  redisSet.mockReset();
  redisSet.mockResolvedValue('OK');
  redisDel.mockReset();
  redisDel.mockResolvedValue(1);
});

describe('buildHealthPayload', () => {
  it('returns ok:true when MCP DB is reachable and inoreader is ok', async () => {
    redisGet.mockImplementation(async (key: string) => {
      if (key === 'mcp:health:probe') return null; // probe just needs to NOT throw
      if (key === 'mcp:inoreader:last-status') {
        return {
          status: 'ok',
          observedAt: '2026-05-04T18:00:00.000Z',
          source: 'cron',
          note: 'wire',
        };
      }
      return null;
    });

    const payload = await buildHealthPayload(baseEnv);

    expect(payload.ok).toBe(true);
    expect(payload.upstashMcp).toBe('ok');
    expect(payload.inoreader).toBe('ok');
    expect(payload.inoreaderObservedAt).toBe('2026-05-04T18:00:00.000Z');
    expect(payload.inoreaderObservedSource).toBe('cron');
    expect(payload.version).toMatch(/^0\.[0-9]+\.[0-9]+$/);
    expect(payload.phase).toContain('BL-032 Phase 5');
  });

  it('returns ok:false when MCP DB is degraded', async () => {
    // T.X.2 fix: probeMcp now uses SET-then-DEL, so MCP-DB failure is
    // simulated by rejecting the SET (not the GET). Phase B simplification:
    // the `but Inoreader DB is fine` qualifier was dropped from the test
    // name when the Inoreader DB was retired.
    redisSet.mockRejectedValue(new Error('mcp-db unreachable'));
    redisGet.mockImplementation(async (key: string) => {
      if (key === 'mcp:inoreader:last-status') {
        // Status read goes through MCP DB too → also throws → resolves to 'unknown'
        throw new Error('mcp-db unreachable');
      }
      return null;
    });

    const payload = await buildHealthPayload(baseEnv);

    expect(payload.ok).toBe(false);
    expect(payload.upstashMcp).toBe('degraded');
    expect(payload.inoreader).toBe('unknown');
    expect(payload.inoreaderObservedAt).toBeNull();
  });

  it('returns ok:false when Inoreader API is degraded but MCP DB is fine', async () => {
    redisGet.mockImplementation(async (key: string) => {
      if (key === 'mcp:health:probe') return null;
      if (key === 'mcp:inoreader:last-status') {
        return {
          status: 'degraded',
          observedAt: '2026-05-04T18:00:00.000Z',
          source: 'live-tool',
          note: 'fyi:inoreader-rate-limit',
        };
      }
      return null;
    });

    const payload = await buildHealthPayload(baseEnv);

    expect(payload.ok).toBe(false);
    expect(payload.upstashMcp).toBe('ok');
    expect(payload.inoreader).toBe('degraded');
    expect(payload.inoreaderObservedSource).toBe('live-tool');
  });

  it('returns ok:true when inoreader API is unknown but MCP DB is fine — unknown is not degraded', async () => {
    // inoreader: 'unknown' just means "no recent traffic" (TTL expired or
    // worker just cold-started). NOT a failure signal.
    redisGet.mockImplementation(async (key: string) => {
      if (key === 'mcp:health:probe') return null;
      if (key === 'mcp:inoreader:last-status') return null; // no entry
      return null;
    });

    const payload = await buildHealthPayload(baseEnv);

    expect(payload.ok).toBe(true);
    expect(payload.upstashMcp).toBe('ok');
    expect(payload.inoreader).toBe('unknown');
  });

  it('marks upstashMcp:degraded when MCP-DB creds are absent', async () => {
    redisGet.mockResolvedValue(null);

    const env: Env = {
      ...baseEnv,
      UPSTASH_MCP_REST_URL: undefined,
      UPSTASH_MCP_REST_TOKEN: undefined,
    };

    const payload = await buildHealthPayload(env);

    expect(payload.ok).toBe(false);
    expect(payload.upstashMcp).toBe('degraded');
    // The Inoreader-status read goes through MCP DB → returns 'unknown' on
    // missing creds (graceful skip in inoreader-status.ts).
    expect(payload.inoreader).toBe('unknown');
    // Redis client should NOT have been called when creds aren't bound.
    expect(redisGet).not.toHaveBeenCalled();
    expect(redisSet).not.toHaveBeenCalled();
    expect(redisDel).not.toHaveBeenCalled();
  });

  it('falls through gracefully when Inoreader-status entry is malformed', async () => {
    redisGet.mockImplementation(async (key: string) => {
      if (key === 'mcp:health:probe') return null;
      if (key === 'mcp:inoreader:last-status') return 'not valid json';
      return null;
    });

    const payload = await buildHealthPayload(baseEnv);

    // Malformed entry → status reads as 'unknown', not crash.
    expect(payload.inoreader).toBe('unknown');
    expect(payload.upstashMcp).toBe('ok');
    // ok depends on (upstashMcp === 'ok' && inoreader !== 'degraded'), so true here.
    expect(payload.ok).toBe(true);
  });

  it('reports gitSha from env when bound', async () => {
    redisGet.mockResolvedValue(null);

    const payload = await buildHealthPayload({ ...baseEnv, GIT_SHA: 'deadbeef1234' });

    expect(payload.gitSha).toBe('deadbeef1234');
  });

  it("defaults gitSha to 'unknown' when not bound", async () => {
    redisGet.mockResolvedValue(null);

    const payload = await buildHealthPayload(baseEnv);

    expect(payload.gitSha).toBe('unknown');
  });

  // Added 2026-05-19: the inoreader-status entry now persists without
  // TTL, and exposes both an observedSecondsAgo and an observedSource.
  // These tests pin the surface of the new fields.
  describe('inoreaderObservedSecondsAgo + inoreaderObservedSource (stale-while-OK)', () => {
    it('computes observedSecondsAgo from the entry observedAt timestamp', async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      redisGet.mockImplementation(async (key: string) => {
        if (key === 'mcp:health:probe') return null;
        if (key === 'inoreader:access_token') return 'token';
        if (key === 'mcp:inoreader:last-status') {
          return { status: 'ok', observedAt: twoHoursAgo, source: 'cron', note: 'wire' };
        }
        return null;
      });

      const payload = await buildHealthPayload(baseEnv);

      // ~7200 seconds; allow ±5s for wall-clock drift during the test.
      expect(payload.inoreaderObservedSecondsAgo).toBeGreaterThanOrEqual(7195);
      expect(payload.inoreaderObservedSecondsAgo).toBeLessThanOrEqual(7205);
      expect(payload.inoreaderObservedSource).toBe('cron');
    });

    it('surfaces source: "live-tool" when the observation came from a live MCP call', async () => {
      redisGet.mockImplementation(async (key: string) => {
        if (key === 'mcp:health:probe') return null;
        if (key === 'inoreader:access_token') return 'token';
        if (key === 'mcp:inoreader:last-status') {
          return {
            status: 'ok',
            observedAt: new Date().toISOString(),
            source: 'live-tool',
            note: 'wire',
          };
        }
        return null;
      });

      const payload = await buildHealthPayload(baseEnv);
      expect(payload.inoreaderObservedSource).toBe('live-tool');
    });

    it('returns observedSecondsAgo: null and observedSource: null when no entry exists', async () => {
      redisGet.mockImplementation(async (key: string) => {
        if (key === 'mcp:health:probe') return null;
        if (key === 'inoreader:access_token') return 'token';
        if (key === 'mcp:inoreader:last-status') return null;
        return null;
      });

      const payload = await buildHealthPayload(baseEnv);
      expect(payload.inoreader).toBe('unknown');
      expect(payload.inoreaderObservedAt).toBeNull();
      expect(payload.inoreaderObservedSecondsAgo).toBeNull();
      expect(payload.inoreaderObservedSource).toBeNull();
    });

    // Back-compat: entries written by the pre-2026-05-19 code path didn't
    // include the `source` field. Reads of those entries must not crash
    // and must surface `source: null` to the operator (rather than
    // pretending the source is known). The next successful refresh
    // upgrades the entry to the new shape.
    it('handles pre-2026-05-19 entries without a source field (source: null)', async () => {
      redisGet.mockImplementation(async (key: string) => {
        if (key === 'mcp:health:probe') return null;
        if (key === 'inoreader:access_token') return 'token';
        if (key === 'mcp:inoreader:last-status') {
          // Old entry shape — no `source` field.
          return { status: 'ok', observedAt: '2026-05-18T18:00:00.000Z', note: 'wire' };
        }
        return null;
      });

      const payload = await buildHealthPayload(baseEnv);
      expect(payload.inoreader).toBe('ok');
      expect(payload.inoreaderObservedAt).toBe('2026-05-18T18:00:00.000Z');
      expect(payload.inoreaderObservedSecondsAgo).toBeGreaterThan(0);
      expect(payload.inoreaderObservedSource).toBeNull();
    });
  });

  describe('radarSnapshotAgeSeconds (BL-032.5 Phase 4)', () => {
    it('reports null when the FYI radar cache key is missing', async () => {
      redisGet.mockImplementation(async (key: string) => {
        if (key === 'mcp:health:probe') return null;
        if (key === 'mcp:inoreader:last-status') return null;
        if (key === 'mcp:radar:cache:fyi') return null;
        return null;
      });

      const payload = await buildHealthPayload(baseEnv);
      expect(payload.radarSnapshotAgeSeconds).toBeNull();
    });

    it("reports age in seconds based on the cache entry's fetchedAt", async () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      redisGet.mockImplementation(async (key: string) => {
        if (key === 'mcp:health:probe') return null;
        if (key === 'mcp:inoreader:last-status') return null;
        if (key === 'mcp:radar:cache:fyi') {
          // upstash-cache-store Entry envelope shape — { storedAt, data }
          return { storedAt: Date.now(), data: { fetchedAt: tenMinutesAgo, items: [] } };
        }
        return null;
      });

      const payload = await buildHealthPayload(baseEnv);
      // ~600 seconds; allow ±5s for wall-clock drift during the test
      expect(payload.radarSnapshotAgeSeconds).toBeGreaterThanOrEqual(595);
      expect(payload.radarSnapshotAgeSeconds).toBeLessThanOrEqual(605);
    });

    it('falls back to storedAt when fetchedAt is missing on the cache value', async () => {
      const storedAtMs = Date.now() - 30 * 60 * 1000; // 30 minutes ago
      redisGet.mockImplementation(async (key: string) => {
        if (key === 'mcp:health:probe') return null;
        if (key === 'mcp:inoreader:last-status') return null;
        if (key === 'mcp:radar:cache:fyi') {
          return { storedAt: storedAtMs, data: { items: [] } }; // no fetchedAt
        }
        return null;
      });

      const payload = await buildHealthPayload(baseEnv);
      expect(payload.radarSnapshotAgeSeconds).toBeGreaterThanOrEqual(1795);
      expect(payload.radarSnapshotAgeSeconds).toBeLessThanOrEqual(1805);
    });

    it('returns null on Upstash read error (fail-open)', async () => {
      redisGet.mockImplementation(async (key: string) => {
        if (key === 'mcp:health:probe') return null;
        if (key === 'mcp:inoreader:last-status') return null;
        if (key === 'mcp:radar:cache:fyi') throw new Error('upstash unreachable');
        return null;
      });

      const payload = await buildHealthPayload(baseEnv);
      expect(payload.radarSnapshotAgeSeconds).toBeNull();
    });
  });

  // BL-032.75 Phase 0: /health surfaces the new categorized spend counter
  // alongside the existing day-counter. These tests pin the shape so a
  // dashboard / SLO consumer can rely on it.
  describe('inoreaderSpend (BL-032.75 Phase 0)', () => {
    it('reads total + per-category from the zone1-spend counters via MGET', async () => {
      redisGet.mockImplementation(async (key: string) => {
        if (key === 'mcp:health:probe') return null;
        if (key === 'inoreader:access_token') return 'token';
        if (key === 'mcp:inoreader:last-status') return null;
        if (key === 'mcp:radar:cache:fyi') return null;
        return null;
      });
      // MGET returns [total, cron-radar, live-radar, http-radar-snapshot,
      // oauth-refresh, 401-retry] — the order INOREADER_EGRESS_CATEGORIES
      // declares (load-bearing for the destructure in readInoreaderSpend).
      redisMget.mockResolvedValueOnce([18, 12, 4, 2, 3, 0]);

      const payload = await buildHealthPayload(baseEnv);

      expect(payload.inoreaderSpend.total).toBe(18);
      expect(payload.inoreaderSpend.byCategory).toEqual({
        'cron-radar': 12,
        'live-radar': 4,
        'http-radar-snapshot': 2,
        'oauth-refresh': 3,
        '401-retry': 0,
      });
    });

    it('returns zeros when no spend has been recorded today', async () => {
      redisGet.mockImplementation(async (key: string) => {
        if (key === 'mcp:health:probe') return null;
        if (key === 'inoreader:access_token') return 'token';
        return null;
      });
      // All spend keys missing → MGET returns nulls.
      redisMget.mockResolvedValueOnce([null, null, null, null, null, null]);

      const payload = await buildHealthPayload(baseEnv);

      expect(payload.inoreaderSpend.total).toBe(0);
      expect(payload.inoreaderSpend.byCategory).toEqual({
        'cron-radar': 0,
        'live-radar': 0,
        'http-radar-snapshot': 0,
        'oauth-refresh': 0,
        '401-retry': 0,
      });
    });

    it('returns zeros when MCP DB is unreachable rather than failing /health', async () => {
      const env = {
        ...baseEnv,
        UPSTASH_MCP_REST_URL: undefined,
        UPSTASH_MCP_REST_TOKEN: undefined,
      };

      const payload = await buildHealthPayload(env);

      expect(payload.inoreaderSpend.total).toBe(0);
      expect(payload.inoreaderSpend.byCategory['cron-radar']).toBe(0);
    });
  });

  // BL-032.75 T.X.2 — probeMcp uses SET-then-DEL so write-permission gaps
  // surface in /health instead of being discovered only when the next /mcp
  // call fails inside the rate-limiter. The earlier GET-only probe missed
  // the case where the token had read perms but no write perms (read-only
  // REST token).
  describe('probeMcp — SET-then-DEL write probe (T.X.2)', () => {
    it("returns upstashMcp: 'ok' when SET succeeds AND DEL succeeds", async () => {
      // Defaults already resolve OK — this is the happy path.
      const payload = await buildHealthPayload(baseEnv);
      expect(payload.upstashMcp).toBe('ok');
      // Confirm the probe actually wrote (and cleaned up).
      expect(redisSet).toHaveBeenCalled();
      expect(redisDel).toHaveBeenCalled();
    });

    it("returns upstashMcp: 'ok' when SET succeeds but DEL throws (write proven; TTL handles cleanup)", async () => {
      // The documented semantic: WRITE permission is proven the moment
      // SET resolves. A DEL throw means cleanup is deferred to the 60s
      // TTL but the substrate is healthy.
      redisDel.mockRejectedValue(new Error('upstash flap during cleanup'));
      const payload = await buildHealthPayload(baseEnv);
      expect(payload.upstashMcp).toBe('ok');
    });

    it("returns upstashMcp: 'degraded' when SET throws (read-only-token shape)", async () => {
      // This is the T.X.2 gap the new probe closes: a read-only REST
      // token would pass the old GET probe but fail this SET.
      redisSet.mockRejectedValue(
        new Error('NOPERM: this user has no permissions to run the eval command')
      );
      const payload = await buildHealthPayload(baseEnv);
      expect(payload.upstashMcp).toBe('degraded');
    });

    it('two concurrent probes both return ok (no race; user-observable safety)', async () => {
      // Reframed from "unique key per call" — the user-observable
      // property is that concurrent operators + uptime monitors don't
      // break each other. Two simultaneous /health requests must both
      // resolve cleanly even when their SET/DEL operations interleave.
      const [a, b] = await Promise.all([buildHealthPayload(baseEnv), buildHealthPayload(baseEnv)]);
      expect(a.upstashMcp).toBe('ok');
      expect(b.upstashMcp).toBe('ok');
    });
  });
});
