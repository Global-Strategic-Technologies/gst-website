/**
 * BL-152 follow-up — `DELETE /admin/oauth/m2m-clients/<id>?releaseIdentity=true`.
 *
 * The flag is opt-in for a reason: revoking an abusive trial must NOT hand its
 * network a fresh one, so the default DELETE is unchanged. These tests pin the
 * three properties that make the flag safe — it is refused on non-trial
 * records, the identity release happens BEFORE the record is deleted (so the
 * name guard is still readable, and a failed release leaves the record
 * intact), and the released count is reported rather than inferred.
 *
 * `releaseTrialIdentity` itself (the scan, the value match, its AE event) is
 * proved in `tests/unit/trial/signup.test.ts`; here it is mocked so the route's
 * own branching is what fails when it breaks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { KVNamespace } from '@cloudflare/workers-types';

const { mockRelease } = vi.hoisted(() => ({ mockRelease: vi.fn() }));
vi.mock('../../../src/trial/signup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/trial/signup')>()),
  releaseTrialIdentity: mockRelease,
}));
vi.mock('../../../src/auth/safe-logger', () => ({ safeLog: vi.fn() }));

import { handleAdminM2mClients } from '../../../src/admin/oauth-clients';
import { createM2mClient, getM2mClient } from '../../../src/oauth/m2m-clients';
import type { Env } from '../../../src/env';

const ADMIN_KEY = 'admin-key';

function mockKv() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string, type?: string) => {
      const v = store.get(key) ?? null;
      return type === 'json' && v !== null ? JSON.parse(v) : v;
    }),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    list: vi.fn(async () => ({ keys: [...store.keys()].map((name) => ({ name })) })),
  } as unknown as KVNamespace;
}

let kv: KVNamespace;
const env = () => ({ OAUTH_KV: kv, MCP_ADMIN_KEY: ADMIN_KEY }) as unknown as Env;

const del = (clientId: string, query = '') =>
  handleAdminM2mClients(
    new Request(`https://mcp.test/admin/oauth/m2m-clients/${clientId}${query}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ADMIN_KEY}` },
    }),
    env()
  );

const makeClient = (name: string) =>
  createM2mClient(kv, {
    name,
    allowedScopes: ['tool:*'],
    tier: name === 'trial' ? 'trial' : 'paid',
  });

beforeEach(() => {
  kv = mockKv();
  mockRelease.mockReset();
  mockRelease.mockResolvedValue(1);
});

describe('DELETE m2m client — ?releaseIdentity', () => {
  it('does NOT release without the flag (revoking an abuser must not free them)', async () => {
    const { record } = await makeClient('trial');
    const body = (await (await del(record.clientId)).json()) as Record<string, unknown>;
    expect(mockRelease).not.toHaveBeenCalled();
    expect(body).toEqual({ deleted: record.clientId });
    expect(await getM2mClient(kv, record.clientId)).toBeNull();
  });

  it('releases and reports the count with the flag', async () => {
    const { record } = await makeClient('trial');
    const res = await del(record.clientId, '?releaseIdentity=true');
    expect(mockRelease).toHaveBeenCalledWith(expect.anything(), record.clientId);
    expect(await res.json()).toEqual({ deleted: record.clientId, identityReleased: 1 });
    expect(await getM2mClient(kv, record.clientId)).toBeNull();
  });

  it('reports 0 rather than failing when the identity had already lapsed', async () => {
    mockRelease.mockResolvedValue(0);
    const { record } = await makeClient('trial');
    const res = await del(record.clientId, '?releaseIdentity=true');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: record.clientId, identityReleased: 0 });
  });

  it('refuses the flag on a non-trial record, and deletes nothing', async () => {
    const { record } = await makeClient('Acme Capital');
    const res = await del(record.clientId, '?releaseIdentity=true');
    expect(res.status).toBe(400);
    expect(mockRelease).not.toHaveBeenCalled();
    expect(
      await getM2mClient(kv, record.clientId),
      'the record must survive a refusal'
    ).not.toBeNull();
  });

  it('leaves the record intact when the identity store is unreachable', async () => {
    // Order matters: release first, delete second. If they were swapped, this
    // failure would leave a deleted record whose network is still blocked —
    // the one state no admin call can repair.
    mockRelease.mockRejectedValue(new Error('upstash-unbound'));
    const { record } = await makeClient('trial');
    const res = await del(record.clientId, '?releaseIdentity=true');
    expect(res.status).toBe(503);
    expect(await getM2mClient(kv, record.clientId)).not.toBeNull();
  });

  it('refuses a non-`true` flag value rather than dropping the intent', async () => {
    // Silently ignoring it would answer 200 to a hand-run `?releaseIdentity=1`
    // while deleting the record — an unrecoverable state, since no admin call
    // can free an identity whose clientId no longer exists.
    const { record } = await makeClient('trial');
    const res = await del(record.clientId, '?releaseIdentity=1');
    expect(res.status).toBe(400);
    expect(mockRelease).not.toHaveBeenCalled();
    expect(await getM2mClient(kv, record.clientId)).not.toBeNull();
  });
});
