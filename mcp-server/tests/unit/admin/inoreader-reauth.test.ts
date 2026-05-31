/**
 * BL-047 T2 — reauth handler unit tests.
 *
 * Pins the 7 audit-enumerated security cases + happy paths:
 *
 *   1. Replay attack: GETDEL consumes state → second callback with same
 *      state returns 403
 *   2. Expired/missing state: callback with no Upstash entry → 403
 *   3. Cookie ↔ URL state mismatch: 403 (CSRF defense M1)
 *   4. B1 cache-eviction: callback success calls `clearPreviousToken()`
 *   5. B3 persist-failure: writeRefreshToken false → distinct paging
 *      Sentry event tag, no token displayed in response body
 *   6. /start wrong admin key: 401, no state written to Upstash
 *   7. /start happy path: cookie set + 302 to Inoreader with state
 *      query param
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGet,
  mockSet,
  mockDel,
  mockGetdel,
  MockRedis,
  mockClearPreviousToken,
  mockCaptureMessage,
  mockSafeLog,
  mockWriteAccess,
  mockWriteRefresh,
  mockExchange,
  mockAcquire,
  mockRelease,
} = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockSet = vi.fn();
  const mockDel = vi.fn();
  const mockGetdel = vi.fn();
  class MockRedis {
    get = mockGet;
    set = mockSet;
    del = mockDel;
    getdel = mockGetdel;
  }
  return {
    mockGet,
    mockSet,
    mockDel,
    mockGetdel,
    MockRedis,
    mockClearPreviousToken: vi.fn(),
    mockCaptureMessage: vi.fn().mockResolvedValue(undefined),
    mockSafeLog: vi.fn(),
    mockWriteAccess: vi.fn(),
    mockWriteRefresh: vi.fn(),
    mockExchange: vi.fn(),
    mockAcquire: vi.fn().mockResolvedValue(true),
    mockRelease: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@upstash/redis', () => ({ Redis: MockRedis }));
vi.mock('../../../src/lib/inoreader-oauth-grace-cache', () => ({
  clearPreviousToken: mockClearPreviousToken,
}));
vi.mock('../../../src/observability/sentry-envelope', () => ({
  captureMessageEnvelope: mockCaptureMessage,
}));
vi.mock('../../../src/auth/safe-logger', () => ({ safeLog: mockSafeLog }));
vi.mock('../../../src/lib/inoreader-token-store', () => ({
  writeAccessToken: mockWriteAccess,
  writeRefreshToken: mockWriteRefresh,
}));
vi.mock('../../../src/lib/inoreader-oauth-reauth-exchange', () => ({
  buildAuthorizationUrl: (_env: unknown, state: string) =>
    `https://www.inoreader.com/oauth2/auth?state=${state}&client_id=x`,
  exchangeAuthorizationCode: mockExchange,
}));
vi.mock('../../../src/lib/single-flight-lock', () => ({
  acquire: mockAcquire,
  release: mockRelease,
}));

import {
  handleReauthCallback,
  handleReauthStartGet,
  handleReauthStartPost,
} from '../../../src/admin/inoreader-reauth';
import type { Env } from '../../../src/worker';

const env: Env = {
  UPSTASH_MCP_REST_URL: 'https://x.upstash.io',
  UPSTASH_MCP_REST_TOKEN: 'rw',
  INOREADER_APP_ID: 'app-x',
  INOREADER_APP_KEY: 'app-key-y',
  INOREADER_REDIRECT_URI: 'https://mcp.globalstrategic.tech/admin/inoreader/reauth/callback',
  MCP_ADMIN_KEY: 'correct-admin-key',
};

beforeEach(() => {
  mockGet.mockReset();
  mockSet.mockReset().mockResolvedValue('OK');
  mockDel.mockReset().mockResolvedValue(1);
  mockGetdel.mockReset();
  mockClearPreviousToken.mockReset();
  mockCaptureMessage.mockReset().mockResolvedValue(undefined);
  mockSafeLog.mockReset();
  mockWriteAccess.mockReset().mockResolvedValue(true);
  mockWriteRefresh.mockReset().mockResolvedValue(true);
  mockExchange.mockReset();
  mockAcquire.mockReset().mockResolvedValue(true);
  mockRelease.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// GET /start — form rendering
// ---------------------------------------------------------------------------

describe('handleReauthStartGet', () => {
  it('returns HTML form with admin_key password field when MCP_ADMIN_KEY is bound', async () => {
    const response = handleReauthStartGet(env);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    const body = await response.text();
    expect(body).toContain('<form method="POST"');
    expect(body).toContain('type="password"');
    expect(body).toContain('name="admin_key"');
    expect(body).toContain('Inoreader OAuth Re-Auth');
  });

  it('returns 503 with config error when MCP_ADMIN_KEY unbound', async () => {
    const noKey: Env = { ...env, MCP_ADMIN_KEY: undefined };
    const response = handleReauthStartGet(noKey);
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain('MCP_ADMIN_KEY not configured');
  });
});

// ---------------------------------------------------------------------------
// POST /start — wrong key, happy path, state persistence
// ---------------------------------------------------------------------------

describe('handleReauthStartPost — wrong admin key (audit case 6)', () => {
  it('returns 401 with form re-render + does NOT mint state in Upstash', async () => {
    const req = postForm({ admin_key: 'wrong-key' });
    const response = await handleReauthStartPost(req, env);
    expect(response.status).toBe(401);
    const body = await response.text();
    expect(body).toContain('Incorrect admin key');
    expect(mockSet).not.toHaveBeenCalled();
    expect(mockSafeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'admin.reauth.start.rejected',
        reason: 'bad-admin-key',
      })
    );
  });
});

describe('handleReauthStartPost — happy path (audit case 7)', () => {
  it('sets HttpOnly Secure SameSite=Lax cookie + 302s to Inoreader with state', async () => {
    const req = postForm({ admin_key: 'correct-admin-key' });
    const response = await handleReauthStartPost(req, env);
    expect(response.status).toBe(302);
    const location = response.headers.get('Location');
    expect(location).toMatch(/^https:\/\/www\.inoreader\.com\/oauth2\/auth\?/);
    const cookie = response.headers.get('Set-Cookie');
    expect(cookie).toContain('mcp_reauth_session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('persists state in Upstash with 5-min TTL', async () => {
    const req = postForm({ admin_key: 'correct-admin-key' });
    await handleReauthStartPost(req, env);
    expect(mockSet).toHaveBeenCalledTimes(1);
    const [key, value, opts] = mockSet.mock.calls[0]!;
    expect(key).toMatch(/^mcp:inoreader:reauth-state:[a-f0-9]{32}$/);
    expect(value).toBe('1');
    expect(opts).toMatchObject({ ex: 300 });
  });

  it('cookie nonce matches the state in the Location URL (binding)', async () => {
    const req = postForm({ admin_key: 'correct-admin-key' });
    const response = await handleReauthStartPost(req, env);
    const cookie = response.headers.get('Set-Cookie')!;
    const location = response.headers.get('Location')!;
    const cookieNonce = cookie.match(/mcp_reauth_session=([a-f0-9]{32})/)![1];
    const urlState = new URL(location).searchParams.get('state');
    expect(cookieNonce).toBe(urlState);
  });
});

// ---------------------------------------------------------------------------
// GET /callback — state validation, cookie binding, persist/B1/B3
// ---------------------------------------------------------------------------

describe('handleReauthCallback — state validation', () => {
  it('returns 403 when state query param missing (audit case 2)', async () => {
    const req = callbackReq({ code: 'c', cookie: 'mcp_reauth_session=deadbeef' });
    const response = await handleReauthCallback(req, env);
    expect(response.status).toBe(403);
    expect(mockGetdel).not.toHaveBeenCalled();
  });

  it('returns 403 when state has no Upstash entry (audit case 2: expired/missing)', async () => {
    mockGetdel.mockResolvedValueOnce(null);
    const req = callbackReq({
      code: 'c',
      state: 'abcdef01',
      cookie: 'mcp_reauth_session=abcdef01',
    });
    const response = await handleReauthCallback(req, env);
    expect(response.status).toBe(403);
    const body = await response.text();
    expect(body).toContain('State expired or already used');
    expect(mockCaptureMessage).toHaveBeenCalled();
    const call = mockCaptureMessage.mock.calls[0]!;
    expect(call[1]).toMatch(/admin-reauth-state-rejected/);
    expect(call[2]).toBe('warning');
    expect(call[4]).toBe('admin-reauth-state-rejected');
  });

  it('returns 403 when cookie nonce ≠ URL state (CSRF defense, M1)', async () => {
    const req = callbackReq({
      code: 'c',
      state: 'aaaa1111',
      cookie: 'mcp_reauth_session=bbbb2222',
    });
    const response = await handleReauthCallback(req, env);
    expect(response.status).toBe(403);
    expect(mockGetdel).not.toHaveBeenCalled(); // never touch Upstash when binding fails
  });

  it('returns 403 on replay — second callback with same state returns null from GETDEL (audit case 1)', async () => {
    // First call consumes state via GETDEL (returns the value)
    mockGetdel.mockResolvedValueOnce('1');
    mockExchange.mockResolvedValueOnce({
      ok: true,
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 3600,
    });
    const req1 = callbackReq({
      code: 'c1',
      state: 'cafe1234',
      cookie: 'mcp_reauth_session=cafe1234',
    });
    const response1 = await handleReauthCallback(req1, env);
    expect(response1.status).toBe(200); // first call succeeds

    // Second call with same state — GETDEL returns null (state was consumed)
    mockGetdel.mockResolvedValueOnce(null);
    const req2 = callbackReq({
      code: 'c1',
      state: 'cafe1234',
      cookie: 'mcp_reauth_session=cafe1234',
    });
    const response2 = await handleReauthCallback(req2, env);
    expect(response2.status).toBe(403);
  });
});

describe('handleReauthCallback — happy path + B1 cache eviction', () => {
  it('exchanges code, writes both tokens, evicts grace cache, returns 200 success page (audit case 4)', async () => {
    mockGetdel.mockResolvedValueOnce('1');
    mockExchange.mockResolvedValueOnce({
      ok: true,
      accessToken: 'fresh-access',
      refreshToken: 'fresh-refresh',
      expiresIn: 3600,
    });
    const req = callbackReq({
      code: 'inoreader-code',
      state: 'feedface',
      cookie: 'mcp_reauth_session=feedface',
    });

    const response = await handleReauthCallback(req, env);

    expect(response.status).toBe(200);
    expect(mockWriteRefresh).toHaveBeenCalledWith(env, 'fresh-refresh');
    expect(mockWriteAccess).toHaveBeenCalledWith(env, 'fresh-access', 3600);

    // B1: in-isolate cache must be evicted after a fresh chain mint.
    expect(mockClearPreviousToken).toHaveBeenCalledTimes(1);

    // Success Sentry event (info-level, never pages).
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      env,
      expect.stringContaining('oauth-reauth-success'),
      'info',
      expect.anything(),
      'admin-reauth-callback-success'
    );

    // Lock lifecycle: acquired + released.
    expect(mockAcquire).toHaveBeenCalledWith(env, 'mcp:inoreader:refresh-lock', 30);
    expect(mockRelease).toHaveBeenCalled();
  });
});

describe('handleReauthCallback — persist failure (audit case 5, B3)', () => {
  it('emits distinct paging Sentry event + never displays tokens when writeRefreshToken fails', async () => {
    mockGetdel.mockResolvedValueOnce('1');
    mockExchange.mockResolvedValueOnce({
      ok: true,
      accessToken: 'fresh-access',
      refreshToken: 'fresh-refresh',
      expiresIn: 3600,
    });
    mockWriteRefresh.mockResolvedValueOnce(false);

    const req = callbackReq({
      code: 'c',
      state: 'dec0ded5',
      cookie: 'mcp_reauth_session=dec0ded5',
    });
    const response = await handleReauthCallback(req, env);

    expect(response.status).toBe(500);
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      env,
      expect.stringContaining('oauth-reauth-persist-failed'),
      'error',
      expect.anything(),
      'admin-reauth-persist-failed',
      expect.anything()
    );
    // Critical: response body must NEVER contain the live tokens.
    const body = await response.text();
    expect(body).not.toContain('fresh-access');
    expect(body).not.toContain('fresh-refresh');
    expect(body).toContain('Action required');
    // Grace cache stays populated since we did NOT successfully mint.
    expect(mockClearPreviousToken).not.toHaveBeenCalled();
  });
});

describe('handleReauthCallback — exchange failure', () => {
  it('returns 502 with paging Sentry event tag when Inoreader rejects the code', async () => {
    mockGetdel.mockResolvedValueOnce('1');
    mockExchange.mockResolvedValueOnce({
      ok: false,
      reason: 'invalid-grant',
      message: 'code expired or already used',
    });

    const req = callbackReq({
      code: 'expired',
      state: 'dec0ded5',
      cookie: 'mcp_reauth_session=dec0ded5',
    });
    const response = await handleReauthCallback(req, env);
    expect(response.status).toBe(502);
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      env,
      expect.stringContaining('oauth-reauth-token-exchange-failed'),
      'error',
      expect.anything(),
      'admin-reauth-token-exchange-failed',
      expect.anything()
    );
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function postForm(fields: Record<string, string>): Request {
  const body = new URLSearchParams(fields).toString();
  return new Request('https://x.example/admin/inoreader/reauth/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
}

function callbackReq(opts: { code?: string; state?: string; cookie?: string }): Request {
  const url = new URL('https://x.example/admin/inoreader/reauth/callback');
  if (opts.code) url.searchParams.set('code', opts.code);
  if (opts.state) url.searchParams.set('state', opts.state);
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.Cookie = opts.cookie;
  return new Request(url.toString(), { headers });
}
