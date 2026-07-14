/**
 * BL-032.75 Phase 3 — public `/status` page.
 *
 * Minimal server-rendered HTML over two data sources the Worker already
 * holds: `buildHealthPayload(env)` (live probes) and the alert
 * evaluator's last-run summary (`mcp:alerts:last-eval`, written every 15
 * minutes). No client JS, no external assets.
 *
 * **Public-safety**: `/health` is already unauthenticated and exposes a
 * strict superset of what renders here (spend detail, ACL self-check,
 * refresh-token health). This page shows: overall status, env/version/
 * gitSha, Upstash + Inoreader status, radar snapshot age vs the 12h SLO,
 * Zone-1 spend vs the daily cap, and the per-rule alert table. No key
 * names, no correlation ids, no token material.
 *
 * The design doc's `status.mcp.globalstrategic.tech` subdomain AC is
 * satisfied-in-substance by this Worker route at
 * `mcp.globalstrategic.tech/status`; a dedicated subdomain stays with
 * the deferred Grafana item (it would just CNAME here anyway).
 */

import { buildHealthPayload } from './health';
import { FRESHNESS_MAX_AGE_SECONDS } from './alert-rules';
import { LAST_EVAL_KEY, type AlertEvaluationSummary } from './alert-evaluator';
import { ZONE1_DAILY_HARD_CAP } from '../lib/inoreader-egress';
import { createMcpClient } from '../lib/upstash-clients';
import type { Env } from '../worker';

const esc = (v: unknown): string =>
  String(v ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

async function readLastEval(env: Env): Promise<AlertEvaluationSummary | null> {
  try {
    const redis = createMcpClient(env);
    if (!redis) return null;
    const raw = await redis.get<AlertEvaluationSummary | string | null>(LAST_EVAL_KEY);
    if (raw == null) return null;
    return typeof raw === 'string' ? (JSON.parse(raw) as AlertEvaluationSummary) : raw;
  } catch {
    return null;
  }
}

const badge = (ok: boolean, okText: string, badText: string): string =>
  ok
    ? `<span style="color:#0a7d4f;font-weight:600">${okText}</span>`
    : `<span style="color:#b3261e;font-weight:600">${badText}</span>`;

/** Render the /status HTML. Never throws — degraded sources render as unknowns. */
export async function buildStatusHtml(env: Env): Promise<string> {
  const [health, lastEval] = await Promise.all([buildHealthPayload(env), readLastEval(env)]);

  const snapshotOk =
    health.radarSnapshotAgeSeconds !== null &&
    health.radarSnapshotAgeSeconds <= FRESHNESS_MAX_AGE_SECONDS;
  const spendPct = Math.round((health.inoreaderSpend.total / ZONE1_DAILY_HARD_CAP) * 100);

  const alertRows =
    lastEval?.rules
      .map((r) => {
        const state = r.error
          ? '<span style="color:#946200;font-weight:600">eval-error</span>'
          : badge(!r.breached, 'ok', r.suppressed ? 'breached (cooldown)' : 'BREACHED');
        return `<tr><td>${esc(r.id)}</td><td>${state}</td><td>${esc(r.severity)}</td><td>${esc(r.summary)}</td></tr>`;
      })
      .join('') ??
    '<tr><td colspan="4">No evaluation summary yet — the evaluator cron runs every 15 minutes.</td></tr>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GST MCP — status</title>
<style>
  body { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; margin: 2rem auto; max-width: 60rem; padding: 0 1rem; background: #0f1115; color: #e6e6e6; }
  h1 { font-size: 1.3rem; } h2 { font-size: 1.05rem; margin-top: 2rem; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #333; padding: 0.4rem 0.6rem; text-align: left; font-size: 0.85rem; }
  th { background: #1a1d24; }
  .meta { color: #9a9a9a; font-size: 0.8rem; }
</style>
</head>
<body>
<h1>GST MCP Worker — status ${badge(health.ok, 'OPERATIONAL', 'DEGRADED')}</h1>
<p class="meta">env=${esc(health.gitSha === 'unknown' ? env.ENV_NAME : `${env.ENV_NAME ?? 'unknown'}`)} · version=${esc(health.version)} · gitSha=${esc(health.gitSha)} · generated=${esc(new Date().toISOString())}</p>

<h2>Substrate</h2>
<table>
  <tr><th>Surface</th><th>State</th><th>Detail</th></tr>
  <tr><td>Upstash (MCP DB)</td><td>${badge(health.upstashMcp === 'ok', 'ok', 'degraded')}</td><td>write-probe</td></tr>
  <tr><td>Inoreader</td><td>${badge(health.inoreader !== 'degraded', esc(health.inoreader), 'degraded')}</td><td>last observed ${esc(health.inoreaderObservedSecondsAgo)}s ago (${esc(health.inoreaderObservedSource)})</td></tr>
  <tr><td>Radar snapshot freshness</td><td>${badge(snapshotOk, 'fresh', 'STALE')}</td><td>age ${esc(health.radarSnapshotAgeSeconds)}s vs SLO ${FRESHNESS_MAX_AGE_SECONDS}s (12h)</td></tr>
  <tr><td>Inoreader Zone-1 budget</td><td>${badge(spendPct < 70, `${spendPct}%`, `${spendPct}%`)}</td><td>${esc(health.inoreaderSpend.total)}/${ZONE1_DAILY_HARD_CAP} today (ticket &gt; 70%, page &gt; 90%)</td></tr>
</table>

<h2>SLO alerts (last evaluation: ${esc(lastEval?.evaluatedAt)})</h2>
<table>
  <tr><th>Rule</th><th>State</th><th>Severity</th><th>Detail</th></tr>
  ${alertRows}
</table>

<p class="meta">Runbooks: <code>mcp-server/observability/runbooks/</code> · SLO provenance: <code>mcp-server/observability/slo-baselines.md</code> (signed off 2026-07-14) · Evaluator cadence: 15 min</p>
</body>
</html>`;
}
