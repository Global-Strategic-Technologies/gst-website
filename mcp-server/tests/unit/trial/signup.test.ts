/**
 * BL-155 Slice 2 — the mint endpoint, every branch.
 *
 * The `unstable_dev` environment binds no Upstash and cannot intercept the
 * outbound siteverify fetch, so this file is where the mint flow is proved:
 * the house `vi.mock('@upstash/redis')` over a Map that honours NX/EX, a mock
 * KV, and a stubbed global `fetch` scripting Turnstile. The integration test
 * proves the wiring and the fail-closed 503.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { KVNamespace } from '@cloudflare/workers-types';

const { store, redisSet, redisGet, redisDel, redisEval, MockRedis, mockSafeLog } = vi.hoisted(
  () => {
    const store = new Map<string, { value: string; expiresAt: number }>();
    const live = (key: string) => {
      const e = store.get(key);
      if (!e) return null;
      if (e.expiresAt <= Date.now()) {
        store.delete(key);
        return null;
      }
      return e;
    };
    const redisSet = vi.fn(
      async (key: string, value: string, opts?: { nx?: boolean; ex?: number }) => {
        if (opts?.nx && live(key)) return null;
        store.set(key, { value, expiresAt: Date.now() + (opts?.ex ?? 3600) * 1000 });
        return 'OK';
      }
    );
    const redisGet = vi.fn(async (key: string) => live(key)?.value ?? null);
    const redisDel = vi.fn(async (key: string) => (store.delete(key) ? 1 : 0));
    // @upstash/ratelimit's sliding window runs a Lua script via `eval`;
    // scripted per test to allow or deny.
    const redisEval = vi.fn();
    class MockRedis {
      set = redisSet;
      get = redisGet;
      del = redisDel;
      eval = redisEval;
      evalsha = redisEval;
      scriptLoad = vi.fn(async () => 'sha');
    }
    return { store, redisSet, redisGet, redisDel, redisEval, MockRedis, mockSafeLog: vi.fn() };
  }
);

vi.mock('@upstash/redis', () => ({ Redis: MockRedis }));
vi.mock('../../../src/auth/safe-logger', () => ({ safeLog: mockSafeLog }));

import {
  handleTrialSignup,
  TRIAL_IDENTITY_KEY_PREFIX,
  TRIAL_KEY_OWNER,
} from '../../../src/trial/signup';
import { OUTCOME_VALUES } from '../../../src/metrics/_schema';
import { resolveConsentIdentity } from '../../../src/oauth/consent-identity';
import { TURNSTILE_ACTION } from '../../../src/trial/turnstile';
import { TRIAL_SCOPES } from '../../../src/auth/scopes';
import { TRIAL_IDENTITY_TTL_SECONDS, TRIAL_TTL_SECONDS } from '../../../src/ratelimit/tiers';
import {
  getM2mClient,
  listM2mClients,
  splitClientCredential,
  verifyM2mSecret,
} from '../../../src/oauth/m2m-clients';
import type { Env } from '../../../src/env';

const NOW = Date.parse('2026-09-07T12:00:00.000Z');
const IP = '203.0.113.7';
const kvStore = new Map<string, string>();
const kvPuts: unknown[][] = [];
const kv = {
  get: vi.fn(async (key: string) => kvStore.get(key) ?? null),
  put: vi.fn(async (key: string, value: string, options?: unknown) => {
    kvStore.set(key, value);
    kvPuts.push([key, value, options]);
  }),
  delete: vi.fn(async (key: string) => {
    kvStore.delete(key);
  }),
  list: vi.fn(async () => ({ keys: [...kvStore.keys()].map((name) => ({ name })) })),
} as unknown as KVNamespace;

const fetchSpy = vi.fn();

/**
 * BL-155 observability — the AE dataset the handler writes signup outcomes to.
 * Captures the positional data points so a test can assert on the column map
 * rather than on a mock's call arguments.
 */
const aePoints: { blobs: (string | null)[]; doubles: number[]; indexes: string[] }[] = [];
const metricsDataset = {
  writeDataPoint: vi.fn((dp: (typeof aePoints)[number]) => {
    aePoints.push(dp);
  }),
};
/** Blob slots, by name, so the assertions read as fields not indices. */
const signupEvents = () =>
  aePoints
    .filter((dp) => dp.blobs[0] === 'trial_signup')
    .map((dp) => ({
      name: dp.blobs[1],
      keyOwner: dp.blobs[2],
      outcome: dp.blobs[3],
      status_code: dp.blobs[5],
      client_ref: dp.blobs[7],
      index: dp.indexes[0],
    }));

