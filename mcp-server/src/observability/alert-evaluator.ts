/**
 * BL-032.75 Phase 3 — scheduled SLO alert evaluator.
 *
 * Runs on the 15-minute production cron (`ALERT_EVALUATOR_CRON` below):
 * evaluates the 7 canonical
 * rules in `alert-rules.ts` against AE + Upstash + in-process health,
 * posts a fingerprinted Sentry issue event per un-suppressed breach, and
 * writes an evaluation summary to Upstash for the `/status` page.
 *
 * **Free-tier discipline** (verified 2026-07-10):
 *   - Breaches post ISSUE EVENTS via `postSentryEvent` — NEVER Crons
 *     check-ins (`postSentryCheckIn`): the free tier includes exactly one
 *     cron monitor and radar-refresh owns it.
 *   - Per-severity cooldowns (page 2h / ticket 6h, `SET NX EX`) bound the
 *     worst case to ≈840 events/month against the 5k/month budget.
 *   - Fingerprint `['slo-alert', ruleId, severity, utcDate]` — each UTC
 *     day's first breach of a rule opens a NEW issue so the "new issue"
 *     email rule fires. The per-period bucketing pattern is inherited
 *     from the weekly synthetic, removed 2026-08-09; only its source is
 *     gone, not its reasoning. A multi-day incident opens one issue per day
 *     — expected churn, documented in SENTRY_ALERT_RULES.md.
 *
 * **Budget math at 15-min cadence** (96 firings/day): ≤4 AE SQL reads
 * per firing ≈ 400/day vs the 10k/day free AE read cap; ~15-20 Upstash
 * commands/firing ≈ ~1,900/day. If Upstash budget pinches, the cadence
 * fallback is a one-constant change (`ALERT_EVALUATOR_CRON` → hourly).
 *
 * **Fail-open everywhere**: unbound AE secrets → AE-backed rules no-op;
 * per-rule try/catch → one broken rule cannot mask the other six; the
 * evaluator itself never throws (worker.ts's scheduled path already has
 * its own defense-in-depth wrapper, but the contract belongs here too).
 *
 * **New egress surface note**: the AE SQL fetch below is the Worker's
 * first runtime call to `api.cloudflare.com` (operator scripts used it
 * before; the Worker did not). Bounded by a 4s AbortController per query.
 */

import {
  ALERT_RULES,
  COOLDOWN_SECONDS,
  datasetForEnv,
  type AlertEvaluation,
  type AlertRule,
  type EvaluatorContext,
} from './alert-rules';
import { postSentryEvent } from './sentry-envelope';
import { createAeQuery } from './ae-query';
import { computeStatusMetrics, writeStatusMetrics } from './status-metrics';
import { createMcpClient } from '../lib/upstash-clients';
import { emit, AnalyticsEngineSink } from '../metrics/_index';
import { safeLog } from '../auth/safe-logger';
import type { Env } from '../worker';

// Production cron expression — mirrored in wrangler.toml [env.production]
// triggers. `event.cron` is matched against this constant in worker.ts's
// scheduled dispatch. Note the 15-minute expression overlaps the 6-hourly
// radar cron at :00 of hours 0/6/12/18 — Cloudflare fires one invocation
// per registered expression with `event.cron` set accordingly, and each
// path's dedup-lock key includes the cron string, so there is no collision.
// (Line comments here because the expression itself contains `*/`, which
// terminates a block comment.)
export const ALERT_EVALUATOR_CRON = '*/15 * * * *';

/** Upstash key holding the latest evaluation summary (read by /status). */
export const LAST_EVAL_KEY = 'mcp:alerts:last-eval';
const LAST_EVAL_TTL_SECONDS = 24 * 3600;

const cooldownKey = (ruleId: string) => `mcp:alerts:last-fired:${ruleId}`;

export interface RuleResult {
  id: string;
  breached: boolean;
  /** True when the breach was within the cooldown window — no Sentry event posted. */
  suppressed: boolean;
  severity: AlertEvaluation['severity'];
  summary: string;
  observed: AlertEvaluation['observed'];
  /** Present when the rule's evaluate() threw — fail-open record. */
  error?: string;
}

export interface AlertEvaluationSummary {
  evaluatedAt: string;
  env: string;
  rules: RuleResult[];
}

async function evaluateRule(rule: AlertRule, ctx: EvaluatorContext): Promise<RuleResult> {
  try {
    const ev = await rule.evaluate(ctx);
    return {
      id: rule.id,
      breached: ev.breached,
      suppressed: false,
      severity: ev.severity,
      summary: ev.summary,
      observed: ev.observed,
    };
  } catch (err) {
    return {
      id: rule.id,
      breached: false,
      suppressed: false,
      severity: 'ticket',
      summary: `${rule.id}: evaluate() threw — fail open`,
      observed: {},
      error: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
    };
  }
}

