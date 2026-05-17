/**
 * Unit tests for the single-flight-lock primitive (BL-032.8 Phase 1).
 *
 * The lock is the load-bearing piece that obsoletes BL-040 — without it,
 * concurrent `inoreader-oauth.ts` callers would each spawn a separate
 * `/oauth2/token` POST and the BL-040 known issue would persist. These
 * tests pin the contract surface so a refactor that drops mutual
 * exclusion (e.g. switches `acquire` to idempotent SET) fails CI.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { redisSet, redisGet, redisDel, MockRedis } = vi.hoisted(() => {
  const redisSet = vi.fn();
  const redisGet = vi.fn();
  const redisDel = vi.fn();
  class MockRedis {
    set = redisSet;
    get = redisGet;
    del = redisDel;
  }
  return { redisSet, redisGet, redisDel, MockRedis };
});

vi.mock('@upstash/redis', () => ({ Redis: MockRedis }));

import { acquire, pollForChange, release } from '../../../src/lib/single-flight-lock';
import type { Env } from '../../../src/worker';

const env: Env = {
  UPSTASH_MCP_REST_URL: 'https://mcp.upstash.io',
  UPSTASH_MCP_REST_TOKEN: 'token',
};

beforeEach(() => {
  redisSet.mockReset();
  redisGet.mockReset();
  redisDel.mockReset();
});

describe('single-flight-lock: acquire', () => {
  it('returns true when SET NX EX returns "OK" (lock acquired)', async () => {
    redisSet.mockResolvedValue('OK');

    const acquired = await acquire(env, 'mcp:test:lock', 10);

    expect(acquired).toBe(true);
    expect(redisSet).toHaveBeenCalledTimes(1);
    // Pins the mutual-exclusion contract: nx + ex MUST both be set.
    // A refactor that drops nx would silently break single-flight semantics.
    expect(redisSet).toHaveBeenCalledWith(
      'mcp:test:lock',
      expect.any(String),
      expect.objectContaining({ nx: true, ex: 10 })
    );
  });

  it('returns false when SET NX returns null (peer holds the lock)', async () => {
    redisSet.mockResolvedValue(null);

    const acquired = await acquire(env, 'mcp:test:lock', 10);

    expect(acquired).toBe(false);
  });

  it('uses the provided value as lock payload when supplied', async () => {
    redisSet.mockResolvedValue('OK');

    await acquire(env, 'mcp:test:lock', 10, 'invocation-abc');

    expect(redisSet).toHaveBeenCalledWith(
      'mcp:test:lock',
      'invocation-abc',
      expect.objectContaining({ nx: true, ex: 10 })
    );
  });

  it('fails open (returns true) when Upstash creds are not bound', async () => {
    // Fail-open semantics — without this, an Upstash regional outage would
    // cascade into total OAuth-refresh failure. Caller proceeds; if the
    // backend is truly down the next step (e.g. /oauth2/token POST) will
    // surface its own failure.
    const acquired = await acquire({} as Env, 'mcp:test:lock', 10);
    expect(acquired).toBe(true);
    expect(redisSet).not.toHaveBeenCalled();
  });

  it('fails open when Upstash throws (network error during acquire)', async () => {
    redisSet.mockRejectedValue(new Error('upstash unreachable'));

    const acquired = await acquire(env, 'mcp:test:lock', 10);

    expect(acquired).toBe(true);
  });
});

describe('single-flight-lock: pollForChange', () => {
  it('returns the new value when the key changes within the timeout', async () => {
    // Snapshot is "stale-token"; second read returns "fresh-token" → resolves.
    redisGet.mockResolvedValueOnce('stale-token').mockResolvedValueOnce('fresh-token');

    const result = await pollForChange<string>(env, 'mcp:inoreader:access_token', {
      timeoutMs: 1_000,
      intervalMs: 10,
    });

    expect(result).toBe('fresh-token');
    expect(redisGet).toHaveBeenCalledTimes(2);
  });

  it('returns null on timeout when the key never changes', async () => {
    redisGet.mockResolvedValue('stale-token');

    const result = await pollForChange<string>(env, 'mcp:inoreader:access_token', {
      timeoutMs: 50,
      intervalMs: 10,
    });

    expect(result).toBeNull();
    // Should have polled multiple times within the 50ms window.
    expect(redisGet.mock.calls.length).toBeGreaterThan(1);
  });

  it('returns null when Upstash creds are not bound (cannot poll)', async () => {
    const result = await pollForChange<string>({} as Env, 'mcp:inoreader:access_token', {
      timeoutMs: 100,
      intervalMs: 10,
    });

    expect(result).toBeNull();
    expect(redisGet).not.toHaveBeenCalled();
  });

  it('detects change from null → value (initial-state edge case)', async () => {
    // Lock-holder cleared the access token then wrote a new one; loser
    // arrives mid-clear and sees null first.
    redisGet.mockResolvedValueOnce(null).mockResolvedValueOnce('new-token');

    const result = await pollForChange<string>(env, 'mcp:inoreader:access_token', {
      timeoutMs: 1_000,
      intervalMs: 10,
    });

    expect(result).toBe('new-token');
  });

  it('survives transient Upstash errors mid-poll without bailing', async () => {
    // Snapshot succeeds, second read throws, third read returns the change.
    // A network blip during poll shouldn't convert recoverable wait into
    // a lock-timeout-equivalent failure.
    redisGet
      .mockResolvedValueOnce('stale')
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce('fresh');

    const result = await pollForChange<string>(env, 'mcp:inoreader:access_token', {
      timeoutMs: 1_000,
      intervalMs: 10,
    });

    expect(result).toBe('fresh');
  });
});

describe('single-flight-lock: release', () => {
  it('DELs the key', async () => {
    redisDel.mockResolvedValue(1);

    await release(env, 'mcp:test:lock');

    expect(redisDel).toHaveBeenCalledTimes(1);
    expect(redisDel).toHaveBeenCalledWith('mcp:test:lock');
  });

  it('swallows Upstash errors silently (TTL is the safety net)', async () => {
    redisDel.mockRejectedValue(new Error('upstash unreachable'));

    // Must not throw — substrate stays consistent because the lock's
    // EX TTL will clean it up regardless.
    await expect(release(env, 'mcp:test:lock')).resolves.toBeUndefined();
  });

  it('is a no-op when Upstash creds are not bound', async () => {
    await release({} as Env, 'mcp:test:lock');
    expect(redisDel).not.toHaveBeenCalled();
  });
});
