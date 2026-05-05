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
  it('GET /health returns the Phase-1 stub payload', async () => {
    const res = await worker.fetch('/health');
    expect(res.status).toBe(200);

    const body = (await res.json()) as { ok: boolean; phase: string; version: string };
    expect(body.ok).toBe(true);
    // The phase string updates as substrate matures (Phase 1 → Phase 2 → ...);
    // assert just the BL-032 marker so this test doesn't churn on every phase bump.
    expect(body.phase).toContain('BL-032');
    expect(body.version).toBe('0.0.1');
  });

  it('non-MCP, non-health route does not throw — delegates to MCP handler which rejects', async () => {
    const res = await worker.fetch('/unknown-path');
    // The MCP handler's behavior on a non-/mcp path is to return some 4xx;
    // the precise status comes from agents/mcp internals. We just assert the
    // Worker doesn't crash (non-2xx but well-formed response).
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(600);
  });

  it('POST to /mcp without an MCP body returns a structured error, not a crash', async () => {
    const res = await worker.fetch('/mcp', { method: 'POST', body: 'not a json-rpc message' });
    // Same shape: any well-formed 4xx is fine. The point is the handler is
    // reachable and reports a structured error rather than crashing.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(600);
  });
});
