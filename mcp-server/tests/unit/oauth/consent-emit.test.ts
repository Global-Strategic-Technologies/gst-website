/**
 * BL-152 — the consent page's approve branch emits ONE `oauth_consent`
 * Analytics Engine event (the connector directory's attribution number), and
 * the deny branch emits none. The Worker-lane OAuth tests cannot see the
 * datapoint (the local AE binding is a no-op), so the handler is driven here
 * with a stubbed provider, a Map-backed KV, and a spy binding.
 */
import { describe, expect, it, vi } from 'vitest';
import { handleAuthorizePost } from '../../../src/oauth/consent';

const NONCE = 'abcdef0123456789';
const NONCE_KEY_PREFIX = 'mcp:oauth:consent-nonce:';

function fakeKv(seed: Record<string, string>) {
  const store = new Map(Object.entries(seed));
  return {
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    put: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
    delete: vi.fn(async (k: string) => {
      store.delete(k);
    }),
  };
}

function makeEnv() {
  const writeDataPoint = vi.fn();
  const env = {
    MCP_KEY_RP: 'roster-token',
    OAUTH_KV: fakeKv({ [`${NONCE_KEY_PREFIX}${NONCE}`]: '1' }),
    METRICS: { writeDataPoint },
    OAUTH_PROVIDER: {
      parseAuthRequest: vi.fn(async () => ({
        clientId: 'client-1',
        redirectUri: 'https://client.example/cb',
        scope: ['tool:*'],
        state: 's',
        responseType: 'code',
        codeChallenge: 'c',
        codeChallengeMethod: 'S256',
      })),
      lookupClient: vi.fn(async () => ({
        clientId: 'client-1',
        clientName: 'Test client',
        redirectUris: ['https://client.example/cb'],
      })),
      completeAuthorization: vi.fn(async () => ({
        redirectTo: 'https://client.example/cb?code=xyz',
      })),
    },
  };
  return { env, writeDataPoint };
}

function post(decision: 'approve' | 'deny', key = 'roster-token'): Request {
  const body = new URLSearchParams({
    auth_params: '?response_type=code&client_id=client-1',
    nonce: NONCE,
    decision,
    mcp_key: key,
  });
  return new Request('https://mcp.example/authorize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: `mcp_oauth_consent=${NONCE}`,
    },
    body: body.toString(),
  });
}

describe('oauth_consent emission (BL-152)', () => {
  it('approve emits exactly one oauth_consent/approved datapoint with the bounded keyOwner', async () => {
    const { env, writeDataPoint } = makeEnv();
    const res = await handleAuthorizePost(post('approve'), env as never);
    expect(res.status).toBe(302);
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
    const dp = writeDataPoint.mock.calls[0][0] as { blobs: string[]; indexes: string[] };
    // blob1 = event_type, blob2 = name, blob4 = outcome (metrics/_schema.ts)
    expect(dp.blobs[0]).toBe('oauth_consent');
    expect(dp.blobs[1]).toBe('consent');
    expect(dp.blobs[3]).toBe('approved');
    expect(dp.indexes[0]).toBe('OAUTH:RP');
  });

  it('deny emits nothing', async () => {
    const { env, writeDataPoint } = makeEnv();
    const res = await handleAuthorizePost(post('deny'), env as never);
    expect(res.status).toBe(302);
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  it('an unrecognised key emits nothing (401 re-render)', async () => {
    const { env, writeDataPoint } = makeEnv();
    const res = await handleAuthorizePost(post('approve', 'wrong'), env as never);
    expect(res.status).toBe(401);
    expect(writeDataPoint).not.toHaveBeenCalled();
    expect(await res.text()).toContain('https://globalstrategic.tech/hub/mcp/trial/');
  });
});
