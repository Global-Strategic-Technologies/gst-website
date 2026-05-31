/**
 * BL-047 T2 — `authorization_code` grant unit tests.
 *
 * Pins:
 *   - `redirect_uri` byte-exact in token POST body (B2 audit-blocker)
 *   - Response shaping: success / invalid-grant / inoreader-error /
 *     config-missing
 *   - Egress accounting still fires for `'oauth-refresh'` category
 *   - Build-authorization-url honors `INOREADER_REDIRECT_URI` env
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRecordEgress } = vi.hoisted(() => ({
  mockRecordEgress: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/lib/inoreader-egress', () => ({
  recordInoreaderEgress: mockRecordEgress,
}));

import {
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
} from '../../../src/lib/inoreader-oauth-reauth-exchange';
import type { Env } from '../../../src/worker';

const env: Env = {
  INOREADER_APP_ID: 'app-id-x',
  INOREADER_APP_KEY: 'app-key-y',
  INOREADER_REDIRECT_URI: 'https://mcp.globalstrategic.tech/admin/inoreader/reauth/callback',
};

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
  mockRecordEgress.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildAuthorizationUrl', () => {
  it('builds a valid Inoreader auth URL with all required OAuth params', () => {
    const url = buildAuthorizationUrl(env, 'state-nonce-abc');
    expect(url).not.toBeNull();
    const parsed = new URL(url!);
    expect(parsed.origin + parsed.pathname).toBe('https://www.inoreader.com/oauth2/auth');
    expect(parsed.searchParams.get('client_id')).toBe('app-id-x');
    expect(parsed.searchParams.get('redirect_uri')).toBe(env.INOREADER_REDIRECT_URI);
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('scope')).toBe('read');
    expect(parsed.searchParams.get('state')).toBe('state-nonce-abc');
  });

  it('returns null when INOREADER_APP_ID missing', () => {
    const incomplete: Env = { ...env, INOREADER_APP_ID: undefined };
    expect(buildAuthorizationUrl(incomplete, 'n')).toBeNull();
  });

  it('returns null when INOREADER_REDIRECT_URI missing', () => {
    const incomplete: Env = { ...env, INOREADER_REDIRECT_URI: undefined };
    expect(buildAuthorizationUrl(incomplete, 'n')).toBeNull();
  });
});

describe('exchangeAuthorizationCode — happy path', () => {
  it('POSTs to /oauth2/token with redirect_uri + grant_type=authorization_code (B2)', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'fresh-access',
          refresh_token: 'fresh-refresh',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 'read',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const result = await exchangeAuthorizationCode(env, 'inoreader-code-xyz');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.accessToken).toBe('fresh-access');
    expect(result.refreshToken).toBe('fresh-refresh');
    expect(result.expiresIn).toBe(3600);

    // Critical B2 audit assertion: redirect_uri is present in the POST body.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('inoreader-code-xyz');
    expect(body.get('redirect_uri')).toBe(env.INOREADER_REDIRECT_URI);
    expect(body.get('client_id')).toBe('app-id-x');
    expect(body.get('client_secret')).toBe('app-key-y');
  });

  it('records the egress under the oauth-refresh category', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'a',
          refresh_token: 'r',
          expires_in: 3600,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    await exchangeAuthorizationCode(env, 'code');
    expect(mockRecordEgress).toHaveBeenCalledWith(
      expect.objectContaining({
        env,
        category: 'oauth-refresh',
        status: 200,
        source: 'reauth-callback',
      })
    );
  });
});

describe('exchangeAuthorizationCode — failure shaping', () => {
  it('returns config-missing when redirect_uri unbound', async () => {
    const incomplete: Env = { ...env, INOREADER_REDIRECT_URI: undefined };
    const result = await exchangeAuthorizationCode(incomplete, 'c');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('config-missing');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns invalid-grant on 401 (Inoreader rejected the code)', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid_grant' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const result = await exchangeAuthorizationCode(env, 'bad-code');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('invalid-grant');
  });

  it('returns inoreader-error on 5xx', async () => {
    fetchSpy.mockResolvedValue(new Response('upstream blew up', { status: 503 }));
    const result = await exchangeAuthorizationCode(env, 'c');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('inoreader-error');
  });

  it('returns inoreader-error on network throw', async () => {
    fetchSpy.mockRejectedValue(new Error('connection reset'));
    const result = await exchangeAuthorizationCode(env, 'c');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('inoreader-error');
  });

  it('returns inoreader-error when response is missing access_token', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ refresh_token: 'only-this' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const result = await exchangeAuthorizationCode(env, 'c');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('inoreader-error');
  });
});
