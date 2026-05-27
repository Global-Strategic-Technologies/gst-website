/**
 * Unit tests for inoreader-token-store (post-BL-032.8 Phase B).
 *
 * Tests cover the single-DB priority order (MCP DB → env-var fallback),
 * fail-toward-degraded behavior, and the buffer/TTL semantics that prevent
 * stale-token 401s.
 *
 * **Why no Inoreader-DB tests**: Phase B retired the legacy `inoreader:*`
 * namespace alongside the website's direct Inoreader client. The Worker is
 * now the sole writer AND sole reader of token state, all under the
 * `mcp:inoreader:*` namespace in the MCP DB. The dual-read fallback was
 * dead code post-Phase-A; this test file mirrors that simplification.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mcpRedisGet, mcpRedisSet, MockRedis } = vi.hoisted(() => {
  const mcpRedisGet = vi.fn();
  const mcpRedisSet = vi.fn();
  class MockRedis {
    get = mcpRedisGet;
    set = (...args: unknown[]) => mcpRedisSet(...args);
  }
  return { mcpRedisGet, mcpRedisSet, MockRedis };
});

vi.mock('@upstash/redis', () => ({ Redis: MockRedis }));

import {
  readAccessToken,
  readRefreshToken,
  writeAccessToken,
  writeRefreshToken,
  KV_MCP_ACCESS_TOKEN_KEY,
  KV_MCP_REFRESH_TOKEN_KEY,
} from '../../../src/lib/inoreader-token-store';
import type { Env } from '../../../src/worker';

const env: Env = {
  UPSTASH_MCP_REST_URL: 'https://mcp-db.upstash.io',
  UPSTASH_MCP_REST_TOKEN: 'mcp-rw',
  INOREADER_ACCESS_TOKEN: 'env-fallback-access',
  INOREADER_REFRESH_TOKEN: 'env-fallback-refresh',
};

beforeEach(() => {
  mcpRedisGet.mockReset();
  mcpRedisSet.mockReset();
});

// ---------------------------------------------------------------------------
// Key-name pinning (tests trip CI if anyone carelessly renames these)
// ---------------------------------------------------------------------------

describe('token-store key names (load-bearing cross-system contracts)', () => {
  it('pins MCP DB key names to their canonical values', () => {
    expect(KV_MCP_ACCESS_TOKEN_KEY).toBe('mcp:inoreader:access_token');
    expect(KV_MCP_REFRESH_TOKEN_KEY).toBe('mcp:inoreader:refresh_token');
  });
});

// ---------------------------------------------------------------------------
// readAccessToken — priority: MCP DB → env var
// ---------------------------------------------------------------------------

describe('readAccessToken', () => {
  it('returns the MCP DB value when present (Worker-owned source of truth)', async () => {
    mcpRedisGet.mockResolvedValue('mcp-token');

    const token = await readAccessToken(env);

    expect(token).toBe('mcp-token');
    expect(mcpRedisGet).toHaveBeenCalledWith(KV_MCP_ACCESS_TOKEN_KEY);
  });

  it('falls back to env var when MCP DB returns null', async () => {
    mcpRedisGet.mockResolvedValue(null);

    const token = await readAccessToken(env);

    expect(token).toBe('env-fallback-access');
  });

  it('falls back to env var when MCP DB throws (regional blip)', async () => {
    mcpRedisGet.mockRejectedValue(new Error('mcp upstash unreachable'));

    const token = await readAccessToken(env);

    expect(token).toBe('env-fallback-access');
  });

  it('returns null when both MCP DB and env are empty', async () => {
    mcpRedisGet.mockResolvedValue(null);

    const token = await readAccessToken({
      ...env,
      INOREADER_ACCESS_TOKEN: undefined,
    });

    expect(token).toBeNull();
  });

  it('skips Upstash entirely when MCP DB creds are not bound', async () => {
    const token = await readAccessToken({ INOREADER_ACCESS_TOKEN: 'env-only' });

    expect(token).toBe('env-only');
    expect(mcpRedisGet).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// readRefreshToken — same priority order as readAccessToken
// ---------------------------------------------------------------------------

describe('readRefreshToken', () => {
  it('returns the MCP DB value when present', async () => {
    mcpRedisGet.mockResolvedValue('mcp-refresh');

    const token = await readRefreshToken(env);

    expect(token).toBe('mcp-refresh');
    expect(mcpRedisGet).toHaveBeenCalledWith(KV_MCP_REFRESH_TOKEN_KEY);
  });

  it('falls back to env var when MCP DB returns null', async () => {
    mcpRedisGet.mockResolvedValue(null);

    const token = await readRefreshToken(env);

    expect(token).toBe('env-fallback-refresh');
  });

  it('returns null when both MCP DB and env are empty', async () => {
    mcpRedisGet.mockResolvedValue(null);

    const token = await readRefreshToken({
      ...env,
      INOREADER_REFRESH_TOKEN: undefined,
    });

    expect(token).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// writeAccessToken — MCP DB only, TTL = expires_in - 60
// ---------------------------------------------------------------------------

describe('writeAccessToken', () => {
  it('writes to mcp:inoreader:access_token with TTL = expires_in - 60', async () => {
    mcpRedisSet.mockResolvedValue('OK');

    const ok = await writeAccessToken(env, 'new-token', 3600);

    expect(ok).toBe(true);
    expect(mcpRedisSet).toHaveBeenCalledTimes(1);
    expect(mcpRedisSet).toHaveBeenCalledWith(
      KV_MCP_ACCESS_TOKEN_KEY,
      'new-token',
      // 3600 - 60 = 3540
      expect.objectContaining({ ex: 3540 })
    );
  });

  it('uses 3540s TTL when expires_in is undefined (defensive fallback)', async () => {
    mcpRedisSet.mockResolvedValue('OK');

    // Phase 0 Q0.1 confirmed expires_in is always present; this branch is
    // belt-and-suspenders for API drift / malformed responses.
    await writeAccessToken(env, 'token', undefined);

    expect(mcpRedisSet).toHaveBeenCalledWith(
      KV_MCP_ACCESS_TOKEN_KEY,
      'token',
      // 3600 fallback - 60 buffer = 3540
      expect.objectContaining({ ex: 3540 })
    );
  });

  it('floors TTL at 60s if expires_in is suspiciously small', async () => {
    mcpRedisSet.mockResolvedValue('OK');

    // expires_in = 30 → 30 - 60 = -30 → must clamp to 60s minimum so we
    // don't accidentally write a key with negative TTL (Upstash would
    // reject) or zero TTL (immediate expiry → token unusable).
    await writeAccessToken(env, 'token', 30);

    expect(mcpRedisSet).toHaveBeenCalledWith(
      KV_MCP_ACCESS_TOKEN_KEY,
      'token',
      expect.objectContaining({ ex: 60 })
    );
  });

  it('returns false when MCP DB creds are not bound', async () => {
    const ok = await writeAccessToken({ INOREADER_ACCESS_TOKEN: 'env' } as Env, 'token', 3600);

    expect(ok).toBe(false);
    expect(mcpRedisSet).not.toHaveBeenCalled();
  });

  it('returns false when Upstash write throws (network error)', async () => {
    mcpRedisSet.mockRejectedValue(new Error('upstash unreachable'));

    const ok = await writeAccessToken(env, 'token', 3600);

    expect(ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// writeRefreshToken — MCP DB only, no TTL
// ---------------------------------------------------------------------------

describe('writeRefreshToken', () => {
  it('writes to mcp:inoreader:refresh_token with no TTL', async () => {
    mcpRedisSet.mockResolvedValue('OK');

    const ok = await writeRefreshToken(env, 'new-refresh');

    expect(ok).toBe(true);
    expect(mcpRedisSet).toHaveBeenCalledTimes(1);
    // Just key + value — no TTL options. Refresh tokens are long-lived;
    // Inoreader doesn't document an expiration, and rotation is the
    // substitute. Asserting absence of the third arg pins the contract.
    expect(mcpRedisSet).toHaveBeenCalledWith(KV_MCP_REFRESH_TOKEN_KEY, 'new-refresh');
  });

  it('returns false when MCP DB creds are not bound', async () => {
    const ok = await writeRefreshToken({} as Env, 'token');

    expect(ok).toBe(false);
    expect(mcpRedisSet).not.toHaveBeenCalled();
  });

  it('returns false when Upstash write throws', async () => {
    mcpRedisSet.mockRejectedValue(new Error('upstash unreachable'));

    const ok = await writeRefreshToken(env, 'token');

    expect(ok).toBe(false);
  });
});
