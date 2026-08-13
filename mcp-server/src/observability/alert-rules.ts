/**
 * BL-032.75 Phase 3 — the 7 canonical SLO alert rules.
 *
 * **Config-as-code, TypeScript not YAML** (recorded deviation from the
 * design doc): these rules EXECUTE inside the Worker (the alert-evaluator
 * cron), so a YAML file would need a parser in the bundle and would
 * forfeit type-checking against `Env` and the threshold constants. TS in
 * repo is the established config idiom here (`metrics/_schema.ts`).
 *
 * **Threshold provenance**: every threshold constant below cites its row
 * in `mcp-server/observability/slo-baselines.md` § "Proposed SLO targets"
 * — signed off by the operator on 2026-07-14. Changing a threshold means
 * changing the signed-off doc first (or recording an amendment there),
 * not just editing a constant.
 *
 * **Evaluation contract**: each rule's `evaluate` receives an
 * `EvaluatorContext` and returns an `AlertEvaluation`. Rules must be
 * fail-open: an unreachable data source (AE secrets unbound, Upstash
 * down) returns `breached: false` with the gap recorded in `observed`,
 * never a throw. The evaluator additionally wraps each rule in
 * try/catch, but the contract belongs to the rules too.
 *
 * **Free-tier Sentry constraints** (verified 2026-07-10): breaches post
 * fingerprinted ISSUE EVENTS routed to email rules — never Crons
 * check-ins (the single free-tier monitor is already used by
 * radar-refresh). Severity maps to the two Sentry UI email rules
 * documented in SENTRY_ALERT_RULES.md § SLO alert rules.
 */

import { readInoreaderSpend, ZONE1_DAILY_HARD_CAP } from '../lib/inoreader-egress';
import { buildHealthPayload, probeRadarSnapshotAge } from './health';
import { createMcpClient } from '../lib/upstash-clients';
import type { Env } from '../worker';

// ─── Thresholds (signed-off slo-baselines.md values, 2026-07-14) ────────

/** Budget rule: ticket at 70% / page at 90% of the 100/day Zone-1 hard cap. */
export const BUDGET_TICKET_RATIO = 0.7;
export const BUDGET_PAGE_RATIO = 0.9;

/** Freshness SLO: radar snapshot age ≤ 2 × 6h cron = 43,200 s. */
export const FRESHNESS_MAX_AGE_SECONDS = 43_200;

/** Scope-mismatch attack signal: > 5 rejected-403s/min over a 15-min window. */
export const SCOPE_403_PER_MINUTE = 5;
export const SCOPE_403_WINDOW_MINUTES = 15;

/** OAuth refresh failure rate: > 20% over 1h, min 5 attempts. */
export const OAUTH_FAILURE_RATE = 0.2;
export const OAUTH_MIN_SAMPLES = 5;

/** Sentry envelope delivery failure rate: > 10% over the UTC day, min 10 attempts. */
export const ENVELOPE_FAILURE_RATE = 0.1;
export const ENVELOPE_MIN_ATTEMPTS = 10;

/**
 * Traffic spike: current hour > 10 × the trailing-7-day hourly mean.
 * The absolute floor guards the thin-traffic reality the 2026-07-14
 * baseline measured (zero client tool calls in production) — without it,
 * the first genuine user would page as a 0→N "spike."
 */
export const TRAFFIC_SPIKE_MULTIPLIER = 10;
export const TRAFFIC_SPIKE_MIN_COUNT = 30;

/**
 * keyOwners excluded from the traffic-spike rule (BL-033 latency probe).
 *
 * Synthetic traffic is scheduled and volume-bounded by design (the probe
 * issues ~32 tool calls per run — above the 30/h floor, so WITHOUT this
 * exclusion the rule would breach on every probe run and page for days
 * until a trailing mean accumulates). It is not the anomalous-client
 * behavior this rule detects, and runaway-probe protection already
 * exists at the rate-limiter layer (per-key 60/min + 1000/day).
 * Add future synthetic keys here deliberately — never widen to real
 * team/client keyOwners.
 */
export const SYNTHETIC_KEY_OWNERS: ReadonlySet<string> = new Set(['PROBE']);

/** Breach cooldowns — bound Sentry event volume on the free tier. */
export const COOLDOWN_SECONDS: Record<AlertSeverity, number> = {
  page: 2 * 3600,
  ticket: 6 * 3600,
};

