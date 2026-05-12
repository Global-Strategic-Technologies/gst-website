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
        return { status: 'ok', observedAt: '2026-05-04T18:00:00.000Z', note: 'wire' };
      }
      return null;
    });

    const payload = await buildHealthPayload(baseEnv);

    expect(payload.ok).toBe(true);
    expect(payload.upstashMcp).toBe('ok');
    expect(payload.upstashInoreader).toBe('ok');
    expect(payload.inoreader).toBe('ok');
    expect(payload.inoreaderObservedAt).toBe('2026-05-04T18:00:00.000Z');
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
});
