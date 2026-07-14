/**
 * Unit tests for the 7 canonical SLO alert rules (BL-032.75 Phase 3).
 *
 * Data sources are stubbed at the module boundary (Upstash spend, health
 * payload, snapshot age) or injected via the EvaluatorContext (AE SQL).
 * Every rule must fail OPEN when its data source is unavailable.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockReadSpend, mockBuildHealth, mockProbeAge, mockCreateMcpClient } = vi.hoisted(() => ({
  mockReadSpend: vi.fn(),
  mockBuildHealth: vi.fn(),
  mockProbeAge: vi.fn(),
  mockCreateMcpClient: vi.fn(() => null),
}));

vi.mock('../../../src/lib/inoreader-egress', () => ({
  readInoreaderSpend: mockReadSpend,
  ZONE1_DAILY_HARD_CAP: 100,
}));
vi.mock('../../../src/observability/health', () => ({
  buildHealthPayload: mockBuildHealth,
  probeRadarSnapshotAge: mockProbeAge,
}));
vi.mock('../../../src/lib/upstash-clients', () => ({
  createMcpClient: mockCreateMcpClient,
}));

import {
  ALERT_RULES,
  FRESHNESS_MAX_AGE_SECONDS,
  TRAFFIC_SPIKE_MIN_COUNT,
  datasetForEnv,
  type EvaluatorContext,
} from '../../../src/observability/alert-rules';
import type { Env } from '../../../src/worker';

const rule = (id: string) => {
  const r = ALERT_RULES.find((r) => r.id === id);
  if (!r) throw new Error(`rule not found: ${id}`);
  return r;
};

const makeCtx = (overrides?: Partial<EvaluatorContext>): EvaluatorContext => ({
  env: { ENV_NAME: 'production' } as unknown as Env,
  queryAe: vi.fn().mockResolvedValue(null),
  now: new Date('2026-07-14T12:00:00Z'),
  ...overrides,
});

beforeEach(() => {
  mockReadSpend.mockReset();
  mockBuildHealth.mockReset();
  mockProbeAge.mockReset();
  mockCreateMcpClient.mockReset();
  mockCreateMcpClient.mockReturnValue(null);
});

describe('rule registry shape', () => {
  it('carries exactly the 7 canonical rules in design-doc order', () => {
    expect(ALERT_RULES.map((r) => r.id)).toEqual([
      'inoreader-budget-exhausted',
      'radar-snapshot-stale',
      'health-check-failing',
      'traffic-spike-detected',
      'scope-mismatch-403-rate',
      'oauth-refresh-failure-rate',
      'sentry-envelope-post-failure-rate',
    ]);
  });
  it('every rule names a runbook under observability/runbooks/', () => {
    for (const r of ALERT_RULES) {
      expect(r.runbook).toBe(`observability/runbooks/${r.id}.md`);
    }
  });
});

describe('datasetForEnv', () => {
  it('maps env names to the wrangler.toml datasets', () => {
    expect(datasetForEnv('production')).toBe('mcp_events');
    expect(datasetForEnv('staging')).toBe('mcp_events_staging');
    expect(datasetForEnv(undefined)).toBe('mcp_events_dev');
  });
});

describe('inoreader-budget-exhausted', () => {
  it('does not breach at the ~14% baseline utilization', async () => {
    mockReadSpend.mockResolvedValue({ total: 14, byCategory: {} });
    const ev = await rule('inoreader-budget-exhausted').evaluate(makeCtx());
    expect(ev.breached).toBe(false);
  });
  it('tickets at >= 70% of the hard cap', async () => {
    mockReadSpend.mockResolvedValue({ total: 71, byCategory: {} });
    const ev = await rule('inoreader-budget-exhausted').evaluate(makeCtx());
    expect(ev.breached).toBe(true);
    expect(ev.severity).toBe('ticket');
  });
  it('pages at >= 90% of the hard cap', async () => {
    mockReadSpend.mockResolvedValue({ total: 92, byCategory: {} });
    const ev = await rule('inoreader-budget-exhausted').evaluate(makeCtx());
    expect(ev.breached).toBe(true);
    expect(ev.severity).toBe('page');
  });
});

describe('radar-snapshot-stale', () => {
  it('breaches (page) past the 12h freshness SLO', async () => {
    mockProbeAge.mockResolvedValue(FRESHNESS_MAX_AGE_SECONDS + 1);
    const ev = await rule('radar-snapshot-stale').evaluate(makeCtx());
    expect(ev.breached).toBe(true);
    expect(ev.severity).toBe('page');
  });
  it('does not breach at fresh ages', async () => {
    mockProbeAge.mockResolvedValue(3600);
    const ev = await rule('radar-snapshot-stale').evaluate(makeCtx());
    expect(ev.breached).toBe(false);
  });
  it('fails open on null age (cold cache or Upstash down)', async () => {
    mockProbeAge.mockResolvedValue(null);
    const ev = await rule('radar-snapshot-stale').evaluate(makeCtx());
    expect(ev.breached).toBe(false);
  });
});

describe('health-check-failing', () => {
  it('pages on Upstash degraded', async () => {
    mockBuildHealth.mockResolvedValue({ ok: false, upstashMcp: 'degraded', inoreader: 'ok' });
    const ev = await rule('health-check-failing').evaluate(makeCtx());
    expect(ev.breached).toBe(true);
    expect(ev.severity).toBe('page');
  });
  it('tickets on ok:false with Upstash healthy (e.g. Inoreader degraded)', async () => {
    mockBuildHealth.mockResolvedValue({ ok: false, upstashMcp: 'ok', inoreader: 'degraded' });
    const ev = await rule('health-check-failing').evaluate(makeCtx());
    expect(ev.breached).toBe(true);
    expect(ev.severity).toBe('ticket');
  });
  it('does not breach when healthy', async () => {
    mockBuildHealth.mockResolvedValue({ ok: true, upstashMcp: 'ok', inoreader: 'ok' });
    const ev = await rule('health-check-failing').evaluate(makeCtx());
    expect(ev.breached).toBe(false);
  });
});

describe('traffic-spike-detected', () => {
  it('fails open when AE is unavailable', async () => {
    const ev = await rule('traffic-spike-detected').evaluate(makeCtx());
    expect(ev.breached).toBe(false);
    expect(ev.observed.aeUnavailable).toBe(1);
  });
  it('breaches when a key exceeds 10x its trailing hourly mean above the floor', async () => {
    const queryAe = vi
      .fn()
      // current hour: RP at 100 calls
      .mockResolvedValueOnce([{ key_owner: 'RP', n: '100' }])
      // trailing 7d: RP at 168 total → hourly mean 1.0
      .mockResolvedValueOnce([{ key_owner: 'RP', n: '168' }]);
    const ev = await rule('traffic-spike-detected').evaluate(makeCtx({ queryAe }));
    expect(ev.breached).toBe(true);
    expect(ev.observed.keyOwner).toBe('RP');
  });
  it('the absolute floor suppresses small-number spikes (0 -> 20 on thin traffic)', async () => {
    const queryAe = vi
      .fn()
      .mockResolvedValueOnce([{ key_owner: '__none__', n: String(TRAFFIC_SPIKE_MIN_COUNT - 10) }])
      .mockResolvedValueOnce([]);
    const ev = await rule('traffic-spike-detected').evaluate(makeCtx({ queryAe }));
    expect(ev.breached).toBe(false);
  });
});

describe('scope-mismatch-403-rate', () => {
  it('pages above 5 rejected-403s/min over the 15-min window', async () => {
    const queryAe = vi.fn().mockResolvedValue([{ n: '90' }]); // 6/min
    const ev = await rule('scope-mismatch-403-rate').evaluate(makeCtx({ queryAe }));
    expect(ev.breached).toBe(true);
    expect(ev.severity).toBe('page');
  });
  it('does not breach at low 403 volume', async () => {
    const queryAe = vi.fn().mockResolvedValue([{ n: '3' }]);
    const ev = await rule('scope-mismatch-403-rate').evaluate(makeCtx({ queryAe }));
    expect(ev.breached).toBe(false);
  });
});

describe('oauth-refresh-failure-rate', () => {
  it('pages above 20% failure with sufficient samples', async () => {
    const queryAe = vi.fn().mockResolvedValue([
      { outcome: 'error', n: '3' },
      { outcome: 'success', n: '7' },
    ]);
    const ev = await rule('oauth-refresh-failure-rate').evaluate(makeCtx({ queryAe }));
    expect(ev.breached).toBe(true);
  });
  it('min-sample guard: 1 failure out of 2 attempts does not page', async () => {
    const queryAe = vi.fn().mockResolvedValue([
      { outcome: 'error', n: '1' },
      { outcome: 'success', n: '1' },
    ]);
    const ev = await rule('oauth-refresh-failure-rate').evaluate(makeCtx({ queryAe }));
    expect(ev.breached).toBe(false);
  });
});

describe('sentry-envelope-post-failure-rate', () => {
  it('fails open when Upstash is unbound', async () => {
    const ev = await rule('sentry-envelope-post-failure-rate').evaluate(makeCtx());
    expect(ev.breached).toBe(false);
    expect(ev.observed.upstashUnavailable).toBe(1);
  });
  it('tickets above 10% failure with >= 10 attempts', async () => {
    mockCreateMcpClient.mockReturnValue({
      mget: vi.fn().mockResolvedValue(['16', '4']), // 4/20 = 20%
    } as never);
    const ev = await rule('sentry-envelope-post-failure-rate').evaluate(makeCtx());
    expect(ev.breached).toBe(true);
    expect(ev.severity).toBe('ticket');
  });
  it('min-attempt guard: 1 failure of 2 attempts does not breach', async () => {
    mockCreateMcpClient.mockReturnValue({
      mget: vi.fn().mockResolvedValue(['1', '1']),
    } as never);
    const ev = await rule('sentry-envelope-post-failure-rate').evaluate(makeCtx());
    expect(ev.breached).toBe(false);
  });
});
