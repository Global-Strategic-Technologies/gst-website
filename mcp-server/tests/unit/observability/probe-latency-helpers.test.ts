/**
 * BL-033 — unit tests for the latency probe's pure helpers.
 *
 * The probe script (`scripts/probe-latency.mjs`) is plain Node with an
 * import-guard, so its stat/protocol helpers import cleanly here without
 * firing any network calls (same .mjs-into-vitest pattern as
 * `radar-mock-data.mjs`). Live behavior against a real Worker is covered
 * by the staging smoke in the PR verification, not by this suite.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  PROBE_SURFACES,
  buildToolCallBody,
  classifyOutcome,
  computeStats,
  parseSseEnvelope,
  percentile,
  readFirstSseEvent,
  renderSummaryTable,
  selectSurfaces,
  surfaceNeedsAuth,
  timedCall,
} from '../../../scripts/probe-latency.mjs';

describe('buildToolCallBody', () => {
  it('produces the Invoke-McpRequest.ps1 JSON-RPC envelope shape', () => {
    const body = JSON.parse(buildToolCallBody('search_portfolio', { search: 'kubernetes' }, 7));
    expect(body).toEqual({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'search_portfolio', arguments: { search: 'kubernetes' } },
    });
  });
});

describe('parseSseEnvelope', () => {
  it('extracts and parses the first SSE data line', () => {
    const sse = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"content":[]}}\n\n';
    expect(parseSseEnvelope(sse)).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: { content: [] },
    });
  });

  it('throws loudly when no data line exists (protocol-unexpected 2xx)', () => {
    expect(() => parseSseEnvelope('{"plain":"json"}')).toThrow(/no SSE data line/);
  });
});

describe('readFirstSseEvent', () => {
  it('resolves after the first complete data line even when the stream never closes', async () => {
    // The MCP streamable-HTTP transport may hold the SSE connection open
    // after the response event (observed on wrangler dev) — reading to
    // stream-end would hang forever. This pins the resolve-on-first-event
    // contract and that the reader is cancelled (releasing the stream lock).
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{}}\n')
        );
        // Deliberately never controller.close() — an idle open stream.
      },
      cancel() {
        cancelled = true;
      },
    });
    const text = await readFirstSseEvent(stream);
    expect(parseSseEnvelope(text)).toEqual({ jsonrpc: '2.0', id: 1, result: {} });
    expect(cancelled).toBe(true);
  });

  it('returns the accumulated body when the stream closes with no data line', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('not sse'));
        controller.close();
      },
    });
    await expect(readFirstSseEvent(stream)).resolves.toBe('not sse');
  });

  it('a mid-payload "data:" substring does not end the read early (line-anchored match)', async () => {
    // e.g. a tool result containing `"metadata:"` or a JSON string with
    // "data:" inside it — the reader must wait for a real SSE data LINE.
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc.encode('event: message\n: comment mentioning metadata: stuff\n'));
        controller.enqueue(
          enc.encode('data: {"jsonrpc":"2.0","id":1,"result":{"note":"has data: inside"}}\n')
        );
        // Never closed — resolve must come from the real data line.
      },
    });
    const text = await readFirstSseEvent(stream);
    expect(parseSseEnvelope(text)).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: { note: 'has data: inside' },
    });
  });
});

describe('classifyOutcome', () => {
  it('classifies rate limiting and open circuit distinctly (excluded from percentiles)', () => {
    expect(classifyOutcome(429, null)).toBe('rate-limited');
    expect(classifyOutcome(503, null)).toBe('circuit-open');
  });

  it('classifies other HTTP errors by status', () => {
    expect(classifyOutcome(401, null)).toBe('http-401');
    expect(classifyOutcome(500, null)).toBe('http-500');
  });

  it('classifies JSON-RPC and tool-level errors on 2xx responses', () => {
    expect(classifyOutcome(200, { error: { code: -32600 } })).toBe('rpc-error');
    expect(classifyOutcome(200, { result: { isError: true } })).toBe('tool-error');
  });

  it('classifies a clean 2xx result as ok', () => {
    expect(classifyOutcome(200, { result: { content: [] } })).toBe('ok');
  });
});

describe('percentile (nearest-rank)', () => {
  it('returns null on empty samples', () => {
    expect(percentile([], 95)).toBeNull();
  });

  it('p50/p95 over a known distribution', () => {
    const samples = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(samples, 50)).toBe(50);
    expect(percentile(samples, 95)).toBe(100);
  });

  it('does not mutate the input array', () => {
    const samples = [3, 1, 2];
    percentile(samples, 50);
    expect(samples).toEqual([3, 1, 2]);
  });
});

describe('computeStats', () => {
  it('reports null stats at zero ok-samples instead of fabricating numbers', () => {
    expect(computeStats([])).toEqual({ count: 0, p50: null, p95: null, max: null });
  });

  it('rounds to one decimal place', () => {
    const stats = computeStats([100.44, 200.46]);
    expect(stats.count).toBe(2);
    expect(stats.max).toBe(200.5);
  });
});

describe('PROBE_SURFACES contract', () => {
  it('radar surfaces are informative-only with a fixed 2-sample cap (50/day tier budget)', () => {
    const radar = PROBE_SURFACES.filter((s) => s.name.includes('radar'));
    expect(radar.length).toBeGreaterThan(0);
    for (const s of radar) {
      expect(s.sla).toBe(false);
      expect(s.fixedSamples).toBe(2);
    }
  });

  it('SLA surfaces are all non-radar (matches the SLA scope in BL-033)', () => {
    for (const s of PROBE_SURFACES.filter((s) => s.sla)) {
      expect(s.name).not.toContain('radar');
    }
  });

  it('ad-hoc surfaces (BL-154) are non-SLA, unauthenticated, and absent from the scheduled set', () => {
    const adhoc = PROBE_SURFACES.filter((s) => s.adhoc);
    expect(adhoc.map((s) => s.name).sort()).toEqual([
      'server-json',
      'token-unknown-client-cold',
      'token-unknown-client-warm',
    ]);
    for (const s of adhoc) {
      expect(s.sla).toBe(false);
      expect(surfaceNeedsAuth(s)).toBe(false);
      expect(s.fixedSamples).toBe(200);
    }
    // The scheduled run (no --surfaces) never reaches them — CI invokes this
    // script 4×/day, so the exclusion is a contract, not a convention.
    const scheduled = selectSurfaces(null);
    expect(scheduled.some((s) => s.adhoc)).toBe(false);
    expect(scheduled.length).toBe(PROBE_SURFACES.length - adhoc.length);
  });

  it('the cold token surface posts a client_credentials body with a fresh unknown client id per call', () => {
    const token = PROBE_SURFACES.find((s) => s.name === 'token-unknown-client-cold')!;
    const a = new URLSearchParams(token.body!());
    const b = new URLSearchParams(token.body!());
    // grant_type is load-bearing: without it worker.ts delegates /token to
    // the OAuth library and no OAUTH_KV read happens.
    expect(a.get('grant_type')).toBe('client_credentials');
    expect(a.get('client_id')).toMatch(/^m2m_probe/);
    expect(a.get('client_id')).not.toBe(b.get('client_id'));
    expect(token.okStatuses).toEqual([401]);
  });

  it('the warm token surface reuses one unknown client id for the whole run', () => {
    const token = PROBE_SURFACES.find((s) => s.name === 'token-unknown-client-warm')!;
    const a = new URLSearchParams(token.body!());
    const b = new URLSearchParams(token.body!());
    expect(a.get('grant_type')).toBe('client_credentials');
    expect(a.get('client_id')).toMatch(/^m2m_probewarm/);
    expect(a.get('client_id')).toBe(b.get('client_id'));
    expect(token.okStatuses).toEqual([401]);
  });
});

describe('selectSurfaces / surfaceNeedsAuth', () => {
  it('--surfaces selects exactly the named surfaces, in the given order', () => {
    const picked = selectSurfaces(['server-json', 'health']);
    expect(picked.map((s) => s.name)).toEqual(['server-json', 'health']);
  });

  it('an unknown surface name throws rather than probing nothing', () => {
    expect(() => selectSurfaces(['nope'])).toThrow(/Unknown surface: nope/);
  });

  it('only tools/call surfaces need the bearer', () => {
    expect(surfaceNeedsAuth({ name: 'x', kind: 'tool', sla: true })).toBe(true);
    expect(surfaceNeedsAuth({ name: 'x', kind: 'http-get', sla: true })).toBe(false);
    expect(surfaceNeedsAuth({ name: 'x', kind: 'http-post-form', sla: false })).toBe(false);
  });
});

describe('timedCall (raw HTTP kinds)', () => {
  const ctx = { mcpUrl: 'https://example.test', id: 1 };

  it('http-post-form sends a urlencoded POST and treats an expected 401 as ok', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('{"error":"invalid_client"}', { status: 401 })
    );
    const surface = PROBE_SURFACES.find((s) => s.name === 'token-unknown-client-cold')!;
    const result = await timedCall(surface, ctx, fetchImpl as unknown as typeof fetch);
    expect(result.outcome).toBe('ok');
    expect(result.latencyMs).not.toBeNull();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://example.test/token');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded'
    );
    expect(new URLSearchParams(String(init.body)).get('grant_type')).toBe('client_credentials');
  });

  it('a status outside okStatuses is still classified normally', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 503 }));
    const surface = PROBE_SURFACES.find((s) => s.name === 'token-unknown-client-cold')!;
    const result = await timedCall(surface, ctx, fetchImpl as unknown as typeof fetch);
    expect(result.outcome).toBe('circuit-open');
  });

  it('http-get without okStatuses classifies a 2xx as ok', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const surface = PROBE_SURFACES.find((s) => s.name === 'server-json')!;
    const result = await timedCall(surface, ctx, fetchImpl as unknown as typeof fetch);
    expect(result.outcome).toBe('ok');
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe('https://example.test/server.json');
  });
});

describe('renderSummaryTable', () => {
  it('renders one markdown row per surface with outcome counts', () => {
    const table = renderSummaryTable(
      [
        {
          name: 'search_portfolio',
          sla: true,
          outcomes: { ok: 9, 'rate-limited': 1 },
          stats: { count: 9, p50: 120.5, p95: 300.1, max: 310 },
        },
      ],
      { regionLabel: 'test', mcpUrl: 'https://example.test' }
    );
    expect(table).toContain(
      '| search_portfolio | yes | 9 | rate-limited:1 | 120.5 | 300.1 | 310 |'
    );
    expect(table).toContain('test → https://example.test');
  });
});
