/**
 * Unit tests for inoreader-oauth (BL-032.8 Phase 2).
 *
 * The OAuth module is the structural fix that supersedes BL-040 (parallel
 * refresh debounce) — without the single-flight lock, every parallel 401
 * spawns its own /oauth2/token POST. These tests pin:
 *
 *   1. Happy-path persistence ordering (refresh_token before access_token)
 *   2. Conditional rotation (only write refresh_token when it differs)
 *   3. Error taxonomy mapping (each Inoreader response shape → correct reason)
 *   4. Single-flight semantics (lock acquire/release, peer poll path)
 *   5. Sentry severity routing (which outcomes page, which warn, which log-only)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { redisGet, redisSet, redisDel, MockRedis, mockCaptureMessage, mockSafeLog } = vi.hoisted(
  () => {
    const redisGet = vi.fn();
    const redisSet = vi.fn();
    const redisDel = vi.fn();
    class MockRedis {
      get = redisGet;
      set = redisSet;
      del = redisDel;
    }
    return {
      redisGet,
      redisSet,
      redisDel,
      MockRedis,
      mockCaptureMessage: vi.fn(),
      mockSafeLog: vi.fn(),
    };
  }
);

vi.mock('@upstash/redis', () => ({ Redis: MockRedis }));
vi.mock('../../../src/observability/sentry-envelope', () => ({
  captureMessageEnvelope: mockCaptureMessage,
}));
vi.mock('../../../src/auth/safe-logger', () => ({ safeLog: mockSafeLog }));

import { refreshAccessToken } from '../../../src/lib/inoreader-oauth';
import type { Env } from '../../../src/worker';

const env: Env = {
  INOREADER_APP_ID: 'test-app-id',
  INOREADER_APP_KEY: 'test-app-key',
  INOREADER_REFRESH_TOKEN: 'env-refresh-token',
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
  fetchSpy.mockReset();
  mockCaptureMessage.mockReset();
  mockSafeLog.mockReset();
  // Default: lock acquires successfully; tokens read from Upstash; writes succeed.
  redisSet.mockResolvedValue('OK');
  redisDel.mockResolvedValue(1);
  redisGet.mockImplementation(async (key: string) => {
    if (key === 'mcp:inoreader:refresh_token') return 'stored-refresh-token';
    return null;
  });
  vi.stubGlobal('fetch', fetchSpy);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function inoreaderTokenResponse(
  overrides: Partial<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }> = {}
): Response {
  return new Response(
    JSON.stringify({
      access_token: 'new-access-token',
      refresh_token: 'stored-refresh-token', // same as stored → no rotation
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'read',
      ...overrides,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('refreshAccessToken — happy path', () => {
  it('acquires lock, POSTs /oauth2/token, persists tokens, releases lock', async () => {
    fetchSpy.mockResolvedValue(inoreaderTokenResponse());

    const result = await refreshAccessToken(env, 'cron');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.accessToken).toBe('new-access-token');
    expect(result.refreshSource).toBe('fresh');

    // Lock lifecycle: SET NX EX 10 → DEL (best-effort release).
    const lockSet = redisSet.mock.calls.find(
      (c) => c[0] === 'mcp:inoreader:refresh-lock' && c[2]?.nx === true
    );
    expect(lockSet).toBeDefined();
    expect(lockSet![2]).toMatchObject({ nx: true, ex: 10 });
    expect(redisDel).toHaveBeenCalledWith('mcp:inoreader:refresh-lock');

    // Inoreader call: form-encoded POST with the four documented fields.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]![0]).toBe('https://www.inoreader.com/oauth2/token');
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded'
    );
    const bodyParams = new URLSearchParams(init.body as string);
    expect(bodyParams.get('client_id')).toBe('test-app-id');
    expect(bodyParams.get('client_secret')).toBe('test-app-key');
    expect(bodyParams.get('grant_type')).toBe('refresh_token');
    expect(bodyParams.get('refresh_token')).toBe('stored-refresh-token');

    // Access-token persistence: TTL = expires_in − 60.
    const accessSet = redisSet.mock.calls.find((c) => c[0] === 'mcp:inoreader:access_token');
    expect(accessSet).toBeDefined();
    expect(accessSet![1]).toBe('new-access-token');
    expect(accessSet![2]).toMatchObject({ ex: 3540 });
  });

  it('emits a safeLog success entry with source tag', async () => {
    fetchSpy.mockResolvedValue(inoreaderTokenResponse());

    await refreshAccessToken(env, 'live-tool');

    expect(mockSafeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'oauth.refresh.success',
        reason: 'live-tool',
        success: true,
      })
    );
    // Successful refresh is not actionable; no Sentry capture.
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Conditional refresh_token rotation (Phase 0 Q0.2)
// ---------------------------------------------------------------------------

describe('refreshAccessToken — conditional refresh_token rotation', () => {
  it('writes new refresh_token when Inoreader returns a different value', async () => {
    fetchSpy.mockResolvedValue(inoreaderTokenResponse({ refresh_token: 'rotated-refresh-token' }));

    await refreshAccessToken(env, 'cron');

    const refreshSet = redisSet.mock.calls.find((c) => c[0] === 'mcp:inoreader:refresh_token');
    expect(refreshSet).toBeDefined();
    expect(refreshSet![1]).toBe('rotated-refresh-token');
  });

  it('does NOT write refresh_token when Inoreader returns the same value', async () => {
    // Phase 0 Q0.2: Inoreader's response always carries refresh_token but
    // value may equal prior. Skip the write to avoid redundant Upstash ops.
    fetchSpy.mockResolvedValue(inoreaderTokenResponse({ refresh_token: 'stored-refresh-token' }));

    await refreshAccessToken(env, 'cron');

    const refreshSet = redisSet.mock.calls.find((c) => c[0] === 'mcp:inoreader:refresh_token');
    expect(refreshSet).toBeUndefined();
  });

  it('persists refresh_token BEFORE access_token on rotation (crash-safe ordering)', async () => {
    fetchSpy.mockResolvedValue(inoreaderTokenResponse({ refresh_token: 'rotated-refresh-token' }));

    await refreshAccessToken(env, 'cron');

    const refreshSetCall = redisSet.mock.calls.findIndex(
      (c) => c[0] === 'mcp:inoreader:refresh_token'
    );
    const accessSetCall = redisSet.mock.calls.findIndex(
      (c) => c[0] === 'mcp:inoreader:access_token'
    );
    expect(refreshSetCall).toBeGreaterThanOrEqual(0);
    expect(accessSetCall).toBeGreaterThanOrEqual(0);
    // A crash between writes would leave the refresh_token persisted (the
    // credential needed to recover) and the access_token absent (which just
    // triggers another refresh on next read — safe).
    expect(refreshSetCall).toBeLessThan(accessSetCall);
  });
});

// ---------------------------------------------------------------------------
// Error taxonomy
// ---------------------------------------------------------------------------

describe('refreshAccessToken — error taxonomy', () => {
  it('returns invalid-refresh-token on Inoreader 401', async () => {
    fetchSpy.mockResolvedValue(new Response('{"error":"invalid_grant"}', { status: 401 }));

    const result = await refreshAccessToken(env, 'cron');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('invalid-refresh-token');
    // Sentry: paging-class (error level) — operator must re-link OAuth.
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      env,
      'oauth-refresh-invalid-refresh-token',
      'error',
      expect.objectContaining({ source: 'cron' }),
      'oauth.refresh.invalid-refresh-token',
      expect.objectContaining({ 'oauth.reason': 'invalid-refresh-token' })
    );
  });

  it('returns invalid-refresh-token when 400 body contains invalid_grant', async () => {
    // Some OAuth providers return 400 + invalid_grant rather than 401.
    // Match either pattern.
    fetchSpy.mockResolvedValue(
      new Response('{"error":"invalid_grant","error_description":"refresh token revoked"}', {
        status: 400,
      })
    );

    const result = await refreshAccessToken(env, 'cron');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('invalid-refresh-token');
  });

  it('returns inoreader-error on 5xx response', async () => {
    fetchSpy.mockResolvedValue(new Response('{"error":"server_error"}', { status: 503 }));

    const result = await refreshAccessToken(env, 'cron');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('inoreader-error');
    // Sentry: warning (transient; caller fallback may recover).
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      env,
      'oauth-refresh-inoreader-error',
      'warning',
      expect.anything(),
      'oauth.refresh.inoreader-error',
      expect.anything()
    );
  });

  it('returns inoreader-error on network failure', async () => {
    fetchSpy.mockRejectedValue(new Error('connection refused'));

    const result = await refreshAccessToken(env, 'cron');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('inoreader-error');
    expect(result.message).toContain('connection refused');
  });

  it('returns inoreader-error on malformed JSON response', async () => {
    fetchSpy.mockResolvedValue(
      new Response('<html>not json</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    );

    const result = await refreshAccessToken(env, 'cron');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('inoreader-error');
  });

  it('returns inoreader-error when response is 200 but missing access_token', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ token_type: 'Bearer', scope: 'read' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await refreshAccessToken(env, 'cron');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('inoreader-error');
  });

  it('returns token-missing when no refresh_token is available anywhere', async () => {
    redisGet.mockResolvedValue(null);

    const result = await refreshAccessToken({ ...env, INOREADER_REFRESH_TOKEN: undefined }, 'cron');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('token-missing');
    // No /oauth2/token POST attempted — no point without a refresh_token.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      { ...env, INOREADER_REFRESH_TOKEN: undefined },
      'oauth-refresh-token-missing',
      'error',
      expect.anything(),
      'oauth.refresh.token-missing',
      expect.anything()
    );
  });

  it('returns inoreader-error when INOREADER_APP_ID is not bound', async () => {
    const result = await refreshAccessToken({ ...env, INOREADER_APP_ID: undefined }, 'cron');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('inoreader-error');
    expect(result.message).toMatch(/INOREADER_APP_ID|credentials/i);
  });

  it('returns upstash-write-failed when access_token persistence fails', async () => {
    fetchSpy.mockResolvedValue(inoreaderTokenResponse());
    // Configure SET to succeed for the lock (NX) but fail for access_token.
    redisSet.mockImplementation(async (key: string) => {
      if (key === 'mcp:inoreader:access_token') {
        throw new Error('upstash unreachable');
      }
      return 'OK';
    });

    const result = await refreshAccessToken(env, 'cron');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('upstash-write-failed');
    // Lock still released — finally block runs regardless of error.
    expect(redisDel).toHaveBeenCalledWith('mcp:inoreader:refresh-lock');
  });

  it('returns upstash-write-failed when ROTATED refresh_token persistence fails', async () => {
    // Distinct branch from the access_token-failure case above: when Inoreader
    // returns a rotated refresh_token AND the write to mcp:inoreader:refresh_token
    // fails, we surface upstash-write-failed BEFORE attempting the access_token
    // write. This is load-bearing for crash-safety — the access_token must
    // never land in Upstash without a paired refresh_token capable of
    // refreshing it.
    fetchSpy.mockResolvedValue(inoreaderTokenResponse({ refresh_token: 'rotated-refresh-token' }));
    redisSet.mockImplementation(async (key: string) => {
      if (key === 'mcp:inoreader:refresh_token') {
        throw new Error('upstash unreachable mid-rotation');
      }
      return 'OK';
    });

    const result = await refreshAccessToken(env, 'cron');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('upstash-write-failed');
    // access_token write must NOT have been attempted — the refresh_token
    // failure short-circuits the persistence sequence.
    const accessSetCall = redisSet.mock.calls.find((c) => c[0] === 'mcp:inoreader:access_token');
    expect(accessSetCall).toBeUndefined();
    // Lock still released — finally block runs regardless of error.
    expect(redisDel).toHaveBeenCalledWith('mcp:inoreader:refresh-lock');
  });
});

// ---------------------------------------------------------------------------
// Single-flight semantics (peer poll path)
// ---------------------------------------------------------------------------

describe('refreshAccessToken — single-flight', () => {
  it('returns cached-by-peer when lock acquire fails and access_token changes within timeout', async () => {
    // Acquire fails (peer holds lock). pollForChange snapshots
    // mcp:inoreader:access_token once, then polls until value differs.
    // Use a stateful mockImplementation keyed on access-token reads so the
    // test self-documents which call is snapshot vs. poll-observation —
    // mockResolvedValueOnce chains break the moment pollForChange ever
    // adds a pre-snapshot read (e.g. a health check).
    redisSet.mockImplementation(async (key: string, _value, opts) => {
      if (key === 'mcp:inoreader:refresh-lock' && opts?.nx) return null;
      return 'OK';
    });
    let accessTokenReads = 0;
    redisGet.mockImplementation(async (key: string) => {
      if (key === 'mcp:inoreader:access_token') {
        accessTokenReads += 1;
        return accessTokenReads === 1 ? 'old-token' : 'peer-refreshed-token';
      }
      return null;
    });

    const result = await refreshAccessToken(env, 'live-tool');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.refreshSource).toBe('cached-by-peer');
    expect(result.accessToken).toBe('peer-refreshed-token');
    // Did NOT make a /oauth2/token call — peer's value was the answer.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns lock-timeout when lock acquire fails AND peer never finishes', async () => {
    redisSet.mockImplementation(async (key: string, _value, opts) => {
      if (key === 'mcp:inoreader:refresh-lock' && opts?.nx) return null;
      return 'OK';
    });
    // Narrow mock to just the access-token snapshot key so this test doesn't
    // accidentally serve 'frozen-token' as the refresh_token if performRefresh
    // were ever reached (it isn't on the lock-timeout path, but defense-in-depth
    // against future refactors).
    redisGet.mockImplementation(async (key: string) => {
      if (key === 'mcp:inoreader:access_token') return 'frozen-token';
      return null;
    });

    // Use a synthetic short timeout via fake timers would be ideal, but the
    // current pollForChange API doesn't expose timeout-override at the caller.
    // For this test we accept the realistic ~15s wait by stubbing setTimeout.
    vi.useFakeTimers();
    const promise = refreshAccessToken(env, 'live-tool');
    // Run timers to completion to skip the poll wait window.
    await vi.runAllTimersAsync();
    const result = await promise;
    vi.useRealTimers();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('lock-timeout');
    // Sentry: NO capture for lock-timeout (transient, retryable).
    expect(mockCaptureMessage).not.toHaveBeenCalled();
    // But safeLog still fires for observability.
    expect(mockSafeLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'oauth.refresh.lock-timeout' })
    );
  });
});
