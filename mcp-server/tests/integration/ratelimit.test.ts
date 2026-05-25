/**
 * Rate-limit integration — Phase 3 graceful-skip verification.
 *
 * Phase 3 ships the limiter substrate (sliding-window check, RFC 9331
 * headers, 429 envelope, circuit-breaker scaffold) but its full
 * enforcement requires a live Upstash project. This test exercises the
 * **graceful-skip path** — when Upstash credentials are absent, the
 * Worker fails open with a logged warning rather than blocking traffic.
 *
 * Actual sliding-window enforcement (the (N+1)th request returns 429)
 * is verified in Phase 6 against a real staging Upstash project, where
 * the budget can be hammered without consuming free-tier Redis quota
 * in CI runs.
 *
 * Architecture: src/docs/development/MCP_SERVER_REMOTE_BL-032.md § Phase 3
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { unstable_dev, type Unstable_DevWorker } from 'wrangler';

const TEST_KEY = 'test-token-rp';

let worker: Unstable_DevWorker;

beforeAll(async () => {
  // Note: NO UPSTASH_MCP_REST_URL / TOKEN bindings — limiter takes the
  // null/graceful-skip path (Path 2: rate-limit state lives in the MCP DB,
  // so MCP-DB creds are what the limiter checks). This is the exact
  // configuration `wrangler dev` operates under for a developer who
  // doesn't have Upstash creds locally.
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

describe('rate-limit graceful skip — Phase 3 (no Upstash bound)', () => {
  it('authenticated request passes through without RateLimit-* headers', async () => {
    const res = await worker.fetch('/mcp', {
      method: 'POST',
      body: 'not-json-rpc',
      headers: { Authorization: `Bearer ${TEST_KEY}` },
    });

    // Auth passed (not 401); MCP handler may 4xx the body, but we don't get 429.
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(429);

    // Without Upstash, no RateLimit-* headers are emitted — the limiter
    // stayed on the null path. Phase 6 wires real Upstash and these
    // headers come through on every authenticated response.
    expect(res.headers.get('ratelimit-limit')).toBeNull();
    expect(res.headers.get('ratelimit-remaining')).toBeNull();
    expect(res.headers.get('ratelimit-reset')).toBeNull();
  });

  it('many consecutive authenticated requests all pass (no enforcement when skipped)', async () => {
    // 20 requests in fast succession. With Upstash off, no per-minute
    // budget exists; every request reaches the MCP handler.
    const probes = Array.from({ length: 20 }, () =>
      worker.fetch('/mcp', {
        method: 'POST',
        body: 'not-json-rpc',
        headers: { Authorization: `Bearer ${TEST_KEY}` },
      })
    );
    const responses = await Promise.all(probes);

    for (const res of responses) {
      expect(res.status).not.toBe(429);
    }
  });

  it('GET /health is never rate-limited (path is exempt before bearer + limiter checks)', async () => {
    // Health needs to remain probe-able even under attack — it's the
    // signal Cloudflare uptime monitoring + future BL-032.5 / BL-032.75
    // dashboards rely on.
    const res = await worker.fetch('/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('ratelimit-limit')).toBeNull();
  });
});
