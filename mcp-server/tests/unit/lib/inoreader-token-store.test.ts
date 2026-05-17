/**
 * Unit tests for inoreader-token-store (BL-032.8 Phase 1 + Phase 2).
 *
 * Phase 1 introduced readAccessToken with Upstash + env-fallback. Phase 2
 * extends the module with:
 *   - Dual-read for readAccessToken: MCP DB first, fall back to Inoreader DB
 *   - readRefreshToken (same dual-read semantics)
 *   - writeAccessToken (MCP DB only; TTL = expires_in - 60)
 *   - writeRefreshToken (MCP DB only; no TTL)
 *
 * Tests cover the priority order, fail-toward-degraded behavior across
 * each Upstash tier, and the buffer/TTL semantics that prevent stale-token
 * 401s.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Each MCP DB / Inoreader DB instantiates its own Redis. The mock factory
// distinguishes them by URL so tests can mock each independently. This is
// closer to the production wire — using a single mocked Redis would hide
// dual-read bugs where the wrong DB is consulted first.
const { mcpRedisGet, mcpRedisSet, inoreaderRedisGet, MockRedis } = vi.hoisted(() => {
  const mcpRedisGet = vi.fn();
  const mcpRedisSet = vi.fn();
  const inoreaderRedisGet = vi.fn();
  class MockRedis {
    private readonly isMcp: boolean;
    constructor(opts: { url: string }) {
      this.isMcp = opts.url.includes('mcp');
    }
    get = (key: string) => (this.isMcp ? mcpRedisGet(key) : inoreaderRedisGet(key));
    set = (...args: unknown[]) => mcpRedisSet(...args);
  }
  return { mcpRedisGet, mcpRedisSet, inoreaderRedisGet, MockRedis };
});

vi.mock('@upstash/redis', () => ({ Redis: MockRedis }));

import {
  readAccessToken,
  readRefreshToken,
  writeAccessToken,
  writeRefreshToken,
  KV_ACCESS_TOKEN_KEY,
  KV_REFRESH_TOKEN_KEY,
  KV_MCP_ACCESS_TOKEN_KEY,
  KV_MCP_REFRESH_TOKEN_KEY,
} from '../../../src/lib/inoreader-token-store';
import type { Env } from '../../../src/worker';

const dualDbEnv: Env = {
  UPSTASH_INOREADER_REST_URL: 'https://inoreader-db.upstash.io',
  UPSTASH_INOREADER_REST_TOKEN: 'inoreader-readonly',
  UPSTASH_MCP_REST_URL: 'https://mcp-db.upstash.io',
  UPSTASH_MCP_REST_TOKEN: 'mcp-rw',
  INOREADER_ACCESS_TOKEN: 'env-fallback-access',
  INOREADER_REFRESH_TOKEN: 'env-fallback-refresh',
};

beforeEach(() => {
  mcpRedisGet.mockReset();
  mcpRedisSet.mockReset();
  inoreaderRedisGet.mockReset();
});

// ---------------------------------------------------------------------------
// Key-name pinning (tests trip CI if anyone carelessly renames these)
// ---------------------------------------------------------------------------

describe('token-store key names (load-bearing cross-system contracts)', () => {
  it('pins all four key names to their canonical values', () => {
    // Changing any of these requires coordinated migration with the website
    // and/or an Upstash data-migration pass. The pin makes accidental renames
    // fail CI loudly rather than silently breaking production reads.
    expect(KV_ACCESS_TOKEN_KEY).toBe('inoreader:access_token');
    expect(KV_REFRESH_TOKEN_KEY).toBe('inoreader:refresh_token');
    expect(KV_MCP_ACCESS_TOKEN_KEY).toBe('mcp:inoreader:access_token');
    expect(KV_MCP_REFRESH_TOKEN_KEY).toBe('mcp:inoreader:refresh_token');
  });
});

// ---------------------------------------------------------------------------
// readAccessToken — priority: MCP DB → Inoreader DB → env
// ---------------------------------------------------------------------------

describe('readAccessToken (Phase 2 dual-read)', () => {
  it('prefers MCP DB when present (Worker-owned source of truth)', async () => {
    mcpRedisGet.mockResolvedValue('mcp-token');

    const token = await readAccessToken(dualDbEnv);

    expect(token).toBe('mcp-token');
    expect(mcpRedisGet).toHaveBeenCalledWith(KV_MCP_ACCESS_TOKEN_KEY);
    // Inoreader DB should NOT be consulted when MCP DB returned a value —
    // skipping the second read saves a round-trip on the hot path.
    expect(inoreaderRedisGet).not.toHaveBeenCalled();
  });

  it('falls back to Inoreader DB when MCP DB returns null', async () => {
    mcpRedisGet.mockResolvedValue(null);
    inoreaderRedisGet.mockResolvedValue('inoreader-db-token');

    const token = await readAccessToken(dualDbEnv);

    expect(token).toBe('inoreader-db-token');
    expect(mcpRedisGet).toHaveBeenCalledTimes(1);
    expect(inoreaderRedisGet).toHaveBeenCalledWith(KV_ACCESS_TOKEN_KEY);
  });

  it('falls back to Inoreader DB when MCP DB throws (regional blip)', async () => {
    mcpRedisGet.mockRejectedValue(new Error('mcp upstash unreachable'));
    inoreaderRedisGet.mockResolvedValue('inoreader-db-token');

    const token = await readAccessToken(dualDbEnv);

    expect(token).toBe('inoreader-db-token');
  });

  it('falls back to env var when both DBs return null', async () => {
    mcpRedisGet.mockResolvedValue(null);
    inoreaderRedisGet.mockResolvedValue(null);

    const token = await readAccessToken(dualDbEnv);

    expect(token).toBe('env-fallback-access');
  });

  it('returns null when all three sources are empty', async () => {
    mcpRedisGet.mockResolvedValue(null);
    inoreaderRedisGet.mockResolvedValue(null);

    const token = await readAccessToken({
      ...dualDbEnv,
      INOREADER_ACCESS_TOKEN: undefined,
    });

    expect(token).toBeNull();
  });

  it('skips MCP DB entirely when its creds are not bound', async () => {
    inoreaderRedisGet.mockResolvedValue('inoreader-db-token');

    const token = await readAccessToken({
      UPSTASH_INOREADER_REST_URL: 'https://inoreader-db.upstash.io',
      UPSTASH_INOREADER_REST_TOKEN: 'inoreader-readonly',
      INOREADER_ACCESS_TOKEN: 'env-fallback',
    });

    expect(token).toBe('inoreader-db-token');
    expect(mcpRedisGet).not.toHaveBeenCalled();
  });

  it('skips both DBs and uses env fallback when neither is bound', async () => {
    const token = await readAccessToken({ INOREADER_ACCESS_TOKEN: 'env-only' });

    expect(token).toBe('env-only');
    expect(mcpRedisGet).not.toHaveBeenCalled();
    expect(inoreaderRedisGet).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// readRefreshToken — same priority order as readAccessToken
// ---------------------------------------------------------------------------

describe('readRefreshToken (Phase 2)', () => {
  it('prefers MCP DB refresh-token key', async () => {
    mcpRedisGet.mockResolvedValue('mcp-refresh');

    const token = await readRefreshToken(dualDbEnv);

    expect(token).toBe('mcp-refresh');
    expect(mcpRedisGet).toHaveBeenCalledWith(KV_MCP_REFRESH_TOKEN_KEY);
  });

  it('falls back to Inoreader DB when MCP DB returns null', async () => {
    mcpRedisGet.mockResolvedValue(null);
    inoreaderRedisGet.mockResolvedValue('inoreader-refresh');

    const token = await readRefreshToken(dualDbEnv);

    expect(token).toBe('inoreader-refresh');
    expect(inoreaderRedisGet).toHaveBeenCalledWith(KV_REFRESH_TOKEN_KEY);
  });

  it('falls back to INOREADER_REFRESH_TOKEN env var when both DBs are empty', async () => {
    mcpRedisGet.mockResolvedValue(null);
    inoreaderRedisGet.mockResolvedValue(null);

    const token = await readRefreshToken(dualDbEnv);

    expect(token).toBe('env-fallback-refresh');
  });

  it('returns null when all three sources are empty', async () => {
    mcpRedisGet.mockResolvedValue(null);
    inoreaderRedisGet.mockResolvedValue(null);

    const token = await readRefreshToken({
      ...dualDbEnv,
      INOREADER_REFRESH_TOKEN: undefined,
    });

    expect(token).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// writeAccessToken — MCP DB only, TTL = expires_in - 60
// ---------------------------------------------------------------------------

describe('writeAccessToken (Phase 2)', () => {
  it('writes to mcp:inoreader:access_token with TTL = expires_in - 60', async () => {
    mcpRedisSet.mockResolvedValue('OK');

    const ok = await writeAccessToken(dualDbEnv, 'new-token', 3600);

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
    await writeAccessToken(dualDbEnv, 'token', undefined);

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
    await writeAccessToken(dualDbEnv, 'token', 30);

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

    const ok = await writeAccessToken(dualDbEnv, 'token', 3600);

    expect(ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// writeRefreshToken — MCP DB only, no TTL
// ---------------------------------------------------------------------------

describe('writeRefreshToken (Phase 2)', () => {
  it('writes to mcp:inoreader:refresh_token with no TTL', async () => {
    mcpRedisSet.mockResolvedValue('OK');

    const ok = await writeRefreshToken(dualDbEnv, 'new-refresh');

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

    const ok = await writeRefreshToken(dualDbEnv, 'token');

    expect(ok).toBe(false);
  });
});
