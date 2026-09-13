/**
 * BL-149 — `unstable_dev` boot and first-use latency harness.
 *
 * WHY THIS EXISTS
 * A single test in the mcp-server suite has intermittently timed out at
 * vitest's 5000ms default for six weeks (26 recorded instances), almost
 * always the first `it` in one of the 11 `unstable_dev` Worker-booting
 * integration files. The stanza forbids raising the timeout or adding a
 * retry and asks for MEASUREMENT first.
 *
 * The hypothesis this measures:
 *
 *   H1 — `unstable_dev` resolves once workerd is SPAWNED, but the first
 *        `worker.fetch()` still pays module-graph JIT + instantiation.
 *        `beforeAll` carries an explicit 60_000; an `it` carries the
 *        5000ms default. A file that leaves that cost unpaid bills it to
 *        a test. Supporting evidence: exactly the 4 of 11 files that
 *        fetch inside `beforeAll` are the 4 that pass.
 *   H2 — per-SUBSYSTEM first touch matters too, not just the module
 *        graph (BL-149 instance 18's victim was the first test to touch
 *        KV, not the first test in the file). If true, a `/health`
 *        warm-up is not sufficient for a file that also touches KV.
 *   H3 — a stranded runtime or unreleased port from the previous file
 *        makes the next boot pay. Probed here by checking port release
 *        and child reaping AFTER `stop()` resolves.
 *
 * WHY NOT MEASURE INSIDE VITEST
 * Inside vitest every sample is right-censored at the 5000ms default, so
 * the tail — the thing we need — is unobservable, and raising
 * `testTimeout` to see it would be the very move this initiative
 * forbids. Running outside vitest also answers a question the stanza
 * never closed: whether the runner is involved at all. Each run
 * re-spawns this script as a child (`--single`), so one run is one
 * process and one workerd boot, matching vitest's `forks` /
 * `isolate: true` topology.
 *
 * Usage (from the mcp-server workspace):
 *   node scripts/measure-worker-boot.mjs [options]
 *
 * Options:
 *   --runs <n>     isolated child runs (default 10; use 50 for the record)
 *   --order <csv>  subsystem probe order (default health,mcp,kv)
 *   --warm         issue the /health warm-up BEFORE the probes, i.e.
 *                  simulate the proposed fix and measure the residual
 *   --env <name>   wrangler env (default staging)
 *   --json <path>  write raw per-run samples here
 *   --single       INTERNAL: run one measurement, print one JSON line
 *
 * Companion: src/docs/development/_archive/WORKER_BOOT_LATENCY_BL-149.md
 * No shebang, run via `node` (house style — see extract-irl-markdown.mjs).
 */

import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { percentile } from './probe-latency.mjs';

/** Marks the child's result line among the Worker's own JSON log lines. */
const RESULT_SENTINEL = '__BL149_RESULT__';

/**
 * Credentials the probes authenticate with. These are TEST values bound
 * into the Worker under test via `unstable_dev`'s `vars`, exactly as
 * tests/integration/trial-signup.test.ts does — they are not secrets and
 * never leave this process (Directive 15 concerns real secrets).
 *
 * They are load-bearing, not decorative: `/admin/oauth/m2m-clients` runs
 * requireAdmin (src/admin/oauth-clients.ts:56-70) and returns 401 BEFORE
 * touching listM2mClients(env.OAUTH_KV) at :169, and `/mcp` runs
 * authenticate() (src/worker.ts:533) before the agent path. Probing them
 * unauthenticated would time a rejection at the gate — microseconds for
 * a subsystem never reached — and quietly report the opposite of the
 * truth. Every probe below asserts it did not get a 401 for that reason.
 */
const ADMIN_KEY = 'measure-worker-boot-admin-key';
const RP_KEY = 'measure-worker-boot-rp-key';

