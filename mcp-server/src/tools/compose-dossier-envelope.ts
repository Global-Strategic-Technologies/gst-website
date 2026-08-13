/**
 * MCP tool: compose_dossier_envelope (BL-045 PR B forcing-function tightening).
 *
 * Closes the dossier-rendering compliance gap empirically exposed by the
 * v8 + v9 SanFran traces: the model treats body-text directives
 * (meta fence, (J), (K), self-check) as descriptive context, not as a
 * procedure. This tool externalizes the structure into a tool input so
 * the model can't compose the dossier without producing the envelope.
 *
 * **v0.13.1 partial revert** — the BL-049 HMAC-receipt / xlsx-canonicalized
 * branch was reverted because the cross-host Claude Desktop topology
 * (model in cloud-side Linux sandbox, MCP server on user host) has no
 * reachable path to deliver attached xlsx bytes to the server. The
 * cryptographically-receipted path is deferred indefinitely (revisit
 * blueprint per `src/docs/adr/0003-irl-xlsx-canonicalization-hash-bind.md`;
 * no BACKLOG ticket — gated on external infrastructure with no roadmap)
 * pending either an MCP spec primitive for binary resource delivery OR
 * a Claude Desktop attachment-to-host bridge. What stayed from BL-049: the
 * `tier-fabrication` gap category and `deriveTier()` discipline (the v11
 * Finding B closure that empirically fired on a partner-paste live run).
 *
 * Pure tool — no engine state, no Hub deeplink. Internally calls
 * `runIrlProvenanceCheck` to verify every load-bearing claim against the
 * IRL and auto-appends `provenance-gap:` / `tier-mismatch:` /
 * `tier-fabrication:` entries to (J) for fabrications.
 *
 * See: src/schemas/compose-dossier-envelope.ts for the input shape +
 * render functions + the pure engine.
 */

import type { McpServer } from '@modelcontextprotocol/server';
import {
  NOOP_METRICS_CONTEXT,
  withToolMetrics,
  type CountersScope,
  type MetricsContext,
  type ToolCallCounterEntry,
} from '../metrics/_index';
import { irlIngestionPrompt } from '../prompts/irl-ingestion';
import {
  Bl063CertificationNotRegulationError,
  Bl063PartitionViolationError,
  Bl068MapAbsentFalsePositiveError,
  Bl070VerbatimBodyRequiredError,
  Bl076BodyCacheMissError,
  ComposeDossierEnvelopeInputSchema,
  IrlBodyHashMismatchError,
  runComposeDossierEnvelope,
  type ComposeDossierEnvelopeEngineInput,
  type ComposeDossierEnvelopeInput,
} from '../schemas/compose-dossier-envelope';
import { toolOk, toolFail } from './_result';

const TOOL_DESCRIPTION = `Render the dossier's structural envelope (top-of-document meta JSON fence, (J) gap list, (K) provenance footer) as markdown the model transcribes verbatim into the dossier.

**Why call this tool**: prior runs showed the model treats markdown directives in the prompt body as descriptive context, not as a procedure to execute. The meta fence, (J), and (K) were silently elided from otherwise high-quality dossiers. This tool closes that gap with the same architectural pattern that solved the dimension-layer fabrication risk — externalize the structure so the model has to assemble it before composing the dossier.

**When to call**: AS THE FINAL STEP of \`gst_irl_ingestion\` in \`mode: full\`, BEFORE composing the dossier prose. You must have already (a) run the wrong-IRL pre-flight to compute fillRatio, (b) evaluated every inclusion gate, (c) gathered every load-bearing claim with its IRL citation, and (d) enumerated the gap-list entries by category.

**Input contract** (see the input schema for full details):
- \`promptName\`, \`promptVersion\`, \`modelVersion\`, \`mode\`, \`verbosity\`, \`transactionContext\` — meta-fence header.
- \`fillRatio\` — output of the wrong-IRL pre-flight (percent + substantiveCells + totalCells + status enum).
- \`gatesPassed\`, \`gatesElided\`, \`conditionalTriggersFired\`, \`forceToolsApplied\` — meta-fence body.
- \`claims\` — EVERY load-bearing claim the dossier will make (NRR figures, ARR, TechPar verdicts, ICG scores, Tech Debt carry, regulatory frameworks, comparable engagement code names, etc.). Each carries the claim label + IRL citation + tier. The tool renders (K) from these.
- \`gaps\` — categorized gap entries you have already identified. The tool auto-APPENDS \`tier-mismatch:\`, \`tier-fabrication:\`, and \`provenance-gap:\` entries based on the citation verdicts; do NOT pre-populate those categories.
- \`filledIrl\` — the populated IRL body. Used internally to verify every claim's citation against the IRL via the same engine \`validate_irl_provenance\` uses.
- \`irlBodyHash\` — copy verbatim from the prompt body's \`**Body-binding hash:**\` directive. Tool verifies \`sha256(cachedBody).slice(0,16) === irlBodyHash\`.

**Output**: three markdown blocks (\`metaFenceMarkdown\`, \`gapListMarkdown\`, \`provenanceFooterMarkdown\`) the model pastes verbatim into the dossier, plus a \`provenanceVerification\` summary (count of verified / verified-fuzzy / partner-supplied / unverified / auto-appended-gaps / tierMismatches / tierFabrications) and \`emitInstructions\` with the transcription discipline.

**Re-calling**: if you discover additional gaps or claims after a first call, re-call the tool with the updated arrays rather than editing the markdown by hand.`;

