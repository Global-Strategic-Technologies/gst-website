/**
 * Bearer-token auth — Phase 2 integration tests.
 *
 * Boots the Worker via `unstable_dev` with a single synthetic key
 * (`MCP_KEY_RP=test-token-rp`) bound through `vars` (wrangler dev's
 * local-only env mechanism — equivalent to `wrangler secret put`
 * for production).
 *
 * Covers:
 *   - GET /health: no auth required (regression check on the Phase 1
 *     behavior carrying through Phase 2)
 *   - POST /mcp WITHOUT Authorization → 401 + WWW-Authenticate
 *   - POST /mcp WITH wrong scheme → 401
 *   - POST /mcp WITH wrong token → 401
 *   - POST /mcp WITH empty token → 401
 *   - POST /mcp WITH valid token → reaches MCP handler (4xx structured
 *     error from the MCP layer is fine; the point is auth was passed)
 *
 * Architecture: src/docs/development/MCP_SERVER_REMOTE_BL-032.md
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { unstable_dev, type UnstableDevWorker } from 'wrangler';

const TEST_KEY = 'test-token-rp';

let worker: UnstableDevWorker;

beforeAll(async () => {
  worker = await unstable_dev('src/worker.ts', {
    config: 'wrangler.toml',
    env: 'staging',
    local: true,
    experimental: { disableExperimentalWarning: true },
    vars: {
      MCP_KEY_RP: TEST_KEY,
    },
  });
}, 60_000);

afterAll(async () => {
  await worker?.stop();
});

describe('bearer-token auth — Phase 2', () => {
  it('GET /health requires no auth', async () => {
    const res = await worker.fetch('/health');
    expect(res.status).toBe(200);
  });

  it('POST /mcp with no Authorization header returns structured 401', async () => {
    const res = await worker.fetch('/mcp', { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('Bearer');
    expect(res.headers.get('content-type')).toContain('application/json');

    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('unauthorized');
    expect(body.message).toMatch(/missing authorization/i);
  });

  it('POST /mcp with non-Bearer scheme returns 401', async () => {
    const res = await worker.fetch('/mcp', {
      method: 'POST',
      body: '{}',
      headers: { Authorization: `Basic ${TEST_KEY}` },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.message).toMatch(/bearer scheme/i);
  });

  it('POST /mcp with empty Bearer token returns 401', async () => {
    // Note: HTTP runtimes may normalize trailing whitespace on header values,
    // so "Bearer " can arrive as "Bearer" — which trips the scheme check
    // rather than the empty-token check. Both are correct rejections of
    // "no token provided"; we assert the structured-401 envelope without
    // pinning the specific message.
    const res = await worker.fetch('/mcp', {
      method: 'POST',
      body: '{}',
      headers: { Authorization: 'Bearer ' },
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('Bearer');
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('unauthorized');
    expect(body.message.length).toBeGreaterThan(0);
  });

  it('POST /mcp with wrong Bearer token returns 401', async () => {
    const res = await worker.fetch('/mcp', {
      method: 'POST',
      body: '{}',
      headers: { Authorization: 'Bearer not-the-real-token' },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.message).toMatch(/invalid bearer/i);
  });

  it('POST /mcp with valid Bearer token reaches the MCP handler', async () => {
    // The MCP handler will reject this body (invalid JSON-RPC), but it WILL
    // be reached — proving auth passed. The point of this test is that the
    // 401 short-circuit is gone for a valid key.
    const res = await worker.fetch('/mcp', {
      method: 'POST',
      body: 'not-json-rpc',
      headers: { Authorization: `Bearer ${TEST_KEY}` },
    });
    expect(res.status).not.toBe(401);
    // Any 4xx from the MCP layer is fine; the point is it's NOT 401.
  });
});