/** Probes, keyed by the `--order` token that selects them. */
const PROBES = {
  health: {
    checkpoint: 'first_health',
    describe: 'GET /health (module graph; no auth by design)',
    run: (worker) => worker.fetch('/health'),
    requiresAuth: false,
  },
  mcp: {
    checkpoint: 'first_mcp',
    describe: 'POST /mcp tools/list (MCP handler + server registry)',
    run: (worker) =>
      worker.fetch('/mcp', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RP_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      }),
    requiresAuth: true,
  },
  trial: {
    // POST /trial/signup makes the Worker's first OUTBOUND fetch (Turnstile
    // siteverify). BL-149's last unexplained case: from Node that call takes
    // ~75-400ms, but the first one from inside workerd is far slower, which
    // suggests miniflare's outbound path initializes lazily too. With only
    // Upstash unbound the request fails closed at 503 and mints nothing, so
    // probing it has no side effect.
    checkpoint: 'first_trial_outbound',
    describe: 'POST /trial/signup (first outbound fetch from inside workerd)',
    run: (worker) =>
      worker.fetch('/trial/signup', {
        method: 'POST',
        headers: {
          Origin: 'https://globalstrategic.tech',
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '203.0.113.7',
        },
        body: JSON.stringify({ turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' }),
      }),
    requiresAuth: false,
  },
  trial2: {
    checkpoint: 'second_trial_outbound',
    describe: 'POST /trial/signup again (is the outbound cost first-use only?)',
    run: (worker) =>
      worker.fetch('/trial/signup', {
        method: 'POST',
        headers: {
          Origin: 'https://globalstrategic.tech',
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '203.0.113.7',
        },
        body: JSON.stringify({ turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' }),
      }),
    requiresAuth: false,
  },
  trialcase: {
    // Replays trial-signup.test.ts's fourth case end to end — the KV list it
    // takes as a "before" count, the signup POST, then the same list again.
    // Probing the steps individually showed each was fast, so the case is
    // reproduced as a whole rather than assumed to be the sum of its parts.
    checkpoint: 'trial_fourth_case',
    describe: 'trial-signup.test.ts case 4: kv list → signup → kv list',
    run: async (worker) => {
      const list = () =>
        worker.fetch('/admin/oauth/m2m-clients', {
          headers: { Authorization: `Bearer ${ADMIN_KEY}` },
        });
      const t0 = performance.now();
      const before = await list();
      await before.json();
      const t1 = performance.now();
      const res = await worker.fetch('/trial/signup', {
        method: 'POST',
        headers: {
          Origin: 'https://globalstrategic.tech',
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '203.0.113.7',
        },
        body: JSON.stringify({ turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' }),
      });
      await res.json();
      const t2 = performance.now();
      const after = await list();
      await after.json();
      const t3 = performance.now();
      // Sub-step breakdown, printed by the child so one run tells us which
      // of the three steps the case actually spends its seconds in.
      process.stderr.write(
        `    [trialcase] kvList1=${Math.round(t1 - t0)}ms signup=${Math.round(t2 - t1)}ms kvList2=${Math.round(t3 - t2)}ms\n`
      );
      return res;
    },
    requiresAuth: false,
  },
  kv: {
    checkpoint: 'first_kv',
    describe: 'GET /admin/oauth/m2m-clients (KV — instance 18 subsystem)',
    run: (worker) =>
      worker.fetch('/admin/oauth/m2m-clients', {
        headers: { Authorization: `Bearer ${ADMIN_KEY}` },
      }),
    requiresAuth: true,
  },
};

/** Millisecond delta around an awaited thunk, plus whatever it returned. */
async function timed(fn) {
  const started = performance.now();
  const value = await fn();
  return { ms: performance.now() - started, value };
}

/** True when nothing is listening on `port` any more (i.e. we can bind it). */
function portIsFree(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}

/**
 * Count workerd processes visible to this user. Reported SEPARATELY from
 * the port check on purpose: on Windows a successful rebind does not
 * prove the child was reaped, so one signal must not stand in for the
 * other (BL-149's teardown criterion asks whether stop() COMPLETES).
 */
function countWorkerdProcesses() {
  try {
    const out =
      process.platform === 'win32'
        ? execFileSync('tasklist', ['/FI', 'IMAGENAME eq workerd.exe', '/NH'], {
            encoding: 'utf8',
          })
        : execFileSync('pgrep', ['-c', 'workerd'], { encoding: 'utf8' });
    return process.platform === 'win32'
      ? (out.match(/workerd\.exe/gi) ?? []).length
      : Number(out.trim());
  } catch {
    // pgrep exits 1 when nothing matches; tasklist may be unavailable.
    return 0;
  }
}

/** One boot → probe → stop cycle. Nothing here is bounded by a timeout. */
async function measureOnce({ order, warm, env }) {
  const { unstable_dev } = await import('wrangler');
  const checkpoints = {};

  const boot = await timed(() =>
    unstable_dev('src/worker.ts', {
      config: 'wrangler.toml',
      env,
      local: true,
      experimental: { disableExperimentalWarning: true },
      vars: {
        MCP_ADMIN_KEY: ADMIN_KEY,
        MCP_KEY_RP: RP_KEY,
        // Same trial vars as tests/integration/trial-signup.test.ts. Without
        // TURNSTILE_SECRET_KEY the handler fails closed BEFORE calling
        // siteverify, so the trial probe would measure the wrong path — the
        // first version of this script did exactly that and reported ~88ms
        // for a step the test pays seconds for.
        TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
        TRIAL_IP_HMAC_SECRET: 'integration-hmac-secret',
        TURNSTILE_EXPECTED_HOSTNAMES: 'globalstrategic.tech',
      },
    })
  );
  const worker = boot.value;
  checkpoints.boot = boot.ms;

  const port = worker.port;
  const refusals = [];

  try {
    if (warm) {
      // The proposed fix, applied here so the probes below measure the
      // RESIDUAL a warmed test would actually pay.
      const w = await timed(() => worker.fetch('/health'));
      checkpoints.warmup = w.ms;
    }

    for (const token of order) {
      const probe = PROBES[token];
      if (!probe) throw new Error(`unknown probe '${token}' (want: ${Object.keys(PROBES)})`);
      const { ms, value: res } = await timed(() => probe.run(worker));
      checkpoints[probe.checkpoint] = ms;
      if (probe.requiresAuth && res.status === 401) {
        // A 401 means the probe never reached the subsystem, so its
        // number is meaningless. Recorded, not thrown, so one bad probe
        // does not discard the whole run's other checkpoints.
        refusals.push({ checkpoint: probe.checkpoint, status: 401 });
      }
    }

    // Second /health: the warm baseline every later test enjoys.
    const second = await timed(() => worker.fetch('/health'));
    checkpoints.warm_health = second.ms;
  } finally {
    const stopped = await timed(() => worker.stop());
    checkpoints.stop = stopped.ms;
  }

  // Teardown probe (H3). Two independent signals, deliberately not merged.
  const portReleased = await portIsFree(port);
  const workerdProcessesAfterStop = countWorkerdProcesses();

  return { checkpoints, refusals, port, portReleased, workerdProcessesAfterStop };
}

/** Spawn this script as a child so each run gets a fresh process. */
function runChild(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--single', ...args], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => {
      // The Worker under test writes its own structured JSON logs to
      // stdout, so the result carries a sentinel rather than being found
      // by "starts with {" — that heuristic picked up a
      // `ratelimit.skipped` log line instead of the result.
      const line = stdout
        .split('\n')
        .find((l) => l.startsWith(RESULT_SENTINEL))
        ?.slice(RESULT_SENTINEL.length);
      if (code !== 0 || !line) {
        resolve({ error: stderr.trim().slice(-400) || `child exited ${code}` });
        return;
      }
      try {
        resolve(JSON.parse(line));
      } catch (err) {
        resolve({ error: `unparseable child output: ${err.message}` });
      }
    });
  });
}

/**
 * Percentile table over the collected runs.
 *
 * Reuses `percentile` from probe-latency.mjs. Deliberately NOT reusing
 * that module's `computeStats` (no p99, and BL-149 asks for one) or
 * `renderSummaryTable` (its columns are surface/SLA/outcome-class shaped
 * and do not fit checkpoint rows). This is a considered choice, not an
 * oversight — please don't "fix" it into a reuse that loses p99.
 */
function renderTable(runs, meta) {
  const names = [];
  for (const run of runs)
    for (const k of Object.keys(run.checkpoints ?? {})) {
      if (!names.includes(k)) names.push(k);
    }

  const lines = [
    `### unstable_dev boot & first-use latency — ${meta.okRuns}/${meta.runs} runs, ${meta.mode}`,
    '',
    `platform ${process.platform} · node ${process.version} · wrangler ${meta.wrangler} · probe order ${meta.order.join(',')}`,
    '',
    '| checkpoint | n | p50 | p95 | p99 | max | > 5000ms |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const name of names) {
    const samples = runs.map((r) => r.checkpoints?.[name]).filter((n) => typeof n === 'number');
    if (samples.length === 0) continue;
    const over = samples.filter((n) => n > 5000).length;
    lines.push(
      `| ${name} | ${samples.length} | ${r1(percentile(samples, 50))} | ${r1(percentile(samples, 95))} | ` +
        `${r1(percentile(samples, 99))} | ${r1(Math.max(...samples))} | ${over}/${samples.length} |`
    );
  }

  const released = runs.filter((r) => r.portReleased === true).length;
  const leftovers = runs
    .map((r) => r.workerdProcessesAfterStop)
    .filter((n) => typeof n === 'number');
  lines.push(
    '',
    `**Teardown** — port released after \`stop()\` resolved: ${released}/${runs.length}. ` +
      `workerd processes still visible after stop: ${leftovers.length ? `${Math.min(...leftovers)}–${Math.max(...leftovers)}` : 'not sampled'} ` +
      `(reported separately: a rebind alone is not proof of reaping on Windows).`
  );

  const refused = runs.flatMap((r) => r.refusals ?? []);
  if (refused.length > 0) {
    lines.push(
      '',
      `**WARNING** — ${refused.length} probe(s) got a 401 and therefore never reached their subsystem; ` +
        `those checkpoint numbers measure the auth gate, not the subsystem. Fix the credentials before quoting this table.`
    );
  }
  return lines.join('\n');
}

function r1(n) {
  return n === null || n === undefined ? '—' : Math.round(n * 10) / 10;
}

function parseArgs(argv) {
  const opts = {
    runs: 10,
    order: ['health', 'mcp', 'kv'],
    warm: false,
    env: 'staging',
    json: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--runs') opts.runs = Number(argv[++i]);
    else if (arg === '--order')
      opts.order = String(argv[++i])
        .split(',')
        .map((s) => s.trim());
    else if (arg === '--warm') opts.warm = true;
    else if (arg === '--env') opts.env = String(argv[++i]);
    else if (arg === '--json') opts.json = String(argv[++i]);
    else if (arg === '--single') opts.single = true;
    else throw new Error(`unknown option ${arg}`);
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.single) {
    const result = await measureOnce(opts);
    process.stdout.write(`${RESULT_SENTINEL}${JSON.stringify(result)}\n`);
    return;
  }

  const childArgs = ['--order', opts.order.join(','), '--env', opts.env];
  if (opts.warm) childArgs.push('--warm');

  const runs = [];
  for (let i = 0; i < opts.runs; i += 1) {
    const result = await runChild(childArgs);
    runs.push(result);
    process.stderr.write(
      result.error
        ? `run ${i + 1}/${opts.runs} FAILED: ${result.error}\n`
        : `run ${i + 1}/${opts.runs} boot=${Math.round(result.checkpoints.boot)}ms ` +
            `${opts.order.map((t) => `${t}=${Math.round(result.checkpoints[PROBES[t].checkpoint])}ms`).join(' ')}\n`
    );
  }

  const ok = runs.filter((r) => !r.error);
  if (ok.length === 0) {
    console.error('every run failed — nothing to summarise');
    process.exit(1);
  }

  let wrangler = 'unknown';
  try {
    const { default: pkg } = await import('wrangler/package.json', { with: { type: 'json' } });
    wrangler = pkg.version;
  } catch {
    /* version is metadata; never fail the run over it */
  }

  const meta = {
    runs: opts.runs,
    okRuns: ok.length,
    mode: opts.warm ? 'WARM arm (fix simulated)' : 'COLD arm (current behaviour)',
    order: opts.order,
    wrangler,
  };

  console.log(renderTable(ok, meta));

  if (opts.json) {
    writeFileSync(opts.json, `${JSON.stringify({ meta, runs }, null, 2)}\n`);
    console.log(`\nRaw samples → ${opts.json}`);
  }
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
