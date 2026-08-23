/**
 * BL-033 Slice 4 — status-page metrics (precompute + read).
 *
 * `/status` follows a precompute-and-cache pattern: the 15-min alert-evaluator
 * cron computes these metrics from Analytics Engine (+ the audit chain tip)
 * and caches them to Upstash; the page reads the cache (`readStatusMetrics`).
 * There is NO live AE query on the render path (a `Cache-Control` header on a
 * Worker `Response` doesn't edge-cache, so per-render AE reads would cost real
 * quota + latency on every hit).
 *
 * **Surface, don't ratify** (operator directive): the numbers here are raw
 * observability. The page renders them as plain values — no SLA thresholds,
 * no pass/fail badges. The deferred tool-latency SLO stays deferred
 * (`observability/slo-baselines.md`).
 */
import { createMcpClient } from '../lib/upstash-clients';
import type { AeQuery } from './ae-query';
import type { Env } from '../env';

/** Upstash key holding the latest precomputed status metrics (read by /status). */
export const STATUS_METRICS_KEY = (envName: string) => `mcp:status:metrics:${envName}`;
const STATUS_METRICS_TTL_SECONDS = 3600; // > the 15-min cron cadence

export interface ToolLatencyRow {
  name: string;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  /** Sampling-corrected invocation count over the window. */
  n: number;
}

export interface AuditHealth {
  /** Highest committed audit seq (total records ever chained), from the Upstash chain tip. */
  lastSeq: number | null;
  /** Batches processed in the last 24h (sampling-corrected). */
  batches24h: number | null;
  /** Records committed in the last 24h (sum of batch sizes). */
  records24h: number | null;
  /** ISO timestamp of the most recent processed batch, or null. */
  lastProcessedAt: string | null;
}

export interface StatusMetrics {
  evaluatedAt: string;
  /** null when AE is unbound / the query failed (render shows "unavailable"). */
  toolLatency: ToolLatencyRow[] | null;
  audit: AuditHealth;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Compute the status metrics from AE + the audit chain tip. Called from the
 * evaluator cron with the run's shared `aeQuery` + `redis`. Never throws — a
 * failed sub-query degrades that field to null/0, not the whole blob.
 */
export async function computeStatusMetrics(
  aeQuery: AeQuery,
  redis: ReturnType<typeof createMcpClient>,
  dataset: string,
  envName: string
): Promise<StatusMetrics> {
  const toolLatency = await computeToolLatency(aeQuery, dataset);
  const audit = await computeAuditHealth(aeQuery, redis, dataset, envName);
  return { evaluatedAt: new Date().toISOString(), toolLatency, audit };
}

async function computeToolLatency(
  aeQuery: AeQuery,
  dataset: string
): Promise<ToolLatencyRow[] | null> {
  // Proven percentile shape (invoke-ae-baseline.mjs): GROUP BY raw blob2 (the
  // AE dialect rejects the alias), weight quantiles + count by _sample_interval.
  // Includes probe/synthetic traffic — it's real server-side handler latency,
  // and excluding index1='PROBE' would leave the panel empty pre-pilot.
  const rows = await aeQuery(
    `SELECT blob2 AS name,
            quantileWeighted(0.5,  double1, _sample_interval) AS p50_ms,
            quantileWeighted(0.95, double1, _sample_interval) AS p95_ms,
            quantileWeighted(0.99, double1, _sample_interval) AS p99_ms,
            sum(_sample_interval) AS n
     FROM ${dataset}
     WHERE blob1 = 'tool_invocation' AND timestamp >= NOW() - INTERVAL '7' DAY
     GROUP BY blob2
     ORDER BY n DESC`
  );
  if (rows == null) return null;
  return rows.map((r) => ({
    name: String(r.name ?? '—'),
    p50Ms: Math.round(num(r.p50_ms)),
    p95Ms: Math.round(num(r.p95_ms)),
    p99Ms: Math.round(num(r.p99_ms)),
    n: Math.round(num(r.n)),
  }));
}

async function computeAuditHealth(
  aeQuery: AeQuery,
  redis: ReturnType<typeof createMcpClient>,
  dataset: string,
  envName: string
): Promise<AuditHealth> {
  // Chain tip (total records committed) — same key the audit consumer writes.
  let lastSeq: number | null = null;
  try {
    const tip = await redis?.get<{ lastSeq?: number } | string | null>(
      `mcp:audit:chain-tip:${envName}`
    );
    const parsed = typeof tip === 'string' ? (JSON.parse(tip) as { lastSeq?: number }) : tip;
    if (parsed && typeof parsed.lastSeq === 'number') lastSeq = parsed.lastSeq;
  } catch {
    lastSeq = null;
  }

  // Batch throughput + last-processed from the audit_batch AE event.
  const rows = await aeQuery(
    `SELECT sum(_sample_interval) AS batches,
            sum(double2) AS records,
            max(timestamp) AS last_ts
     FROM ${dataset}
     WHERE blob1 = 'audit_batch' AND timestamp >= NOW() - INTERVAL '1' DAY`
  );
  const row = rows?.[0];
  return {
    lastSeq,
    batches24h: row ? Math.round(num(row.batches)) : null,
    records24h: row ? Math.round(num(row.records)) : null,
    lastProcessedAt: row && row.last_ts != null ? String(row.last_ts) : null,
  };
}

/** Persist the precomputed metrics (best-effort — caller wraps in try/catch). */
export async function writeStatusMetrics(
  redis: NonNullable<ReturnType<typeof createMcpClient>>,
  envName: string,
  metrics: StatusMetrics
): Promise<void> {
  await redis.set(STATUS_METRICS_KEY(envName), JSON.stringify(metrics), {
    ex: STATUS_METRICS_TTL_SECONDS,
  });
}

/** Read the cached metrics for /status. Tolerates string-or-object; null on miss. */
export async function readStatusMetrics(env: Env): Promise<StatusMetrics | null> {
  try {
    const redis = createMcpClient(env);
    if (!redis) return null;
    const envName = (env.ENV_NAME as string | undefined) ?? 'unknown';
    const raw = await redis.get<StatusMetrics | string | null>(STATUS_METRICS_KEY(envName));
    if (raw == null) return null;
    return typeof raw === 'string' ? (JSON.parse(raw) as StatusMetrics) : raw;
  } catch {
    return null;
  }
}
