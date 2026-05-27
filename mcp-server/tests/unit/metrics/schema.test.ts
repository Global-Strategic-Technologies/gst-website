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
  MAX_BLOB_PAYLOAD_CHARS,
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

  it('keeps total blob payload well under AE 16 KB cap', () => {
    expect(MAX_BLOB_PAYLOAD_CHARS).toBeLessThan(AE_LIMITS.MAX_BLOB_PAYLOAD_BYTES);
    // Sanity: current worst-case is ~296 chars. If this jumps by an order of
    // magnitude, someone added a wide blob without thinking.
    expect(MAX_BLOB_PAYLOAD_CHARS).toBeLessThan(1024);
  });

  it('uses fewer blob/double slots than the AE substrate provides', () => {
    expect(BLOB_SLOTS.length).toBeLessThanOrEqual(AE_LIMITS.MAX_BLOBS_PER_CALL);
    expect(DOUBLE_SLOTS.length).toBeLessThanOrEqual(AE_LIMITS.MAX_DOUBLES_PER_CALL);
  });

  it('pins OUTCOME_VALUES per event type', () => {
    expect(OUTCOME_VALUES).toMatchInlineSnapshot(`
      {
        "cron_outcome": [
          "success",
          "error",
          "skipped-circuit",
          "skipped-budget",
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
          "hit",
          "miss",
          "error",
        ],
        "tool_invocation": [
          "success",
          "error",
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
      blobs: ['tool_invocation', 'search_radar', 'RP', 'success', null, '200'],
      doubles: [142, 0],
      indexes: ['RP'],
    });
  });

  it('emits "_" as the index1 placeholder when keyOwner is absent', () => {
    const dp = toDataPoint({
      event_type: 'cron_outcome',
      name: 'radar-refresh',
      outcome: 'success',
    });
    expect(dp.indexes).toEqual(['_']);
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
});