const env = (): Env =>
  ({
    OAUTH_KV: kv,
    TURNSTILE_SECRET_KEY: 'ts-secret',
    TRIAL_IP_HMAC_SECRET: 'hmac-secret',
    TURNSTILE_EXPECTED_HOSTNAMES: 'globalstrategic.tech',
    UPSTASH_MCP_REST_URL: 'https://mcp.upstash.io',
    UPSTASH_MCP_REST_TOKEN: 'rw',
    METRICS: metricsDataset,
  }) as unknown as Env;

const req = (body: unknown = { turnstileToken: 'tok' }, ip: string | null = IP) =>
  new Request('https://mcp.test/trial/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(ip ? { 'CF-Connecting-IP': ip } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const siteverifyOk = () =>
  new Response(
    JSON.stringify({
      success: true,
      hostname: 'globalstrategic.tech',
      action: TURNSTILE_ACTION,
      'error-codes': [],
    }),
    { status: 200 }
  );
/**
 * @upstash/ratelimit's sliding-window Lua returns `[current, previous, success]`
 * where current/previous are flat `[requestId, count, …]` arrays and success is
 * `1` or `null` (verified against the installed dist).
 */
const allow = () => redisEval.mockResolvedValue([[], [], 1]);
const deny = () =>
  redisEval.mockResolvedValue([
    Array.from({ length: 20 }, (_, i) => (i % 2 ? '1' : `r${i}`)),
    [],
    null,
  ]);

const identityKeys = () => [...store.keys()].filter((k) => k.startsWith(TRIAL_IDENTITY_KEY_PREFIX));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  store.clear();
  kvStore.clear();
  kvPuts.length = 0;
  redisSet.mockClear();
  redisGet.mockClear();
  redisDel.mockClear();
  redisEval.mockReset();
  mockSafeLog.mockReset();
  aePoints.length = 0;
  metricsDataset.writeDataPoint.mockClear();
  fetchSpy.mockReset();
  // A fresh Response per call — a body can only be read once.
  fetchSpy.mockImplementation(async () => siteverifyOk());
  vi.stubGlobal('fetch', fetchSpy);
  allow();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('handleTrialSignup — happy path', () => {
  it('mints a bounded trial record, returns the consent-page credential, and remembers the identity for 30 days', async () => {
    const res = await handleTrialSignup(req(), env());
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = (await res.json()) as {
      credential: string;
      clientId: string;
      expiresAt: string;
      reissued: boolean;
    };
    expect(body.reissued).toBe(false);
    expect(body.expiresAt).toBe(new Date(NOW + TRIAL_TTL_SECONDS * 1000).toISOString());

    // Record-level assertions: tier and expiry are what was asked for, not a default.
    const parts = splitClientCredential(body.credential)!;
    expect(parts.clientId).toBe(body.clientId);
    const record = (await getM2mClient(kv, body.clientId))!;
    expect(record.tier).toBe('trial');
    expect(record.name).toBe('trial');
    expect(record.expiresAt).toBe(body.expiresAt);
    expect(record.allowedScopes).toEqual([...TRIAL_SCOPES]);
    expect(await verifyM2mSecret(record, parts.secret)).toBe(true);

    // Identity key overwritten from the lease to minted:<id> at the 30-day TTL.
    const [key] = identityKeys();
    expect(store.get(key!)?.value).toBe(`minted:${body.clientId}`);
    const lastSet = redisSet.mock.calls.at(-1)!;
    expect(lastSet[2]).toEqual({ ex: TRIAL_IDENTITY_TTL_SECONDS });
  });

  it('never logs the IP or its HMAC', async () => {
    await handleTrialSignup(req(), env());
    const [key] = identityKeys();
    const hmac = key!.slice(TRIAL_IDENTITY_KEY_PREFIX.length);
    for (const call of mockSafeLog.mock.calls) {
      const line = JSON.stringify(call[0]);
      expect(line).not.toContain(IP);
      expect(line).not.toContain(hmac);
    }
  });
});

describe('handleTrialSignup — re-issue', () => {
  it('a repeat signup inside the window rotates the secret on the SAME record and slides nothing', async () => {
    const first = (await (await handleTrialSignup(req(), env())).json()) as {
      credential: string;
      clientId: string;
      expiresAt: string;
    };
    const beforePut = kvPuts.at(-1)!;
    const [identityKey] = identityKeys();
    const identityBefore = { ...store.get(identityKey!)! };
    redisSet.mockClear();

    vi.setSystemTime(NOW + 24 * 3600_000);
    const res = await handleTrialSignup(req(), env());
    expect(res.status).toBe(200);
    const second = (await res.json()) as {
      credential: string;
      clientId: string;
      expiresAt: string;
      reissued: boolean;
    };
    expect(second.reissued).toBe(true);
    expect(second.clientId).toBe(first.clientId);
    // The page names when the PREVIOUS secret was issued: the record's mint time.
    expect((second as { issuedAt?: string }).issuedAt).toBe(new Date(NOW).toISOString());
    expect(second.expiresAt).toBe(first.expiresAt);
    expect(second.credential).not.toBe(first.credential);

    const record = (await getM2mClient(kv, first.clientId))!;
    expect(await verifyM2mSecret(record, splitClientCredential(second.credential)!.secret)).toBe(
      true
    );
    expect(await verifyM2mSecret(record, splitClientCredential(first.credential)!.secret)).toBe(
      false
    );
    expect(await listM2mClients(kv)).toHaveLength(1);
    // The reap instant is recomputed from the unchanged expiresAt — identical options.
    expect(kvPuts.at(-1)![2]).toEqual(beforePut[2]);
    // The identity key was probed with SET NX (which lost) and then only read:
    // its value and expiry are exactly what the original mint left.
    expect(redisSet).toHaveBeenCalledTimes(1);
    expect(redisSet.mock.calls[0]![2]).toMatchObject({ nx: true });
    expect(store.get(identityKey!)).toEqual(identityBefore);
  });

  it('a repeat signup after the trial expired (inside the identity window) is refused, naming the issue date', async () => {
    await handleTrialSignup(req(), env());
    vi.setSystemTime(NOW + (TRIAL_TTL_SECONDS + 60) * 1000);
    const res = await handleTrialSignup(req(), env());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: 'trial-expired',
      message: expect.any(String),
      issuedAt: new Date(NOW).toISOString(),
    });
    expect(await listM2mClients(kv)).toHaveLength(1);
  });

  it('a repeat signup whose record has already REAPED is refused without an issue date', async () => {
    const first = (await (await handleTrialSignup(req(), env())).json()) as { clientId: string };
    // KV reaps the record at expiresAt + grace; the identity key may outlive
    // it by a few days. Simulate that window: record gone, identity key live.
    kvStore.clear();
    vi.setSystemTime(NOW + (TRIAL_TTL_SECONDS + 60) * 1000);
    const res = await handleTrialSignup(req(), env());
    expect(res.status).toBe(403);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('trial-expired');
    expect(body).not.toHaveProperty('issuedAt');
    expect(kvStore.has(`mcp:oauth:m2m-client:${first.clientId}`)).toBe(false);
  });

  it('after the identity window lapses, the same identity gets a fresh trial', async () => {
    await handleTrialSignup(req(), env());
    vi.setSystemTime(NOW + (TRIAL_IDENTITY_TTL_SECONDS + 60) * 1000);
    const res = await handleTrialSignup(req(), env());
    expect(res.status).toBe(200);
    expect(await listM2mClients(kv)).toHaveLength(2);
  });
});

