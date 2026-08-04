/**
 * BL-106 — protocol-era behaviour of the Worker's MCP handler.
 *
 * Boots the Worker via `unstable_dev` with a synthetic bearer bound through
 * `vars` (the same mechanism `auth.test.ts` uses) so these are real,
 * authenticated, end-to-end round trips rather than in-memory approximations.
 *
 * This file exists because the migration to the SDK v2 stateless handler
 * introduced two failure modes that NOTHING else in the suite would catch:
 *
 *   1. **The origin gate.** The v2 handler runs its own Host/Origin check
 *      before the SDK. Left at its default, the accepted origin set is the
 *      localhost trio — so on any real hostname a request carrying
 *      `Origin: https://claude.ai` is answered 403, killing exactly the
 *      browser-based clients `auth/cors.ts` maintains an allowlist for. We
 *      disable it (`allowedOriginHostnames: '*'`) and let `cors.ts` remain
 *      the single origin authority. The first test below is the guard; it
 *      demonstrably fails if that option is removed.
 *
 *   2. **No proof the handler serves anything.** Before this file, every
 *      Worker-level test asserted auth-layer outcomes only (`not 401`,
 *      `not 403`, "some 4xx"). None asserted a successful MCP result, so a
 *      Worker that rejected *every* protocol request would have kept the
 *      suite green. Going modern-only makes that gap dangerous.
 *
 * Architecture: mcp-server/src/docs/ARCHITECTURE.md § Streamable HTTP binding
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { unstable_dev, type Unstable_DevWorker } from 'wrangler';

const TEST_KEY = 'test-token-rp';
const MODERN_VERSION = '2026-07-28';
const BROWSER_ORIGIN = 'https://claude.ai';

let worker: Unstable_DevWorker;

beforeAll(async () => {
  worker = await unstable_dev('src/worker.ts', {
    config: 'wrangler.toml',
    env: 'staging',
    local: true,
    experimental: { disableExperimentalWarning: true },
    vars: { MCP_KEY_RP: TEST_KEY },
  });
}, 60_000);

afterAll(async () => {
  await worker?.stop();
});

/**
 * A conforming `2026-07-28` request. The protocol version rides in BOTH the
 * `MCP-Protocol-Version` header and `params._meta`; the server rejects a
 * mismatch with `-32020`. `Mcp-Method` is required on every POST — `Mcp-Name`
 * only on `tools/call` / `resources/read` / `prompts/get`, so `tools/list`
 * carries no name header.
 */
