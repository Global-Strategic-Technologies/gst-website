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
 *
 * Budget notes (see src/docs/operations/LATENCY_PROBE.md for the math):
 * a default run issues ~32 authenticated tool calls + 2 radar calls +
 * N unauthenticated /health GETs. Radar samples are informative-only
 * (sla:false) and capped at 2/run to respect the 5/min + 50/day radar
 * tier. 429/503 responses are recorded as classified outcomes and
 * EXCLUDED from latency percentiles (a rate-limited or circuit-open
 * response is not a latency sample).
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
];

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
  const args = { regionLabel: 'unlabeled', samples: 10, out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--region-label') args.regionLabel = argv[++i];
    else if (argv[i] === '--samples') args.samples = Number(argv[++i]);
    else if (argv[i] === '--out') args.out = argv[++i];
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
      const dataStart = buffer.indexOf('data:');
      if (dataStart !== -1 && buffer.indexOf('\n', dataStart) !== -1) return buffer;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

async function timedCall(surface, { mcpUrl, mcpKey, id }) {
  const started = performance.now();
  let status;
  let envelope = null;
  try {
    const signal = AbortSignal.timeout(CALL_TIMEOUT_MS);
    if (surface.kind === 'http-get') {
      const resp = await fetch(`${mcpUrl}${surface.path}`, { signal });
      status = resp.status;
      await resp.text(); // plain JSON body — closes normally
    } else {
      const resp = await fetch(`${mcpUrl}/mcp`, {
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
  return { outcome: classifyOutcome(status, envelope), latencyMs };
}

async function probeSurface(surface, samples, ctx) {
  const n = surface.fixedSamples ?? samples;
  const outcomes = {};
  const okLatencies = [];
  for (let i = 0; i < n; i++) {
    const { outcome, latencyMs, detail } = await timedCall(surface, { ...ctx, id: i + 1 });
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    if (outcome === 'ok') okLatencies.push(latencyMs);
    if (detail) console.error(`[probe] ${surface.name} sample ${i + 1}: ${outcome} — ${detail}`);
  }
  return {
    name: surface.name,
    sla: surface.sla,
    samplesRequested: n,
    outcomes,
    stats: computeStats(okLatencies),
    okLatenciesMs: okLatencies.map(round1),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mcpUrl = (process.env.MCP_URL ?? 'https://mcp.globalstrategic.tech').replace(/\/$/, '');
  const mcpKey = process.env.MCP_KEY;
  if (!mcpKey) {
    console.error('[probe] MCP_KEY env var is required (never pass the key inline).');
    process.exit(1);
  }

  console.log(
    `[probe] ${mcpUrl} | region-label=${args.regionLabel} | samples=${args.samples}/surface`
  );
  const results = [];
  for (const surface of PROBE_SURFACES) {
    results.push(await probeSurface(surface, args.samples, { mcpUrl, mcpKey }));
    console.log(`[probe] ${surface.name} done`);
  }

  const meta = {
    generatedAt: new Date().toISOString(),
    regionLabel: args.regionLabel,
    mcpUrl,
    samplesPerSurface: args.samples,
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