describe('handleTrialSignup — ordering and the lease', () => {
  it('limiter runs BEFORE Turnstile: a rate-limited visitor costs no siteverify call', async () => {
    deny();
    const res = await handleTrialSignup(req(), env());
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    // The body mirrors the header — the browser page cannot read Retry-After cross-origin.
    expect(await res.json()).toMatchObject({
      error: 'rate-limited',
      retryAfterSeconds: Number(res.headers.get('Retry-After')),
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(identityKeys()).toHaveLength(0);
  });

  it('a rejected challenge writes nothing', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ success: false, 'error-codes': ['timeout-or-duplicate'] }), {
        status: 200,
      })
    );
    const res = await handleTrialSignup(req(), env());
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'challenge-failed', retryable: true });
    expect(identityKeys()).toHaveLength(0);
    expect(kvPuts).toHaveLength(0);
  });

  it('a concurrent signup from the same identity is a 409 while the lease is live', async () => {
    // Learn this IP's identity key by minting once, then simulate a peer
    // holding a live lease under it.
    await handleTrialSignup(req(), env());
    const [identityKey] = identityKeys();
    store.set(identityKey!, { value: 'lease', expiresAt: Date.now() + 300_000 });
    const res = await handleTrialSignup(req(), env());
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'in-progress', retryAfterSeconds: 5 });
    expect(kvPuts.length).toBe(1); // only the first mint
  });

  it('a lease that expires between the losing SET and the GET is retried once and wins', async () => {
    let calls = 0;
    redisSet.mockImplementationOnce(async () => {
      calls++;
      return null; // lose the first NX
    });
    const res = await handleTrialSignup(req(), env());
    expect(res.status).toBe(200);
    expect(calls).toBe(1);
  });

  it('a mint that fails after the lease is won releases the lease and is a 503', async () => {
    kv.put = vi.fn(async () => {
      throw new Error('kv down');
    });
    const res = await handleTrialSignup(req(), env());
    expect(res.status).toBe(503);
    expect(identityKeys()).toHaveLength(0);
    expect(redisDel).toHaveBeenCalledTimes(1);
    kv.put = vi.fn(async (key: string, value: string, options?: unknown) => {
      kvStore.set(key, value);
      kvPuts.push([key, value, options]);
    });
  });
});

