/**
 * BL-033 Slice 3a — audit-log queue consumer (durable store + hash chain).
 *
 * Registered as the Worker's `queue` handler (`worker.ts` default export).
 * Turns best-effort-enqueued `AuditEntry` records into a tamper-evident,
 * hash-chained, immutable R2 log. Full design + crash-safety proof: ADR-0009.
 *
 * **Crash-safety in one paragraph.** Sequencing is authoritative via an
 * `entryId → {seq, prevHash, entryHash}` ledger in Upstash, committed
 * atomically with the chain tip in a single `MULTI`. R2 is a pure idempotent
 * projection keyed by the stable seq (`If-None-Match: *` → R2 returns `null`
 * when the object already exists, treated as "already durable"). An entry's
 * seq is fixed the instant its `seqOf` is committed and never shifts on
 * redelivery — so a recomposed redelivered batch can neither fork nor
 * duplicate the chain. See the enumerated interleavings in ADR-0009.
 *
 * **Failure posture — the load-bearing divergence from the `scheduled`
 * handler.** Unlike the retry-less cron (which deliberately swallows and
 * drops, `worker.ts:265-273`), a dropped audit record is unacceptable. Any
 * failure — including a null/unreachable Upstash — re-queues the whole batch
 * (`batch.retryAll()`) → platform retry → DLQ. We ack ONLY on a fully durable
 * commit. This is SDK-free (owns its own Sentry-envelope lifecycle; the fetch
 * handler's `withSentry` does not wrap `queue`).
 */
import { createMcpClient } from '../lib/upstash-clients';
import { acquire, release } from '../lib/single-flight-lock';
import { safeLog } from '../auth/safe-logger';
import { postSentryEvent } from '../observability/sentry-envelope';
import { AnalyticsEngineSink } from '../metrics/_index';
import { emit } from '../metrics/with-metrics';
import {
  computeEntryHash,
  GENESIS_PREV_HASH,
  type AuditEntry,
  type ChainedAuditEntry,
} from './entry';
import type { Env } from '../worker';

/** Chain tip — highest committed seq + its hash. */
interface ChainTip {
  lastSeq: number;
  lastHash: string;
}

/** Per-entry ledger value — enough to re-project an entry to R2 idempotently. */
interface SeqMeta {
  seq: number;
  prevHash: string;
  entryHash: string;
}

const SEQ_PAD = 16;
const LOCK_TTL_SECONDS = 30;

function tipKey(envName: string): string {
  return `mcp:audit:chain-tip:${envName}`;
}
function seqOfKey(envName: string, entryId: string): string {
  return `mcp:audit:seqof:${envName}:${entryId}`;
}
function lockKey(envName: string): string {
  return `mcp:lock:audit-consumer:${envName}`;
}

