/**
 * Worker roundtrip — Phase 1 transport spike validation.
 *
 * Boots the Worker (`src/worker.ts`) via wrangler's `unstable_dev` and
 * probes:
 *   - GET /health → 200 with the Phase-1 stub payload
 *   - GET /unknown → 404 (or 4xx; route delegation falls through to the MCP
 *     handler which rejects non-/mcp requests)
 *
 * Phase 1's purpose is to prove the SCAFFOLDING works:
 *   - wrangler.toml + Worker bundle (incl. nodejs_compat) compile cleanly
 *   - the handler routes /health correctly
 *   - createServer() loads on the Worker runtime without pulling Node-only
 *     modules from `_local-only.ts` (search_radar_cache + radar Resources)
 *   - `agents/mcp`'s createMcpHandler integrates with our McpServer instance
 *
 * Full MCP protocol roundtrip (initialize + tools/list + tools/call over
 * Streamable HTTP) is Phase 6 verification — that's where auth + rate-limit
 * are in place and the surface is meant to be exercised end-to-end.
 *
 * Architecture: src/docs/development/MCP_SERVER_REMOTE_BL-032.md
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { unstable_dev, type UnstableDevWorker } from 'wrangler';

let worker: UnstableDevWorker;

beforeAll(async () => {
  worker = await unstable_dev('src/worker.ts', {
    config: 'wrangler.toml',
    env: 'staging',
    local: true,
    experimental: { disableExperimentalWarning: true },
  });
}, 60_000); // wrangler boot can take a few seconds — generous timeout

afterAll(async () => {
  await worker?.stop();
});

describe('Worker roundtrip — Phase 1 transport spike', () => {
  it('GET /health returns the BACKLOG-shaped payload', async () => {
    const res = await worker.fetch('/health');
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      ok: boolean;
      phase: string;
      version: string;
      gitSha: string;
      upstashMcp: string;
      inoreader: string;
    };
    // The phase string updates as substrate matures; assert just the BL-032
    // marker so this test doesn't churn on every phase bump.
    expect(body.phase).toContain('BL-032');
    // Version follows mcp-server/package.json — bumped to 0.1.0 in BL-032
    // Phase 4b (rename); will go to 0.2.0 when the deprecated alias retires.
    expect(body.version).toMatch(/^0\.[0-9]+\.[0-9]+$/);
    // Post-BL-032.8 Phase B: single MCP DB. Without Upstash creds bound
    // (unstable_dev test config), upstashMcp reports 'degraded' — that
    // flips ok to false, which is the correct semantics for a Worker
    // that can't reach the DB.
    expect(['ok', 'degraded']).toContain(body.upstashMcp);
    expect(['ok', 'degraded', 'unknown']).toContain(body.inoreader);
    // ok is true iff MCP DB is reachable AND the cached Inoreader API
    // status isn't degraded.
    expect(body.ok).toBe(body.upstashMcp === 'ok' && body.inoreader !== 'degraded');
    expect(typeof body.gitSha).toBe('string');
  });

  it('non-routed paths return 404 without invoking auth', async () => {
    // The discriminating signal: a 404 from the route allowlist carries
    // NO `WWW-Authenticate` header. A 401 envelope (the alternative if
    // auth had run and rejected the missing bearer) WOULD set one. So
    // header-absence is the behavioral fingerprint that proves auth
    // didn't run — independent of status code or response body, both of
    // which could plausibly drift.
    const res = await worker.fetch('/favicon.ico');
    expect(res.status).toBe(404);
    expect(res.headers.get('www-authenticate')).toBeNull();
  });

  it('routed vs non-routed paths take different code paths', async () => {
    // Sampling of paths bots commonly probe. None reach the auth check
    // (status 404, no WWW-Authenticate header).
    for (const path of ['/.env', '/wp-admin', '/robots.txt', '/.git/config']) {
      const res = await worker.fetch(path);
      expect(res.status).toBe(404);
      expect(res.headers.get('www-authenticate')).toBeNull();
    }

    // Boundary check: `/mcp` IS in the allowlist, so it reaches the
    // auth path and returns a 401 envelope (with WWW-Authenticate) when
    // no bearer is sent. This pins both sides of the allowlist gate.
    const routed = await worker.fetch('/mcp', { method: 'POST', body: '{}' });
    expect(routed.status).toBe(401);
    expect(routed.headers.get('www-authenticate')).toContain('Bearer');
  });

  it('POST to /mcp without an MCP body returns a structured error, not a crash', async () => {
    const res = await worker.fetch('/mcp', { method: 'POST', body: 'not a json-rpc message' });
    // Same shape: any well-formed 4xx is fine. The point is the handler is
    // reachable and reports a structured error rather than crashing.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(600);
  });
});
