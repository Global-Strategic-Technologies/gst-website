/**
 * Unit tests for inoreader-token-store (BL-032.8 Phase 1).
 *
 * Phase 1 surface is just `readAccessToken` — Upstash read with env
 * fallback. Phase 2 adds the write methods (`writeAccessToken`,
 * `writeRefreshToken`). These tests pin the Phase 1 contract so the
 * Phase 2 additions don't accidentally regress the read path.
 *
 * The pre-refactor `inoreader-worker.test.ts` covered this behavior
 * inline as part of `resolveConfig` tests; these are the dedicated unit
 * tests for the now-extracted module.
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

import { readAccessToken, KV_ACCESS_TOKEN_KEY } from '../../../src/lib/inoreader-token-store';
import type { Env } from '../../../src/worker';

const inoreaderDbBoundEnv: Env = {
  UPSTASH_INOREADER_REST_URL: 'https://inoreader-db.upstash.io',
  UPSTASH_INOREADER_REST_TOKEN: 'readonly-token',
  INOREADER_ACCESS_TOKEN: 'env-fallback-token',
};

beforeEach(() => {
  redisGet.mockReset();
});

describe('readAccessToken', () => {
  it('reads from the inoreader:access_token key in the Inoreader DB', async () => {
    redisGet.mockResolvedValue('upstash-token');

    const token = await readAccessToken(inoreaderDbBoundEnv);

    expect(token).toBe('upstash-token');
    expect(redisGet).toHaveBeenCalledTimes(1);
    expect(redisGet).toHaveBeenCalledWith(KV_ACCESS_TOKEN_KEY);
    // Pin the key name — `inoreader:access_token` is the shared website/Worker
    // contract. Changing this constant requires a coordinated migration; the
    // assertion exists so a careless rename trips CI loudly.
    expect(KV_ACCESS_TOKEN_KEY).toBe('inoreader:access_token');
  });

  it('falls back to INOREADER_ACCESS_TOKEN env var when Upstash returns null', async () => {
    redisGet.mockResolvedValue(null);

    const token = await readAccessToken(inoreaderDbBoundEnv);

    expect(token).toBe('env-fallback-token');
  });

  it('falls back to env var when Upstash throws (network blip)', async () => {
    redisGet.mockRejectedValue(new Error('upstash unreachable'));

    const token = await readAccessToken(inoreaderDbBoundEnv);

    expect(token).toBe('env-fallback-token');
  });

  it('skips Upstash entirely when Inoreader DB creds are not bound', async () => {
    const noUpstashEnv: Env = {
      INOREADER_ACCESS_TOKEN: 'env-only-token',
      // No UPSTASH_INOREADER_* bindings.
    };

    const token = await readAccessToken(noUpstashEnv);

    expect(token).toBe('env-only-token');
    expect(redisGet).not.toHaveBeenCalled();
  });

  it('returns null when both Upstash and env fallback are empty', async () => {
    redisGet.mockResolvedValue(null);

    const token = await readAccessToken({
      UPSTASH_INOREADER_REST_URL: 'https://inoreader-db.upstash.io',
      UPSTASH_INOREADER_REST_TOKEN: 'readonly-token',
      // INOREADER_ACCESS_TOKEN deliberately absent.
    });

    expect(token).toBeNull();
  });

  it('prefers the Upstash value over the env fallback when both are set', async () => {
    redisGet.mockResolvedValue('fresh-upstash-token');

    const token = await readAccessToken(inoreaderDbBoundEnv);

    // Upstash wins — env var is the seed/fallback, not the source of truth.
    expect(token).toBe('fresh-upstash-token');
  });
});
