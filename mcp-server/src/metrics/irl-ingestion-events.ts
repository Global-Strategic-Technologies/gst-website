/**
 * BL-045 PR B — IRL-ingestion-specific metric event emitters.
 *
 * Three events introduced by `gst_irl_ingestion`:
 *
 * - `force_tools_used` — **server-side observable now**. Fired from the
 *   prompt build seam (`_registry.ts` wrap or direct call from
 *   `irlIngestionPrompt.build`) when `args.forceTools` is non-empty. The
 *   counter is the most actionable signal of partner-override frequency
 *   — high values flag inclusion gates that are too strict in practice.
 *
 * - `wrong_irl_detected` — **model-side**. The model evaluates the
 *   wrong-IRL pre-flight at runtime (compute fill ratio, branch into
 *   halt / partial / ok). The server never sees the verdict. Like
 *   `prompt_span`, wiring this to production requires the client to
 *   thread a verdict back via a side-channel (typically `_meta` on the
 *   next `tools/call` or `notifications/progress`). Schema + emitter
 *   defined now so step-4 doesn't have to change later.
 *
 * - `gate_elided` — **model-side**. Same shape: the model evaluates
 *   each inclusion gate and the verdict surfaces in the dossier (meta
 *   JSON fence `gatesElided[]`). Production wiring requires client
 *   correlation; schema + emitter defined now.
 *
 * **Why land the unwired events now**: Cloudflare AE column maps are
 * effectively immutable once Grafana SQL references them — adding event
 * types after dashboards exist forces a coordinated schema migration.
 * The `prompt_span` precedent established the pattern (schema +
 * emitter + tests defined ahead of client-side wiring). See
 * `prompt-span.ts` module JSDoc.
 */
import { guardEvent } from './guard';
import type { MetricsContext } from './with-metrics';

const PROMPT_NAME = 'gst_irl_ingestion';

/**
 * Emit one `force_tools_used` event when a `gst_irl_ingestion` invocation
 * supplies a non-empty `forceTools` array. Idempotent counter — one event
 * per invocation regardless of how many tools the array contained (count
 * is carried elsewhere via the meta JSON fence the model emits).
 *
 * Called from the prompt build seam at server side, before the prompt
 * body is returned to the model. No-op when `forceTools` is empty.
 */
export function emitForceToolsUsed(
  ctx: MetricsContext,
  forceTools: readonly string[] | undefined
): void {
  if (!forceTools || forceTools.length === 0) return;
  const event = guardEvent({
    event_type: 'force_tools_used',
    name: PROMPT_NAME,
    keyOwner: ctx.keyOwner,
    outcome: 'applied',
  });
  if (event !== null) {
    ctx.sink.write(event);
  }
}

/**
 * Emit one `wrong_irl_detected` event when the model's pre-flight branch
 * is recovered via client-side correlation. `verdict` matches the
 * pre-flight directive's three branches: `halt` (<15% fillRatio),
 * `partial` (15-40%), `ok` (≥40%). The `name` field carries the prompt
 * name for grouping; the `keyOwner` carries the issued-key attribution.
 *
 * **Not wired in production yet** — see module JSDoc.
 */
export function emitWrongIrlDetected(
  ctx: MetricsContext,
  verdict: 'halt' | 'partial' | 'ok'
): void {
  const event = guardEvent({
    event_type: 'wrong_irl_detected',
    name: PROMPT_NAME,
    keyOwner: ctx.keyOwner,
    outcome: verdict,
  });
  if (event !== null) {
    ctx.sink.write(event);
  }
}

/**
 * Emit one `gate_elided` event per tool whose inclusion gate failed and
 * was NOT in `forceTools`. The `name` field carries the elided tool name
 * (open enum — same shape as `tool_invocation.name`); `outcome` is
 * always `elided` (the discriminator narrowness lets dashboard SQL
 * `COUNT(*) GROUP BY name` directly).
 *
 * **Not wired in production yet** — see module JSDoc.
 */
export function emitGateElided(ctx: MetricsContext, elidedTool: string): void {
  const event = guardEvent({
    event_type: 'gate_elided',
    name: elidedTool,
    keyOwner: ctx.keyOwner,
    outcome: 'elided',
  });
  if (event !== null) {
    ctx.sink.write(event);
  }
}
