/**
 * BL-032.75 Phase 1 — schema snapshot.
 *
 * Pins the AE column map. Any change to event types, blob positions, double
 * positions, max-char caps, or the projection logic trips this test, forcing
 * deliberate review before a breaking change ships.
 *
 * If you intentionally changed the schema:
 *   1. Update the downstream Grafana SQL queries + dashboard JSON
 *   2. Update the status-page server-side query
 *   3. Run `npx vitest -u` to refresh the snapshot
 *   4. Add a changelog entry to the BL-032.75 doc
 */
import { describe, expect, it } from 'vitest';
import {
  AE_LIMITS,
  BLOB_SLOTS,
  DOUBLE_SLOTS,
  EVENT_TYPES,
  KEYOWNER_PLACEHOLDER,
  MAX_BLOB_PAYLOAD_BYTES_WORST_CASE,
  MAX_BLOB_PAYLOAD_CHARS_SUM,
  NAME_VALUES,
  OUTCOME_VALUES,
  toDataPoint,
} from '../../../src/metrics/_schema';

describe('AE column-map schema (BL-032.75 Phase 1 source of truth)', () => {
  it('pins the EVENT_TYPES list', () => {
    expect(EVENT_TYPES).toMatchInlineSnapshot(`
      [
        "tool_invocation",
        "resource_read",
        "prompt_invocation",
        "prompt_span",
        "rate_limit_decision",
        "inoreader_call",
        "health_check",
        "cron_outcome",
        "audit_batch",
        "wrong_irl_detected",
        "gate_elided",
      ]
    `);
  });

  it('pins the BLOB_SLOTS column map', () => {
    expect(BLOB_SLOTS).toMatchInlineSnapshot(`
      [
        {
          "field": "event_type",
          "maxChars": 32,
          "slot": 1,
        },
        {
          "field": "name",
          "maxChars": 128,
          "slot": 2,
        },
        {
          "field": "keyOwner",
          "maxChars": 32,
          "slot": 3,
        },
        {
          "field": "outcome",
          "maxChars": 32,
          "slot": 4,
        },
        {
          "field": "correlation_id",
          "maxChars": 64,
          "slot": 5,
        },
        {
          "field": "status_code",
          "maxChars": 8,
          "slot": 6,
        },
        {
          "field": "zone1",
          "maxChars": 1,
          "slot": 7,
        },
      ]
    `);
  });

  it('pins the DOUBLE_SLOTS column map', () => {
    expect(DOUBLE_SLOTS).toMatchInlineSnapshot(`
      [
        {
          "field": "duration_ms",
          "slot": 1,
        },
        {
          "field": "seq",
          "slot": 2,
        },
      ]
    `);
  });

  it('keeps worst-case UTF-8 byte payload well under AE 16 KB cap', () => {
    // B3 fix: compare BYTES to the BYTE cap. `MAX_BLOB_PAYLOAD_CHARS_SUM`
    // multiplied by 4 (UTF-8 max bytes per char) gives the conservative
    // worst-case payload size.
    expect(MAX_BLOB_PAYLOAD_BYTES_WORST_CASE).toBeLessThan(AE_LIMITS.MAX_BLOB_PAYLOAD_BYTES);
    // Sanity: current sum is ~296 chars → ~1184 bytes worst-case. If this
    // jumps by an order of magnitude, someone added a wide blob without
    // thinking.
    expect(MAX_BLOB_PAYLOAD_CHARS_SUM).toBeLessThan(1024);
  });

  it('uses fewer blob/double slots than the AE substrate provides', () => {
    expect(BLOB_SLOTS.length).toBeLessThanOrEqual(AE_LIMITS.MAX_BLOBS_PER_CALL);
    expect(DOUBLE_SLOTS.length).toBeLessThanOrEqual(AE_LIMITS.MAX_DOUBLES_PER_CALL);
  });

  it('pins OUTCOME_VALUES per event type', () => {
    expect(OUTCOME_VALUES).toMatchInlineSnapshot(`
      {
        "audit_batch": [
          "success",
          "error",
          "deduplicated",
        ],
        "cron_outcome": [
          "success",
          "partial",
          "error",
          "skipped-circuit",
          "skipped-budget",
          "deduplicated",
        ],
        "gate_elided": [
          "elided",
        ],
        "health_check": [
          "ok",
          "degraded",
          "error",
        ],
        "inoreader_call": [
          "success",
          "error",
        ],
        "prompt_invocation": [
          "success",
          "error",
        ],
        "prompt_span": [
          "success",
          "error",
        ],
        "rate_limit_decision": [
          "allow",
          "throttle",
          "deny",
        ],
        "resource_read": [
          "success",
          "error",
        ],
        "tool_invocation": [
          "success",
          "error",
        ],
        "wrong_irl_detected": [
          "halt",
          "partial",
          "ok",
        ],
      }
    `);
  });

  it('declares OUTCOME_VALUES for every event type', () => {
    for (const eventType of EVENT_TYPES) {
      expect(OUTCOME_VALUES[eventType]).toBeDefined();
      expect(OUTCOME_VALUES[eventType].length).toBeGreaterThan(0);
    }
  });

  it('M2: OUTCOME_VALUES key set matches EVENT_TYPES exactly (catches forgotten additions)', () => {
    // Adversarial-audit fix M2: the typed `Record<EventType, ...>` lets a
    // missing key sneak past TS narrowing. This runtime parity check
    // catches the case where someone extends `EVENT_TYPES` but forgets the
    // matching `OUTCOME_VALUES` entry.
    expect(Object.keys(OUTCOME_VALUES).sort()).toEqual([...EVENT_TYPES].sort());
  });

  it('M3: KEYOWNER_PLACEHOLDER pinned (downstream Grafana SQL depends on it)', () => {
    expect(KEYOWNER_PLACEHOLDER).toBe('__none__');
  });

  it('Step 6: NAME_VALUES allowlist pinned (catches enum drift between wrapper + schema)', () => {
    expect(NAME_VALUES).toMatchInlineSnapshot(`
      {
        "cron_outcome": [
          "radar-refresh",
          "alert-evaluator",
        ],
        "inoreader_call": [
          "cron-radar",
          "live-radar",
          "http-radar-snapshot",
          "oauth-refresh",
          "401-retry",
        ],
      }
    `);
  });
});

