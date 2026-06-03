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
  // BL-045 PR B — IRL-ingestion-specific events. `force_tools_used` is
  // server-side-observable at prompt build time; `wrong_irl_detected` and
  // `gate_elided` are model-side outcomes that require client-side
  // correlation (`prompt_span` precedent) to land in production.
  'force_tools_used',
  'wrong_irl_detected',
  'gate_elided',
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
  /**
   * Zone-1 quota classification for `inoreader_call` events only. `'1'` for
   * Zone-1 categories (cron-radar / live-radar / http-radar-snapshot /
   * 401-retry); `'0'` for the OAuth refresh path (not Zone-1). Carrying this
   * explicitly — rather than deriving it from `name` via dashboard SQL —
   * keeps the SQL self-documenting: `SUM(...) WHERE blob7='1'` reads cleanly
   * without consulting the schema doc. Absent for non-inoreader_call events.
   */
  zone1?: '1' | '0';
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
  { slot: 7, field: 'zone1', maxChars: 1 },
] as const;

export const DOUBLE_SLOTS: readonly DoubleSpec[] = [
  { slot: 1, field: 'duration_ms' },
  { slot: 2, field: 'seq' },
] as const;

/**
 * Sum of `maxChars` across all blob slots, measured in JS string code units
 * (≈ chars). Useful for budget-vs-cap math but NOT directly comparable to
 * the AE 16 KB BYTE cap — UTF-8 can encode a single JS char into up to 4
 * bytes (4-byte sequences for high-codepoint emoji/surrogate pairs). The
 * static sanity bound below uses the worst-case ×4 conversion; the runtime
 * `guard.ts::sumBlobPayloadBytes` measures actual UTF-8 byte length and
 * is the authoritative check.
 */
export const MAX_BLOB_PAYLOAD_CHARS_SUM = BLOB_SLOTS.reduce((sum, b) => sum + b.maxChars, 0);

/**
 * Conservative worst-case UTF-8 byte count for the full blob payload (chars
 * sum × 4 byte/char). Sized to be safely under AE's 16 KB cap even if every
 * blob field were filled with 4-byte UTF-8 sequences. Currently
 * `296 × 4 = 1184` bytes worst-case vs the 16 384-byte ceiling.
 */
export const MAX_BLOB_PAYLOAD_BYTES_WORST_CASE = MAX_BLOB_PAYLOAD_CHARS_SUM * 4;

/**
 * Sentinel placed in `index1` when `keyOwner` is absent (cron paths,
 * un-authenticated probes, stdio). AE requires non-empty index strings.
 *
 * Chosen to be impossible as a real `keyOwner` value: real owners are
 * stripped suffixes of `MCP_KEY_*` env vars (alphanumeric uppercase),
 * never bracketed in double underscores. Pinning the choice here lets
 * Grafana queries filter unauthenticated traffic via `WHERE index1 = '__none__'`.
 */
export const KEYOWNER_PLACEHOLDER = '__none__';

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
  // Narrow set for Phase 1. When the cache layer is wired to emit hit/miss
  // distinctly (Phase 4 or later), widen to include those values + update the
  // snapshot test. Avoiding speculative widening keeps the dashboard SQL
  // narrow and forces the cache instrumentation to be a deliberate addition.
  resource_read: ['success', 'error'],
  prompt_invocation: ['success', 'error'],
  prompt_span: ['success', 'error'],
  rate_limit_decision: ['allow', 'throttle', 'deny'],
  inoreader_call: ['success', 'error'],
  health_check: ['ok', 'degraded', 'error'],
  cron_outcome: [
    'success',
    'partial',
    'error',
    'skipped-circuit',
    'skipped-budget',
    'deduplicated',
  ],
  // BL-045 PR B counter events. The `outcome` field carries the discriminator
  // that downstream SQL aggregates over.
  //
  // `force_tools_used`: emitted at prompt-build time when args.forceTools is
  //   non-empty. `outcome` is always `applied` (counter-only; success implied).
  // `wrong_irl_detected`: emitted by client correlation when the model's
  //   pre-flight returned `halt` or `partial`. `outcome` carries the verdict.
  // `gate_elided`: emitted by client correlation when an inclusion gate's
  //   predicate failed and the tool was NOT in forceTools. `outcome` is always
  //   `elided` (the tool name is carried in `name`).
  force_tools_used: ['applied'],
  wrong_irl_detected: ['halt', 'partial', 'ok'],
  gate_elided: ['elided'],
};

/**
 * Optional per-event-type allowlist for the `name` field (blob2). When set,
 * the runtime guard rejects events whose `name` is not in the allowlist —
 * a cardinality safety net that complements `OUTCOME_VALUES` for event
 * types where `name` is also a bounded enum.
 *
 * Use cases:
 *   - `inoreader_call.name` must be one of the 5 egress categories
 *     (cron-radar / live-radar / http-radar-snapshot / oauth-refresh /
 *     401-retry). Adding a 6th category requires a deliberate schema bump.
 *   - `cron_outcome.name` is currently just `radar-refresh`; future cron
 *     triggers extend the list explicitly.
 *
 * Event types where `name` is intentionally open (`tool_invocation` —
 * tool names; `resource_read` — URI prefixes; `prompt_invocation` —
 * prompt names; `prompt_span` — same; `rate_limit_decision` — call site
 * identifiers) have no entry here; the guard skips them.
 */
export const NAME_VALUES: Partial<Record<EventType, readonly string[]>> = {
  inoreader_call: ['cron-radar', 'live-radar', 'http-radar-snapshot', 'oauth-refresh', '401-retry'],
  cron_outcome: ['radar-refresh'],
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
  // emit `KEYOWNER_PLACEHOLDER` when keyOwner isn't applicable so the column
  // stays type-stable for sampling and Grafana can filter unauthenticated
  // traffic explicitly.
  const indexes = [event.keyOwner ?? KEYOWNER_PLACEHOLDER];
  return { blobs, doubles, indexes };
}
