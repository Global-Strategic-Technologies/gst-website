/**
 * Integration test for the BL-032.8 Phase 2 reactive refresh path on
 * live radar tool calls.
 *
 * Verifies the impl-doc matrix row: "search_radar 401 →
 * refreshAccessToken('live-tool') → retry succeeds (no BL-039 round-trip)"
 *
 * Scope: handleSearchRadar tool handler end-to-end, with real
 * authenticatedFetch, real inoreader-oauth, real inoreader-token-store,
 * real single-flight-lock. Only @upstash/redis and fetch are mocked.
 * This is the highest-fidelity test we can write without standing up a
 * real Inoreader account; it pins the production cascade behavior.
 *
 * Specifically asserts:
 *   - On 401 from Inoreader stream API, refreshAccessToken is invoked
 *     (a /oauth2/token POST appears in fetch calls)
 *   - BL-039 website fallback endpoint is NOT called when primary succeeds
 *   - Retry uses the NEW access token from MCP DB (Authorization header
 *     observed on the second stream call differs from the first)
 *   - search_radar returns a successful result (not the token-stale error
 *     envelope) after the recovery completes
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { redisStore, MockRedis, fetchSpy } = vi.hoisted(() => {
  // Single MCP DB store post-BL-032.8 Phase B.
  const stores = new Map<string, Map<string, { value: string; expiresAt?: number }>>();
  class MockRedis {
    private readonly store: Map<string, { value: string; expiresAt?: number }>;
    constructor(_opts: { url: string }) {
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
  return { redisStore: stores, MockRedis, fetchSpy: vi.fn() };
});

vi.mock('@upstash/redis', () => ({ Redis: MockRedis }));

import { handleSearchRadar } from '../../src/tools/radar-live';
import type { Env } from '../../src/worker';

const BL039_REFRESH_URL = 'https://globalstrategic.tech/api/inoreader/refresh';
const OAUTH_TOKEN_URL = 'https://www.inoreader.com/oauth2/token';

const env: Env = {
  INOREADER_APP_ID: 'app-id',
  INOREADER_APP_KEY: 'app-key',
  UPSTASH_MCP_REST_URL: 'https://mcp.upstash.io',
  UPSTASH_MCP_REST_TOKEN: 'mcp-rw',
};

beforeEach(() => {
  for (const s of redisStore.values()) s.clear();
  fetchSpy.mockReset();
  vi.stubGlobal('fetch', fetchSpy);

  // Seed initial token state in MCP DB. Access token is "stale"; refresh
  // token is valid.
  if (!redisStore.has('mcp')) redisStore.set('mcp', new Map());
  redisStore.get('mcp')!.set('mcp:inoreader:access_token', {
    value: 'stale-access',
    expiresAt: Date.now() + 60_000, // 60s — not expired but Inoreader 401s anyway
  });
  redisStore.get('mcp')!.set('mcp:inoreader:refresh_token', {
    value: 'valid-refresh',
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function streamResponse(items: Array<{ id: string; published: number }>) {
  return jsonResponse({
    direction: 'ltr',
    id: 'test-stream',
    updated: Date.now() / 1000,
    items: items.map((it) => ({
      id: it.id,
      title: `Title ${it.id}`,
      published: it.published,
      origin: { streamId: 's', title: 'src', htmlUrl: 'https://example.com' },
      canonical: [{ href: `https://example.com/${it.id}` }],
      categories: ['user/-/label/GST-PE-MA'],
    })),
  });
}

describe('search_radar token-stale recovery via primary refresh path', () => {
  it('on stream 401 → /oauth2/token POST → retry succeeds, no BL-039 round-trip', async () => {
    // State-machine mock:
    //   - Before /oauth2/token completes, every stream call returns 401.
    //   - After /oauth2/token completes (the refresh path has succeeded),
    //     stream calls return 200 with real content.
    // This is more faithful to production than a "first N calls 401" counter
    // because parallel fan-out fetches may interleave in any order with the
    // retry sequence — the refresh-completion flag is the deterministic
    // boundary.
    let refreshCompleted = false;
    fetchSpy.mockImplementation(async (url: string) => {
      if (url === OAUTH_TOKEN_URL) {
        refreshCompleted = true;
        return jsonResponse({
          access_token: 'fresh-access',
          refresh_token: 'valid-refresh',
          expires_in: 3600,
          token_type: 'Bearer',
        });
      }
      if (url === BL039_REFRESH_URL) {
        // This test asserts BL-039 is NOT called — return an obvious sentinel
        // that would make any test assertion that uses it fail loud.
        throw new Error('BL-039 fallback was invoked but should not have been');
      }
      // Inoreader stream API calls.
      if (!refreshCompleted) {
        return new Response('unauthorized', { status: 401 });
      }
      // Post-refresh: return appropriate content per URL type.
      if (url.includes('tag/list')) {
        return jsonResponse({ tags: [{ id: 'user/-/label/GST-PE-MA' }] });
      }
      if (url.includes('annotated')) {
        return streamResponse([{ id: 'fyi-after-refresh', published: 200 }]);
      }
      return streamResponse([{ id: 'wire-after-refresh', published: 100 }]);
    });

    // handleSearchRadar signature is (env, input).
    const result = await handleSearchRadar(env, {});

    // Tool returned a successful result envelope.
    expect(result.isError).toBeFalsy();

    // Exactly one /oauth2/token POST — single-flight worked.
    const oauthPosts = fetchSpy.mock.calls.filter((c) => c[0] === OAUTH_TOKEN_URL);
    expect(oauthPosts).toHaveLength(1);

    // BL-039 fallback never touched — primary succeeded.
    const bl039Calls = fetchSpy.mock.calls.filter((c) => c[0] === BL039_REFRESH_URL);
    expect(bl039Calls).toHaveLength(0);

    // The retry stream call used the new access token. Find a post-401
    // Inoreader stream call and check its Authorization header.
    const streamCalls = fetchSpy.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('/reader/api/0')
    );
    // The first call's auth was 'Bearer stale-access' (the seeded value);
    // some later call should use 'Bearer fresh-access'.
    const usedFresh = streamCalls.some((c) => {
      const auth = (c[1] as RequestInit | undefined)?.headers as Record<string, string> | undefined;
      return auth?.Authorization === 'Bearer fresh-access';
    });
    expect(usedFresh).toBe(true);

    // The fresh token landed in Upstash for downstream consumers.
    const stored = redisStore.get('mcp')!.get('mcp:inoreader:access_token');
    expect(stored?.value).toBe('fresh-access');
  });
});
