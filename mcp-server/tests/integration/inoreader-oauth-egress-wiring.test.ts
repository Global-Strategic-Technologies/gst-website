/**
 * BL-032.75 Phase 0 — verify the OAuth POST records as an 'oauth-refresh'
 * egress event AND does NOT increment the Zone-1 total.
 *
 * Rationale: /oauth2/token is not in either Inoreader Zone table at
 * https://www.inoreader.com/developers/rate-limiting (Zone tables cover
 * /reader/api/0/* endpoints only). The recorder still tracks per-category
 * so an operator can see OAuth churn ("are we refreshing too often?"), but
 * the OAuth count must NOT pollute the Zone-1 spend dashboard.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { redisGet, redisSet, redisDel, redisIncr, redisExpire, MockRedis, mockSafeLog } = vi.hoisted(
  () => {
    const redisGet = vi.fn();
    const redisSet = vi.fn();
    const redisDel = vi.fn();
    const redisIncr = vi.fn();
    const redisExpire = vi.fn();
    class MockRedis {
      get = redisGet;
      set = redisSet;
      del = redisDel;
      incr = redisIncr;
      expire = redisExpire;
    }
    return {
      redisGet,
      redisSet,
      redisDel,
      redisIncr,
      redisExpire,
      MockRedis,
      mockSafeLog: vi.fn(),
    };
  }
);

vi.mock('@upstash/redis', () => ({ Redis: MockRedis }));
vi.mock('../../src/observability/sentry', () => ({
  captureMessage: vi.fn(),
}));
vi.mock('../../src/auth/safe-logger', () => ({ safeLog: mockSafeLog }));

import { refreshAccessToken } from '../../src/lib/inoreader-oauth';
import { categorySpendKey, totalSpendKey } from '../../src/lib/inoreader-egress';
import type { Env } from '../../src/worker';

const env: Env = {
  INOREADER_APP_ID: 'app',
  INOREADER_APP_KEY: 'key',
  INOREADER_REFRESH_TOKEN: 'env-refresh',
  UPSTASH_MCP_REST_URL: 'https://mcp.upstash.io',
  UPSTASH_MCP_REST_TOKEN: 'mcp-rw',
  UPSTASH_INOREADER_REST_URL: 'https://inoreader.upstash.io',
  UPSTASH_INOREADER_REST_TOKEN: 'inoreader-ro',
};

const fetchSpy = vi.fn();

beforeEach(() => {
  redisGet.mockReset();
  redisSet.mockReset();
  redisDel.mockReset();
  redisIncr.mockReset();
  redisExpire.mockReset();
  fetchSpy.mockReset();
  mockSafeLog.mockReset();
  redisSet.mockResolvedValue('OK');
  redisDel.mockResolvedValue(1);
  redisIncr.mockResolvedValue(3);
  redisGet.mockImplementation(async (k: string) =>
    k === 'mcp:inoreader:refresh_token' ? 'stored-refresh-token' : null
  );
  vi.stubGlobal('fetch', fetchSpy);
});

function tokenResponse(status = 200): Response {
  return new Response(
    JSON.stringify({
      access_token: 'new',
      refresh_token: 'stored-refresh-token',
      expires_in: 3600,
      token_type: 'Bearer',
    }),
    { status, headers: { 'Content-Type': 'application/json' } }
  );
}

describe('refreshAccessToken × egress recorder (BL-032.75 Phase 0)', () => {
  it('records the OAuth POST as oauth-refresh on success', async () => {
    fetchSpy.mockResolvedValue(tokenResponse(200));

    await refreshAccessToken(env, 'cron');

    // Use the exported helpers rather than regex shape-matching. If
    // SPEND_KEY_PREFIX changes, the helper updates and this test still
    // pins the same behavior; the prior regex would have gone green
    // trivially because no keys would match the old prefix.
    expect(redisIncr).toHaveBeenCalledWith(categorySpendKey('oauth-refresh'));
    expect(redisIncr).not.toHaveBeenCalledWith(totalSpendKey());
  });

  it('records the OAuth POST even when Inoreader returns a 4xx/5xx (call still hit Inoreader)', async () => {
    fetchSpy.mockResolvedValue(tokenResponse(500));

    await refreshAccessToken(env, 'cron');

    expect(redisIncr).toHaveBeenCalledWith(categorySpendKey('oauth-refresh'));
    expect(redisIncr).not.toHaveBeenCalledWith(totalSpendKey());
  });

  it('does NOT record the egress counter when the OAuth POST throws (no Response received)', async () => {
    fetchSpy.mockRejectedValue(new Error('network down'));

    await refreshAccessToken(env, 'cron');

    // A network error means nothing reached Inoreader's quota counter; we
    // must not tick the egress counter either, otherwise drift detection
    // would flag the wrapper itself as the bug source.
    //
    // **Scoped assertion (BL-047 T4 update)**: BL-047 T4 records a
    // refresh-failure counter on `inoreader-error` at this code path
    // (different counter family, different keyspace —
    // `mcp:inoreader:refresh-failure:*` vs `mcp:inoreader:spend:*`).
    // That INCR is correct behavior and unrelated to the egress
    // accounting assertion below. The original "no INCR at all" check
    // is replaced with a per-key check against the egress prefixes only.
    expect(redisIncr).not.toHaveBeenCalledWith(categorySpendKey('oauth-refresh'));
    expect(redisIncr).not.toHaveBeenCalledWith(totalSpendKey());
  });
});
