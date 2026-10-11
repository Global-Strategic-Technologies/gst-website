/**
 * BL-033 Slice 2 — OAuth discovery-metadata integration tests.
 *
 * Boots the real Worker (unstable_dev, miniflare-local KV) and asserts
 * the two spec-mandated discovery documents the embedded AS serves:
 *   - RFC 8414 authorization-server metadata: S256-only PKCE advertised,
 *     NO registration_endpoint (DCR deliberately disabled — BL-033
 *     AC:243), CIMD advertised, scopes catalog present.
 *   - RFC 9728 protected-resource metadata: the one canonical resource
 *     (`<PUBLIC_ORIGIN>/mcp`, ADR-0044), served at exactly one path.
 * Plus the 401-challenge discovery pointer (resource_metadata) that
 * makes the flow self-describing for OAuth-capable clients, on every 401
 * for `/mcp` — and absent on `/radar/snapshot`, which is not an OAuth
 * resource.
 */

import { unstable_dev, type Unstable_DevWorker } from 'wrangler';
import { warmWorker } from '../helpers/warm-worker';

let worker: Unstable_DevWorker;

beforeAll(async () => {
  worker = await unstable_dev('src/worker.ts', {
    config: 'wrangler.toml',
    env: 'staging',
    local: true,
    experimental: { disableExperimentalWarning: true },
    vars: {
      MCP_KEY_RP: 'test-token-rp',
    },
  });

  // BL-149: pay the ~7.6s first-fetch cost inside this hook's 60s budget,
  // not in the first `it` under vitest's 5000ms default.
  await warmWorker(worker);
}, 60_000);

afterAll(async () => {
  await worker?.stop();
});

describe('RFC 8414 authorization-server metadata', () => {
  it('advertises S256-only PKCE, no DCR, CIMD, and the scope catalog', async () => {
    const res = await worker.fetch('/.well-known/oauth-authorization-server');
    expect(res.status).toBe(200);
    const meta = (await res.json()) as Record<string, unknown>;

    expect(meta.authorization_endpoint).toContain('/authorize');
    expect(meta.token_endpoint).toContain('/token');
    expect(meta.code_challenge_methods_supported).toEqual(['S256']);
    // DCR is disabled by design — the endpoint must not be advertised.
    expect(meta.registration_endpoint).toBeUndefined();
    expect(meta.client_id_metadata_document_supported).toBe(true);
    expect(meta.grant_types_supported).toContain('authorization_code');
    expect(meta.grant_types_supported).toContain('refresh_token');
    expect(meta.scopes_supported).toContain('tool:*');
    expect(meta.scopes_supported).toContain('resource:radar:read');
    expect(meta.scopes_supported).toContain('tool:radar:*');
  });
});

/** The harness origin — wrangler.toml `[env.staging.vars] PUBLIC_ORIGIN`. */
const PUBLIC_ORIGIN = 'https://mcp-staging.globalstrategic.tech';
const PRM_PATH = '/.well-known/oauth-protected-resource/mcp';

describe('RFC 9728 protected-resource metadata', () => {
  it('names the one canonical resource and its authorization server', async () => {
    const res = await worker.fetch(PRM_PATH);
    expect(res.status).toBe(200);
    const meta = (await res.json()) as Record<string, unknown>;
    // ADR-0044: the resource is the MCP endpoint on the configured origin.
    expect(meta.resource).toBe(`${PUBLIC_ORIGIN}/mcp`);
    expect(meta.authorization_servers).toEqual([PUBLIC_ORIGIN]);
  });

  it('serves the document at that path only', async () => {
    // RFC 9728 §3.3: an alias document would name a resource the client did
    // not ask about. The root path answered 200 before ADR-0044.
    for (const path of [
      '/.well-known/oauth-protected-resource',
      '/.well-known/oauth-protected-resource/radar/snapshot',
    ]) {
      const res = await worker.fetch(path);
      expect(res.status, path).toBe(404);
      await res.body?.cancel();
    }
  });

  it('the authorization-server metadata names the same resource', async () => {
    const res = await worker.fetch('/.well-known/oauth-authorization-server');
    const meta = (await res.json()) as Record<string, unknown>;
    expect(meta.issuer).toBe(PUBLIC_ORIGIN);
    expect(meta.protected_resources).toEqual([`${PUBLIC_ORIGIN}/mcp`]);
  });
});

describe('401 challenge discovery pointer', () => {
  // Path only: wrangler's dev proxy rewrites the upstream origin inside
  // RESPONSE HEADERS to its own local address, so the origin half of the
  // pointer is not observable here. It is the request origin gated to equal
  // PUBLIC_ORIGIN; `unit/oauth/consent-scopes.test.ts` pins the full string.
  const pointer = new RegExp(`resource_metadata="[^"]+${PRM_PATH}"$`);

  it('a presented-but-unknown bearer gets resource_metadata on the challenge', async () => {
    const res = await worker.fetch('/mcp', {
      method: 'POST',
      body: '{}',
      headers: { Authorization: 'Bearer definitely-not-a-valid-token' },
    });
    expect(res.status).toBe(401);
    const challenge = res.headers.get('www-authenticate') ?? '';
    expect(challenge).toMatch(/^Bearer realm="gst-mcp", error="invalid_token", /);
    expect(challenge).toMatch(pointer);
    // Legacy JSON body contract unchanged.
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('unauthorized');
  });

  it('a missing bearer gets the pointer too, without an error code', async () => {
    const res = await worker.fetch('/mcp', { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
    const challenge = res.headers.get('www-authenticate') ?? '';
    expect(challenge).toMatch(/^Bearer realm="gst-mcp", resource_metadata=/);
    expect(challenge).toMatch(pointer);
    await res.body?.cancel();
  });

  it('first contact walks from the 401 to the token endpoint', async () => {
    // What an OAuth client does with no prior knowledge: unauthenticated
    // request → pointer → resource metadata → authorization server → its
    // metadata. Every hop must resolve, or the login flow never starts.
    const first = await worker.fetch('/mcp', { method: 'POST', body: '{}' });
    await first.body?.cancel();
    const prmUrl = /resource_metadata="([^"]+)"/.exec(
      first.headers.get('www-authenticate') ?? ''
    )?.[1];
    expect(prmUrl).toBeDefined();

    const prm = await worker.fetch(new URL(prmUrl!).pathname);
    expect(prm.status).toBe(200);
    const { authorization_servers } = (await prm.json()) as { authorization_servers: string[] };
    const issuer = new URL(authorization_servers[0]!);

    const as = await worker.fetch(
      `${issuer.pathname.replace(/\/$/, '')}/.well-known/oauth-authorization-server`
    );
    expect(as.status).toBe(200);
    const meta = (await as.json()) as Record<string, string>;
    expect(meta.authorization_endpoint).toBe(`${PUBLIC_ORIGIN}/authorize`);
    expect(meta.token_endpoint).toBe(`${PUBLIC_ORIGIN}/token`);
  });

  it('/radar/snapshot is not an OAuth resource: bare challenge, our 401', async () => {
    // A wrong bearer here must reach OUR 401, not the provider's default
    // handler (which would answer 404) — and gets no discovery pointer.
    const attempts: Record<string, string>[] = [
      {},
      { Authorization: 'Bearer definitely-not-a-valid-token' },
    ];
    for (const headers of attempts) {
      const res = await worker.fetch('/radar/snapshot', { headers });
      expect(res.status).toBe(401);
      expect(res.headers.get('www-authenticate')).toBe('Bearer realm="gst-mcp"');
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('unauthorized');
    }
  });
});
