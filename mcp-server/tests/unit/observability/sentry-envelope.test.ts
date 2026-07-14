/**
 * Unit tests for the direct Sentry envelope POST helpers (BL-032.76).
 *
 * These exercise the helpers in isolation — no `@sentry/cloudflare` SDK
 * is loaded, no Workers runtime; just `fetch` mocked at the global level
 * to inspect the envelope shape.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseDsn,
  postSentryEvent,
  postSentryCheckIn,
  captureMessageEnvelope,
} from '../../../src/observability/sentry-envelope';
import { createMcpClient } from '../../../src/lib/upstash-clients';
import type { Env } from '../../../src/worker';

// The BL-032.75 envelope day-counters route through createMcpClient. Mock
// the factory so counter writes never share the global fetch mock the
// envelope-shape assertions inspect; the counter-specific describe block
// below swaps in a stub client per-test.
vi.mock('../../../src/lib/upstash-clients', () => ({
  createMcpClient: vi.fn(() => null),
}));
const createMcpClientMock = vi.mocked(createMcpClient);

const FAKE_DSN =
  'https://18b0d78cb4cbff2cbee5da2ae86c3e5e@o4511195716386816.ingest.us.sentry.io/4511343962357760';
const env = {
  SENTRY_DSN: FAKE_DSN,
  UPSTASH_MCP_REST_URL: 'https://mcp.upstash.io',
  UPSTASH_MCP_REST_TOKEN: 'token',
} as unknown as Env;

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('parseDsn', () => {
  it('parses a valid DSN into host / projectId / publicKey', () => {
    expect(parseDsn(FAKE_DSN)).toEqual({
      publicKey: '18b0d78cb4cbff2cbee5da2ae86c3e5e',
      host: 'o4511195716386816.ingest.us.sentry.io',
      projectId: '4511343962357760',
    });
  });

  it('returns null for undefined', () => {
    expect(parseDsn(undefined)).toBeNull();
  });

  it('returns null for an empty string', () => {
    // Distinct from undefined — wrangler can bind a secret to '' and we
    // must short-circuit identically rather than pass the empty key
    // through to fetch.
    expect(parseDsn('')).toBeNull();
  });

  it('returns null for malformed input (missing scheme)', () => {
    expect(parseDsn('foo@example.com/123')).toBeNull();
  });

  it('returns null when project id is non-numeric', () => {
    expect(parseDsn('https://abc@host/notanumber')).toBeNull();
  });

  it('returns null when a path suffix follows the project id', () => {
    expect(parseDsn('https://abc@host/123/extra')).toBeNull();
  });
});

describe('postSentryEvent', () => {
  it('POSTs an envelope to /api/<projectId>/envelope/ with correct headers + body shape', async () => {
    await postSentryEvent(env, {
      level: 'error',
      message: 'cron.radar-refresh.error: boom',
      tags: { event: 'cron.scheduled', cron: '0 */6 * * *' },
      extra: { source: 'cron.scheduled' },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(
      'https://o4511195716386816.ingest.us.sentry.io/api/4511343962357760/envelope/'
    );
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/x-sentry-envelope',
      'X-Sentry-Auth': expect.stringContaining(
        'Sentry sentry_version=7,sentry_key=18b0d78cb4cbff2cbee5da2ae86c3e5e,sentry_client='
      ),
    });

    const parts = (init.body as string).split('\n');
    expect(parts).toHaveLength(3);
    const [headerRaw, itemHeaderRaw, payloadRaw] = parts;
    const header = JSON.parse(headerRaw);
    const itemHeader = JSON.parse(itemHeaderRaw);
    const payload = JSON.parse(payloadRaw);
    expect(header).toMatchObject({
      event_id: expect.stringMatching(/^[a-f0-9]{32}$/),
      sent_at: expect.any(String),
    });
    expect(itemHeader).toEqual({ type: 'event' });
    expect(payload).toMatchObject({
      event_id: header.event_id,
      platform: 'javascript',
      level: 'error',
      message: 'cron.radar-refresh.error: boom',
      tags: { event: 'cron.scheduled', cron: '0 */6 * * *' },
      extra: { source: 'cron.scheduled' },
    });
    // Default env has no SENTRY_RELEASE — must not surface a stray
    // `release: undefined` field that would be sent to Sentry as the
    // literal string "undefined".
    expect(payload).not.toHaveProperty('release');
  });

  it('includes release when SENTRY_RELEASE is bound', async () => {
    const envWithRelease = { ...env, SENTRY_RELEASE: 'abc1234' } as unknown as Env;
    await postSentryEvent(envWithRelease, { level: 'info', message: 'hi' });

    const payload = JSON.parse((fetchSpy.mock.calls[0]![1].body as string).split('\n')[2]);
    expect(payload.release).toBe('abc1234');
  });

  it('does NOT POST when SENTRY_DSN is unbound', async () => {
    await postSentryEvent({} as Env, { level: 'info', message: 'hi' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('swallows fetch rejections without throwing', async () => {
    fetchSpy.mockRejectedValue(new Error('network unreachable'));
    await expect(
      postSentryEvent(env, { level: 'error', message: 'should not throw' })
    ).resolves.toBeUndefined();
  });

  it('aborts after the 2000ms timeout when Sentry hangs', async () => {
    // Construct a fetch that never resolves naturally — it must be
    // aborted by the helper's AbortController.
    let abortedSignal: AbortSignal | undefined;
    fetchSpy.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          abortedSignal = init.signal!;
          init.signal!.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );

    vi.useFakeTimers();
    const pending = postSentryEvent(env, { level: 'error', message: 'slow ingest' });
    await vi.advanceTimersByTimeAsync(2000);
    await expect(pending).resolves.toBeUndefined();
    expect(abortedSignal!.aborted).toBe(true);
  });
});

describe('postSentryCheckIn', () => {
  it('in_progress check-in includes monitor_config and returns a fresh id', async () => {
    const id = await postSentryCheckIn(env, 'radar-refresh', 'in_progress', '0 */6 * * *');

    expect(id).toMatch(/^[a-f0-9]{32}$/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const parts = (fetchSpy.mock.calls[0]![1].body as string).split('\n');
    expect(JSON.parse(parts[1])).toEqual({ type: 'check_in' });
    const checkIn = JSON.parse(parts[2]);
    expect(checkIn).toMatchObject({
      check_in_id: id,
      monitor_slug: 'radar-refresh',
      status: 'in_progress',
      monitor_config: {
        schedule: { type: 'crontab', value: '0 */6 * * *' },
        timezone: 'UTC',
      },
    });
  });

  it('ok check-in REUSES the passed checkInId and OMITS monitor_config', async () => {
    const id = 'a'.repeat(32);
    const returned = await postSentryCheckIn(env, 'radar-refresh', 'ok', '0 */6 * * *', id);

    expect(returned).toBe(id);
    const checkIn = JSON.parse((fetchSpy.mock.calls[0]![1].body as string).split('\n')[2]);
    expect(checkIn).toMatchObject({
      check_in_id: id,
      monitor_slug: 'radar-refresh',
      status: 'ok',
    });
    expect(checkIn).not.toHaveProperty('monitor_config');
  });

  it('error check-in REUSES the passed checkInId and OMITS monitor_config', async () => {
    const id = 'b'.repeat(32);
    await postSentryCheckIn(env, 'radar-refresh', 'error', '0 */6 * * *', id);

    const checkIn = JSON.parse((fetchSpy.mock.calls[0]![1].body as string).split('\n')[2]);
    expect(checkIn).toMatchObject({ check_in_id: id, status: 'error' });
    expect(checkIn).not.toHaveProperty('monitor_config');
  });

  it('returns undefined and does NOT POST when SENTRY_DSN is unbound', async () => {
    const returned = await postSentryCheckIn(
      {} as Env,
      'radar-refresh',
      'in_progress',
      '0 */6 * * *'
    );
    expect(returned).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('swallows fetch rejections without throwing', async () => {
    fetchSpy.mockRejectedValue(new Error('network'));
    await expect(
      postSentryCheckIn(env, 'radar-refresh', 'ok', '0 */6 * * *', 'c'.repeat(32))
    ).resolves.toBe('c'.repeat(32));
  });
});

describe('captureMessageEnvelope (shim for shared-module callers)', () => {
  it('forwards tags + extras to postSentryEvent envelope shape', async () => {
    await captureMessageEnvelope(
      env,
      'inoreader-rate-limit',
      'error',
      { status: 429, source: 'cron-wire' },
      'inoreader-rate-limit',
      { 'inoreader.source': 'cron-wire', 'inoreader.zone1.usage': 100 }
    );

    const payload = JSON.parse((fetchSpy.mock.calls[0]![1].body as string).split('\n')[2]);
    expect(payload).toMatchObject({
      level: 'error',
      message: 'inoreader-rate-limit',
      extra: { status: 429, source: 'cron-wire' },
      tags: {
        event: 'inoreader-rate-limit',
        'inoreader.source': 'cron-wire',
        'inoreader.zone1.usage': 100,
      },
    });
  });

  it('drops undefined-valued extraTags so they do not surface as the literal string "undefined"', async () => {
    await captureMessageEnvelope(env, 'm', 'warning', undefined, 'tag', {
      keep: 'yes',
      drop: undefined,
    });

    const payload = JSON.parse((fetchSpy.mock.calls[0]![1].body as string).split('\n')[2]);
    expect(payload.tags).toEqual({ event: 'tag', keep: 'yes' });
    expect(payload.tags).not.toHaveProperty('drop');
  });

  it('does NOT POST when SENTRY_DSN is unbound', async () => {
    await captureMessageEnvelope({} as Env, 'm', 'info');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('postSentryEvent fingerprint (BL-032.75 Phase 3)', () => {
  it('includes fingerprint in the event body when supplied', async () => {
    await postSentryEvent(env, {
      level: 'error',
      message: 'SLO breach',
      fingerprint: ['slo-alert', 'radar-snapshot-stale', 'page', '2026-07-14'],
    });
    const payload = JSON.parse((fetchSpy.mock.calls[0]![1].body as string).split('\n')[2]);
    expect(payload.fingerprint).toEqual([
      'slo-alert',
      'radar-snapshot-stale',
      'page',
      '2026-07-14',
    ]);
  });

  it('omits fingerprint when absent or empty (default Sentry grouping preserved)', async () => {
    await postSentryEvent(env, { level: 'info', message: 'no fp' });
    await postSentryEvent(env, { level: 'info', message: 'empty fp', fingerprint: [] });
    for (const call of fetchSpy.mock.calls) {
      const payload = JSON.parse((call[1].body as string).split('\n')[2]);
      expect(payload).not.toHaveProperty('fingerprint');
    }
  });
});

describe('envelope delivery day-counters (BL-032.75 Phase 3)', () => {
  const stubRedis = () => {
    const incr = vi.fn().mockResolvedValue(1);
    const expire = vi.fn().mockResolvedValue(1);
    createMcpClientMock.mockReturnValue({ incr, expire } as never);
    return { incr, expire };
  };

  afterEach(() => {
    createMcpClientMock.mockReturnValue(null);
  });

  it('bumps the ok counter on a 2xx envelope response', async () => {
    const { incr, expire } = stubRedis();
    await postSentryEvent(env, { level: 'info', message: 'ok path' });
    expect(incr).toHaveBeenCalledTimes(1);
    expect(incr.mock.calls[0][0]).toMatch(/^mcp:sentry-envelope:ok:\d{4}-\d{2}-\d{2}$/);
    expect(expire).toHaveBeenCalledWith(incr.mock.calls[0][0], 48 * 3600);
  });

  it('bumps the fail counter on a non-2xx envelope response', async () => {
    const { incr } = stubRedis();
    fetchSpy.mockResolvedValue(new Response('', { status: 429 }));
    await postSentryEvent(env, { level: 'info', message: 'rejected' });
    expect(incr.mock.calls[0][0]).toMatch(/^mcp:sentry-envelope:fail:/);
  });

  it('bumps the fail counter when the envelope fetch throws', async () => {
    const { incr } = stubRedis();
    fetchSpy.mockRejectedValue(new Error('network down'));
    await expect(
      postSentryEvent(env, { level: 'info', message: 'network' })
    ).resolves.toBeUndefined();
    expect(incr.mock.calls[0][0]).toMatch(/^mcp:sentry-envelope:fail:/);
  });

  it('counter failures never propagate (best-effort contract preserved)', async () => {
    createMcpClientMock.mockReturnValue({
      incr: vi.fn().mockRejectedValue(new Error('upstash down')),
      expire: vi.fn(),
    } as never);
    await expect(
      postSentryEvent(env, { level: 'info', message: 'counter blows up' })
    ).resolves.toBeUndefined();
  });
});

describe('postEnvelope failure-mode instrumentation (BL-032.77)', () => {
  // These cover the three new safeLog paths added 2026-05-28 to diagnose
  // false-positive "timeout check-in" alerts on Sentry's Crons UI while
  // Cloudflare's cron dashboard reports 100% success. The helpers stay
  // best-effort (no throws); the new lines just add visibility so the
  // operator can attribute each silent envelope drop to its root cause.
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // safeLog emits via console.log; capture so we can assert on it.
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  function findLogLine(eventName: string): Record<string, unknown> | undefined {
    for (const call of consoleSpy.mock.calls) {
      const arg = call[0];
      if (typeof arg !== 'string') continue;
      try {
        const parsed = JSON.parse(arg) as Record<string, unknown>;
        if (parsed.event === eventName) return parsed;
      } catch {
        // not JSON; skip
      }
    }
    return undefined;
  }

  it('logs sentry.envelope.post.non-2xx with status when Sentry rejects', async () => {
    // 429 (project rate-limit) is the suspected dominant failure mode.
    fetchSpy.mockResolvedValueOnce(new Response('rate limited', { status: 429 }));
    await postSentryEvent(env, { level: 'info', message: 'rate-limited heartbeat' });

    const log = findLogLine('sentry.envelope.post.non-2xx');
    expect(log).toBeDefined();
    expect(log?.status).toBe(429);
    expect(log?.success).toBe(false);
    expect(log?.errorCode).toBe('sentry-envelope-non-2xx');
    expect(typeof log?.reason).toBe('string');
    expect((log?.reason as string).includes('host=')).toBe(true);
    expect((log?.reason as string).includes('project=')).toBe(true);
  });

  it('logs sentry.envelope.post.non-2xx for 5xx (transient) the same way', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('upstream', { status: 503 }));
    await postSentryEvent(env, { level: 'error', message: 'transient sentry' });
    const log = findLogLine('sentry.envelope.post.non-2xx');
    expect(log?.status).toBe(503);
  });

  it('does NOT log non-2xx for 2xx responses (happy path stays silent)', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 200 }));
    await postSentryEvent(env, { level: 'info', message: 'ok' });
    expect(findLogLine('sentry.envelope.post.non-2xx')).toBeUndefined();
    expect(findLogLine('sentry.envelope.post.aborted')).toBeUndefined();
    expect(findLogLine('sentry.envelope.post.network-error')).toBeUndefined();
  });

  it('logs sentry.envelope.post.aborted when AbortController fires (2s timeout)', async () => {
    fetchSpy.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal!.addEventListener('abort', () => {
            const err = new DOMException('The operation was aborted', 'AbortError');
            reject(err);
          });
        })
    );
    vi.useFakeTimers();
    const pending = postSentryEvent(env, { level: 'error', message: 'slow' });
    await vi.advanceTimersByTimeAsync(2000);
    await pending;

    const log = findLogLine('sentry.envelope.post.aborted');
    expect(log).toBeDefined();
    expect(log?.errorCode).toBe('sentry-envelope-abort');
  });

  it('logs sentry.envelope.post.network-error for non-abort fetch rejection', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await postSentryEvent(env, { level: 'error', message: 'no network' });

    const log = findLogLine('sentry.envelope.post.network-error');
    expect(log).toBeDefined();
    expect(log?.errorCode).toBe('sentry-envelope-network');
    expect((log?.reason as string).includes('Failed to fetch')).toBe(true);
  });

  it('still resolves cleanly on every failure path (best-effort contract)', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 429 }));
    await expect(postSentryEvent(env, { level: 'info', message: 'x' })).resolves.toBeUndefined();

    fetchSpy.mockRejectedValueOnce(new TypeError('network'));
    await expect(postSentryEvent(env, { level: 'info', message: 'y' })).resolves.toBeUndefined();
  });
});
