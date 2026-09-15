/**
 * BL-045 PR B, wired by BL-157 — IRL-ingestion run-verdict emitters.
 *
 * Two events, both emitted from `compose_dossier_envelope` (the final step of
 * `gst_irl_ingestion` in `mode: full`) via {@link emitIrlRunVerdicts}. They
 * were declared-but-dead for months on the belief that "the server never sees
 * the verdict" and would need client-side correlation. That was wrong: the
 * envelope tool's input already carries `fillRatio` and `gatesElided[]`.
 *
 * - `wrong_irl_detected` — the SERVER-derived fill-ratio status
 *   (`deriveFillRatio`), never the model's claimed status.
 * - `gate_elided` — one per elided tool; `name` is pinned to the orchestrated
 *   tools in `NAME_VALUES`, so an invented name is dropped by the guard.
 *
 * Policy and its limits (once per run, upper bound, halted runs uncounted):
 * `src/docs/adr/0034-irl-verdict-events-emit-from-compose.md`.
 */
import { guardEvent } from './guard';
import type { MetricsContext } from './with-metrics';

const PROMPT_NAME = 'gst_irl_ingestion';

export type IrlFillVerdict = 'halt' | 'partial' | 'ok';

/** Emit one `wrong_irl_detected` event carrying `verdict` as its outcome. */
export function emitWrongIrlDetected(ctx: MetricsContext, verdict: IrlFillVerdict): void {
  const event = guardEvent({
    event_type: 'wrong_irl_detected',
    name: PROMPT_NAME,
    keyOwner: ctx.keyOwner,
    client_ref: ctx.clientRef,
    outcome: verdict,
  });
  if (event !== null) {
    ctx.sink.write(event);
  }
}

/**
 * Emit one `gate_elided` event for a tool whose inclusion gate failed. `name`
 * carries the tool; `outcome` is always `elided`, so dashboard SQL can
 * `GROUP BY blob2` directly.
 */
export function emitGateElided(ctx: MetricsContext, elidedTool: string): void {
  const event = guardEvent({
    event_type: 'gate_elided',
    name: elidedTool,
    keyOwner: ctx.keyOwner,
    client_ref: ctx.clientRef,
    outcome: 'elided',
  });
  if (event !== null) {
    ctx.sink.write(event);
  }
}

export interface IrlRunVerdicts {
  /**
   * The server-derived status, or `null` when the payload's counts were
   * incoherent — then the only status available is the model's own claim,
   * which this event must not record.
   */
  readonly verdict: IrlFillVerdict | null;
  readonly elidedTools: readonly string[];
  /**
   * Successful `compose_dossier_envelope` calls in this run BEFORE the current
   * one. Anything above 0 means this is a re-call, which emits nothing.
   */
  readonly priorSucceeded: number;
}

/** Emit a run's verdict events, once per run. See ADR-0034. */
export function emitIrlRunVerdicts(ctx: MetricsContext, run: IrlRunVerdicts): void {
  if (run.priorSucceeded > 0) return;
  if (run.verdict !== null) emitWrongIrlDetected(ctx, run.verdict);
  for (const tool of run.elidedTools) emitGateElided(ctx, tool);
}
