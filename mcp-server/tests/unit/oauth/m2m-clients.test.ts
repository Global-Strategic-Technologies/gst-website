/**
 * BL-155 Slice 1 — the KV reap policy on M2M client records.
 *
 * The integration suite (`tests/integration/oauth-m2m.test.ts`) proves the
 * grant-side behaviour of `expiresAt` through `unstable_dev`, but a Worker
 * fetch cannot observe the options passed to `kv.put`. This file pins the
 * derivation directly: the reap instant is always `expiresAt + grace`, it is
 * recomputed identically on create and on every update (so it cannot slide),
 * and a record with no `expiresAt` is written with no options at all — the
 * same bare `put` every pre-BL-155 caller made.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { KVNamespace } from '@cloudflare/workers-types';
import {
  createM2mClient,
  updateM2mClient,
  M2M_CLIENT_KEY_PREFIX,
  REAP_GRACE_SECONDS,
} from '../../../src/oauth/m2m-clients';

type PutOptions = { expiration?: number; expirationTtl?: number } | undefined;

function mockKv() {
  const store = new Map<string, string>();
  const puts: Array<{ key: string; options: PutOptions }> = [];
  const kv = {
    get: vi.fn(async (key: string, type?: string) => {
      const v = store.get(key) ?? null;
      return type === 'json' && v !== null ? JSON.parse(v) : v;
    }),
    put: vi.fn(async (key: string, value: string, options?: PutOptions) => {
      store.set(key, value);
      puts.push({ key, options });
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  } as unknown as KVNamespace;
  return { kv, puts, store };
}

const NOW = Date.parse('2026-09-06T12:00:00.000Z');
const EXPIRES_AT = '2026-09-09T12:00:00.000Z'; // NOW + 72h
const EXPECTED_REAP_S = Math.floor(Date.parse(EXPIRES_AT) / 1000) + REAP_GRACE_SECONDS;

describe('M2M client reap policy (BL-155)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a record with no expiresAt is written with no options (pre-BL-155 bare put)', async () => {
    const { kv, puts } = mockKv();
    const { record } = await createM2mClient(kv, { name: 'perm', allowedScopes: ['tool:*'] });
    expect(record.expiresAt).toBeUndefined();
    expect(puts).toHaveLength(1);
    expect(puts[0]!.key).toBe(`${M2M_CLIENT_KEY_PREFIX}${record.clientId}`);
    expect(puts[0]!.options).toBeUndefined();
  });

  it('create derives the reap as expiresAt + grace, as an absolute expiration', async () => {
    const { kv, puts } = mockKv();
    await createM2mClient(kv, { name: 'trial', allowedScopes: ['tool:*'], expiresAt: EXPIRES_AT });
    expect(puts[0]!.options).toEqual({ expiration: EXPECTED_REAP_S });
  });

  it('an unrelated PATCH recomputes the same reap instant — it does not slide', async () => {
    const { kv, puts } = mockKv();
    const { record } = await createM2mClient(kv, {
      name: 'trial',
      allowedScopes: ['tool:*'],
      expiresAt: EXPIRES_AT,
    });
    // A day later the operator bumps the tier without touching expiry.
    vi.setSystemTime(NOW + 24 * 60 * 60 * 1000);
    const updated = await updateM2mClient(kv, record.clientId, { tier: 'paid' });
    expect(updated?.expiresAt).toBe(EXPIRES_AT);
    expect(puts).toHaveLength(2);
    expect(puts[1]!.options).toEqual({ expiration: EXPECTED_REAP_S });
  });

  it('clearing expiresAt on conversion also clears the reap', async () => {
    const { kv, puts } = mockKv();
    const { record } = await createM2mClient(kv, {
      name: 'trial',
      allowedScopes: ['tool:*'],
      expiresAt: EXPIRES_AT,
    });
    const updated = await updateM2mClient(kv, record.clientId, { tier: 'paid', expiresAt: null });
    expect(updated?.expiresAt).toBeUndefined();
    expect(updated?.tier).toBe('paid');
    expect(puts[1]!.options).toBeUndefined();
  });

  it('setting a new expiresAt moves the reap with it', async () => {
    const { kv, puts } = mockKv();
    const { record } = await createM2mClient(kv, { name: 'perm', allowedScopes: ['tool:*'] });
    const updated = await updateM2mClient(kv, record.clientId, { expiresAt: EXPIRES_AT });
    expect(updated?.expiresAt).toBe(EXPIRES_AT);
    expect(puts[1]!.options).toEqual({ expiration: EXPECTED_REAP_S });
  });

  it('a reap instant already in the past is floored to KV’s minimum lead, not rejected', async () => {
    // Long-lapsed record edited during support: `expiresAt + grace` is behind
    // us, and KV refuses an `expiration` under 60s ahead. The floor keeps the
    // write valid; the record still reaps, just not retroactively.
    const { kv, puts } = mockKv();
    const longAgo = new Date(NOW - 2 * REAP_GRACE_SECONDS * 1000).toISOString();
    await createM2mClient(kv, { name: 'stale', allowedScopes: ['tool:*'], expiresAt: longAgo });
    const opts = puts[0]!.options as { expiration: number };
    expect(opts.expiration).toBeGreaterThanOrEqual(Math.floor(NOW / 1000) + 60);
  });

  it('update preserves clientId and secretHash and returns null for an unknown client', async () => {
    const { kv } = mockKv();
    const { record } = await createM2mClient(kv, { name: 'keep', allowedScopes: ['tool:*'] });
    const updated = await updateM2mClient(kv, record.clientId, {
      allowedScopes: ['tool:*', 'tool:radar:*'],
    });
    expect(updated?.clientId).toBe(record.clientId);
    expect(updated?.secretHash).toBe(record.secretHash);
    expect(updated?.allowedScopes).toEqual(['tool:*', 'tool:radar:*']);
    expect(await updateM2mClient(kv, 'm2m_missing', { tier: 'paid' })).toBeNull();
  });
});
