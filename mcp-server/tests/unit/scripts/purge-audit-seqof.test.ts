/**
 * ADR-0014 — unit tests for the seqof purge script's safety predicates.
 *
 * The script is a destructive operator one-shot, so the things a test can
 * pin ARE its safety story: dry-run by default, the `mcp:audit:seqof:`
 * prefix assertion that protects the chain-tip keys, batching math, and
 * SCAN-cursor termination on the STRING `'0'` (`scripts/` sits outside
 * tsconfig's typecheck, so nothing but this test catches a `!== 0` typo —
 * which would be an infinite loop).
 */
import { describe, expect, it } from 'vitest';
import {
  SEQOF_PREFIX,
  UNLINK_BATCH_SIZE,
  approxBytesHeld,
  batchKeys,
  collectSeqofKeys,
  parsePurgeArgs,
  partitionSeqofKeys,
  summarizeByEnv,
} from '../../../scripts/purge-audit-seqof.mjs';

describe('parsePurgeArgs — dry-run is the default', () => {
  it('defaults to dry-run with no flags', () => {
    expect(parsePurgeArgs([])).toEqual({ execute: false, help: false });
  });

  it('enables deletion only with the exact --execute flag', () => {
    expect(parsePurgeArgs(['--execute']).execute).toBe(true);
  });

  it('throws on unknown flags rather than silently dry-running a typo', () => {
    expect(() => parsePurgeArgs(['--exectue'])).toThrow(/Unknown flag/);
    expect(() => parsePurgeArgs(['--force'])).toThrow(/Unknown flag/);
  });

  it('parses --help', () => {
    expect(parsePurgeArgs(['--help']).help).toBe(true);
    expect(parsePurgeArgs(['-h']).help).toBe(true);
  });
});

describe('partitionSeqofKeys — chain-tip keys can never reach the delete path', () => {
  it('accepts only mcp:audit:seqof:* keys', () => {
    const { valid, invalid } = partitionSeqofKeys([
      'mcp:audit:seqof:production:1e23f280-1923-4259-8946-0f2d2de2b7a0',
      'mcp:audit:seqof:staging:abc',
    ]);
    expect(valid).toHaveLength(2);
    expect(invalid).toHaveLength(0);
  });

  it('rejects chain-tip keys and arbitrary mcp keys', () => {
    const { valid, invalid } = partitionSeqofKeys([
      'mcp:audit:chain-tip:production',
      'mcp:audit:chain-tip:staging',
      'mcp:radar:cache:wire',
      'mcp:audit:seqof:production:ok',
    ]);
    expect(valid).toEqual(['mcp:audit:seqof:production:ok']);
    expect(invalid).toHaveLength(3);
    expect(invalid).toContain('mcp:audit:chain-tip:production');
  });

  it('rejects a prefix-adjacent key (no startsWith false positive)', () => {
    const { invalid } = partitionSeqofKeys(['mcp:audit:seqof2:production:x']);
    expect(invalid).toHaveLength(1);
    expect('mcp:audit:seqof2:production:x'.startsWith(SEQOF_PREFIX)).toBe(false);
  });
});

describe('batchKeys', () => {
  it('returns no batches for no keys', () => {
    expect(batchKeys([])).toEqual([]);
  });

  it('splits into UNLINK_BATCH_SIZE groups with a remainder batch', () => {
    const keys = Array.from({ length: UNLINK_BATCH_SIZE * 2 + 3 }, (_, i) => `k${i}`);
    const batches = batchKeys(keys);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(UNLINK_BATCH_SIZE);
    expect(batches[2]).toHaveLength(3);
    expect(batches.flat()).toEqual(keys);
  });
});

describe('summarizeByEnv', () => {
  it('counts by the 4th colon segment', () => {
    expect(
      summarizeByEnv([
        'mcp:audit:seqof:production:a',
        'mcp:audit:seqof:production:b',
        'mcp:audit:seqof:staging:c',
      ])
    ).toEqual({ production: 2, staging: 1 });
  });
});

describe('collectSeqofKeys — cursor loop terminates on the STRING cursor', () => {
  it('follows string cursors across pages and stops at "0"', async () => {
    // Upstash returns the cursor as a string; a strict comparison against the
    // NUMBER 0 would never match and loop forever. Fake pages: '0'→'17'→'0'.
    const pages: Record<string, [string, string[]]> = {
      '0': ['17', ['mcp:audit:seqof:test:a', 'mcp:audit:seqof:test:b']],
      '17': ['0', ['mcp:audit:seqof:test:c']],
    };
    const calls: Array<string | number> = [];
    const redis = {
      async scan(cursor: string | number, opts: { match: string; count: number }) {
        calls.push(cursor);
        expect(opts.match).toBe(`${SEQOF_PREFIX}*`);
        return pages[String(cursor)];
      },
    };
    const keys = await collectSeqofKeys(redis);
    expect(keys).toEqual([
      'mcp:audit:seqof:test:a',
      'mcp:audit:seqof:test:b',
      'mcp:audit:seqof:test:c',
    ]);
    expect(calls).toEqual(['0', '17']); // exactly two pages — terminated, no spin
  });

  it('handles an empty keyspace (single "0"-cursor page)', async () => {
    const redis = {
      async scan() {
        return ['0', []] as [string, string[]];
      },
    };
    expect(await collectSeqofKeys(redis)).toEqual([]);
  });
});

describe('approxBytesHeld', () => {
  it('sums key length + serialized value length, tolerating null values', async () => {
    const values: Record<string, unknown> = {
      ka: { seq: 1, prevHash: 'x', entryHash: 'y' },
    };
    const redis = {
      async mget(...keys: string[]) {
        return keys.map((k) => values[k] ?? null);
      },
    };
    const bytes = await approxBytesHeld(redis, ['ka', 'kb']);
    const expected = 'ka'.length + JSON.stringify(values.ka).length + 'kb'.length; // kb value null → 0
    expect(bytes).toBe(expected);
  });
});