function modernRequest(method: string, extraHeaders: Record<string, string> = {}) {
  return {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TEST_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': MODERN_VERSION,
      'Mcp-Method': method,
      ...extraHeaders,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params: {
        _meta: {
          'io.modelcontextprotocol/protocolVersion': MODERN_VERSION,
          'io.modelcontextprotocol/clientInfo': { name: 'gst-test-client', version: '1.0.0' },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
  };
}

/**
 * Reads a JSON-RPC result from either a plain JSON body or an SSE stream.
 *
 * Typed structurally rather than as `Response`: `unstable_dev`'s fetch returns
 * undici's `Response`, which is not assignable to the global one.
 */
async function readJsonRpc(res: {
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}): Promise<Record<string, unknown>> {
  const text = await res.text();
  if ((res.headers.get('content-type') ?? '').includes('text/event-stream')) {
    // Last `data:` line carries the final response.
    const lines = text
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice('data:'.length).trim());
    return JSON.parse(lines[lines.length - 1]!) as Record<string, unknown>;
  }
  return JSON.parse(text) as Record<string, unknown>;
}

describe('BL-106 — Worker protocol era', () => {
  it('serves a modern tools/list from a browser origin (origin gate is not ours to enforce)', async () => {
    const res = await worker.fetch('/mcp', modernRequest('tools/list', { Origin: BROWSER_ORIGIN }));

    // The guard: without `allowedOriginHostnames: '*'` on the handler, this is
    // a 403 from the SDK's origin validator long before the MCP layer runs.
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);

    const body = await readJsonRpc(res);
    expect(body.error).toBeUndefined();

    // And the substantive half: the handler actually serves a result. The
    // Worker registers 15 tools (17 minus the two stdio-only radar tools).
    const result = body.result as { tools?: Array<{ name: string }> };
    expect(Array.isArray(result?.tools)).toBe(true);
    expect(result.tools!.length).toBeGreaterThan(0);
    expect(result.tools!.map((t) => t.name)).toContain('search_portfolio');
  });

  it('still applies our own CORS allowlist to the response', async () => {
    const res = await worker.fetch('/mcp', modernRequest('tools/list', { Origin: BROWSER_ORIGIN }));
    // `corsOptions: false` stops the handler emitting its own (wildcard)
    // headers; `withCors` in the pipeline supplies the allowlisted origin.
    expect(res.headers.get('access-control-allow-origin')).toBe(BROWSER_ORIGIN);
    expect(res.headers.get('access-control-allow-origin')).not.toBe('*');
  });

  it('emits no wildcard Allow-Origin for a disallowed origin', async () => {
    const res = await worker.fetch(
      '/mcp',
      modernRequest('tools/list', { Origin: 'https://evil.example' })
    );
    // The pre-BL-106 defect: the handler's default CORS shipped `*` here,
    // which `withCors` did not overwrite for non-allowlisted origins.
    expect(res.headers.get('access-control-allow-origin')).not.toBe('*');
  });

  it('publishes cache hints on a library read, and none on radar (BL-091 safety)', async () => {
    const readResource = async (uri: string) =>
      readJsonRpc(
        await worker.fetch('/mcp', {
          ...modernRequest('resources/read', { 'Mcp-Name': uri }),
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'resources/read',
            params: {
              uri,
              _meta: {
                'io.modelcontextprotocol/protocolVersion': MODERN_VERSION,
                'io.modelcontextprotocol/clientInfo': { name: 'gst-test-client', version: '1.0.0' },
                'io.modelcontextprotocol/clientCapabilities': {},
              },
            },
          }),
        })
      );

    // Library: the 24h server-side policy is now advertised to the client.
    //
    // NOTE: assert on `result` UNCONDITIONALLY. An earlier draft guarded these
    // with `if (result)` and used a URI that does not exist — so the library
    // half asserted nothing at all while the test reported green. If the URI
    // below ever stops resolving, this must fail loudly rather than skip.
    const lib = await readResource('gst://library/information-request-list');
    expect(lib.error).toBeUndefined();
    const libResult = lib.result as { ttlMs?: number; cacheScope?: string };
    expect(libResult.ttlMs).toBe(24 * 60 * 60 * 1000);
    expect(libResult.cacheScope).toBe('public');

    // Radar: deliberately no registered hint, so the SDK's conservative
    // default applies. A non-zero ttl here would mean a degraded
    // "snapshot not populated" body could be cached client-side for 15
    // minutes — the BL-091 failure, moved somewhere we cannot invalidate.
    const radar = await readResource('gst://radar/wire/latest');
    expect(radar.error).toBeUndefined();
    const radarResult = radar.result as { ttlMs?: number; cacheScope?: string };
    expect(radarResult.ttlMs).toBe(0);
    expect(radarResult.cacheScope).toBe('private');
  });

  // REGRESSION GUARD — this is the incident test. BL-106 shipped the Worker
  // as modern-only (`legacy: 'reject'`) on the inference that "no external
  // clients" meant no clients on the old protocol era. Claude Desktop was on
  // `2025-11-25`, so within hours of the production deploy every tool call
  // failed with `-32022`. It surfaced as "failed to call tool
  // list_portfolio_facets" rather than a connection error, because the client
  // still had a cached tool list — the symptom pointed at the tool, not the
  // handshake.
  //
  // If someone flips the era token back to `'reject'`, these two die.
  it('serves a 2025-era initialize handshake (the Claude Desktop path)', async () => {
    const res = await worker.fetch('/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TEST_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'claude-desktop', version: '1.0.0' },
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = await readJsonRpc(res);
    expect(body.error).toBeUndefined();
    const result = body.result as { protocolVersion?: string };
    expect(result.protocolVersion).toBe('2025-11-25');
  });

  it('serves a 2025-era tools/call — the exact request that failed in production', async () => {
    const res = await worker.fetch('/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TEST_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      // No `_meta`, no `MCP-Protocol-Version` / `Mcp-Method` / `Mcp-Name` —
      // a 2025-era client sends none of them. Under `legacy: 'reject'` this
      // is answered `-32022 Unsupported protocol version`.
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'list_portfolio_facets', arguments: {} },
      }),
    });

    expect(res.status).toBe(200);
    const body = await readJsonRpc(res);
    expect(body.error).toBeUndefined();
    const result = body.result as { structuredContent?: { themes?: string[] } };
    expect(Array.isArray(result.structuredContent?.themes)).toBe(true);
  });

  it('still rejects a request that names an unsupported protocol version', async () => {
    const res = await worker.fetch('/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TEST_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': '2099-01-01',
        'Mcp-Method': 'tools/list',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2099-01-01' } },
      }),
    });

    // Serving both eras is not the same as serving anything: a version we do
    // not implement is still refused. Auth passed (not a 401), so the
    // rejection is the protocol layer's.
    expect(res.status).not.toBe(401);
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = await readJsonRpc(res);
    const err = body.error as { code?: number; message?: string } | undefined;
    expect(err).toBeDefined();
    expect(String(err?.message ?? '')).toMatch(/protocol|version/i);
  });
});
