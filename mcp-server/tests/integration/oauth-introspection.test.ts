/**
 * BL-033 Slice 2 — RFC 7662 introspection integration tests: admin
 * gate, M2M-token dispatch with the revocation cross-check (a deleted
 * client's still-valid-signature token reports inactive), and the
 * no-oracle contract (every token-shaped failure is active:false, 200).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { unstable_dev, type Unstable_DevWorker } from 'wrangler';

const ADMIN_KEY = 'test-admin-key';
const SIGNING_KEY = 'integration-test-m2m-signing-key';

let worker: Unstable_DevWorker;

beforeAll(async () => {
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
}, 60_000);

afterAll(async () => {
  await worker?.stop();
});

async function createM2m(name: string): Promise<{ clientId: string; clientSecret: string }> {
  const created = await worker.fetch('/admin/oauth/m2m-clients', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, allowedScopes: ['tool:*'] }),
  });
  const payload = (await created.json()) as {
    client: { clientId: string };
    clientSecret: string;
  };
  return { clientId: payload.client.clientId, clientSecret: payload.clientSecret };
}

async function issueToken(clientId: string, clientSecret: string): Promise<string> {
  const res = await worker.fetch('/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });
  return ((await res.json()) as { access_token: string }).access_token;
}

function introspect(token: string, auth = ADMIN_KEY) {
  return worker.fetch('/oauth/introspect', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ token }).toString(),
  });
}

describe('POST /oauth/introspect', () => {
  it('requires the admin key (401 without it)', async () => {
    const res = await introspect('anything', 'not-the-admin-key');
    expect(res.status).toBe(401);
  });

  it('reports an active M2M token with its claims', async () => {
    const { clientId, clientSecret } = await createM2m('introspect-live');
    const token = await issueToken(clientId, clientSecret);
    const res = await introspect(token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.active).toBe(true);
    expect(body.client_id).toBe(clientId);
    expect(body.scope).toBe('tool:*');
    expect(typeof body.exp).toBe('number');
  });

  it("a revoked client's still-valid token reports inactive (cross-check)", async () => {
    const { clientId, clientSecret } = await createM2m('introspect-revoked');
    const token = await issueToken(clientId, clientSecret);
    const del = await worker.fetch(`/admin/oauth/m2m-clients/${clientId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ADMIN_KEY}` },
    });
    expect(del.status).toBe(200);
    const res = await introspect(token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { active: boolean };
    // Signature still verifies (≤1h residual) — the record cross-check
    // is what reports the truth.
    expect(body.active).toBe(false);
  });

  it('unknown/garbage tokens report inactive with 200 (no oracle)', async () => {
    for (const garbage of ['mcp_m2m_not.a.jwt', 'random-string', '']) {
      const res = await introspect(garbage);
      expect(res.status).toBe(200);
      expect(((await res.json()) as { active: boolean }).active).toBe(false);
    }
  });
});
