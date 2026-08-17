/**
 * Unit tests for the SLO alert evaluator orchestration (BL-032.75 Phase 3):
 * breach → fingerprinted Sentry issue event; cooldown suppression; per-rule
 * fail-open; /status summary persistence; own AE cron_outcome emission; and
 * the free-tier invariant that the evaluator NEVER posts Crons check-ins.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRules, mockPostEvent, mockPostCheckIn, mockCreateMcpClient, mockEmit } = vi.hoisted(
  () => ({
    mockRules: [] as unknown[],
    mockPostEvent: vi.fn(),
    mockPostCheckIn: vi.fn(),
    mockCreateMcpClient: vi.fn(() => null),
    mockEmit: vi.fn(),
  })
);

vi.mock('../../../src/observability/alert-rules', () => ({
  ALERT_RULES: mockRules,
  COOLDOWN_SECONDS: { page: 7200, ticket: 21600 },
  datasetForEnv: () => 'mcp_events',
}));
vi.mock('../../../src/observability/sentry-envelope', () => ({
  postSentryEvent: mockPostEvent,
  postSentryCheckIn: mockPostCheckIn,
}));
vi.mock('../../../src/lib/upstash-clients', () => ({
  createMcpClient: mockCreateMcpClient,
}));
vi.mock('../../../src/metrics/_index', () => ({
  emit: mockEmit,
  AnalyticsEngineSink: vi.fn(),
}));

import { runAlertEvaluation, LAST_EVAL_KEY } from '../../../src/observability/alert-evaluator';
import type { Env } from '../../../src/worker';

const NOW = new Date('2026-07-14T15:30:00Z');

const makeRule = (id: string, evaluate: () => Promise<unknown>) => ({
  id,
  runbook: `observability/runbooks/${id}.md`,
  evaluate,
});

const breach = (severity: 'page' | 'ticket') =>
  Promise.resolve({
    breached: true,
    severity,
    summary: 'breached in test',
    observed: { value: 42 },
  });

const healthy = () =>
  Promise.resolve({ breached: false, severity: 'ticket', summary: 'ok', observed: {} });

const stubRedis = (setResult: 'OK' | null = 'OK') => {
  const set = vi.fn().mockResolvedValue(setResult);
  // `get` is used by the BL-033 Slice 4 status-metrics precompute (chain tip).
  const get = vi.fn().mockResolvedValue(null);
  const client = { set, get } as never;
  mockCreateMcpClient.mockReturnValue(client);
  return { set, get };
};

const ENV = { ENV_NAME: 'production', METRICS: {} } as unknown as Env;

beforeEach(() => {
  mockRules.length = 0;
  mockPostEvent.mockReset();
  mockPostCheckIn.mockReset();
  mockEmit.mockReset();
  mockCreateMcpClient.mockReset();
  mockCreateMcpClient.mockReturnValue(null);
});

// BL-122 — the `evaluated` flag has to survive the Upstash round trip, since
// /status reads it back out of `mcp:alerts:last-eval` rather than from the
// rule. The key must be OMITTED for evaluated rules, not set to `undefined`:
// JSON.stringify drops undefined-valued keys, so an assignment would make the
// persisted shape differ from the in-process one.
describe('runAlertEvaluation — evaluated flag persistence', () => {
  it('persists `evaluated: false` and omits the key entirely when evaluated', async () => {
    const { set } = stubRedis();
    mockRules.push(
      makeRule('unknown-rule', () =>
        Promise.resolve({
          breached: false,
          evaluated: false,
          severity: 'ticket',
          summary: 'AE unavailable — fail open',
          observed: {},
        })
      ),
      makeRule('evaluated-rule', healthy)
    );

    await runAlertEvaluation(ENV);

    const write = set.mock.calls.find((c) => c[0] === LAST_EVAL_KEY);
    expect(write, 'the summary should be written').toBeDefined();
    const raw = write![1];
    const persisted = JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw));

    const unknown = persisted.rules.find((r: { id: string }) => r.id === 'unknown-rule');
    const evaluated = persisted.rules.find((r: { id: string }) => r.id === 'evaluated-rule');

    expect(unknown.evaluated).toBe(false);
    // `in`, not toBeUndefined() — the latter cannot tell an omitted key from
    // one explicitly set to undefined, which is the whole distinction here.
    expect('evaluated' in evaluated).toBe(false);
  });
});

describe('runAlertEvaluation', () => {
  it('posts a fingerprinted Sentry event per un-suppressed breach and NEVER a Crons check-in', async () => {
    stubRedis('OK');
    mockRules.push(
      makeRule('radar-snapshot-stale', () => breach('page')),
      makeRule('health-check-failing', healthy)
    );

    const summary = await runAlertEvaluation(ENV, { now: NOW });

    expect(mockPostEvent).toHaveBeenCalledTimes(1);
    expect(mockPostEvent).toHaveBeenCalledWith(
      ENV,
      expect.objectContaining({
        level: 'error', // page → error
        message: expect.stringContaining('slo-alert.radar-snapshot-stale'),
        tags: expect.objectContaining({
          event: 'slo-alert',
          rule: 'radar-snapshot-stale',
          severity: 'page',
          environment: 'production',
        }),
        fingerprint: ['slo-alert', 'radar-snapshot-stale', 'page', '2026-07-14'],
      })
    );
    // Free-tier invariant: the single Crons monitor belongs to radar-refresh.
    expect(mockPostCheckIn).not.toHaveBeenCalled();
    expect(summary.rules).toHaveLength(2);
    expect(summary.rules[0].breached).toBe(true);
    expect(summary.rules[1].breached).toBe(false);
  });

  it('ticket-severity breaches post at warning level', async () => {
    stubRedis('OK');
    mockRules.push(makeRule('inoreader-budget-exhausted', () => breach('ticket')));
    await runAlertEvaluation(ENV, { now: NOW });
    expect(mockPostEvent).toHaveBeenCalledWith(ENV, expect.objectContaining({ level: 'warning' }));
  });

  it('suppresses re-fires within the cooldown window (SET NX returns null)', async () => {
    const { set } = stubRedis(null); // cooldown key already held
    mockRules.push(makeRule('radar-snapshot-stale', () => breach('page')));

    const summary = await runAlertEvaluation(ENV, { now: NOW });

    expect(set).toHaveBeenCalledWith(
      'mcp:alerts:last-fired:radar-snapshot-stale',
      expect.any(String),
      { nx: true, ex: 7200 }
    );
    expect(mockPostEvent).not.toHaveBeenCalled();
    expect(summary.rules[0].suppressed).toBe(true);
  });

  it('a throwing rule fails open and does not mask the other rules', async () => {
    stubRedis('OK');
    mockRules.push(
      makeRule('health-check-failing', () => Promise.reject(new Error('probe exploded'))),
      makeRule('radar-snapshot-stale', () => breach('page'))
    );

    const summary = await runAlertEvaluation(ENV, { now: NOW });

    expect(summary.rules[0].error).toContain('probe exploded');
    expect(summary.rules[0].breached).toBe(false);
    expect(mockPostEvent).toHaveBeenCalledTimes(1); // the healthy rule's breach still posts
    // Rule errors mark the evaluator's own AE outcome as partial.
    expect(mockEmit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        event_type: 'cron_outcome',
        name: 'alert-evaluator',
        outcome: 'partial',
      })
    );
  });

  it('persists the summary for /status and emits its own success AE outcome', async () => {
    const { set } = stubRedis('OK');
    mockRules.push(makeRule('health-check-failing', healthy));

    await runAlertEvaluation(ENV, { now: NOW });

    const summaryWrite = set.mock.calls.find((c) => c[0] === LAST_EVAL_KEY);
    expect(summaryWrite).toBeDefined();
    expect(JSON.parse(summaryWrite![1] as string)).toMatchObject({
      evaluatedAt: NOW.toISOString(),
      env: 'production',
    });
    expect(summaryWrite![2]).toEqual({ ex: 24 * 3600 });
    expect(mockEmit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        event_type: 'cron_outcome',
        name: 'alert-evaluator',
        outcome: 'success',
      })
    );
  });

  it('precomputes + caches the /status metrics in the same run (BL-033 Slice 4)', async () => {
    const { set } = stubRedis('OK');
    mockRules.push(makeRule('health-check-failing', healthy));

    await runAlertEvaluation(ENV, { now: NOW });

    const metricsWrite = set.mock.calls.find((c) => c[0] === 'mcp:status:metrics:production');
    expect(metricsWrite).toBeDefined();
    // The blob carries the three top-level fields the /status panels read.
    expect(JSON.parse(metricsWrite![1] as string)).toMatchObject({
      evaluatedAt: expect.any(String),
      audit: expect.any(Object),
    });
  });

  it('never throws even when Upstash and Sentry are both unavailable', async () => {
    mockCreateMcpClient.mockReturnValue(null);
    mockPostEvent.mockRejectedValue(new Error('sentry down'));
    mockRules.push(makeRule('radar-snapshot-stale', () => breach('page')));

    // postSentryEvent carries its own never-throws contract in prod; the
    // evaluator's OWN never-throws contract must survive even a contract
    // regression in that dependency (the breach stays visible on /status).
    const summary = await runAlertEvaluation({ ENV_NAME: 'production' } as unknown as Env, {
      now: NOW,
    });
    expect(summary.rules[0].breached).toBe(true);
  });
});
