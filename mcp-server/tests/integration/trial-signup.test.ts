/**
 * BL-155 Slice 2 — `POST /trial/signup` wiring against the real Worker
 * (unstable_dev, miniflare KV).
 *
 * This environment binds NO Upstash and cannot intercept the outbound
 * Turnstile call, so the mint flow itself is proved in
 * `tests/unit/trial/signup.test.ts`. What only the real Worker can prove is
 * here: the route is reachable ahead of the auth gate, the method contract,
 * CORS on the public branch, and — the highest-value assertion in the slice
 * — that with everything ELSE bound and only Upstash absent, the endpoint
 * fails CLOSED: 503, and no trial record exists afterwards.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { unstable_dev, type Unstable_DevWorker } from 'wrangler';

const ADMIN_KEY = 'test-admin-key';
const ORIGIN = 'https://globalstrategic.tech';

let worker: Unstable_DevWorker;

beforeAll(async () => {
  worker = await unstable_dev('src/worker.ts', {
    config: 'wrangler.toml',
    env: 'staging',
    local: true,
    experimental: { disableExperimentalWarning: true },
    vars: {
      MCP_ADMIN_KEY: ADMIN_KEY,
      // Every trial dependency EXCEPT Upstash — so the 503 isolates that guard.
      TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
      TRIAL_IP_HMAC_SECRET: 'integration-hmac-secret',
      TURNSTILE_EXPECTED_HOSTNAMES: 'globalstrategic.tech',
    },
  });
}, 60_000);

afterAll(async () => {
  await worker?.stop();
});

describe('POST /trial/signup — wiring', () => {
  it('is routed ahead of the auth gate: GET is a 405 with Allow: POST, not a 401 or 404', async () => {
    const res = await worker.fetch('/trial/signup', { headers: { Origin: ORIGIN } });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  });

  it('a sibling path is still a 404', async () => {
    const res = await worker.fetch('/trial/nope', { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('answers a browser preflight from the website origin', async () => {
    const res = await worker.fetch('/trial/signup', {
      method: 'OPTIONS',
      headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('fails CLOSED with only Upstash unbound: 503, CORS-wrapped, no-store, and nothing minted', async () => {
    // miniflare's local KV persists across runs (other suites leave `trial`
    // records behind), so "nothing minted" is a before/after count, not zero.
    const trialCount = async () => {
      const list = await worker.fetch('/admin/oauth/m2m-clients', {
        headers: { Authorization: `Bearer ${ADMIN_KEY}` },
      });
      expect(list.status).toBe(200);
      const body = (await list.json()) as { clients: Array<{ name: string }> };
      return body.clients.filter((c) => c.name === 'trial').length;
    };
    const before = await trialCount();

    const res = await worker.fetch('/trial/signup', {
      method: 'POST',
      headers: {
        Origin: ORIGIN,
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '203.0.113.7',
      },
      body: JSON.stringify({ turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' }),
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: 'unavailable' });
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await trialCount()).toBe(before);
  });
});
