/**
 * Unit tests for the /status HTML renderer (BL-032.75 Phase 3).
 * Health + last-eval sources stubbed at the module boundary; asserts the
 * public-safe rendering contract (badges, SLO framing, HTML escaping, and
 * graceful no-summary state).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockBuildHealth, mockCreateMcpClient } = vi.hoisted(() => ({
  mockBuildHealth: vi.fn(),
  mockCreateMcpClient: vi.fn(() => null),
}));

vi.mock('../../../src/observability/health', () => ({
  buildHealthPayload: mockBuildHealth,
  probeRadarSnapshotAge: vi.fn(),
}));
vi.mock('../../../src/lib/upstash-clients', () => ({
  createMcpClient: mockCreateMcpClient,
}));

import { buildStatusHtml } from '../../../src/observability/status-page';
import type { Env } from '../../../src/worker';

const ENV = { ENV_NAME: 'production' } as unknown as Env;

const HEALTHY_PAYLOAD = {
  ok: true,
  version: '0.39.0',
  gitSha: 'abc1234',
  phase: 'x',
  upstashMcp: 'ok',
  inoreader: 'ok',
  inoreaderObservedAt: null,
  inoreaderObservedSecondsAgo: 120,
  inoreaderObservedSource: 'cron',
  radarSnapshotAgeSeconds: 3600,
  inoreaderSpend: { total: 14, byCategory: {} },
  aclSelfCheck: { status: 'ok' },
  inoreaderRefreshTokenHealth: {},
};

beforeEach(() => {
  mockBuildHealth.mockReset();
  mockCreateMcpClient.mockReset();
  mockCreateMcpClient.mockReturnValue(null);
  mockBuildHealth.mockResolvedValue(HEALTHY_PAYLOAD);
});

describe('buildStatusHtml', () => {
  it('renders OPERATIONAL with fresh snapshot and low budget on a healthy payload', async () => {
    const html = await buildStatusHtml(ENV);
    expect(html).toContain('OPERATIONAL');
    expect(html).toContain('fresh');
    expect(html).toContain('14/100 today');
    expect(html).toContain('43200');
  });

  it('renders DEGRADED and STALE states', async () => {
    mockBuildHealth.mockResolvedValue({
      ...HEALTHY_PAYLOAD,
      ok: false,
      upstashMcp: 'degraded',
      radarSnapshotAgeSeconds: 50_000,
    });
    const html = await buildStatusHtml(ENV);
    expect(html).toContain('DEGRADED');
    expect(html).toContain('STALE');
  });

  it('renders the last-eval alert table when a summary exists, including cooldown state', async () => {
    mockCreateMcpClient.mockReturnValue({
      get: vi.fn().mockResolvedValue({
        evaluatedAt: '2026-07-14T15:30:00.000Z',
        env: 'production',
        rules: [
          {
            id: 'radar-snapshot-stale',
            breached: true,
            suppressed: true,
            severity: 'page',
            summary: 'age 50000s vs 43200s',
            observed: {},
          },
          {
            id: 'health-check-failing',
            breached: false,
            suppressed: false,
            severity: 'ticket',
            summary: 'healthy',
            observed: {},
          },
        ],
      }),
    } as never);
    const html = await buildStatusHtml(ENV);
    expect(html).toContain('2026-07-14T15:30:00.000Z');
    expect(html).toContain('breached (cooldown)');
    expect(html).toContain('radar-snapshot-stale');
    expect(html).toContain('health-check-failing');
  });

  it('renders a graceful placeholder before the first evaluation', async () => {
    const html = await buildStatusHtml(ENV);
    expect(html).toContain('No evaluation summary yet');
  });

  it('HTML-escapes summary content (rule summaries can embed observed strings)', async () => {
    mockCreateMcpClient.mockReturnValue({
      get: vi.fn().mockResolvedValue({
        evaluatedAt: 'x',
        env: 'production',
        rules: [
          {
            id: 'evil',
            breached: false,
            suppressed: false,
            severity: 'ticket',
            summary: '<script>alert(1)</script>',
            observed: {},
          },
        ],
      }),
    } as never);
    const html = await buildStatusHtml(ENV);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

// A createMcpClient whose get() answers per-key: the alert summary for
// LAST_EVAL_KEY, the precomputed metrics blob for STATUS_METRICS_KEY.
const keyedRedis = (byKey: Record<string, unknown>) =>
  ({ get: vi.fn(async (k: string) => byKey[k] ?? null) }) as never;

describe('buildStatusHtml — BL-033 Slice 4 panels', () => {
  const METRICS_KEY = 'mcp:status:metrics:production';

  it('renders per-tool latency as PLAIN values (no badge/threshold markup)', async () => {
    mockCreateMcpClient.mockReturnValue(
      keyedRedis({
        [METRICS_KEY]: {
          evaluatedAt: '2026-07-26T14:00:00.000Z',
          toolLatency: [{ name: 'search_portfolio', p50Ms: 5, p95Ms: 12, p99Ms: 30, n: 100 }],
          audit: {
            lastSeq: 42,
            batches24h: 7,
            records24h: 55,
            lastProcessedAt: '2026-07-26T14:00:00Z',
          },
        },
      })
    );
    const html = await buildStatusHtml(ENV);
    // Latency panel present with plain cells.
    expect(html).toContain('Tool latency');
    expect(html).toContain('search_portfolio');
    expect(html).toContain('<td>5</td>');
    expect(html).toContain('<td>12</td>');
    expect(html).toContain('as of 2026-07-26T14:00:00.000Z');
    // Audit panel present, with the ADR-0014 deactivation annotation the
    // AUDIT_LOG.md § Deactivation Verify step tells the operator to look for.
    expect(html).toContain('Audit log');
    expect(html).toContain('<td>42</td>');
    expect(html).toContain('Pipeline deactivated 2026-08-08');
    // Surface-not-ratify: latency values are NOT wrapped in the badge color spans.
    expect(html).not.toMatch(/color:#0a7d4f[^<]*>\s*5\s*</);
    expect(html).not.toContain('500ms');
  });

  it('renders "metrics unavailable" when the metrics cache is absent (page still renders)', async () => {
    mockCreateMcpClient.mockReturnValue(keyedRedis({})); // no metrics key
    const html = await buildStatusHtml(ENV);
    expect(html).toContain('OPERATIONAL'); // page still renders end-to-end
    expect(html).toContain('metrics unavailable');
  });
});
