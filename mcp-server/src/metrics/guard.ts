/**
 * BL-032.75 Phase 1 — runtime cardinality guard.
 *
 * Sits between an emitter and a `MetricSink`. Validates a `MetricEvent`
 * against the pinned schema (`_schema.ts`) before allowing the write.
 * Bad events are silently dropped (with a `safeLog` line) rather than
 * thrown — observability code MUST NOT take down a request when a guard
 * rejects an event.
 *
 * Two-layer defense vs cardinality explosion:
 *   - **Static**: `schema.test.ts` snapshot pins the event-type enum +
 *     blob/double slots. A new dim added to `_schema.ts` requires a
 *     deliberate snapshot refresh.
 *   - **Runtime (this module)**: catches the case where a future caller
 *     conditionally builds an event with a value that violates the
 *     schema (typo'd outcome, oversize string, unknown event_type).
 *
 * Validations:
 *   1. `event_type` is in `EVENT_TYPES`.
 *   2. `outcome`, when present, is in `OUTCOME_VALUES[event_type]`.
 *   3. String fields ≤ `BLOB_SLOTS[i].maxChars` — truncate with a `…`
 *      marker (visible in queries) rather than reject the whole event.
 *   4. Total blob payload size ≤ AE 16 KB cap (defense in depth — should
 *      be unreachable given the per-field maxChars sum is ~296).
 *   5. `keyOwner` (which mirrors into `index1`) ≤ AE 96-byte index cap.
 *
 * Each rejection emits a `safeLog` line with the rejection reason so
 * operators can spot bad emit sites during the post-deploy soak.
 */
import { safeLog } from '../auth/safe-logger';
import { utf8ByteLength } from '../lib/utf8-bytes';
import {
  AE_LIMITS,
  BLOB_SLOTS,
  EVENT_TYPES,
  type EventType,
  type MetricEvent,
  NAME_VALUES,
  OUTCOME_VALUES,
} from './_schema';

/**
 * Truncation marker. Note: `'…'` is **3 bytes UTF-8** (U+2026 HORIZONTAL
 * ELLIPSIS). A string truncated to `maxChars` JS code units (= char count
 * for the BMP-only ASCII fields we use today) can therefore be up to
 * `maxChars × 4 + 3` UTF-8 bytes — well under AE's 16 KB blob payload cap
 * given the current `BLOB_SLOTS` maxChars sum (~296 chars).
 *
 * If a future field admits high-codepoint UTF-8 (emoji, supplementary plane)
 * the truncation may also land mid-surrogate-pair. ASCII-only by current
 * design — revisit with `Array.from(s).slice(...)` if that constraint relaxes.
 */
const TRUNCATION_MARKER = '…';

/**
 * Validate a `MetricEvent` against the schema, returning either a normalized
 * event ready for emission or `null` when the event should be dropped.
 *
 * Normalization (when accepted):
 *   - String fields longer than `maxChars` are truncated and suffixed with
 *     `…` so over-long values are visible in dashboards rather than silently
 *     lost.
 *
 * Returns `null` (and emits a `safeLog` line) when:
 *   - `event_type` is unknown
 *   - `outcome` is set but not in `OUTCOME_VALUES[event_type]`
 *   - `keyOwner` exceeds the AE index cap
 */
export function guardEvent(event: MetricEvent): MetricEvent | null {
  // (1) event_type must be in the enum.
  if (!isKnownEventType(event.event_type)) {
    safeLog({
      event: 'metrics.guard.rejected',
      reason: `unknown-event-type=${String(event.event_type)}`,
      success: false,
      errorCode: 'metrics-guard-reject',
    });
    return null;
  }

  // (2) outcome (if set) must be in the per-type allowlist.
  if (event.outcome !== undefined && !OUTCOME_VALUES[event.event_type].includes(event.outcome)) {
    safeLog({
      event: 'metrics.guard.rejected',
      reason: `bad-outcome=${event.outcome};type=${event.event_type}`,
      success: false,
      errorCode: 'metrics-guard-reject',
    });
    return null;
  }

  // (2b) name (if set AND event_type has a NAME_VALUES entry) must be in the
  // per-type allowlist. Catches drift between a category enum added to a
  // wrapper (e.g. inoreader-egress.ts CATEGORIES) and the schema source of
  // truth. Event types without a NAME_VALUES entry (tool_invocation,
  // resource_read, etc.) have open `name` cardinality by design.
  const allowedNames = NAME_VALUES[event.event_type];
  if (
    allowedNames !== undefined &&
    event.name !== undefined &&
    !allowedNames.includes(event.name)
  ) {
    safeLog({
      event: 'metrics.guard.rejected',
      reason: `bad-name=${event.name};type=${event.event_type}`,
      success: false,
      errorCode: 'metrics-guard-reject',
    });
    return null;
  }

  // (5) AE index1 cap on keyOwner. UTF-8 byte count; ASCII strings = char
  // count, but be safe for any future non-ASCII keys.
  if (event.keyOwner !== undefined && utf8ByteLength(event.keyOwner) > AE_LIMITS.MAX_INDEX_BYTES) {
    safeLog({
      event: 'metrics.guard.rejected',
      reason: `keyOwner-exceeds-index-cap=${utf8ByteLength(event.keyOwner)}`,
      success: false,
      errorCode: 'metrics-guard-reject',
    });
    return null;
  }

  // (3) Truncate over-long string fields per BLOB_SLOTS.maxChars.
  const normalized: MetricEvent = { ...event };
  for (const spec of BLOB_SLOTS) {
    const value = normalized[spec.field];
    if (typeof value === 'string' && value.length > spec.maxChars) {
      // Truncate keeping `maxChars - 1` chars + marker so total length =
      // maxChars exactly.
      (normalized as unknown as Record<string, unknown>)[spec.field] =
        value.slice(0, spec.maxChars - 1) + TRUNCATION_MARKER;
    }
  }

  // (4) Defense-in-depth: total normalized blob payload under AE cap. With
  // current maxChars sums (~296), this is unreachable, but a future maxChars
  // bump could approach the 16 KB ceiling.
  const payloadBytes = sumBlobPayloadBytes(normalized);
  if (payloadBytes > AE_LIMITS.MAX_BLOB_PAYLOAD_BYTES) {
    safeLog({
      event: 'metrics.guard.rejected',
      reason: `blob-payload-exceeds-cap=${payloadBytes}`,
      success: false,
      errorCode: 'metrics-guard-reject',
    });
    return null;
  }

  return normalized;
}

function isKnownEventType(value: unknown): value is EventType {
  return typeof value === 'string' && (EVENT_TYPES as readonly string[]).includes(value);
}

function sumBlobPayloadBytes(event: MetricEvent): number {
  let total = 0;
  for (const spec of BLOB_SLOTS) {
    const value = event[spec.field];
    if (typeof value === 'string') {
      total += utf8ByteLength(value);
    }
  }
  return total;
}
