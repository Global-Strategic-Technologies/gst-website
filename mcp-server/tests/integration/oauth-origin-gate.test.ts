/**
 * ADR-0044 — the OAuth surface exists on the configured public origin only.
 *
 * The `unstable_dev` harness pins ONE upstream host and scheme, so it can
 * never present an alias hostname, a cleartext request or an unbound
 * `PUBLIC_ORIGIN`. This suite invokes the Worker's fetch handler directly
 * (node pool, provider mocked as a spy) to cover exactly those:
 *   - OAuth-surface paths are 404 off-origin and never reach the provider;
 *   - token credentials (M2M JWT, OAuth access token) are honoured on the
 *     public origin only, and an OAuth token only on `/mcp`;
 *   - the discovery pointer rides every 401 for `/mcp` on the public origin
 *     and nothing else.
 * Static keys stay origin-agnostic (the pre-ADR behavior for every existing
 * consumer).
 */

vi.mock('@sentry/cloudflare', () => ({
  init: vi.fn(),
  captureMessage: vi.fn(),
  captureException: vi.fn(),
  setTag: vi.fn(),
  withSentry: (_opts: unknown, handler: unknown) => handler,
}));
vi.mock('agents/mcp', () => ({
  createMcpHandler: () => async () =>
    new Response('{"error":"mcp-mocked-in-this-test"}', { status: 501 }),
}));
// The library imports `cloudflare:workers`, which the node pool cannot
// resolve. The stand-in records every delegated request and answers the way
// the real provider does for a token it does not recognise.
const { providerFetch } = vi.hoisted(() => ({ providerFetch: vi.fn() }));
vi.mock('@cloudflare/workers-oauth-provider', () => ({
  OAuthProvider: class {
    fetch = providerFetch;
  },
}));
vi.mock('@upstash/redis', () => ({
  Redis: class {
    get = vi.fn();
    set = vi.fn();
    del = vi.fn();
    ttl = vi.fn();
  },
}));

import worker from '../../src/worker';
import type { Env } from '../../src/worker';
import { M2M_TOKEN_PREFIX, signM2mToken } from '../../src/oauth/m2m-token';

const PUBLIC = 'https://mcp.test';
const ALIAS = 'https://status.mcp.test';
const CLEARTEXT = 'http://mcp.test';
const SIGNING_KEY = 'unit-test-signing-key-32-bytes-xx';
const STATIC_KEY = 'test-static-token';

const env: Env = {
  PUBLIC_ORIGIN: PUBLIC,
  MCP_KEY_RP: STATIC_KEY,
  OAUTH_M2M_SIGNING_KEY: SIGNING_KEY,
};
const envUnbound: Env = { MCP_KEY_RP: STATIC_KEY, OAUTH_M2M_SIGNING_KEY: SIGNING_KEY };

const stubCtx = {
  waitUntil: () => undefined,
  passThroughOnException: () => undefined,
} as unknown as ExecutionContext;

/** Each non-public arrangement, as [label, origin, env]. */
const OFF_ORIGIN: ReadonlyArray<readonly [string, string, Env]> = [
  ['alias hostname', ALIAS, env],
  ['cleartext http', CLEARTEXT, env],
  ['PUBLIC_ORIGIN unbound', PUBLIC, envUnbound],
];

const SURFACE_PATHS = [
  '/authorize',
  '/token',
  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-protected-resource/mcp',
  '/admin/oauth/clients',
  '/oauth/introspect',
];

function call(origin: string, path: string, e: Env, init: RequestInit = {}) {
  return worker.fetch!(new Request(`${origin}${path}`, init) as never, e, stubCtx);
}

function bearer(token: string): RequestInit {
  return { method: 'POST', body: '{}', headers: { Authorization: `Bearer ${token}` } };
}

/** An M2M token exactly as `/token` on the public origin would mint it. */
async function m2mToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return signM2mToken(
    {
      iss: PUBLIC,
      sub: 'm2m_abc',
      aud: `${PUBLIC}/mcp`,
      scope: 'tool:*',
      keyOwner: 'M2M:ACME',
      exp: now + 3600,
      iat: now,
      jti: 'jti-1',
    },
    SIGNING_KEY
  );
}

