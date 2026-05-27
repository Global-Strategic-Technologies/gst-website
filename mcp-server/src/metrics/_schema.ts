/**
 * BL-032.75 Phase 1 — Analytics Engine column-map schema.
 *
 * Single source of truth for every downstream consumer:
 *   - emitters in this module (`with-metrics.ts`, `prompt-span.ts`)
 *   - runtime cardinality guard (`guard.ts`)
 *   - vitest fixtures + snapshot test (`schema.test.ts`)
 *   - Phase 3 Grafana dashboard SQL (queries `blob1..blob6` / `double1..double2`)
 *   - Phase 3 `/status` page server-side query
 *
 * Cloudflare Analytics Engine is **positional-columnar**, not Prometheus-style
 * named-series. Substrate provides `blob1..blob20` / `double1..double20` /
 * `index1`; we use 6 + 2 + 1, reserving the remaining 14 + 18 slots for future
 * event-type additions without forcing a schema migration.
 *
 * Substrate caps (verified against Cloudflare docs 2026-05-27):
 *   - 20 blobs + 20 doubles + 1 index per `writeDataPoint`
 *   - Blob payload ≤16 KB per data point (sum across all blobs)
 *   - Index ≤96 bytes
 *   - ≤250 data points per Worker invocation
 *
 * Changing the column map is a breaking change to every downstream consumer.
 * `schema.test.ts` snapshot-tests the map so any change forces deliberate
 * review.
 */

/**
 * All valid `event_type` discriminator values. Lives in `blob1`.
 *
 * Adding an event type requires: (1) extend this const; (2) extend the
 * `MetricEvent` discriminated union below if it carries event-specific
 * fields; (3) update the snapshot test.
 */
