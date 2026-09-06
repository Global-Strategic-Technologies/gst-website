/**
 * BL-155 Slice 2b — a KV client record presented at the CONSENT door,
 * end-to-end against the real Worker (unstable_dev, miniflare KV):
 *
 *   admin-create a trial M2M record → GET /authorize → POST consent with
 *   `mcp_key = <clientId>:<secret>` → 302 with code → POST /token → access +
 *   refresh (the exchange callback ran through the real library) →
 *   tools/call search_radar → JSON-RPC -32002 (tier gate) → tools/list not
 *   refused → refresh rotates → negative space: wrong secret / fabricated
 *   id produce the SAME response as a wrong roster key; an expired record
 *   is refused at consent; a record about to expire yields a clamped token.
 *
 * The roster consent flow itself is `oauth-flow.test.ts`, untouched — its
 * staying green is the byte-for-byte regression guard for this slice.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Buffer } from 'node:buffer';
import { unstable_dev, type Unstable_DevWorker } from 'wrangler';
import { createHash, randomBytes } from 'node:crypto';

const TEST_KEY = 'test-token-rp';
const ADMIN_KEY = 'test-admin-key';
const REDIRECT_URI = 'http://localhost/callback';

let worker: Unstable_DevWorker;
let oauthClientId: string;
let oauthClientSecret: string;

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}
const codeVerifier = b64url(randomBytes(32));
const codeChallenge = b64url(createHash('sha256').update(codeVerifier).digest());

function unescapeHtmlAttr(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function createTrialRecord(expiresAt: string): Promise<{ credential: string }> {
  const created = await worker.fetch('/admin/oauth/m2m-clients', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'trial',
      allowedScopes: ['tool:*'],
      tier: 'trial',
      expiresAt,
    }),
  });
  expect(created.status).toBe(201);
  const payload = (await created.json()) as { client: { clientId: string }; clientSecret: string };
  return { credential: `${payload.client.clientId}:${payload.clientSecret}` };
}

/** GET /authorize and return everything a consent POST needs. */
async function openConsent(state: string) {
  const qs = new URLSearchParams({
    response_type: 'code',
    client_id: oauthClientId,
    redirect_uri: REDIRECT_URI,
    scope: 'tool:*',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  const formRes = await worker.fetch(`/authorize?${qs}`);
  expect(formRes.status).toBe(200);
  const html = await formRes.text();
  const cookie = (formRes.headers.get('set-cookie') ?? '').match(
    /mcp_oauth_consent=([A-Fa-f0-9]+)/
  )![1]!;
  const nonce = html.match(/name="nonce" value="([A-Fa-f0-9]+)"/)![1]!;
  const params = unescapeHtmlAttr(html.match(/name="auth_params" value="([^"]*)"/)![1]!);
  return { cookie, nonce, params };
}

async function postConsent(mcpKey: string, state: string) {
  const { cookie, nonce, params } = await openConsent(state);
  return worker.fetch('/authorize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: `mcp_oauth_consent=${cookie}`,
    },
    body: new URLSearchParams({
      auth_params: params,
      nonce,
      mcp_key: mcpKey,
      decision: 'approve',
    }).toString(),
    redirect: 'manual',
  });
}

async function exchangeCode(code: string) {
  const tokenRes = await worker.fetch('/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: oauthClientId,
      client_secret: oauthClientSecret,
      code_verifier: codeVerifier,
    }).toString(),
  });
  expect(tokenRes.status).toBe(200);
  return (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
}

function mcpCall(token: string, body: unknown) {
  return worker.fetch('/mcp', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  worker = await unstable_dev('src/worker.ts', {
    config: 'wrangler.toml',
    env: 'staging',
    local: true,
    experimental: { disableExperimentalWarning: true },
    vars: { MCP_KEY_RP: TEST_KEY, MCP_ADMIN_KEY: ADMIN_KEY },
  });
  const created = await worker.fetch('/admin/oauth/clients', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientName: 'Trial Consent Test Client',
      redirectUris: [REDIRECT_URI],
      tokenEndpointAuthMethod: 'client_secret_post',
    }),
  });
  expect(created.status).toBe(201);
  const payload = (await created.json()) as { client: { clientId: string; clientSecret?: string } };
  oauthClientId = payload.client.clientId;
  oauthClientSecret = payload.client.clientSecret!;
}, 60_000);