// ─── Shapes ──────────────────────────────────────────────────────────────

export type AlertSeverity = 'ticket' | 'page';

export interface AlertEvaluation {
  breached: boolean;
  /** Meaningful when `breached`; the non-breach value is the rule's default class. */
  severity: AlertSeverity;
  /** One-line, operator-facing; becomes the Sentry event message on breach. */
  summary: string;
  /** Raw numbers behind the verdict — Sentry `extra` + /status surface. */
  observed: Record<string, number | string | null>;
}

export interface EvaluatorContext {
  env: Env;
  /**
   * Run an AE SQL query. Returns the response rows, or `null` when the
   * AE secrets are unbound or the query failed — rules treat `null` as
   * "data source unavailable" and fail open.
   */
  queryAe(sql: string): Promise<Record<string, string | number>[] | null>;
  now: Date;
}

export interface AlertRule {
  id: string;
  /** Repo-relative runbook path — surfaced in the Sentry event + /status. */
  runbook: string;
  evaluate(ctx: EvaluatorContext): Promise<AlertEvaluation>;
}

// ─── AE dataset selection ────────────────────────────────────────────────

/** ENV_NAME → AE dataset (mirrors wrangler.toml analytics_engine_datasets). */
export function datasetForEnv(envName: string | undefined): string {
  if (envName === 'production') return 'mcp_events';
  if (envName === 'staging') return 'mcp_events_staging';
  return 'mcp_events_dev';
}

