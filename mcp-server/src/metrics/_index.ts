/**
 * BL-032.75 Phase 1 — public barrel for the metrics module.
 *
 * Single import point for register* files + worker.ts + tests:
 *
 *   import { withToolMetrics, NOOP_METRICS_CONTEXT, type MetricsContext } from '../metrics/_index';
 */
export {
  AE_LIMITS,
  BLOB_SLOTS,
  DOUBLE_SLOTS,
  EVENT_TYPES,
  KEYOWNER_PLACEHOLDER,
  MAX_BLOB_PAYLOAD_BYTES_WORST_CASE,
  MAX_BLOB_PAYLOAD_CHARS_SUM,
  OUTCOME_VALUES,
  toDataPoint,
  type AnalyticsDataPoint,
  type BlobSpec,
  type DoubleSpec,
  type EventType,
  type MetricEvent,
} from './_schema';
export { guardEvent } from './guard';
export { emitPromptSpan } from './prompt-span';
export {
  emit,
  InMemoryToolCallCounters,
  withMetricsCore,
  withPromptMetrics,
  withResourceMetrics,
  withToolMetrics,
  type MetricsContext,
  type ToolCallCounterEntry,
  type ToolCallCounterEvent,
  type ToolCallCounters,
} from './with-metrics';
export { NoopSink, type MetricSink } from './sinks/_interface';
export {
  InMemoryIrlBodyCache,
  IrlBodyCacheSizeExceededError,
  IRL_BODY_CACHE_MAX_BYTES,
  IRL_BODY_CACHE_TTL_SECONDS,
  IN_MEMORY_LRU_CAPACITY,
  UpstashIrlBodyCache,
  UPSTASH_KEY_PREFIX,
  type IrlBodyCache,
} from '../cache/irl-body-cache';
export { InMemorySink } from './sinks/in-memory';
export { AnalyticsEngineSink } from './sinks/analytics-engine';

import { NoopSink } from './sinks/_interface';
import type { MetricsContext } from './with-metrics';

/**
 * Frozen singleton for `register*` default-parameter slots. Stateless
 * (NoopSink does nothing) so sharing one reference across N callers is
 * safe — and avoids constructing a new NoopSink for every register*
 * invocation in the no-metrics path (stdio entrypoint, unit tests).
 */
export const NOOP_METRICS_CONTEXT: MetricsContext = Object.freeze({
  sink: new NoopSink(),
});
