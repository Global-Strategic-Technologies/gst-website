/**
 * BL-033 Slice 3a — audit-log module barrel.
 *
 * Public surface for the audit path: the entry types + hash-chain primitives,
 * the producer-side sink seam, the PII redaction helpers, and the queue
 * consumer. Import from here rather than reaching into individual files.
 */
export {
  AUDIT_SCHEMA_VERSION,
  GENESIS_PREV_HASH,
  canonicalize,
  computeEntryHash,
  type AuditEntry,
  type AuditOutcome,
  type ChainedAuditEntry,
} from './entry';
export { QueueAuditSink, NoopAuditSink, type AuditSink, type AuditContext } from './audit-sink';
export { truncateIp, newRequestId, newEntryId } from './redaction';
export { consumeAuditBatch } from './consumer';
