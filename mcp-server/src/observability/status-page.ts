/**
 * BL-032.75 Phase 3 — public `/status` page.
 *
 * Minimal server-rendered HTML over three cached/probed sources the Worker
 * already holds: `buildHealthPayload(env)` (live probes), the alert
 * evaluator's last-run summary (`mcp:alerts:last-eval`), and the precomputed
 * status metrics (`mcp:status:metrics:<env>`, BL-033 Slice 4) — both written
 * by the 15-min evaluator cron. No live AE query on the render path; no client
 * JS, no external assets.
 *
 * **Public-safety**: `/health` is already unauthenticated and exposes a
 * strict superset of what renders here (spend detail, ACL self-check,
 * refresh-token health). This page shows: overall status, env/version/
 * gitSha, Upstash + Inoreader status, radar snapshot age vs the 12h SLO,
 * Zone-1 spend vs the daily cap, the per-rule alert table, and per-tool
 * upstream I/O wait. No key names, no correlation ids, no token material.
 * The audit-log panel renders only while the audit pipeline is bound
 * (ADR-0014 deactivated it; see `auditActive` below).
 *
 * **Surface, don't ratify** (BL-033 operator directive, still in force): the
 * I/O-wait panel renders raw p50/p95/p99 as PLAIN values — no badges, no
 * pass/fail threshold, no ratified SLA (contrast the freshness/spend rows,
 * which ARE signed-off SLOs). The SLO stays deferred (`slo-baselines.md`).
 *
 * **What the number is** (BL-122): `duration_ms` is `Date.now() - startedAt`
 * around the handler, and Workers freeze the clock outside I/O — so it
 * measures I/O wait, never compute. A handler that touches no network scores
 * exactly 0 however much work it does, which is why rows with `p99Ms === 0`
 * are filtered out at render rather than published as if they were fast.
 *
 * BL-033 Slice 4 fronts this page at `status.mcp.globalstrategic.tech`
 * (a `custom_domain` route → `worker.ts` serves status at the subdomain root);
 * `mcp.globalstrategic.tech/status` keeps working.
 */

import { buildHealthPayload } from './health';
import { FRESHNESS_MAX_AGE_SECONDS } from './alert-rules';
import { LAST_EVAL_KEY, type AlertEvaluationSummary } from './alert-evaluator';
import { readStatusMetrics } from './status-metrics';
import { ZONE1_DAILY_HARD_CAP } from '../lib/inoreader-egress';
import { createMcpClient } from '../lib/upstash-clients';
import { FAVICON_LINK, MONO_FALLBACK_FACES, MONO_STACK } from '../lib/html-shell';
import type { Env } from '../env';

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

/**
 * Four visually distinct alert states — each colour means one thing:
 *   green  #0a7d4f  ok           — checked, and fine
 *   slate  #8a9bb0  unknown      — could NOT check (data source unreachable)
 *   amber  #946200  eval-error   — the rule itself threw
 *   red    #b3261e  BREACHED     — checked, and not fine
 * `unknown` is muted rather than alarming: nothing is known to be wrong, but
 * nothing was verified either. It must never read as green — an unverified
 * check displaying `ok` is monitoring that has silently stopped monitoring.
 */
const STATE_COLOR = {
  ok: '#0a7d4f',
  unknown: '#8a9bb0',
  evalError: '#946200',
  breached: '#b3261e',
} as const;

const stateSpan = (color: string, text: string): string =>
  `<span style="color:${color};font-weight:600">${text}</span>`;

const badge = (ok: boolean, okText: string, badText: string): string =>
  ok ? stateSpan(STATE_COLOR.ok, okText) : stateSpan(STATE_COLOR.breached, badText);

