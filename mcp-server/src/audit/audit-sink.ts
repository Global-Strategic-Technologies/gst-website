/**
 * BL-033 Slice 3a — audit emission seam (producer side).
 *
 * A SEPARATE sink from `MetricSink` (`src/metrics/sinks/_interface.ts`): that
 * one is sync + AE-projected and must never carry input params. This one
 * enqueues a full `AuditEntry` to a Cloudflare Queue off the request latency
 * path via `ctx.waitUntil`. Best-effort by design — matches the house
 * "emission never breaks a tool call" contract; durability is the Queue's job
 * (at-least-once + retry + DLQ). See ADR-0009 for the honest loss window and
 * the `writeAndAwait` fail-closed seam left for guaranteed-capture clients.
 */
import type { Queue } from '@cloudflare/workers-types';
import { safeLog } from '../auth/safe-logger';
import type { AuditEntry } from './entry';

/**
 * Records one audit entry. Contractually **non-throwing** (like `MetricSink`)
 * — a producer-side failure is a visibility loss, never a request failure.
 *
 * `writeAndAwait` is reserved for the deferred fail-closed posture (a
 * per-client `guaranteedCapture` flag would make `withMetricsCore` await it
 * before returning the tool result). Not implemented this slice.
 */
export interface AuditSink {
  write(entry: AuditEntry): void;
  writeAndAwait?(entry: AuditEntry): Promise<void>;
}

/** Fire-and-forget queue producer. */
export class QueueAuditSink implements AuditSink {
  constructor(
    private readonly queue: Queue<AuditEntry>,
    private readonly waitUntil: (p: Promise<unknown>) => void
  ) {}

  write(entry: AuditEntry): void {
    // The one retry lives INSIDE the waitUntil promise — `Queue.send` rejects
    // asynchronously, so a synchronous retry in this method would be a no-op.
    // First failure breadcrumbs via safeLog (structured, non-PII: no params).
    this.waitUntil(
      this.queue
        .send(entry)
        .catch(() => this.queue.send(entry))
        .catch((err: unknown) => {
          safeLog({
            event: 'audit.enqueue_failed',
            keyOwner: entry.keyOwner,
            tool: entry.toolName,
            success: false,
            errorCode: 'audit-enqueue',
            reason: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
          });
        })
    );
  }
}

/** No-op sink — used when the queue binding is absent (stdio / tests). */
export class NoopAuditSink implements AuditSink {
  write(_entry: AuditEntry): void {
    // Intentionally empty.
  }
}

/**
 * Per-request audit carrier, co-located on `MetricsContext`. Constructed in
 * `handle-authenticated.ts` (mints `requestId`, truncates the IP) and threaded
 * through `createServer` into the chokepoint.
 */
export interface AuditContext {
  readonly sink: AuditSink;
  readonly requestId: string;
  readonly ipPrefix?: string;
  readonly keyOwner?: string;
}
