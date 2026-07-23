/**
 * BL-033 — unit tests for the latency probe's pure helpers.
 *
 * The probe script (`scripts/probe-latency.mjs`) is plain Node with an
 * import-guard, so its stat/protocol helpers import cleanly here without
 * firing any network calls (same .mjs-into-vitest pattern as
 * `radar-mock-data.mjs`). Live behavior against a real Worker is covered
 * by the staging smoke in the PR verification, not by this suite.
 */

import { describe, it, expect } from 'vitest';
import {
  PROBE_SURFACES,
  buildToolCallBody,
  classifyOutcome,
  computeStats,
  parseSseEnvelope,
  percentile,
  readFirstSseEvent,
  renderSummaryTable,
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
