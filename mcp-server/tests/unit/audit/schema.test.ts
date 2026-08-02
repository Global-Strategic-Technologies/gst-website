/**
 * BL-033 Slice 3a — audit record schema snapshot.
 *
 * Interfaces are erased at runtime, so we pin the field SETS of a fully
 * populated `AuditEntry` (enqueue shape) and `ChainedAuditEntry` (persisted
 * shape) plus the schema version. Any field add/remove/rename trips this,
 * forcing a deliberate `AUDIT_SCHEMA_VERSION` bump + downstream review
 * (the deferred integrity check + signed-URL export both parse this shape).
 *
 * If you intentionally changed the shape: bump AUDIT_SCHEMA_VERSION, update
 * ADR-0009, and run `npx vitest -u` to refresh these snapshots.
 */
import { describe, expect, it } from 'vitest';
import {
  AUDIT_SCHEMA_VERSION,
  GENESIS_PREV_HASH,
  type AuditEntry,
  type ChainedAuditEntry,
} from '../../../src/audit/entry';

const fullEntry: Required<AuditEntry> = {
  schemaVersion: AUDIT_SCHEMA_VERSION,
  entryId: 'e',
  requestId: 'r',
  tsIso: '2026-07-26T00:00:00.000Z',
  keyOwner: 'RP',
  ipPrefix: '203.0.113.0',
  toolName: 'search_portfolio',
  inputParams: {},
  outputBytes: 0,
  durationMs: 0,
  outcome: 'success',
  errorCode: 'none',
};

const fullChained: Required<ChainedAuditEntry> = {
  ...fullEntry,
  seq: 0,
  prevHash: GENESIS_PREV_HASH,
  entryHash: 'f'.repeat(64),
};

describe('audit record schema', () => {
  it('pins AUDIT_SCHEMA_VERSION', () => {
    expect(AUDIT_SCHEMA_VERSION).toBe(1);
  });

  it('pins the AuditEntry (enqueue) field set', () => {
    expect(Object.keys(fullEntry).sort()).toMatchInlineSnapshot(`
      [
        "durationMs",
        "entryId",
        "errorCode",
        "inputParams",
        "ipPrefix",
        "keyOwner",
        "outcome",
        "outputBytes",
        "requestId",
        "schemaVersion",
        "toolName",
        "tsIso",
      ]
    `);
  });

  it('pins the ChainedAuditEntry (persisted) field set', () => {
    expect(Object.keys(fullChained).sort()).toMatchInlineSnapshot(`
      [
        "durationMs",
        "entryHash",
        "entryId",
        "errorCode",
        "inputParams",
        "ipPrefix",
        "keyOwner",
        "outcome",
        "outputBytes",
        "prevHash",
        "requestId",
        "schemaVersion",
        "seq",
        "toolName",
        "tsIso",
      ]
    `);
  });
});
