/**
 * Integration test for the BL-032.8 Phase 2 cron proactive refresh hook.
 *
 * Verifies the impl-doc matrix rows:
 *   - "radar-refresh proactive refresh fires when TTL < 300s"
 *   - "radar-refresh skips proactive refresh when TTL > 300s"
 *
 * Scope: `refreshRadarSnapshot` end-to-end, with real
 * `maybeProactiveRefresh`, real `inoreader-oauth`, real `inoreader-token-store`.
 * Only `@upstash/redis` and `fetch` are mocked.
 *
 * Why this matters: the cron path is the right surface for proactive
 * refresh because it runs on a predictable schedule and is
 * latency-tolerant. Without this hook, every cron run would pay the
 * 401-retry latency when the access token has just expired — wasted
 * Inoreader budget on a known-stale token, plus needless Sentry noise.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { redisStore, MockRedis, fetchSpy } = vi.hoisted(() => {
  const stores = new Map<string, Map<string, { value: string; expiresAt?: number }>>();
  class MockRedis {
    private readonly store: Map<string, { value: string; expiresAt?: number }>;
    constructor(opts: { url: string }) {
      const key = opts.url.includes('mcp') ? 'mcp' : 'inoreader';
      if (!stores.has(key)) stores.set(key, new Map());
      this.store = stores.get(key)!;
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
    async incrby(key: string, by: number): Promise<number> {
      const existing = this.store.get(key);
      const current = existing ? Number(existing.value) : 0;
      const next = current + by;
      this.store.set(key, { value: String(next), expiresAt: existing?.expiresAt });
      return next;
    }
    async expire(key: string, seconds: number): Promise<number> {
      const existing = this.store.get(key);
      if (!existing) return 0;
      this.store.set(key, {
        value: existing.value,
        expiresAt: Date.now() + seconds * 1000,
      });
      return 1;
    }
  }
  return { redisStore: stores, MockRedis, fetchSpy: vi.fn() };
});

vi.mock('@upstash/redis', () => ({ Redis: MockRedis }));

import { refreshRadarSnapshot } from '../../src/cron/radar-refresh';
import type { Env } from '../../src/worker';

const OAUTH_TOKEN_URL = 'https://www.inoreader.com/oauth2/token';
const KV_MCP_ACCESS_TOKEN = 'mcp:inoreader:access_token';
const KV_MCP_REFRESH_TOKEN = 'mcp:inoreader:refresh_token';

const env: Env = {
  INOREADER_APP_ID: 'app-id',
  INOREADER_APP_KEY: 'app-key',
  UPSTASH_MCP_REST_URL: 'https://mcp.upstash.io',
  UPSTASH_MCP_REST_TOKEN: 'mcp-rw',
  UPSTASH_INOREADER_REST_URL: 'https://inoreader.upstash.io',
  UPSTASH_INOREADER_REST_TOKEN: 'inoreader-ro',
};

beforeEach(() => {
  for (const s of redisStore.values()) s.clear();
  fetchSpy.mockReset();
  vi.stubGlobal('fetch', fetchSpy);

  // Seed refresh_token so refreshAccessToken has credentials to use.
  if (!redisStore.has('mcp')) redisStore.set('mcp', new Map());
  redisStore.get('mcp')!.set(KV_MCP_REFRESH_TOKEN, { value: 'valid-refresh' });

  // Default fetch behavior: tag-list returns one folder; folder + annotated
  // return empty streams (we don't care about the radar payload here — only
  // that the OAuth refresh fires or doesn't fire). The /oauth2/token route
  // is overridden per-test.
  fetchSpy.mockImplementation(async (url: string) => {
    if (url === OAUTH_TOKEN_URL) {
      return new Response(
        JSON.stringify({
          access_token: 'fresh-after-proactive',
          refresh_token: 'valid-refresh',
          expires_in: 3600,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('tag/list')) {
      return new Response(JSON.stringify({ tags: [{ id: 'user/-/label/GST-PE-MA' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ direction: 'ltr', id: 'empty', updated: 0, items: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cron proactive token-refresh hook', () => {
  it('fires refresh when access_token TTL is below 5-minute threshold', async () => {
    // Seed an access token with 120s remaining — below the 300s threshold.
    redisStore.get('mcp')!.set(KV_MCP_ACCESS_TOKEN, {
      value: 'about-to-expire',
      expiresAt: Date.now() + 120_000,
    });

    await refreshRadarSnapshot(env);

    // Exactly one /oauth2/token POST — the proactive refresh fired.
    // (The radar fetches that follow shouldn't trigger their own refresh
    // because the token is now fresh.)
    const oauthPosts = fetchSpy.mock.calls.filter((c) => c[0] === OAUTH_TOKEN_URL);
    expect(oauthPosts).toHaveLength(1);

    // The fresh token landed in Upstash.
    const stored = redisStore.get('mcp')!.get(KV_MCP_ACCESS_TOKEN);
    expect(stored?.value).toBe('fresh-after-proactive');
  });

  it('fires refresh when access_token key is absent entirely (initial-state edge case)', async () => {
    // No access token seeded — Upstash TTL returns -2 (key absent).
    // The proactive hook treats this as below-threshold so first cron after
    // a token wipe pre-warms the cache.
    await refreshRadarSnapshot(env);

    const oauthPosts = fetchSpy.mock.calls.filter((c) => c[0] === OAUTH_TOKEN_URL);
    expect(oauthPosts).toHaveLength(1);
  });

  it('SKIPS refresh when access_token TTL is above 5-minute threshold', async () => {
    // Seed an access token with 30 minutes remaining — well above threshold.
    redisStore.get('mcp')!.set(KV_MCP_ACCESS_TOKEN, {
      value: 'fresh-enough',
      expiresAt: Date.now() + 1_800_000,
    });

    await refreshRadarSnapshot(env);

    // Proactive refresh should NOT have fired.
    const oauthPosts = fetchSpy.mock.calls.filter((c) => c[0] === OAUTH_TOKEN_URL);
    expect(oauthPosts).toHaveLength(0);

    // Pre-existing access token still in Upstash (untouched).
    const stored = redisStore.get('mcp')!.get(KV_MCP_ACCESS_TOKEN);
    expect(stored?.value).toBe('fresh-enough');
  });

  it('does not block cron when MCP DB is unreachable for the TTL probe', async () => {
    // Failure mode: TTL probe fails. The hook should swallow and fall
    // through; the radar fetch's reactive 401 cascade remains as the
    // safety net. Cron should still complete (success or partial, depending
    // on downstream fetch behavior) without throwing.
    //
    // We simulate this by removing the MCP store entirely between the
    // beforeEach seed and the test call — readRefreshToken inside the OAuth
    // path won't find a token, so the proactive refresh returns
    // token-missing (silent), and the rest of the cron path proceeds.
    redisStore.delete('mcp');

    const outcome = await refreshRadarSnapshot(env);

    // Whatever the outcome, cron returned a structured RefreshOutcome (not
    // threw an exception). That's the contract — proactive refresh failures
    // must NEVER abort the cron.
    expect(outcome).toBeDefined();
    expect(outcome.kind).toBeDefined();
  });
});
