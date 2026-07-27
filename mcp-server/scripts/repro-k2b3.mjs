// BL-032.25 § 3 reproduction script — local stdio `generate_diligence_agenda` timing probe.
//
// Replays the K.2.b.3 input combo (BL-032 soak, 2026-05-12) against
// `node dist/index.js` over a piped-stdio child process. Times three
// observable checkpoints so we can classify the result against the
// three open hypotheses:
//
//   H1 — large JSON response overflowing the stdio pipe buffer
//        (15–20 KB, historically doubled by content/structuredContent
//        duplication — removed in 0.43.0 / BL-090, so a re-run of this
//        repro now moves roughly half the bytes it did originally)
//   H2 — generateScript engine slow path for this input combo
//   H3 — stdio child-process deadlock (Desktop-side artifact; we may
//        not be able to reproduce H3 since our reader is a plain Node
//        stream consumer, not Claude Desktop)
//
// Usage:
//   cd mcp-server
//   npm run build                           # build dist/index.js first
//   node scripts/repro-k2b3.mjs [options]
//
// Options:
//   --minimal       Use the all-'unknown' minimal-input variant instead
//                   of the K.2.b.3 worst-case all-13-fields combo
//   --runs <n>      Repeat the call N times (default 1) — useful to
//                   distinguish a flake from a reliable reproduction
//   --timeout <ms>  Per-call timeout (default 30000)
//
// Companion: src/docs/development/_archive/MCP_SERVER_REMOTE_BL-032_25.md § 3
//            src/docs/development/_archive/BL-032_TESTING_FINDINGS.md § T.K.2.b.3

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const here = dirname(fileURLToPath(import.meta.url));
const distEntry = resolve(here, '..', 'dist', 'index.js');

// --- CLI args -----------------------------------------------------------

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const optValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
};

const useMinimal = flag('--minimal');
const runs = Math.max(1, Number(optValue('--runs', '1')) || 1);
const timeoutMs = Math.max(1000, Number(optValue('--timeout', '30000')) || 30000);

// --- Inputs -------------------------------------------------------------

// K.2.b.3 verbatim — all 13 fields supplied; the combo that hung Claude
// Desktop's local stdio connector for the full 4-minute timeout while
// the staging connector completed normally.
const K2B3_INPUTS = {
  transactionType: 'venture-series',
  productType: 'b2b-saas',
  techArchetype: 'modern-cloud-native',
  headcount: '51-200',
  revenueRange: '5-25m',
  growthStage: 'scaling',
  companyAge: '2-5yr',
  geographies: ['us', 'eu'],
  dataSensitivity: 'high',
  businessModel: 'productized-platform',
  scaleIntensity: 'moderate',
  operatingModel: 'product-aligned-teams',
  transformationState: 'stable',
};

// Minimal-input variant — all enums set to 'unknown'. Used to isolate
// engine-side trigger-matching cost from response-shape cost.
const MINIMAL_INPUTS = {
  transactionType: 'unknown',
  productType: 'unknown',
  techArchetype: 'unknown',
  headcount: 'unknown',
  revenueRange: 'unknown',
  growthStage: 'unknown',
  companyAge: 'unknown',
  geographies: ['unknown'],
  dataSensitivity: 'unknown',
  businessModel: 'unknown',
  scaleIntensity: 'unknown',
  operatingModel: 'unknown',
  transformationState: 'unknown',
};

const inputs = useMinimal ? MINIMAL_INPUTS : K2B3_INPUTS;
const label = useMinimal ? 'MINIMAL (all-unknown)' : 'K.2.b.3 (all-13-fields)';

// --- Pre-flight ---------------------------------------------------------

if (!existsSync(distEntry)) {
  console.error(`[repro] dist/index.js not found at ${distEntry}`);
  console.error('[repro] run `npm run build` from mcp-server/ first.');
  process.exit(1);
}

console.log(`[repro] BL-032.25 § 3 — stdio diligence timing probe`);
console.log(`[repro] entry: ${distEntry}`);
console.log(`[repro] input: ${label}`);
console.log(`[repro] runs: ${runs}, timeout: ${timeoutMs}ms`);
console.log('');

// --- Run loop -----------------------------------------------------------

const results = [];

for (let run = 1; run <= runs; run++) {
  const r = await runOnce(run);
  results.push(r);
  if (run < runs) await new Promise((res) => setTimeout(res, 500));
}

// --- Summary ------------------------------------------------------------