/**
 * Handler exported so integration tests can exercise the full pipeline
 * without going through the MCP transport.
 *
 * BL-071 — accepts the bound `MetricsContext` so the server-arithmetic
 * `serverToolCallCounts` snapshot (`metrics.counters?.snapshot()`) can be
 * read at envelope-build time and emitted in the result for the model to
 * copy verbatim into the BL-045-VERIFY block. When `metrics` is undefined
 * (legacy call sites / tests without counters), the field is omitted.
 */
export async function handleComposeDossierEnvelopeTool(
  payload: ComposeDossierEnvelopeInput,
  metrics?: MetricsContext
) {
  try {
    // BL-076 — fetch the IRL body from the server-side cache. The model
    // no longer emits `filledIrl` to this tool's input (saving 9–80KB of
    // output tokens per call); instead `prepare_irl_body` cached the body
    // keyed by its canonical hash, and we re-hydrate it here. Cache miss
    // surfaces a structured rejection directing the model to call
    // `prepare_irl_body` first. The engine signature is unchanged — we
    // re-inject `filledIrl` into the engine input post-fetch (audit M-1).
    const filledIrl = await metrics?.irlBodyCache?.get(payload.irlBodyHash);
    if (filledIrl === null || filledIrl === undefined) {
      throw new Bl076BodyCacheMissError(payload.irlBodyHash);
    }
    const engineInput: ComposeDossierEnvelopeEngineInput = { ...payload, filledIrl };

    // BL-045 PR B audit ALT-2: derive `promptVersion` from the prompt
    // module (a leaf import — no circular-dep risk via the registry).
    // Overrides whatever the model passed; closes the v10 hallucination
    // failure mode where the model emitted `"0.0.2"` in the meta fence.
    const baseResult = runComposeDossierEnvelope(engineInput, {
      promptVersion: irlIngestionPrompt.version,
    });
    // BL-071 — server-authoritative tool-call counts. The envelope tool
    // itself shows `attempted: 1, succeeded: 0` because the wrap is still
    // in-flight at snapshot time (audit M1 — desired semantic: "I'm reporting
    // on the call I'm currently inside").
    //
    // BL-121 — merge the durable run-scoped counts over the per-request map,
    // and report which regime the numbers are in.
    const inProcess = metrics?.counters?.snapshot();
    // An empty run key must SKIP the read, not read the bare prefix. The
    // schema requires `irlBodyHash`, so this is unreachable today — but if it
    // ever became reachable, `snapshot('')` would hit the prefix-only key,
    // return `{}` for it, and report `countersScope: 'run'` over a row nobody
    // ever wrote. Treating it as an unreadable store degrades to `request`,
    // which is the honest answer for "no run to look up".
    // `null` (not `undefined`) on an empty key: `undefined` means "no durable
    // store bound", which leaves the scope at 'run' and uses the per-request
    // map wholesale — the exact false green this guard exists to prevent.
    const runKey = engineInput.irlBodyHash;
    const durable = metrics?.runCounters
      ? runKey
        ? await metrics.runCounters.snapshot(runKey)
        : null
      : undefined;
    // A `null` snapshot means the store could not be READ (not "no calls") —
    // reporting `run` over per-request numbers would claim the identity holds
    // while every earlier row is missing, which is a total false red.
    const countersScope: CountersScope | undefined =
      durable === null && metrics?.countersScope === 'run' ? 'request' : metrics?.countersScope;
    const serverToolCallCounts = mergeCounts(inProcess, durable ?? undefined);
    const result = serverToolCallCounts
      ? { ...baseResult, serverToolCallCounts, ...(countersScope ? { countersScope } : {}) }
      : baseResult;
    return toolOk(result, 'Dossier envelope composed.');
  } catch (error) {
    // BL-045 PR B audit BL-2 → ALT-1: surface hash-bind diagnostic
    // verbatim so the model can act on it and retry with verbatim IRL.
    if (error instanceof IrlBodyHashMismatchError) {
      return toolFail('hash-mismatch', error.message);
    }
    // BL-063 server-side enforcement: surface partition + scope
    // diagnostics verbatim so the model can act on them.
    if (
      error instanceof Bl063PartitionViolationError ||
      error instanceof Bl063CertificationNotRegulationError ||
      error instanceof Bl068MapAbsentFalsePositiveError ||
      error instanceof Bl070VerbatimBodyRequiredError ||
      error instanceof Bl076BodyCacheMissError
    ) {
      return toolFail(
        error instanceof Bl076BodyCacheMissError ? 'cache-miss' : 'invalid-input',
        error.message
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    return toolFail('internal-error', `Failed to compose dossier envelope: ${message}`);
  }
}

/**
 * BL-121 — combine the durable run-scoped counts with the per-request map.
 *
 * **Neither "durable + in-process" nor "durable over in-process" is correct.**
 * The per-request map accumulates *every* call made in this request, not just
 * the one in flight — so plain addition double-counts a completed same-request
 * call, and plain override loses the envelope's own in-flight attempt (the
 * `{attempted: 1, succeeded: 0}` shape `CONTRACT.md` documents).
 *
 * The rule:
 *   - outcomes (`succeeded` / `rejected` / `errored`) come from durable, which
 *     is the only view that spans requests;
 *   - `attempted` = durable `attempted` + the **in-flight delta** from
 *     in-process (`attempted − succeeded − rejected − errored`), which is 1
 *     for the call currently inside the wrapper and 0 for completed ones.
 *
 * With no durable snapshot at all — stdio, unbound Upstash, or an unreadable
 * store — the in-process map is used wholesale, which is exactly right in the
 * one regime where it already spans the session (stdio) and honestly partial
 * in the others (reported as `countersScope: 'request'`).
 *
 * Worked example, the supported re-call path: a first compose succeeds
 * (durable `{attempted: 1, succeeded: 1}`), the model re-calls with updated
 * arrays, and the second call's snapshot reads durable `{1,1}` plus its own
 * in-flight delta of 1 → `{attempted: 2, succeeded: 1}` — the `N / N−1` shape
 * the prompt already documents.
 */
export function mergeCounts(
  inProcess: Record<string, ToolCallCounterEntry> | undefined,
  durable: Record<string, ToolCallCounterEntry> | undefined
): Record<string, ToolCallCounterEntry> | undefined {
  if (!durable) return inProcess;
  const out: Record<string, ToolCallCounterEntry> = {};
  for (const [tool, entry] of Object.entries(durable)) out[tool] = { ...entry };
  for (const [tool, live] of Object.entries(inProcess ?? {})) {
    const inFlight = live.attempted - live.succeeded - live.rejected - live.errored;
    // Skip BEFORE materialising the row. Creating it first would emit an
    // all-zero entry for a tool with nothing in flight, and a zeroed row for a
    // tool the server saw succeed corrodes the absent-vs-zeroed discriminator
    // the prompt tells the model to use when a count looks short.
    if (inFlight <= 0) continue;
    const base = (out[tool] ??= { attempted: 0, succeeded: 0, rejected: 0, errored: 0 });
    base.attempted += inFlight;
  }
  return out;
}

export function registerComposeDossierEnvelopeTool(
  server: McpServer,
  metrics: MetricsContext = NOOP_METRICS_CONTEXT
): void {
  server.registerTool(
    'compose_dossier_envelope',
    {
      title: 'Compose dossier envelope (meta fence + (J) gap list + (K) provenance footer)',
      description: TOOL_DESCRIPTION,
      inputSchema: ComposeDossierEnvelopeInputSchema,
    },
    withToolMetrics(
      'compose_dossier_envelope',
      metrics,
      // BL-071: capture `metrics` in the closure so the handler can read
      // `metrics.counters?.snapshot()` at envelope-build time.
      (payload: ComposeDossierEnvelopeInput) => handleComposeDossierEnvelopeTool(payload, metrics)
    )
  );
}
