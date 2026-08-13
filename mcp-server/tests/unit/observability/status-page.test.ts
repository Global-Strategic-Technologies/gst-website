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

// BL-122 — a rule that could not check must not render as `ok`. There are
// three real conditions (passed / breached / could-not-check) and only two
// boolean states, so an unreachable data source used to surface as green.
describe('buildStatusHtml — unverified rules render as unknown', () => {
  const withRules = (rules: unknown[]) =>
    ({
      get: vi.fn(async () => ({
        evaluatedAt: '2026-08-13T13:00:00.000Z',
        env: 'production',
        rules,
      })),
    }) as never;

  const rule = (over: Record<string, unknown>) => ({
    id: 'traffic-spike-detected',
    breached: false,
    suppressed: false,
    severity: 'ticket',
    summary: 'x',
    observed: {},
    ...over,
  });

  // Scope to the rule's own <tr>: the Substrate panel above also renders `ok`.
  const alertRow = (html: string, id: string) =>
    html.match(new RegExp(`<tr><td>${id}</td>.*?</tr>`))?.[0] ?? '';

  it('renders `unknown`, not `ok`, when the rule could not evaluate', async () => {
    mockCreateMcpClient.mockReturnValue(withRules([rule({ evaluated: false })]));
    const row = alertRow(await buildStatusHtml(ENV), 'traffic-spike-detected');
    expect(row).toContain('>unknown<');
    expect(row).not.toContain('>ok<');
  });

  it('still renders `ok` for a rule that genuinely evaluated', async () => {
    mockCreateMcpClient.mockReturnValue(withRules([rule({})]));
    const row = alertRow(await buildStatusHtml(ENV), 'traffic-spike-detected');
    expect(row).toContain('>ok<');
    expect(row).not.toContain('>unknown<');
  });

  it('a thrown rule stays `eval-error` — distinct from could-not-check', async () => {
    mockCreateMcpClient.mockReturnValue(withRules([rule({ error: 'boom', evaluated: false })]));
    const row = alertRow(await buildStatusHtml(ENV), 'traffic-spike-detected');
    expect(row).toContain('>eval-error<');
    expect(row).not.toContain('>unknown<');
  });

  // The point of the state is that it is visually separable at a glance, so
  // the colours are part of the contract, not styling incidental to it.
  it('gives ok / unknown / breached three different colours', async () => {
    mockCreateMcpClient.mockReturnValue(
      withRules([
        rule({ id: 'a' }),
        rule({ id: 'b', evaluated: false }),
        rule({ id: 'c', breached: true }),
        rule({ id: 'd', error: 'boom' }),
      ])
    );
    const html = await buildStatusHtml(ENV);
    // Row-scoped: the Substrate panel renders `ok` spans too, and an unscoped
    // match would read THAT green — so recolouring only the alert table's `ok`
    // would slip through.
    const colorOf = (id: string) =>
      alertRow(html, id).match(/color:(#[0-9a-f]{6});font-weight:600"/)?.[1];

    const ok = colorOf('a');
    const unknown = colorOf('b');
    const breached = colorOf('c');
    const evalError = colorOf('d');

    for (const [name, c] of Object.entries({ ok, unknown, breached, evalError })) {
      expect(c, `${name} should render a colour`).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(new Set([ok, unknown, breached, evalError]).size).toBe(4);
    // `unknown` must not borrow the ok colour — that is the whole defect.
    expect(unknown).not.toBe(ok);
  });
});

describe('buildStatusHtml — BL-033 Slice 4 panels', () => {
  const METRICS_KEY = 'mcp:status:metrics:production';

  const withMetrics = (toolLatency: unknown) =>
    keyedRedis({
      [METRICS_KEY]: {
        evaluatedAt: '2026-07-26T14:00:00.000Z',
        toolLatency,
        audit: {
          lastSeq: 42,
          batches24h: 7,
          records24h: 55,
          lastProcessedAt: '2026-07-26T14:00:00Z',
        },
      },
    });

  it('renders per-tool I/O wait as PLAIN values (no badge/threshold markup)', async () => {
    mockCreateMcpClient.mockReturnValue(
      withMetrics([{ name: 'search_portfolio', p50Ms: 5, p95Ms: 12, p99Ms: 30, n: 100 }])
    );
    const html = await buildStatusHtml(ENV);
    expect(html).toContain('Upstream I/O wait per tool');
    expect(html).toContain('search_portfolio');
    expect(html).toContain('<td>5</td>');
    expect(html).toContain('<td>12</td>');
    expect(html).toContain('as of 2026-07-26T14:00:00.000Z');
    // The footnote has to say what the number actually is, or the panel is
    // mislabelled exactly the way BL-122 found it.
    expect(html).toContain('blocked on Upstash');
    expect(html).toContain('omitted rather than shown as 0');
    // Surface-not-ratify: values are NOT wrapped in the badge color spans.
    expect(html).not.toMatch(/color:#0a7d4f[^<]*>\s*5\s*</);
    expect(html).not.toContain('500ms');
  });

  // BL-122 — the filter is on the MEASUREMENT, not a tool-name allowlist.
  it('omits rows with no measurable I/O wait, keeps the ones that have it', async () => {
    mockCreateMcpClient.mockReturnValue(
      withMetrics([
        { name: 'search_regulations', p50Ms: 0, p95Ms: 0, p99Ms: 0, n: 326 },
        { name: 'search_radar', p50Ms: 247, p95Ms: 850, p99Ms: 2069, n: 60 },
      ])
    );
    const html = await buildStatusHtml(ENV);
    expect(html).not.toContain('search_regulations');
    expect(html).toContain('search_radar');
    expect(html).toContain('<td>2069</td>');
  });

  // The case a p50-based filter gets wrong: a tool that only reaches the
  // network on a cache miss. It has real latency and must survive.
  it('keeps a conditional-I/O tool whose p50 is 0 but p99 is not', async () => {
    mockCreateMcpClient.mockReturnValue(
      withMetrics([{ name: 'get_latest_insights', p50Ms: 0, p95Ms: 0, p99Ms: 443, n: 12 }])
    );
    const html = await buildStatusHtml(ENV);
    expect(html).toContain('get_latest_insights');
    expect(html).toContain('<td>443</td>');
  });

  // The two empty states must stay distinguishable — conflating them is why
  // the filter lives at render rather than inside computeToolLatency.
  it('distinguishes "no events" from "events, none measurable"', async () => {
    mockCreateMcpClient.mockReturnValue(withMetrics([]));
    const noEvents = await buildStatusHtml(ENV);
    expect(noEvents).toContain('no tool_invocation events in the last 7 days');
    expect(noEvents).not.toContain('none with measurable I/O wait');

    mockCreateMcpClient.mockReturnValue(
      withMetrics([
        { name: 'search_regulations', p50Ms: 0, p95Ms: 0, p99Ms: 0, n: 326 },
        { name: 'compute_techpar', p50Ms: 0, p95Ms: 0, p99Ms: 0, n: 13 },
      ])
    );
    const noneMeasurable = await buildStatusHtml(ENV);
    expect(noneMeasurable).toContain('2 tools invoked, none with measurable I/O wait');
    expect(noneMeasurable).not.toContain('no tool_invocation events in the last 7 days');
  });

  // ADR-0014 deactivated the audit pipeline; AUDIT_QUEUE is unbound in every
  // env, and the panel must not advertise a pipeline that is not running.
  it('hides the audit panel while AUDIT_QUEUE is unbound, shows it when bound', async () => {
    mockCreateMcpClient.mockReturnValue(
      withMetrics([{ name: 'search_radar', p50Ms: 1, p95Ms: 2, p99Ms: 3, n: 4 }])
    );
    const hidden = await buildStatusHtml(ENV);
    expect(hidden).not.toContain('Audit log');
    expect(hidden).not.toContain('<td>42</td>');

    mockCreateMcpClient.mockReturnValue(
      withMetrics([{ name: 'search_radar', p50Ms: 1, p95Ms: 2, p99Ms: 3, n: 4 }])
    );
    const bound = await buildStatusHtml({ ...ENV, AUDIT_QUEUE: {} } as unknown as Env);
    expect(bound).toContain('Audit log');
    expect(bound).toContain('<td>42</td>');
  });

  it('renders "metrics unavailable" when the metrics cache is absent (page still renders)', async () => {
    mockCreateMcpClient.mockReturnValue(keyedRedis({})); // no metrics key
    const html = await buildStatusHtml(ENV);
    expect(html).toContain('OPERATIONAL'); // page still renders end-to-end
    expect(html).toContain('metrics unavailable');
  });
});
