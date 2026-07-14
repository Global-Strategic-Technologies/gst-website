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
