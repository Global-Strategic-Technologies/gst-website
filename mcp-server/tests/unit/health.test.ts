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

const { redisGet, MockRedis } = vi.hoisted(() => {
  const redisGet = vi.fn();
  class MockRedis {
    get = redisGet;
  }
  return { redisGet, MockRedis };
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
});

describe('buildHealthPayload', () => {
  it('returns ok:true when MCP DB is reachable and inoreader is ok', async () => {
    redisGet.mockImplementation(async (key: string) => {
      if (key === 'mcp:health:probe') return null; // probe just needs to NOT throw
      if (key === 'mcp:inoreader:last-status') {
        return { status: 'ok', observedAt: '2026-05-04T18:00:00.000Z', note: 'wire' };
      }
      return null;
    });

    const payload = await buildHealthPayload(baseEnv);

    expect(payload.ok).toBe(true);
    expect(payload.upstashMcp).toBe('ok');
    expect(payload.inoreader).toBe('ok');
    expect(payload.inoreaderObservedAt).toBe('2026-05-04T18:00:00.000Z');
    expect(payload.version).toMatch(/^0\.[0-9]+\.[0-9]+$/);
    expect(payload.phase).toContain('BL-032 Phase 5');
    // Phase B: `upstashInoreader` field is intentionally absent from the
    // response shape. Pin the absence so future drift surfaces here.
    expect((payload as Record<string, unknown>).upstashInoreader).toBeUndefined();
  });

  it('returns ok:false when MCP DB is degraded', async () => {
    redisGet.mockImplementation(async (key: string) => {
      if (key === 'mcp:health:probe') throw new Error('mcp-db unreachable');
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
          note: 'fyi:inoreader-rate-limit',
        };
      }
      return null;
    });

    const payload = await buildHealthPayload(baseEnv);

    expect(payload.ok).toBe(false);
    expect(payload.upstashMcp).toBe('ok');
    expect(payload.inoreader).toBe('degraded');
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
});
