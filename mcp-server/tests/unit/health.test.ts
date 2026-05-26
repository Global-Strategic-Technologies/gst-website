/**
 * Unit tests for the Phase 5 /health payload builder (Path 2 dual-DB).
 *
 * Mocks `@upstash/redis` so we control both Upstash subsystems' liveness
 * probes + the Inoreader-status read deterministically. Pure-function
 * tests over `buildHealthPayload(env)` — no Worker boot, no live Inoreader.
 *
 * The shared `MockRedis` collapses both `createMcpClient(env)` and
 * `createInoreaderClient(env)` constructions onto the same `redisGet` spy.
 * Tests that need to make one subsystem fail while the other passes use
 * key-based `mockImplementation` branching:
 *   - `mcp:health:probe`         → MCP probe key
 *   - `inoreader:access_token`   → Inoreader probe key
 *   - `mcp:inoreader:last-status`→ cached Inoreader status (MCP DB)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { redisGet, redisMget, MockRedis } = vi.hoisted(() => {
  const redisGet = vi.fn();
  // BL-032.75 Phase 0: readInoreaderSpend uses MGET (one round-trip) for
  // total + per-category counters. The Phase 0 audit-fix S2 swapped the
  // 1+N GETs for a single MGET; the mock follows.
  const redisMget = vi.fn().mockResolvedValue([0, 0, 0, 0, 0, 0]);
  class MockRedis {
    get = redisGet;
    mget = redisMget;
  }
  return { redisGet, redisMget, MockRedis };
});

vi.mock('@upstash/redis', () => ({ Redis: MockRedis }));

import { buildHealthPayload } from '../../src/observability/health';
import type { Env } from '../../src/worker';

const baseEnv: Env = {
  UPSTASH_INOREADER_REST_URL: 'https://inoreader-db.upstash.io',
  UPSTASH_INOREADER_REST_TOKEN: 'test-inoreader-readonly',
  UPSTASH_MCP_REST_URL: 'https://mcp-db.upstash.io',
  UPSTASH_MCP_REST_TOKEN: 'test-mcp-standard',
};

beforeEach(() => {
  redisGet.mockReset();
});

describe('buildHealthPayload', () => {
  it('returns ok:true when both Upstash DBs are reachable and inoreader is ok', async () => {
    redisGet.mockImplementation(async (key: string) => {
      if (key === 'mcp:health:probe') return null; // probe just needs to NOT throw
      if (key === 'inoreader:access_token') return 'redacted-token-not-leaked'; // value discarded
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
    expect(payload.upstashInoreader).toBe('ok');
    expect(payload.inoreader).toBe('ok');
    expect(payload.inoreaderObservedAt).toBe('2026-05-04T18:00:00.000Z');
    expect(payload.inoreaderObservedSource).toBe('cron');
    expect(payload.version).toMatch(/^0\.[0-9]+\.[0-9]+$/);
    expect(payload.phase).toContain('BL-032 Phase 5');
  });

  it('returns ok:false when MCP DB is degraded but Inoreader DB is fine', async () => {
    redisGet.mockImplementation(async (key: string) => {
      if (key === 'mcp:health:probe') throw new Error('mcp-db unreachable');
      if (key === 'inoreader:access_token') return 'token-value';
      if (key === 'mcp:inoreader:last-status') {
        // Status read goes through MCP DB too → also throws → resolves to 'unknown'
        throw new Error('mcp-db unreachable');
      }
      return null;
    });

    const payload = await buildHealthPayload(baseEnv);

    expect(payload.ok).toBe(false);
    expect(payload.upstashMcp).toBe('degraded');
    expect(payload.upstashInoreader).toBe('ok');
    expect(payload.inoreader).toBe('unknown');
    expect(payload.inoreaderObservedAt).toBeNull();
  });

  it('returns ok:false when Inoreader DB is degraded but MCP DB is fine', async () => {
    redisGet.mockImplementation(async (key: string) => {
      if (key === 'mcp:health:probe') return null;
      if (key === 'inoreader:access_token') throw new Error('inoreader-db unreachable');
      if (key === 'mcp:inoreader:last-status') return null; // MCP DB still works for status read
      return null;
    });

    const payload = await buildHealthPayload(baseEnv);

    expect(payload.ok).toBe(false);
    expect(payload.upstashMcp).toBe('ok');
    expect(payload.upstashInoreader).toBe('degraded');
    expect(payload.inoreader).toBe('unknown');
  });

  it('returns ok:false when BOTH Upstash DBs are degraded', async () => {
    redisGet.mockRejectedValue(new Error('all upstash unreachable'));

    const payload = await buildHealthPayload(baseEnv);

    expect(payload.ok).toBe(false);
    expect(payload.upstashMcp).toBe('degraded');
    expect(payload.upstashInoreader).toBe('degraded');
    expect(payload.inoreader).toBe('unknown');
  });

  it('returns ok:false when Inoreader API is degraded but both DBs are fine', async () => {
    redisGet.mockImplementation(async (key: string) => {
      if (key === 'mcp:health:probe') return null;
      if (key === 'inoreader:access_token') return 'token-value';
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
    expect(payload.upstashInoreader).toBe('ok');
    expect(payload.inoreader).toBe('degraded');
    expect(payload.inoreaderObservedSource).toBe('live-tool');
  });

  it('returns ok:true when inoreader API is unknown but both DBs are fine — unknown is not degraded', async () => {
    // inoreader: 'unknown' just means "no recent traffic" (TTL expired or
    // worker just cold-started). NOT a failure signal.
    redisGet.mockImplementation(async (key: string) => {
      if (key === 'mcp:health:probe') return null;
      if (key === 'inoreader:access_token') return 'token-value';
      if (key === 'mcp:inoreader:last-status') return null; // no entry
      return null;
    });

    const payload = await buildHealthPayload(baseEnv);

    expect(payload.ok).toBe(true);
    expect(payload.upstashMcp).toBe('ok');
    expect(payload.upstashInoreader).toBe('ok');
    expect(payload.inoreader).toBe('unknown');
  });

  it('marks upstashMcp:degraded when only MCP-DB creds are absent', async () => {
    redisGet.mockResolvedValue(null);

    const env: Env = {
      ...baseEnv,
      UPSTASH_MCP_REST_URL: undefined,
      UPSTASH_MCP_REST_TOKEN: undefined,
    };

    const payload = await buildHealthPayload(env);

    expect(payload.ok).toBe(false);
    expect(payload.upstashMcp).toBe('degraded');
    expect(payload.upstashInoreader).toBe('ok');
    // The Inoreader-status read goes through MCP DB → returns 'unknown' on
    // missing creds (graceful skip in inoreader-status.ts).
    expect(payload.inoreader).toBe('unknown');
  });

  it('marks upstashInoreader:degraded when only Inoreader-DB creds are absent', async () => {
    redisGet.mockResolvedValue(null);

    const env: Env = {
      ...baseEnv,
      UPSTASH_INOREADER_REST_URL: undefined,
      UPSTASH_INOREADER_REST_TOKEN: undefined,
    };

    const payload = await buildHealthPayload(env);

    expect(payload.ok).toBe(false);
    expect(payload.upstashMcp).toBe('ok');
    expect(payload.upstashInoreader).toBe('degraded');
  });

  it('marks both degraded when ALL Upstash creds are absent (graceful skip both sides)', async () => {
    const env: Env = {
      ...baseEnv,
      UPSTASH_INOREADER_REST_URL: undefined,
      UPSTASH_INOREADER_REST_TOKEN: undefined,
      UPSTASH_MCP_REST_URL: undefined,
      UPSTASH_MCP_REST_TOKEN: undefined,
    };

    const payload = await buildHealthPayload(env);

    expect(payload.ok).toBe(false);
    expect(payload.upstashMcp).toBe('degraded');
    expect(payload.upstashInoreader).toBe('degraded');
    expect(payload.inoreader).toBe('unknown');
    // Redis client should NOT have been called when creds aren't bound.
    expect(redisGet).not.toHaveBeenCalled();
  });

  it('falls through gracefully when Inoreader-status entry is malformed', async () => {
    redisGet.mockImplementation(async (key: string) => {
      if (key === 'mcp:health:probe') return null;
      if (key === 'inoreader:access_token') return 'token-value';
      if (key === 'mcp:inoreader:last-status') return 'not valid json';
      return null;
    });

    const payload = await buildHealthPayload(baseEnv);

    // Malformed entry → status reads as 'unknown', not crash.
    expect(payload.inoreader).toBe('unknown');
    expect(payload.upstashMcp).toBe('ok');
    expect(payload.upstashInoreader).toBe('ok');
    // ok depends on (upstashMcp === 'ok' && upstashInoreader === 'ok' && inoreader !== 'degraded'), so true here.
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
        if (key === 'inoreader:access_token') return 'token';
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
        if (key === 'inoreader:access_token') return 'token';
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
        if (key === 'inoreader:access_token') return 'token';
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
        if (key === 'inoreader:access_token') return 'token';
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
});
