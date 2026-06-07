/**
 * BL-077b — upstash-cache-store error-logging tests.
 *
 * Pre-BL-077b, `CacheStore.set`'s `catch` swallowed the Upstash error
 * silently and returned `false`. Operators saw the downstream symptom
 * (`Bl076BodyCacheMissError` or cache miss) but not the cause (size limit,
 * quota, auth, network). This patch adds one `safeLog` line inside the
 * catch so `wrangler tail` captures the actual Upstash error message.
 *
 * Asserts:
 *   - Successful `set` does NOT emit the failure event.
 *   - When `redis.set` throws, `CacheStore.set` returns `false` AND emits
 *     a `upstash.set.failed` event with the truncated reason + key +
 *     serialized byte length + ttl.
 *   - Error reason is truncated to 300 chars to keep log lines bounded.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockSafeLog, mockRedisSet, createMcpClientMock } = vi.hoisted(() => ({
  mockSafeLog: vi.fn(),
  mockRedisSet: vi.fn(),
  createMcpClientMock: vi.fn(),
}));

vi.mock('../../../src/auth/safe-logger', () => ({
  safeLog: mockSafeLog,
}));

vi.mock('../../../src/lib/upstash-clients', () => ({
  createMcpClient: createMcpClientMock,
}));

import { createCacheStore } from '../../../src/lib/upstash-cache-store';
import type { Env } from '../../../src/worker';

const env: Env = {
  UPSTASH_MCP_REST_URL: 'https://mcp.upstash.io',
  UPSTASH_MCP_REST_TOKEN: 'token',
};

beforeEach(() => {
  mockSafeLog.mockReset();
  mockRedisSet.mockReset();
  createMcpClientMock.mockReset();
  createMcpClientMock.mockReturnValue({
    get: vi.fn(),
    set: mockRedisSet,
    del: vi.fn(),
  });
});

describe('CacheStore.set — BL-077b error logging', () => {
  it('on successful set, does NOT emit upstash.set.failed', async () => {
    mockRedisSet.mockResolvedValue('OK');
    const store = createCacheStore(env);
    expect(store).not.toBeNull();
    const ok = await store!.set('gst-mcp:test:k1', 'body', 3600);
    expect(ok).toBe(true);
    const failureEvents = mockSafeLog.mock.calls.filter(
      (c) => (c[0] as { event?: string }).event === 'upstash.set.failed'
    );
    expect(failureEvents).toHaveLength(0);
  });

  it('on redis.set throwing, returns false AND emits upstash.set.failed with the truncated reason', async () => {
    const upstashErr = new Error('REQUEST_TOO_LARGE: payload exceeds 32 KiB');
    mockRedisSet.mockRejectedValue(upstashErr);
    const store = createCacheStore(env);
    const ok = await store!.set('gst-mcp:irl-body:abc123', 'a-body', 14400);
    expect(ok).toBe(false);
    const failureEvents = mockSafeLog.mock.calls.filter(
      (c) => (c[0] as { event?: string }).event === 'upstash.set.failed'
    );
    expect(failureEvents).toHaveLength(1);
    const ev = failureEvents[0][0] as {
      key: string;
      byteLength: number;
      ttlSeconds: number;
      reason: string;
      success: boolean;
      errorCode: string;
    };
    expect(ev.key).toBe('gst-mcp:irl-body:abc123');
    expect(ev.byteLength).toBeGreaterThan(0); // the JSON-wrapped envelope size
    expect(ev.ttlSeconds).toBe(14400);
    expect(ev.reason).toContain('REQUEST_TOO_LARGE');
    expect(ev.success).toBe(false);
    expect(ev.errorCode).toBe('upstash-set-threw');
  });

  it('truncates the reason to 300 characters', async () => {
    const longMsg = 'x'.repeat(1000);
    mockRedisSet.mockRejectedValue(new Error(longMsg));
    const store = createCacheStore(env);
    await store!.set('k', 'v', 60);
    const ev = mockSafeLog.mock.calls
      .map((c) => c[0] as { event?: string; reason?: string })
      .find((e) => e.event === 'upstash.set.failed');
    expect(ev?.reason).toBeDefined();
    expect(ev!.reason!.length).toBe(300);
  });

  it('handles non-Error throw values gracefully (still logs, still returns false)', async () => {
    mockRedisSet.mockRejectedValue('plain string error');
    const store = createCacheStore(env);
    const ok = await store!.set('k', 'v', 60);
    expect(ok).toBe(false);
    const ev = mockSafeLog.mock.calls
      .map((c) => c[0] as { event?: string; reason?: string })
      .find((e) => e.event === 'upstash.set.failed');
    expect(ev?.reason).toContain('plain string error');
  });

  it('byteLength field reflects the JSON-stringified envelope size (BL-077b diagnostic for size-limit triage)', async () => {
    mockRedisSet.mockRejectedValue(new Error('boom'));
    const store = createCacheStore(env);
    const body = 'x'.repeat(1000); // 1KB body
    await store!.set('k', body, 60);
    const ev = mockSafeLog.mock.calls
      .map((c) => c[0] as { event?: string; byteLength?: number })
      .find((e) => e.event === 'upstash.set.failed');
    // JSON-wrapped: {"storedAt":<ts>,"data":"xxx..."} adds overhead; total > 1000 + envelope.
    expect(ev?.byteLength).toBeGreaterThan(1000);
    expect(ev?.byteLength).toBeLessThan(1500); // sanity ceiling
  });
});
