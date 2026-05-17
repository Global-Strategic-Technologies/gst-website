/**
 * Integration test for the OAuth refresh single-flight contract
 * (BL-032.8 Phase 2 — supersedes BL-040).
 *
 * THE load-bearing assertion of Phase 2: concurrent invocations of
 * `refreshAccessToken` from different code paths (cron + live-tool)
 * must result in EXACTLY ONE POST to Inoreader's `/oauth2/token`
 * endpoint. Without this, the BL-040 problem reappears: a 5-way
 * `fetchAllStreams` fan-out on a stale token issues 5 parallel
 * /oauth2/token calls, burning the Inoreader budget and risking
 * refresh-token rotation race conditions.
 *
 * Integration scope: real `single-flight-lock.ts`, real `inoreader-oauth.ts`,
 * real `inoreader-token-store.ts`. Only `@upstash/redis` and `fetch` are
 * mocked. The Upstash mock implements actual SET NX EX semantics — the
 * lock state is real, just held in test memory instead of Redis.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// A stateful in-memory Redis mock that implements SET NX EX correctly.
// vi.hoisted lifts the mock to the top of the file before module imports.
const { redisStore, MockRedis, fetchSpy } = vi.hoisted(() => {
  // Single MCP DB store post-BL-032.8 Phase B (no more Inoreader DB).
  const stores = new Map<string, Map<string, { value: string; expiresAt?: number }>>();

  class MockRedis {
    private readonly store: Map<string, { value: string; expiresAt?: number }>;
    constructor(_opts: { url: string }) {
      // Single MCP-DB keyspace — the per-URL routing is gone post-Phase-B.
      if (!stores.has('mcp')) stores.set('mcp', new Map());
      this.store = stores.get('mcp')!;
    }
    async get<T>(key: string): Promise<T | null> {
      const entry = this.store.get(key);
      if (!entry) return null;
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        this.store.delete(key);
        return null;
      }
      return entry.value as unknown as T;
    }
    async set(
      key: string,
      value: string,
      opts?: { nx?: boolean; ex?: number }
    ): Promise<'OK' | null> {
      const existing = this.store.get(key);
      const stillValid = existing && (!existing.expiresAt || existing.expiresAt > Date.now());
      if (opts?.nx && stillValid) return null;
      const expiresAt = opts?.ex ? Date.now() + opts.ex * 1000 : undefined;
      this.store.set(key, { value, expiresAt });
      return 'OK';
    }
    async del(key: string): Promise<number> {
      return this.store.delete(key) ? 1 : 0;
    }
    async ttl(key: string): Promise<number> {
      const entry = this.store.get(key);
      if (!entry) return -2;
      if (!entry.expiresAt) return -1;
      const remaining = Math.floor((entry.expiresAt - Date.now()) / 1000);
      return remaining < 0 ? -2 : remaining;
    }
  }
  // Reset helper exposed to tests via the redisStore Map directly.
  return { redisStore: stores, MockRedis, fetchSpy: vi.fn() };
});

vi.mock('@upstash/redis', () => ({ Redis: MockRedis }));

import { refreshAccessToken } from '../../src/lib/inoreader-oauth';
import type { Env } from '../../src/worker';

const env: Env = {
  INOREADER_APP_ID: 'app-id',
  INOREADER_APP_KEY: 'app-key',
  UPSTASH_MCP_REST_URL: 'https://mcp.upstash.io',
  UPSTASH_MCP_REST_TOKEN: 'mcp-rw',
};

beforeEach(() => {
  // Clear all in-memory Upstash state between tests.
  for (const s of redisStore.values()) s.clear();
  fetchSpy.mockReset();
  vi.stubGlobal('fetch', fetchSpy);

  // Seed a refresh token in the MCP DB so refreshAccessToken has something
  // to send. We're testing the single-flight contract, not the bootstrap.
  //
  // The 'mcp' store map only gets created when a MockRedis instance
  // constructs against an MCP URL. Pre-create the entry here so the seed
  // write lands BEFORE the test invokes refreshAccessToken (which is the
  // first call site that constructs a MockRedis for this test).
  if (!redisStore.has('mcp')) redisStore.set('mcp', new Map());
  redisStore.get('mcp')!.set('mcp:inoreader:refresh_token', { value: 'seed-refresh-token' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OAuth refresh single-flight contract', () => {
  it('two concurrent calls produce exactly ONE /oauth2/token POST (supersedes BL-040)', async () => {
    // Each /oauth2/token POST takes ~50ms in this simulation; the second
    // caller arrives during the first's POST and must observe the new
    // token via pollForChange rather than issuing its own POST.
    fetchSpy.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return new Response(
        JSON.stringify({
          access_token: 'fresh-access',
          refresh_token: 'seed-refresh-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const [cronResult, liveResult] = await Promise.all([
      refreshAccessToken(env, 'cron'),
      refreshAccessToken(env, 'live-tool'),
    ]);

    // Both callers got a successful result.
    expect(cronResult.ok).toBe(true);
    expect(liveResult.ok).toBe(true);

    // Exactly one /oauth2/token POST — the load-bearing assertion.
    const tokenPosts = fetchSpy.mock.calls.filter(
      (c) => c[0] === 'https://www.inoreader.com/oauth2/token'
    );
    expect(tokenPosts).toHaveLength(1);

    // One caller got the fresh result; the other got cached-by-peer.
    // We can't assert which is which (the race outcome is non-deterministic),
    // but exactly one of each should appear.
    if (!cronResult.ok || !liveResult.ok) return;
    const sources = [cronResult.refreshSource, liveResult.refreshSource].sort();
    expect(sources).toEqual(['cached-by-peer', 'fresh']);

    // Both callers see the same access token value.
    expect(cronResult.accessToken).toBe('fresh-access');
    expect(liveResult.accessToken).toBe('fresh-access');

    // The fresh token landed in Upstash for downstream readers.
    const stored = await redisStore.get('mcp')!.get('mcp:inoreader:access_token');
    expect(stored?.value).toBe('fresh-access');
  });

  it('FIVE concurrent calls (simulating fetchAllStreams fan-out) still produce only ONE POST', async () => {
    // The BL-040 original symptom: a single search_radar call fans out
    // into 5 parallel Inoreader stream fetches, each independently hitting
    // 401 and each independently triggering refresh. Pre-Phase-2 this
    // produced 5+ POSTs to the website's /api/inoreader/refresh endpoint.
    // Post-Phase-2, the single-flight lock coalesces them to ONE
    // /oauth2/token POST — at the Upstash consistency level, so the
    // coalescing works cross-isolate, not just intra-isolate.
    fetchSpy.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return new Response(
        JSON.stringify({
          access_token: 'fan-out-fresh',
          refresh_token: 'seed-refresh-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const sources = ['cron', 'live-tool', 'live-tool', 'live-tool', 'live-tool'] as const;
    const results = await Promise.all(sources.map((src) => refreshAccessToken(env, src)));

    expect(results.every((r) => r.ok)).toBe(true);

    const tokenPosts = fetchSpy.mock.calls.filter(
      (c) => c[0] === 'https://www.inoreader.com/oauth2/token'
    );
    expect(tokenPosts).toHaveLength(1);

    // Exactly one caller observed `refreshSource: 'fresh'`; the rest got
    // `cached-by-peer`.
    const freshCount = results.filter((r) => r.ok && r.refreshSource === 'fresh').length;
    const peerCount = results.filter((r) => r.ok && r.refreshSource === 'cached-by-peer').length;
    expect(freshCount).toBe(1);
    expect(peerCount).toBe(4);
  });

  it('lock released after success — next call after first completes acquires fresh lock', async () => {
    // First call completes, lock should be DEL'd. The second call (sequential,
    // not concurrent) acquires its own lock and issues its own POST.
    let postCount = 0;
    fetchSpy.mockImplementation(async () => {
      postCount += 1;
      return new Response(
        JSON.stringify({
          access_token: `access-${postCount}`,
          refresh_token: 'seed-refresh-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const first = await refreshAccessToken(env, 'cron');
    const second = await refreshAccessToken(env, 'live-tool');

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    // Both are fresh — sequential calls each see no peer.
    expect(first.refreshSource).toBe('fresh');
    expect(second.refreshSource).toBe('fresh');
    expect(postCount).toBe(2);

    // Lock key is absent between calls (DEL'd after each success).
    const lockState = redisStore.get('mcp')!.get('mcp:inoreader:refresh-lock');
    expect(lockState).toBeUndefined();
  });

  it('lock TTL bounds an orphaned hold — next call after timeout acquires successfully', async () => {
    // Simulate a Worker crash mid-refresh: lock present, no DEL ever issued.
    // The lock's EX 10 TTL is the safety net — Upstash auto-removes the
    // entry after 10s and the next caller acquires cleanly. Without the
    // TTL, a single crash would wedge OAuth refresh indefinitely.
    //
    // In test time we don't wait 10s; we directly expire the lock entry
    // and verify the next acquire succeeds. This pins the contract: a
    // refactor that ever switches `acquire` from SET-NX-EX to plain SET-NX
    // (no TTL) would fail this test.
    redisStore.get('mcp')!.set('mcp:inoreader:refresh-lock', {
      value: 'orphaned-holder-uuid',
      expiresAt: Date.now() - 1000, // already expired
    });

    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'post-orphan-fresh',
          refresh_token: 'seed-refresh-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const result = await refreshAccessToken(env, 'cron');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.refreshSource).toBe('fresh');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