/** Render the /status HTML. Never throws — degraded sources render as unknowns. */
export async function buildStatusHtml(env: Env): Promise<string> {
  const [health, lastEval, metrics] = await Promise.all([
    buildHealthPayload(env),
    readLastEval(env),
    readStatusMetrics(env),
  ]);

  // Upstream I/O wait — PLAIN values, no badges/thresholds (surface, don't ratify).
  //
  // BL-122: the filter is applied HERE, at render, and never inside
  // `computeToolLatency`. `toolLatency === []` must keep meaning exactly one
  // thing — "no tool_invocation events in the window" — because the empty-state
  // copy below asserts it. Filtering at compute time would overload `[]` to
  // also mean "traffic existed, none of it measurable", and the page would then
  // claim zero invocations in a window that had hundreds. Keeping the
  // unfiltered rows in scope is also what lets the two empty states differ.
  //
  // Filter on the MEASUREMENT (`p99Ms > 0`), never on a tool-name allowlist:
  // the query is `GROUP BY blob2` with no tool list anywhere, so an allowlist
  // would need hand-maintaining and would drift the first time a tool gained or
  // lost an I/O path. `p99` and not `p50` — a tool that only reaches the
  // network on a cache miss has `p50 = 0` and a real `p99`, and must survive.
  const measured = metrics?.toolLatency?.filter((r) => r.p99Ms > 0);
  let latencyRows: string;
  if (metrics?.toolLatency == null || measured == null) {
    latencyRows =
      '<tr><td colspan="5">metrics unavailable — the evaluator cron populates every 15 min (needs CF_AE_TOKEN bound; staging has no cron)</td></tr>';
  } else if (metrics.toolLatency.length === 0) {
    latencyRows = '<tr><td colspan="5">no tool_invocation events in the last 7 days</td></tr>';
  } else if (measured.length === 0) {
    latencyRows = `<tr><td colspan="5">${esc(metrics.toolLatency.length)} tools invoked, none with measurable I/O wait — expected on a quiet week (see note below)</td></tr>`;
  } else {
    latencyRows = measured
      .map(
        (r) =>
          `<tr><td>${esc(r.name)}</td><td>${esc(r.p50Ms)}</td><td>${esc(r.p95Ms)}</td><td>${esc(r.p99Ms)}</td><td>${esc(r.n)}</td></tr>`
      )
      .join('');
  }

  // BL-122 — the audit pipeline is deactivated (ADR-0014), and an unbound
  // AUDIT_QUEUE is the same signal `handle-authenticated.ts` uses to no-op the
  // producer. Hiding the panel on that signal means it returns by itself when
  // the binding comes back; no code change is needed to re-enable it.
  const auditActive = env.AUDIT_QUEUE != null;
  // Only built when the panel renders — see `auditActive` above.
  const a = auditActive ? metrics?.audit : undefined;
  const auditRows = !auditActive
    ? ''
    : metrics == null
      ? '<tr><td colspan="2">metrics unavailable — the evaluator cron populates every 15 min</td></tr>'
      : `<tr><td>Records committed (chain tip)</td><td>${esc(a?.lastSeq ?? '—')}</td></tr>` +
        `<tr><td>Batches processed (24h)</td><td>${esc(a?.batches24h ?? '—')}</td></tr>` +
        `<tr><td>Records committed (24h)</td><td>${esc(a?.records24h ?? '—')}</td></tr>` +
        `<tr><td>Last batch processed</td><td>${esc(a?.lastProcessedAt ?? '—')}</td></tr>`;

  // BL-122 — three outcomes, not two. A null age means Upstash was unbound or
  // unreachable, the value was malformed, or the cache is cold: freshness is
  // UNVERIFIABLE. Reporting it as `STALE` asserts a verdict nobody reached —
  // the same defect as the budget row below, erring alarming instead of
  // reassuring. Both now say `unknown` for an unreadable source.
  //
  // Hoisted to a local const so the null check narrows for BOTH uses:
  // TypeScript's aliased-condition narrowing does not reach through a mutable
  // property access, so reading `health.radarSnapshotAgeSeconds` directly
  // forced the predicate to be written twice — a divergence waiting to happen.
  const snapshotAge = health.radarSnapshotAgeSeconds;
  const snapshotRead = snapshotAge !== null;
  const snapshotOk = snapshotRead && snapshotAge <= FRESHNESS_MAX_AGE_SECONDS;
  const spendPct = Math.round((health.inoreaderSpend.total / ZONE1_DAILY_HARD_CAP) * 100);
  // BL-122 — `read === false` means the counters were unreachable and `total`
  // is a default, not a measurement. Rendering `0%` in green would assert a
  // number nobody read; the same reasoning as the alert table's `unknown`.
  const spendRead = health.inoreaderSpend.read !== false;

  const alertRows =
    lastEval?.rules
      .map((r) => {
        // Order matters: a rule that threw, and a rule that could not reach
        // its data source, must BOTH escape the ok/breached binary before it
        // is applied — otherwise either renders as a green `ok` it never earned.
        //
        // The overlap is unreachable today (`evaluateRule` sets `error` only in
        // its catch arm and `evaluated` only in its try arm), so the precedence
        // is defensive rather than load-bearing. `eval-error` wins because a
        // crashed rule is the more specific and more actionable fault.
        const state = r.error
          ? stateSpan(STATE_COLOR.evalError, 'eval-error')
          : r.evaluated === false
            ? stateSpan(STATE_COLOR.unknown, 'unknown')
            : badge(!r.breached, 'ok', r.suppressed ? 'breached (cooldown)' : 'BREACHED');
        return `<tr><td>${esc(r.id)}</td><td>${state}</td><td>${esc(r.severity)}</td><td>${esc(r.summary)}</td></tr>`;
      })
      .join('') ??
    // BL-122 — `readLastEval` returns null for an absent key AND an unreachable
    // Upstash, so naming only the cron asserts a cause. During an outage the
    // summary probably exists and simply could not be read, while the Substrate
    // panel above already says Upstash is unreachable. Same fabricated-default
    // family as the badges, expressed in copy: hedge the cause, don't invent it.
    '<tr><td colspan="4">No evaluation summary readable — either the cron has not run yet, or Upstash is unreachable (see Substrate above).</td></tr>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${FAVICON_LINK}
<title>GST MCP — status</title>
<style>${MONO_FALLBACK_FACES}
  body { font-family: ${MONO_STACK}; margin: 2rem auto; max-width: 60rem; padding: 0 1rem; background: #0f1115; color: #e6e6e6; }
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
  <tr><td>Inoreader</td><td>${health.inoreader === 'unknown' ? stateSpan(STATE_COLOR.unknown, 'unknown') : badge(health.inoreader !== 'degraded', esc(health.inoreader), 'degraded')}</td><td>${health.inoreader === 'unknown' ? 'status unreadable (never observed, or Upstash unreachable)' : `last observed ${esc(health.inoreaderObservedSecondsAgo)}s ago (${esc(health.inoreaderObservedSource)})`}</td></tr>
  <tr><td>Radar snapshot freshness</td><td>${snapshotRead ? badge(snapshotOk, 'fresh', 'STALE') : stateSpan(STATE_COLOR.unknown, 'unknown')}</td><td>${snapshotRead ? `age ${esc(snapshotAge)}s vs SLO ${FRESHNESS_MAX_AGE_SECONDS}s (12h)` : `age unreadable (snapshot absent or Upstash unreachable) — SLO ${FRESHNESS_MAX_AGE_SECONDS}s (12h)`}</td></tr>
  <tr><td>Inoreader Zone-1 budget</td><td>${spendRead ? badge(spendPct < 70, `${spendPct}%`, `${spendPct}%`) : stateSpan(STATE_COLOR.unknown, 'unknown')}</td><td>${spendRead ? `${esc(health.inoreaderSpend.total)}/${ZONE1_DAILY_HARD_CAP} today (ticket &gt; 70%, page &gt; 90%)` : `counters unreadable — cap is ${ZONE1_DAILY_HARD_CAP}/day`}</td></tr>
  <tr><td>Inoreader circuit breaker</td><td>${health.circuitRead === false ? stateSpan(STATE_COLOR.unknown, 'unknown') : badge(!health.circuitOpen, 'closed', 'OPEN')}</td><td>${health.circuitRead === false ? 'breaker state unreadable (Upstash unreachable) — radar behaviour is unchanged, only the readout is unknown' : health.circuitOpen ? 'radar is serving cached snapshots; no upstream calls until the breaker closes' : 'radar reads go upstream on cache miss'}</td></tr>
</table>

<h2>SLO alerts (last evaluation: ${esc(lastEval?.evaluatedAt)})</h2>
<table>
  <tr><th>Rule</th><th>State</th><th>Severity</th><th>Detail</th></tr>
  ${alertRows}
</table>

<h2>Upstream I/O wait per tool (last 7d${metrics?.evaluatedAt ? `, as of ${esc(metrics.evaluatedAt)}` : ''})</h2>
<table>
  <tr><th>Tool</th><th>p50 ms</th><th>p95 ms</th><th>p99 ms</th><th>samples</th></tr>
  ${latencyRows}
</table>
<p class="meta">Time the handler spent blocked on Upstash / Inoreader — <strong>not</strong> total handler time. Cloudflare Workers freeze the clock outside I/O (<code>Date.now()</code> returns the time of the last I/O and does not advance during execution), so compute time is unmeasurable here and compute-only tools are <strong>omitted rather than shown as 0</strong>. Observability, not a ratified SLA; includes synthetic probe traffic. For client-observed round-trip latency, which does see compute, use the CI latency probe. SLO deliberately deferred — see slo-baselines.md.</p>

${
  auditActive
    ? `<h2>Audit log</h2>
<table>
  <tr><th>Metric</th><th>Value</th></tr>
  ${auditRows}
</table>`
    : ''
}

<p class="meta">Runbooks: <code>mcp-server/observability/runbooks/</code> · SLO provenance: <code>mcp-server/observability/slo-baselines.md</code> (signed off 2026-07-14) · Evaluator cadence: 15 min</p>
</body>
</html>`;
}
