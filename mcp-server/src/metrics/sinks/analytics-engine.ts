/**
 * BL-032.75 Phase 1 — `AnalyticsEngineSink` (production).
 *
 * Writes `MetricEvent`s to a bound Cloudflare Analytics Engine dataset.
 * Non-blocking by AE design — `writeDataPoint` returns void and Cloudflare
 * handles batching server-side. No `await`, no `ctx.waitUntil`.
 *
 * AE substrate caps (enforced upstream by `guard.ts`):
 *   - ≤20 blobs + ≤20 doubles + ≤1 index per call
 *   - ≤16 KB blob payload per data point
 *   - ≤96 byte index
 *   - ≤250 data points per Worker invocation
 *
 * **Failure mode** (best-effort, never throws): if the AE binding rejects
 * the write (substrate error, invocation cap reached), we swallow the
 * exception and increment an Upstash failure counter via Phase 3's
 * sentry-envelope-post-failure-rate alert path. This sink does NOT depend
 * on Upstash directly — failure counting lives elsewhere to keep this
 * module dependency-free for testing.
 */
import type { AnalyticsEngineDataset } from '@cloudflare/workers-types';
import { safeLog } from '../../auth/safe-logger';
import type { MetricEvent } from '../_schema';
import { toDataPoint } from '../_schema';
import type { MetricSink } from './_interface';

export class AnalyticsEngineSink implements MetricSink {
  /**
   * Per-instance flag — `true` once a `writeDataPoint` throw has been logged.
   * Suppresses duplicate `safeLog` lines within a single Worker invocation
   * (the Worker builds the sink fresh per request, so a new isolate cycle
   * resets this flag — matches the "once per invocation" policy from the
   * BL-032.75 plan).
   */
  private firstFailureLogged = false;

  constructor(private readonly dataset: AnalyticsEngineDataset) {}

  write(event: MetricEvent): void {
    // `toDataPoint` is pure; substrate-cap enforcement is `guard.ts`'s job
    // (callers should pre-validate). We trust the input here to keep the
    // hot path branch-free.
    const dp = toDataPoint(event);
    try {
      this.dataset.writeDataPoint(dp);
    } catch (err) {
      // Best-effort write — never propagate the throw. But total silence
      // would hide binding misconfiguration (e.g. `env.METRICS` is the
      // wrong shape) across an entire deploy. Log on FIRST failure per
      // sink instance so the Phase 3 sentry-envelope-post-failure-rate
      // alert can detect "we lost AE visibility" without flooding logs
      // when a transient substrate hiccup hits N events in a row.
      if (!this.firstFailureLogged) {
        this.firstFailureLogged = true;
        safeLog({
          event: 'metrics.sink.write_failed',
          reason: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
          success: false,
          errorCode: 'metrics-ae-write-failed',
        });
      }
    }
  }
}
