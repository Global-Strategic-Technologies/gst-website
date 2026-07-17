/**
 * BL-032.75 Phase 2 — SLO baselining data pull against Cloudflare
 * Analytics Engine.
 *
 * **No shebang**: invoked via `node scripts/...` or `npm run ae:baseline`,
 * never as a self-executable — vitest imports this `.mjs` directly for the
 * pure-function unit tests and Vite's parser rejects shebang lines (see
 * the identical note in `extract-irl-markdown.mjs`).
 *
 * **What this is**: the scripted form of the data-pull procedure in
 * `mcp-server/observability/slo-baselines.md` § "Data-pull procedure".
 * It runs the two baselining queries (latency quantiles per
 * event_type/name/outcome; Inoreader spend by category) against the AE
 * SQL API and prints paste-ready markdown table rows for the three
 * tables in that doc, including proposed SLO targets derived via the
 * design-doc calibration rules.
 *
 * **Column map provenance**: `mcp-server/src/metrics/_schema.ts` is the
 * single source of truth — blob1=event_type, blob2=name, blob3=keyOwner,
 * blob4=outcome, blob5=correlation_id, blob6=status_code, blob7=zone1,
 * double1=duration_ms. The original slo-baselines.md Query 2 predated the
 * finalized schema and read category from blob3 / status_code from blob5;
 * this script (and the corrected doc) read blob2 / blob6.
 *
 * **Auth**: `CF_AE_TOKEN` (Cloudflare API token, Account | Account
 * Analytics | Read — mint per DEPLOY.md § C.X) and `CLOUDFLARE_ACCOUNT_ID`
 * (fallback: legacy `CF_ACCOUNT_ID`), from the environment ONLY. The
 * script fails loudly if either is unset — keeping the token out of
 * script arguments avoids leaking it into shell history / transcripts
 * (same posture as `Verify-AeEmission.ps1`).
 *
 * **Usage**:
 *   node scripts/invoke-ae-baseline.mjs --env production --window-days 7
 *   npm run ae:baseline -- --env production
 */

