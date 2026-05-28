/**
 * BL-032.75 Phase 1 — `prompt_span` emitter.
 *
 * "Poor-man's trace" — when a prompt orchestration involves multiple
 * downstream Tool calls (the fan-out documented in the plan as "4 Tool
 * calls in `gst_target_quick_look`"), each step emits a `prompt_span`
 * event sharing one `correlation_id`. Phase 3 Grafana panels can stitch
 * those into a per-prompt latency timeline without OpenTelemetry weight.
 *
 * **Current wiring status** (Phase 1): the emitter is in place and
 * unit-tested, but no caller is wired yet. Correlation requires a
 * mechanism for the client (Claude / Cursor / etc.) to thread the
 * `correlation_id` from `prompts/get` through each downstream
 * `tools/call` — typically via `_meta` on the tool-call request. That
 * client-side wiring is BL-033 / pilot-feedback work. Until then, the
 * `prompt_invocation` event from `withPromptMetrics` carries the
 * per-prompt count + duration; `prompt_span` is unused in production.
 *
 * Why land it now anyway: defining the emit interface + column-mapping
 * up front means Step 4 doesn't have to change. When client-side
 * correlation arrives, the wiring is a single import.
 */
import { guardEvent } from './guard';
import type { MetricsContext } from './with-metrics';

export interface PromptSpanArgs {
  /** Prompt name (e.g. `'gst_target_quick_look'`). */
  readonly promptName: string;
  /** Downstream tool name for this step. */
  readonly toolName: string;
  /** Step index 0..N inside the fan-out chain. */
  readonly seq: number;
  /** Correlation ID shared by every step of the same prompt firing. */
  readonly correlationId: string;
  /** Wall-clock duration of the downstream tool call in ms. */
  readonly durationMs: number;
  /** `'success'` or `'error'`. */
  readonly outcome: 'success' | 'error';
}

/**
 * Emit one `prompt_span` event. Best-effort: guard rejects malformed
 * events with a `safeLog` line; sink never throws.
 */
export function emitPromptSpan(ctx: MetricsContext, args: PromptSpanArgs): void {
  const event = guardEvent({
    event_type: 'prompt_span',
    name: args.promptName,
    keyOwner: ctx.keyOwner,
    outcome: args.outcome,
    correlation_id: args.correlationId,
    duration_ms: args.durationMs,
    seq: args.seq,
    // `tool_name` (the downstream tool) doesn't have a dedicated blob
    // slot in the BL-032.75 column map — `name` carries the prompt
    // name; the tool can be re-derived in Grafana by joining
    // `prompt_span` events on `correlation_id` with `tool_invocation`
    // events occurring in the same time window. If that join proves
    // too noisy in practice, a future schema extension can add a
    // dedicated `tool_name` blob.
  });
  if (event !== null) {
    ctx.sink.write(event);
  }
}