const num = (v: string | number | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ─── The 7 canonical rules ───────────────────────────────────────────────

const inoreaderBudgetExhausted: AlertRule = {
  id: 'inoreader-budget-exhausted',
  runbook: 'observability/runbooks/inoreader-budget-exhausted.md',
  async evaluate({ env }): Promise<AlertEvaluation> {
    const spend = await readInoreaderSpend(env);
    const ratio = spend.total / ZONE1_DAILY_HARD_CAP;
    const breached = ratio >= BUDGET_TICKET_RATIO;
    return {
      breached,
      severity: ratio >= BUDGET_PAGE_RATIO ? 'page' : 'ticket',
      summary: `Inoreader Zone-1 spend at ${spend.total}/${ZONE1_DAILY_HARD_CAP} (${Math.round(ratio * 100)}% of daily hard cap)`,
      observed: {
        total: spend.total,
        cap: ZONE1_DAILY_HARD_CAP,
        ratioPct: Math.round(ratio * 100),
      },
    };
  },
};

const radarSnapshotStale: AlertRule = {
  id: 'radar-snapshot-stale',
  runbook: 'observability/runbooks/radar-snapshot-stale.md',
  async evaluate({ env }): Promise<AlertEvaluation> {
    const age = await probeRadarSnapshotAge(env);
    // null = snapshot never populated OR Upstash unreachable. Fail open —
    // the health-check-failing rule owns the Upstash-down signal, and a
    // cold cache pre-first-cron is not an incident.
    const breached = age !== null && age > FRESHNESS_MAX_AGE_SECONDS;
    return {
      breached,
      severity: 'page',
      summary: `Radar FYI snapshot age ${age ?? 'unknown'}s vs ${FRESHNESS_MAX_AGE_SECONDS}s freshness SLO (2× 6h cron)`,
      observed: { ageSeconds: age, sloSeconds: FRESHNESS_MAX_AGE_SECONDS },
    };
  },
};

const healthCheckFailing: AlertRule = {
  id: 'health-check-failing',
  runbook: 'observability/runbooks/health-check-failing.md',
  async evaluate({ env }): Promise<AlertEvaluation> {
    // Direct in-process evaluation — a Worker cannot HTTP-fetch its own
    // hostname (Cloudflare recursion protection), and buildHealthPayload
    // never throws / never 5xxes, so the canonical "external 5xx"
    // formulation is deliberately narrowed to the payload's own degraded
    // signals. External-observer 5xx coverage is deferred with the
    // Grafana/uptime-monitor item (see design doc § deferred).
    const health = await buildHealthPayload(env);
    const upstashDegraded = health.upstashMcp === 'degraded';
    const breached = upstashDegraded || !health.ok;
    return {
      breached,
      severity: upstashDegraded ? 'page' : 'ticket',
      // Neutral prefix, not a verdict. `summary` is authored for the Sentry
      // event on breach — but /status renders it on EVERY evaluation, and the
      // rule is almost always `ok`, so a hardcoded "Health degraded:" made the
      // healthy row read `state: ok · Health degraded: … ok=true`, which is a
      // self-contradiction an operator has to decode. The breach case loses
      // nothing: the Sentry issue title already carries the rule id
      // (`health-check-failing`) and the values below say what is wrong.
      summary: `Health: upstashMcp=${health.upstashMcp}, inoreader=${health.inoreader}, ok=${String(health.ok)}`,
      observed: {
        ok: health.ok ? 1 : 0,
        upstashMcp: health.upstashMcp,
        inoreader: health.inoreader,
      },
    };
  },
};

const trafficSpikeDetected: AlertRule = {
  id: 'traffic-spike-detected',
  runbook: 'observability/runbooks/traffic-spike-detected.md',
  async evaluate({ env, queryAe }): Promise<AlertEvaluation> {
    const dataset = datasetForEnv(env.ENV_NAME as string | undefined);
    const current = await queryAe(
      `SELECT index1 AS key_owner, sum(_sample_interval) AS n FROM ${dataset} WHERE blob1 = 'tool_invocation' AND timestamp >= NOW() - INTERVAL '1' HOUR GROUP BY index1`
    );
    const trailing = await queryAe(
      `SELECT index1 AS key_owner, sum(_sample_interval) AS n FROM ${dataset} WHERE blob1 = 'tool_invocation' AND timestamp >= NOW() - INTERVAL '7' DAY GROUP BY index1`
    );
    if (current === null || trailing === null) {
      return {
        breached: false,
        severity: 'ticket',
        summary: 'traffic-spike: AE unavailable (secrets unbound or query failed) — fail open',
        observed: { aeUnavailable: 1 },
      };
    }
    const trailingByKey = new Map(trailing.map((r) => [String(r.key_owner), num(r.n)]));
    let worst: { keyOwner: string; count: number; hourlyMean: number } | null = null;
    for (const row of current) {
      const keyOwner = String(row.key_owner);
      if (SYNTHETIC_KEY_OWNERS.has(keyOwner)) continue;
      const count = num(row.n);
      const hourlyMean = (trailingByKey.get(keyOwner) ?? 0) / (7 * 24);
      const threshold = Math.max(TRAFFIC_SPIKE_MIN_COUNT, hourlyMean * TRAFFIC_SPIKE_MULTIPLIER);
      if (count > threshold && (worst === null || count > worst.count)) {
        worst = { keyOwner, count, hourlyMean };
      }
    }
    return {
      breached: worst !== null,
      severity: 'ticket',
      summary: worst
        ? `Traffic spike: ${worst.keyOwner} at ${worst.count} tool calls/h vs ${worst.hourlyMean.toFixed(2)}/h trailing mean (>${TRAFFIC_SPIKE_MULTIPLIER}×, floor ${TRAFFIC_SPIKE_MIN_COUNT})`
        : 'No per-key traffic spike in the last hour',
      observed: worst
        ? {
            keyOwner: worst.keyOwner,
            countLastHour: worst.count,
            trailingHourlyMean: worst.hourlyMean,
          }
        : { spikingKeys: 0 },
    };
  },
};

const scopeMismatch403Rate: AlertRule = {
  id: 'scope-mismatch-403-rate',
  runbook: 'observability/runbooks/scope-mismatch-403-rate.md',
  async evaluate({ env, queryAe }): Promise<AlertEvaluation> {
    const dataset = datasetForEnv(env.ENV_NAME as string | undefined);
    const rows = await queryAe(
      `SELECT sum(_sample_interval) AS n FROM ${dataset} WHERE blob1 = 'tool_invocation' AND blob4 = 'error' AND blob6 = '403' AND timestamp >= NOW() - INTERVAL '${SCOPE_403_WINDOW_MINUTES}' MINUTE`
    );
    if (rows === null) {
      return {
        breached: false,
        severity: 'page',
        summary: 'scope-mismatch-403: AE unavailable — fail open',
        observed: { aeUnavailable: 1 },
      };
    }
    const count = num(rows[0]?.n);
    const perMinute = count / SCOPE_403_WINDOW_MINUTES;
    return {
      breached: perMinute > SCOPE_403_PER_MINUTE,
      severity: 'page',
      summary: `${count} scope-mismatch 403s in ${SCOPE_403_WINDOW_MINUTES} min (${perMinute.toFixed(1)}/min vs ${SCOPE_403_PER_MINUTE}/min attack-signal threshold)`,
      observed: { count, perMinute: Number(perMinute.toFixed(2)) },
    };
  },
};

const oauthRefreshFailureRate: AlertRule = {
  id: 'oauth-refresh-failure-rate',
  runbook: 'observability/runbooks/oauth-refresh-failure-rate.md',
  async evaluate({ env, queryAe }): Promise<AlertEvaluation> {
    const dataset = datasetForEnv(env.ENV_NAME as string | undefined);
    const rows = await queryAe(
      `SELECT blob4 AS outcome, sum(_sample_interval) AS n FROM ${dataset} WHERE blob1 = 'inoreader_call' AND blob2 = 'oauth-refresh' AND timestamp >= NOW() - INTERVAL '1' HOUR GROUP BY blob4`
    );
    if (rows === null) {
      return {
        breached: false,
        severity: 'page',
        summary: 'oauth-refresh-failure-rate: AE unavailable — fail open',
        observed: { aeUnavailable: 1 },
      };
    }
    let errors = 0;
    let successes = 0;
    for (const row of rows) {
      if (row.outcome === 'error') errors += num(row.n);
      else if (row.outcome === 'success') successes += num(row.n);
    }
    const attempts = errors + successes;
    const rate = attempts > 0 ? errors / attempts : 0;
    return {
      breached: attempts >= OAUTH_MIN_SAMPLES && rate > OAUTH_FAILURE_RATE,
      severity: 'page',
      summary: `OAuth refresh failure rate ${(rate * 100).toFixed(0)}% over 1h (${errors}/${attempts}, threshold ${OAUTH_FAILURE_RATE * 100}%, min ${OAUTH_MIN_SAMPLES} attempts)`,
      observed: { errors, successes, ratePct: Math.round(rate * 100) },
    };
  },
};

const sentryEnvelopePostFailureRate: AlertRule = {
  id: 'sentry-envelope-post-failure-rate',
  runbook: 'observability/runbooks/sentry-envelope-post-failure-rate.md',
  async evaluate({ env, now }): Promise<AlertEvaluation> {
    // Data source: the mcp:sentry-envelope:{ok,fail}:<day> day-counters
    // written by sentry-envelope.ts postEnvelope. SELF-REFERENTIAL
    // CAVEAT (runbook § caveat): if envelope delivery is broken, the
    // breach event for THIS rule may itself fail to deliver — /status
    // and Workers Logs are the fallback surfaces.
    const redis = createMcpClient(env);
    if (!redis) {
      return {
        breached: false,
        severity: 'ticket',
        summary: 'sentry-envelope-post-failure-rate: Upstash unbound — fail open',
        observed: { upstashUnavailable: 1 },
      };
    }
    const day = now.toISOString().slice(0, 10);
    try {
      const [ok, fail] = (await redis.mget<(number | string | null)[]>(
        `mcp:sentry-envelope:ok:${day}`,
        `mcp:sentry-envelope:fail:${day}`
      )) ?? [null, null];
      const okCount = num(ok);
      const failCount = num(fail);
      const attempts = okCount + failCount;
      const rate = attempts > 0 ? failCount / attempts : 0;
      return {
        breached: attempts >= ENVELOPE_MIN_ATTEMPTS && rate > ENVELOPE_FAILURE_RATE,
        severity: 'ticket',
        summary: `Sentry envelope delivery failure rate ${(rate * 100).toFixed(0)}% today (${failCount}/${attempts}, threshold ${ENVELOPE_FAILURE_RATE * 100}%, min ${ENVELOPE_MIN_ATTEMPTS})`,
        observed: { ok: okCount, fail: failCount, ratePct: Math.round(rate * 100) },
      };
    } catch {
      return {
        breached: false,
        severity: 'ticket',
        summary: 'sentry-envelope-post-failure-rate: counter read failed — fail open',
        observed: { upstashReadFailed: 1 },
      };
    }
  },
};

/** The canonical 7 — order matches the design-doc § Alerts table. */
export const ALERT_RULES: readonly AlertRule[] = [
  inoreaderBudgetExhausted,
  radarSnapshotStale,
  healthCheckFailing,
  trafficSpikeDetected,
  scopeMismatch403Rate,
  oauthRefreshFailureRate,
  sentryEnvelopePostFailureRate,
];
