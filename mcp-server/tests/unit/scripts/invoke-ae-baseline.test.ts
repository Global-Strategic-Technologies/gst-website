/**
 * Unit tests for the BL-032.75 Phase 2 baselining pull script's pure
 * functions (query builders + markdown formatters + SLO calibration).
 * No network I/O — the live AE SQL API call stays behind the CLI guard.
 */

import { describe, it, expect } from 'vitest';
import {
  DATASETS,
  CALIBRATION,
  MIN_EVENTS_FOR_SLO,
  buildBaselineQueries,
  assertAeResponseShape,
  formatLatencyTable,
  formatSpendTable,
  proposeSloTargets,
} from '../../../scripts/invoke-ae-baseline.mjs';

/**
 * Fixture mirroring the AE SQL API `FORMAT JSON` response shape used by
 * Verify-AeEmission.ps1 (`{ data: [...] }` with stringly-typed numbers,
 * as the API returns).
 */
const LATENCY_FIXTURE = {
  data: [
    {
      event_type: 'tool_invocation',
      name: 'search_portfolio',
      outcome: 'success',
      p50_ms: '12.4',
      p95_ms: '48.2',
      p99_ms: '91.7',
      event_count: '412',
    },
    {
      event_type: 'tool_invocation',
      name: 'compose_dossier_envelope',
      outcome: 'success',
      p50_ms: '155.0',
      p95_ms: '402.6',
      p99_ms: '633.1',
      event_count: '38',
    },
    {
      event_type: 'tool_invocation',
      name: 'search_portfolio',
      outcome: 'error',
      p50_ms: '8.1',
      p95_ms: '20.0',
      p99_ms: '22.5',
      event_count: '3',
    },
    {
      // below MIN_EVENTS_FOR_SLO — must appear in the baseline table but
      // NOT receive a proposed latency SLO
      event_type: 'prompt_invocation',
      name: 'gst_irl_ingestion',
      outcome: 'success',
      p50_ms: '2.0',
      p95_ms: '5.0',
      p99_ms: '6.0',
      event_count: '4',
    },
  ],
};

const SPEND_FIXTURE = {
  data: [
    { category: 'cron-radar', zone1: '1', status_code: '200', call_count: '168' },
    { category: 'oauth-refresh', zone1: '0', status_code: '200', call_count: '28' },
    { category: 'cron-radar', zone1: '1', status_code: '429', call_count: '2' },
  ],
};

describe('buildBaselineQueries', () => {
  it('builds the latency query with raw-column GROUP BY (proven AE dialect)', () => {
    const { latencySql } = buildBaselineQueries({ dataset: 'mcp_events', windowDays: 7 });
    expect(latencySql).toContain('GROUP BY blob1, blob2, blob4');
    expect(latencySql).toContain("INTERVAL '7' DAY");
    expect(latencySql).toContain('quantileWeighted(0.95, double1, _sample_interval)');
    expect(latencySql).toContain('FROM mcp_events');
    expect(latencySql).toContain('FORMAT JSON');
  });

  it('builds the spend query with the CORRECTED column map (category=blob2, status_code=blob6)', () => {
    const { spendSql } = buildBaselineQueries({ dataset: 'mcp_events', windowDays: 7 });
    expect(spendSql).toContain('blob2 AS category');
    expect(spendSql).toContain('blob6 AS status_code');
    expect(spendSql).toContain('blob7 AS zone1');
    expect(spendSql).toContain("blob1 = 'inoreader_call'");
    expect(spendSql).toContain('GROUP BY blob2, blob7, blob6');
    // regression lock on the stale pre-schema aliases the original doc used
    expect(spendSql).not.toContain('blob3 AS category');
    expect(spendSql).not.toContain('blob5 AS status_code');
  });

  it('targets the staging dataset when asked', () => {
    const { latencySql } = buildBaselineQueries({
      dataset: DATASETS.staging,
      windowDays: 3,
    });
    expect(latencySql).toContain('FROM mcp_events_staging');
    expect(latencySql).toContain("INTERVAL '3' DAY");
  });

  it('rejects unknown datasets and out-of-range windows', () => {
    expect(() => buildBaselineQueries({ dataset: 'nope', windowDays: 7 })).toThrow(
      /Unknown dataset/
    );
    expect(() => buildBaselineQueries({ dataset: 'mcp_events', windowDays: 0 })).toThrow(/1-90/);
    expect(() => buildBaselineQueries({ dataset: 'mcp_events', windowDays: 91 })).toThrow(/1-90/);
    expect(() => buildBaselineQueries({ dataset: 'mcp_events', windowDays: 7.5 })).toThrow(/1-90/);
  });
});

describe('assertAeResponseShape', () => {
  it('returns the data array on a well-shaped response', () => {
    expect(assertAeResponseShape({ data: [] }, 'x')).toEqual([]);
  });
  it('fails loudly on malformed responses (first live execution of these SQL forms)', () => {
    expect(() => assertAeResponseShape({ errors: ['boom'] }, 'latency query')).toThrow(
      /latency query has no data array/
    );
    expect(() => assertAeResponseShape(null, 'x')).toThrow(/no data array/);
  });
});

describe('formatLatencyTable', () => {
  it('renders one markdown row per result with 1-decimal quantiles', () => {
    const out = formatLatencyTable(LATENCY_FIXTURE);
    const lines = out.split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe(
      '| tool_invocation | search_portfolio | success | 412 | 12.4 | 48.2 | 91.7 |'
    );
    expect(lines[2]).toContain('| error | 3 |');
  });
  it('renders a placeholder row for an empty window', () => {
    expect(formatLatencyTable({ data: [] })).toContain('no events in window');
  });
});

describe('formatSpendTable', () => {
  it('annotates Zone-1 rows against the daily cap', () => {
    const out = formatSpendTable(SPEND_FIXTURE);
    const lines = out.split('\n');
    expect(lines[0]).toBe('| cron-radar | 1 | 200 | 168 | Zone-1 (counts toward 100/day cap) |');
    expect(lines[1]).toContain('non-Zone-1');
  });
});

describe('proposeSloTargets', () => {
  it('derives latency targets as ceil(p95 × 1.5) for success surfaces above the sample floor', () => {
    const out = proposeSloTargets(LATENCY_FIXTURE);
    // 48.2 × 1.5 = 72.3 → 73; 402.6 × 1.5 = 603.9 → 604
    expect(out).toContain('| tool_invocation/search_portfolio | latency p95 | 48.2 ms | 73 ms |');
    expect(out).toContain(
      '| tool_invocation/compose_dossier_envelope | latency p95 | 402.6 ms | 604 ms |'
    );
  });

  it('excludes error outcomes and below-floor sample counts', () => {
    const out = proposeSloTargets(LATENCY_FIXTURE);
    // the error row for search_portfolio must not produce a second latency SLO
    expect(out.match(/search_portfolio \| latency/g)).toHaveLength(1);
    // 4 events < MIN_EVENTS_FOR_SLO
    expect(out).not.toContain('gst_irl_ingestion | latency');
    expect(MIN_EVENTS_FOR_SLO).toBeGreaterThan(4);
  });

  it('always emits the rule-derived availability + freshness rows', () => {
    const out = proposeSloTargets({ data: [] });
    expect(out).toContain('availability (error rate)');
    expect(out).toContain(`< ${CALIBRATION.availabilitySustainedPct}% sustained`);
    expect(out).toContain('age ≤ 43200 s (12h)');
    expect(out).toContain('10× rolling hourly baseline');
  });
});
