/**
 * Unit tests for the Phase 5 /health payload builder.
 *
 * Mocks `@upstash/redis` so we control the Inoreader-status read +
 * the redis liveness probe deterministically. Pure-function tests over
 * `buildHealthPayload(env)` — no Worker boot, no live Inoreader.
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
  UPSTASH_REDIS_REST_URL: 'https://test.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'test-mcp-worker-token',
};

beforeEach(() => {
  redisGet.mockReset();
});

describe('buildHealthPayload', () => {
  it('returns ok:true when redis is reachable and inoreader is ok', async () => {
    redisGet.mockImplementation(async (key: string) => {
      if (key === 'mcp:health:probe') return null; // probe just needs to NOT throw
      if (key === 'mcp:inoreader:last-status') {
        return { status: 'ok', observedAt: '2026-05-04T18:00:00.000Z', note: 'wire' };
      }
      return null;
    });

    const payload = await buildHealthPayload(baseEnv);

    expect(payload.ok).toBe(true);
    expect(payload.redis).toBe('ok');
    expect(payload.inoreader).toBe('ok');
    expect(payload.inoreaderObservedAt).toBe('2026-05-04T18:00:00.000Z');
    expect(payload.version).toMatch(/^0\.[0-9]+\.[0-9]+$/);
    expect(payload.phase).toContain('BL-032 Phase 5');
  });

  it('returns ok:false when redis is degraded', async () => {
    redisGet.mockRejectedValue(new Error('upstash unreachable'));

    const payload = await buildHealthPayload(baseEnv);

    expect(payload.ok).toBe(false);
    expect(payload.redis).toBe('degraded');
    expect(payload.inoreader).toBe('unknown');
    expect(payload.inoreaderObservedAt).toBeNull();
  });

  it('returns ok:false when inoreader is degraded but redis is fine', async () => {
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
    expect(payload.redis).toBe('ok');
    expect(payload.inoreader).toBe('degraded');
  });

  it('returns ok:true when inoreader is unknown but redis is fine — unknown is not degraded', async () => {
    // inoreader: 'unknown' just means "no recent traffic" (TTL expired or
    // worker just cold-started). NOT a failure signal.
    redisGet.mockImplementation(async (key: string) => {
      if (key === 'mcp:health:probe') return null;
      if (key === 'mcp:inoreader:last-status') return null; // no entry
      return null;
    });

    const payload = await buildHealthPayload(baseEnv);

    expect(payload.ok).toBe(true);
    expect(payload.redis).toBe('ok');
    expect(payload.inoreader).toBe('unknown');
  });

  it('returns redis:degraded when Upstash creds are absent (graceful skip)', async () => {
    const env: Env = {
      ...baseEnv,
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined,
    };

    const payload = await buildHealthPayload(env);

    expect(payload.ok).toBe(false);
    expect(payload.redis).toBe('degraded');
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
    expect(payload.redis).toBe('ok');
    // ok depends only on (redis === 'ok' && inoreader !== 'degraded'), so true here.
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