export const EVENT_TYPES = [
  'tool_invocation',
  'resource_read',
  'prompt_invocation',
  'prompt_span',
  'rate_limit_decision',
  'inoreader_call',
  'health_check',
  'cron_outcome',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/**
 * The shape consumers build and hand to `MetricSink.write(...)`. Maps to AE
 * columns via `toDataPoint(event)` below; lets handlers stay readable instead
 * of dealing with positional `blob3` references directly.
 *
 * All fields are optional except `event_type` — the emitter or `with-metrics`
 * HOF fills in what's known. Unfilled fields become `undefined` blobs / 0
 * doubles in the AE write.
 */
export interface MetricEvent {
  /** Discriminator. */
  event_type: EventType;
  /**
   * Tool name, resource URI prefix, prompt name, cron slug, or
   * Inoreader-egress category — depending on `event_type`.
   */
  name?: string;
  /**
   * Stripped suffix of `MCP_KEY_*` (e.g. `"RP"`). Reuses
   * `safeLog.LogEvent.keyOwner` attribution surface; PII-free, bounded by
   * issued-key count. Doubles as the AE `index1` sampling key (mirrored).
   */
  keyOwner?: string;
  /**
   * `success` / `error` / category-specific (`hit` / `miss` / `allow` /
   * `throttle` / `deny`). See `OUTCOME_VALUES` below for the runtime guard.
   */
  outcome?: string;
  /** Used only by `prompt_span`; null elsewhere. */
  correlation_id?: string;
  /** HTTP-ish status as string (avoids type-coercion ambiguity in queries). */
  status_code?: string;
  /** Numeric wall-clock duration in milliseconds. Omit/0 for counter-only events. */
  duration_ms?: number;
  /** Step index 0..N inside a `prompt_span` chain; 0 elsewhere. */
  seq?: number;
}

/**
 * Per-blob slot specification. Used by `toDataPoint` to project a
 * `MetricEvent` into the positional AE shape AND by `guard.ts` to enforce
 * substrate limits at runtime.
 */
export interface BlobSpec {
  /** AE column position (1-indexed). */
  readonly slot: number;
  /** `MetricEvent` field projected into this blob. */
  readonly field: keyof MetricEvent;
  /** Max chars after which the runtime guard truncates. */
  readonly maxChars: number;
}

/**
 * Per-double slot specification.
 */
export interface DoubleSpec {
  readonly slot: number;
  readonly field: keyof MetricEvent;
}

/**
 * The pinned column map. Snapshot-tested in `schema.test.ts`.
 */
export const BLOB_SLOTS: readonly BlobSpec[] = [
  { slot: 1, field: 'event_type', maxChars: 32 },
  { slot: 2, field: 'name', maxChars: 128 },
  { slot: 3, field: 'keyOwner', maxChars: 32 },
  { slot: 4, field: 'outcome', maxChars: 32 },
  { slot: 5, field: 'correlation_id', maxChars: 64 },
  { slot: 6, field: 'status_code', maxChars: 8 },
] as const;

export const DOUBLE_SLOTS: readonly DoubleSpec[] = [
  { slot: 1, field: 'duration_ms' },
  { slot: 2, field: 'seq' },
] as const;

/**
 * Sum of `maxChars` across all blob slots — sanity bound for the substrate's
 * 16 KB blob payload cap (16 384 bytes). Current total: ~296 chars worst-case,
 * orders of magnitude under the cap.
 */
export const MAX_BLOB_PAYLOAD_CHARS = BLOB_SLOTS.reduce((sum, b) => sum + b.maxChars, 0);

/**
 * AE substrate caps (verified against Cloudflare docs 2026-05-27). Exposed so
 * `guard.ts` can enforce them at runtime without re-reading docs.
 */
export const AE_LIMITS = {
  MAX_BLOBS_PER_CALL: 20,
  MAX_DOUBLES_PER_CALL: 20,
  MAX_INDEXES_PER_CALL: 1,
  MAX_BLOB_PAYLOAD_BYTES: 16_384,
  MAX_INDEX_BYTES: 96,
  MAX_DATA_POINTS_PER_INVOCATION: 250,
} as const;

/**
 * Valid `outcome` values, narrowed per event type. The runtime guard uses
 * this to reject typos (e.g. emitting `outcome: 'sucess'` for a
 * `tool_invocation`). Open-ended events (e.g. `inoreader_call.status_code`)
 * carry the status in `status_code` instead — `outcome` stays disciplined.
 */
export const OUTCOME_VALUES: Readonly<Record<EventType, readonly string[]>> = {
  tool_invocation: ['success', 'error'],
  resource_read: ['success', 'hit', 'miss', 'error'],
  prompt_invocation: ['success', 'error'],
  prompt_span: ['success', 'error'],
  rate_limit_decision: ['allow', 'throttle', 'deny'],
  inoreader_call: ['success', 'error'],
  health_check: ['ok', 'degraded', 'error'],
  cron_outcome: ['success', 'error', 'skipped-circuit', 'skipped-budget'],
};

/**
 * AE-positional data point. Matches `AnalyticsEngineDataPoint` from
 * `@cloudflare/workers-types` — `blobs` accept `string | ArrayBuffer | null`
 * (we never emit ArrayBuffer; we use `null` for absent fields).
 */
export interface AnalyticsDataPoint {
  blobs: (string | null)[];
  doubles: number[];
  indexes: string[];
}

/**
 * Project a `MetricEvent` into the AE-positional shape.
 *
 * Pure function — no runtime substrate access, no side effects. The runtime
 * guard (`guard.ts`) wraps this to enforce caps before emission; tests use
 * this directly to assert on data-point shape.
 *
 * `keyOwner` lands in both `blobs[2]` (= `blob3`) and `indexes[0]` (= `index1`)
 * so AE samples by tenant when scaling without consumers having to remember
 * the mirroring.
 *
 * Absent string fields become `null` (AE's accepted "missing" sentinel for
 * blob columns). Absent numeric fields become `0` (AE doubles are required).
 */
export function toDataPoint(event: MetricEvent): AnalyticsDataPoint {
  const blobs = BLOB_SLOTS.map((spec) => {
    const value = event[spec.field];
    return value === undefined || value === null ? null : String(value);
  });
  const doubles = DOUBLE_SLOTS.map((spec) => {
    const value = event[spec.field];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  });
  // index1 = keyOwner (mirror of blob3). AE requires non-empty index strings;
  // emit '_' as a placeholder when keyOwner isn't applicable so the column
  // stays type-stable for sampling.
  const indexes = [event.keyOwner ?? '_'];
  return { blobs, doubles, indexes };
}
