# ADR-0034: IRL verdict events are emitted from compose_dossier_envelope, once per run

- **Status**: Accepted (2026-09-14, `@gst/mcp-server@0.63.0`)
- **Source initiative**: BL-157 (declared-but-dead AE event types)

## Context

`wrong_irl_detected` and `gate_elided` were declared in [`metrics/_schema.ts`](../../../mcp-server/src/metrics/_schema.ts) under BL-045 PR B, with emitter functions and no caller. The emitters' own comments gave the reason: both verdicts are reached by the **model** while following the `gst_irl_ingestion` prompt, "the server never sees the verdict", so recording them would need a client to send the verdict back on a later request. No client does that, so they stayed dead.

That premise was wrong. `compose_dossier_envelope`, the final step of `gst_irl_ingestion` in `mode: full`, already receives both results as tool input: `fillRatio` (the counts behind the wrong-IRL pre-flight) and `gatesElided[]`. The server even recomputes the fill-ratio status itself (`deriveFillRatio`) and overrides the model's figure when they drift. The handler also already holds a `MetricsContext`.

BL-157's other two dead types were deleted in the same change rather than wired: `health_check` (the `/status` page reads live probes, not AE) and `prompt_span` (nothing produces the ID needed to link a prompt to its later tool calls).

## Decision

**Emit both events from `handleComposeDossierEnvelopeTool`, after the envelope is built successfully, once per run.**

1. **The server's verdict, not the model's.** `wrong_irl_detected.outcome` is `deriveFillRatio(fillRatio).derivedStatus`, using the prompt's thresholds (halt < 15%, partial < 40%, else ok). When the counts are incoherent (`substantiveCells > totalCells`), that function can only echo the model's own claim, so **no verdict is emitted**. Gates still are.
2. **Gate names are pinned.** `gatesElided[].tool` is a free string written by the model. `NAME_VALUES.gate_elided` pins it to the nine gated orchestrated tools (`ORCHESTRATED_TOOLS` minus `compose_dossier_envelope`, with parity enforced by a unit test), so `guardEvent` drops an invented name instead of recording model-authored text as a blob2 value. The pin is written as literals, because `_schema.ts` imports nothing and must not pull prompt code into every metrics consumer.
3. **Once per run.** Re-calling compose with updated arrays is a supported path, so emitting on every call would double-count. `withToolMetrics` records a call's outcome only **after** the handler returns. So inside the handler, `serverToolCallCounts.compose_dossier_envelope.succeeded` counts only earlier successful composes in the run, and events are emitted only when it is `0`. On the Worker that count comes from the durable run-scoped counters ([ADR-0016](0016-run-scoped-durable-tool-call-counters.md)).

**Rejected: emit from `prepare_irl_body`.** It runs before either verdict exists.

**Rejected: record the model's `fillRatio.status`.** The server already treats the model's figure as untrusted and restates it on drift; recording the claim would put the less reliable number into analytics.

**Rejected: client correlation over `_meta`.** No client does this, which is exactly why these events were dead for months.

**Rejected: delete both.** A count that misses runs which stopped early is still the only record of how often ingestion runs meet a wrong or thin IRL, and of which tools get skipped.

## Consequences

**Runs that stop before the envelope step are not counted.** A run the model halts, or abandons, never calls compose. `halt` therefore records only halted runs that were still carried through to compose. The panel is a count of verdicts among completed runs, **not a halt rate**. The dashboard panel description and [`GRAFANA.md`](../../../mcp-server/src/docs/operations/GRAFANA.md) say so.

**The count is an upper bound.** A run can be counted twice in two cases:

- On the Worker, the durable store is unbound or unreadable (the snapshot degrades to request scope), so a re-call in a new request looks like the run's first compose.
- Two concurrent first composes for the same run both read `0`.

Both are rare, and both over-count rather than under-count.

**Stdio emits nothing.** Stdio uses `NoopSink`. Its session-wide in-process counters would otherwise suppress a second run in the same session, since they are keyed by tool rather than by run. That limitation is moot while the sink is a no-op, and would need revisiting if stdio ever emitted to AE.

**blob5 (`correlation_id`) is now a reserved slot with no writer.** It is kept because AE column maps are effectively immutable once queried. `FIELD_EMITTED_BY.correlation_id` is empty, so the SQL guard fails any dashboard or alert query that reads it.

**Citing code and docs** (keep current): [`metrics/irl-ingestion-events.ts`](../../../mcp-server/src/metrics/irl-ingestion-events.ts) (`emitIrlRunVerdicts`), [`tools/compose-dossier-envelope.ts`](../../../mcp-server/src/tools/compose-dossier-envelope.ts), [`metrics/_schema.ts`](../../../mcp-server/src/metrics/_schema.ts) (`NAME_VALUES.gate_elided`, `FIELD_EMITTED_BY`), the dashboard's "IRL ingestion (BL-157)" row, [`irl-pipeline/CONTRACT.md`](../../../mcp-server/src/docs/tools/irl-pipeline/CONTRACT.md), [`GRAFANA.md`](../../../mcp-server/src/docs/operations/GRAFANA.md).
