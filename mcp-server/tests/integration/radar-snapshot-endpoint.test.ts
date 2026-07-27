/**
 * Integration tests for GET /radar/snapshot (BL-032.8 Phase 3).
 *
 * Verifies the impl-doc matrix rows:
 *   - GET /radar/snapshot with valid MCP_KEY_WEBSITE_RADAR returns 200 + JSON
 *   - GET /radar/snapshot without bearer returns 401
 *   - GET /radar/snapshot with bearer lacking resource:radar:read returns 403
 *   - GET /radar/snapshot CORS preflight returns 204 with allow-origin header
 *
 * Scope: invokes the Worker's default-export fetch handler directly with
 * a Request + Env (no wrangler.unstable_dev boot). The radar-live-store
 * is mocked so the happy path doesn't reach Inoreader; everything else
 * is real (auth, scope check, CORS, rate-limit-skip-on-no-Upstash).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Two Cloudflare-runtime modules use the `cloudflare:workers` / `cloudflare:email`
// URL schemes which the Node ESM loader can't resolve. Mock them so importing
// worker.ts doesn't crash. Neither real-Sentry nor real-MCP-RPC behavior is
// under test here — withSentry is a passthrough wrapper, and our endpoint
// fetches don't go through createMcpHandler.
vi.mock('@sentry/cloudflare', () => ({
  init: vi.fn(),
  captureMessage: vi.fn(),
  captureException: vi.fn(),
  setTag: vi.fn(),
  withSentry: (_opts: unknown, handler: unknown) => handler,
}));
vi.mock('agents/mcp', () => ({
  createMcpHandler: () => async () =>
    new Response('{"error":"mcp-mocked-in-this-test"}', { status: 501 }),
}));
// workers-oauth-provider imports `cloudflare:workers`, which the Node
// vitest pool can't resolve; these tests exercise the static-key path
// only, so the OAuth sub-router is a inert stub (never reached — static
// auth returns before any provider delegation).
vi.mock('@cloudflare/workers-oauth-provider', () => ({
  OAuthProvider: class {
    fetch = async () => new Response('{"error":"invalid_token"}', { status: 401 });
  },
}));

// Mock the radar-live-store so the happy-path test doesn't need to spin
// up a real Inoreader call chain. The 401/403/CORS paths never reach the
// store, so they're unaffected.
const { mockReadWire, mockReadFyi, mockReadWireCached, mockReadFyiCached } = vi.hoisted(() => ({
  mockReadWire: vi.fn(),
  mockReadFyi: vi.fn(),
  mockReadWireCached: vi.fn(),
  mockReadFyiCached: vi.fn(),
}));
vi.mock('../../src/content/radar-live-store', () => ({
  readWireLive: mockReadWire,
  readFyiLive: mockReadFyi,
  // BL-091 — the endpoint switches to these while the breaker is open. They
  // must exist on the mock or the handler calls `undefined`.
  readWireCached: mockReadWireCached,
  readFyiCached: mockReadFyiCached,
}));

// BL-091 — mock the circuit breaker directly. Seeding `redisGet` cannot work
// here: this suite binds no UPSTASH_* creds, so `createMcpClient` returns null
// and `isCircuitOpen` fails open regardless of what Redis would say. (Pattern
// borrowed from tests/unit/cron/radar-refresh.test.ts.)
const { mockIsCircuitOpen, mockHandleInoreaderFailure } = vi.hoisted(() => ({
  mockIsCircuitOpen: vi.fn(),
  mockHandleInoreaderFailure: vi.fn(),
}));
vi.mock('../../src/ratelimit/circuit-breaker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/ratelimit/circuit-breaker')>()),
  isCircuitOpen: mockIsCircuitOpen,
}));
vi.mock('../../src/lib/inoreader-failure-handler', () => ({
  handleInoreaderFailure: mockHandleInoreaderFailure,
}));

// @upstash/redis is also mocked so the rate-limit + circuit-breaker
// substrates don't blow up on missing creds during these tests.
const { redisGet, MockRedis } = vi.hoisted(() => {
  const redisGet = vi.fn();
  class MockRedis {
    get = redisGet;
    set = vi.fn();
    del = vi.fn();
    ttl = vi.fn();
  }
  return { redisGet, MockRedis };
});
vi.mock('@upstash/redis', () => ({ Redis: MockRedis }));

import worker from '../../src/worker';
import type { Env } from '../../src/worker';

const FULL_KEY = 'test-full-token';
const NARROW_KEY = 'test-narrow-token';
const TOOL_ONLY_KEY = 'test-tool-only-token';

const baseEnv: Env = {
  MCP_KEY_RP: FULL_KEY, // full DEFAULT_SCOPES
  MCP_KEY_WEBSITE_RADAR: NARROW_KEY,
  MCP_KEY_WEBSITE_RADAR_SCOPES: JSON.stringify(['resource:radar:read']),
  // A key that has tool:* only — NO resource:radar:read. Verifies that
  // the scope check rejects DEFAULT_SCOPES-subset keys lacking the
  // specific scope.
  MCP_KEY_TOOL_USER: TOOL_ONLY_KEY,
  MCP_KEY_TOOL_USER_SCOPES: JSON.stringify(['tool:*']),
};

beforeEach(() => {
  mockReadWire.mockReset();
  mockReadFyi.mockReset();
  mockReadWireCached.mockReset();
  mockReadFyiCached.mockReset();
  mockIsCircuitOpen.mockReset();
  mockHandleInoreaderFailure.mockReset();
  redisGet.mockReset();
  // Default: breaker closed (null = no signal → fail open), matching the
  // pre-BL-091 behavior every existing test in this file assumes.
  mockIsCircuitOpen.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function snapshotRequest(
  opts: { bearer?: string; method?: string; origin?: string } = {}
): Request<unknown, IncomingRequestCfProperties<unknown>> {
  const headers = new Headers();
  if (opts.bearer) headers.set('Authorization', `Bearer ${opts.bearer}`);
  if (opts.origin) headers.set('Origin', opts.origin);
  // Manually-constructed Requests don't carry edge-only `cf` properties;
  // cast to the richer IncomingRequestCfProperties shape that `worker.fetch`
  // expects. This is the standard test-side workaround for the Cloudflare
  // `@cloudflare/workerd` types tightening (visible after the qs audit-fix
  // bumped workerd 1.20260515 -> 1.20260521).
  return new Request('https://mcp.globalstrategic.tech/radar/snapshot', {
    method: opts.method ?? 'GET',
    headers,
  }) as unknown as Request<unknown, IncomingRequestCfProperties<unknown>>;
}

// Minimal ExecutionContext stub. As of BL-091 the /radar/snapshot path DOES
// use `ctx.waitUntil` — to fire the breaker-opening `handleInoreaderFailure`
// off the response path — so the no-op stub here is load-bearing for those
// tests (the handler is asserted via its mock, not via the promise).
const stubCtx = {
  waitUntil: () => undefined,
  passThroughOnException: () => undefined,
} as unknown as ExecutionContext;

describe('GET /radar/snapshot — happy path', () => {
  it('returns 200 + { wire, fyi, fetchedAt } for a narrow-scope bearer', async () => {
    mockReadWire.mockResolvedValue({
      ok: true,
      tier: 'wire',
      items: [{ id: 'wire-1', title: 'W1' }],
      fetchedAt: '2026-05-17T10:00:00Z',
      cacheHit: false,
    });
    mockReadFyi.mockResolvedValue({
      ok: true,
      tier: 'fyi',
      items: [{ id: 'fyi-1', title: 'F1' }],
      fetchedAt: '2026-05-17T10:00:00Z',
      cacheHit: false,
    });

    const res = await worker.fetch!(snapshotRequest({ bearer: NARROW_KEY }), baseEnv, stubCtx);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    const body = (await res.json()) as { wire: unknown; fyi: unknown; fetchedAt: string };
    expect(body.wire).toMatchObject({ ok: true, tier: 'wire' });
    expect(body.fyi).toMatchObject({ ok: true, tier: 'fyi' });
    expect(body.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('works with a full DEFAULT_SCOPES bearer too (narrow scope is a subset, not a replacement)', async () => {
    mockReadWire.mockResolvedValue({
      ok: true,
      tier: 'wire',
      items: [],
      fetchedAt: '2026-05-17T10:00:00Z',
      cacheHit: true,
    });
    mockReadFyi.mockResolvedValue({
      ok: true,
      tier: 'fyi',
      items: [],
      fetchedAt: '2026-05-17T10:00:00Z',
      cacheHit: true,
    });

    const res = await worker.fetch!(snapshotRequest({ bearer: FULL_KEY }), baseEnv, stubCtx);

    expect(res.status).toBe(200);
  });
});

describe('GET /radar/snapshot — circuit breaker (BL-091)', () => {
  it('serves cache-only and makes NO live call while the breaker is open', async () => {
    mockIsCircuitOpen.mockResolvedValue({
      open: true,
      retryAfterSeconds: 3600,
      reason: 'inoreader-429-cron-wire',
    });
    mockReadWireCached.mockResolvedValue({
      ok: true,
      tier: 'wire',
      items: [{ id: 'cached-wire' }],
      fetchedAt: '2026-05-17T10:00:00Z',
      cacheHit: true,
    });
    mockReadFyiCached.mockResolvedValue({
      ok: false,
      status: 503,
      reason: 'cache-empty',
      message: 'no cached fyi',
    });

    const res = await worker.fetch!(snapshotRequest({ bearer: NARROW_KEY }), baseEnv, stubCtx);

    // Stays 200 — the website only checks `res.ok`; a 5xx would blank /hub/radar.
    expect(res.status).toBe(200);
    const body = (await res.json()) as { degraded: boolean; retryAfterSeconds?: number };
    expect(body.degraded).toBe(true);
    expect(body.retryAfterSeconds).toBe(3600);
    // The budget-leak fix: the fetch-capable readers are never invoked.
    expect(mockReadWire).not.toHaveBeenCalled();
    expect(mockReadFyi).not.toHaveBeenCalled();
    expect(mockReadWireCached).toHaveBeenCalled();
  });

  it('uses the live readers and reports degraded=false when the breaker is closed', async () => {
    mockIsCircuitOpen.mockResolvedValue({ open: false });
    mockReadWire.mockResolvedValue({
      ok: true,
      tier: 'wire',
      items: [],
      fetchedAt: '2026-05-17T10:00:00Z',
      cacheHit: false,
    });
    mockReadFyi.mockResolvedValue({
      ok: true,
      tier: 'fyi',
      items: [],
      fetchedAt: '2026-05-17T10:00:00Z',
      cacheHit: false,
    });

    const res = await worker.fetch!(snapshotRequest({ bearer: NARROW_KEY }), baseEnv, stubCtx);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { degraded: boolean };
    expect(body.degraded).toBe(false);
    expect(mockReadWireCached).not.toHaveBeenCalled();
  });

  it('opens the breaker on a 429 from the SSR path (BL-091 — was previously the one surface that could not)', async () => {
    mockIsCircuitOpen.mockResolvedValue({ open: false });
    mockReadWire.mockResolvedValue({
      ok: false,
      status: 429,
      reason: 'inoreader-rate-limit',
      message: 'rate limited',
    });
    mockReadFyi.mockResolvedValue({
      ok: true,
      tier: 'fyi',
      items: [],
      fetchedAt: '2026-05-17T10:00:00Z',
      cacheHit: false,
    });

    const res = await worker.fetch!(snapshotRequest({ bearer: NARROW_KEY }), baseEnv, stubCtx);

    expect(res.status).toBe(200);
    expect(mockHandleInoreaderFailure).toHaveBeenCalledTimes(1);
    expect(mockHandleInoreaderFailure.mock.calls[0]?.[2]).toBe('http-radar-snapshot');
  });

  it('does NOT route non-429 tier failures to the breaker handler', async () => {
    mockIsCircuitOpen.mockResolvedValue({ open: false });
    mockReadWire.mockResolvedValue({
      ok: false,
      status: 401,
      reason: 'token-stale',
      message: 'stale',
    });
    mockReadFyi.mockResolvedValue({
      ok: true,
      tier: 'fyi',
      items: [],
      fetchedAt: '2026-05-17T10:00:00Z',
      cacheHit: false,
    });

    await worker.fetch!(snapshotRequest({ bearer: NARROW_KEY }), baseEnv, stubCtx);

    expect(mockHandleInoreaderFailure).not.toHaveBeenCalled();
  });
});

describe('GET /radar/snapshot — auth + scope rejection', () => {
  it('without Authorization header returns 401', async () => {
    const res = await worker.fetch!(snapshotRequest({}), baseEnv, stubCtx);
    expect(res.status).toBe(401);
    // Handler must NOT have invoked the live-store; we should bail at auth.
    expect(mockReadWire).not.toHaveBeenCalled();
    expect(mockReadFyi).not.toHaveBeenCalled();
  });

  it('with wrong bearer token returns 401', async () => {
    const res = await worker.fetch!(snapshotRequest({ bearer: 'wrong-token' }), baseEnv, stubCtx);
    expect(res.status).toBe(401);
  });

  it('with bearer lacking resource:radar:read returns 403 with missingScope envelope', async () => {
    // TOOL_ONLY_KEY carries `tool:*` only — auth passes, but the scope
    // check inside the /radar/snapshot handler rejects.
    const res = await worker.fetch!(snapshotRequest({ bearer: TOOL_ONLY_KEY }), baseEnv, stubCtx);
    expect(res.status).toBe(403);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    const body = (await res.json()) as {
      error: string;
      missingScope: string;
      ownedScopes: string[];
    };
    expect(body.error).toBe('forbidden');
    expect(body.missingScope).toBe('resource:radar:read');
    expect(body.ownedScopes).toContain('tool:*');
    // Handler must NOT have invoked the live-store on scope reject.
    expect(mockReadWire).not.toHaveBeenCalled();
    expect(mockReadFyi).not.toHaveBeenCalled();
  });
});

describe('GET /radar/snapshot — CORS', () => {
  it('OPTIONS preflight returns 204 with allow-origin headers', async () => {
    const headers = new Headers({
      Origin: 'https://globalstrategic.tech',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization',
    });
    // Cast for the same reason as `snapshotRequest` above —
    // manually-constructed Requests don't carry edge-only `cf` properties.
    const preflight = new Request('https://mcp.globalstrategic.tech/radar/snapshot', {
      method: 'OPTIONS',
      headers,
    }) as unknown as Request<unknown, IncomingRequestCfProperties<unknown>>;

    const res = await worker.fetch!(preflight, baseEnv, stubCtx);

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
    // Preflight must NOT invoke auth or the live-store.
    expect(mockReadWire).not.toHaveBeenCalled();
    expect(mockReadFyi).not.toHaveBeenCalled();
  });

  it('200 response carries CORS allow-origin so browser SSR fetches succeed', async () => {
    mockReadWire.mockResolvedValue({
      ok: true,
      tier: 'wire',
      items: [],
      fetchedAt: '2026-05-17T10:00:00Z',
      cacheHit: true,
    });
    mockReadFyi.mockResolvedValue({
      ok: true,
      tier: 'fyi',
      items: [],
      fetchedAt: '2026-05-17T10:00:00Z',
      cacheHit: true,
    });

    const res = await worker.fetch!(
      snapshotRequest({ bearer: NARROW_KEY, origin: 'https://globalstrategic.tech' }),
      baseEnv,
      stubCtx
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
  });

  it('403 response also carries CORS allow-origin so browser sees the structured error', async () => {
    const res = await worker.fetch!(
      snapshotRequest({ bearer: TOOL_ONLY_KEY, origin: 'https://globalstrategic.tech' }),
      baseEnv,
      stubCtx
    );

    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
  });
});