beforeEach(() => {
  providerFetch.mockReset();
  providerFetch.mockResolvedValue(new Response('{"error":"invalid_token"}', { status: 401 }));
});

describe('OAuth surface paths', () => {
  it('are delegated to the provider on the public origin', async () => {
    providerFetch.mockResolvedValue(new Response('{}', { status: 200 }));
    for (const path of SURFACE_PATHS) {
      const res = await call(PUBLIC, path, env);
      expect(res.status, path).toBe(200);
    }
    expect(providerFetch).toHaveBeenCalledTimes(SURFACE_PATHS.length);
  });

  it.each(OFF_ORIGIN)('are 404 and never reach the provider: %s', async (_label, origin, e) => {
    for (const path of SURFACE_PATHS) {
      const res = await call(origin, path, e);
      expect(res.status, path).toBe(404);
    }
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it.each(OFF_ORIGIN)('mint no client_credentials token: %s', async (_label, origin, e) => {
    const res = await call(origin, '/token', e, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials&client_id=m2m_abc&client_secret=x',
    });
    expect(res.status).toBe(404);
  });
});

describe('token credentials', () => {
  it('an M2M token authenticates on the public origin', async () => {
    const token = await m2mToken();
    expect(token.startsWith(M2M_TOKEN_PREFIX)).toBe(true);
    const res = await call(PUBLIC, '/mcp', env, bearer(token));
    // Past authentication: the mocked MCP handler (or the pipeline in front
    // of it) answered, not the 401 challenge.
    expect(res.status).not.toBe(401);
    // Ours by prefix — never offered to the provider.
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it.each(OFF_ORIGIN)('the same M2M token is refused: %s', async (_label, origin, e) => {
    const res = await call(origin, '/mcp', e, bearer(await m2mToken()));
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toBe('Bearer realm="gst-mcp"');
  });

  it('an unknown bearer on /mcp is offered to the provider on the public origin', async () => {
    const res = await call(PUBLIC, '/mcp', env, bearer('opaque-oauth-token'));
    expect(providerFetch).toHaveBeenCalledTimes(1);
    // The provider did not recognise it → OUR 401, not the provider's.
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized', message: 'Invalid Bearer token' });
  });

  it('an unknown bearer on /radar/snapshot is never offered to the provider', async () => {
    // Not an OAuth resource: delegating would land in the provider's default
    // handler and answer 404 instead of our 401.
    const res = await call(PUBLIC, '/radar/snapshot', env, {
      headers: { Authorization: 'Bearer opaque-oauth-token' },
    });
    expect(providerFetch).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toBe('Bearer realm="gst-mcp"');
  });

  it.each(OFF_ORIGIN)('an unknown bearer is never offered: %s', async (_label, origin, e) => {
    const res = await call(origin, '/mcp', e, bearer('opaque-oauth-token'));
    expect(providerFetch).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
  });

  it.each(OFF_ORIGIN)('a static key still authenticates: %s', async (_label, origin, e) => {
    const res = await call(origin, '/mcp', e, bearer(STATIC_KEY));
    expect(res.status).not.toBe(401);
  });
});

describe('discovery pointer on the 401', () => {
  const pointer = `resource_metadata="${PUBLIC}/.well-known/oauth-protected-resource/mcp"`;

  it('rides every 401 for /mcp on the public origin', async () => {
    const noBearer = await call(PUBLIC, '/mcp', env, { method: 'POST', body: '{}' });
    expect(noBearer.headers.get('WWW-Authenticate')).toBe(`Bearer realm="gst-mcp", ${pointer}`);

    const badBearer = await call(PUBLIC, '/mcp', env, bearer('opaque-oauth-token'));
    expect(badBearer.headers.get('WWW-Authenticate')).toBe(
      `Bearer realm="gst-mcp", error="invalid_token", ${pointer}`
    );
  });

  it.each(OFF_ORIGIN)('is absent: %s', async (_label, origin, e) => {
    const res = await call(origin, '/mcp', e, { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toBe('Bearer realm="gst-mcp"');
  });
});
