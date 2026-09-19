/**
 * Synthetic latency probe for the remote MCP Worker (BL-033 pilot ops).
 *
 * Measures CLIENT-OBSERVED latency (network RTT included) per surface —
 * the number a pilot client actually experiences and the evidence stream
 * behind the SLA's p95 target. Distinct from Analytics Engine's
 * `duration_ms`, which times the handler INSIDE the Worker and excludes
 * the network path entirely (see `src/metrics/_schema.ts`). The BL-032
 * soak showed the difference dominates: GRU-region clients measured p95
 * ~930ms on calls the Worker itself completes in tens of ms
 * (_archive/BL-032_TESTING_FINDINGS.md T.H.4).
 *
 * Protocol: one stateless JSON-RPC POST per call (`tools/call`), the
 * exact shape `scripts/Invoke-McpRequest.ps1` proved against production —
 * no initialize handshake or session (the Worker builds its MCP server
 * per-request). Responses arrive as SSE; the first `data:` line carries
 * the JSON-RPC envelope.
 *
 * Usage (env only — never inline the key, Directive 15):
 *   MCP_URL=https://mcp-staging.globalstrategic.tech MCP_KEY=... \
 *     node mcp-server/scripts/probe-latency.mjs --region-label local-dev
 *
 * Flags:
 *   --region-label <s>  stamped into the output (e.g. github-us, gru); default 'unlabeled'
 *   --samples <n>       timed calls per surface (default 10)
 *   --out <file>        write full JSON results to this path
 *   --surfaces <a,b>    probe exactly these surfaces (by name) instead of the
 *                       scheduled set. The only way to reach `adhoc: true`
 *                       surfaces — see below.
 *
 * Budget notes (see src/docs/operations/LATENCY_PROBE.md for the math):
 * a default run issues ~32 authenticated tool calls (30 SLA-tool + 2
 * radar) plus N unauthenticated /health GETs. Radar samples are
 * informative-only (sla:false) and capped at 2/run to respect the
 * 5/min + 50/day radar tier. 429/503 responses are recorded as classified outcomes and
 * EXCLUDED from latency percentiles (a rate-limited or circuit-open
 * response is not a latency sample).
 *
 * Ad-hoc surfaces (`adhoc: true`) never run on the schedule and are
 * unauthenticated, so they cost no tier budget: BL-154 (ADR-0036) added
 * `token-unknown-client-{cold,warm}` (one OAUTH_KV read on the M2M mint
 * path, 401 by design; cold = origin miss per call, warm = edge-cached
 * re-read) and `server-json` (pure compute) as a differential set — the
 * p50 gap to `server-json` is the client-observed cost of the KV read.
 * They are sampled round-robin so all see the same network conditions,
 * and carry their own `fixedSamples` so the `--samples` cap (which exists
 * for the radar budget) is untouched.
 *
 * The probe's key (`MCP_KEY_PROBE` → keyOwner PROBE) is excluded from the
 * `traffic-spike-detected` alert rule (src/observability/alert-rules.ts,
 * SYNTHETIC_KEY_OWNERS) — synthetic traffic must not page the operator.
 *
 * No shebang, run via `node` (house style — see extract-irl-markdown.mjs).
 */
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

