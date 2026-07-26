/**
 * BL-033 Slice 3a — audit entry canonicalization + hash-chain unit tests.
 *
 * The chain's tamper-evidence rests entirely on `canonicalize` being
 * deterministic (key-order independent) and `computeEntryHash` linking each
 * entry to the previous one's hash. These tests pin both.
 */
import { describe, expect, it } from 'vitest';
import {
  AUDIT_SCHEMA_VERSION,
  GENESIS_PREV_HASH,
  canonicalize,
  computeEntryHash,
  type AuditEntry,
} from '../../../src/audit/entry';

function makeEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    entryId: 'e-1',
    requestId: 'r-1',
    tsIso: '2026-07-26T00:00:00.000Z',
    keyOwner: 'RP',
    ipPrefix: '203.0.113.0',
    toolName: 'search_portfolio',
    inputParams: { query: 'saas', limit: 10 },
    outputBytes: 512,
    durationMs: 42,
    outcome: 'success',
    ...overrides,
  };
}

describe('canonicalize', () => {
  it('is deterministic regardless of key insertion order', () => {
    const a = { b: 1, a: 2, nested: { y: 1, x: 2 } };
    const b = { nested: { x: 2, y: 1 }, a: 2, b: 1 };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it('preserves array order (arrays are ordered data, not sorted)', () => {
    expect(canonicalize({ xs: [3, 1, 2] })).not.toBe(canonicalize({ xs: [1, 2, 3] }));
  });

  it('excludes the top-level entryHash field so a chained entry re-hashes stably', () => {
    const base = makeEntry();
    const withHash = { ...base, seq: 0, prevHash: GENESIS_PREV_HASH, entryHash: 'deadbeef' };
    const withoutHash = { ...base, seq: 0, prevHash: GENESIS_PREV_HASH };
    expect(canonicalize(withHash)).toBe(canonicalize(withoutHash));
  });

  it('throws on a circular reference rather than hanging', () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(() => canonicalize(cyclic)).toThrow(/circular/i);
  });
});

describe('computeEntryHash + chain linkage', () => {
  it('links each entry to the previous entry hash', async () => {
    const e0 = { ...makeEntry({ entryId: 'e-0' }), seq: 0 };
    const h0 = await computeEntryHash(GENESIS_PREV_HASH, e0);

    const e1 = { ...makeEntry({ entryId: 'e-1' }), seq: 1 };
    const h1 = await computeEntryHash(h0, e1);

    // Hashes are 64-hex SHA-256 and distinct.
    expect(h0).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).not.toBe(h0);

    // Re-deriving with the correct prevHash reproduces the same hash
    // (the property the deferred integrity re-walk depends on).
    expect(await computeEntryHash(h0, e1)).toBe(h1);
  });

  it('detects tampering — mutating a committed entry breaks the re-walk', async () => {
    const e0 = { ...makeEntry({ entryId: 'e-0' }), seq: 0 };
    const h0 = await computeEntryHash(GENESIS_PREV_HASH, e0);

    // An attacker edits the persisted input params after the fact.
    const tampered = { ...e0, inputParams: { query: 'exfiltrate', limit: 9999 } };
    const reHash = await computeEntryHash(GENESIS_PREV_HASH, tampered);
    expect(reHash).not.toBe(h0);
  });

  it('a different prevHash yields a different entryHash (reorder/deletion detection)', async () => {
    const e1 = { ...makeEntry({ entryId: 'e-1' }), seq: 1 };
    const hA = await computeEntryHash('a'.repeat(64), e1);
    const hB = await computeEntryHash('b'.repeat(64), e1);
    expect(hA).not.toBe(hB);
  });
});