console.log('');
console.log('[repro] ---- summary ----');
for (const r of results) {
  if (r.timedOut) {
    console.log(`  run ${r.run}: TIMEOUT after ${timeoutMs}ms (no response received)`);
  } else {
    const sizeKb = (r.responseBytes / 1024).toFixed(1);
    console.log(
      `  run ${r.run}: wall=${r.wallMs.toFixed(0)}ms  ` +
        `engine=${r.engineMs ?? '?'}ms  ` +
        `serialize=${r.serializeMs ?? '?'}ms  ` +
        `wire=${r.wireMs ?? '?'}ms  ` +
        `bytes=${sizeKb}KB`
    );
  }
}

console.log('');
console.log('[repro] classification hints:');
console.log('  - wall >> engine+serialize: stdio wire path is the bottleneck (H1 likely)');
console.log('  - engine dominates wall:    engine slow path (H2)');
console.log('  - never receives response:  H3 (deadlock) — but our reader is plain Node,');
console.log('                              so a H3 specific to Claude Desktop will NOT');
console.log('                              reproduce here. Inconclusive = leave H3 open.');

// --- Helpers ------------------------------------------------------------

async function runOnce(run) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [distEntry], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, MCP_REPRO_TIMING: '1' },
    });

    let stdoutBuf = '';
    let stderrBuf = '';
    let timedOut = false;
    let responseLine = null;
    const sentAt = performance.now();

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdoutBuf += chunk.toString('utf8');
      // JSON-RPC over stdio is newline-delimited. Grab the first complete
      // line that parses as JSON with our request id.
      let nl;
      while ((nl = stdoutBuf.indexOf('\n')) !== -1) {
        const line = stdoutBuf.slice(0, nl);
        stdoutBuf = stdoutBuf.slice(nl + 1);
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg && msg.id === 42) {
            responseLine = line;
            clearTimeout(timer);
            child.kill('SIGTERM');
            return;
          }
        } catch {
          // not JSON or not ours — keep scanning
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString('utf8');
    });

    child.on('close', () => {
      const closedAt = performance.now();
      const wallMs = closedAt - sentAt;

      // Parse [REPRO] markers from stderr to derive engine / serialize timings.
      // Marker format: `[REPRO] <label> t=<ms>ms` — emitted by handleDiligenceTool
      // when MCP_REPRO_TIMING=1.
      const markers = parseReproMarkers(stderrBuf);
      const tEnter = markers['handler:enter'];
      const tEngine = markers['engine:returned'];
      const tReturn = markers['handler:returning'];
      const engineMs = tEnter != null && tEngine != null ? (tEngine - tEnter).toFixed(0) : null;
      const serializeMs =
        tEngine != null && tReturn != null ? (tReturn - tEngine).toFixed(0) : null;

      let responseBytes = 0;
      if (responseLine) responseBytes = Buffer.byteLength(responseLine, 'utf8');

      // wire time approximation = wall − (engine + serialize)
      // This includes stdio write + our reader's consumption + JSON-RPC parsing.
      const otherMs =
        engineMs != null && serializeMs != null
          ? wallMs - Number(engineMs) - Number(serializeMs)
          : null;

      console.log(
        `[repro] run ${run}: ${timedOut ? 'TIMEOUT' : 'received'} ` +
          `(wall ${wallMs.toFixed(0)}ms, bytes ${responseBytes})`
      );
      if (stderrBuf.trim()) {
        // Show non-banner stderr lines (drops the standard '[gst-mcp] connected on stdio')
        const tailLines = stderrBuf
          .split('\n')
          .filter((l) => l && !l.includes('[gst-mcp] connected on stdio'))
          .slice(-6);
        for (const l of tailLines) console.log(`         stderr: ${l}`);
      }

      resolveRun({
        run,
        timedOut,
        wallMs,
        engineMs,
        serializeMs,
        wireMs: otherMs != null ? otherMs.toFixed(0) : null,
        responseBytes,
      });
    });

    // Send a single tools/call request for generate_diligence_agenda. ID 42 is
    // arbitrary — we just need to recognize the response.
    const envelope = {
      jsonrpc: '2.0',
      id: 42,
      method: 'tools/call',
      params: {
        name: 'generate_diligence_agenda',
        arguments: inputs,
      },
    };
    child.stdin.write(JSON.stringify(envelope) + '\n');
  });
}

function parseReproMarkers(stderr) {
  const out = {};
  const re = /\[REPRO\] ([^\s]+) t=([\d.]+)ms/g;
  let m;
  while ((m = re.exec(stderr)) !== null) {
    out[m[1]] = Number(m[2]);
  }
  return out;
}
