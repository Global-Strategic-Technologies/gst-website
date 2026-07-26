/**
 * Unit tests for the /status metrics precompute + read (BL-033 Slice 4).
 * `computeStatusMetrics` runs from the evaluator cron; `readStatusMetrics`
 * from the page. Both fail open (partial/null) so a degraded AE/Upstash never
 * breaks the status page.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreateMcpClient } = vi.hoisted(() => ({ mockCreateMcpClient: vi.fn(() => null) }));
vi.mock('../../../src/lib/upstash-clients', () => ({ createMcpClient: mockCreateMcpClient }));

import {
  computeStatusMetrics,
  readStatusMetrics,
  STATUS_METRICS_KEY,
} from '../../../src/observability/status-metrics';
import type { AeQuery } from '../../../src/observability/ae-query';
import type { Env } from '../../../src/worker';

const ENV = { ENV_NAME: 'production' } as unknown as Env;

/** aeQuery that answers the latency query and the audit query distinctly. */
const aeQueryFor = (latency: unknown[] | null, audit: unknown[] | null): AeQuery =>
  vi.fn(async (sql: string) =>
    sql.includes('tool_invocation')
      ? (latency as never)
      : sql.includes('audit_batch')
        ? (audit as never)
        : null
  );

beforeEach(() => {
  mockCreateMcpClient.mockReset();
  mockCreateMcpClient.mockReturnValue(null);
});

describe('computeStatusMetrics', () => {
  it('parses per-tool percentile rows (rounded) and merges chain-tip + audit AE', async () => {
    const redis = { get: vi.fn().mockResolvedValue({ lastSeq: 42, lastHash: 'x' }) } as never;
    const aeQuery = aeQueryFor(
      [{ name: 'search_portfolio', p50_ms: '4.6', p95_ms: '12.2', p99_ms: '30', n: '100' }],
      [{ batches: '7', records: '55', last_ts: '2026-07-26T14:00:00Z' }]
    );

    const m = await computeStatusMetrics(aeQuery, redis, 'mcp_events', 'production');

    expect(m.toolLatency).toEqual([
      { name: 'search_portfolio', p50Ms: 5, p95Ms: 12, p99Ms: 30, n: 100 },
    ]);
    expect(m.audit).toEqual({
      lastSeq: 42,
      batches24h: 7,
      records24h: 55,
      lastProcessedAt: '2026-07-26T14:00:00Z',
    });
    expect(typeof m.evaluatedAt).toBe('string');
  });

  it('degrades gracefully when AE returns null (toolLatency null, audit counts null, lastSeq still read)', async () => {
    const redis = { get: vi.fn().mockResolvedValue({ lastSeq: 9 }) } as never;
    const aeQuery = aeQueryFor(null, null);

    const m = await computeStatusMetrics(aeQuery, redis, 'mcp_events', 'production');

    expect(m.toolLatency).toBeNull();
    expect(m.audit).toEqual({
      lastSeq: 9,
      batches24h: null,
      records24h: null,
      lastProcessedAt: null,
    });
  });

  it('tolerates a missing/throwing chain tip (lastSeq null)', async () => {
    const redis = { get: vi.fn().mockRejectedValue(new Error('down')) } as never;
    const m = await computeStatusMetrics(aeQueryFor([], []), redis, 'mcp_events', 'production');
    expect(m.audit.lastSeq).toBeNull();
    expect(m.toolLatency).toEqual([]);
  });
});

describe('readStatusMetrics', () => {
  it('returns null when Upstash is unbound', async () => {
    mockCreateMcpClient.mockReturnValue(null);
    expect(await readStatusMetrics(ENV)).toBeNull();
  });

  it('returns the parsed blob (object form)', async () => {
    const blob = { evaluatedAt: 't', toolLatency: [], audit: { lastSeq: 1 } };
    mockCreateMcpClient.mockReturnValue({ get: vi.fn().mockResolvedValue(blob) } as never);
    expect(await readStatusMetrics(ENV)).toEqual(blob);
  });

  it('parses the blob from a JSON string form and reads the env-scoped key', async () => {
    const blob = { evaluatedAt: 't', toolLatency: null, audit: { lastSeq: 5 } };
    const get = vi.fn().mockResolvedValue(JSON.stringify(blob));
    mockCreateMcpClient.mockReturnValue({ get } as never);
    expect(await readStatusMetrics(ENV)).toEqual(blob);
    expect(get).toHaveBeenCalledWith(STATUS_METRICS_KEY('production'));
  });

  it('returns null on malformed cached JSON (never throws)', async () => {
    mockCreateMcpClient.mockReturnValue({ get: vi.fn().mockResolvedValue('{not json') } as never);
    expect(await readStatusMetrics(ENV)).toBeNull();
  });
});
