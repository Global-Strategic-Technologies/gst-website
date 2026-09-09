/**
 * BL-155 Slice 2b — consent-page identity resolution.
 *
 * Pins: roster first and unchanged; a `<clientId>:<secret>` resolves against
 * KV with tier / expiry / per-client subject and the CONSTANT keyOwner;
 * every failure is the same `null` (no namespace oracle); and the expiry
 * check runs AFTER secret verification (mutation guard for ordering).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { KVNamespace } from '@cloudflare/workers-types';
import { createM2mClient } from '../../../src/oauth/m2m-clients';
import * as m2m from '../../../src/oauth/m2m-clients';
import { resolveConsentIdentity } from '../../../src/oauth/consent-identity';
import { DEFAULT_SCOPES } from '../../../src/auth/scopes';

function mockKv() {
  const store = new Map<string, string>();
  const kv = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  } as unknown as KVNamespace;
  return kv;
}

const NOW = Date.parse('2026-09-06T12:00:00.000Z');
const FUTURE = '2026-09-09T12:00:00.000Z';
const PAST = '2026-09-01T12:00:00.000Z';
const ROSTER_ENV = { MCP_KEY_RP: 'roster-token' };

describe('resolveConsentIdentity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('roster key resolves exactly as before, without touching KV', async () => {
    const kv = mockKv();
    const id = await resolveConsentIdentity('roster-token', ROSTER_ENV, kv);
    expect(id).toEqual({ userId: 'RP', keyOwner: 'OAUTH:RP', scopes: DEFAULT_SCOPES });
    expect(kv.get).not.toHaveBeenCalled();
  });

  it('a trial credential resolves with tier, expiry, per-client subject and the constant keyOwner', async () => {
    const kv = mockKv();
    const { record, clientSecret } = await createM2mClient(kv, {
      name: 'trial',
      allowedScopes: ['tool:*'],
      tier: 'trial',
      expiresAt: FUTURE,
    });
    const id = await resolveConsentIdentity(`${record.clientId}:${clientSecret}`, ROSTER_ENV, kv);
    expect(id).toEqual({
      userId: record.clientId,
      keyOwner: 'OAUTH:M2M:TRIAL',
      scopes: ['tool:*'],
      tier: 'trial',
      expiresAt: FUTURE,
      rateLimitSubject: `OAUTH:${record.clientId}`,
    });
  });

  it('a converted (named, permanent) record carries its own keyOwner and no expiresAt', async () => {
    const kv = mockKv();
    const { record, clientSecret } = await createM2mClient(kv, {
      name: 'acme-pipeline',
      allowedScopes: ['tool:*'],
      tier: 'paid',
    });
    const id = await resolveConsentIdentity(`${record.clientId}:${clientSecret}`, ROSTER_ENV, kv);
    expect(id?.keyOwner).toBe('OAUTH:M2M:ACME-PIPELINE');
    expect(id?.tier).toBe('paid');
    expect(id).not.toHaveProperty('expiresAt');
  });

  it('every failure is the same null — unknown id, wrong secret, expired, malformed, no KV', async () => {
    const kv = mockKv();
    const { record, clientSecret } = await createM2mClient(kv, {
      name: 'trial',
      allowedScopes: ['tool:*'],
      tier: 'trial',
      expiresAt: FUTURE,
    });
    const expired = await createM2mClient(kv, {
      name: 'trial',
      allowedScopes: ['tool:*'],
      tier: 'trial',
      expiresAt: PAST,
    });
    const cases = [
      'm2m_does-not-exist:whatever',
      `${record.clientId}:wrong-secret`,
      `${expired.record.clientId}:${expired.clientSecret}`,
      'not-a-roster-key-and-no-colon',
      `nope_${record.clientId.slice(4)}:${clientSecret}`, // wrong prefix
      'wrong-roster-token',
    ];
    for (const submitted of cases) {
      expect(await resolveConsentIdentity(submitted, ROSTER_ENV, kv)).toBeNull();
    }
    expect(
      await resolveConsentIdentity(`${record.clientId}:${clientSecret}`, ROSTER_ENV, undefined)
    ).toBeNull();
  });

  it('a roster key with malformed _SCOPES fails without consulting KV', async () => {
    const kv = mockKv();
    const env = { MCP_KEY_RP: 'roster-token', MCP_KEY_RP_SCOPES: '{not json' };
    expect(await resolveConsentIdentity('roster-token', env, kv)).toBeNull();
    expect(kv.get).not.toHaveBeenCalled();
  });

  it('verifies the secret BEFORE checking expiry (an expired record still gets a verify call)', async () => {
    const kv = mockKv();
    const expired = await createM2mClient(kv, {
      name: 'trial',
      allowedScopes: ['tool:*'],
      tier: 'trial',
      expiresAt: PAST,
    });
    const verify = vi.spyOn(m2m, 'verifyM2mSecret');
    expect(
      await resolveConsentIdentity(
        `${expired.record.clientId}:${expired.clientSecret}`,
        ROSTER_ENV,
        kv
      )
    ).toBeNull();
    expect(verify).toHaveBeenCalledTimes(1);
  });
});