/** Surfaces probed per run. `sla: true` rows feed the SLA percentiles. */
export const PROBE_SURFACES = [
  { name: 'health', kind: 'http-get', path: '/health', sla: true },
  { name: 'list_portfolio_facets', kind: 'tool', args: {}, sla: true },
  { name: 'search_portfolio', kind: 'tool', args: { search: 'kubernetes' }, sla: true },
  { name: 'search_regulations', kind: 'tool', args: { jurisdiction: 'eu' }, sla: true },
  // Radar tier: informative only (SLA scopes to non-radar tools), fixed at
  // 2 samples/run regardless of --samples → 8/day at the 6h cadence,
  // safely under the 50/day radar cap.
  { name: 'search_radar', kind: 'tool', args: { category: 'pe-ma' }, sla: false, fixedSamples: 2 },
  // BL-154 differential set (ad-hoc only). `okStatuses` names the status
  // this surface is EXPECTED to return: an unknown client is a 401 by
  // contract (oauth/m2m-token.ts), and that 401 is the timing we want, so
  // it must count as an ok sample rather than be shed from the percentiles.
  // `-cold` uses a fresh id per call, so every KV read is an origin miss;
  // `-warm` reuses one id for the whole run, so reads after the first hit
  // KV's edge cache — the path a real mint of an existing client takes.
  {
    name: 'token-unknown-client-cold',
    kind: 'http-post-form',
    path: '/token',
    body: () =>
      `grant_type=client_credentials&client_id=m2m_probe${randomSuffix()}&client_secret=x`,
    okStatuses: [401],
    sla: false,
    adhoc: true,
    fixedSamples: 200,
  },
  {
    name: 'token-unknown-client-warm',
    kind: 'http-post-form',
    path: '/token',
    body: () => `grant_type=client_credentials&client_id=${WARM_PROBE_CLIENT_ID}&client_secret=x`,
    okStatuses: [401],
    sla: false,
    adhoc: true,
    fixedSamples: 200,
  },
  {
    name: 'server-json',
    kind: 'http-get',
    path: '/server.json',
    sla: false,
    adhoc: true,
    fixedSamples: 200,
  },
];

function randomSuffix() {
  return Math.random().toString(36).slice(2, 10);
}
/** One unknown id per process, so `-warm` re-reads the same (absent) key. */
const WARM_PROBE_CLIENT_ID = `m2m_probewarm${randomSuffix()}`;

/**
 * Resolve which surfaces a run probes. No `--surfaces` → the scheduled set
 * (everything not `adhoc`). With `--surfaces` → exactly those names, which
 * is the only path to an ad-hoc surface. Unknown names throw rather than
 * silently probing nothing.
 */
export function selectSurfaces(names, surfaces = PROBE_SURFACES) {
  if (!names) return surfaces.filter((s) => !s.adhoc);
  return names.map((name) => {
    const found = surfaces.find((s) => s.name === name);
    if (!found) throw new Error(`Unknown surface: ${name}`);
    return found;
  });
}

/** Only `tools/call` surfaces carry the bearer; raw HTTP surfaces are public. */
export function surfaceNeedsAuth(surface) {
  return surface.kind === 'tool';
}

/** Build the JSON-RPC 2.0 `tools/call` body (Invoke-McpRequest.ps1 shape). */
export function buildToolCallBody(name, args, id = 1) {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name, arguments: args },
  });
}

/**
 * Extract the JSON-RPC envelope from an MCP streamable-HTTP response body.
 * Returns the parsed envelope, or throws when no SSE `data:` line exists
 * (protocol-unexpected on a 2xx — fail loudly, same policy as the PS
 * helper).
 */
export function parseSseEnvelope(bodyText) {
  const dataLine = bodyText.split('\n').find((line) => line.startsWith('data:'));
  if (!dataLine) {
    throw new Error(
      `2xx response but no SSE data line found. Body excerpt: ${bodyText.slice(0, 200)}`
    );
  }
  return JSON.parse(dataLine.slice(5).trim());
}

/**
 * Classify one call's result for aggregation. Only `ok` samples enter the
 * latency percentiles; everything else is counted by class so a degraded
 * run is visible instead of silently thinning the sample set.
 */
export function classifyOutcome(status, envelope) {
  if (status === 429) return 'rate-limited';
  if (status === 503) return 'circuit-open';
  if (status >= 400) return `http-${status}`;
  if (envelope && envelope.error) return 'rpc-error';
  if (envelope && envelope.result && envelope.result.isError === true) return 'tool-error';
  return 'ok';
}

/** Nearest-rank percentile over an unsorted sample array. */
export function percentile(samples, p) {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.max(0, rank - 1)];
}

