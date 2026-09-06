/**
 * BL-033 Slice 2 — M2M client_credentials integration tests against the
 * real Worker (unstable_dev, miniflare KV): admin-create an M2M client,
 * exchange via client_secret_post AND private_key_jwt, use the token on
 * /mcp, and verify the negative space (scope escalation refused, no
 * refresh token, jti replay rejected, deleted client can't re-issue).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Buffer } from 'node:buffer';
import { unstable_dev, type Unstable_DevWorker } from 'wrangler';

const ADMIN_KEY = 'test-admin-key';
const SIGNING_KEY = 'integration-test-m2m-signing-key';

let worker: Unstable_DevWorker;
let clientId: string;
let clientSecret: string;
let privateKey: CryptoKey;

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  privateKey = pair.privateKey;
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);

  worker = await unstable_dev('src/worker.ts', {
    config: 'wrangler.toml',
    env: 'staging',
    local: true,
    experimental: { disableExperimentalWarning: true },
    vars: {
      MCP_KEY_RP: 'test-token-rp',
      MCP_ADMIN_KEY: ADMIN_KEY,
      OAUTH_M2M_SIGNING_KEY: SIGNING_KEY,
    },
  });

  const created = await worker.fetch('/admin/oauth/m2m-clients', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'acme-pipeline',
      allowedScopes: ['tool:*', 'resource:regulations:read'],
      tier: 'free-pilot',
      jwks: { keys: [publicJwk] },
    }),
  });
  expect(created.status).toBe(201);
  const payload = (await created.json()) as {
    client: { clientId: string };
    clientSecret: string;
  };
  clientId = payload.client.clientId;
  clientSecret = payload.clientSecret;
}, 60_000);

afterAll(async () => {
  await worker?.stop();
});

async function mintAssertion(payload: Record<string, unknown>): Promise<string> {
  // `Uint8Array` alone — `Buffer` extends it, and a bare `Buffer` in type
  // position is banned even when imported (see eslint.config.mjs).
  const b64url = (b: Uint8Array) => Buffer.from(b).toString('base64url');
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })));
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(`${header}.${body}`)
  );
  return `${header}.${body}.${b64url(new Uint8Array(sig))}`;
}

describe('client_credentials — client_secret_post', () => {
  it('issues a scoped 1h token with no refresh_token, usable on /mcp', async () => {
    const res = await worker.fetch('/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'tool:search_portfolio',
      }).toString(),
    });
    expect(res.status).toBe(200);
    const tokens = (await res.json()) as {
      access_token: string;
      token_type: string;
      expires_in: number;
      scope: string;
      refresh_token?: string;
    };
    expect(tokens.access_token.startsWith('mcp_m2m_')).toBe(true);
    expect(tokens.expires_in).toBe(3600);
    expect(tokens.scope).toBe('tool:search_portfolio');
    // Per the MCP client-credentials extension: no refresh token.
    expect(tokens.refresh_token).toBeUndefined();

    const mcpRes = await worker.fetch('/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    // Auth cleared (BL-076 Upstash constraint applies to the handler
    // itself in this env — same convention as the flow suite).
    expect(mcpRes.status).not.toBe(401);
    expect(mcpRes.status).not.toBe(403);
  });

  it('rejects a wrong secret', async () => {
    const res = await worker.fetch('/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: 'wrong-secret',
      }).toString(),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_client');
  });

  it('refuses scope escalation beyond allowedScopes', async () => {
    const res = await worker.fetch('/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'resource:radar:read',
      }).toString(),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_scope');
  });

  it('a radar-scoped call with a non-radar M2M token is denied by scope gating', async () => {
    const issue = await worker.fetch('/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });
    const { access_token } = (await issue.json()) as { access_token: string };
    // /radar/snapshot requires resource:radar:read — this client's
    // allowedScopes deliberately exclude it.
    const res = await worker.fetch('/radar/snapshot', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { missingScope: string };
    expect(body.missingScope).toBe('resource:radar:read');
  });

  it('validates RFC 8707 resource when present', async () => {
    const res = await worker.fetch('/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        resource: 'https://not-this-server.example/mcp',
      }).toString(),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_target');
  });
});

describe('client_credentials — private_key_jwt (RFC 7523)', () => {
  const now = () => Math.floor(Date.now() / 1000);
  // The assertion audience must name THIS AS — the Worker checks it
  // against the request origin, which under unstable_dev is the
  // wrangler.toml staging route hostname (NOT the local dev address;
  // verified empirically — miniflare applies the custom-domain route).
  const devOrigin = () => 'http://mcp-staging.globalstrategic.tech';

  it('issues a token from a valid client assertion (no secret on the wire)', async () => {
    const assertion = await mintAssertion({
      iss: clientId,
      sub: clientId,
      aud: `${devOrigin()}/token`,
      iat: now(),
      exp: now() + 120,
      jti: `jti-${Date.now()}`,
    });
    const res = await worker.fetch('/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: assertion,
      }).toString(),
    });
    if (res.status !== 200) {
      // Surface the error branch for diagnosis before the assertion fires.
      console.error('private_key_jwt issuance failed:', res.status, await res.clone().text());
    }
    expect(res.status).toBe(200);
    const tokens = (await res.json()) as { access_token: string; scope: string };
    expect(tokens.access_token.startsWith('mcp_m2m_')).toBe(true);
    // No scope param → full allowedScopes grant.
    expect(tokens.scope).toContain('tool:*');
  });

  it('rejects a replayed assertion (jti one-shot)', async () => {
    const assertion = await mintAssertion({
      iss: clientId,
      sub: clientId,
      aud: `${devOrigin()}/token`,
      iat: now(),
      exp: now() + 120,
      jti: 'replay-me-once',
    });
    const send = () =>
      worker.fetch('/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
          client_assertion: assertion,
        }).toString(),
      });
    const first = await send();
    expect(first.status).toBe(200);
    const second = await send();
    expect(second.status).toBe(401);
    const body = (await second.json()) as { error_description: string };
    expect(body.error_description).toMatch(/replayed/i);
  });
});

describe('revocation semantics', () => {
  it('a deleted client cannot re-issue tokens', async () => {
    // Create a disposable client, delete it, then attempt issuance.
    const created = await worker.fetch('/admin/oauth/m2m-clients', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ADMIN_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'doomed', allowedScopes: ['tool:*'] }),
    });
    const payload = (await created.json()) as {
      client: { clientId: string };
      clientSecret: string;
    };
    const del = await worker.fetch(`/admin/oauth/m2m-clients/${payload.client.clientId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ADMIN_KEY}` },
    });
    expect(del.status).toBe(200);

    const res = await worker.fetch('/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: payload.client.clientId,
        client_secret: payload.clientSecret,
      }).toString(),
    });
    expect(res.status).toBe(401);
  });

  it('admin surface requires the admin key', async () => {
    const res = await worker.fetch('/admin/oauth/m2m-clients', {
      headers: { Authorization: 'Bearer not-the-admin-key' },
    });
    expect(res.status).toBe(401);
  });
});

// BL-155 Slice 1 — time-boxed clients and in-place mutation.
describe('client expiry and PATCH (BL-155)', () => {
  const adminHeaders = {
    Authorization: `Bearer ${ADMIN_KEY}`,
    'Content-Type': 'application/json',
  };

  async function createClient(body: Record<string, unknown>) {
    const res = await worker.fetch('/admin/oauth/m2m-clients', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(201);
    return (await res.json()) as { client: { clientId: string }; clientSecret: string };
  }

  function mintToken(clientId: string, clientSecret: string) {
    return worker.fetch('/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });
  }

  it('a client with a future expiresAt still issues tokens', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { client, clientSecret } = await createClient({
      name: 'trial-live',
      allowedScopes: ['tool:*'],
      tier: 'trial',
      expiresAt: future,
    });
    const res = await mintToken(client.clientId, clientSecret);
    expect(res.status).toBe(200);
  });

  it('a client past its expiresAt is refused, and says why', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const { client, clientSecret } = await createClient({
      name: 'trial-lapsed',
      allowedScopes: ['tool:*'],
      tier: 'trial',
      expiresAt: past,
    });
    const res = await mintToken(client.clientId, clientSecret);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string; error_description: string };
    expect(body.error).toBe('invalid_client');
    expect(body.error_description).toMatch(/expired/i);
  });

  it('expiry is checked AFTER auth — a bad secret on an expired client reports auth failure, not expiry', async () => {
    // Placement guard: checking expiry beside the record fetch would let an
    // unauthenticated caller probe which client ids exist and when they lapse.
    const past = new Date(Date.now() - 1000).toISOString();
    const { client } = await createClient({
      name: 'trial-probe',
      allowedScopes: ['tool:*'],
      tier: 'trial',
      expiresAt: past,
    });
    const res = await mintToken(client.clientId, 'wrong-secret');
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error_description: string };
    expect(body.error_description).not.toMatch(/expired/i);
  });

  it('a client with no expiresAt never expires (pre-BL-155 records keep working)', async () => {
    const { client, clientSecret } = await createClient({
      name: 'permanent',
      allowedScopes: ['tool:*'],
    });
    const res = await mintToken(client.clientId, clientSecret);
    expect(res.status).toBe(200);
  });

  it('PATCH changes the tier in place, keeping the same credentials', async () => {
    const { client, clientSecret } = await createClient({
      name: 'to-convert',
      allowedScopes: ['tool:*'],
      tier: 'trial',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    const patched = await worker.fetch(`/admin/oauth/m2m-clients/${client.clientId}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ tier: 'paid', expiresAt: null }),
    });
    expect(patched.status).toBe(200);
    const updated = (await patched.json()) as { tier: string; expiresAt?: string };
    expect(updated.tier).toBe('paid');
    // Conversion clears the expiry — and with it the reap, which is derived.
    expect(updated.expiresAt).toBeUndefined();

    // The whole point: the original secret still works after the change.
    const res = await mintToken(client.clientId, clientSecret);
    expect(res.status).toBe(200);
  });

  it('PATCH never returns the secret hash', async () => {
    const { client } = await createClient({ name: 'no-leak', allowedScopes: ['tool:*'] });
    const patched = await worker.fetch(`/admin/oauth/m2m-clients/${client.clientId}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ tier: 'paid' }),
    });
    const body = (await patched.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty('secretHash');
  });

  it('PATCH rejects an unassignable tier, an unknown scope, and an empty patch', async () => {
    const { client } = await createClient({ name: 'validate-me', allowedScopes: ['tool:*'] });
    const url = `/admin/oauth/m2m-clients/${client.clientId}`;

    const badTier = await worker.fetch(url, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ tier: 'platinum' }),
    });
    expect(badTier.status).toBe(400);

    // Stricter than POST, which accepts any non-empty array.
    const badScope = await worker.fetch(url, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ allowedScopes: ['tool:*', 'not:a:real:scope'] }),
    });
    expect(badScope.status).toBe(400);

    const empty = await worker.fetch(url, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({}),
    });
    expect(empty.status).toBe(400);
  });

  it('PATCH on an unknown client is 404, and requires the admin key', async () => {
    const notFound = await worker.fetch('/admin/oauth/m2m-clients/m2m_does_not_exist', {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ tier: 'paid' }),
    });
    expect(notFound.status).toBe(404);

    const unauthed = await worker.fetch('/admin/oauth/m2m-clients/m2m_whatever', {
      method: 'PATCH',
      headers: { Authorization: 'Bearer nope', 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: 'paid' }),
    });
    expect(unauthed.status).toBe(401);
  });

  it('the item route advertises DELETE and PATCH on an unsupported method', async () => {
    const res = await worker.fetch('/admin/oauth/m2m-clients/m2m_whatever', {
      method: 'PUT',
      headers: adminHeaders,
      body: '{}',
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('DELETE, PATCH');
  });
});
