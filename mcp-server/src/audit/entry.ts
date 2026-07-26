/**
 * BL-033 Slice 3a — audit-log entry types + hash-chain primitives.
 *
 * The audit log is a SEPARATE path from the ops metrics (`src/metrics/`): it
 * carries full tool input parameters and must never reach the Analytics
 * Engine / Sentry / Cloudflare ops logs (BACKLOG.md AC:264). Records are
 * enqueued to a Cloudflare Queue by the fetch handler and durably chained +
 * projected to R2 by the queue consumer (`src/audit/consumer.ts`).
 *
 * Two distinct shapes, each snapshot-pinned (`tests/unit/audit/schema.test.ts`):
 *   - `AuditEntry`         — the ENQUEUE shape (what the producer sends).
 *   - `ChainedAuditEntry`  — the PERSISTED shape (consumer adds `seq`,
 *                            `prevHash`, `entryHash`).
 *
 * Hash chain (ADR-0009): `entryHash = SHA-256(prevHash + canonicalize(entry))`.
 * `canonicalize` is the load-bearing function for both write-time chaining and
 * the deferred quarterly integrity re-walk — it MUST be deterministic and
 * stable across key insertion order.
 */
import { sha256Hex } from '../lib/sha256';

/** Bump when the persisted record shape changes (forces a snapshot refresh). */
export const AUDIT_SCHEMA_VERSION = 1;

/** Outcome of the audited tool call. Mirrors the metrics `success`/`error`. */
export type AuditOutcome = 'success' | 'error';

/**
 * The enqueue shape — everything the producer (`QueueAuditSink`) knows at the
 * `withMetricsCore` chokepoint. Chain fields are absent here; the consumer
 * assigns them.
 */
export interface AuditEntry {
  /** `AUDIT_SCHEMA_VERSION` at write time. */
  schemaVersion: number;
  /** Per-invocation UUID — the idempotency key across queue redelivery. */
  entryId: string;
  /** Per-HTTP-request UUID (shared across a JSON-RPC batch); correlates with the `mcp.request` safeLog line. */
  requestId: string;
  /** ISO-8601 production timestamp (recorded as data; NOT the chain order). */
  tsIso: string;
  /** PII-free client attribution (`MCP_KEY_*` suffix / `OAUTH:*` / `M2M:*`). */
  keyOwner?: string;
  /** GDPR-truncated caller IP (IPv4 last octet zeroed; IPv6 /48). */
  ipPrefix?: string;
  /** Tool name (audit is gated to tool_invocation this slice). */
  toolName: string;
  /** Full validated tool input (`args[0]`). Never emitted to the ops sink. */
  inputParams: unknown;
  /** Output payload size in bytes (NOT the payload itself, by default). */
  outputBytes: number;
  /** Wall-clock tool duration. */
  durationMs: number;
  outcome: AuditOutcome;
  /** Present on `outcome === 'error'`. */
  errorCode?: string;
}

/**
 * The persisted shape — an `AuditEntry` after the consumer assigns its place
 * in the chain. Written as one immutable R2 object at
 * `audit/<env>/<yyyy>/<mm>/<dd>/<paddedSeq>.json`.
 */
export interface ChainedAuditEntry extends AuditEntry {
  /** Monotonic consumer-assigned sequence — the canonical chain order. */
  seq: number;
  /** `entryHash` of the entry at `seq - 1` (or the genesis constant at seq 0). */
  prevHash: string;
  /** `SHA-256(prevHash + canonicalize(this-entry-without-entryHash))`. */
  entryHash: string;
}

/** Genesis `prevHash` for the very first entry (seq 0). */
export const GENESIS_PREV_HASH = '0'.repeat(64);

/**
 * Deterministic serialization: object keys recursively sorted, arrays kept in
 * order, `entryHash` excluded (it is the output of the hash, not an input).
 * Two entries with identical content serialize identically regardless of how
 * their keys were inserted — the property the chain and the integrity re-walk
 * both depend on.
 */
export function canonicalize(value: unknown): string {
  return stableStringify(value, 'entryHash');
}

function stableStringify(value: unknown, ...omitTopLevelKeys: string[]): string {
  const seen = new WeakSet<object>();
  const walk = (v: unknown, omit: readonly string[]): string => {
    if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
    if (seen.has(v as object)) throw new Error('audit canonicalize: circular reference');
    seen.add(v as object);
    let out: string;
    if (Array.isArray(v)) {
      out = `[${v.map((el) => walk(el, [])).join(',')}]`;
    } else {
      const keys = Object.keys(v as Record<string, unknown>)
        .filter((k) => !omit.includes(k))
        .sort();
      out = `{${keys
        .map((k) => `${JSON.stringify(k)}:${walk((v as Record<string, unknown>)[k], [])}`)
        .join(',')}}`;
    }
    seen.delete(v as object);
    return out;
  };
  return walk(value, omitTopLevelKeys);
}

/**
 * `entryHash = SHA-256(prevHash + canonicalize(entry))`. `entry` may be the
 * pre-chain `AuditEntry` plus its assigned `seq`; `entryHash` is excluded by
 * `canonicalize` so a persisted `ChainedAuditEntry` re-hashes to the same
 * value (used by the deferred integrity re-walk).
 */
export function computeEntryHash(
  prevHash: string,
  entry: AuditEntry & { seq: number }
): Promise<string> {
  return sha256Hex(prevHash + canonicalize(entry));
}