/** Aggregate ok-sample latencies into the summary stats the SLA reads. */
export function computeStats(latenciesMs) {
  if (latenciesMs.length === 0) return { count: 0, p50: null, p95: null, max: null };
  return {
    count: latenciesMs.length,
    p50: round1(percentile(latenciesMs, 50)),
    p95: round1(percentile(latenciesMs, 95)),
    max: round1(Math.max(...latenciesMs)),
  };
}

function round1(n) {
  return n === null ? null : Math.round(n * 10) / 10;
}

/** Render the per-surface results as a markdown table (job-summary ready). */
export function renderSummaryTable(results, meta) {
  const lines = [
    `### MCP latency probe — ${meta.regionLabel} → ${meta.mcpUrl}`,
    '',
    '| surface | sla | ok | other outcomes | p50 ms | p95 ms | max ms |',
    '| --- | --- | ---: | --- | ---: | ---: | ---: |',
  ];
  for (const r of results) {
    const others =
      Object.entries(r.outcomes)
        .filter(([k]) => k !== 'ok')
        .map(([k, v]) => `${k}:${v}`)
        .join(' ') || '—';
    lines.push(
      `| ${r.name} | ${r.sla ? 'yes' : 'no'} | ${r.outcomes.ok ?? 0} | ${others} | ` +
        `${r.stats.p50 ?? '—'} | ${r.stats.p95 ?? '—'} | ${r.stats.max ?? '—'} |`
    );
  }
  return lines.join('\n');
}