/**
 * Check + set the per-rule cooldown. Returns true when the breach should
 * POST (no live cooldown). Fail-open on Upstash trouble: rather post a
 * duplicate than silently drop the only page of an incident.
 */
async function shouldPost(env: Env, result: RuleResult): Promise<boolean> {
  try {
    const redis = createMcpClient(env);
    if (!redis) return true;
    const set = await redis.set(cooldownKey(result.id), new Date().toISOString(), {
      nx: true,
      ex: COOLDOWN_SECONDS[result.severity],
    });
    return set === 'OK';
  } catch {
    return true;
  }
}

/**
 * Evaluate all rules; post Sentry events for un-suppressed breaches;
 * persist the summary for /status; emit the evaluator's own AE outcome.
 * Never throws.
 */
export async function runAlertEvaluation(
  env: Env,
  opts?: { now?: Date }
): Promise<AlertEvaluationSummary> {
  const startedAt = Date.now();
  const now = opts?.now ?? new Date();
  const queryAe = createAeQuery(env);
  const ctx: EvaluatorContext = { env, queryAe, now };

  const results: RuleResult[] = [];
  // Sequential on purpose — bounds concurrent Upstash/AE load per firing;
  // seven rules at a few hundred ms each is well inside cron budget.
  for (const rule of ALERT_RULES) {
    results.push(await evaluateRule(rule, ctx));
  }

  const utcDate = now.toISOString().slice(0, 10);
  for (const result of results) {
    if (!result.breached) continue;
    if (!(await shouldPost(env, result))) {
      result.suppressed = true;
      continue;
    }
    try {
      await postSentryEvent(env, {
        level: result.severity === 'page' ? 'error' : 'warning',
        message: `slo-alert.${result.id}: ${result.summary}`,
        tags: {
          event: 'slo-alert',
          rule: result.id,
          severity: result.severity,
          environment: (env.ENV_NAME as string | undefined) ?? 'unknown',
        },
        extra: {
          ...result.observed,
          runbook: ALERT_RULES.find((r) => r.id === result.id)?.runbook ?? 'unknown',
        },
        fingerprint: ['slo-alert', result.id, result.severity, utcDate],
      });
    } catch (err) {
      // postSentryEvent carries its own never-throws contract; this catch
      // guards the evaluator's OWN never-throws contract against a future
      // regression in that dependency. The breach stays visible on /status
      // via the summary write below even when Sentry delivery is broken.
      safeLog({
        event: 'alert-evaluator.sentry-post-failed',
        success: false,
        errorCode: 'sentry-post-failed',
        reason: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
      });
    }
  }

  const summary: AlertEvaluationSummary = {
    evaluatedAt: now.toISOString(),
    env: (env.ENV_NAME as string | undefined) ?? 'unknown',
    rules: results,
  };

  try {
    const redis = createMcpClient(env);
    if (redis) {
      await redis.set(LAST_EVAL_KEY, JSON.stringify(summary), { ex: LAST_EVAL_TTL_SECONDS });
    }
  } catch {
    // /status just shows the previous (or no) summary — not worth failing over.
  }

  // BL-033 Slice 4 — precompute the /status latency + audit-health panels in
  // this same cron run (reuses `queryAe` + a redis handle) and cache to
  // Upstash for `/status` to read. Isolated best-effort: the alert path is the
  // higher-priority tenant of this cron, so a metrics-compute failure must
  // NEVER break alert evaluation (its own try/catch, distinct from the summary
  // write above). Absent (fresh deploy / staging has no cron) → /status renders
  // "metrics unavailable" until the next run.
  try {
    const redis = createMcpClient(env);
    if (redis) {
      const envName = (env.ENV_NAME as string | undefined) ?? 'unknown';
      const metrics = await computeStatusMetrics(queryAe, redis, datasetForEnv(envName), envName);
      await writeStatusMetrics(redis, envName, metrics);
    }
  } catch {
    // /status shows the previous (or no) metrics — not worth failing over.
  }

  const anyErrors = results.some((r) => r.error !== undefined);
  if (env.METRICS) {
    emit(new AnalyticsEngineSink(env.METRICS), {
      event_type: 'cron_outcome',
      name: 'alert-evaluator',
      outcome: anyErrors ? 'partial' : 'success',
      duration_ms: Date.now() - startedAt,
    });
  }
  safeLog({
    event: 'alert-evaluator.completed',
    success: true,
    durationMs: Date.now() - startedAt,
    reason: `breached=${results.filter((r) => r.breached).length} suppressed=${results.filter((r) => r.suppressed).length} errors=${results.filter((r) => r.error !== undefined).length}`,
  });

  return summary;
}
