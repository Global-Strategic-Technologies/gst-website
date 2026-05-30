/**
 * BL-041 — ACL self-check module tests.
 *
 * Asserts the gate-then-probe contract:
 *   - Gate SET NX EX is attempted with the per-deploy key
 *   - Probe runs only when the gate is captured
 *   - Result is recorded in the per-deploy result key
 *   - Concurrent callers see the recorded result via the read path
 *   - NOPERM on any probe step short-circuits with the failing command name
 *   - Upstash unreachable → `'unknown'` (never throws)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const {
  MockRedis,
  mockSet,
  mockGet,
  mockIncr,
  mockExpire,
  mockZadd,
  mockZremrange,
  mockEval,
  mockDel,
} = vi.hoisted(() => {
  const mockSet = vi.fn();
  const mockGet = vi.fn();
  const mockIncr = vi.fn();
  const mockExpire = vi.fn();
  const mockZadd = vi.fn();
  const mockZremrange = vi.fn();
  const mockEval = vi.fn();
  const mockDel = vi.fn();
  class MockRedis {
    set = mockSet;
    get = mockGet;
    incr = mockIncr;
    expire = mockExpire;
    zadd = mockZadd;
    zremrangebyscore = mockZremrange;
    eval = mockEval;
    del = mockDel;
  }
  return {
    MockRedis,
    mockSet,
    mockGet,
    mockIncr,
    mockExpire,
    mockZadd,
    mockZremrange,
    mockEval,
    mockDel,
  };
});

vi.mock('@upstash/redis', () => ({ Redis: MockRedis }));

import { runAclSelfCheckOnce, readAclSelfCheck } from '../../../src/observability/acl-selfcheck';
import type { Env } from '../../../src/worker';

const env: Env = {
  UPSTASH_MCP_REST_URL: 'https://y.upstash.io',
  UPSTASH_MCP_REST_TOKEN: 'rw',
  GIT_SHA: 'abc1234',
  ENV_NAME: 'staging',
};

beforeEach(() => {
  mockSet.mockReset();
  mockGet.mockReset();
  mockIncr.mockReset();
  mockExpire.mockReset();
  mockZadd.mockReset();
  mockZremrange.mockReset();
  mockEval.mockReset();
  mockDel.mockReset();
});

describe('runAclSelfCheckOnce — happy path', () => {
  it('captures the gate, runs every probe step, records ok, returns ok', async () => {
    // Gate SET succeeds (acquired); every probe step resolves.
    mockSet.mockResolvedValueOnce('OK'); // gate
    mockIncr.mockResolvedValue(1);
    mockExpire.mockResolvedValue(1);
    mockZadd.mockResolvedValue(1);
    mockZremrange.mockResolvedValue(0);
    mockEval.mockResolvedValue(1);
    // First probe step is SET — second SET call.
    mockSet.mockResolvedValueOnce('OK');
    // Result-record SET.
    mockSet.mockResolvedValueOnce('OK');
    mockDel.mockResolvedValue(1);

    const result = await runAclSelfCheckOnce(env);

    expect(result.status).toBe('ok');
    expect(result.ranAt).toBeTypeOf('string');
    expect(mockIncr).toHaveBeenCalled();
    expect(mockEval).toHaveBeenCalled();
    // gate (set #1) + probe SET (set #2) + result-record (set #3) = 3
    expect(mockSet).toHaveBeenCalledTimes(3);
  });
});

describe('runAclSelfCheckOnce — gate not captured', () => {
  it('reads the recorded result instead of probing again', async () => {
    // Gate SET returns null (peer already holds it).
    mockSet.mockResolvedValueOnce(null);
    // Recorded result GET returns ok payload.
    mockGet.mockResolvedValueOnce({ status: 'ok', ranAt: '2026-05-30T10:00:00Z' });

    const result = await runAclSelfCheckOnce(env);

    expect(result.status).toBe('ok');
    expect(mockIncr).not.toHaveBeenCalled();
    expect(mockEval).not.toHaveBeenCalled();
  });

  it('returns unknown when peer holds gate but no result has been written yet', async () => {
    mockSet.mockResolvedValueOnce(null);
    mockGet.mockResolvedValueOnce(null);

    const result = await runAclSelfCheckOnce(env);

    expect(result.status).toBe('unknown');
  });
});

describe('runAclSelfCheckOnce — NOPERM short-circuit', () => {
  it('records degraded with the failing command when EVAL throws NOPERM', async () => {
    mockSet.mockResolvedValueOnce('OK'); // gate
    mockSet.mockResolvedValueOnce('OK'); // probe SET ok
    mockIncr.mockResolvedValue(1);
    mockExpire.mockResolvedValue(1);
    mockZadd.mockResolvedValue(1);
    mockZremrange.mockResolvedValue(0);
    mockEval.mockRejectedValueOnce(new Error('NOPERM no permission to run command'));
    // Result-record SET should still fire.
    mockSet.mockResolvedValueOnce('OK');

    const result = await runAclSelfCheckOnce(env);

    expect(result.status).toBe('degraded');
    expect(result.failedCommand).toMatch(/EVAL/);
    expect(result.failedCommand).toMatch(/NOPERM/);
    // del cleanup should NOT have been called (we short-circuited).
    expect(mockDel).not.toHaveBeenCalled();
  });

  it('stops at the first failing step (does not exercise later steps)', async () => {
    mockSet.mockResolvedValueOnce('OK'); // gate
    mockSet.mockResolvedValueOnce('OK'); // probe SET ok
    mockIncr.mockRejectedValueOnce(new Error('NOPERM'));
    mockSet.mockResolvedValueOnce('OK'); // result-record

    const result = await runAclSelfCheckOnce(env);

    expect(result.status).toBe('degraded');
    expect(result.failedCommand).toMatch(/INCR/);
    expect(mockExpire).not.toHaveBeenCalled();
    expect(mockZadd).not.toHaveBeenCalled();
    expect(mockEval).not.toHaveBeenCalled();
  });
});

describe('runAclSelfCheckOnce — Upstash unreachable', () => {
  it('returns unknown when gate SET throws (never throws to caller)', async () => {
    mockSet.mockRejectedValueOnce(new Error('network'));
    const result = await runAclSelfCheckOnce(env);
    expect(result.status).toBe('unknown');
  });
});

describe('readAclSelfCheck', () => {
  it('returns unknown when no result is recorded', async () => {
    mockGet.mockResolvedValueOnce(null);
    const result = await readAclSelfCheck(env);
    expect(result.status).toBe('unknown');
  });

  it('returns the recorded result', async () => {
    mockGet.mockResolvedValueOnce({ status: 'degraded', failedCommand: 'EVAL: NOPERM' });
    const result = await readAclSelfCheck(env);
    expect(result.status).toBe('degraded');
    expect(result.failedCommand).toBe('EVAL: NOPERM');
  });

  it('parses JSON string responses (Upstash auto-stringify variant)', async () => {
    mockGet.mockResolvedValueOnce(JSON.stringify({ status: 'ok', ranAt: '2026-05-30T10:00:00Z' }));
    const result = await readAclSelfCheck(env);
    expect(result.status).toBe('ok');
  });

  it('returns unknown when redis.get throws', async () => {
    mockGet.mockRejectedValueOnce(new Error('network'));
    const result = await readAclSelfCheck(env);
    expect(result.status).toBe('unknown');
  });
});

describe('env-scoped keys (BL-041 closeout)', () => {
  it('reads from env-scoped result key (env name prepended to gitSha)', async () => {
    mockGet.mockResolvedValueOnce({ status: 'ok' });
    await readAclSelfCheck(env);
    expect(mockGet).toHaveBeenCalledWith('mcp:acl-selfcheck:result:staging:abc1234');
  });

  it('writes to env-scoped gate + result keys when probing', async () => {
    mockSet.mockResolvedValueOnce('OK'); // gate
    mockSet.mockResolvedValueOnce('OK'); // probe SET
    mockIncr.mockResolvedValue(1);
    mockExpire.mockResolvedValue(1);
    mockZadd.mockResolvedValue(1);
    mockZremrange.mockResolvedValue(0);
    mockEval.mockResolvedValue(1);
    mockSet.mockResolvedValueOnce('OK'); // result-record
    mockDel.mockResolvedValue(1);

    await runAclSelfCheckOnce(env);

    // First SET = gate; third SET = result record. Both must carry env discriminator.
    const gateCall = mockSet.mock.calls[0]!;
    const resultCall = mockSet.mock.calls[2]!;
    expect(gateCall[0]).toBe('mcp:acl-selfcheck:gate:staging:abc1234');
    expect(resultCall[0]).toBe('mcp:acl-selfcheck:result:staging:abc1234');
  });

  it('production env name produces a DIFFERENT key set than staging (no shared-state false-green)', async () => {
    const prodEnv: Env = { ...env, ENV_NAME: 'production' };
    mockGet.mockResolvedValueOnce(null);
    await readAclSelfCheck(prodEnv);
    expect(mockGet).toHaveBeenCalledWith('mcp:acl-selfcheck:result:production:abc1234');
  });

  it('falls back to ENV_NAME=unknown when binding missing (local wrangler dev)', async () => {
    const unbound: Env = { ...env, ENV_NAME: undefined };
    mockGet.mockResolvedValueOnce(null);
    await readAclSelfCheck(unbound);
    expect(mockGet).toHaveBeenCalledWith('mcp:acl-selfcheck:result:unknown:abc1234');
  });
});