describe('toDataPoint projection (pure function)', () => {
  it('projects a full tool_invocation event into the positional shape', () => {
    const dp = toDataPoint({
      event_type: 'tool_invocation',
      name: 'search_radar',
      keyOwner: 'RP',
      outcome: 'success',
      status_code: '200',
      duration_ms: 142,
    });
    expect(dp).toEqual({
      blobs: ['tool_invocation', 'search_radar', 'RP', 'success', null, '200', null],
      doubles: [142, 0],
      indexes: ['RP'],
    });
  });

  it('projects an inoreader_call event with zone1 in blob7', () => {
    const dp = toDataPoint({
      event_type: 'inoreader_call',
      name: 'cron-radar',
      keyOwner: 'RP',
      outcome: 'success',
      status_code: '200',
      duration_ms: 230,
      zone1: '1',
    });
    expect(dp).toEqual({
      blobs: ['inoreader_call', 'cron-radar', 'RP', 'success', null, '200', '1'],
      doubles: [230, 0],
      indexes: ['RP'],
    });
  });

  it('projects oauth-refresh as zone1=0', () => {
    const dp = toDataPoint({
      event_type: 'inoreader_call',
      name: 'oauth-refresh',
      outcome: 'success',
      status_code: '200',
      zone1: '0',
    });
    expect(dp.blobs[6]).toBe('0');
  });

  it('emits KEYOWNER_PLACEHOLDER as the index1 placeholder when keyOwner is absent', () => {
    const dp = toDataPoint({
      event_type: 'cron_outcome',
      name: 'radar-refresh',
      outcome: 'success',
    });
    expect(dp.indexes).toEqual([KEYOWNER_PLACEHOLDER]);
    expect(dp.indexes[0]).toBe('__none__');
  });

  it('mirrors keyOwner into both blob3 and index1', () => {
    const dp = toDataPoint({ event_type: 'tool_invocation', keyOwner: 'RP' });
    expect(dp.blobs[2]).toBe('RP');
    expect(dp.indexes[0]).toBe('RP');
  });

  it('coerces undefined numeric fields to 0 (AE requires numeric doubles)', () => {
    const dp = toDataPoint({ event_type: 'tool_invocation' });
    expect(dp.doubles).toEqual([0, 0]);
  });

  it('preserves prompt_span seq + correlation_id', () => {
    const dp = toDataPoint({
      event_type: 'prompt_span',
      name: 'gst_target_quick_look',
      correlation_id: 'abc-123',
      seq: 2,
      duration_ms: 47,
    });
    expect(dp.blobs[4]).toBe('abc-123');
    expect(dp.doubles).toEqual([47, 2]);
  });

  it('closeout-audit: toDataPoint output conforms to AnalyticsEngineDataPoint structural shape', () => {
    // Major-2 closeout fix: pins the AE-positional contract so a future
    // schema change can't silently emit malformed data points.
    //   - blobs: (string | null)[]
    //   - doubles: number[]
    //   - indexes: non-empty string[]  ← AE rejects empty index arrays
    const dp = toDataPoint({
      event_type: 'tool_invocation',
      name: 'search_radar',
      keyOwner: 'RP',
      outcome: 'success',
      duration_ms: 100,
    });
    // Every blob is either string or null (never undefined).
    expect(Array.isArray(dp.blobs)).toBe(true);
    for (const blob of dp.blobs) {
      expect(blob === null || typeof blob === 'string').toBe(true);
    }
    expect(dp.blobs).toHaveLength(BLOB_SLOTS.length);
    // Every double is a finite number.
    expect(Array.isArray(dp.doubles)).toBe(true);
    for (const d of dp.doubles) {
      expect(typeof d).toBe('number');
      expect(Number.isFinite(d)).toBe(true);
    }
    expect(dp.doubles).toHaveLength(DOUBLE_SLOTS.length);
    // Indexes is a non-empty array of strings (AE requirement).
    expect(Array.isArray(dp.indexes)).toBe(true);
    expect(dp.indexes.length).toBeGreaterThan(0);
    expect(dp.indexes.length).toBeLessThanOrEqual(AE_LIMITS.MAX_INDEXES_PER_CALL);
    for (const idx of dp.indexes) {
      expect(typeof idx).toBe('string');
      expect(idx.length).toBeGreaterThan(0);
    }
  });

  it('W6: end-to-end blob payload stays under AE 16 KB cap even with all slots maxed', () => {
    // Adversarial-audit W6: prior tests stop at length assertions. This
    // pushes a maxed-out event (every blob field filled with its
    // maxChars worth of single-byte ASCII) through the real `toDataPoint`
    // and asserts the resulting payload byte count is within budget.
    const dp = toDataPoint({
      event_type: 'tool_invocation', // 15 chars
      name: 'x'.repeat(128),
      keyOwner: 'X'.repeat(32),
      outcome: 'success', // 7 chars (any valid outcome)
      correlation_id: 'c'.repeat(64),
      status_code: '12345678', // 8 chars (the maxChars cap on status_code)
    });
    const encoder = new TextEncoder();
    const totalBytes = dp.blobs.reduce(
      (sum, blob) => sum + (blob === null ? 0 : encoder.encode(blob).length),
      0
    );
    expect(totalBytes).toBeLessThan(AE_LIMITS.MAX_BLOB_PAYLOAD_BYTES);
  });
});