/** `audit/<env>/<yyyy>/<mm>/<dd>/<paddedSeq>.json` — lexical == numeric order. */
function r2Key(envName: string, tsIso: string, seq: number): string {
  const d = new Date(tsIso);
  const yyyy = String(d.getUTCFullYear()).padStart(4, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const padded = String(seq).padStart(SEQ_PAD, '0');
  return `audit/${envName}/${yyyy}/${mm}/${dd}/${padded}.json`;
}

export async function consumeAuditBatch(
  batch: MessageBatch<AuditEntry>,
  env: Env,
  _ctx: ExecutionContext
): Promise<void> {
  const startedAt = Date.now();
  const envName = env.ENV_NAME ?? 'dev';

  // Belt-and-suspenders under max_concurrency=1. NOTE: acquire() fail-opens
  // (returns true) when Upstash is unreachable — the real null/down guard is
  // the direct createMcpClient handle below, which throws → retryAll.
  let acquired = false;
  try {
    acquired = await acquire(env, lockKey(envName), LOCK_TTL_SECONDS);
    if (!acquired) {
      // A peer holds the lock (should never happen at max_concurrency=1).
      // Never ack — re-queue so the record is not lost.
      batch.retryAll();
      return;
    }

    const redis = createMcpClient(env);
    if (!redis) {
      // Sequencer store unavailable — MUST retry, never drop (diverges from
      // the fail-open-on-null convention every other caller uses).
      throw new Error('audit consumer: Upstash MCP client unbound (cannot sequence)');
    }
    if (!env.AUDIT_R2) {
      throw new Error('audit consumer: AUDIT_R2 bucket unbound (cannot persist)');
    }

    // 1. Read tip (genesis when absent).
    const tip = (await redis.get<ChainTip>(tipKey(envName))) ?? {
      lastSeq: -1,
      lastHash: GENESIS_PREV_HASH,
    };

    // 2. Look up existing seqOf for every message (idempotency / redelivery).
    const messages = batch.messages;
    const seqOfKeys = messages.map((m) => seqOfKey(envName, m.body.entryId));
    const existingMeta: (SeqMeta | null)[] =
      seqOfKeys.length > 0 ? await redis.mget<(SeqMeta | null)[]>(...seqOfKeys) : [];

    // 3. Partition + assign seqs to FRESH entries deterministically (sort by
    //    entryId so assignment is independent of arrival/batch composition).
    const chained: ChainedAuditEntry[] = new Array(messages.length);
    const freshIdx: number[] = [];
    messages.forEach((m, i) => {
      const meta = existingMeta[i];
      if (meta) {
        chained[i] = {
          ...m.body,
          seq: meta.seq,
          prevHash: meta.prevHash,
          entryHash: meta.entryHash,
        };
      } else {
        freshIdx.push(i);
      }
    });
    freshIdx.sort((a, b) => {
      const x = messages[a].body.entryId;
      const y = messages[b].body.entryId;
      return x < y ? -1 : x > y ? 1 : 0;
    });

    let seq = tip.lastSeq;
    let prevHash = tip.lastHash;
    const freshMeta: Array<{ entryId: string; meta: SeqMeta }> = [];
    // Dedupe within the batch: the producer's in-`waitUntil` retry can
    // double-enqueue the SAME entryId (a `send` false-negative), and both
    // copies can land in one batch as FRESH (neither has a committed `seqOf`
    // yet). Assign one seq per unique entryId — later copies reuse the first's
    // chained entry, so R2 projection re-PUTs the identical object (idempotent)
    // and the ledger records it once. Preserves the ADR-0009 "no duplicate"
    // invariant against intra-batch dups, not just cross-delivery redelivery.
    const freshByEntryId = new Map<string, ChainedAuditEntry>();
    for (const i of freshIdx) {
      const body = messages[i].body;
      const already = freshByEntryId.get(body.entryId);
      if (already) {
        chained[i] = already;
        continue;
      }
      seq += 1;
      const entryHash = await computeEntryHash(prevHash, { ...body, seq });
      const entry: ChainedAuditEntry = { ...body, seq, prevHash, entryHash };
      chained[i] = entry;
      freshByEntryId.set(body.entryId, entry);
      freshMeta.push({ entryId: body.entryId, meta: { seq, prevHash, entryHash } });
      prevHash = entryHash;
    }

    // 4. Authoritative commit: seqOf ledger + tip advance in ONE atomic MULTI.
    if (freshMeta.length > 0) {
      const tx = redis.multi();
      for (const { entryId, meta } of freshMeta) {
        tx.set(seqOfKey(envName, entryId), meta);
      }
      tx.set(tipKey(envName), { lastSeq: seq, lastHash: prevHash } satisfies ChainTip);
      await tx.exec();
    }

    // 5. Idempotent R2 projection for EVERY entry (fresh + already-sequenced).
    //    onlyIf etagDoesNotMatch '*' → put() returns null when the object
    //    already exists (a prior attempt wrote it) = already durable.
    for (const entry of chained) {
      // Persist the FULL chained record (incl. prevHash + entryHash) as one
      // JSON line. NOTE: use JSON.stringify, NOT canonicalize — canonicalize
      // deliberately omits `entryHash` (it is the hash INPUT), so persisting it
      // would drop the stored chain hash the integrity re-walk compares against.
      await env.AUDIT_R2.put(r2Key(envName, entry.tsIso, entry.seq), JSON.stringify(entry) + '\n', {
        onlyIf: { etagDoesNotMatch: '*' },
      });
    }

    // 6. Best-effort observability — NEVER let a metrics fault DLQ a durable
    //    batch (try/catch around emit).
    try {
      if (env.METRICS) {
        emit(new AnalyticsEngineSink(env.METRICS), {
          event_type: 'audit_batch',
          name: 'audit-consumer',
          outcome: 'success',
          duration_ms: Date.now() - startedAt,
          seq: chained.length,
        });
      }
    } catch {
      // Observability loss is not a request failure.
    }

    batch.ackAll();
  } catch (err) {
    // Do NOT swallow. Re-queue the whole batch (idempotent on retry) and
    // surface to Sentry. retryAll is safe: committed entries are re-projected
    // (null-return), uncommitted entries re-sequence cleanly.
    const message = err instanceof Error ? err.message : 'unknown';
    safeLog({
      event: 'audit.consume_failed',
      success: false,
      errorCode: 'audit-consume',
      reason: message.slice(0, 200),
      durationMs: Date.now() - startedAt,
    });
    await postSentryEvent(env, {
      level: 'error',
      message: `audit consumer batch failed: ${message}`,
      tags: { subsystem: 'audit', env: envName },
      extra: { batchSize: batch.messages.length },
    }).catch(() => {});
    batch.retryAll();
  } finally {
    if (acquired) {
      await release(env, lockKey(envName)).catch(() => {});
    }
  }
}
