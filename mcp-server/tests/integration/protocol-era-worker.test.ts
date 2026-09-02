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
import { parseToolResult, type CallToolResultPayload } from '../helpers/tool-envelope';
import { minimalArgsFor } from '../helpers/prompt-args';

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

  // REGRESSION GUARD — the prompt-rendering incident.
  //
  // `prompts/get gst_radar_brief_today` returned JSON-RPC -32603 ("The
  // \"path\" argument must be of type string or an instance of URL. Received
  // undefined") on production for every remote client, while working
  // perfectly on stdio. The prompt's embed helper called the node:fs-backed
  // `readFyiSnapshot()`, which resolves its cache dir from `import.meta.url`
  // — undefined in the Worker bundle. Lazily, so the module imported fine and
  // only threw when a model actually expanded the prompt.
  //
  // Nothing caught it because NO test in this repo issued a `prompts/get` on
  // ANY transport: `prompts-args-shape.test.ts` covers `prompts/list`, and
  // this Worker suite covered tools and resources. The paired-transport
  // roundtrip added alongside this one would NOT have caught it either — it
  // runs under Node, where `node:fs` exists. This lane is the only one that
  // reproduces the failure, which is what makes these the load-bearing cases.
  it('renders every prompt over the Worker lane without a rendering error', async () => {
    const list = await readJsonRpc(await worker.fetch('/mcp', modernRequest('prompts/list')));
    expect(list.error).toBeUndefined();
    const prompts = (list.result as { prompts: Array<{ name: string }> }).prompts;
    expect(prompts).toHaveLength(12); // gst_irl_sweep + gst_irl_extract (trust-the-operator pair); BL-140 added the prompt then named gst_irl_fill, renamed to gst_irl_create (0.62.0) and to gst_irl_populate (0.63.0)

    for (const { name } of prompts) {
      // Shared with the paired-transport suite — see tests/helpers/prompt-args.ts.
      // Throws (rather than skipping) when a new prompt has no entry.
      const args = minimalArgsFor(name);
      const res = await readJsonRpc(
        await worker.fetch('/mcp', {
          ...modernRequest('prompts/get', { 'Mcp-Name': name }),
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'prompts/get',
            params: {
              name,
              arguments: args,
              _meta: {
                'io.modelcontextprotocol/protocolVersion': MODERN_VERSION,
                'io.modelcontextprotocol/clientInfo': { name: 'gst-test-client', version: '1.0.0' },
                'io.modelcontextprotocol/clientCapabilities': {},
              },
            },
          }),
        })
      );
      expect(res.error, `prompts/get ${name} returned a JSON-RPC error`).toBeUndefined();
      const messages = (res.result as { messages?: unknown[] }).messages;
      expect(messages, `prompts/get ${name} returned no messages`).toBeTruthy();
      expect(messages!.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('serves the radar prompt degraded rather than throwing when no cache is bound', async () => {
    const res = await readJsonRpc(
      await worker.fetch('/mcp', {
        ...modernRequest('prompts/get', { 'Mcp-Name': 'gst_radar_brief_today' }),
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'prompts/get',
          params: {
            name: 'gst_radar_brief_today',
            arguments: {},
            _meta: {
              'io.modelcontextprotocol/protocolVersion': MODERN_VERSION,
              'io.modelcontextprotocol/clientInfo': { name: 'gst-test-client', version: '1.0.0' },
              'io.modelcontextprotocol/clientCapabilities': {},
            },
          },
        }),
      })
    );

    expect(res.error).toBeUndefined();
    const messages = (
      res.result as { messages: Array<{ content: { type: string; text?: string } }> }
    ).messages;
    // `unstable_dev` binds no Upstash, so the cache-only reader returns null
    // and the second message is the degraded TEXT block. Either shape is a
    // pass; the -32603 is the failure.
    expect(messages).toHaveLength(2);
    const second = messages[1].content;
    expect(['resource', 'text']).toContain(second.type);
    if (second.type === 'text') {
      // The remote wording — NOT the stdio `npm run radar:seed` remediation,
      // which is the specific thing a Worker client must never be told.
      expect(second.text).not.toContain('radar:seed');
    }
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
    const result = body.result as {
      structuredContent?: { themes?: string[] };
      content?: { type: string; text: string }[];
    };
    expect(Array.isArray(result.structuredContent?.themes)).toBe(true);

    // BL-108 — the data must reach the `content` channel too, on the LEGACY era.
    //
    // This is the assertion whose absence cost three weeks. `structuredContent`
    // above was correct throughout: the Worker always emitted it, and Claude Code
    // reads it. Claude Desktop reads `content`, which under BL-090 carried nothing
    // but "15 themes, 2 engagement categories, ..." — so `search_portfolio` looked
    // like a broken tool while every server-side test stayed green.
    //
    // Shape-based, never row counts: `projects.json` is edited routinely
    // (TEST_BEST_PRACTICES §6), and a count here would fail on unrelated PRs.
    //
    // BL-112 routes this through the shared `parseToolResult` so the contract has one
    // definition rather than three. It is asserted HERE as well as in
    // `protocol-roundtrip.test.ts` because this is the 2025-era codec path — the one
    // Claude Desktop actually spoke when BL-108 broke — so the shared assertion has to
    // hold on both eras or it is not the contract.
    const parsed = parseToolResult<{ themes?: unknown }>(result as CallToolResultPayload);
    expect(result.content).toHaveLength(2);
    expect(result.content?.[0].text).toMatch(/themes/);
    expect(Array.isArray(parsed.themes)).toBe(true);
  });

  it('accepts the legacy notifications/initialized that follows the handshake', async () => {
    // Claude Desktop's second message. A notification carries no id, so a
    // conforming server answers 202 with no body; getting this wrong strands
    // the client just as surely as refusing the handshake.
    const res = await worker.fetch('/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TEST_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });
    expect(res.status).toBe(202);
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
      // A COMPLETE _meta envelope naming an unknown revision. An incomplete
      // one (e.g. omitting clientCapabilities) is refused earlier with -32602
      // for a malformed envelope, which would make this test pass for the
      // wrong reason — it did, until the code assertion below caught it.
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2099-01-01',
            'io.modelcontextprotocol/clientInfo': { name: 'gst-test-client', version: '1.0.0' },
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      }),
    });

    // Serving both eras is not the same as serving anything: a version we do
    // not implement is still refused. Auth passed (not a 401), so the
    // rejection is the protocol layer's.
    expect(res.status).not.toBe(401);
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = await readJsonRpc(res);
    const err = body.error as { code?: number; message?: string } | undefined;
    expect(err?.code).toBe(-32022);
    expect(String(err?.message ?? '')).toMatch(/protocol|version/i);
  });
});