function parseArgs(argv) {
  const args = { regionLabel: 'unlabeled', samples: 10, out: null, surfaces: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--region-label') args.regionLabel = argv[++i];
    else if (argv[i] === '--samples') args.samples = Number(argv[++i]);
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--surfaces') {
      args.surfaces = String(argv[++i] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  if (!Number.isInteger(args.samples) || args.samples < 1 || args.samples > 30) {
    throw new Error(`--samples must be an integer in [1, 30], got: ${args.samples}`);
  }
  return args;
}

/** Hard per-call ceiling — a hung call becomes a classified outcome, not a hung probe. */
const CALL_TIMEOUT_MS = 15_000;

/**
 * Read the response body only until the first complete SSE event (a
 * `data:` line terminated by a newline), then cancel the stream. The MCP
 * streamable-HTTP transport MAY hold the SSE connection open after the
 * JSON-RPC response event (observed on `wrangler dev`), so `resp.text()`
 * can block forever — and time-to-first-event is the latency a client
 * experiences anyway.
 */
export async function readFirstSseEvent(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return buffer;
      buffer += decoder.decode(value, { stream: true });
      // Line-anchored: `data:` must start a line (SSE field syntax) — a
      // payload merely containing the substring must not end the read early.
      const m = /(?:^|\n)data:[^\n]*\n/.exec(buffer);
      if (m) return buffer;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

/**
 * One timed request. Exported so the raw-HTTP kinds can be pinned against a
 * stubbed `fetch` (the `tool` kind is covered by the staging smoke).
 */
export async function timedCall(surface, { mcpUrl, mcpKey, id }, fetchImpl = fetch) {
  const started = performance.now();
  let status;
  let envelope = null;
  try {
    const signal = AbortSignal.timeout(CALL_TIMEOUT_MS);
    if (surface.kind === 'http-get') {
      const resp = await fetchImpl(`${mcpUrl}${surface.path}`, { signal });
      status = resp.status;
      await resp.text(); // plain JSON body — closes normally
    } else if (surface.kind === 'http-post-form') {
      const resp = await fetchImpl(`${mcpUrl}${surface.path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: surface.body(),
        signal,
      });
      status = resp.status;
      await resp.text();
    } else {
      const resp = await fetchImpl(`${mcpUrl}/mcp`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${mcpKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: buildToolCallBody(surface.name, surface.args, id),
        signal,
      });
      status = resp.status;
      if (status < 400) {
        envelope = parseSseEnvelope(resp.body ? await readFirstSseEvent(resp.body) : '');
      } else if (resp.body) {
        await resp.body.cancel().catch(() => {});
      }
    }
  } catch (err) {
    const outcome = err && err.name === 'TimeoutError' ? 'timeout' : 'network-error';
    return { outcome, latencyMs: null, detail: String(err).slice(0, 200) };
  }
  const latencyMs = performance.now() - started;
  const outcome = surface.okStatuses?.includes(status) ? 'ok' : classifyOutcome(status, envelope);
  return { outcome, latencyMs };
}

/**
 * Probe every selected surface, ROUND-ROBIN across surfaces per sample
 * index rather than surface-after-surface, so a differential pair (BL-154)
 * shares network conditions sample for sample. Per-surface aggregation is
 * unchanged, so the result shape is the same the scheduled run has always
 * produced.
 */
async function probeSurfaces(surfaces, samples, ctx) {
  const acc = surfaces.map((surface) => ({
    surface,
    n: surface.fixedSamples ?? samples,
    outcomes: {},
    okLatencies: [],
  }));
  const rounds = Math.max(0, ...acc.map((a) => a.n));
  for (let i = 0; i < rounds; i++) {
    for (const a of acc) {
      if (i >= a.n) continue;
      const { outcome, latencyMs, detail } = await timedCall(a.surface, { ...ctx, id: i + 1 });
      a.outcomes[outcome] = (a.outcomes[outcome] ?? 0) + 1;
      if (outcome === 'ok') a.okLatencies.push(latencyMs);
      if (detail) {
        console.error(`[probe] ${a.surface.name} sample ${i + 1}: ${outcome} — ${detail}`);
      }
    }
  }
  return acc.map((a) => ({
    name: a.surface.name,
    sla: a.surface.sla,
    samplesRequested: a.n,
    outcomes: a.outcomes,
    stats: computeStats(a.okLatencies),
    okLatenciesMs: a.okLatencies.map(round1),
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const surfaces = selectSurfaces(args.surfaces);
  const mcpUrl = (process.env.MCP_URL ?? 'https://mcp.globalstrategic.tech').replace(/\/$/, '');
  const mcpKey = process.env.MCP_KEY;
  if (!mcpKey && surfaces.some(surfaceNeedsAuth)) {
    console.error('[probe] MCP_KEY env var is required (never pass the key inline).');
    process.exit(1);
  }

  console.log(
    `[probe] ${mcpUrl} | region-label=${args.regionLabel} | samples=${args.samples}/surface | ` +
      `surfaces=${surfaces.map((s) => s.name).join(',')}`
  );
  const results = await probeSurfaces(surfaces, args.samples, { mcpUrl, mcpKey });

  const meta = {
    generatedAt: new Date().toISOString(),
    regionLabel: args.regionLabel,
    mcpUrl,
    // Per surface, because ad-hoc surfaces carry their own count and the
    // ADR that quotes this file must not read `--samples` for them.
    samplesPerSurface: Object.fromEntries(results.map((r) => [r.name, r.samplesRequested])),
  };
  const table = renderSummaryTable(results, meta);
  console.log(`\n${table}\n`);

  if (args.out) {
    writeFileSync(args.out, `${JSON.stringify({ ...meta, results }, null, 2)}\n`, 'utf-8');
    console.log(`[probe] Full results written to ${args.out}`);
  }

  // Non-zero exit only when NO surface produced a single ok sample — the
  // probe is evidence collection, not a health gate; partial degradation
  // is reported in the data, not the exit code.
  const anyOk = results.some((r) => (r.outcomes.ok ?? 0) > 0);
  if (!anyOk) {
    console.error('[probe] Every sample failed — check MCP_URL / MCP_KEY / Worker status.');
    process.exit(1);
  }
}

// Import-guard so vitest can import the pure helpers without firing the
// probe (same pattern as .claude/hooks/push-review-gate.mjs isMain guard).
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  await main();
}