const AE_SQL_ENDPOINT = (accountId) =>
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`;

export const DATASETS = Object.freeze({
  staging: 'mcp_events_staging',
  production: 'mcp_events',
});

/**
 * Calibration rules from the design doc § "What good observability looks
 * like" (mcp-server/src/docs/ARCHITECTURE.md § Observability), restated in
 * slo-baselines.md § Data-pull procedure step 5.
 */
export const CALIBRATION = Object.freeze({
  latencyMultiplier: 1.5, // target = p95_baseline × 1.5
  availabilitySustainedPct: 0.5, // error-budget floor, sustained
  availabilitySpikePct: 5, // spike-tolerable for 5 min
  freshnessSeconds: 2 * 6 * 3600, // 2 × the 6h radar cron = 43,200s (12h)
  // Throughput (peak × 1.3) is deliberately NOT derived here: the
  // aggregate weekly counts these queries return have no per-hour peak.
  // The traffic-spike alert (Phase 3) uses a 10× rolling hourly baseline
  // instead of a fixed throughput SLO.
});

/**
 * Minimum event_count for a surface to receive a proposed latency SLO.
 * Below this the quantiles are noise on internal-only traffic.
 */
export const MIN_EVENTS_FOR_SLO = 10;

/**
 * Build the two baselining queries.
 *
 * Query 1 groups by RAW columns (blob1/blob2/blob4), not SELECT aliases —
 * the alias-GROUP-BY form in the original doc was never executed against
 * the AE SQL API; raw-column grouping is the dialect the working probe
 * (Verify-AeEmission.ps1) has exercised.
 */
export function buildBaselineQueries({ dataset, windowDays }) {
  if (!Object.values(DATASETS).includes(dataset)) {
    throw new Error(
      `Unknown dataset "${dataset}" — expected one of ${Object.values(DATASETS).join(', ')}`
    );
  }
  const days = Number(windowDays);
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    throw new Error(`windowDays must be an integer 1-90 (AE retention), got: ${windowDays}`);
  }

  const latencySql = [
    'SELECT blob1 AS event_type,',
    '       blob2 AS name,',
    '       blob4 AS outcome,',
    '       quantileWeighted(0.5, double1, _sample_interval) AS p50_ms,',
    '       quantileWeighted(0.95, double1, _sample_interval) AS p95_ms,',
    '       quantileWeighted(0.99, double1, _sample_interval) AS p99_ms,',
    '       sum(_sample_interval) AS event_count',
    `FROM ${dataset}`,
    `WHERE timestamp >= NOW() - INTERVAL '${days}' DAY`,
    'GROUP BY blob1, blob2, blob4',
    'ORDER BY event_count DESC',
    'FORMAT JSON',
  ].join('\n');

  const spendSql = [
    'SELECT blob2 AS category,',
    '       blob7 AS zone1,',
    '       blob6 AS status_code,',
    '       sum(_sample_interval) AS call_count',
    `FROM ${dataset}`,
    "WHERE blob1 = 'inoreader_call'",
    `  AND timestamp >= NOW() - INTERVAL '${days}' DAY`,
    'GROUP BY blob2, blob7, blob6',
    'ORDER BY call_count DESC',
    'FORMAT JSON',
  ].join('\n');

  return { latencySql, spendSql };
}

/**
 * Fail-loud shape check on the AE SQL API JSON response. The
 * quantileWeighted/sum(_sample_interval) forms have never been executed
 * in this repo before this script — surface a malformed response as a
 * hard error with the payload head, not a silently empty table.
 */
export function assertAeResponseShape(json, label) {
  if (!json || !Array.isArray(json.data)) {
    const head = JSON.stringify(json)?.slice(0, 300);
    throw new Error(`AE response for ${label} has no data array — payload head: ${head}`);
  }
  return json.data;
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmtMs = (v) => num(v).toFixed(1);

/** Markdown rows for the "Latency baselines" table (schema per slo-baselines.md). */
export function formatLatencyTable(aeJson) {
  const rows = assertAeResponseShape(aeJson, 'latency query');
  if (rows.length === 0) return '| _(no events in window)_ | | | | | | |';
  return rows
    .map(
      (r) =>
        `| ${r.event_type} | ${r.name ?? ''} | ${r.outcome ?? ''} | ${num(r.event_count)} | ${fmtMs(r.p50_ms)} | ${fmtMs(r.p95_ms)} | ${fmtMs(r.p99_ms)} |`
    )
    .join('\n');
}

/** Markdown rows for the "Inoreader spend by category" table. */
export function formatSpendTable(aeJson) {
  const rows = assertAeResponseShape(aeJson, 'spend query');
  if (rows.length === 0) return '| _(no inoreader_call events in window)_ | | | | |';
  return rows
    .map((r) => {
      const zoneNote = r.zone1 === '1' ? 'Zone-1 (counts toward 100/day cap)' : 'non-Zone-1';
      return `| ${r.category} | ${r.zone1 ?? ''} | ${r.status_code ?? ''} | ${num(r.call_count)} | ${zoneNote} |`;
    })
    .join('\n');
}

/**
 * Markdown rows for the "Proposed SLO targets" table, applying the
 * calibration rules to the measured latency baselines. Only
 * success-outcome surfaces with >= MIN_EVENTS_FOR_SLO events get a
 * latency target; availability + freshness rows are rule-derived
 * constants. Human review (sign-off table) is the final arbiter.
 */
export function proposeSloTargets(aeJson) {
  const rows = assertAeResponseShape(aeJson, 'latency query');
  const latencyRows = rows
    .filter((r) => r.outcome === 'success' && num(r.event_count) >= MIN_EVENTS_FOR_SLO)
    .map((r) => {
      const p95 = num(r.p95_ms);
      const target = Math.ceil(p95 * CALIBRATION.latencyMultiplier);
      return `| ${r.event_type}/${r.name} | latency p95 | ${fmtMs(r.p95_ms)} ms | ${target} ms | p95 × ${CALIBRATION.latencyMultiplier} (design-doc latency rule; n=${num(r.event_count)}) |`;
    });

  const staticRows = [
    `| all surfaces | availability (error rate) | — | < ${CALIBRATION.availabilitySustainedPct}% sustained; < ${CALIBRATION.availabilitySpikePct}% spike ≤ 5 min | error-budget floor (design-doc availability rule) |`,
    `| radar snapshot | freshness | — | age ≤ ${CALIBRATION.freshnessSeconds} s (12h) | 2 × 6h cron interval (design-doc freshness rule) |`,
    `| all surfaces | throughput | — | n/a as fixed SLO | traffic-spike alert uses 10× rolling hourly baseline instead (aggregate window counts carry no per-hour peak) |`,
  ];

  return [...latencyRows, ...staticRows].join('\n');
}

async function queryAe({ accountId, token, sql, label }) {
  const res = await fetch(AE_SQL_ENDPOINT(accountId), {
    method: 'POST',
    // Content-Type matches the proven Verify-AeEmission.ps1 request shape —
    // the AE SQL API takes the raw SQL string as the body regardless.
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: sql,
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`AE SQL API ${res.status} for ${label}: ${body}`);
  }
  return res.json();
}

function parseArgs(argv) {
  const args = { env: 'production', windowDays: 7 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--env') args.env = argv[++i];
    else if (argv[i] === '--window-days') args.windowDays = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!(args.env in DATASETS)) {
    throw new Error(`--env must be one of: ${Object.keys(DATASETS).join(', ')}`);
  }
  return args;
}

async function runCli() {
  const token = process.env.CF_AE_TOKEN;
  if (!token) {
    throw new Error(
      "CF_AE_TOKEN not set. Mint per DEPLOY.md § C.X and run: $env:CF_AE_TOKEN = '<token>'"
    );
  }
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
  if (!accountId) {
    throw new Error(
      'CLOUDFLARE_ACCOUNT_ID not set. Get via "npx wrangler whoami" and run: $env:CLOUDFLARE_ACCOUNT_ID = \'<id>\''
    );
  }

  const { env, windowDays } = parseArgs(process.argv.slice(2));
  const dataset = DATASETS[env];
  const { latencySql, spendSql } = buildBaselineQueries({ dataset, windowDays });

  process.stderr.write(`Querying ${env} (${dataset}), last ${windowDays} days...\n`);
  const [latencyJson, spendJson] = await Promise.all([
    queryAe({ accountId, token, sql: latencySql, label: 'latency query' }),
    queryAe({ accountId, token, sql: spendSql, label: 'spend query' }),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  process.stdout.write(
    [
      `<!-- generated by scripts/invoke-ae-baseline.mjs on ${today} — window: last ${windowDays} days, dataset: ${dataset} -->`,
      '',
      '### Latency baselines (per tool/resource/prompt)',
      '',
      '| event_type | name | outcome | event_count | p50_ms | p95_ms | p99_ms |',
      '| ---------- | ---- | ------- | ----------- | ------ | ------ | ------ |',
      formatLatencyTable(latencyJson),
      '',
      '### Inoreader spend by category',
      '',
      '| category | zone1 | status_code | call_count | notes |',
      '| -------- | ----- | ----------- | ---------- | ----- |',
      formatSpendTable(spendJson),
      '',
      '### Proposed SLO targets (post-calibration)',
      '',
      '| Surface | Metric | Baseline | Target | Justification |',
      '| ------- | ------ | -------- | ------ | ------------- |',
      proposeSloTargets(latencyJson),
      '',
    ].join('\n')
  );
}

// Run the CLI only when invoked directly. Importing this module (from the
// unit tests) does not trigger CLI side effects.
const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('invoke-ae-baseline.mjs');
if (isMain) {
  runCli().catch((err) => {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  });
}
