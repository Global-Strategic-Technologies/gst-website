/**
 * BL-033 Slice 2 — full authorization-code + PKCE flow, scripted
 * end-to-end against the real Worker (unstable_dev, miniflare KV):
 *
 *   admin-create client → GET /authorize (consent form + CSRF cookie)
 *   → POST consent with the test team key → 302 with code
 *   → POST /token (code + PKCE verifier) → access + refresh tokens
 *   → tools/list on /mcp with the access token (full pipeline)
 *   → refresh rotation → static-key dual-auth regression.
 *
 * The consent form's hidden auth_params field round-trips the original
 * query string; HTML entities are unescaped before re-submission (the
 * browser does this for real users).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { unstable_dev, type Unstable_DevWorker } from 'wrangler';
import { createHash, randomBytes } from 'node:crypto';

const TEST_KEY = 'test-token-rp';
const ADMIN_KEY = 'test-admin-key';
const REDIRECT_URI = 'http://localhost/callback';

let worker: Unstable_DevWorker;
let clientId: string;
let clientSecret: string;

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
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

beforeAll(async () => {
  worker = await unstable_dev('src/worker.ts', {
    config: 'wrangler.toml',
    env: 'staging',
    local: true,
    experimental: { disableExperimentalWarning: true },
    vars: {
      MCP_KEY_RP: TEST_KEY,
      MCP_ADMIN_KEY: ADMIN_KEY,
    },
  });

  // Pre-register the test client through the admin surface (the same
  // path the operator runbook uses).
  const created = await worker.fetch('/admin/oauth/clients', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ADMIN_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      clientName: 'Flow Test Client',
      redirectUris: [REDIRECT_URI],
      tokenEndpointAuthMethod: 'client_secret_post',
    }),
  });
  expect(created.status).toBe(201);
  const payload = (await created.json()) as {
    client: { clientId: string; clientSecret?: string };
  };
  clientId = payload.client.clientId;
  clientSecret = payload.client.clientSecret!;
  expect(clientId).toBeTruthy();
  expect(clientSecret).toBeTruthy();
}, 60_000);

afterAll(async () => {
  await worker?.stop();
});

describe('authorization-code + PKCE end-to-end', () => {
  let accessToken: string;
  let refreshToken: string;

  it('runs consent → code → token → authenticated tool call', async () => {
    // --- GET /authorize: consent form + CSRF cookie -------------------
    const authorizeQs = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      scope: 'tool:* resource:radar:read',
      state: 'flow-test-state',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    const formRes = await worker.fetch(`/authorize?${authorizeQs}`);
    expect(formRes.status).toBe(200);
    // Clickjacking defense on the consent surface.
    expect(formRes.headers.get('x-frame-options')).toBe('DENY');
    expect(formRes.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");

    const html = await formRes.text();
    const setCookie = formRes.headers.get('set-cookie') ?? '';
    const cookieMatch = setCookie.match(/mcp_oauth_consent=([A-Fa-f0-9]+)/);
    expect(cookieMatch).toBeTruthy();
    const nonceField = html.match(/name="nonce" value="([A-Fa-f0-9]+)"/);
    expect(nonceField).toBeTruthy();
    const paramsField = html.match(/name="auth_params" value="([^"]*)"/);
    expect(paramsField).toBeTruthy();
    // The double-submit pair must agree.
    expect(nonceField![1]).toBe(cookieMatch![1]);
    // The form names the client and describes requested scopes.
    expect(html).toContain('Flow Test Client');
    expect(html).toContain('tool:*');

    // --- POST /authorize: approve with the team key -------------------
    const consentBody = new URLSearchParams({
      auth_params: unescapeHtmlAttr(paramsField![1]!),
      nonce: nonceField![1]!,
      mcp_key: TEST_KEY,
      decision: 'approve',
    });
    const approveRes = await worker.fetch('/authorize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `mcp_oauth_consent=${cookieMatch![1]}`,
      },
      body: consentBody.toString(),
      redirect: 'manual',
    });
    expect(approveRes.status).toBe(302);
    const location = approveRes.headers.get('location') ?? '';
    expect(location.startsWith(REDIRECT_URI)).toBe(true);
    const redirectUrl = new URL(location);
    const code = redirectUrl.searchParams.get('code');
    expect(code).toBeTruthy();
    expect(redirectUrl.searchParams.get('state')).toBe('flow-test-state');

    // --- POST /token: exchange with PKCE verifier ---------------------
    const tokenRes = await worker.fetch('/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code!,
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        client_secret: clientSecret,
        code_verifier: codeVerifier,
      }).toString(),
    });
    expect(tokenRes.status).toBe(200);
    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      token_type: string;
      expires_in: number;
      scope?: string;
    };
    expect(tokens.access_token).toBeTruthy();
    expect(tokens.refresh_token).toBeTruthy();
    expect(tokens.token_type.toLowerCase()).toBe('bearer');
    // AC:246 — 1h access tokens.
    expect(tokens.expires_in).toBe(3600);
    accessToken = tokens.access_token;
    refreshToken = tokens.refresh_token!;

    // --- Authenticated MCP call with the OAuth token ------------------
    // NOTE: this env binds no Upstash, so the MCP handler itself 500s at
    // createServer's BL-076 guard for ANY caller (same constraint
    // auth.test.ts works under — its valid-key test asserts not-401).
    // The auth-layer proof here is: the OAuth token clears authentication
    // and reaches the handler. Depth (tools/list content) is covered by
    // the manual staging validation in the rollout phase.
    const mcpRes = await worker.fetch('/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    expect(mcpRes.status).not.toBe(401);
    expect(mcpRes.status).not.toBe(403);
  });

  it('rotates the refresh token', async () => {
    const refreshRes = await worker.fetch('/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });
    expect(refreshRes.status).toBe(200);
    const rotated = (await refreshRes.json()) as {
      access_token: string;
      refresh_token?: string;
    };
    expect(rotated.access_token).toBeTruthy();
    expect(rotated.access_token).not.toBe(accessToken);
    expect(rotated.refresh_token).toBeTruthy();
    // Rotation invalidates the pre-refresh access token — later tests
    // must use the rotated one.
    accessToken = rotated.access_token;

    // The rotated token must be immediately usable.
    const probe = await worker.fetch('/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/list', params: {} }),
    });
    expect(probe.status).not.toBe(401);
  });

  it('dual-auth parity: static key and OAuth token get identical downstream treatment', async () => {
    // Runs BEFORE any further consent rounds: completeAuthorization
    // revokes existing grants for the same user+client by default
    // (single-grant semantics — re-consent replaces old tokens), so the
    // token from the flow above only survives until the next consent.
    const request = (token: string) =>
      worker.fetch('/mcp', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
      });
    const staticRes = await request(TEST_KEY);
    const oauthRes = await request(accessToken);
    // Neither is rejected at the auth layer…
    expect(staticRes.status).not.toBe(401);
    expect(oauthRes.status).not.toBe(401);
    // …and both converge on the SAME downstream pipeline result (both
    // 200 in a fully-bound env; both the same BL-076 500 here — the
    // invariant is parity, which is exactly what dual-auth promises).
    expect(oauthRes.status).toBe(staticRes.status);
  });

  it('PKCE downgrade is rejected: token exchange without the verifier fails', async () => {
    // Mint a fresh code via a second consent round…
    const qs = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      scope: 'tool:*',
      state: 's2',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    const formRes = await worker.fetch(`/authorize?${qs}`);
    const html = await formRes.text();
    const cookie = (formRes.headers.get('set-cookie') ?? '').match(
      /mcp_oauth_consent=([A-Fa-f0-9]+)/
    )![1];
    const nonce = html.match(/name="nonce" value="([A-Fa-f0-9]+)"/)![1];
    const params = unescapeHtmlAttr(html.match(/name="auth_params" value="([^"]*)"/)![1]!);
    const approve = await worker.fetch('/authorize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `mcp_oauth_consent=${cookie}`,
      },
      body: new URLSearchParams({
        auth_params: params,
        nonce: nonce!,
        mcp_key: TEST_KEY,
        decision: 'approve',
      }).toString(),
      redirect: 'manual',
    });
    const code = new URL(approve.headers.get('location')!).searchParams.get('code')!;

    // …then try to redeem it with no code_verifier.
    const tokenRes = await worker.fetch('/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });
    expect(tokenRes.status).toBeGreaterThanOrEqual(400);
  });

  it('mismatched redirect_uri is rejected at authorize time (open-redirect defense)', async () => {
    const qs = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: 'https://evil.example/steal',
      scope: 'tool:*',
      state: 's3',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    const res = await worker.fetch(`/authorize?${qs}`, { redirect: 'manual' });
    // Must NOT redirect to the attacker URI with a code.
    expect(res.status).not.toBe(302);
  });

  it('consent POST with a wrong CSRF nonce is rejected', async () => {
    const qs = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      scope: 'tool:*',
      state: 's4',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    const formRes = await worker.fetch(`/authorize?${qs}`);
    const html = await formRes.text();
    const cookie = (formRes.headers.get('set-cookie') ?? '').match(
      /mcp_oauth_consent=([A-Fa-f0-9]+)/
    )![1];
    const params = unescapeHtmlAttr(html.match(/name="auth_params" value="([^"]*)"/)![1]!);
    const res = await worker.fetch('/authorize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `mcp_oauth_consent=${cookie}`,
      },
      body: new URLSearchParams({
        auth_params: params,
        nonce: 'deadbeefdeadbeefdeadbeefdeadbeef',
        mcp_key: TEST_KEY,
        decision: 'approve',
      }).toString(),
      redirect: 'manual',
    });
    expect(res.status).toBe(400);
  });
});
