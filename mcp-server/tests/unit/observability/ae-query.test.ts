/**
 * Unit tests for the shared Analytics Engine SQL runner (BL-033 Slice 4).
 * Verifies the fail-open contract, `FORMAT JSON` appending, and the
 * unbound-credentials short-circuit — the behavior extracted verbatim from
 * the alert evaluator's former private `queryAeFactory`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAeQuery } from '../../../src/observability/ae-query';
import type { Env } from '../../../src/worker';

const BOUND = { CF_AE_TOKEN: 'tok', CF_ACCOUNT_ID: 'acct' } as unknown as Env;

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('createAeQuery', () => {
  it('returns a null-yielding query when credentials are unbound (no fetch)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const q = createAeQuery({} as Env);
    expect(await q('SELECT 1')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs the SQL with FORMAT JSON appended and Bearer auth, parsing data rows', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ name: 'x', p50_ms: '5' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const rows = await createAeQuery(BOUND)('SELECT foo');

    expect(rows).toEqual([{ name: 'x', p50_ms: '5' }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/accounts/acct/analytics_engine/sql');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.body).toBe('SELECT foo FORMAT JSON');
  });

  it('fails open to null on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    expect(await createAeQuery(BOUND)('SELECT 1')).toBeNull();
  });

  it('fails open to null when fetch rejects (network / abort)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('aborted')));
    expect(await createAeQuery(BOUND)('SELECT 1')).toBeNull();
  });

  it('fails open to null when the response shape lacks a data array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    expect(await createAeQuery(BOUND)('SELECT 1')).toBeNull();
  });
});