afterAll(async () => {
  await worker?.stop();
});

describe('trial credential at the consent page', () => {
  let accessToken: string;
  let refreshToken: string;

  it('consents with <clientId>:<secret>, exchanges the code, and is refused radar by tier', async () => {
    const { credential } = await createTrialRecord(
      new Date(Date.now() + 72 * 3600_000).toISOString()
    );
    const approve = await postConsent(credential, 'trial-1');
    expect(approve.status).toBe(302);
    const code = new URL(approve.headers.get('location')!).searchParams.get('code');
    expect(code).toBeTruthy();

    const tokens = await exchangeCode(code!);
    expect(tokens.refresh_token).toBeTruthy();
    expect(tokens.expires_in).toBeLessThanOrEqual(3600);
    accessToken = tokens.access_token;
    refreshToken = tokens.refresh_token!;

    // Tier gate: a legible JSON-RPC refusal, not a transport error, and the
    // request id is echoed so the client can correlate it.
    const radar = await mcpCall(accessToken, {
      jsonrpc: '2.0',
      id: 'radar-1',
      method: 'tools/call',
      params: { name: 'search_radar', arguments: {} },
    });
    expect(radar.status).toBe(200);
    const body = (await radar.json()) as { id: unknown; error?: { code: number; data?: unknown } };
    expect(body.id).toBe('radar-1');
    expect(body.error?.code).toBe(-32002);
    expect(body.error?.data).toMatchObject({ missingScope: 'tool:radar:*' });

    // Everything else clears auth + the gate (same BL-076 caveat as the flow
    // suite: the handler itself needs Upstash, so the proof is "not refused").
    const list = await mcpCall(accessToken, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });
    expect(list.status).not.toBe(401);
    expect(list.status).not.toBe(403);
    const listBody = await list.text();
    expect(listBody).not.toContain('-32002');
  });

  it('refreshes through the exchange callback (the refresh branch returns a clamped access TTL)', async () => {
    const refreshRes = await worker.fetch('/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: oauthClientId,
        client_secret: oauthClientSecret,
      }).toString(),
    });
    expect(refreshRes.status).toBe(200);
    const rotated = (await refreshRes.json()) as { access_token: string; expires_in: number };
    expect(rotated.access_token).not.toBe(accessToken);
    expect(rotated.expires_in).toBeLessThanOrEqual(3600);
  });

  it('a record about to expire yields tokens clamped to its remaining life (auth-code clamp reached the library)', async () => {
    const { credential } = await createTrialRecord(new Date(Date.now() + 90_000).toISOString());
    const approve = await postConsent(credential, 'trial-clamp');
    expect(approve.status).toBe(302);
    const code = new URL(approve.headers.get('location')!).searchParams.get('code')!;
    const tokens = await exchangeCode(code);
    expect(tokens.expires_in).toBeGreaterThanOrEqual(60);
    expect(tokens.expires_in).toBeLessThanOrEqual(90);
  });

  it('an expired record is refused at consent', async () => {
    const { credential } = await createTrialRecord(new Date(Date.now() - 60_000).toISOString());
    const res = await postConsent(credential, 'trial-expired');
    expect(res.status).toBe(401);
  });

  it('is not a namespace oracle: wrong secret, fabricated id and wrong roster key are indistinguishable', async () => {
    const { credential } = await createTrialRecord(new Date(Date.now() + 3600_000).toISOString());
    const [id] = credential.split(':');
    // Same `state` for all three so the echoed auth_params compare equal.
    const responses = await Promise.all([
      postConsent(`${id}:wrong-secret`, 'oracle'),
      postConsent('m2m_does-not-exist:whatever', 'oracle'),
      postConsent('wrong-roster-key', 'oracle'),
    ]);
    const shapes = await Promise.all(
      responses.map(async (r) => ({
        status: r.status,
        // Strip the per-response CSRF nonce so the bodies compare byte-for-byte.
        body: (await r.text()).replace(/name="nonce" value="[A-Fa-f0-9]+"/, 'name="nonce"'),
      }))
    );
    expect(shapes[0]!.status).toBe(401);
    expect(shapes[1]).toEqual(shapes[0]);
    expect(shapes[2]).toEqual(shapes[0]);
  });
});