describe('handleTrialSignup — fail closed', () => {
  it.each([
    ['OAUTH_KV unbound', (e: Env) => ({ ...e, OAUTH_KV: undefined })],
    ['Turnstile secret unbound', (e: Env) => ({ ...e, TURNSTILE_SECRET_KEY: undefined })],
    ['IP HMAC secret unbound', (e: Env) => ({ ...e, TRIAL_IP_HMAC_SECRET: undefined })],
    ['expected hostnames unbound', (e: Env) => ({ ...e, TURNSTILE_EXPECTED_HOSTNAMES: '' })],
    ['Upstash unbound', (e: Env) => ({ ...e, UPSTASH_MCP_REST_URL: undefined })],
  ])('%s → 503 with nothing minted and no siteverify call', async (_label, mutate) => {
    const res = await handleTrialSignup(req(), mutate(env()) as Env);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: 'unavailable' });
    expect(kvPuts).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a Redis throw on the lease is a 503, not a proceed', async () => {
    redisSet.mockRejectedValueOnce(new Error('upstash 500'));
    const res = await handleTrialSignup(req(), env());
    expect(res.status).toBe(503);
    expect(kvPuts).toHaveLength(0);
  });

  it('a limiter throw is a 503, not a skip', async () => {
    redisEval.mockRejectedValue(new Error('upstash 500'));
    const res = await handleTrialSignup(req(), env());
    expect(res.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('an unavailable siteverify is a 503 with nothing written', async () => {
    fetchSpy.mockRejectedValue(new TypeError('network'));
    const res = await handleTrialSignup(req(), env());
    expect(res.status).toBe(503);
    expect(identityKeys()).toHaveLength(0);
    expect(kvPuts).toHaveLength(0);
  });
});

describe('handleTrialSignup — request shape', () => {
  it('rejects a malformed body and a missing token', async () => {
    expect((await handleTrialSignup(req('not json'), env())).status).toBe(400);
    expect((await handleTrialSignup(req({}), env())).status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a request with no client address', async () => {
    const res = await handleTrialSignup(req({ turnstileToken: 'tok' }, null), env());
    expect(res.status).toBe(400);
  });
});

/**
 * BL-155 observability. Before these events existed, signup was visible only
 * through `safeLog` — i.e. only while someone held a `wrangler tail` open — so
 * "how many trials were minted last week" and "is signup broken" had no answer
 * after the fact. Each test drives a real branch and asserts the data point it
 * leaves behind, so a branch that stops emitting fails here rather than going
 * quietly unobserved.
 */
describe('handleTrialSignup — AE signup events', () => {
  /** Drives one scenario and returns the single signup event it emitted. */
  const only = () => {
    const events = signupEvents();
    expect(events, 'exactly one signup event per request').toHaveLength(1);
    return events[0];
  };

  it('emits `minted` carrying the new client as its per-client dimension', async () => {
    const res = await handleTrialSignup(req(), env());
    const body = (await res.json()) as { clientId: string };
    expect(only()).toEqual({
      name: 'trial-signup',
      keyOwner: TRIAL_KEY_OWNER,
      outcome: 'minted',
      status_code: '200',
      // The canonical `OAUTH:<clientId>` form — the SAME shape usage events
      // carry, which is the whole point: a mint can be joined to the calls it
      // later produces. A bare `m2m_…` here would silently break that join.
      client_ref: `OAUTH:${body.clientId}`,
      index: TRIAL_KEY_OWNER,
    });
  });

  it('emits `reissued` for a repeat signup, still attributed to the same client', async () => {
    const first = await handleTrialSignup(req(), env());
    const { clientId } = (await first.json()) as { clientId: string };
    aePoints.length = 0;

    await handleTrialSignup(req(), env());
    const event = only();
    expect(event.outcome).toBe('reissued');
    expect(event.client_ref).toBe(`OAUTH:${clientId}`);
  });

  it('emits `expired` WITH the client, since the client is what was refused', async () => {
    const first = await handleTrialSignup(req(), env());
    const { clientId } = (await first.json()) as { clientId: string };
    vi.setSystemTime(NOW + (TRIAL_TTL_SECONDS + 60) * 1000);
    aePoints.length = 0;

    await handleTrialSignup(req(), env());
    const event = only();
    expect(event.outcome).toBe('expired');
    expect(event.status_code).toBe('403');
    expect(event.client_ref).toBe(`OAUTH:${clientId}`);
  });

  it.each([
    ['rate-limited', '429', async () => deny()],
    [
      'challenge-failed',
      '400',
      async () =>
        fetchSpy.mockImplementation(
          async () =>
            new Response(
              JSON.stringify({ success: false, 'error-codes': ['timeout-or-duplicate'] }),
              { status: 200 }
            )
        ),
    ],
    ['unavailable', '503', async () => redisSet.mockRejectedValueOnce(new Error('redis down'))],
  ])('emits `%s` with no client attached', async (outcome, status, arrange) => {
    await arrange();
    await handleTrialSignup(req(), env());
    const event = only();
    expect(event.outcome).toBe(outcome);
    expect(event.status_code).toBe(status);
    // No client exists on any pre-mint failure, so attributing one would be a
    // fabrication — and would pollute `count(DISTINCT blob8)` with phantom trials.
    expect(event.client_ref).toBeNull();
  });

  it('emits `in-progress` when a concurrent signup holds the lease', async () => {
    await redisSet('mcp:trial:ident:x', 'lease', { ex: 300 });
    // Take the lease under the real identity key by running one request that
    // wins it, then re-entering while the lease is still live.
    redisSet.mockImplementationOnce(async () => null);
    redisGet.mockImplementationOnce(async () => 'lease');
    redisSet.mockImplementationOnce(async () => null);
    aePoints.length = 0;

    const res = await handleTrialSignup(req(), env());
    expect(res.status).toBe(409);
    const event = only();
    expect(event.outcome).toBe('in-progress');
    expect(event.client_ref).toBeNull();
  });

  it('emits `bad-request` for a malformed body, a path that was silent in BOTH channels', async () => {
    await handleTrialSignup(req('not json'), env());
    const event = only();
    expect(event.outcome).toBe('bad-request');
    expect(event.status_code).toBe('400');
  });

  it('covers every outcome the schema declares', async () => {
    // The guard rejects an outcome missing from OUTCOME_VALUES, so an emit with
    // a typo'd outcome is silently dropped rather than loud. This asserts the
    // other direction — that the declared set is not aspirational — by running
    // one scenario per value and checking the union.
    const seen = new Set<string | null>();
    const scenarios: (() => Promise<unknown>)[] = [
      async () => handleTrialSignup(req(), env()),
      async () => handleTrialSignup(req(), env()), // re-issue
      async () => handleTrialSignup(req('not json'), env()),
      async () => {
        deny();
        await handleTrialSignup(req(), env());
        allow();
      },
      async () => {
        fetchSpy.mockImplementationOnce(
          async () =>
            new Response(JSON.stringify({ success: false, 'error-codes': [] }), { status: 200 })
        );
        return handleTrialSignup(req(), env());
      },
      async () => {
        redisSet.mockRejectedValueOnce(new Error('down'));
        return handleTrialSignup(req(), env());
      },
      async () => {
        redisSet.mockImplementationOnce(async () => null);
        redisGet.mockImplementationOnce(async () => 'lease');
        redisSet.mockImplementationOnce(async () => null);
        return handleTrialSignup(req(), env());
      },
      async () => {
        vi.setSystemTime(NOW + (TRIAL_TTL_SECONDS + 60) * 1000);
        return handleTrialSignup(req(), env());
      },
    ];
    for (const run of scenarios) await run();
    for (const e of signupEvents()) seen.add(e.outcome);

    expect([...seen].sort()).toEqual([...OUTCOME_VALUES.trial_signup].sort());
  });

  it('emits ONE event when the expired-record lookup fails, not expired + unavailable', async () => {
    // Regression: the `getM2mClient` read that fetches the issue date used to
    // sit inside the caller's try, so a KV throw there turned one refusal into
    // two data points — `expired`, then `unavailable` from the catch. That
    // double-counts precisely the failure the signup-health query watches.
    const first = await handleTrialSignup(req(), env());
    const { clientId } = (await first.json()) as { clientId: string };
    vi.setSystemTime(NOW + (TRIAL_TTL_SECONDS + 60) * 1000);
    aePoints.length = 0;

    // `rotateM2mSecret` reads the record first (and returns null, since it is
    // expired); the date lookup is the SECOND read. Only that one fails here —
    // failing the first would be a different path (a 503, correctly).
    const getMock = kv.get as unknown as ReturnType<typeof vi.fn>;
    getMock
      .mockImplementationOnce(async (key: string) => kvStore.get(key) ?? null)
      .mockRejectedValueOnce(new Error('kv read failed'));

    const res = await handleTrialSignup(req(), env());
    expect(res.status).toBe(403);
    // The visitor loses only the issue date, not the correct refusal.
    expect(await res.json()).not.toHaveProperty('issuedAt');
    const event = only();
    expect(event.outcome).toBe('expired');
    expect(event.client_ref).toBe(`OAUTH:${clientId}`);
  });

  it('still returns 200 when the AE write throws — metrics never break a signup', async () => {
    metricsDataset.writeDataPoint.mockImplementationOnce(() => {
      throw new Error('AE substrate error');
    });
    const res = await handleTrialSignup(req(), env());
    expect(res.status).toBe(200);
    expect(((await res.json()) as { credential: string }).credential).toContain(':');
  });

  it('emits nothing at all when METRICS is unbound (stdio, tests, local dev)', async () => {
    const noMetrics = { ...env(), METRICS: undefined } as unknown as Env;
    const res = await handleTrialSignup(req(), noMetrics);
    expect(res.status).toBe(200);
    expect(aePoints).toHaveLength(0);
  });

  it('lands signup events and usage events under the SAME index value', async () => {
    // The property that matters: a signup event and the trial's later tool
    // calls must share `index1`, or "all trials in one indexed query" quietly
    // dies and the AUTH.md cookbook returns half the truth.
    //
    // Driven through `resolveConsentIdentity` — the real function the auth path
    // calls — rather than by re-deriving with `oauthKeyOwner(keyOwnerFor(…))`.
    // That re-derivation is what the constant already does, so asserting it
    // would only prove the constant equals itself; and `consent-identity.ts`
    // builds its keyOwner as a template literal, so a change to `oauthKeyOwner`
    // would break the join while leaving the re-derived form agreeing.
    const res = await handleTrialSignup(req(), env());
    const body = (await res.json()) as { credential: string; clientId: string };
    expect(only().index).toBe(TRIAL_KEY_OWNER);

    const identity = await resolveConsentIdentity(body.credential, {}, kv);
    expect(identity, 'the minted credential must resolve at the consent page').not.toBeNull();
    expect(identity!.keyOwner).toBe(TRIAL_KEY_OWNER);
    // And the per-client dimension agrees end to end, which is the join.
    expect(identity!.rateLimitSubject).toBe(`OAUTH:${body.clientId}`);
  });
});
